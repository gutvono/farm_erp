from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    database_url: str = "postgresql://postgres:postgres@localhost:5432/coffee_farm_erp"
    secret_key: str = "change-me-in-production"
    upload_dir: str = "uploads"
    environment: str = "development"

    # CORS
    allowed_origins: list[str] = ["http://localhost:3000"]

    # Session
    session_expire_minutes: int = 60 * 24  # 24 hours


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
