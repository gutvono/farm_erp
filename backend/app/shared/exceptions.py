from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from sqlalchemy.exc import SQLAlchemyError

from app.shared.responses import ErrorResponse


def add_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers on the FastAPI app."""

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=ErrorResponse(message=exc.detail).model_dump(),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # Collect all field errors into a readable Portuguese message
        errors = exc.errors()
        if errors:
            first = errors[0]
            field = " → ".join(str(loc) for loc in first.get("loc", []))
            msg = first.get("msg", "Dados inválidos")
            message = f"Erro de validação no campo '{field}': {msg}"
        else:
            message = "Dados da requisição inválidos"

        return JSONResponse(
            status_code=422,
            content=ErrorResponse(message=message).model_dump(),
        )

    @app.exception_handler(SQLAlchemyError)
    async def sqlalchemy_exception_handler(
        request: Request, exc: SQLAlchemyError
    ) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(message="Erro interno no banco de dados").model_dump(),
        )

    @app.exception_handler(Exception)
    async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        return JSONResponse(
            status_code=500,
            content=ErrorResponse(message="Erro interno do servidor").model_dump(),
        )
