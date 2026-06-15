from collections.abc import Callable

import jwt
from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.security import decode_token


def csrf_tokens_from_cookie_header(cookie_header: str | None) -> set[str]:
    if not cookie_header:
        return set()
    tokens: set[str] = set()
    for part in cookie_header.split(";"):
        name, separator, value = part.strip().partition("=")
        if separator and name == "csrf_token" and value:
            tokens.add(value)
    return tokens


def current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    token = None
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization.split(" ", 1)[1]
    elif request.cookies.get("access_token"):
        token = request.cookies["access_token"]
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    try:
        payload = decode_token(token)
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc
    user = db.get(User, payload.get("sub"))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")
    return user


def require_roles(*roles: str) -> Callable[[User], User]:
    def dependency(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return user

    return dependency


def csrf_guard(
    request: Request,
    x_csrf_token: str | None = Header(default=None),
    user: User = Depends(current_user),
) -> User:
    if request.method in {"POST", "PUT", "PATCH", "DELETE"} and request.cookies.get("access_token"):
        cookie_tokens = csrf_tokens_from_cookie_header(request.headers.get("cookie"))
        if cookie_tokens and x_csrf_token not in cookie_tokens:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="CSRF token mismatch")
    return user
