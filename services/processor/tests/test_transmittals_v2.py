import copy
import hashlib
import io
import re
from concurrent.futures import ThreadPoolExecutor

import pytest
from pypdf import PdfReader
from test_transmittals import sample_transmittal

from app.pdf_color_templates import PDF_COLOR_TEMPLATES
from app.transmittals import _attestation_reference, build_transmittal_pdf
from app.transmittals_legacy import build_transmittal_pdf as build_legacy
from app.transmittals_v2 import _date, _measure_text, _printable, _wrap_text


def fixture(count=20):
    package, documents = sample_transmittal(count)
    package["manifest"]["pdf_layout_version"] = 2
    for index, row in enumerate(documents):
        row["document_title"] = f"Instrumentation and control system design - unit {index + 1:03}"
        row["discipline"] = "Instrumentation"
    return package, documents


def reader_for(package, documents, sealed=False):
    return PdfReader(io.BytesIO(build_transmittal_pdf(package, documents, electronic_seal_expected=sealed)))


def fragments(page):
    # Inspect actual text operators: pypdf's text visitor can report the reset
    # (0,0) matrix for adjacent same-baseline column fragments.
    result = []
    font, size, x, y = None, 0, 0, 0
    for arguments, operator in page.get_contents().operations:
        if operator == b"Tf":
            font = page["/Resources"]["/Font"][arguments[0]].get_object()
            size = float(arguments[1])
        elif operator == b"Tm":
            x, y = float(arguments[4]), float(arguments[5])
        elif operator == b"Tj":
            value = arguments[0]
            text = value.original_bytes.decode("cp1252") if hasattr(value, "original_bytes") else str(value)
            if text.strip():
                result.append((text.strip(), x, y, font, size))
    return result


@pytest.mark.parametrize("version", [None, 1, "2", True, 2.0, 3])
@pytest.mark.parametrize("sealed", [False, True])
def test_legacy_is_selected_for_every_manifest_without_explicit_integer_v2(version, sealed):
    package, documents = sample_transmittal()
    if version is not None:
        package["manifest"]["pdf_layout_version"] = version
    assert build_transmittal_pdf(package, documents, electronic_seal_expected=sealed) == build_legacy(package, documents, electronic_seal_expected=sealed)


@pytest.mark.parametrize("count", [0, 1, 16, 20, 70, 103])
@pytest.mark.parametrize("long_message", [False, True])
@pytest.mark.parametrize("sealed", [False, True])
def test_v2_preserves_order_counts_full_labels_footer_and_body_bounds(count, long_message, sealed):
    package, documents = fixture(count)
    if long_message:
        package["manifest"]["message"] = ("Please review every controlled deliverable and acknowledge receipt. " * 50)[:2000]
    reader = reader_for(package, documents, sealed)
    all_text = "\n".join(page.extract_text() for page in reader.pages)
    positions = [all_text.index(row["document_number"]) for row in documents]
    assert positions == sorted(positions)
    for row in documents:
        assert all_text.count(row["document_number"]) == 1
    if documents:
        assert all_text.count("Instrumentation") >= count
        assert "Title not recorded" not in all_text
    assert all_text.split().count("Signature") == 1
    assert all_text.split().count("Date") == 1
    assert all_text.count("CLIENT ACKNOWLEDGEMENT") == 1
    assert "Recipient company" not in all_text
    assert "Representative name" not in all_text
    assert "Job title" not in all_text
    assert "Adobe" not in all_text and "Intesi" not in all_text
    assert "Electronic organisation seal embedded" in all_text if sealed else "System-issued transmittal. Issuer and issue date recorded electronically." in " ".join(all_text.split())
    assert "qualified" not in all_text.lower()
    reference = _attestation_reference(package, documents, package["manifest"])
    assert all_text.count(reference) == 2
    for number, page in enumerate(reader.pages, 1):
        text = page.extract_text()
        assert text.count("EngiCite") == 1
        assert f"Page {number} of {len(reader.pages)}" in text
        assert "TR-DEMO-001" in text
        for value, x, y, font, size in fragments(page):
            assert x >= 43.9
            assert x + _measure_text(value, size, str(font.get("/BaseFont", "")).endswith("Bold")) <= 551.2, value
            if "EngiCite" in value or value.startswith("Page "):
                assert y == 36
            else:
                assert 68 <= y <= 798
        if sealed and number == 1:
            # Reserved for the existing seal provider; no row/text overlap.
            assert not any(x < 539 and x + _measure_text(value, size) > 327 and 91 <= y <= 155 for value, x, y, _font, size in fragments(page))
        stream = page.get_contents().get_data()
        assert b"0.047 0.357 0.271" not in stream  # No legacy green.


