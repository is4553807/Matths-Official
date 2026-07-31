#!/usr/bin/env python3
"""Build the GOAT Arena rulebook directly from the authoritative logic docs.

Business constants and match rules must not be duplicated in this generator.
Edit ``docs/logic`` first; the next generated PDF will then reflect that source.
"""

from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    KeepTogether,
    ListFlowable,
    ListItem,
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
)


ROOT = Path(__file__).resolve().parents[1]
LOGIC_DIR = ROOT / "docs" / "logic"
OUTPUT = ROOT / "output" / "pdf" / "Matths_GOAT_Arena_사용자_룰북_v2.0.pdf"
FONT_PATH = Path("/System/Library/Fonts/Supplemental/AppleGothic.ttf")
FONT_NAME = "AppleGothic"
SOURCES = (
    "02_GOAT_ARENA_COMMON_MATCH_RULES.md",
    "03_SUB_DIVISION_RANKING_SYSTEM_PAYBACK.md",
    "04_MAIN_DIVISION_RANKING_SYSTEM.md",
    "08_FINAL_RANKING_SYSTEM.md",
    "10_RULE_EVALUATION_AND_CONTENT_STRATEGY.md",
)


def register_font() -> None:
    if not FONT_PATH.exists():
        raise FileNotFoundError(f"Korean font not found: {FONT_PATH}")
    pdfmetrics.registerFont(TTFont(FONT_NAME, str(FONT_PATH)))


