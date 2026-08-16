from __future__ import annotations

import hashlib
import textwrap
from collections.abc import Iterable
from datetime import datetime

NAVY = (0.035, 0.137, 0.267)
GREEN = (0.047, 0.357, 0.271)
ORANGE = (0.929, 0.443, 0.220)
GREY = (0.380, 0.439, 0.514)


def build_transmittal_pdf(
    package: dict[str, object],
    documents: list[dict[str, object]],
    *,
    electronic_seal_expected: bool = False,
) -> bytes:
    """Create a dependency-free, printable PDF transmittal and acknowledgement form."""
    manifest = package.get("manifest") if isinstance(package.get("manifest"), dict) else {}
    recipient = manifest.get("recipient") if isinstance(manifest.get("recipient"), dict) else {}
    issuer = manifest.get("issuer") if isinstance(manifest.get("issuer"), dict) else {}
    project = manifest.get("project") if isinstance(manifest.get("project"), dict) else {}
    issued_at = _display_date(manifest.get("issued_at"))
    reference = _attestation_reference(package, documents, manifest)
    pages: list[list[str]] = []

    first_rows, remaining = documents[:18], documents[18:]
    pages.append(_document_page(package, project, recipient, issuer, first_rows, issued_at, 1, reference, electronic_seal_expected))
    page_number = 2
    while remaining:
        page_rows, remaining = remaining[:28], remaining[28:]
        pages.append(_continuation_page(package, page_rows, page_number))
        page_number += 1
    pages.append(_acknowledgement_page(package, recipient, reference, page_number))
    return _render_pdf(pages)


def _document_page(
    package: dict[str, object],
    project: dict[str, object],
    recipient: dict[str, object],
    issuer: dict[str, object],
    rows: list[dict[str, object]],
    issued_at: str,
    page_number: int,
    reference: str,
    electronic_seal_expected: bool,
) -> list[str]:
    commands = _page_header(package, "DOCUMENT TRANSMITTAL", page_number)
    y = 730
    commands += _label_value(44, y, "PROJECT", f"{project.get('code', '')} - {project.get('name', '')}", width=76)
    y -= 31
    commands += _label_value(44, y, "FROM", str(project.get("organisation") or "Project organisation"), width=76)
    y -= 31
    commands += _label_value(44, y, "TO", str(recipient.get("company") or "Client"), width=76)
    y -= 31
    attention = str(recipient.get("contact") or "Client representative")
    email = str(recipient.get("email") or "")
    commands += _label_value(44, y, "ATTENTION", f"{attention}{' - ' + email if email else ''}", width=76)
    y -= 31
    commands += _label_value(44, y, "PURPOSE", str(package.get("purpose") or "Document issue"), width=76)
    y -= 31
    commands += _label_value(44, y, "ISSUED", issued_at, width=76)
    y -= 35
    message = str((package.get("manifest") or {}).get("message") or "Please acknowledge receipt of the documents listed below.")
    commands += _wrapped_text(44, y, message, 9, 94, GREY, leading=12)
    y -= max(30, 12 * len(textwrap.wrap(_plain(message), width=94)))
    commands += _table_header(y)
    y -= 22
    for row in rows:
        commands += _table_row(y, row)
        y -= 23
    commands += _attestation_box(44, 83, issuer, issued_at, reference, electronic_seal_expected)
    commands += _footer(page_number)
    return commands


def _continuation_page(package: dict[str, object], rows: list[dict[str, object]], page_number: int) -> list[str]:
    commands = _page_header(package, "DOCUMENT SCHEDULE - CONTINUED", page_number)
    y = 730
    commands += _table_header(y)
    y -= 22
    for row in rows:
        commands += _table_row(y, row)
        y -= 23
    commands += _footer(page_number)
    return commands