@pytest.mark.parametrize("count", [0, 1])
def test_acknowledgement_shares_the_schedule_page_when_it_fits(count):
    package, documents = fixture(count)
    reader = reader_for(package, documents)
    assert len(reader.pages) == 1
    assert "CLIENT ACKNOWLEDGEMENT" in reader.pages[0].extract_text()
    assert not reader.get_fields()  # Printable signature/date, no invented digital signature.


def test_long_identifiers_titles_and_issuer_fields_are_wrapped_without_loss():
    package, documents = fixture(1)
    document = documents[0]
    document["document_number"] = "WIDE-" + "W" * 160 + "-END"
    document["revision_code"] = "REV-" + "W" * 40 + "-FINAL"
    document["document_title"] = "TITLESTART " + "WIDE engineering design description " * 400 + " TITLEEND"
    document["discipline"] = "Instrumentation and Control Engineering Assurance"
    document["issue_status"] = "Issued for detailed multidisciplinary coordination and design verification"
    package["manifest"]["project"]["name"] = "Project " + "W" * 250
    package["manifest"]["issuer"]["name"] = "Controller " + "W" * 150
    package["manifest"]["issuer"]["email"] = "w" * 200 + "@example.test"
    reader = reader_for(package, documents, True)
    cells = {"document_number": (52, 9), "document_title": (52, 8.7),
             "discipline": (329, 8.7), "revision_code": (428, 8.7), "issue_status": (472, 8.5)}
    for key, (column_x, font_size) in cells.items():
        # A page-tall row may cross repeated headers; inspect its actual column
        # operators to verify every character in order across page boundaries.
        content = "".join(value for page in reader.pages for value, x, _y, _font, size in fragments(page)
                          if x == column_x and size == font_size and value != "DOCUMENT / TITLE")
        assert re.sub(r"\s+", "", content) == re.sub(r"\s+", "", document[key])
    for page in reader.pages:
        for value, x, y, font, size in fragments(page):
            assert x + _measure_text(value, size, str(font.get("/BaseFont", "")).endswith("Bold")) <= 551.2
            assert y >= 36


def test_missing_frozen_titles_are_explicit_and_do_not_use_a_live_title_alias():
    package, documents = fixture(2)
    documents[0].pop("document_title")
    documents[0]["title"] = "Do not use mutable live title aliases"
    documents[1]["document_title"] = "  "
    text = "\n".join(page.extract_text() for page in reader_for(package, documents).pages)
    assert text.count("Title not recorded") == 2
    assert "mutable live" not in text


def test_attestation_material_and_input_records_are_unchanged():
    package, documents = fixture(4)
    before = copy.deepcopy((package, documents))
    reference = _attestation_reference(package, documents, package["manifest"])
    reader = reader_for(package, documents)
    assert reference in "".join(page.extract_text() for page in reader.pages)
    assert (package, documents) == before


@pytest.mark.parametrize("template", PDF_COLOR_TEMPLATES)
@pytest.mark.parametrize("sealed", [False, True])
def test_attestation_wording_is_exact_and_preserves_record_metadata_across_palettes(template, sealed):
    package, documents = fixture(4)
    package["manifest"]["pdf_color_template"] = template
    before = copy.deepcopy((package, documents))
    reference = _attestation_reference(package, documents, package["manifest"])
    reader = reader_for(package, documents, sealed)
    text = " ".join(reader.pages[0].extract_text().split())
    wording = text.split(f"Record reference: {reference} ", 1)[1].split(" Generated by EngiCite", 1)[0]
    expected = (
        "Electronic organisation seal embedded; inspect its certificate."
        if sealed else
        "System-issued transmittal. Issuer and issue date recorded electronically."
    )
    assert wording == expected
    assert "qualified" not in text.lower()
    assert "eidas" not in text.lower()
    assert reference == "EC-13B84BC3C7C1C8FB0469"
    assert text.count(reference) == 2
    assert "A. Controller / dcc@example.test" in text
    assert "12 September 2026, 12:00 UTC / Issued for Approval" in text
    assert "Transmittal: TR-DEMO-001" in text
    assert (package, documents) == before
    assert _attestation_reference(package, documents, package["manifest"]) == reference


