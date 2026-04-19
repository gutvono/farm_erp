from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    database_url: str = "postgresql://postgres:postgres@localhost:5432/coffee_farm_erp"

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, v: object) -> object:
        # Railway (and Heroku) inject DATABASE_URL with the legacy "postgres://" prefix
        # which SQLAlchemy 2.x rejects. Normalize to "postgresql://".
        if isinstance(v, str) and v.startswith("postgres://"):
            return v.replace("postgres://", "postgresql://", 1)
        return v
    secret_key: str = "change-me-in-production"
    upload_dir: str = "uploads"
    environment: str = "development"

    # CORS — string separada por vírgulas; parsada em main.py
    # No Railway: ALLOWED_ORIGINS=https://frontend.up.railway.app,https://outro.dominio.com
    allowed_origins: str = "http://localhost:3000"

    # Session
    session_expire_minutes: int = 60 * 24  # 24 hours


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
