"""Single-user mode: there is no login. Every request acts as the built-in administrator.

The role-guard dependencies are kept as no-ops so routers stay unchanged and the audit trail
still records who (the single operator) did what.
"""
from __future__ import annotations

import bcrypt
from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import AuditLog, User


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()


def get_current_user(db: Session = Depends(get_db)) -> User:
    user = db.scalar(select(User).order_by(User.id))
    if user is None:
        raise HTTPException(503, "Database not seeded - run python database/seed_data.py")
    return user


def require_roles(*_roles: str):
    def dep(user: User = Depends(get_current_user)) -> User:
        return user

    return dep


require_operator = require_roles()
require_admin = require_roles()


def audit(db: Session, user: User, action: str, entity: str, detail: str = "") -> None:
    db.add(AuditLog(username=user.username, action=action, entity=entity, detail=detail))


def user_to_dict(u: User) -> dict:
    return {"id": u.id, "username": u.username, "full_name": u.full_name, "role": u.role}
