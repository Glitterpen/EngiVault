import pytest
from pydantic import ValidationError

from app.config import Settings


def test_processor_shared_secret_is_required():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, processor_shared_secret="")


def test_processor_shared_secret_requires_32_characters():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, processor_shared_secret="too-short")


def test_processor_accepts_strong_shared_secret():
    configured = Settings(_env_file=None, processor_shared_secret="a" * 32)

    assert configured.processor_shared_secret == "a" * 32
