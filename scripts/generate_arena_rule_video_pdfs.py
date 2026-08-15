#!/usr/bin/env python3
"""Create user-facing GOAT Arena rule-video script PDFs.

The documents intentionally translate the current product rules into narration
and motion directions. They must not disclose implementation or anti-abuse
signals that users do not need to know.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable, Sequence

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
    Flowable,
    Frame,
    KeepTogether,
    PageBreak,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "output" / "pdf"
FONT_PATH = Path("/System/Library/Fonts/Supplemental/AppleGothic.ttf")

NAVY = HexColor("#101827")
INK = HexColor("#142033")
MUTED = HexColor("#667085")
LINE = HexColor("#DCE3EF")
PALE = HexColor("#F2F6FC")
PURPLE = HexColor("#7657FF")
CYAN = HexColor("#18BCEB")
ORANGE = HexColor("#F59E0B")
GREEN = HexColor("#19A974")
RED = HexColor("#D64545")
WHITE = colors.white


def register_fonts() -> None:
    if "MatthsKorean" not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont("MatthsKorean", str(FONT_PATH)))


def p(text: str, style: ParagraphStyle) -> Paragraph:
    return Paragraph(text.replace("\n", "<br/>"), style)


@dataclass(frozen=True)
class Episode:
    number: str
    title: str
    runtime: str
    purpose: str
    trigger: str
    narration: str
    motion: str
    key_rule: str


@dataclass(frozen=True)
class Playlist:
    code: str
    korean_title: str
    english_title: str
    accent: colors.Color
    tagline: str
    core_runtime: str
    core_promise: str
    core_segments: tuple[tuple[str, str, str], ...]
    detail_episodes: tuple[Episode, ...]
    scope_note: str


class AccentBand(Flowable):
    def __init__(self, color: colors.Color, height: float = 7 * mm):
        super().__init__()
        self.color = color
        self.width = 0
        self.height = height

    def wrap(self, avail_width, avail_height):  # noqa: ANN001, D102
        self.width = avail_width
        return avail_width, self.height

    def draw(self):  # noqa: D102
        self.canv.saveState()
        self.canv.setFillColor(self.color)
        self.canv.roundRect(0, 0, self.width, self.height, self.height / 2, fill=1, stroke=0)
        self.canv.restoreState()


def styles_for(accent: colors.Color) -> dict[str, ParagraphStyle]:
    font = "MatthsKorean"
    base = getSampleStyleSheet()["BodyText"]
    return {
        "eyebrow": ParagraphStyle(
            "eyebrow",
            parent=base,
            fontName=font,
            fontSize=8.5,
            leading=12,
            textColor=accent,
            spaceAfter=4,
        ),
        "cover_title": ParagraphStyle(
            "cover_title",
            parent=base,
            fontName=font,
            fontSize=30,
            leading=38,
            textColor=WHITE,
            alignment=TA_LEFT,
            spaceAfter=10,
        ),
        "cover_body": ParagraphStyle(
            "cover_body",
            parent=base,
            fontName=font,
            fontSize=11.5,
            leading=18,
            textColor=HexColor("#D9E5F7"),
        ),
        "h1": ParagraphStyle(
            "h1",
            parent=base,
            fontName=font,
            fontSize=22,
            leading=30,
            textColor=INK,
            spaceAfter=12,
        ),
        "h2": ParagraphStyle(
            "h2",
            parent=base,
            fontName=font,
            fontSize=15.5,
            leading=22,
            textColor=INK,
            spaceBefore=2,
            spaceAfter=8,
        ),
        "h3": ParagraphStyle(
            "h3",
            parent=base,
            fontName=font,
            fontSize=12.2,
            leading=18,
            textColor=INK,
            spaceAfter=5,
        ),
        "body": ParagraphStyle(
            "body",
            parent=base,
            fontName=font,
            fontSize=9.7,
            leading=15.2,
            textColor=INK,
        ),
        "small": ParagraphStyle(
            "small",
            parent=base,
            fontName=font,
            fontSize=8.3,
            leading=12.6,
            textColor=MUTED,
        ),
        "table_head": ParagraphStyle(
            "table_head",
            parent=base,
            fontName=font,
            fontSize=8,
            leading=11,
            textColor=WHITE,
            alignment=TA_CENTER,
        ),
        "table_cell": ParagraphStyle(
            "table_cell",
            parent=base,
            fontName=font,
            fontSize=8.1,
            leading=12.4,
            textColor=INK,
        ),
        "time": ParagraphStyle(
            "time",
            parent=base,
            fontName=font,
            fontSize=8.2,
            leading=12,
            textColor=accent,
            alignment=TA_CENTER,
        ),
        "script": ParagraphStyle(
            "script",
            parent=base,
            fontName=font,
            fontSize=9.3,
            leading=15.2,
            textColor=INK,
        ),
        "motion": ParagraphStyle(
            "motion",
            parent=base,
            fontName=font,
            fontSize=8.45,
            leading=13.2,
            textColor=HexColor("#36506E"),
        ),
        "callout": ParagraphStyle(
            "callout",
            parent=base,
            fontName=font,
            fontSize=10.2,
            leading=16,
            textColor=INK,
        ),
        "key": ParagraphStyle(
            "key",
            parent=base,
            fontName=font,
            fontSize=8.8,
            leading=13.5,
            textColor=INK,
        ),
    }


def header_footer(canvas, doc):  # noqa: ANN001, D103
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.35)
    canvas.line(18 * mm, A4[1] - 15 * mm, A4[0] - 18 * mm, A4[1] - 15 * mm)
    canvas.setFont("MatthsKorean", 8)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(A4[0] - 18 * mm, A4[1] - 11 * mm, "MATTHS · GOAT ARENA RULE VIDEO PRODUCTION")
    canvas.drawString(18 * mm, 10 * mm, "사용자 공개용 영상 대본 · 정책 변경 시 화면의 최신 규정을 우선합니다.")
    canvas.drawRightString(A4[0] - 18 * mm, 10 * mm, f"{doc.page}")
    canvas.restoreState()


def cover_page(playlist: Playlist, styles: dict[str, ParagraphStyle]) -> list:
    cover_table = Table(
        [[
            [
                Spacer(1, 20 * mm),
                p(f"PLAYLIST {playlist.code} · USER GUIDE", styles["eyebrow"]),
                p(f"GOAT Arena\n{playlist.korean_title}", styles["cover_title"]),
                AccentBand(playlist.accent, 3.3 * mm),
                Spacer(1, 8 * mm),
                p(playlist.tagline, styles["cover_body"]),
                Spacer(1, 9 * mm),
                p(f"메인 영상 {playlist.core_runtime} · 세부 {len(playlist.detail_episodes)}편 모두 40초 이내", styles["cover_body"]),
            ]
        ]],
        colWidths=[174 * mm],
        rowHeights=[178 * mm],
    )
    cover_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), NAVY),
        ("BOX", (0, 0), (-1, -1), 0, NAVY),
        ("LEFTPADDING", (0, 0), (-1, -1), 17 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 17 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    return [cover_table, PageBreak()]


def playlist_map(playlist: Playlist, styles: dict[str, ParagraphStyle]) -> list:
    story = [
        p("1. 이 플레이리스트가 답하는 질문", styles["h1"]),
        Table(
            [[p("WHY THIS PLAYLIST", styles["eyebrow"]), p(playlist.core_promise, styles["callout"])]],
            colWidths=[50 * mm, 124 * mm],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), PALE),
                ("BOX", (0, 0), (-1, -1), 0.7, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 8 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 6 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6 * mm),
            ]),
        ),
        Spacer(1, 8 * mm),
        p("2. 최종 편성", styles["h1"]),
    ]
    data = [[
        p("No.", styles["table_head"]),
        p("영상", styles["table_head"]),
        p("길이", styles["table_head"]),
        p("이 영상에서 얻는 것", styles["table_head"]),
        p("추천 노출", styles["table_head"]),
    ]]
    data.append([
        p("01", styles["table_cell"]),
        p(f"GOAT Arena {playlist.korean_title}", styles["table_cell"]),
        p(playlist.core_runtime, styles["table_cell"]),
        p(playlist.core_promise, styles["table_cell"]),
        p("첫 진입", styles["table_cell"]),
    ])
    for episode in playlist.detail_episodes:
        data.append([
            p(episode.number, styles["table_cell"]),
            p(episode.title, styles["table_cell"]),
            p(episode.runtime, styles["table_cell"]),
            p(episode.purpose, styles["table_cell"]),
            p(episode.trigger, styles["table_cell"]),
        ])
    table = Table(data, colWidths=[13 * mm, 45 * mm, 20 * mm, 59 * mm, 37 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("BACKGROUND", (0, 1), (-1, -1), WHITE),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3.2 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3.2 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 3.4 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.4 * mm),
    ]))
    story += [table, Spacer(1, 8 * mm), p("3. 톤과 편집 원칙", styles["h2"])]
    editing = (
        "스포츠 입문 가이드처럼 <b>질문 → 바로 답 → 실제 화면 → 한 줄 정리</b>의 리듬을 씁니다. "
        "순위 카드·예치 숫자·타이머가 움직이며 설명하고, 약관을 읽듯 말하지 않습니다. "
        "세부편은 한 상황만 다루므로, 시청자는 필요한 순간에만 바로 찾아볼 수 있습니다."
    )
    story.append(p(editing, styles["body"]))
    story.append(PageBreak())
    return story


def core_script_pages(playlist: Playlist, styles: dict[str, ParagraphStyle]) -> list:
    story = [
        p("메인 01 · 약 3분", styles["eyebrow"]),
        p(f"GOAT Arena {playlist.korean_title} — 메인 영상 대본", styles["h1"]),
        Table(
            [[p("영상 약속", styles["eyebrow"]), p(playlist.core_promise, styles["callout"])]],
            colWidths=[34 * mm, 140 * mm],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), PALE),
                ("LINEBEFORE", (1, 0), (1, 0), 3, playlist.accent),
                ("BOX", (0, 0), (-1, -1), 0.7, LINE),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 5 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5 * mm),
            ]),
        ),
        Spacer(1, 6 * mm),
        p("나레이션은 약 3분 분량을 목표로 작성했습니다. 대괄호 문구는 화면·모션 지시이며 읽지 않습니다.", styles["small"]),
        Spacer(1, 4 * mm),
    ]
    for index, (timecode, narration, motion) in enumerate(playlist.core_segments):
        row = Table(
            [[p(timecode, styles["time"]), p(narration, styles["script"]), p(motion, styles["motion"])]],
            colWidths=[26 * mm, 89 * mm, 59 * mm],
        )
        row.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (0, 0), PALE),
            ("BACKGROUND", (1, 0), (2, 0), WHITE),
            ("BOX", (0, 0), (-1, -1), 0.6, LINE),
            ("LINEBEFORE", (1, 0), (1, 0), 1.4, playlist.accent),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4.2 * mm),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4.2 * mm),
            ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
        ]))
        story.append(row)
        story.append(Spacer(1, 3.2 * mm))
        if index == 3:
            story.append(PageBreak())
            story += [
                p("메인 01 · 약 3분 (계속)", styles["eyebrow"]),
                p("핵심 흐름을 한 번 더 밀어주는 후반부", styles["h2"]),
            ]
    story.append(PageBreak())
    return story


def episode_card(episode: Episode, styles: dict[str, ParagraphStyle], accent: colors.Color) -> Table:
    header = p(
        f"<b>{episode.title}</b><br/><font size=\"8.1\">한 줄 목적 · {episode.purpose}</font>",
        styles["body"],
    )
    card = Table(
        [
            [p(f"{episode.number}<br/>{episode.runtime}", styles["time"]), header],
            [p("나레이션", styles["eyebrow"]), p(episode.narration, styles["script"])],
            [p("화면·모션", styles["eyebrow"]), p(episode.motion, styles["motion"])],
            [p("시청 후<br/>기억할 것", styles["eyebrow"]), p(episode.key_rule, styles["key"])],
        ],
        colWidths=[32 * mm, 142 * mm],
    )
    card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PALE),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("LINEBEFORE", (0, 0), (0, -1), 3.4, accent),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 3.8 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3.8 * mm),
    ]))
    return card


def detail_pages(playlist: Playlist, styles: dict[str, ParagraphStyle]) -> list:
    story: list = [
        p("세부 규칙편", styles["eyebrow"]),
        p("한 영상, 한 상황", styles["h1"]),
        p("각 영상은 40초를 넘지 않도록 구성했습니다. 긴 정산표는 화면 카드로 보여주고, 나레이션은 사용자가 바로 행동할 수 있는 문장만 남겼습니다.", styles["body"]),
        Spacer(1, 5 * mm),
    ]
    for index, episode in enumerate(playlist.detail_episodes, start=1):
        story.append(KeepTogether([episode_card(episode, styles, playlist.accent), Spacer(1, 5 * mm)]))
        if index % 2 == 0 and index != len(playlist.detail_episodes):
            story.append(PageBreak())
            story += [
                p("세부 규칙편 (계속)", styles["eyebrow"]),
                p("다음 상황을 바로 확인하세요", styles["h2"]),
            ]
    story.append(PageBreak())
    return story


def production_notes(playlist: Playlist, styles: dict[str, ParagraphStyle]) -> list:
    notes = [
        p("제작 체크 · 중복을 줄이는 편집 규칙", styles["h1"]),
        p(playlist.scope_note, styles["callout"]),
        Spacer(1, 8 * mm),
        p("공통 편집 규칙", styles["h2"]),
    ]
    rows = [
        [p("표현", styles["table_head"]), p("사용 기준", styles["table_head"])],
        [p("닉네임", styles["table_cell"]), p("매치가 성립한 뒤에는 상대의 서비스 닉네임만 보여 줍니다. 실명·학교·연락처는 영상과 경기 화면에서 공개하지 않습니다.", styles["table_cell"])],
        [p("공정성", styles["table_cell"]), p("자동 검토 방식 자체는 설명하지 않습니다. 사용자에게는 ‘경기 후 검토될 수 있고, 결과는 우편함과 이메일로 안내된다’는 권리·절차만 안내합니다.", styles["table_cell"])],
        [p("정책 숫자", styles["table_cell"]), p("영상에는 현재 확정값을 쓰되, 정책 조정 가능 표·상점 가격처럼 변동될 수 있는 값은 규정 페이지의 최신 표를 함께 안내합니다.", styles["table_cell"])],
        [p("화면 구성", styles["table_cell"]), p("한 화면에는 하나의 질문만 둡니다. 순위 카드·타이머·예치 아이콘·결과 카드를 같은 위치에 반복 배치해 입문자가 흐름을 놓치지 않게 합니다.", styles["table_cell"])],
    ]
    table = Table(rows, colWidths=[34 * mm, 140 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4.5 * mm),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4.5 * mm),
        ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
    ]))
    notes += [table, Spacer(1, 8 * mm), p("근거 기준", styles["h2"])]
    notes.append(p(
        "GOAT Arena의 현재 사용자 공개 규정(공통 경기 규정·Unranked·Ranked·Final Ranking)과 2026-08-07 플레이리스트 구성안을 바탕으로 작성했습니다. "
        "정책이 변경되면 메인 영상의 원칙은 유지하고, 숫자·정산·기한이 포함된 세부편만 해당 정책 버전에 맞춰 다시 녹음합니다.",
        styles["body"],
    ))
    return notes


def build_pdf(playlist: Playlist, filename: str) -> Path:
    register_fonts()
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    destination = OUTPUT_DIR / filename
    styles = styles_for(playlist.accent)
    document = BaseDocTemplate(
        str(destination),
        pagesize=A4,
        leftMargin=18 * mm,
        rightMargin=18 * mm,
        topMargin=22 * mm,
        bottomMargin=18 * mm,
        title=f"GOAT Arena {playlist.korean_title} 영상 대본",
        author="Matths",
        subject="User-facing rule video scripts",
    )
    frame = Frame(document.leftMargin, document.bottomMargin, document.width, document.height, id="normal")
    document.addPageTemplates([])
    document.addPageTemplates([__import__("reportlab.platypus", fromlist=["PageTemplate"]).PageTemplate(id="all", frames=[frame], onPage=header_footer)])
    story: list = []
    story += cover_page(playlist, styles)
    story += playlist_map(playlist, styles)
    story += core_script_pages(playlist, styles)
    story += detail_pages(playlist, styles)
    story += production_notes(playlist, styles)
    document.build(story)
    return destination


OVERVIEW = Playlist(
    code="OVERVIEW",
    korean_title="룰 OVERVIEW",
    english_title="OVERVIEW",
    accent=PURPLE,
    tagline="시험으로 실력을 확인하고, Arena 경기로 자리를 바꾸고, 주간 결과로 최종 종합 랭킹을 완성합니다.",
    core_runtime="약 3분",
    core_promise="GOAT Arena에서 무엇이 순위를 바꾸고, 한 경기가 어떻게 끝나며, 꼭 지켜야 할 공통 원칙이 무엇인지 한 번에 이해합니다.",
    core_segments=(
        (
            "0:00–0:18",
            "‘수학 실력도, 경기 감각도 한 줄로 세울 수 있을까?’ GOAT Arena는 시험과 1대1 경기를 한 판의 시즌으로 연결합니다. 먼저 큰 그림부터 볼게요. 여기서 순위는 숫자 하나가 아니라, 시험 실력과 Arena 경기 결과가 함께 만든 현재 위치입니다.",
            "[검은 화면 → 보라·청록 빛의 세 개 트랙: 시험 / Arena / Final. ‘하나의 순위, 세 개의 엔진’ 타이틀]",
        ),
        (
            "0:18–0:48",
            "첫 번째는 실력 지표, MMR입니다. 배치고사와 매주 일요일 Matths 주간 공식 모의고사가 MMR을 바꿉니다. 두 번째는 Arena 티어·티어 안 순위·GP. 이건 1대1 경기에서 승리하면 상대와 함께 자리째로 움직입니다. 마지막은 최종 종합 랭킹. 시험 실력, Arena 성과, 주간 모의고사 보너스를 함께 반영해 완성됩니다.",
            "[MMR 카드에는 ‘시험’, Arena 카드에는 ‘경기’, Final 카드에는 ‘종합’ 라벨. 1대1 승리 때 티어·순위·GP 카드가 통째로 교환되는 모션]",
        ),
        (
            "0:48–1:10",
            "Arena는 두 구간으로 나뉩니다. UNRANKED에서는 29일 학습 주기 안에서 페이백 점수와 진입 자격에 도전합니다. 조건을 달성하면 RANKED에서 학습일수를 걸고 더 높은 경쟁을 이어갑니다. 같은 티어 아이콘을 쓰더라도, 두 구간의 순위와 예치 자산은 서로 섞이지 않습니다.",
            "[UNRANKED → ‘페이백 점수’ → RANKED → ‘학습일수’의 단방향 트랙. ‘같은 아이콘, 다른 경기 자산’ 자막]",
        ),
        (
            "1:10–1:42",
            "공식 1대1은 모두 같은 기본 규격입니다. 상대가 정해지면 서로 같은 주관식 준킬러 다섯 문제를 풉니다. 난이도는 방어자 티어를 기준으로 정하고, 한 문제당 제한 시간은 10분입니다. 다음 문제로 넘어가면 이전 문제와 답은 다시 볼 수 없어요. 다섯 번째 문제까지 끝나면 1분 안에 풀이 사진을 제출합니다.",
            "[5개의 문제 카드가 1→5로 점등. 문제별 ‘10:00’ 타이머. 이전 화살표는 잠기고, 마지막엔 ‘풀이 증거 01:00’ 전환]",
        ),
        (
            "1:42–2:08",
            "승패는 점수, 정답 수, 정답 문항을 푼 시간, 전체 풀이 시간 순서로 정합니다. 네 기준까지 모두 같다면 방어자가 자리를 지킵니다. 그래서 빠르기만 해서는 부족하고, 끝까지 정확하게 푸는 게 중요합니다. 공격자가 이기면 Arena 티어·순위·GP가 한 묶음으로 교환됩니다.",
            "[4단계 판정 보드가 위에서 아래로 정렬. 완전 동점에서는 방어 카드에 ‘HOLD’가 뜨는 모션]",
        ),
        (
            "2:08–2:34",
            "모든 상대는 서버가 정한 적격 후보 안에서 배정됩니다. 특정 이용자를 골라 반복해서 만날 수는 없습니다. 매치가 성립되면 상대의 서비스 닉네임과 경기 정보만 보이고, 실명·학교·연락처 같은 개인정보는 공개되지 않습니다.",
            "[후보 카드들이 셔플된 뒤 하나가 선택. ‘닉네임 공개 / 개인정보 비공개’ 두 칸 대조]",
        ),
        (
            "2:34–2:55",
            "일요일은 정산과 주간 시험을 위한 정비 시간입니다. 오후 2시부터 새 경기·수락·준비·시작이 멈추고, 오후 3시부터 월요일 0시까지 Arena 순위와 최종 종합 랭킹이 잠깁니다. 주간 공식 모의고사 반영이 끝나면 월요일 0시에 새 결과가 공개됩니다.",
            "[일요일 타임라인 14:00 LOCK → 15:00 RANK FREEZE → 월 00:00 UPDATE]",
        ),
        (
            "2:55–3:08",
            "복잡해 보여도 기억할 건 세 가지입니다. 시험은 MMR, 경기는 Arena 자리, 그리고 둘의 기록은 최종 종합 랭킹으로 이어집니다. 이제 내 위치에 맞는 UNRANKED 또는 RANKED 플레이리스트를 열고, 첫 경기를 준비해 보세요.",
            "[세 장의 카드를 한 줄로 연결. 엔드 카드: ‘다음: UNRANKED / RANKED 룰’]",
        ),
    ),
    detail_episodes=(
        Episode(
            "02", "Matths의 랭킹은 어떻게 구성될까?", "약 38초", "MMR·Arena 순위·최종 종합 랭킹을 혼동하지 않게 합니다.", "랭킹 화면 첫 진입",
            "랭킹이 세 개라 헷갈린다고요? MMR은 배치고사와 주간 공식 모의고사에서만 바뀌는 시험 실력입니다. Arena 티어·순위·GP는 1대1 승리로 자리째 교환됩니다. 최종 종합 랭킹은 시험 실력, Arena 성과, 주간 보너스를 합칩니다. 시험은 실력, 경기는 자리, 최종 종합 랭킹은 두 기록의 합입니다.",
            "MMR·Arena·Final 카드를 서로 다른 레일로 움직인다. ‘1대1은 MMR을 바꾸지 않음’만 짧게 잠금 아이콘으로 강조.",
            "MMR과 GP는 같은 점수가 아니며, 1대1의 승리는 Arena 자리만 바꿉니다.",
        ),
        Episode(
            "03", "1대1 경기는 어떻게 진행될까?", "약 39초", "경기 시작부터 결과까지 꼭 필요한 행동만 보여 줍니다.", "첫 공식 경기 직전",
            "매치가 성립되면 상대 닉네임과 경기 정보가 열립니다. 두 사람은 같은 다섯 문제를 풀고, 문제당 10분을 씁니다. 다음을 누르면 이전 문제는 끝입니다. 마지막 문제 뒤에는 풀이 사진을 1분 안에 제출하세요. 점수, 정답 수, 정답 문항 시간, 전체 시간이 순서대로 비교되고 전부 같으면 방어자가 지킵니다.",
            "READY → QUESTION 1~5 → EVIDENCE 01:00 → RESULT 네 장면을 한 호흡으로 연결. 4단계 판정 보드는 그래픽만 보여 준다.",
            "문항당 10분, 마지막 뒤 증거 1분, 이전 문제로 돌아갈 수 없음.",
        ),
        Episode(
            "04", "경기 시간과 미응시 규칙", "약 38초", "24시간 창과 일요일 잠금을 한 장의 시간표로 이해시킵니다.", "매치 성립 직후 / 일요일",
            "경기는 성립 뒤 양쪽 모두 24시간 안에 시작합니다. 공격자만 시작하지 않으면 방어자 승리, 방어자만 시작하지 않으면 공격자 승리입니다. 둘 다 시작하지 않으면 취소되고 예치분은 돌아갑니다. 일요일은 예외입니다. 오후 2시부터 새 경기와 시작이 멈추고, 오후 3시부터 월요일 0시까지 Arena는 정산 시간입니다.",
            "24시간 카운트다운이 일요일 14:00 경계에서 멈추는 타임라인. 각 미응시 결과는 3장의 결과 카드로 짧게 처리.",
            "일요일 14:00 이후에는 새 공식 경기를 만들거나 시작할 수 없습니다.",
        ),
        Episode(
            "05", "공정한 경기는 어떻게 관리될까?", "약 39초", "필수 증거, 검토 절차, 개인정보 보호의 이유를 안내합니다.", "첫 매칭 / 검토 상태 발생",
            "마지막 뒤 1분의 풀이 증거는 필수입니다. 제출하지 않으면 자동 패배가 적용됩니다. 일부 경기는 종료 뒤 운영 검토로 넘어갈 수 있고, 검토 중에는 새 매치가 잠시 멈춥니다. 결과는 GOAT Arena 우편함과 이메일로 안내됩니다. 문제가 없으면 경기는 정상 정산되고 멈춘 시간도 보완됩니다. 경기에는 닉네임만 보입니다.",
            "증거 업로드 → 검토 봉투 → 알림 카드 → CLEAR 결과 흐름. 개인정보 카드에는 닉네임만 남기고 나머지는 마스킹.",
            "공정성 절차의 목적은 판정을 뒤집기보다, 정당한 경기와 이용자를 보호하는 것입니다.",
        ),
    ),
    scope_note="OVERVIEW는 ‘어떤 점수가 무엇을 바꾸는가’와 ‘공통 경기 흐름’까지만 설명합니다. 페이백 점수의 정산과 학습일수 예치는 각각 UNRANKED·RANKED 플레이리스트로 넘겨 중복을 막습니다.",
)


UNRANKED = Playlist(
    code="UNRANKED",
    korean_title="UNRANKED 룰",
    english_title="UNRANKED",
    accent=CYAN,
    tagline="29일 학습 주기 안에서 페이백 점수를 지키고 쌓아, RANKED 진입 자격에 도전하는 Arena의 첫 무대입니다.",
    core_runtime="약 3분",
    core_promise="페이백 점수와 학습 가능 일수의 차이, 자동 매칭, 1점·2점 정산, RANKED 진입까지의 흐름을 이해합니다.",
    core_segments=(
        (
            "0:00–0:18",
            "UNRANKED는 ‘아직 순위가 없다’는 뜻이 아닙니다. 오히려 29일 학습 주기 안에서 내 Arena 자리를 만들고, 페이백과 RANKED 진입에 도전하는 시작점입니다. 여기서 중요한 건 두 숫자를 절대 섞어 보지 않는 거예요.",
            "[29일 트랙이 열리고 ‘학습 가능 일수’와 ‘페이백 점수’가 서로 다른 색으로 등장]",
        ),
        (
            "0:18–0:43",
            "학습 가능 일수는 패키지를 사용할 수 있는 남은 기간입니다. 날짜가 바뀌면 하루씩 줄어듭니다. 페이백 점수는 경기에서 걸고 정산하는 별도 점수예요. UNRANKED 경기로 학습 가능 일수가 오가지는 않습니다. 그래서 ‘기간’과 ‘페이백 점수’를 각각 확인하는 습관이 필요합니다.",
            "[달력에서 학습일수 -1. 옆 경기 보드에서는 페이백 점수만 이동. 두 숫자 사이에는 ‘연동되지 않음’ 선]",
        ),
        (
            "0:43–1:08",
            "일반 쟁탈전은 공격자가 페이백 점수 1점을 예치하고 시작합니다. 이기면 1점은 돌아오고, 내 티어·티어 안 순위·GP가 상대와 교환됩니다. 지면 그 1점은 방어자에게 넘어갑니다. 방어자는 경기 시작에 점수를 예치하지 않지만, 이기면 공격자가 걸었던 1점을 얻습니다.",
            "[공격자 1점이 중앙 금고로. 승리: 1점 RETURN + 자리 교환 / 패배: 1점 DEFENDER]",
        ),
        (
            "1:08–1:34",
            "상대는 내가 고르지 않습니다. 서버는 먼저 같은 티어에서 나보다 높은 순위의 적격 후보를 찾고, 없을 때만 바로 위 티어까지 한 번 확장합니다. 같은 대상 티어에서는 최근 72시간 일반전 방어가 가장 적은 사용자를 우선하고, 동률이면 마지막 방어가 가장 오래된 사용자를 먼저 연결합니다. 브론즈도 같은 원칙입니다.",
            "[같은 티어 위쪽 카드 → 후보 없음일 때만 바로 위 티어 카드 → 최근 72시간 방어 횟수 → 마지막 방어 시각 → 최종 동률 랜덤. 브론즈 최하위의 화살표는 위로만]",
        ),
        (
            "1:34–1:54",
            "일반 공격은 하루 최대 3회입니다. 방어 기회는 티어가 높아질수록 더 넓어지고, 실제 배정은 적격 후보 안에서 공정하게 분배됩니다. 자동 배정된 방어를 다섯 번 시작하지 않으면 자동 방어 후보에서 빠집니다. 하지만 참가 가능한 공격을 한 번 성립시키면 이 기록은 초기화됩니다.",
            "[공격 카운터 0/3. 티어별 방어 게이지가 위로 갈수록 길어짐. ‘미응시 5회 → 후보 제외 / 정상 공격 1회 → 복귀’]",
        ),
        (
            "1:54–2:17",
            "패배가 아쉬우면 결과 화면에서 바로 복수전을 선택할 수 있습니다. 복수전은 한 번뿐이고, 2점을 예치합니다. 신청자가 이기면 1점을 돌려받고 1점은 수수료로 처리됩니다. 신청자가 지면 1점은 방어자에게, 1점은 수수료로 처리됩니다. 복수전은 감정보다 ‘다음 24시간 안에 정말 끝낼 수 있는가’를 먼저 보는 선택입니다.",
            "[REVENGE 버튼이 1회만 점등. 2점 → ‘반환 1 / 수수료 1’ 또는 ‘상대 이전 1 / 수수료 1’로 분기]",
        ),
        (
            "2:17–2:45",
            "페이백을 받으려면 결제 다음 날 0시부터 29일 동안 매일 UNRANKED 일반전 또는 복수전의 공격자로 모든 답안과 필수 풀이 증거를 정상 제출해야 합니다. 공격 시작만으로는 인정되지 않고 승패는 관계없습니다. 기준 이상의 페이백 점수와 공정성 심사도 함께 통과해야 합니다.",
            "[29칸 모두 공식 공격 제출 체크가 있어야 완성되는 캘린더. ‘답안+증거 / 승패 무관 / 하루 1회’ 라벨. RANKED 게이트가 열리는 장면]",
        ),
        (
            "2:45–3:06",
            "활성 패키지 안에서 페이백 점수가 0점이 되면 공격과 복수전 신청은 멈춥니다. 그래도 남은 학습일 동안 학습과 주간 모의고사는 계속할 수 있고, 방어 후보에도 남습니다. 정기권 학습 가능 일수가 0일이 되더라도 마지막 공식 공격 제출 마감 전까지는 UNRANKED 공식 경기를 허용하며 마감 뒤 잠깁니다. 매일 답안과 풀이 증거까지 공격을 정상 제출하는 것이 중요합니다.",
            "[0점 카드: ATTACK LOCK / LEARNING ON / DEFENSE ON. 학습일수 0: 마지막 공식 공격 마감까지 ARENA ON → 마감 뒤 LOCK. 엔드 카드: ‘다음: 페이백·RANKED 진입’]",
        ),
    ),
    detail_episodes=(
        Episode(
            "02", "학습 가능 일수와 페이백 점수, 뭐가 다를까?", "약 37초", "두 장부와 0이 되었을 때의 차이를 한 번에 구분합니다.", "UNRANKED 첫 진입 / 잔액 임박",
            "둘 다 ‘일’처럼 보이지만 다릅니다. 학습 가능 일수는 패키지의 남은 기간으로, 매일 하루씩 줄어듭니다. 페이백 점수는 경기에서 예치·정산하는 점수입니다. 페이백 점수가 0점이면 공격과 복수전만 멈추고 학습·주간 모의고사·방어는 계속됩니다. 학습 가능 일수가 0일이 되더라도 마지막 공식 공격 제출 마감 전까지는 UNRANKED 공식 경기를 허용하고 마감 뒤 전체가 잠깁니다.",
            "두 개의 큰 잔액 카드를 세로로 고정. 페이백 점수 0은 ‘부분 잠금’, 학습 가능 일수 0은 ‘마지막 공식 공격 마감 뒤 전체 잠금’으로 대비.",
            "UNRANKED 경기에서 움직이는 자산은 페이백 점수이며, 학습 가능 일수는 예치되지 않습니다.",
        ),
        Episode(
            "03", "누구와, 하루에 몇 번 경기할까?", "약 39초", "자동 매칭과 공격·방어 기회를 행동 기준으로 설명합니다.", "첫 공격 / 자동 방어 배정",
            "서버는 같은 티어에서 나보다 위에 있는 적격 상대를 찾고, 없을 때만 바로 위 티어로 한 번 넓힙니다. 같은 대상 티어에서는 최근 72시간 일반전 방어가 가장 적은 사용자를 우선하고, 동률이면 마지막 방어가 가장 오래된 사용자를 먼저 연결합니다. 일반 공격은 하루 최대 3회이며 방어는 티어별 한도 안에서 배정됩니다.",
            "동일 티어 → 바로 위 티어의 2단 후보 탐색 뒤 ‘최근 72시간 횟수 → 마지막 방어 시각 → 최종 동률 랜덤’을 애니메이션으로 보여 준다. 공격 3칸, 방어는 ‘티어별’ 게이지로 표시.",
            "브론즈도 같은 후보 규칙을 적용하며, 절대 최하위는 먼저 공격해서 위로 올라가야 합니다.",
        ),
        Episode(
            "04", "일반 쟁탈전과 복수전, 점수는 어떻게 움직일까?", "약 39초", "1점 일반전과 2점 복수전의 차이를 빠르게 비교합니다.", "공격 / 복수전 선택 직전",
            "일반 쟁탈전은 공격자만 페이백 점수 1점을 예치합니다. 이기면 1점은 돌아오고 Arena 자리가 교환됩니다. 지면 1점은 방어자에게 갑니다. 복수전은 직전 패자가 한 번만 신청하며 2점을 예치합니다. 신청자가 이기면 1점을 돌려받고 1점은 수수료, 지면 1점은 방어자에게 가고 1점은 수수료입니다.",
            "좌측 ‘일반 1점’, 우측 ‘복수 2점’ 비교 카드. 점은 실제 아이콘 1개·2개만 사용해 계산 부담을 줄인다.",
            "복수전은 최근 경기의 패자에게 한 번만 열리고, 경기 종료를 누르면 그 기회는 사라집니다.",
        ),
        Episode(
            "05", "페이백을 받고 RANKED로 가려면?", "약 39초", "29일 조건·점수 구간·심사와 진입을 분리해 보여 줍니다.", "페이백 현황 / 심사 직전",
            "페이백은 한 이용 주기를 완주했는지를 봅니다. 결제 다음 날 0시부터 29일 동안 매일 공격자로 답안과 풀이 증거를 정상 제출하고, 페이백 점수 30점 이상과 공정성 심사를 통과해야 합니다. 공격 시작만으로는 인정되지 않고 승패는 관계없으며 하루 1회만 인정합니다. 현재 구간은 30~34점 50퍼센트, 35~39점 80퍼센트, 40점 이상 100퍼센트입니다.",
            "29일 공식 공격 제출 캘린더 → 점수 표 50/80/100 → 심사 통과 → RANKED 게이트. 변동 가능 표에는 ‘내 주기 기준’ 배지.",
            "하루라도 유효한 공식 공격 제출이 빠지면 그 주기의 연속 제출 조건은 달성되지 않습니다.",
        ),
    ),
    scope_note="UNRANKED는 페이백 점수와 29일 이용 주기에 집중합니다. 문제 형식·시간·공정 검토의 공통 규칙은 OVERVIEW에서, 학습일수 예치·초대전은 RANKED에서만 설명합니다.",
)


RANKED = Playlist(
    code="RANKED",
    korean_title="RANKED 룰",
    english_title="RANKED",
    accent=ORANGE,
    tagline="페이백 심사 이후의 상위 경쟁. 남은 학습일수를 신중히 예치하고, 내 자리와 다음 기회를 직접 설계하는 무대입니다.",
    core_runtime="약 3분",
    core_promise="RANKED의 세 가지 경기 방식, 학습일수 예치, 공정한 자동 방어, 만료와 재구독까지 상위 경쟁의 흐름을 이해합니다.",
    core_segments=(
        (
            "0:00–0:18",
            "RANKED는 페이백을 다시 겨루는 곳이 아닙니다. UNRANKED에서 진입 자격을 얻은 뒤, 남은 학습일수로 더 높은 Arena 자리를 겨루는 상위 무대입니다. 여기서는 ‘얼마를 걸 것인가’와 ‘어느 티어에 도전할 것인가’가 내 선택이 됩니다.",
            "[UNRANKED의 페이백 점수 카드가 닫히고, RANKED의 학습일수 카드가 열림. ‘Payback ends, ranking continues’]",
        ),
        (
            "0:18–0:43",
            "RANKED의 자산은 학습일수입니다. 사용할 수 있는 일수, 초대를 기다리며 예약된 일수, 진행 중 경기에 예치된 일수로 나뉘어 표시됩니다. 같은 일수를 두 경기에 중복으로 걸 수는 없습니다. 이 구분은 복잡하게 보이지만, 내 잔액과 진행 중 약속을 정확히 보여 주기 위한 안전장치입니다.",
            "[사용 가능 / 예약 / 경기 예치의 세 바구니. 같은 코인을 두 바구니로 옮기려 하면 ‘중복 불가’ 차단]",
        ),
        (
            "0:43–1:12",
            "첫 번째는 상향 쟁탈전입니다. 아래 티어 사용자가 위 티어를 골라 도전하면, 서버가 적격 방어자 중 한 명을 공정하게 배정합니다. 티어 차이가 1·2·3단계라면 각각 최소 1·2·3일을 예치하고, 최대는 5일입니다. 이기면 내 예치 일수는 전액 돌아오고 Arena 자리가 교환됩니다. 지면 예치 일수는 방어자에게 넘어갑니다.",
            "[아래 티어 → 위 티어의 상승 화살표. 1/2/3일 최소값과 5일 최대가 게이지로. 승리 RETURN / 패배 TRANSFER]",
        ),
        (
            "1:12–1:40",
            "두 번째는 상위 티어의 하위 티어 초대전입니다. 상위 사용자는 특정 사람 대신 목표 티어를 고릅니다. 적격한 하위 사용자에게 초대가 도착하고, 하위 사용자는 조건을 본 뒤 수락하거나 거절할 수 있습니다. 수락 전에는 티어 차이, 양쪽 예치 일수, 이기고 졌을 때 결과가 모두 보입니다. 수락하면 양쪽이 같은 일수를 예치합니다.",
            "[상위 티어가 ‘하위 목표 티어’만 고름 → 여러 닉네임 카드에 초대 도착 → ACCEPT / DECLINE. 수락 전 조건 카드 확대]",
        ),
        (
            "1:40–2:06",
            "세 번째는 복수전입니다. 가장 최근 경기의 패자만 결과 화면에서 바로 한 번 신청할 수 있습니다. 원경기에서 걸었던 일수의 두 배가 필요하고, 정산 때는 1일 수수료가 적용됩니다. 이 경기는 7일 재대결 제한의 예외지만, 24시간 안에 끝내야 한다는 책임은 더 큽니다.",
            "[패자 결과 카드에만 REVENGE 1회. 2× 예치와 ‘수수료 1일’ 아이콘. 24h 타이머]",
        ),
        (
            "2:06–2:29",
            "강제 방어도 무작정 한 사람에게 몰리지 않습니다. 최근 24시간 동안 자동 방어가 가장 적었던 적격 사용자부터 후보가 되고, 같은 횟수면 무작위로 정합니다. 한 경기가 끝나면 6시간 동안 자동 방어 재배정에서 쉬어 갑니다. 진행 중 경기나 초대 예약이 있으면 자동 후보에서 제외됩니다.",
            "[24h 방어 횟수 막대가 낮은 카드부터 후보가 됨. 경기 종료 → 6h 보호 실드. 초대 알림은 별도 레이어로 통과]",
        ),
        (
            "2:29–2:50",
            "RANKED에서는 MMR이 경기로 바뀌지 않습니다. 시험 실력은 배치고사와 주간 공식 모의고사에서, Arena 자리는 1대1에서 기록됩니다. 그리고 RANKED는 모두 하나의 통합 풀에서 경쟁합니다. 학교나 이용자 상태가 아니라, 현재 티어와 경기 자격이 상대 선정의 기준입니다.",
            "[MMR은 시험 레일, RANKED 자리 교환은 경기 레일. ‘통합 Ranked Pool’에 여러 프로필 카드가 함께 진입]",
        ),
        (
            "2:50–3:12",
            "학습일수가 모두 0이 되고 미정산 경기가 없으면 RANKED 이용은 만료됩니다. 72시간 안에 재구독하면 시험 없이 직전 RANKED 성과를 반영한 UNRANKED 위치에서 새 주기를 시작합니다. 72시간이 지나면 랭크 복귀전이 필요합니다. RANKED의 핵심은 단순합니다. 내 일수를 지키고, 걸 만한 도전을 골라, 오래 살아남는 것.",
            "[학습일수 0 → RANKED EXPIRED. 72h 패널: ‘이내: 성과 반영 / 이후: 복귀전’. 엔드 카드: ‘도전 전, 세부편 확인’]",
        ),
    ),
    detail_episodes=(
        Episode(
            "02", "RANKED 학습일수는 어떻게 쓰이고 관리될까?", "약 38초", "학습일수의 세 상태와 만료 기준을 사용자의 언어로 설명합니다.", "RANKED 첫 진입 / 상점 첫 진입",
            "RANKED의 학습일수는 세 칸입니다. 바로 쓰는 ‘사용 가능’, 초대를 기다리는 ‘예약’, 경기 정산까지 묶인 ‘경기 예치’. 같은 일수를 두 번 쓰지 못하게 나눈 표시입니다. 상점에는 사용 가능 일수만 쓸 수 있습니다. 세 칸의 합이 모두 0이고 미정산 경기가 없으면 이용이 만료됩니다. 도전 전에는 남은 일수 한 칸을 확인하세요.",
            "세 바구니에 같은 학습일수 칩이 이동. 상점에는 첫 바구니만 연결. 마지막 한 칩을 강조해 ‘최소 1일 유지’ 감각 전달.",
            "예약·경기 예치는 소비가 아니라, 정산 전까지 다른 곳에 중복 사용하지 못하도록 묶어 둔 상태입니다.",
        ),
        Episode(
            "03", "상향 쟁탈전, 도전부터 정산까지", "약 39초", "하위 티어 공격의 비용·보상·상대 선정 원칙을 설명합니다.", "상향 공격 확정 직전",
            "상향 쟁탈전은 더 높은 티어를 향한 내 공격입니다. 목표는 최대 세 단계 위까지. 한 단계 차이는 최소 1일, 두 단계 2일, 세 단계 3일을 예치하며 최대는 5일입니다. 상대는 서버가 공정하게 배정합니다. 성공하면 예치 일수는 전액 돌아오고 Arena 자리를 교환합니다. 실패하면 예치 일수는 방어자에게 갑니다.",
            "티어 차 1·2·3 → 최소 1·2·3일 / 최대 5일 게이지. 마지막에 ‘승: 반환+교환 / 패: 이전+유지’ 두 카드.",
            "상향 쟁탈전에서는 공격자만 학습일수를 예치합니다.",
        ),
        Episode(
            "04", "하위 티어 초대전은 어떻게 진행될까?", "약 39초", "상위 사용자의 초대와 하위 사용자의 선택권을 분명히 합니다.", "초대 생성 / 수락 직전",
            "상위 티어도 하위 티어에 초대장을 보낼 수 있습니다. 특정 사람 대신 목표 티어를 고르면 적격 사용자에게 초대가 갑니다. 받은 사람은 수락하거나 거절하며 불이익은 없습니다. 수락 전에는 티어 차이, 양쪽 예치 일수, 승패 결과가 보입니다. 수락하면 양쪽이 같은 일수를 예치하고, 승자는 상대 예치를 얻습니다. 하위 사용자가 이기면 Arena 자리도 교환됩니다.",
            "목표 티어 선택 → 초대 수신 → 조건 확인 → ACCEPT/DECLINE. 마지막엔 동등 예치 칩 두 개와 결과 교차 이동.",
            "수락 전에는 반드시 ‘승리·패배 시 결과’ 카드를 보고 결정합니다.",
        ),
        Episode(
            "05", "강제 방어와 복수전은 어떻게 돌아갈까?", "약 40초", "자동 방어 배정의 공정성과 복수전의 책임을 함께 안내합니다.", "강제 방어 / 복수하기 직전",
            "자동 방어는 최근 24시간 방어가 가장 적었던 적격 사용자부터 배정합니다. 동률은 무작위입니다. 경기 뒤 6시간은 자동 재배정에서 쉬고, 진행 중 경기나 초대 예약이 있으면 후보에서 빠집니다. 패자는 결과에서 복수전을 한 번 신청할 수 있습니다. 원경기 예치의 두 배를 걸고 1일 수수료가 적용되니, 24시간 안에 끝낼 준비가 됐을 때만 선택하세요.",
            "방어 횟수 낮은 카드 → 랜덤 → 6h 쉴드. 뒤이어 REVENGE 2×S / fee 1일 카드가 등장. 공통 24h 타이머로 마감.",
            "6시간 보호는 자동 방어에만 적용되며, 자발적인 초대전 수락 기회는 그대로 남습니다.",
        ),
        Episode(
            "06", "RANKED가 만료되면 어떻게 돌아올까?", "약 39초", "학습일수 소진 뒤의 72시간 선택을 불안 없이 안내합니다.", "잔여 1일 / 만료 화면",
            "세 종류의 학습일수가 모두 0이고 미정산 경기가 없으면 RANKED 이용은 만료됩니다. 기록과 배지는 남지만 Arena와 주간 공식 모의고사는 잠깁니다. 72시간 안에 재구독하면 시험 없이 직전 RANKED 성과를 반영한 UNRANKED 위치에서 시작합니다. 72시간 이후에는 랭크 복귀전이 필요합니다. 곧바로 RANKED로 돌아가지는 않습니다.",
            "0일 카드 → 기록 보관함. 72h 이내 / 이후를 두 갈래로 분기: ‘성과 반영 UNRANKED’와 ‘복귀전 후 UNRANKED’.",
            "RANKED 만료는 기록 삭제가 아니라 Arena 이용 상태의 종료이며, 재진입은 새 UNRANKED 주기에서 시작합니다.",
        ),
    ),
    scope_note="RANKED는 학습일수와 세 가지 경기 방식을 다룹니다. 페이백 조건은 UNRANKED에서만, 문제·증거·시간·공정 검토의 공통 기준은 OVERVIEW에서만 상세히 설명해 시청 경로가 겹치지 않게 합니다.",
)


def main() -> None:
    outputs = [
        build_pdf(OVERVIEW, "GOAT_Arena_Overview_Rule_Video_Scripts.pdf"),
        build_pdf(UNRANKED, "GOAT_Arena_Unranked_Rule_Video_Scripts.pdf"),
        build_pdf(RANKED, "GOAT_Arena_Ranked_Rule_Video_Scripts.pdf"),
    ]
    for output in outputs:
        print(output)


if __name__ == "__main__":
    main()
