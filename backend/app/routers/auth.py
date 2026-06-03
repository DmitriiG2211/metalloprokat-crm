from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import create_access_token, verify_password
from app.database import get_db
from app.deps import get_current_user, request_meta
from app.models import User
from app.schemas import QuickLoginRequest, Token, UserRead
from app.services.audit import write_audit

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.get("/login-options", response_model=list[UserRead])
def login_options(db: Session = Depends(get_db)):
    return db.scalars(select(User).where(User.is_active.is_(True)).order_by(User.role, User.manager_number, User.full_name)).all()


@router.post("/quick-login", response_model=Token)
def quick_login(payload: QuickLoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.scalars(select(User).where(User.login == payload.login, User.is_active.is_(True))).first()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    ip, agent = request_meta(request)
    write_audit(db, user, "quick_login", "user", user.id, ip_address=ip, user_agent=agent)
    db.commit()
    return Token(access_token=create_access_token(user.id, {"role": user.role}))


@router.post("/login", response_model=Token)
def login(request: Request, form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.scalars(select(User).where(User.login == form.username)).first()
    if not user or not user.is_active or not verify_password(form.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    ip, agent = request_meta(request)
    write_audit(db, user, "login", "user", user.id, ip_address=ip, user_agent=agent)
    db.commit()
    return Token(access_token=create_access_token(user.id, {"role": user.role}))


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/logout")
def logout(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ip, agent = request_meta(request)
    write_audit(db, user, "logout", "user", user.id, ip_address=ip, user_agent=agent)
    db.commit()
    return {"ok": True}
