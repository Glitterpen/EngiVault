import hashlib
import zipfile
from pathlib import Path

import pytest

from app.validation import MIME_DOCX, MIME_DWG, MIME_PDF, FileValidationError, validate_file


def metadata(path: Path) -> dict[str, int | str]:
    content = path.read_bytes()
    return {"expected_size": len(content), "expected_sha256": hashlib.sha256(content).hexdigest()}


def test_validates_pdf_signature_size_and_checksum(tmp_path: Path) -> None:
    source = tmp_path / "drawing.pdf"
    source.write_bytes(b"%PDF-1.7\ncontrolled content")
    assert validate_file(source, declared_mime=MIME_PDF, **metadata(source)).detected_mime == MIME_PDF


def test_validates_dwg_ac10_signature(tmp_path: Path) -> None:
    source = tmp_path / "drawing.dwg"
    source.write_bytes(b"AC1032\x00controlled drawing")
    assert validate_file(source, declared_mime=MIME_DWG, **metadata(source)).detected_mime == MIME_DWG


def test_rejects_checksum_mismatch(tmp_path: Path) -> None:
    source = tmp_path / "drawing.pdf"
    source.write_bytes(b"%PDF-1.7\ncontent")
    with pytest.raises(FileValidationError, match="checksum") as error:
        validate_file(source, declared_mime=MIME_PDF, expected_size=source.stat().st_size, expected_sha256="0" * 64)
    assert error.value.code == "CHECKSUM_MISMATCH"


def test_validates_docx_container_structure(tmp_path: Path) -> None:
    source = tmp_path / "specification.docx"
    with zipfile.ZipFile(source, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", "<document/>")
    assert validate_file(source, declared_mime=MIME_DOCX, **metadata(source)).detected_mime == MIME_DOCX


def test_rejects_docx_with_xlsx_structure(tmp_path: Path) -> None:
    source = tmp_path / "renamed.docx"
    with zipfile.ZipFile(source, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("xl/workbook.xml", "<workbook/>")
    with pytest.raises(FileValidationError) as error:
        validate_file(source, declared_mime=MIME_DOCX, **metadata(source))
    assert error.value.code == "OFFICE_STRUCTURE"
