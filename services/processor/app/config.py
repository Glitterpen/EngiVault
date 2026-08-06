from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = "development"
    processor_shared_secret: str = "local-development-only"
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    storage_bucket: str = "documents"
    worker_name: str = "engicite-processor-local"
    worker_poll_seconds: float = 2.0
    max_file_bytes: int = 262_144_000
    openai_api_key: str = ""
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536
    chat_model: str = "gpt-5.6-sol"
    model_config = SettingsConfigDict(env_file=(".env", "../../.env.local"), extra="ignore")

@lru_cache
def settings() -> Settings:
    return Settings()
