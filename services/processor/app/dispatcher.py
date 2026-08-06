from __future__ import annotations

import time

from .config import settings
from .embeddings import OpenAIEmbedder
from .gateway import SupabaseGateway
from .worker import process_next


def run_forever() -> None:
    config = settings()
    if not config.supabase_url or not config.supabase_service_role_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required")
    gateway = SupabaseGateway(config.supabase_url, config.supabase_service_role_key,
                              config.storage_bucket, config.worker_name)
    embedder=OpenAIEmbedder(config.openai_api_key,config.embedding_model,config.embedding_dimensions) if config.openai_api_key else None
    try:
        while True:
            outcome = process_next(gateway, max_file_bytes=config.max_file_bytes,embedder=embedder)
            if outcome == "idle":
                time.sleep(max(0.25, config.worker_poll_seconds))
    finally:
        gateway.close()
        if embedder: embedder.close()


if __name__ == "__main__":
    run_forever()