def inline_markup(value: str) -> str:
    """Escape Markdown text and preserve only safe inline emphasis."""
    text = html.escape(value.strip())
    text = re.sub(r"`([^`]+)`", r"<font color='#3157f6'>\1</font>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    return text


def make_styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    ink = colors.HexColor("#172338")
    muted = colors.HexColor("#66748A")
    blue = colors.HexColor("#3157F6")
    return {
        "cover": ParagraphStyle(
            "Cover",
            parent=base["Title"],
            fontName=FONT_NAME,
            fontSize=31,
            leading=40,
            textColor=blue,
            alignment=TA_CENTER,
            spaceAfter=18,
        ),
        "cover_sub": ParagraphStyle(
            "CoverSub",
            parent=base["BodyText"],
            fontName=FONT_NAME,
            fontSize=11,
            leading=18,
            textColor=muted,
            alignment=TA_CENTER,
        ),
        "h1": ParagraphStyle(
            "H1",
            parent=base["Heading1"],
            fontName=FONT_NAME,
            fontSize=22,
            leading=30,
            textColor=ink,
            spaceBefore=8,
            spaceAfter=14,
        ),
        "h2": ParagraphStyle(
            "H2",
            parent=base["Heading2"],
            fontName=FONT_NAME,
            fontSize=16,
            leading=23,
            textColor=blue,
            spaceBefore=16,
            spaceAfter=9,
        ),
        "h3": ParagraphStyle(
            "H3",
            parent=base["Heading3"],
            fontName=FONT_NAME,
            fontSize=12,
            leading=18,
            textColor=ink,
            spaceBefore=12,
            spaceAfter=7,
        ),
        "body": ParagraphStyle(
            "Body",
            parent=base["BodyText"],
            fontName=FONT_NAME,
            fontSize=9.2,
            leading=15,
            textColor=ink,
            spaceAfter=7,
            wordWrap="CJK",
        ),
        "quote": ParagraphStyle(
            "Quote",
            parent=base["BodyText"],
            fontName=FONT_NAME,
            fontSize=8.8,
            leading=14,
            leftIndent=12,
            borderColor=blue,
            borderWidth=0,
            borderPadding=8,
            backColor=colors.HexColor("#EEF2FF"),
            textColor=muted,
            spaceAfter=8,
        ),
        "code": ParagraphStyle(
            "Code",
            parent=base["Code"],
            fontName=FONT_NAME,
            fontSize=7.8,
            leading=12,
            leftIndent=8,
            rightIndent=8,
            borderPadding=8,
            backColor=colors.HexColor("#F2F4F8"),
            textColor=colors.HexColor("#26314C"),
            spaceBefore=4,
            spaceAfter=9,
        ),
        "bullet": ParagraphStyle(
            "Bullet",
            parent=base["BodyText"],
            fontName=FONT_NAME,
            fontSize=8.9,
            leading=14,
            textColor=ink,
            wordWrap="CJK",
        ),
        "source": ParagraphStyle(
            "Source",
            parent=base["BodyText"],
            fontName=FONT_NAME,
            fontSize=7.5,
            leading=11,
            textColor=muted,
            spaceAfter=10,
        ),
    }


def flush_paragraph(buffer: list[str], story: list, styles: dict) -> None:
    if not buffer:
        return
    story.append(Paragraph(inline_markup(" ".join(buffer)), styles["body"]))
    buffer.clear()


def markdown_story(source: Path, styles: dict) -> list:
    lines = source.read_text(encoding="utf-8").splitlines()
    story: list = [
        Paragraph(inline_markup(source.stem), styles["source"]),
    ]
    paragraph: list[str] = []
    bullets: list[str] = []
    code: list[str] = []
    in_code = False

    def flush_bullets() -> None:
        if not bullets:
            return
        items = [
            ListItem(Paragraph(inline_markup(item), styles["bullet"]))
            for item in bullets
        ]
        story.append(
            ListFlowable(
                items,
                bulletType="bullet",
                start="circle",
                leftIndent=16,
                bulletFontName=FONT_NAME,
                bulletFontSize=6,
                spaceAfter=7,
            )
        )
        bullets.clear()

    for raw in lines:
        line = raw.rstrip()
        if line.startswith("```"):
            flush_paragraph(paragraph, story, styles)
            flush_bullets()
            if in_code:
                story.append(Preformatted("\n".join(code), styles["code"]))
                code.clear()
            in_code = not in_code
            continue
        if in_code:
            code.append(line)
            continue
        if not line or line == "---":
            flush_paragraph(paragraph, story, styles)
            flush_bullets()
            continue
        heading = re.match(r"^(#{1,3})\s+(.+)$", line)
        if heading:
            flush_paragraph(paragraph, story, styles)
            flush_bullets()
            level = len(heading.group(1))
            story.append(Paragraph(inline_markup(heading.group(2)), styles[f"h{level}"]))
            continue
        if line.startswith("- "):
            flush_paragraph(paragraph, story, styles)
            bullets.append(line[2:])
            continue
        flush_bullets()
        if line.startswith("> "):
            flush_paragraph(paragraph, story, styles)
            story.append(Paragraph(inline_markup(line[2:]), styles["quote"]))
            continue
        if line.startswith("|"):
            flush_paragraph(paragraph, story, styles)
            story.append(Preformatted(line, styles["code"]))
            continue
        paragraph.append(line)

    flush_paragraph(paragraph, story, styles)
    flush_bullets()
    if code:
        story.append(Preformatted("\n".join(code), styles["code"]))
    return story


def footer(canvas, document) -> None:
    canvas.saveState()
    canvas.setFont(FONT_NAME, 7)
    canvas.setFillColor(colors.HexColor("#7B8498"))
    canvas.drawString(18 * mm, 11 * mm, "docs/logic 권위 원문 기반")
    canvas.drawRightString(A4[0] - 18 * mm, 11 * mm, str(document.page))
    canvas.restoreState()


def build_pdf() -> Path:
    register_font()
    missing = [name for name in SOURCES if not (LOGIC_DIR / name).exists()]
    if missing:
        raise FileNotFoundError(f"Missing authoritative docs: {', '.join(missing)}")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    styles = make_styles()
    document = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=19 * mm,
        bottomMargin=18 * mm,
        title="Matths GOAT Arena 사용자 룰북",
        author="Matths",
        subject="docs/logic 권위 원문에서 생성한 GOAT Arena 규칙",
    )
    story: list = [
        Spacer(1, 58 * mm),
        KeepTogether(
            [
                Paragraph("GOAT ARENA", styles["cover"]),
                Paragraph("사용자 룰북 · 권위 문서 동기화본", styles["cover_sub"]),
                Spacer(1, 8 * mm),
                Paragraph(
                    "이 PDF는 규칙을 별도로 복제하지 않고 docs/logic 원문에서 생성됩니다.",
                    styles["cover_sub"],
                ),
            ]
        ),
        PageBreak(),
    ]
    for index, filename in enumerate(SOURCES):
        if index:
            story.append(PageBreak())
        story.extend(markdown_story(LOGIC_DIR / filename, styles))
    document.build(story, onFirstPage=footer, onLaterPages=footer)
    return OUTPUT


if __name__ == "__main__":
    print(build_pdf())
