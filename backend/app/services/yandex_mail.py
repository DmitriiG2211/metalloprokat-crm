from __future__ import annotations

import email
import imaplib
import logging
import re
import threading
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from email.header import decode_header, make_header
from email.message import Message
from email.parser import BytesParser
from email.policy import default
from email.utils import parseaddr, parsedate_to_datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import SessionLocal
from app.models import KanbanRequest, KanbanSource, KanbanStatus, Role, SupplierBlacklist, User

logger = logging.getLogger(__name__)
_worker_started = False


@dataclass
class MailSyncResult:
    checked: int = 0
    created: int = 0
    skipped_duplicates: int = 0
    skipped_blacklist: int = 0
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


def mail_status() -> dict:
    settings = get_settings()
    return {
        "enabled": settings.yandex_mail_enabled,
        "configured": bool(settings.yandex_mail_user and settings.yandex_mail_password),
        "host": settings.yandex_mail_host,
        "port": settings.yandex_mail_port,
        "user": _mask_email(settings.yandex_mail_user),
        "folder": settings.yandex_mail_folder,
        "search": settings.yandex_mail_search,
        "interval_seconds": settings.yandex_mail_interval_seconds,
    }


def sync_yandex_mail(db: Session, creator: User | None = None) -> MailSyncResult:
    settings = get_settings()
    result = MailSyncResult()
    if not settings.yandex_mail_user or not settings.yandex_mail_password:
        result.errors.append("Yandex mail credentials are not configured")
        return result

    creator = creator or _default_creator(db)
    if not creator:
        result.errors.append("No active user found for imported mail requests")
        return result

    try:
        mailbox = imaplib.IMAP4_SSL(settings.yandex_mail_host, settings.yandex_mail_port, timeout=30)
        try:
            mailbox.login(settings.yandex_mail_user, settings.yandex_mail_password)
            mailbox.select(settings.yandex_mail_folder)
            status, search_data = mailbox.search(None, settings.yandex_mail_search or "UNSEEN")
            if status != "OK" or not search_data:
                result.errors.append("IMAP search failed")
                return result

            message_numbers = search_data[0].split()
            for message_number in message_numbers[-settings.yandex_mail_seen_limit :]:
                _process_message(db, mailbox, message_number, creator, result)

            db.commit()
        finally:
            try:
                mailbox.close()
            except imaplib.IMAP4.error:
                pass
            mailbox.logout()
    except Exception as exc:  # noqa: BLE001 - mail servers return many runtime-specific errors
        logger.exception("Yandex mail sync failed")
        result.errors.append(str(exc))
    return result


def start_yandex_mail_worker() -> None:
    global _worker_started
    settings = get_settings()
    if _worker_started or not settings.yandex_mail_enabled:
        return
    if not settings.yandex_mail_user or not settings.yandex_mail_password:
        logger.info("Yandex mail sync is enabled but credentials are missing")
        return
    _worker_started = True
    thread = threading.Thread(target=_worker_loop, name="yandex-mail-sync", daemon=True)
    thread.start()


def _worker_loop() -> None:
    settings = get_settings()
    while True:
        with SessionLocal() as db:
            sync_yandex_mail(db)
        time.sleep(max(settings.yandex_mail_interval_seconds, 60))


def _process_message(db: Session, mailbox: imaplib.IMAP4_SSL, message_number: bytes, creator: User, result: MailSyncResult) -> None:
    status, fetched = mailbox.fetch(message_number, "(BODY.PEEK[])")
    if status != "OK" or not fetched:
        result.errors.append(f"Failed to fetch message {message_number.decode(errors='ignore')}")
        return

    raw_message = _raw_from_fetch(fetched)
    if not raw_message:
        result.errors.append(f"Empty message {message_number.decode(errors='ignore')}")
        return

    message = BytesParser(policy=default).parsebytes(raw_message)
    subject = _decode_header(message.get("Subject"))
    sender_name, sender_email = parseaddr(_decode_header(message.get("From")))
    sender_email = sender_email.lower().strip()
    domain = _email_domain(sender_email)
    message_id = _decode_header(message.get("Message-ID")) or _fallback_message_id(message_number, sender_email, subject)
    received_at = _message_datetime(message)

    result.checked += 1
    if db.scalar(select(KanbanRequest.id).where(KanbanRequest.message_id == message_id)):
        result.skipped_duplicates += 1
        return
    if _is_blacklisted(db, sender_email, domain):
        result.skipped_blacklist += 1
        return

    body = _message_body(message)
    item = KanbanRequest(
        company_name=_company_name(sender_name, sender_email),
        contact_person=sender_name.strip()[:255] if sender_name else None,
        email=sender_email or None,
        subject=subject[:500] if subject else None,
        comment=body[:8000] if body else None,
        source=KanbanSource.mail.value,
        status=KanbanStatus.new.value,
        creator_id=creator.id,
        message_id=message_id[:500],
        received_at=received_at,
    )
    db.add(item)
    result.created += 1