def test_supported_accents_and_explicit_unsupported_unicode_remain_traceable():
    package, documents = fixture(1)
    documents[0]["document_number"] = "DOC-Ω-工程"
    documents[0]["document_title"] = "Café pressure – controller’s design…"
    package["manifest"]["issuer"]["name"] = "René"
    text = "\n".join(page.extract_text() for page in reader_for(package, documents).pages)
    assert "DOC-[U+03A9]-[U+5DE5][U+7A0B]" in text
    assert "Café pressure - controller's design..." in text
    assert "René" in text
    assert "?" not in text


def test_wrapping_measures_wide_glyphs_and_splits_unbroken_identifiers():
    for bold in (False, True):
        value = "W" * 300
        lines = _wrap_text(value, 65, 9, bold)
        assert "".join(lines) == value
        assert len(lines) > 20
        assert all(_measure_text(line, 9, bold) <= 65 for line in lines)
    assert _measure_text("WW", 10) == 18.88
    assert _measure_text("ìíîï", 10) == 11.12
    assert _printable("a—b🙂") == "a-b[U+1F642]"


def test_offset_dates_are_converted_before_the_utc_label_is_added():
    assert _date("2026-10-17T12:15:00+03:00") == "17 October 2026, 09:15 UTC"
    assert _date("2026-10-17T23:30:00-02:00") == "18 October 2026, 01:30 UTC"


def test_neutral_table_theme_has_charcoal_banner_light_headers_and_connected_grid():
    package, documents = fixture(2)
    page = reader_for(package, documents).pages[0]
    stream = page.get_contents().get_data()
    assert b"0.208 0.239 0.263 rg" in stream  # #353D43 title banner.
    assert b"0.945 0.953 0.953 rg" in stream  # #F1F3F3 headers/banding.
    assert b"0.788 0.808 0.808 RG 0.40 w" in stream  # #C9CECE grid.
    assert b"0.259 0.416 0.404 rg" in stream  # #426A67 small section markers.
    assert b"1.000 1.000 1.000 rg BT /F2 10.0 Tf" in stream
    assert b"0.208 0.239 0.263 rg BT /F2 9.0 Tf" in stream  # Dark table labels.
    assert b"0.063 0.141 0.243" not in stream  # No old navy.
    assert b"0.745 0.298 0.114" not in stream  # No old orange.
    assert b"3.00 24.00 re f" not in stream  # No old solid orange table stripe.
    # Each column outline continues from header to both rows without a gap;
    # geometry stays identical to the earlier v2 text/pagination calculation.
    vertical = []
    header_top = next(y + 15 for value, _x, y, _font, _size in fragments(page) if value == "DOCUMENT / TITLE")
    width, start = None, None
    for arguments, operator in page.get_contents().operations:
        if operator == b"w":
            width = float(arguments[0])
        elif operator == b"m":
            start = tuple(float(value) for value in arguments)
        elif operator == b"l" and start is not None:
            end = tuple(float(value) for value in arguments)
            if start[0] == end[0] and width == 0.4 and start[1] <= header_top:
                vertical.append((start[0], start[1], end[1]))
    for x in (44, 321, 420, 464, 551):
        segments = sorted([(top, bottom) for column, top, bottom in vertical if column == x], reverse=True)
        assert len(segments) == 3
        assert segments[0][1] == segments[1][0]
        assert segments[1][1] == segments[2][0]


def test_metadata_register_is_inset_and_short_revisions_are_centred():
    package, documents = fixture(1)
    page = reader_for(package, documents).pages[0]
    entries = fragments(page)
    assert next(x for value, x, _y, _font, _size in entries if value == "PROJECT") == 52
    assert next(x for value, x, _y, _font, _size in entries if value == "ISSUED BY") == 52
    revision = next((x, size) for value, x, _y, _font, size in entries if value == "A01")
    assert abs(revision[0] + _measure_text("A01", revision[1], True) / 2 - 442) < 0.02


def test_not_included_warning_is_bold_charcoal_not_the_teal_section_accent():
    package, documents = fixture(1)
    documents[0]["inclusion_state"] = "missing_revision"
    stream = reader_for(package, documents).pages[0].get_contents().get_data()
    assert b"0.208 0.239 0.263 rg BT /F2 8.0 Tf" in stream
    assert b"(Not included) Tj" in stream


