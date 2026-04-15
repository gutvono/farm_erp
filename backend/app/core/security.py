import uuid

import bcrypt


def hash_password(password: str) -> str:
    """Hash a plain-text password using bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plain-text password against a bcrypt hash."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_session_token() -> str:
    """
    Create a session token.
    Currently uses a simple UUID. Prepared to migrate to JWT without rewrite
    by swapping this function and the validation counterpart.
    """
    return str(uuid.uuid4())
