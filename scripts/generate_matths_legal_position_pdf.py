#!/usr/bin/env python3
"""Render the Matths legal position paper from Markdown to a polished PDF."""

from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.colors import HexColor
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    LongTable,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "output" / "legal" / "Matths_서비스_적법성_검토_및_법률적_소명서_v1.0.md"
OUTPUT = ROOT / "output" / "pdf" / "Matths_서비스_적법성_검토_및_법률적_소명서_v1.0.pdf"
FONT_PATH = Path("/System/Library/Fonts/Supplemental/AppleGothic.ttf")

PAGE_W, PAGE_H = A4
LEFT = 22 * mm
RIGHT = 20 * mm
TOP = 22 * mm
BOTTOM = 19 * mm
CONTENT_W = PAGE_W - LEFT - RIGHT

FONT = "AppleGothic"
NAVY = HexColor("#13263D")
NAVY_2 = HexColor("#1B3657")
BLUE = HexColor("#245AA5")
BLUE_PALE = HexColor("#EAF1FA")
GOLD = HexColor("#C9A15A")
INK = HexColor("#172132")
MUTED = HexColor("#657083")
LINE = HexColor("#D9E0E8")
PAPER = HexColor("#F6F8FA")
WHITE = colors.white


def register_font() -> None:
    if not FONT_PATH.exists():
        raise FileNotFoundError(f"Korean font not found: {FONT_PATH}")
    pdfmetrics.registerFont(TTFont(FONT, str(FONT_PATH)))
    pdfmetrics.registerFontFamily(
        FONT, normal=FONT, bold=FONT, italic=FONT, boldItalic=FONT
    )


def inline_markup(text: str) -> str:
    escaped = html.escape(text, quote=True)
    escaped = re.sub(
        r"\[([^\]]+)\]\((https?://[^)]+)\)",
        r'<link href="\2" color="#245AA5"><u>\1</u></link>',
        escaped,
    )
    escaped = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", escaped)
    escaped = re.sub(
        r"`([^`]+)`",
        rf'<font name="{FONT}" color="#245AA5">\1</font>',
        escaped,
    )
    escaped = re.sub(r"\[\^(\d+)\]", r"<super>[\1]</super>", escaped)
    return escaped


def styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    return {
        "cover_kicker": ParagraphStyle(
            "CoverKicker",
            parent=base["Normal"],
            fontName=FONT,
            fontSize=10,
            leading=14,
            textColor=GOLD,
            alignment=TA_CENTER,
            tracking=1.6,
            spaceAfter=10,
        ),
        "cover_title": ParagraphStyle(
            "CoverTitle",
            parent=base["Title"],
            fontName=FONT,
            fontSize=27,
            leading=39,
            textColor=WHITE,
            alignment=TA_CENTER,
            spaceAfter=14,
        ),
        "cover_sub": ParagraphStyle(
            "CoverSub",
            parent=base["Normal"],
            fontName=FONT,
            fontSize=11,
            leading=18,
            textColor=HexColor("#D8E2EF"),
            alignment=TA_CENTER,
        ),
        "cover_meta": ParagraphStyle(
            "CoverMeta",
            parent=base["Normal"],
            fontName=FONT,
            fontSize=8.6,
            leading=15,
            textColor=HexColor("#BCC9D9"),
            alignment=TA_CENTER,
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=base["Heading1"],
            fontName=FONT,
            fontSize=17,
            leading=24,
            textColor=NAVY,
            spaceBefore=10,
            spaceAfter=9,
            keepWithNext=True,
        ),
        "h3": ParagraphStyle(
            "H3",
            parent=base["Heading2"],
            fontName=FONT,
            fontSize=11.8,
            leading=18,
            textColor=BLUE,
            spaceBefore=9,
            spaceAfter=5,
            keepWithNext=True,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName=FONT,
            fontSize=9.25,
            leading=15.4,
            textColor=INK,
            alignment=TA_LEFT,
            wordWrap="CJK",
            spaceAfter=6.5,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["BodyText"],
            fontName=FONT,
            fontSize=9.1,
            leading=14.8,
            textColor=INK,
            leftIndent=12,
            firstLineIndent=-8,
            bulletIndent=3,
            wordWrap="CJK",
            spaceAfter=3.8,
        ),
        "numbered": ParagraphStyle(
            "Numbered",
            parent=base["BodyText"],
            fontName=FONT,
            fontSize=9.1,
            leading=14.8,
            textColor=INK,
            leftIndent=16,
            firstLineIndent=-13,
            wordWrap="CJK",
            spaceAfter=4.5,
        ),
        "callout": ParagraphStyle(
            "Callout",
            parent=base["BodyText"],
            fontName=FONT,
            fontSize=9.4,
            leading=16,
            textColor=NAVY,
            leftIndent=10,
            rightIndent=8,
            wordWrap="CJK",
        ),
        "table_head": ParagraphStyle(
            "TableHead",
            parent=base["Normal"],
            fontName=FONT,
            fontSize=8.2,
            leading=12,
            textColor=WHITE,
            alignment=TA_LEFT,
            wordWrap="CJK",
        ),
        "table_body": ParagraphStyle(
            "TableBody",
            parent=base["Normal"],
            fontName=FONT,
            fontSize=7.9,
            leading=12.2,
            textColor=INK,
            alignment=TA_LEFT,
            wordWrap="CJK",
        ),
        "footnote": ParagraphStyle(
            "Footnote",
            parent=base["BodyText"],
            fontName=FONT,
            fontSize=7.6,
            leading=12.4,
            textColor=MUTED,
            leftIndent=11,
            firstLineIndent=-11,
            wordWrap="CJK",
            spaceAfter=4,
        ),
    }


