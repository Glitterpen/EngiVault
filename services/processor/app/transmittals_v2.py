"""Measured, paginated layout for explicitly versioned new transmittals.

Uses standard Helvetica with WinAnsi encoding, without host fonts/dependencies.
Unsupported Unicode is printed as [U+XXXX], never silently lost from an ID.
The acknowledgement remains printable, not an electronic signature workflow.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import UTC, datetime

from .pdf_color_templates import PdfColorTemplate, resolve_pdf_color_template
from .transmittals_legacy import _attestation_reference

INK = (48 / 255, 54 / 255, 59 / 255)
MUTED = (98 / 255, 107 / 255, 112 / 255)
WHITE = (1.0, 1.0, 1.0)
LEFT, RIGHT, TOP, BOTTOM = 44.0, 551.0, 798.0, 68.0
WIDTH = RIGHT - LEFT
LEADING = 11.5
# Standard Helvetica AFM advance widths for printable ASCII (1/1000 em).
_REGULAR = (
    278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,
    1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,
    667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,
    333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,
    556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,
)
_BOLD = (
    278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,
    556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,
    975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,
    667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,
    333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,
    611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,
)
_SPECIAL_WIDTHS = {
    "Æ": (1000,1000), "æ": (889,889), "Œ": (1000,1000), "œ": (944,944),
    "Ø": (778,778), "ø": (611,611), "Ð": (722,722), "ð": (556,611),
    "Þ": (667,667), "þ": (556,611), "ß": (611,611), "€": (556,556),
    "£": (556,556), "¥": (556,556), "¢": (556,556), "©": (737,737),
    "®": (737,737), "°": (400,400), "±": (584,584), "×": (584,584),
    "÷": (584,584), "·": (278,278), "•": (350,350), "™": (1000,1000),
    "ì": (278,278), "í": (278,278), "î": (278,278), "ï": (278,278),
}
_PUNCTUATION = str.maketrans({
    "\u2010":"-", "\u2011":"-", "\u2012":"-", "\u2013":"-", "\u2014":"-",
    "\u2212":"-", "\u2018":"'", "\u2019":"'", "\u201a":"'",
    "\u201c":'"', "\u201d":'"', "\u201e":'"', "\u2026":"...",
    "\u00a0":" ", "\u202f":" ",
})


def _printable(value: object) -> str:
    text = str(value if value is not None else "").translate(_PUNCTUATION)
    result = []
    for character in text:
        if character.isspace():
            result.append(" ")
        elif ord(character) < 32 or ord(character) == 127:
            result.append(f"[U+{ord(character):04X}]")
        else:
            try:
                character.encode("cp1252")
                result.append(character)
            except UnicodeEncodeError:
                result.append(f"[U+{ord(character):04X}]")
    return re.sub(r" +", " ", "".join(result)).strip()


def _character_width(character: str, bold: bool = False) -> int:
    code = ord(character)
    if 32 <= code <= 126:
        return (_BOLD if bold else _REGULAR)[code - 32]
    if character in _SPECIAL_WIDTHS:
        return _SPECIAL_WIDTHS[character][int(bold)]
    base = unicodedata.normalize("NFD", character)[0]
    if base != character and 32 <= ord(base) <= 126:
        return (_BOLD if bold else _REGULAR)[ord(base) - 32]
    # A conservative advance for rarer WinAnsi glyphs prevents overflow.
    return 1000


def _measure_text(value: str, size: float, bold: bool = False) -> float:
    return sum(_character_width(character, bold) for character in value) * size / 1000


def _wrap_text(value: object, width: float, size: float = 9.0, bold: bool = False) -> list[str]:
    """Measure advances; split long tokens without truncating any characters."""
    text = _printable(value)
    if not text:
        return [""]
    lines: list[str] = []
    line = ""
    for word in text.split(" "):
        candidate = f"{line} {word}" if line else word
        if _measure_text(candidate, size, bold) <= width:
            line = candidate
            continue
        if line:
            lines.append(line)
            line = ""
        token = ""
        for character in word:
            if token and _measure_text(token + character, size, bold) > width:
                lines.append(token)
                token = ""
            token += character
        line = token
    if line:
        lines.append(line)
    return lines


@dataclass(frozen=True)
class TextLine:
    text: str
    size: float = 9.0
    bold: bool = False
    color: tuple[float, float, float] = INK


def _text(x: float, y: float, line: TextLine, *, right: bool = False) -> str:
    value = _printable(line.text)
    if right:
        x -= _measure_text(value, line.size, line.bold)
    escaped = "".join(
        f"\\{byte:03o}" if byte > 126 or byte < 32 else "\\" + chr(byte)
        if byte in (40, 41, 92) else chr(byte)
        for byte in value.encode("cp1252")
    )
    r, g, b = line.color
    font = "F2" if line.bold else "F1"
    return f"{r:.3f} {g:.3f} {b:.3f} rg BT /{font} {line.size:.1f} Tf 1 0 0 1 {x:.2f} {y:.2f} Tm ({escaped}) Tj ET"


def _line(x1: float, y1: float, x2: float, y2: float, color, width: float = 0.6) -> str:
    r, g, b = color
    return f"{r:.3f} {g:.3f} {b:.3f} RG {width:.2f} w {x1:.2f} {y1:.2f} m {x2:.2f} {y2:.2f} l S"


def _box(x: float, y: float, width: float, height: float, color) -> str:
    r, g, b = color
    return f"{r:.3f} {g:.3f} {b:.3f} rg {x:.2f} {y:.2f} {width:.2f} {height:.2f} re f"


def _section_rule(y: float, palette: PdfColorTemplate) -> list[str]:
    """Quiet outline; the selected accent is reserved for small section markers."""
    return [_line(LEFT, y, RIGHT, y, palette.line, 0.4)]


class Layout:
    def __init__(self, package: dict[str, object], palette: PdfColorTemplate):
        self.package = package
        self.palette = palette
        self.pages: list[list[str]] = []
        self.y = TOP
        self.new_page()

    @property
    def commands(self) -> list[str]:
        return self.pages[-1]

    @property
    def bottom(self) -> float:
        # Existing seal service rectangle: x327..539, y91..155 on page one.
        return 210.0 if len(self.pages) == 1 else BOTTOM

    def new_page(self, title: str = "DOCUMENT TRANSMITTAL") -> None:
        self.pages.append([])
        title_lines = _wrap_text(title, WIDTH - 18, 10, True)
        extra_height = (len(title_lines) - 1) * 12
        self.commands.append(_box(LEFT, TOP - 10 - extra_height, WIDTH, 24 + extra_height, self.palette.header))
        for index, value in enumerate(title_lines):
            self.commands.append(_text(LEFT + 9, TOP - 2 - index * 12, TextLine(value, 10, True, WHITE)))
        self.y = TOP - 24 - extra_height
        number = _printable(self.package.get("package_number")) or "Not recorded"
        for value in _wrap_text(f"Transmittal: {number}", WIDTH, 10, True):
            self.commands.append(_text(LEFT, self.y, TextLine(value, 10, True, MUTED)))
            self.y -= 13
        self.commands.extend(_section_rule(self.y - 2, self.palette))
        self.y -= 22

    def columns(self, fields: list[tuple[str, object]]) -> None:
        gap = 24.0
        inset = 8.0
        width = (WIDTH - inset * 2 - gap * (len(fields) - 1)) / len(fields)
        cells = [
            [TextLine(label, 7.8, True, MUTED)]
            + [TextLine(line, 9.2) for line in _wrap_text(value, width, 9.2)]
            for label, value in fields
        ]
        offset, total = 0, max(map(len, cells))
        while offset < total:
            available = int((self.y - self.bottom - 12) // LEADING)
            if available < 1:
                self.new_page("ISSUE DETAILS - CONTINUED")
                continue
            take = min(total - offset, available)
            top = self.y + 10
            for index, cell in enumerate(cells):
                for number, line in enumerate(cell[offset:offset + take]):
                    self.commands.append(_text(LEFT + inset + index * (width + gap), self.y - number * LEADING, line))
            self.y -= take * LEADING + 12
            bottom = self.y + 10
            self.commands.append(_line(LEFT, top, RIGHT, top, self.palette.line, 0.4))
            self.commands.append(_line(LEFT, bottom, RIGHT, bottom, self.palette.line, 0.4))
            for x in (LEFT, RIGHT):
                self.commands.append(_line(x, top, x, bottom, self.palette.line, 0.4))
            for index in range(1, len(fields)):
                x = LEFT + inset + index * (width + gap) - gap / 2
                self.commands.append(_line(x, top, x, bottom, self.palette.line, 0.4))
            offset += take
            if offset < total:
                self.new_page("ISSUE DETAILS - CONTINUED")

    def paragraph(self, label: str, value: object) -> None:
        self.columns([(label, value)])

    def table_header(self, count: int, *, continued: bool = False) -> None:
        if self.y - 55 < self.bottom:
            self.new_page("DOCUMENT SCHEDULE - CONTINUED")
        label = "Document schedule - continued" if continued else "Document schedule"
        self.commands.append(_box(LEFT, self.y - 2, 3, 12, self.palette.accent))
        self.commands.append(_text(LEFT + 10, self.y, TextLine(label, 10.5, True, self.palette.header)))
        self.commands.append(_text(RIGHT, self.y, TextLine(f"{count} document{'s' if count != 1 else ''}", 8.5, False, MUTED), right=True))
        self.y -= 16
        self.commands.append(_box(LEFT, self.y - 21, WIDTH, 24, self.palette.paper))
        self.commands.append(_line(LEFT, self.y + 3, RIGHT, self.y + 3, self.palette.line, 0.4))
        for x in (LEFT, 321, 420, 464, RIGHT):
            self.commands.append(_line(x, self.y + 3, x, self.y - 21, self.palette.line, 0.4))
        for x, value in [(52, "DOCUMENT / TITLE"), (329, "DISCIPLINE"), (428, "REV"), (472, "ISSUE PURPOSE")]:
            self.commands.append(_text(x, self.y - 12, TextLine(value, 9.0, True, self.palette.header)))
        self.commands.append(_line(LEFT, self.y - 21, RIGHT, self.y - 21, self.palette.line, 0.7))
        self.y -= 24

    def row(self, row: dict[str, object], ordinal: int, count: int) -> None:
        title = row.get("document_title")
        title = title if isinstance(title, str) and title.strip() else "Title not recorded"
        cells = [
            [TextLine(line, 9.0, True) for line in _wrap_text(row.get("document_number") or "Number not recorded", 261, 9, True)]
            + [TextLine(line, 8.7, False, MUTED) for line in _wrap_text(title, 261, 8.7)],
            [TextLine(line, 8.7) for line in _wrap_text(row.get("discipline") or "Not recorded", 83, 8.7)],
            [TextLine(line, 8.7, True) for line in _wrap_text(row.get("revision_code") or "Not recorded", 28, 8.7, True)],
            [TextLine(line, 8.5) for line in _wrap_text(row.get("issue_status") or "Not recorded", 71, 8.5)],
        ]
        if row.get("inclusion_state") not in (None, "included"):
            cells[3] += [TextLine(line, 8.0, True, self.palette.header) for line in _wrap_text("Not included", 71, 8, True)]
        total, offset = max(map(len, cells)), 0
        while offset < total:
            available = int((self.y - self.bottom - 16) // LEADING)
            remaining = total - offset
            fresh_capacity = int((700 - BOTTOM - 16) // LEADING)
            if available < 1 or (remaining > available and remaining <= fresh_capacity):
                self.new_page("DOCUMENT SCHEDULE - CONTINUED")
                self.table_header(count, continued=True)
                available = int((self.y - self.bottom - 16) // LEADING)
            take = min(remaining, available)
            height = take * LEADING + 16
            # The grid starts exactly at the header's lower edge. The text
            # baselines and pagination heights remain unchanged.
            row_top, row_bottom = self.y + 3, self.y - height + 3
            if ordinal % 2 == 0:
                self.commands.append(_box(LEFT, row_bottom, WIDTH, height, self.palette.paper))
            for column, (x, cell) in enumerate(zip((52, 329, 428, 472), cells, strict=True)):
                for number, line in enumerate(cell[offset:offset + take]):
                    # Only a genuinely short one-line revision is centred.
                    # Wrapped revision identifiers retain their full left-led flow.
                    text_x = 420 + (44 - _measure_text(line.text, line.size, line.bold)) / 2 if column == 2 and len(cell) == 1 else x
                    self.commands.append(_text(text_x, self.y - 14 - number * LEADING, line))
            for x in (LEFT, 321, 420, 464, RIGHT):
                self.commands.append(_line(x, row_top, x, row_bottom, self.palette.line, 0.4))
            self.commands.append(_line(LEFT, row_bottom, RIGHT, row_bottom, self.palette.line, 0.4))
            self.y -= height
            offset += take
            if offset < total:
                self.new_page("DOCUMENT SCHEDULE - CONTINUED")
                self.table_header(count, continued=True)

    def acknowledgement(self, reference: str) -> None:
        if self.y - 132 < self.bottom:
            self.new_page()
        top = self.y - 10
        self.commands.extend(_section_rule(top, self.palette))
        self.commands.append(_box(LEFT, top - 22, 3, 12, self.palette.accent))
        self.commands.append(_text(LEFT + 10, top - 20, TextLine("CLIENT ACKNOWLEDGEMENT", 10, True, self.palette.header)))
        self.commands.append(_text(LEFT, top - 39, TextLine("I acknowledge receipt of the documents listed in this transmittal.", 9)))
        self.commands.append(_text(LEFT, top - 60, TextLine("Signature", 8.5, True, MUTED)))
        self.commands.append(_text(400, top - 60, TextLine("Date", 8.5, True, MUTED)))
        self.commands.append(_line(LEFT, top - 91, 365, top - 91, self.palette.line))
        self.commands.append(_line(400, top - 91, RIGHT, top - 91, self.palette.line))
        self.commands.append(_text(LEFT, top - 112, TextLine(f"Please sign, date and return to the issuing Document Controller. Reference: {reference}", 7.4, False, MUTED)))
        self.y = top - 122


def _date(value: object) -> str:
    if not value:
        return "Not recorded"
    try:
        stamp = datetime.fromisoformat(str(value))
        stamp = stamp.replace(tzinfo=UTC) if stamp.tzinfo is None else stamp.astimezone(UTC)
        return stamp.strftime("%d %B %Y, %H:%M UTC")
    except ValueError:
        return _printable(value)


def _attestation(reference: str, sealed: bool, palette: PdfColorTemplate) -> list[str]:
    commands = [
        *_section_rule(190, palette),
        _box(LEFT, 172, 3, 11, palette.accent),
        _text(LEFT + 10, 174, TextLine("SYSTEM-ISSUED ATTESTATION", 8.5, True, palette.header)),
    ]
    width = 265 if sealed else WIDTH
    text = "Issued by the authenticated project Document Controller. The recorded issuer and issue time are shown above."
    y = 158.0
    for value in _wrap_text(text, width, 8.2):
        commands.append(_text(LEFT, y, TextLine(value, 8.2, False, MUTED)))
        y -= 10.5
    commands.append(_text(LEFT, y - 2, TextLine(f"Record reference: {reference}", 8.0, True)))
    qualification = "Electronic organisation seal embedded; inspect its certificate." if sealed else "System-issued transmittal. Issuer and issue date recorded electronically."
    for index, value in enumerate(_wrap_text(qualification, width, 8.0)):
        commands.append(_text(LEFT, y - 19 - index * 10, TextLine(value, 8.0, False, MUTED)))
    # The existing first-page seal rectangle remains free of text/row content.
    return commands


def build_transmittal_pdf(
    package: dict[str, object],
    documents: list[dict[str, object]],
    *,
    electronic_seal_expected: bool = False,
) -> bytes:
    manifest = package.get("manifest") if isinstance(package.get("manifest"), dict) else {}
    project = manifest.get("project") if isinstance(manifest.get("project"), dict) else {}
    recipient = manifest.get("recipient") if isinstance(manifest.get("recipient"), dict) else {}
    issuer = manifest.get("issuer") if isinstance(manifest.get("issuer"), dict) else {}
    reference = _attestation_reference(package, documents, manifest)
    palette = resolve_pdf_color_template(manifest.get("pdf_color_template"))
    layout = Layout(package, palette)
    layout.paragraph("PROJECT", " - ".join(str(value) for value in [project.get("code"), project.get("name")] if value) or "Not recorded")
    routing = " / ".join(str(value) for value in [recipient.get("company"), recipient.get("contact"), recipient.get("email")] if value) or "Client"
    layout.columns([("FROM", project.get("organisation") or "Project organisation"), ("TO / ATTENTION", routing)])
    identity = " / ".join(str(value) for value in [issuer.get("name"), issuer.get("email")] if value) or "Document Controller"
    layout.columns([("ISSUED BY", identity), ("ISSUED / PURPOSE", f"{_date(manifest.get('issued_at'))} / {package.get('purpose') or 'Document issue'}")])
    if manifest.get("message"):
        layout.paragraph("COVER NOTE", manifest["message"])
    # Separate the closed document-control register from the schedule heading.
    layout.y -= 6
    layout.table_header(len(documents))
    if not documents:
        layout.commands.append(_text(52, layout.y - 20, TextLine("No document rows in this transmittal.", 9, False, MUTED)))
        layout.y -= 40
    for ordinal, row in enumerate(documents):
        layout.row(row, ordinal, len(documents))
    layout.acknowledgement(reference)
    layout.pages[0] += _attestation(reference, electronic_seal_expected, palette)
    total = len(layout.pages)
    for number, commands in enumerate(layout.pages, 1):
        commands += [
            _line(LEFT, 52, RIGHT, 52, palette.line),
            _text(LEFT, 36, TextLine("Generated by EngiCite", 7.5, False, MUTED)),
            _text(RIGHT, 36, TextLine(f"Page {number} of {total}", 7.5, True, MUTED), right=True),
        ]
    return _render_pdf(layout.pages)


def _render_pdf(pages: list[list[str]]) -> bytes:
    objects = [b"<< /Type /Catalog /Pages 2 0 R >>"]
    refs = [5 + index * 2 for index in range(len(pages))]
    objects += [f"<< /Type /Pages /Kids [{' '.join(f'{ref} 0 R' for ref in refs)}] /Count {len(pages)} >>".encode()]
    objects += [f"<< /Type /Font /Subtype /Type1 /BaseFont /{font} /Encoding /WinAnsiEncoding >>".encode() for font in ("Helvetica", "Helvetica-Bold")]
    for index, commands in enumerate(pages):
        stream = "\n".join(commands).encode("ascii")
        objects += [
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents {6 + index * 2} 0 R >>".encode(),
            f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream",
        ]
    result = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for number, payload in enumerate(objects, 1):
        offsets.append(len(result))
        result += f"{number} 0 obj\n".encode() + payload + b"\nendobj\n"
    xref = len(result)
    result += f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode()
    for offset in offsets:
        result += f"{offset:010d} 00000 n \n".encode()
    result += f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(result)
