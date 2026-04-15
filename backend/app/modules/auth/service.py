from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_session_token, verify_password
from app.modules.auth import repository as auth_repo
from app.modules.auth.model import User


def login(db: Session, username: str, password: str) -> tuple[User, str]:
    user = auth_repo.get_by_username(db, username)
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Usuário ou senha inválidos")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Usuário inativo")

    token = create_session_token()
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.session_expire_minutes
    )
    auth_repo.create_session(db, user.id, token, expires_at)
    return user, token


def logout(db: Session, session_token: str) -> None:
    auth_repo.delete_session(db, session_token)


def validate_session(db: Session, session_token: str) -> User | None:
    session = auth_repo.get_session_by_token(db, session_token)
    if not session:
        return None
    if session.expires_at < datetime.now(timezone.utc):
        auth_repo.delete_session(db, session_token)
        return None
    return (
        db.query(User)
        .filter(User.id == session.user_id, User.deleted_at.is_(None), User.is_active.is_(True))
        .first()
    )
