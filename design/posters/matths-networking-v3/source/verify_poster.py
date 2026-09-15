"""Check the actual delivered PNG and separately rendered PDF."""
import base64
import hashlib
import json
from pathlib import Path
import xml.etree.ElementTree as ET

from PIL import Image
from pypdf import PdfReader
import zxingcpp

ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parents[1]
PNG = OUT / "matths-networking-poster-v3.png"
SVG = OUT / "matths-networking-poster-v3.svg"
PDF = ROOT / "output/pdf/matths-networking-poster-a3-v3.pdf"
RENDER = Path(__file__).parent / "qa/pdf-render.png"
URL = "https://www.matths.kr/intro"
required = [
    "부모의 교육비가,", "학생의 성과 보상으로.",
    "Learn, Achieve, Get Rewarded", "부모의 학습권 구매",
    "학생에게 페이백", "일대일 경쟁 · 주간 모의고사",
    "결제액 일부 또는 전액 페이백", "www.matths.kr",
    "다음 목표에 다시 도전", "새로운 교육 사이클을 만들었습니다.",
    "협업·투자 문의", "dltkddbs4553@matths.kr",
    "교육비의 새로운 방향", "결제는", "부모가.", "성과는", "학생이.",
    "보상도", "학생에게.", "부모는 미래의 성적을,", "학생은 오늘의 동기를.",
    "보상이 다시 학습으로 이어지는 구조",
    "페이백은 정해진 참여·성과·본인확인 및 지급 정책에 따릅니다.",
]
reader = PdfReader(PDF)
assert len(reader.pages) == 1
page = reader.pages[0]
copy = page.extract_text()
assert all(s in copy for s in required), copy
assert "참여·성과 조건 달성 시" not in copy, "Removed condition caption remains in PDF"
width, height = float(page.mediabox.width), float(page.mediabox.height)
assert abs(width - 297*72/25.4) < .01
assert abs(height - 420*72/25.4) < .01

decoded = {}
for image_file in [PNG, RENDER]:
    values = [r.text for r in zxingcpp.read_barcodes(Image.open(image_file))]
    assert URL in values, (str(image_file), values)
    decoded[str(image_file.relative_to(ROOT))] = values

links = [str(a.get_object().get("/A", {}).get("/URI")) for a in page.get("/Annots", [])]
assert URL in links
assert "mailto:dltkddbs4553@matths.kr" in links

xml = ET.parse(SVG).getroot()
labels = [g.attrib.get("aria-label", "") for g in xml.iter()]
assert all(any(s in label for label in labels) for s in required)
assert "참여·성과 조건 달성 시" not in labels
assert "matths.kr" not in labels and "www.matths.kr" in labels
editable = ET.parse(OUT / "source/matths-networking-poster-editable-text.svg").getroot()
editable_copy = "\n".join(editable.itertext())
assert "참여·성과 조건 달성 시" not in editable_copy
assert "www.matths.kr" in editable_copy
embedded = [base64.b64decode(i.attrib["href"].split(",",1)[1]) for i in xml.iter() if i.tag.endswith("}image")]
logo = Path(__file__).parent / "assets/official-logo.png"
assert embedded == [logo.read_bytes()], "Only the official logo may be embedded; no service screen"
assert "실제 서비스 화면" not in copy and "수학 개념 학습 화면" not in copy

im = Image.open(PNG)
assert im.width == 3508 and 4959 <= im.height <= 4961
assert abs(im.info["dpi"][0]-300) < .01
audit = json.loads((OUT/"source/text-layout-audit.json").read_text())
for text in audit["text"]:
    assert 70 <= text["x"] and text["x"]+text["width"] <= 1530

report = {
    "status": "pass",
    "poster_pixels": im.size,
    "ppi": im.info["dpi"],
    "pdf_pages": len(reader.pages),
    "pdf_size_mm": [round(width*25.4/72, 3), round(height*25.4/72, 3)],
    "required_copy": required,
    "qr_decodes": decoded,
    "pdf_links": links,
    "unaltered_logo_sha256": hashlib.sha256(logo.read_bytes()).hexdigest(),
    "service_screenshot_present": False,
    "condition_captions_present": False,
    "displayed_website": "www.matths.kr",
    "safe_edge_text_blocks": len(audit["text"]),
    "file_sha256": {str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in [PNG,SVG,PDF]},
}
(OUT/"source/verification.json").write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
print(json.dumps(report, ensure_ascii=False, indent=2))