def draw_cover(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    canvas.setFillColor(NAVY_2)
    canvas.circle(PAGE_W * 0.12, PAGE_H * 0.88, 98 * mm, stroke=0, fill=1)
    canvas.setFillColor(HexColor("#203F63"))
    canvas.circle(PAGE_W * 0.92, PAGE_H * 0.11, 73 * mm, stroke=0, fill=1)
    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(1)
    canvas.line(46 * mm, PAGE_H - 59 * mm, PAGE_W - 46 * mm, PAGE_H - 59 * mm)
    canvas.setFillColor(GOLD)
    canvas.circle(PAGE_W / 2, PAGE_H - 59 * mm, 2.2 * mm, stroke=0, fill=1)
    canvas.setFillColor(HexColor("#AAB9CB"))
    canvas.setFont(FONT, 7.2)
    canvas.drawCentredString(PAGE_W / 2, 18 * mm, "MATTHS  •  LEGAL POSITION PAPER  •  REPUBLIC OF KOREA")
    canvas.restoreState()


def draw_body(canvas, doc) -> None:
    canvas.saveState()
    canvas.setFillColor(WHITE)
    canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.6)
    canvas.line(LEFT, PAGE_H - 15 * mm, PAGE_W - RIGHT, PAGE_H - 15 * mm)
    canvas.setFont(FONT, 7.2)
    canvas.setFillColor(MUTED)
    canvas.drawString(LEFT, PAGE_H - 11.8 * mm, "MATTHS 서비스 적법성 검토 및 법률적 소명서")
    canvas.drawRightString(PAGE_W - RIGHT, PAGE_H - 11.8 * mm, "검토 기준일 2026. 7. 30.")
    canvas.line(LEFT, 12.5 * mm, PAGE_W - RIGHT, 12.5 * mm)
    canvas.setFillColor(NAVY)
    canvas.drawString(LEFT, 8.5 * mm, "MATTHS")
    canvas.setFillColor(MUTED)
    canvas.drawRightString(PAGE_W - RIGHT, 8.5 * mm, f"{doc.page - 1}")
    canvas.restoreState()


