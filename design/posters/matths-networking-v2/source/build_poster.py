"""Author the Matths networking poster as vector artwork, not generated imagery.

Requirements: reportlab, Pillow, fonttools, qrcode.
Run with the bundled Python runtime. All artwork comes from this repository;
the website QR is constructed from its actual encoded module matrix.
"""

import base64
import html
import json
from pathlib import Path

import qrcode
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont as OutlineFont
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parents[1]
FONTS = Path(__file__).parent / "fonts"
W, H = 1600, 1600 * 420 / 297
PDF_PATH = ROOT / "output/pdf/matths-networking-poster-a3-v2.pdf"
QR_URL = "https://www.matths.kr/intro"
NAVY, WHITE, MUTED, CYAN, BLUE = "#090C1B", "#F4F6FF", "#A4ADC2", "#0CDCF1", "#327FFA"
LINE = "#343A50"
SVG = []
SVG_TEXT = []
TEXT_AUDIT = []
PDF_PATH.parent.mkdir(parents=True, exist_ok=True)
PDF = canvas.Canvas(str(PDF_PATH), pagesize=(297 * 72 / 25.4, 420 * 72 / 25.4))
PDF.setTitle("Matths | Learn, Achieve, Get Rewarded")
PDF.setAuthor("Matths")
PDF.setSubject("Startup networking poster - learning, competition and conditional rewards")
PDF.scale((297 * 72 / 25.4) / W, (420 * 72 / 25.4) / H)

FONT_DATA = {}
for weight, filename in [("regular", "SUIT-Regular.ttf"), ("bold", "SUIT-Bold.ttf"), ("heavy", "SUIT-ExtraBold.ttf")]:
    path = FONTS / filename
    pdfmetrics.registerFont(TTFont(weight, str(path)))
    font = OutlineFont(path)
    FONT_DATA[weight] = (font, font.getGlyphSet(), font.getBestCmap(), font["head"].unitsPerEm)


def append(code):
    SVG.append(code)
    SVG_TEXT.append(code)


def rect(x, y, width, height, fill, stroke=None, radius=0, line_width=1):
    append(f'<rect x="{x}" y="{y}" width="{width}" height="{height}" rx="{radius}" fill="{fill}" stroke="{stroke or "none"}" stroke-width="{line_width}"/>')
    PDF.setFillColor(HexColor(fill))
    PDF.setStrokeColor(HexColor(stroke or fill))
    PDF.setLineWidth(line_width)
    if radius:
        PDF.roundRect(x, H-y-height, width, height, radius, stroke=bool(stroke), fill=1)
    else:
        PDF.rect(x, H-y-height, width, height, stroke=bool(stroke), fill=1)


def circle(x, y, radius, fill, stroke=None, line_width=1):
    append(f'<circle cx="{x}" cy="{y}" r="{radius}" fill="{fill}" stroke="{stroke or "none"}" stroke-width="{line_width}"/>')
    PDF.setFillColor(HexColor(fill))
    PDF.setStrokeColor(HexColor(stroke or fill))
    PDF.setLineWidth(line_width)
    PDF.circle(x, H-y, radius, stroke=bool(stroke), fill=1)


def path(commands, stroke, line_width=2, fill=None):
    d = " ".join(c[0] + " " + " ".join(str(v) for v in c[1:]) for c in commands)
    append(f'<path d="{d}" fill="{fill or "none"}" stroke="{stroke}" stroke-width="{line_width}" stroke-linejoin="round" stroke-linecap="round"/>')
    PDF.setStrokeColor(HexColor(stroke))
    PDF.setLineWidth(line_width)
    PDF.setLineCap(1)
    PDF.setLineJoin(1)
    if fill:
        PDF.setFillColor(HexColor(fill))
    p = PDF.beginPath()
    for command in commands:
        kind, *v = command
        if kind == "M":
            p.moveTo(v[0], H-v[1])
        elif kind == "L":
            p.lineTo(v[0], H-v[1])
        elif kind == "C":
            p.curveTo(v[0], H-v[1], v[2], H-v[3], v[4], H-v[5])
        elif kind == "Z":
            p.close()
    PDF.drawPath(p, stroke=1, fill=bool(fill))


def line(x1, y1, x2, y2, color=LINE, width=1.5):
    path([("M", x1, y1), ("L", x2, y2)], color, width)


