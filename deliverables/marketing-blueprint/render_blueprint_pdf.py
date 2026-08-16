from __future__ import annotations

from copy import copy
from html import escape
from io import BytesIO
from pathlib import Path

from docx import Document
from docx.document import Document as _Document
from docx.table import Table as DocxTable
from docx.text.paragraph import Paragraph as DocxParagraph
from docx.oxml.table import CT_Tbl
from docx.oxml.text.paragraph import CT_P
from docx.oxml.ns import qn
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "EngiCite_Marketing_Blueprint_Final.docx"
OUTPUT = ROOT / "EngiCite_Marketing_Blueprint_Final.pdf"

NAVY = colors.HexColor("#082345")
ORANGE = colors.HexColor("#ED7138")
INK = colors.HexColor("#14263D")
GRAY = colors.HexColor("#5E6B7A")
MID = colors.HexColor("#DDE5EC")
WHITE = colors.white


def register_fonts():
    font_dir = Path("C:/Windows/Fonts")
    fonts = {
        "Calibri": font_dir / "calibri.ttf",
        "Calibri-Bold": font_dir / "calibrib.ttf",
        "Calibri-Italic": font_dir / "calibrii.ttf",
        "Calibri-BoldItalic": font_dir / "calibriz.ttf",
    }
    for name, path in fonts.items():
        pdfmetrics.registerFont(TTFont(name, str(path)))
    pdfmetrics.registerFontFamily(
        "Calibri",
        normal="Calibri",
        bold="Calibri-Bold",
        italic="Calibri-Italic",
        boldItalic="Calibri-BoldItalic",
    )


def iter_block_items(parent):
    if isinstance(parent, _Document):
        parent_elm = parent.element.body
    else:
        parent_elm = parent._tc
    for child in parent_elm.iterchildren():
        if isinstance(child, CT_P):
            yield DocxParagraph(child, parent)
        elif isinstance(child, CT_Tbl):
            yield DocxTable(child, parent)


def get_hex_color(run, fallback="#14263D"):
    try:
        if run.font.color and run.font.color.rgb:
            return f"#{run.font.color.rgb}"
    except Exception:
        pass
    return fallback


def paragraph_alignment(paragraph):
    value = paragraph.alignment
    if value == 1:
        return TA_CENTER
    if value == 2:
        return TA_RIGHT
    return TA_LEFT


def paragraph_markup(paragraph):
    chunks = []
    for run in paragraph.runs:
        text = escape(run.text).replace("\n", "<br/>")
        if not text:
            continue
        attrs = []
        if run.bold:
            text = f"<b>{text}</b>"
        if run.italic:
            text = f"<i>{text}</i>"
        if run.font.size:
            attrs.append(f"size='{run.font.size.pt:.2f}'")
        color = get_hex_color(run, "")
        if color:
            attrs.append(f"color='{color}'")
        if attrs:
            text = f"<font {' '.join(attrs)}>{text}</font>"
        chunks.append(text)
    if not chunks:
        return escape(paragraph.text).replace("\n", "<br/>")
    return "".join(chunks)


def has_page_break(paragraph):
    for br in paragraph._p.findall(".//" + qn("w:br")):
        if br.get(qn("w:type")) == "page":
            return True
    return False


def make_para_style(paragraph, name="Body"):
    style_name = paragraph.style.name if paragraph.style else "Normal"
    size = 11
    color = INK
    leading = 13.75
    before = 0
    after = 6
    font = "Calibri"
    if style_name == "Kicker":
        size, color, leading, after, font = 9, ORANGE, 11, 5, "Calibri-Bold"
    elif style_name == "Heading 1":
        size, color, leading, before, after, font = 16, NAVY, 19, 18, 10, "Calibri-Bold"
    elif style_name == "Heading 2":
        size, color, leading, before, after, font = 13, NAVY, 16, 14, 7, "Calibri-Bold"
    elif style_name == "Heading 3":
        size, color, leading, before, after, font = 12, INK, 14.5, 10, 5, "Calibri-Bold"
    elif style_name == "Figure Caption":
        size, color, leading, before, after, font = 8.5, GRAY, 10.5, 4, 7, "Calibri-Italic"
    elif style_name == "Small Note":
        size, color, leading, after = 8.5, GRAY, 10, 4
    first_run = next((run for run in paragraph.runs if run.text), None)
    if first_run and style_name == "Normal":
        if first_run.font.size:
            size = first_run.font.size.pt
            leading = max(size * 1.18, size + 2)
        if first_run.bold:
            font = "Calibri-BoldItalic" if first_run.italic else "Calibri-Bold"
        elif first_run.italic:
            font = "Calibri-Italic"
        color = colors.HexColor(get_hex_color(first_run))
    pf = paragraph.paragraph_format
    if pf.space_before is not None:
        before = pf.space_before.pt
    if pf.space_after is not None:
        after = pf.space_after.pt
    return ParagraphStyle(
        name=f"{name}-{id(paragraph)}",
        fontName=font,
        fontSize=size,
        textColor=color,
        leading=leading,
        alignment=paragraph_alignment(paragraph),
        spaceBefore=before,
        spaceAfter=after,
        allowWidows=0,
        allowOrphans=0,
    )