class LegalDocTemplate(BaseDocTemplate):
    def __init__(self, filename: str):
        super().__init__(
            filename,
            pagesize=A4,
            leftMargin=LEFT,
            rightMargin=RIGHT,
            topMargin=TOP,
            bottomMargin=BOTTOM,
            title="MATTHS 서비스 적법성 검토 및 법률적 소명서",
            author="Matths",
            subject="대한민국 법령에 따른 Matths 서비스 구조의 적법성 검토",
        )
        cover_frame = Frame(
            LEFT,
            BOTTOM,
            CONTENT_W,
            PAGE_H - TOP - BOTTOM,
            id="cover_frame",
            showBoundary=0,
        )
        body_frame = Frame(
            LEFT,
            BOTTOM,
            CONTENT_W,
            PAGE_H - TOP - BOTTOM,
            id="body_frame",
            showBoundary=0,
        )
        self.addPageTemplates(
            [
                PageTemplate(id="cover", frames=[cover_frame], onPage=draw_cover),
                PageTemplate(id="body", frames=[body_frame], onPage=draw_body),
            ]
        )


def parse_table(lines: list[str], start: int, style_map: dict[str, ParagraphStyle]):
    rows: list[list[str]] = []
    idx = start
    while idx < len(lines) and lines[idx].strip().startswith("|"):
        raw = lines[idx].strip().strip("|")
        cells = [cell.strip() for cell in raw.split("|")]
        if not all(re.fullmatch(r":?-{3,}:?", cell) for cell in cells):
            rows.append(cells)
        idx += 1
    if not rows:
        return None, idx
    ncols = max(len(row) for row in rows)
    rows = [row + [""] * (ncols - len(row)) for row in rows]
    table_data = []
    for r, row in enumerate(rows):
        style_name = "table_head" if r == 0 else "table_body"
        table_data.append(
            [Paragraph(inline_markup(cell), style_map[style_name]) for cell in row]
        )
    if ncols == 2:
        col_widths = [CONTENT_W * 0.31, CONTENT_W * 0.69]
    elif ncols == 3:
        col_widths = [CONTENT_W * 0.35, CONTENT_W * 0.38, CONTENT_W * 0.27]
    else:
        col_widths = [CONTENT_W / ncols] * ncols
    table = LongTable(
        table_data,
        colWidths=col_widths,
        repeatRows=1,
        hAlign="LEFT",
    )
    commands = [
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    for row_no in range(1, len(table_data)):
        commands.append(
            (
                "BACKGROUND",
                (0, row_no),
                (-1, row_no),
                WHITE if row_no % 2 else PAPER,
            )
        )
    table.setStyle(TableStyle(commands))
    return table, idx


def make_callout(text: str, style_map: dict[str, ParagraphStyle]) -> Table:
    callout_markup = "<br/>".join(
        inline_markup(part) if part else "<br/>" for part in text.split("\n")
    )
    para = Paragraph(callout_markup, style_map["callout"])
    callout = Table([[para]], colWidths=[CONTENT_W])
    callout.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), BLUE_PALE),
                ("BOX", (0, 0), (-1, -1), 0.6, HexColor("#BFD0E6")),
                ("LINEBEFORE", (0, 0), (0, -1), 3.2, BLUE),
                ("LEFTPADDING", (0, 0), (-1, -1), 12),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ]
        )
    )
    return callout


