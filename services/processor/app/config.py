from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = "development"
    processor_shared_secret: str = "local-development-only"
    max_file_bytes: int = 262_144_000
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

@lru_cache
def settings() -> Settings:
    return Settings()