def _acknowledgement_page(
    package: dict[str, object],
    recipient: dict[str, object],
    reference: str,
    page_number: int,
) -> list[str]:
    commands = _page_header(package, "CLIENT ACKNOWLEDGEMENT", page_number)
    commands += _text(44, 724, "ACKNOWLEDGEMENT OF RECEIPT", 14, True, NAVY)
    commands += _wrapped_text(
        44,
        697,
        f"We acknowledge receipt of transmittal {package.get('package_number', '')} and the {len((package.get('manifest') or {}).get('documents', [])) or (package.get('manifest') or {}).get('document_count', '')} document(s) listed in the attached schedule.",
        10,
        91,
        GREY,
        leading=14,
    )
    commands += _text(44, 633, "Recipient company", 8, True, GREY)
    commands += _line(44, 611, 548, 611)
    commands += _text(48, 617, str(recipient.get("company") or ""), 10, False, NAVY)
    fields = [
        ("Representative name", 566),
        ("Job title", 502),
        ("Signature", 438),
        ("Date received", 374),
    ]
    for label, y in fields:
        commands += _text(44, y + 22, label, 8, True, GREY)
        commands += _line(44, y, 548, y)
    commands += _text(44, 320, "Client comments / exceptions", 8, True, GREY)
    for y in (294, 264, 234, 204):
        commands += _line(44, y, 548, y)
    commands.append(_box(44, 108, 504, 58, fill=(0.961, 0.976, 0.969), stroke=(0.812, 0.882, 0.847)))
    commands += _text(56, 145, "RETURN INSTRUCTION", 8, True, GREEN)
    commands += _wrapped_text(56, 128, "Sign this acknowledgement and return it to the issuing Document Controller. Quote the transmittal number and attestation reference in your response.", 9, 84, NAVY, leading=12)
    commands += _text(44, 86, f"Attestation reference: {reference}", 8, True, GREY)
    commands += _footer(page_number)
    return commands


def _page_header(package: dict[str, object], title: str, page_number: int) -> list[str]:
    number = str(package.get("package_number") or "")
    return [
        "0.035 0.137 0.267 rg 0 782 595 60 re f",
        "0.929 0.443 0.220 rg 0 782 9 60 re f",
        *_text(30, 809, "Engi", 20, True, (1, 1, 1)),
        *_text(73, 809, "Cite", 20, True, ORANGE),
        *_text(548, 813, f"{page_number}", 9, True, (1, 1, 1)),
        *_text(44, 758, title, 16, True, NAVY),
        *_text(548, 758, number, 9, True, ORANGE, align="right"),
        *_line(44, 746, 551, 746, GREEN, 1.2),
    ]


def _table_header(y: float) -> list[str]:
    commands = [_box(44, y - 18, 507, 22, fill=GREEN, stroke=GREEN)]
    headings = [(48, "DOCUMENT NUMBER"), (230, "DISCIPLINE"), (320, "REV"), (365, "ISSUE STATUS")]
    for x, label in headings:
        commands += _text(x, y - 11, label, 7, True, (1, 1, 1))
    return commands


def _table_row(y: float, row: dict[str, object]) -> list[str]:
    commands = _line(44, y - 19, 551, y - 19, (0.86, 0.89, 0.91), 0.5)
    values = [
        (48, _clip(row.get("document_number"), 30)),
        (230, _clip(row.get("discipline"), 14)),
        (320, _clip(row.get("revision_code"), 7)),
        (365, _clip(row.get("issue_status"), 30)),
    ]
    for x, value in values:
        commands += _text(x, y - 12, value, 7.5, x == 48, NAVY)
    return commands


def _attestation_box(
    x: float,
    y: float,
    issuer: dict[str, object],
    issued_at: str,
    reference: str,
    electronic_seal_expected: bool,
) -> list[str]:
    commands = [_box(x, y, 507, 83, fill=(0.961, 0.976, 0.969), stroke=(0.812, 0.882, 0.847))]
    commands += _text(x + 12, y + 62, "ENGICITE SYSTEM-ISSUED ATTESTATION", 8, True, GREEN)
    name = str(issuer.get("name") or "Document Controller")
    email = str(issuer.get("email") or "")
    commands += _wrapped_text(x + 12, y + 46, f"Issued by {name}{' (' + email + ')' if email else ''} while authenticated as the project Document Controller on {issued_at}.", 8.5, 91, NAVY, leading=11)
    qualification = (
        "Electronic organisation seal embedded by Adobe and Intesi Group; inspect its certificate."
        if electronic_seal_expected
        else "System record; not a qualified electronic signature or seal."
    )
    commands += _text(x + 12, y + 12, f"Record reference: {reference} - {qualification}", 7.5, True, GREY)
    return commands


def _label_value(x: float, y: float, label: str, value: str, width: float) -> list[str]:
    commands = _text(x, y, label, 7.5, True, GREY)
    commands += _text(x + width, y, _clip(value, 78), 9.5, False, NAVY)
    commands += _line(x + width, y - 7, 551, y - 7, (0.86, 0.89, 0.91), 0.45)
    return commands


