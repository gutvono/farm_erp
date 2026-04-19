from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.modules.auth import service as auth_service
from app.modules.auth.model import User
from app.modules.auth.schemas import LoginRequest, UserResponse
from app.shared.responses import SuccessResponse, success

router = APIRouter()

SESSION_COOKIE = "session_token"


def get_current_user(
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
    db: Session = Depends(get_db),
) -> User:
    if not session_token:
        raise HTTPException(status_code=401, detail="Não autenticado")
    user = auth_service.validate_session(db, session_token)
    if not user:
        raise HTTPException(status_code=401, detail="Sessão inválida ou expirada")
    return user


@router.post("/login", response_model=SuccessResponse)
def login(
    body: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> SuccessResponse:
    user, token = auth_service.login(db, body.username, body.password)
    is_prod = settings.environment == "production"
    response.set_cookie(
        key=SESSION_COOKIE,
        value=token,
        httponly=True,
        secure=is_prod,
        samesite="none" if is_prod else "lax",
        max_age=settings.session_expire_minutes * 60,
    )
    return success("Login realizado com sucesso", UserResponse.model_validate(user))


@router.post("/logout", response_model=SuccessResponse)
def logout(
    response: Response,
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
    db: Session = Depends(get_db),
) -> SuccessResponse:
    if session_token:
        auth_service.logout(db, session_token)
    response.delete_cookie(key=SESSION_COOKIE)
    return success("Logout realizado com sucesso")


@router.get("/me", response_model=SuccessResponse)
def get_me(current_user: User = Depends(get_current_user)) -> SuccessResponse:
    return success("Usuário autenticado", UserResponse.model_validate(current_user))
