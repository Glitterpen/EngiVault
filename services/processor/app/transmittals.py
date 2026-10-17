"""Select a PDF layout only from the transmittal's frozen manifest."""
from __future__ import annotations

from .transmittals_legacy import _attestation_reference
from .transmittals_legacy import build_transmittal_pdf as _build_legacy
from .transmittals_v2 import build_transmittal_pdf as _build_v2

__all__ = ["_attestation_reference", "build_transmittal_pdf"]


def build_transmittal_pdf(
    package: dict[str, object],
    documents: list[dict[str, object]],
    *,
    electronic_seal_expected: bool = False,
) -> bytes:
    manifest = package.get("manifest")
    version = manifest.get("pdf_layout_version") if isinstance(manifest, dict) else None
    # Old/unversioned packages retain their original renderer. Strings, booleans
    # and unrelated future versions are not an explicit v2 marker.
    renderer = _build_v2 if type(version) is int and version == 2 else _build_legacy
    return renderer(package, documents, electronic_seal_expected=electronic_seal_expected)