def text(content, x, baseline, size, weight="regular", color=WHITE, tracking=0, align="left", max_width=None):
    font, glyphs, cmap, upm = FONT_DATA[weight]
    width = sum(font["hmtx"][cmap[ord(c)]][0] for c in content) * size / upm + max(0, len(content)-1)*tracking
    if max_width is not None and width > max_width:
        raise ValueError(f"Text overflow ({width:.1f} > {max_width}): {content}")
    origin = x-width if align == "right" else x-width/2 if align == "center" else x
    if origin < 70 or origin+width > W-70:
        raise ValueError(f"Unsafe text edge: {content}")
    TEXT_AUDIT.append({"text": content, "x": round(origin, 2), "baseline": baseline, "font": weight, "size": size, "width": round(width, 2)})
    cursor = origin
    outlines = []
    for char in content:
        glyph_name = cmap.get(ord(char))
        if glyph_name is None:
            raise ValueError(f"Missing glyph: {char!r}")
        pen = SVGPathPen(glyphs)
        glyphs[glyph_name].draw(pen)
        if pen.getCommands():
            outlines.append(f'<path transform="translate({cursor:.4f} {baseline}) scale({size/upm:.6f} {-size/upm:.6f})" d="{pen.getCommands()}"/>')
        cursor += font["hmtx"][glyph_name][0]*size/upm + tracking
    SVG.append(f'<g fill="{color}" aria-label="{html.escape(content, quote=True)}">' + "".join(outlines) + "</g>")
    css_weight = {"regular": 400, "bold": 700, "heavy": 800}[weight]
    SVG_TEXT.append(f'<text x="{origin:.4f}" y="{baseline}" font-family="SUIT" font-weight="{css_weight}" font-size="{size}" letter-spacing="{tracking}" fill="{color}">{html.escape(content)}</text>')
    PDF.setFillColor(HexColor(color))
    obj = PDF.beginText(origin, H-baseline)
    obj.setFont(weight, size)
    obj.setCharSpace(tracking)
    obj.textOut(content)
    PDF.drawText(obj)
    return width


def image(pathname, x, y, width, height, mime, radius=0):
    encoded = base64.b64encode(pathname.read_bytes()).decode()
    image_code = f'<image x="{x}" y="{y}" width="{width}" height="{height}" href="data:{mime};base64,{encoded}" preserveAspectRatio="xMidYMid meet"/>'
    if radius:
        clip = f"clip-{len(SVG)}"
        image_code = f'<defs><clipPath id="{clip}"><rect x="{x}" y="{y}" width="{width}" height="{height}" rx="{radius}"/></clipPath></defs><g clip-path="url(#{clip})">{image_code}</g>'
    append(image_code)
    PDF.saveState()
    if radius:
        p = PDF.beginPath()
        p.roundRect(x, H-y-height, width, height, radius)
        PDF.clipPath(p, stroke=0, fill=0)
    PDF.drawImage(ImageReader(str(pathname)), x, H-y-height, width, height, mask="auto")
    PDF.restoreState()


rect(0, 0, W, H, NAVY)
image(Path(__file__).parent / "assets/official-logo.png", 96, 78, 268, 81.405, "image/png")
text("수학 학습 · 실력 경쟁 · 성과 보상", 1504, 135, 24, align="right", color=MUTED)
line(96, 193, 1504, 193)

# One dominant headline. No decorative equations, stock imagery or cash icons.
text("부모의 교육비가,", 96, 360, 106, "heavy", tracking=-2.5, max_width=1408)
text("학생의 성과 보상으로.", 96, 486, 106, "heavy", color=CYAN, tracking=-2.5, max_width=1408)
text("Learn, Achieve, Get Rewarded", 96, 629, 58, "bold", tracking=-1, max_width=1408)
text("부모의 학습권 구매 → 학생의 학습·경쟁 → 성과 조건 달성 → 학생에게 페이백", 96, 694, 27, color=MUTED, max_width=1408)
line(96, 776, 1504, 776)

text("실제 서비스 화면", 96, 844, 25, "bold")
text("학습이 다음 학습을 만드는 구조", 706, 844, 27, "bold")

# The embedded UI is an existing, unmodified product capture, not a fake mockup.
screen_w = 462
screen_h = screen_w * 2369 / 1206
image(ROOT / "public/images/home-devices/matths-iphone-dark.jpg", 96, 925, screen_w, screen_h, "image/jpeg", radius=20)
text("수학 개념 학습 화면", 96, 1885, 23, color=MUTED)