def markdown_story(text: str, style_map: dict[str, ParagraphStyle]):
    lines = text.splitlines()
    first_section = next(i for i, line in enumerate(lines) if line.startswith("## "))
    lines = lines[first_section:]
    story = []
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        if not stripped or stripped == "---":
            i += 1
            continue
        if stripped.startswith("## "):
            title = stripped[3:].strip()
            numbered_section = re.match(r"^(\d+)\.", title)
            section_no = numbered_section.group(1) if numbered_section else "근거"
            label = Table(
                [[Paragraph(section_no, style_map["table_head"])]],
                colWidths=[12 * mm],
                rowHeights=[7 * mm],
            )
            label.setStyle(
                TableStyle(
                    [
                        ("BACKGROUND", (0, 0), (-1, -1), BLUE),
                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                        ("BOX", (0, 0), (-1, -1), 0, BLUE),
                    ]
                )
            )
            heading = Paragraph(inline_markup(title), style_map["h2"])
            story.extend(
                [
                    Spacer(1, 4),
                    KeepTogether(
                        [
                            Table(
                                [[label, heading]],
                                colWidths=[15 * mm, CONTENT_W - 15 * mm],
                                style=TableStyle(
                                    [
                                        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                                        ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                        ("RIGHTPADDING", (0, 0), (0, -1), 7),
                                        ("RIGHTPADDING", (1, 0), (1, -1), 0),
                                        ("TOPPADDING", (0, 0), (-1, -1), 0),
                                        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
                                    ]
                                ),
                            ),
                            Spacer(1, 2),
                        ]
                    ),
                ]
            )
            i += 1
            continue
        if stripped.startswith("### "):
            story.append(Paragraph(inline_markup(stripped[4:].strip()), style_map["h3"]))
            i += 1
            continue
        if stripped.startswith("|"):
            table, i = parse_table(lines, i, style_map)
            if table:
                story.extend([Spacer(1, 2), table, Spacer(1, 7)])
            continue
        if stripped.startswith(">"):
            parts = []
            while i < len(lines) and lines[i].strip().startswith(">"):
                parts.append(lines[i].strip()[1:].strip())
                i += 1
            story.extend([make_callout("\n".join(parts), style_map), Spacer(1, 8)])
            continue
        if stripped.startswith("- "):
            while i < len(lines) and lines[i].strip().startswith("- "):
                body = lines[i].strip()[2:].strip()
                story.append(
                    Paragraph(
                        "•&nbsp;&nbsp;" + inline_markup(body),
                        style_map["bullet"],
                    )
                )
                i += 1
            story.append(Spacer(1, 3))
            continue
        num_match = re.match(r"^(\d+)\.\s+(.*)$", stripped)
        if num_match:
            while i < len(lines):
                current = re.match(r"^(\d+)\.\s+(.*)$", lines[i].strip())
                if not current:
                    break
                story.append(
                    Paragraph(
                        f"<b>{current.group(1)}.</b>&nbsp;&nbsp;"
                        + inline_markup(current.group(2)),
                        style_map["numbered"],
                    )
                )
                i += 1
            story.append(Spacer(1, 2))
            continue
        if re.match(r"^\[\^\d+\]:", stripped):
            ref = re.sub(r"^\[\^(\d+)\]:", r"[\1]", stripped)
            story.append(Paragraph(inline_markup(ref), style_map["footnote"]))
            i += 1
            continue

        paragraph_lines = [stripped]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if (
                not nxt
                or nxt == "---"
                or nxt.startswith("#")
                or nxt.startswith("|")
                or nxt.startswith(">")
                or nxt.startswith("- ")
                or re.match(r"^\d+\.\s+", nxt)
                or re.match(r"^\[\^\d+\]:", nxt)
            ):
                break
            paragraph_lines.append(nxt)
            i += 1
        story.append(
            Paragraph(inline_markup(" ".join(paragraph_lines)), style_map["body"])
        )
    return story


def build() -> None:
    register_font()
    style_map = styles()
    markdown = SOURCE.read_text(encoding="utf-8")
    doc = LegalDocTemplate(str(OUTPUT))

    story = [
        Spacer(1, 54 * mm),
        Paragraph("LEGAL POSITION PAPER", style_map["cover_kicker"]),
        Paragraph("MATTHS 서비스 적법성 검토<br/>및 법률적 소명서", style_map["cover_title"]),
        Spacer(1, 5 * mm),
        Paragraph(
            "30일 수학 학습 서비스 · GOAT Arena · 성취형 페이백",
            style_map["cover_sub"],
        ),
        Spacer(1, 28 * mm),
        Paragraph(
            "검토 기준일&nbsp;&nbsp;2026년 7월 30일<br/>"
            "준거법&nbsp;&nbsp;대한민국 법령<br/>"
            "검토 대상&nbsp;&nbsp;Matths 최종 정책 설계",
            style_map["cover_meta"],
        ),
        NextPageTemplate("body"),
        PageBreak(),
    ]
    story.extend(markdown_story(markdown, style_map))
    doc.build(story)
    print(OUTPUT)


if __name__ == "__main__":
    build()
