import re
from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from openpyxl import Workbook

from app.mdr_import import MdrImportError, parse_mdr_workbook

HEADERS = [
    "Document Number *",
    "Title *",
    "Discipline *",
    "Document Type *",
    "Planned Submission Date *",
    "Progress Weight",
]


def workbook_bytes(rows: list[list[object]], headers: list[str] | None = None) -> bytes:
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "MDR Import"
    worksheet.append(headers or HEADERS)
    for row in rows:
        worksheet.append(row)
    output = BytesIO()
    workbook.save(output)
    workbook.close()
    return output.getvalue()


def without_worksheet_dimension(content: bytes) -> bytes:
    source = ZipFile(BytesIO(content))
    output = BytesIO()
    with source, ZipFile(output, "w", ZIP_DEFLATED) as target:
        for entry in source.infolist():
            data = source.read(entry.filename)
            if entry.filename.startswith("xl/worksheets/sheet"):
                data = re.sub(br"<dimension[^>]*/>", b"", data)
            target.writestr(entry, data)
    return output.getvalue()


def test_reads_a_valid_mdr_row() -> None:
    content = workbook_bytes(
        [["PRJ-PRO-001", "Process Design Basis", "Process", "Report", "2026-09-15", 2]],
    )

    result = parse_mdr_workbook(content, "register.xlsx")

    assert result["sheet_name"] == "MDR Import"
    assert result["row_count"] == 1
    assert result["rows"][0] == {
        "row_number": 2,
        "errors": [],
        "document_number": "PRJ-PRO-001",
        "title": "Process Design Basis",
        "discipline": "Process",
        "document_type": "Report",
        "planned_submission_date": "2026-09-15",
        "progress_weight": 2.0,
    }


def test_reads_artifact_style_workbook_without_dimension_metadata() -> None:
    content = without_worksheet_dimension(
        workbook_bytes(
            [["PRJ-PRO-002", "Process Flow Diagram", "PRO", "DWG", "2026-09-30", 1]],
        ),
    )

    result = parse_mdr_workbook(content, "register.xlsx")

    assert result["row_count"] == 1
    assert result["rows"][0]["document_number"] == "PRJ-PRO-002"


def test_rejects_a_workbook_without_required_headings() -> None:
    content = workbook_bytes([["PRJ-PRO-001", "Process Design Basis"]], ["Number", "Name"])

    with pytest.raises(MdrImportError, match="Required headings"):
        parse_mdr_workbook(content, "register.xlsx")


def test_flags_formulas_dates_and_non_numeric_weights() -> None:
    content = workbook_bytes(
        [["=A1", "Process Design Basis", "Process", "Report", "not-a-date", "heavy"]],
    )

    result = parse_mdr_workbook(content, "register.xlsx")
    errors = result["rows"][0]["errors"]

    assert "Document Number cannot contain a formula." in errors
    assert "Document Number is required." in errors
    assert "Planned Submission Date must be an Excel date or YYYY-MM-DD." in errors
    assert "Progress Weight must be numeric." in errors


def test_rejects_non_xlsx_files() -> None:
    with pytest.raises(MdrImportError, match="Excel .xlsx"):
        parse_mdr_workbook(b"not an archive", "register.xls")
