from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.modules.auth.model import User, UserSession


def get_by_username(db: Session, username: str) -> User | None:
    return (
        db.query(User)
        .filter(User.username == username, User.deleted_at.is_(None))
        .first()
    )


def create(db: Session, username: str, hashed_password: str) -> User:
    user = User(username=username, hashed_password=hashed_password)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def create_session(
    db: Session,
    user_id: object,
    session_token: str,
    expires_at: datetime,
) -> UserSession:
    session = UserSession(
        session_token=session_token,
        user_id=user_id,
        expires_at=expires_at,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_session_by_token(db: Session, token: str) -> UserSession | None:
    return (
        db.query(UserSession)
        .filter(UserSession.session_token == token)
        .first()
    )


def delete_session(db: Session, token: str) -> None:
    db.query(UserSession).filter(UserSession.session_token == token).delete()
    db.commit()


def delete_expired_sessions(db: Session) -> None:
    db.query(UserSession).filter(
        UserSession.expires_at < datetime.now(timezone.utc)
    ).delete()
    db.commit()