def test_long_frozen_reference_headers_wrap_without_losing_text_or_page_bounds():
    package, documents = fixture(20)
    package["package_number"] = "LAYOUT PREVIEW - NOT ISSUED - " + "WIDE-REFERENCE-" * 30 + "END"
    reader = reader_for(package, documents, True)
    expected = re.sub(r"\s+", "", f"Transmittal: {package['package_number']}")
    for page in reader.pages:
        entries = fragments(page)
        header = "".join(value for value, x, y, _font, size in entries if x == 44 and size == 10 and y > 500)
        assert re.sub(r"\s+", "", header) == expected
        for value, x, y, font, size in entries:
            assert x >= 43.9 and y >= 36
            assert x + _measure_text(value, size, str(font.get("/BaseFont", "")).endswith("Bold")) <= 551.2


def test_neutral_default_and_palette_fallbacks_preserve_the_approved_v2_pdf_bytes():
    package, documents = fixture(4)
    # Updated only for the approved attestation wording; palette selection and
    # invalid palette fallbacks must still leave the default PDF byte-identical.
    expected = "70f2156c8321f7d92534f4fcb17a3f9b3a1c23934f29284f9556db434d17732d"
    assert hashlib.sha256(build_transmittal_pdf(package, documents)).hexdigest() == expected
    for value in ("neutral", None, "unknown", [], {"header": "red"}):
        package["manifest"]["pdf_color_template"] = value
        assert hashlib.sha256(build_transmittal_pdf(package, documents)).hexdigest() == expected


def operations_without_color(reader):
    return [[(list(arguments), operator) for arguments, operator in page.get_contents().operations
             if operator not in (b"rg", b"RG")] for page in reader.pages]


@pytest.mark.parametrize("template", PDF_COLOR_TEMPLATES)
@pytest.mark.parametrize("count", [1, 20, 103])
@pytest.mark.parametrize("sealed", [False, True])
def test_color_templates_change_only_colors_not_geometry_text_order_reference_or_records(template, count, sealed):
    package, documents = fixture(count)
    neutral = reader_for(package, documents, sealed)
    reference = _attestation_reference(package, documents, package["manifest"])
    package["manifest"]["pdf_color_template"] = template
    before = copy.deepcopy((package, documents))
    themed = reader_for(package, documents, sealed)
    assert (package, documents) == before
    assert _attestation_reference(package, documents, package["manifest"]) == reference
    assert operations_without_color(themed) == operations_without_color(neutral)
    assert [page.extract_text() for page in themed.pages] == [page.extract_text() for page in neutral.pages]
    palette = PDF_COLOR_TEMPLATES[template]
    def color_bytes(color):
        return " ".join(f"{channel:.3f}" for channel in color).encode()
    for page in themed.pages:
        stream = page.get_contents().get_data()
        assert color_bytes(palette.header) + b" rg" in stream
        assert color_bytes(palette.line) + b" RG" in stream
    assert color_bytes(palette.accent) + b" rg" in b"".join(page.get_contents().get_data() for page in themed.pages)
    assert color_bytes(palette.paper) + b" rg" in b"".join(page.get_contents().get_data() for page in themed.pages)


@pytest.mark.parametrize("template", PDF_COLOR_TEMPLATES)
@pytest.mark.parametrize("sealed", [False, True])
def test_palette_metadata_does_not_opt_legacy_records_into_new_rendering(template, sealed):
    package, documents = sample_transmittal(4)
    package["manifest"]["pdf_color_template"] = template
    pdf = build_transmittal_pdf(package, documents, electronic_seal_expected=sealed)
    assert pdf == build_legacy(package, documents, electronic_seal_expected=sealed)
    text = " ".join(page.extract_text() for page in PdfReader(io.BytesIO(pdf)).pages)
    assert "System-issued transmittal. Issuer and issue date recorded electronically." not in " ".join(text.split())
    if not sealed:
        assert "not a qualified electronic signature or seal" in text


def test_parallel_template_builds_do_not_leak_colors_between_requests():
    def build(template):
        package, documents = fixture(4)
        package["manifest"]["pdf_color_template"] = template
        return hashlib.sha256(build_transmittal_pdf(package, documents)).hexdigest()

    expected = {template: build(template) for template in PDF_COLOR_TEMPLATES}
    assert len(set(expected.values())) == len(PDF_COLOR_TEMPLATES)
    templates = list(PDF_COLOR_TEMPLATES) * 5
    with ThreadPoolExecutor(max_workers=5) as executor:
        actual = list(executor.map(build, templates))
    assert actual == [expected[template] for template in templates]
