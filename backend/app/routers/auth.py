from fastapi import APIRouter, Depends

from ..auth import get_current_user, user_to_dict
from ..models import User

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    """Single-user mode: always the built-in operator."""
    return user_to_dict(user)
