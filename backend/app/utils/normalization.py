from __future__ import annotations

import re
from datetime import date, datetime
from urllib.parse import urlparse


def normalize_company(value: str | None) -> str:
    if not value:
        return ""
    text = str(value).strip().lower()
    text = text.replace("«", '"').replace("»", '"').replace("'", '"')
    text = re.sub(r"\b(ооо|оао|зао|пао|ип|ао|общество с ограниченной ответственностью)\b", "", text)
    text = re.sub(r"[^a-zа-я0-9]+", " ", text, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", text).strip()


def normalize_phone(value: str | None) -> str | None:
    if not value:
        return None
    first_line = str(value).splitlines()[0]
    digits = re.sub(r"\D+", "", first_line)
    if len(digits) == 11 and digits.startswith("8"):
        return "+7" + digits[1:]
    if len(digits) == 11 and digits.startswith("7"):
        return "+7" + digits[1:]
    if len(digits) == 10:
        return "+7" + digits
    return digits or None


def normalize_email(value: str | None) -> str | None:
    if not value:
        return None
    emails = re.findall(r"[\w.+-]+@[\w.-]+\.[A-Za-zА-Яа-я]{2,}", str(value))
    return "\n".join(dict.fromkeys(email.lower().strip() for email in emails)) or str(value).strip().lower()


def normalize_website(value: str | None) -> tuple[str | None, str | None]:
    if not value:
        return None, None
    raw = str(value).strip().split()[0]
    if not raw:
        return None, None
    url = raw if raw.startswith(("http://", "https://")) else f"https://{raw}"
    parsed = urlparse(url)
    domain = parsed.netloc.lower().removeprefix("www.")
    return url, domain or None


def parse_date(value) -> date | None:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value).strip()
    for fmt in ("%d.%m.%Y", "%Y-%m-%d", "%d/%m/%Y", "%d.%m.%y"):
        try:
            return datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    parsed = None
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    return parsed.date()
