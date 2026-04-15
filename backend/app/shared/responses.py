from typing import Any
from pydantic import BaseModel


class SuccessResponse(BaseModel):
    success: bool = True
    message: str
    data: Any = None


class ErrorResponse(BaseModel):
    success: bool = False
    message: str


def success(message: str, data: Any = None) -> SuccessResponse:
    """Build a standardized success response."""
    return SuccessResponse(message=message, data=data)


def error(message: str) -> ErrorResponse:
    """Build a standardized error response."""
    return ErrorResponse(message=message)
