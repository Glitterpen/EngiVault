import pytest
from pydantic import ValidationError

from app.config import Settings


def test_processor_shared_secret_is_required():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, processor_shared_secret="", malware_scan_mode="disabled")


def test_processor_shared_secret_requires_32_characters():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, processor_shared_secret="too-short", malware_scan_mode="disabled")


def test_processor_accepts_strong_shared_secret():
    configured = Settings(
        _env_file=None, processor_shared_secret="a" * 32, malware_scan_mode="disabled"
    )

    assert configured.processor_shared_secret == "a" * 32


def test_malware_scan_mode_must_be_explicit():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, processor_shared_secret="a" * 32)


def test_production_requires_malware_scanning():
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            processor_shared_secret="a" * 32,
            environment="production",
            malware_scan_mode="disabled",
        )


def test_production_accepts_clamav_scanning():
    configured = Settings(
        _env_file=None,
        processor_shared_secret="a" * 32,
        environment="production",
        malware_scan_mode="clamav",
        clamav_host="scanner.internal",
    )

    assert configured.malware_scan_mode == "clamav"