def _footer(page_number: int) -> list[str]:
    return [
        *_line(44, 52, 551, 52, (0.86, 0.89, 0.91), 0.5),
        *_text(44, 36, "Generated by EngiCite - Know the answer. Cite the proof.", 7.5, False, GREY),
        *_text(551, 36, f"Page {page_number}", 7.5, True, GREY, align="right"),
    ]


def _attestation_reference(package: dict[str, object], rows: Iterable[dict[str, object]], manifest: dict[str, object]) -> str:
    issuer = manifest.get("issuer") if isinstance(manifest.get("issuer"), dict) else {}
    material = "|".join(
        [
            str(package.get("id") or ""),
            str(package.get("package_number") or ""),
            str(manifest.get("issued_at") or ""),
            str(issuer.get("user_id") or ""),
            *[str(row.get("revision_id") or "") for row in rows],
        ]
    )
    return f"EC-{hashlib.sha256(material.encode('utf-8')).hexdigest()[:20].upper()}"


def _display_date(value: object) -> str:
    if not value:
        return ""
    try:
        return datetime.fromisoformat(str(value)).strftime("%d %B %Y, %H:%M UTC")
    except ValueError:
        return str(value)


def _render_pdf(pages: list[list[str]]) -> bytes:
    objects: list[bytes] = []
    page_refs = [5 + index * 2 for index in range(len(pages))]
    objects.append(b"<< /Type /Catalog /Pages 2 0 R >>")
    objects.append(f"<< /Type /Pages /Kids [{' '.join(f'{ref} 0 R' for ref in page_refs)}] /Count {len(pages)} >>".encode())
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    objects.append(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>")
    for index, commands in enumerate(pages):
        page_number = 5 + index * 2
        content_number = page_number + 1
        page = f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {content_number} 0 R >>"
        stream = "\n".join(commands).encode("latin-1", "replace")
        objects.append(page.encode())
        objects.append(f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream")

    result = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for number, payload in enumerate(objects, start=1):
        offsets.append(len(result))
        result.extend(f"{number} 0 obj\n".encode())
        result.extend(payload)
        result.extend(b"\nendobj\n")
    xref = len(result)
    result.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    result.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        result.extend(f"{offset:010d} 00000 n \n".encode())
    result.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return bytes(result)


def _text(x: float, y: float, value: str, size: float, bold: bool, color: tuple[float, float, float], align: str = "left") -> list[str]:
    plain = _plain(value)
    if align == "right":
        x -= len(plain) * size * 0.49
    escaped = plain.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    font = "F2" if bold else "F1"
    return [f"{color[0]:.3f} {color[1]:.3f} {color[2]:.3f} rg BT /{font} {size:.1f} Tf 1 0 0 1 {x:.1f} {y:.1f} Tm ({escaped}) Tj ET"]


def _wrapped_text(x: float, y: float, value: str, size: float, width: int, color: tuple[float, float, float], leading: float) -> list[str]:
    commands: list[str] = []
    for index, line in enumerate(textwrap.wrap(_plain(value), width=width) or [""]):
        commands += _text(x, y - index * leading, line, size, False, color)
    return commands


def _line(x1: float, y1: float, x2: float, y2: float, color: tuple[float, float, float] = GREY, width: float = 0.7) -> list[str]:
    return [f"{color[0]:.3f} {color[1]:.3f} {color[2]:.3f} RG {width:.2f} w {x1:.1f} {y1:.1f} m {x2:.1f} {y2:.1f} l S"]


def _box(x: float, y: float, width: float, height: float, fill: tuple[float, float, float], stroke: tuple[float, float, float]) -> str:
    return f"{fill[0]:.3f} {fill[1]:.3f} {fill[2]:.3f} rg {stroke[0]:.3f} {stroke[1]:.3f} {stroke[2]:.3f} RG {x:.1f} {y:.1f} {width:.1f} {height:.1f} re B"


def _plain(value: object) -> str:
    return str(value or "").encode("latin-1", "replace").decode("latin-1").replace("\n", " ").replace("\r", " ")


def _clip(value: object, limit: int) -> str:
    plain = _plain(value)
    return plain if len(plain) <= limit else f"{plain[: max(1, limit - 1)]}…".encode("latin-1", "replace").decode("latin-1")
