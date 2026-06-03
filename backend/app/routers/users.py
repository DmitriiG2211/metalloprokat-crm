from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_password_hash
from app.database import get_db
from app.deps import require_roles
from app.models import Role, User
from app.schemas import UserCreate, UserRead, UserUpdate
from app.services.audit import write_audit

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("", response_model=list[UserRead])
def list_users(db: Session = Depends(get_db), _: User = Depends(require_roles(Role.admin, Role.director))):
    return db.scalars(select(User).order_by(User.role, User.login)).all()


@router.post("", response_model=UserRead)
def create_user(payload: UserCreate, db: Session = Depends(get_db), current: User = Depends(require_roles(Role.admin))):
    if db.scalars(select(User).where(User.login == payload.login)).first():
        raise HTTPException(400, "Такой логин уже существует")
    user = User(
        login=payload.login,
        full_name=payload.full_name,
        role=payload.role,
        manager_number=payload.manager_number,
        is_active=payload.is_active,
        password_hash=get_password_hash(payload.password),
    )
    db.add(user)
    db.flush()
    write_audit(db, current, "create_user", "user", user.id, new_value=payload.model_dump(exclude={"password"}))
    db.commit()
    return user


@router.get("/{user_id}", response_model=UserRead)
def get_user(user_id: int, db: Session = Depends(get_db), _: User = Depends(require_roles(Role.admin, Role.director))):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    return user


@router.patch("/{user_id}", response_model=UserRead)
def update_user(user_id: int, payload: UserUpdate, db: Session = Depends(get_db), current: User = Depends(require_roles(Role.admin))):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    old = {"role": user.role, "is_active": user.is_active}
    data = payload.model_dump(exclude_unset=True)
    password = data.pop("password", None)
    for key, value in data.items():
        setattr(user, key, value)
    if password:
        user.password_hash = get_password_hash(password)
    write_audit(db, current, "update_user", "user", user.id, old_value=old, new_value=data)
    db.commit()
    return user


@router.delete("/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current: User = Depends(require_roles(Role.admin))):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Пользователь не найден")
    user.is_active = False
    write_audit(db, current, "disable_user", "user", user.id)
    db.commit()
    return {"ok": True}
