"""Curated PDF colours, resolved only from frozen document metadata.

Keep the RGB contract aligned with the web report renderer. These immutable
values are shared safely; each document receives its own selected palette.
"""
from __future__ import annotations

from dataclasses import dataclass
from types import MappingProxyType

Color = tuple[float, float, float]


def _rgb(red: int, green: int, blue: int) -> Color:
    return (red / 255, green / 255, blue / 255)


@dataclass(frozen=True)
class PdfColorTemplate:
    id: str
    header: Color
    accent: Color
    planned: Color
    paper: Color
    line: Color


PDF_COLOR_TEMPLATES = MappingProxyType({
    "neutral": PdfColorTemplate("neutral", _rgb(53, 61, 67), _rgb(66, 106, 103),
                                _rgb(139, 120, 102), _rgb(241, 243, 243), _rgb(201, 206, 206)),
    "slate": PdfColorTemplate("slate", _rgb(47, 62, 79), _rgb(64, 91, 122),
                              _rgb(139, 120, 102), _rgb(240, 243, 247), _rgb(199, 207, 217)),
    "forest": PdfColorTemplate("forest", _rgb(44, 62, 54), _rgb(55, 102, 80),
                               _rgb(139, 120, 102), _rgb(240, 245, 242), _rgb(198, 211, 203)),
    "burgundy": PdfColorTemplate("burgundy", _rgb(79, 48, 59), _rgb(122, 62, 83),
                                 _rgb(121, 125, 132), _rgb(247, 241, 243), _rgb(217, 201, 207)),
    "monochrome": PdfColorTemplate("monochrome", _rgb(50, 50, 50), _rgb(95, 95, 95),
                                   _rgb(140, 140, 140), _rgb(243, 243, 243), _rgb(205, 205, 205)),
})


def resolve_pdf_color_template(value: object) -> PdfColorTemplate:
    """Unknown legacy/future metadata is safe to read, never arbitrary colour input."""
    return PDF_COLOR_TEMPLATES.get(value, PDF_COLOR_TEMPLATES["neutral"]) if isinstance(value, str) else PDF_COLOR_TEMPLATES["neutral"]
