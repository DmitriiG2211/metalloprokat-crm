from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import current_user
from app.models import User
from app.schemas import AuthOut, LoginRequest, UserOut
from app.security import create_access_token, new_csrf_token, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def user_out(user: User) -> UserOut:
    return UserOut(id=user.id, email=user.email, name=user.name, role=user.role, organization_id=user.organization_id)


@router.post("/login", response_model=AuthOut)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> AuthOut:
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    token = create_access_token(user.id, {"role": user.role, "organization_id": user.organization_id})
    csrf = new_csrf_token()
    response.set_cookie("access_token", token, httponly=True, samesite="lax", secure=False)
    response.set_cookie("csrf_token", csrf, httponly=False, samesite="lax", secure=False)
    return AuthOut(user=user_out(user), access_token=token, csrf_token=csrf)


@router.post("/logout")
def logout(response: Response) -> dict[str, str]:
    response.delete_cookie("access_token")
    response.delete_cookie("csrf_token")
    return {"status": "ok"}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> UserOut:
    return user_out(user)