def _raw_from_fetch(fetched: list[bytes | tuple]) -> bytes | None:
    for item in fetched:
        if isinstance(item, tuple) and len(item) >= 2 and isinstance(item[1], bytes):
            return item[1]
    return None


def _decode_header(value: str | None) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value))).strip()
    except Exception:  # noqa: BLE001
        return value.strip()


def _message_body(message: Message) -> str:
    text = ""
    if message.is_multipart():
        html = ""
        for part in message.walk():
            if part.get_content_disposition() == "attachment":
                continue
            content_type = part.get_content_type()
            try:
                content = part.get_content()
            except Exception:  # noqa: BLE001
                payload = part.get_payload(decode=True) or b""
                content = payload.decode(part.get_content_charset() or "utf-8", errors="ignore")
            if content_type == "text/plain" and content:
                text = str(content)
                break
            if content_type == "text/html" and content and not html:
                html = str(content)
        if not text and html:
            text = _strip_html(html)
    else:
        try:
            content = message.get_content()
        except Exception:  # noqa: BLE001
            payload = message.get_payload(decode=True) or b""
            content = payload.decode(message.get_content_charset() or "utf-8", errors="ignore")
        text = _strip_html(str(content)) if message.get_content_type() == "text/html" else str(content)
    return _normalize_text(text)


def _strip_html(value: str) -> str:
    value = re.sub(r"(?is)<(br|p|div|li)\b[^>]*>", "\n", value)
    value = re.sub(r"(?is)<style.*?</style>|<script.*?</script>", " ", value)
    value = re.sub(r"(?s)<[^>]+>", " ", value)
    return value


def _normalize_text(value: str) -> str:
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", value)).strip()


def _message_datetime(message: Message) -> datetime:
    raw_date = message.get("Date")
    if not raw_date:
        return datetime.now(timezone.utc)
    try:
        parsed = parsedate_to_datetime(raw_date)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except Exception:  # noqa: BLE001
        return datetime.now(timezone.utc)


def _fallback_message_id(message_number: bytes, sender_email: str, subject: str) -> str:
    return f"imap:{message_number.decode(errors='ignore')}:{sender_email}:{subject}"[:500]


def _company_name(sender_name: str, sender_email: str) -> str:
    cleaned_name = sender_name.strip().strip('"')
    if cleaned_name and "@" not in cleaned_name:
        return cleaned_name[:500]
    domain = _email_domain(sender_email)
    return (domain or sender_email or "Mail request")[:500]


def _email_domain(value: str | None) -> str | None:
    if not value or "@" not in value:
        return None
    return value.rsplit("@", 1)[1].lower().strip()


def _normalize_domain(value: str | None) -> str | None:
    cleaned = (value or "").strip().lower()
    if not cleaned:
        return None
    cleaned = cleaned.removeprefix("http://").removeprefix("https://").removeprefix("www.")
    return cleaned.split("/")[0]


def _is_blacklisted(db: Session, sender_email: str | None, domain: str | None) -> bool:
    items = db.scalars(select(SupplierBlacklist)).all()
    email_value = (sender_email or "").lower()
    for item in items:
        blocked_email = (item.email or "").strip().lower()
        blocked_domain = _normalize_domain(item.domain)
        if blocked_email and blocked_email == email_value:
            return True
        if blocked_domain and domain and (domain == blocked_domain or domain.endswith(f".{blocked_domain}")):
            return True
    return False


def _default_creator(db: Session) -> User | None:
    return db.scalars(
        select(User)
        .where(User.is_active.is_(True), User.role.in_([Role.admin.value, Role.director.value, Role.senior_manager.value]))
        .order_by(User.id.asc())
    ).first()


def _mask_email(value: str) -> str:
    if not value or "@" not in value:
        return ""
    name, domain = value.split("@", 1)
    if len(name) <= 2:
        masked = f"{name[:1]}*"
    else:
        masked = f"{name[:2]}***{name[-1:]}"
    return f"{masked}@{domain}"