def image_flowables(doc, paragraph):
    items = []
    for drawing in paragraph._p.findall(".//" + qn("w:drawing")):
        blip = drawing.find(".//" + qn("a:blip"))
        extent = drawing.find(".//" + qn("wp:extent"))
        if blip is None:
            continue
        rel_id = blip.get(qn("r:embed"))
        part = doc.part.related_parts.get(rel_id)
        if part is None:
            continue
        width = 6.5 * inch
        height = None
        if extent is not None:
            width = int(extent.get("cx")) / 914400 * inch
            height = int(extent.get("cy")) / 914400 * inch
        if width > 6.5 * inch:
            ratio = 6.5 * inch / width
            width *= ratio
            if height:
                height *= ratio
        img = Image(BytesIO(part.blob), width=width, height=height)
        img.hAlign = "CENTER" if paragraph_alignment(paragraph) == TA_CENTER else "LEFT"
        items.append(img)
        after = paragraph.paragraph_format.space_after
        if after and after.pt:
            items.append(Spacer(1, after.pt))
    return items


def cell_fill(cell):
    shd = cell._tc.get_or_add_tcPr().find(qn("w:shd"))
    if shd is not None:
        value = shd.get(qn("w:fill"))
        if value and value not in ("auto", "none"):
            return colors.HexColor(f"#{value}")
    return WHITE


def docx_table_to_reportlab(table):
    grid_cols = table._tbl.tblGrid.findall(qn("w:gridCol"))
    if grid_cols:
        dxa = [int(col.get(qn("w:w"))) for col in grid_cols]
        total = sum(dxa) or 1
        widths = [6.5 * inch * value / total for value in dxa]
    else:
        widths = [6.5 * inch / len(table.columns)] * len(table.columns)
    data = []
    backgrounds = []
    for r_idx, row in enumerate(table.rows):
        out_row = []
        for c_idx, cell in enumerate(row.cells):
            flowables = []
            fill = cell_fill(cell)
            dark = sum((fill.red, fill.green, fill.blue)) < 1.35
            for paragraph in cell.paragraphs:
                if not paragraph.text.strip():
                    continue
                style = make_para_style(paragraph, name=f"Cell-{r_idx}-{c_idx}")
                if dark and all(get_hex_color(run, "") == "" for run in paragraph.runs):
                    style.textColor = WHITE
                style.spaceBefore = min(style.spaceBefore, 4)
                style.spaceAfter = min(style.spaceAfter, 4)
                style.fontSize = min(style.fontSize, 13)
                style.leading = max(style.fontSize * 1.15, style.fontSize + 1.5)
                flowables.append(Paragraph(paragraph_markup(paragraph), style))
            if not flowables:
                flowables.append(Paragraph(" ", ParagraphStyle(name=f"Blank-{r_idx}-{c_idx}", fontName="Calibri", fontSize=8)))
            out_row.append(flowables)
            backgrounds.append(("BACKGROUND", (c_idx, r_idx), (c_idx, r_idx), fill))
        data.append(out_row)
    repeat_rows = 1 if data and all(cell_fill(cell) != WHITE for cell in table.rows[0].cells) else 0
    result = Table(data, colWidths=widths, repeatRows=repeat_rows, hAlign="LEFT", splitByRow=1)
    style_commands = [
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ] + backgrounds
    borders = table._tbl.tblPr.find(qn("w:tblBorders"))
    has_grid = False
    if borders is not None:
        top = borders.find(qn("w:top"))
        has_grid = top is not None and top.get(qn("w:val")) not in (None, "nil", "none")
    if has_grid:
        style_commands.append(("GRID", (0, 0), (-1, -1), 0.45, MID))
    result.setStyle(TableStyle(style_commands))
    return result


def footer_header(canvas, doc):
    canvas.saveState()
    page = canvas.getPageNumber()
    if page > 1:
        canvas.setFont("Calibri-Bold", 8.5)
        canvas.setFillColor(NAVY)
        canvas.drawString(inch, 10.47 * inch, "ENGICITE  /  MARKETING BLUEPRINT")
        canvas.setStrokeColor(MID)
        canvas.setLineWidth(0.5)
        canvas.line(inch, 10.36 * inch, 7.5 * inch, 10.36 * inch)
        canvas.setFont("Calibri", 8)
        canvas.setFillColor(GRAY)
        canvas.drawString(inch, 0.48 * inch, "Confidential working draft  |  13 August 2026")
        canvas.drawRightString(7.5 * inch, 0.48 * inch, f"Page {page}")
    else:
        canvas.setFont("Calibri", 8.5)
        canvas.setFillColor(GRAY)
        canvas.drawCentredString(4.25 * inch, 0.48 * inch, "Internal marketing and sales enablement document")
    canvas.restoreState()


def build_pdf():
    register_fonts()
    source_doc = Document(SOURCE)
    frame = Frame(inch, inch, 6.5 * inch, 9 * inch, leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
    template = PageTemplate(id="EngiCite", frames=[frame], onPage=footer_header)
    pdf = BaseDocTemplate(
        str(OUTPUT),
        pagesize=letter,
        leftMargin=inch,
        rightMargin=inch,
        topMargin=inch,
        bottomMargin=inch,
        title="EngiCite Marketing Blueprint",
        author="EngiCite Team",
        subject="Go-to-market positioning, capability map and live interface tour",
    )
    pdf.addPageTemplates([template])
    story = []
    for block in iter_block_items(source_doc):
        if isinstance(block, DocxParagraph):
            if has_page_break(block):
                story.append(PageBreak())
                continue
            drawings = image_flowables(source_doc, block)
            if drawings:
                story.extend(drawings)
            if block.text.strip():
                story.append(Paragraph(paragraph_markup(block), make_para_style(block)))
        else:
            story.append(docx_table_to_reportlab(block))
            story.append(Spacer(1, 5))
    pdf.build(story)
    return OUTPUT


if __name__ == "__main__":
    print(build_pdf())
