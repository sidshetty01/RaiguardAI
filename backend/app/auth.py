"""JWT authentication with role-based access (ADMIN / OPERATOR / VIEWER)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db
from .models import AuditLog, User

ROLES = ("ADMIN", "OPERATOR", "VIEWER")
_bearer = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def create_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user.username,
        "role": user.role,
        "name": user.full_name,
        "iat": now,
        "exp": now + timedelta(minutes=settings.jwt_expiry_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def user_from_token(db: Session, token: str | None) -> User | None:
    if not token:
        return None
    try:
        data = decode_token(token)
    except jwt.PyJWTError:
        return None
    return db.scalar(select(User).where(User.username == data.get("sub")))


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    user = user_from_token(db, creds.credentials if creds else None)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token", headers={"WWW-Authenticate": "Bearer"})
    return user


def require_roles(*roles: str):
    def dep(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Requires role: {' or '.join(roles)}")
        return user

    return dep


require_operator = require_roles("ADMIN", "OPERATOR")
require_admin = require_roles("ADMIN")


def audit(db: Session, user: User, action: str, entity: str, detail: str = "") -> None:
    db.add(AuditLog(username=user.username, action=action, entity=entity, detail=detail))


def user_to_dict(u: User) -> dict:
    return {"id": u.id, "username": u.username, "full_name": u.full_name, "role": u.role}
