from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import audit, create_token, get_current_user, require_admin, user_to_dict, verify_password
from ..database import get_db
from ..models import User
from ..schemas import LoginIn

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == body.username.strip().lower()))
    if user is None or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect username or password")
    audit(db, user, "LOGIN", "session")
    db.commit()
    return {"access_token": create_token(user), "token_type": "bearer", "user": user_to_dict(user)}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_to_dict(user)


@router.get("/users")
def users(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return [user_to_dict(u) for u in db.scalars(select(User).order_by(User.id))]
