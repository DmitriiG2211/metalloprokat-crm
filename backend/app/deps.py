from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.auth import decode_token
from app.database import get_db
from app.models import Client, Role, User


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    payload = decode_token(token)
    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Нужно войти в систему")
    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Пользователь отключен")
    return user


def can_view_all(user: User) -> bool:
    return user.role in {Role.admin.value, Role.director.value, Role.senior_manager.value}


def require_roles(*roles: Role | str):
    role_values = {role.value if isinstance(role, Role) else role for role in roles}

    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in role_values:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Недостаточно прав")
        return user

    return checker


def ensure_client_access(db: Session, client_id: int, user: User) -> Client:
    client = db.get(Client, client_id)
    if not client or client.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Клиент не найден")
    if not can_view_all(user) and client.manager_id != user.id:
        raise HTTPException(status_code=403, detail="Нет доступа к этому клиенту")
    return client


def request_meta(request: Request) -> tuple[str | None, str | None]:
    return request.client.host if request.client else None, request.headers.get("user-agent")