# The outer return path visualizes a proposed repeat-use mechanism, not
# measured retention. The three named stages directly match the slogan.
path([("M", 648, 1790), ("L", 648, 1880), ("C", 648, 1900, 665, 1912, 690, 1912), ("L", 1460, 1912), ("C", 1488, 1912, 1504, 1896, 1504, 1868), ("L", 1504, 941), ("C", 1504, 913, 1488, 898, 1460, 898), ("L", 683, 898), ("C", 660, 898, 648, 912, 648, 935), ("L", 648, 954)], BLUE, 3)
path([("M", 638, 942), ("L", 648, 954), ("L", 658, 942)], BLUE, 3)
line(648, 1001, 648, 1178, LINE, 2.5)
line(648, 1230, 648, 1443, LINE, 2.5)
line(648, 1495, 648, 1753, LINE, 2.5)
for number, y in [("01", 974), ("02", 1204), ("03", 1469), ("04", 1779)]:
    circle(648, y, 25, NAVY, BLUE if number in ["01", "04"] else LINE, 2)
    # These small labels are deliberately attached to the flow, not decoration.
    text(number, 648, y+6, 18, "bold", color=MUTED, align="center")

text("Learn", 706, 1000, 82, "heavy", tracking=-1.5)
text("개념을 배우고 문제를 풉니다.", 706, 1070, 28, color=MUTED)

text("Achieve", 706, 1230, 82, "heavy", tracking=-1.5)
text("일대일 경쟁 · 주간 모의고사", 706, 1300, 28, color=MUTED)
text("결과와 순위로 성과를 확인합니다.", 706, 1343, 28, color=MUTED)

text("Get Rewarded", 706, 1495, 72, "heavy", color=CYAN, tracking=-1.5, max_width=745)
text("참여·성과 조건 달성 시", 706, 1565, 28, color=MUTED)
text("결제액 일부 또는 전액 페이백", 706, 1608, 28, "bold")

text("다음 목표에 다시 도전", 706, 1792, 41, "bold")
text("보상과 다음 목표가 학습의 이유로.", 706, 1845, 27, color=MUTED)

line(96, 1982, 1504, 1982)
text("학습이 다음 학습을 만드는", 96, 2070, 43, "bold", tracking=-0.8)
text("새로운 교육 사이클을 만들었습니다.", 96, 2133, 43, "bold", tracking=-0.8, max_width=820)

text("협업·투자 문의", 968, 2057, 24, "bold")
text("matths.kr", 968, 2110, 36, "bold")
text("dltkddbs4553@matths.kr", 968, 2153, 20, color=MUTED, max_width=330)

# Generate vector QR modules, including a four-module white quiet zone.
qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=1, border=4)
qr.add_data(QR_URL)
qr.make(fit=True)
matrix = qr.get_matrix()
qr_x, qr_y, qr_size = 1320, 2028, 184
module = qr_size / len(matrix)
rect(qr_x, qr_y, qr_size, qr_size, "#FFFFFF")
for row, values in enumerate(matrix):
    for col, active in enumerate(values):
        if active:
            rect(qr_x+col*module, qr_y+row*module, module, module, NAVY)
text("서비스 소개 보기", qr_x+qr_size/2, 2244, 18, align="center", color=MUTED)
PDF.linkURL(QR_URL, (qr_x, H-qr_y-qr_size, qr_x+qr_size, H-qr_y), relative=0)
PDF.linkURL("mailto:dltkddbs4553@matths.kr", (968, H-2160, 1290, H-2130), relative=0)

text("페이백은 정해진 참여·성과·본인확인 및 지급 정책에 따릅니다.", 96, 2225, 21, color=MUTED, max_width=1150)
PDF.showPage()
PDF.save()

svg_start = f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1600" height="{H:.5f}" viewBox="0 0 {W} {H:.5f}" role="img"><title>Matths networking poster</title><desc>부모의 교육비가 학생의 성과 보상으로. Learn, Achieve, Get Rewarded. 조건부 페이백과 반복 학습 사이클.</desc>'
for filename, content in [("matths-networking-poster-v2.svg", SVG), ("source/matths-networking-poster-editable-text.svg", SVG_TEXT)]:
    (OUT / filename).write_text(svg_start+"\n"+"\n".join(content)+"\n</svg>\n", encoding="utf-8")
(OUT / "source/text-layout-audit.json").write_text(json.dumps({"dimensions": [W,H], "qr_url": QR_URL, "qr_modules": len(matrix), "text": TEXT_AUDIT}, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")
print(json.dumps({"pdf": str(PDF_PATH), "svg": str(OUT/"matths-networking-poster-v2.svg"), "text_blocks": len(TEXT_AUDIT), "qr_url": QR_URL}, ensure_ascii=False))
