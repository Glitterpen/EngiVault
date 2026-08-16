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
    electronic_seal_mode: str = "disabled"
    electronic_seal_assurance: str = "unverified"
    adobe_pdf_services_client_id: str = ""
    adobe_pdf_services_client_secret: str = ""
    adobe_pdf_services_base_url: str = "https://pdf-services.adobe.io"
    intesi_csc_token_url: str = ""
    intesi_csc_client_id: str = ""
    intesi_csc_client_secret: str = ""
    intesi_csc_credential_id: str = ""
    intesi_csc_pin: str = ""
    intesi_adobe_provider_name: str = ""
    qualified_tsa_url: str = ""
    qualified_tsa_username: str = ""
    qualified_tsa_password: str = ""
    model_config = SettingsConfigDict(env_file=(".env", "../../.env.local"), extra="ignore")

@lru_cache
def settings() -> Settings:
    return Settings()
