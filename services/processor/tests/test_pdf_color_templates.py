from dataclasses import FrozenInstanceError

import pytest

from app.pdf_color_templates import PDF_COLOR_TEMPLATES, resolve_pdf_color_template


@pytest.mark.parametrize("value", [None, "", "SLATE", "slate ", "#ff0000", "unknown", 0, True, [], {}])
def test_unknown_or_non_string_frozen_metadata_falls_back_to_neutral(value):
    assert resolve_pdf_color_template(value) is PDF_COLOR_TEMPLATES["neutral"]


def test_template_registry_and_palette_values_are_immutable():
    with pytest.raises(TypeError):
        PDF_COLOR_TEMPLATES["neutral"] = PDF_COLOR_TEMPLATES["slate"]
    with pytest.raises(FrozenInstanceError):
        PDF_COLOR_TEMPLATES["neutral"].header = (0, 0, 0)


@pytest.mark.parametrize("template,expected", [
    ("neutral", ((53, 61, 67), (66, 106, 103), (139, 120, 102), (241, 243, 243), (201, 206, 206))),
    ("slate", ((47, 62, 79), (64, 91, 122), (139, 120, 102), (240, 243, 247), (199, 207, 217))),
    ("forest", ((44, 62, 54), (55, 102, 80), (139, 120, 102), (240, 245, 242), (198, 211, 203))),
    ("burgundy", ((79, 48, 59), (122, 62, 83), (121, 125, 132), (247, 241, 243), (217, 201, 207))),
    ("monochrome", ((50, 50, 50), (95, 95, 95), (140, 140, 140), (243, 243, 243), (205, 205, 205))),
])
def test_rgb_contract_matches_report_palette(template, expected):
    palette = resolve_pdf_color_template(template)
    actual = (palette.header, palette.accent, palette.planned, palette.paper, palette.line)
    assert tuple(tuple(round(channel * 255) for channel in color) for color in actual) == expected
