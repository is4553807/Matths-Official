# Matths networking poster v3

## Deliverables

- `../matths-networking-poster-v3.png`: 3508 × 4960 px, 300 ppi, A3 proportions.
- `../matths-networking-poster-v3.svg`: portable vector artwork with all text outlined. Import into Figma without a font dependency.
- `matths-networking-poster-editable-text.svg`: editable SUIT text; install the included OFL-licensed fonts before editing.
- Project-level `output/pdf/matths-networking-poster-a3-v3.pdf`: exact A3, single-page PDF, embedded fonts and clickable website/email links.

## Selected direction

Replace v2's product screenshot with typography, not a simulated interface or illustration.
The left column says "결제는 부모가. 성과는 학생이. 보상도 학생에게."
with the student reward recipient highlighted in cyan. The two standalone
"참여·성과 조건 달성 시" captions were removed at the founder's request; the
footer's conditional payout policy notice is retained. The closing contrast is
"부모는 미래의 성적을, 학생은 오늘의 동기를."
The right column explains how learning, competition, achievement, conditional payback
and another learning goal connect into a repeat-use cycle.
Preserve the official logo, navy / white / cyan palette, headline and exact slogan
"Learn, Achieve, Get Rewarded". No product screen, stock people, invented metrics,
cash illustrations, 3D visuals, glow or generated artwork. Keep v2 unchanged.

## Native-vector execution

This is a revision of existing editable vector artwork, an explicit exception to
the imagegen workflow. No built-in image-generation call or CLI fallback was used.
ReportLab and fontTools author equivalent PDF and outlined SVG; Sharp rasterizes
the vector source for the PNG preview. Text is not redrawn over a generated bitmap.

- Logo: original repository `public/images/brand/matths-logo-light.svg`, rendered to `assets/official-logo.png` in v2; reused unchanged.
- Fonts: [SUIT](https://github.com/sun-typeface/SUIT), Regular / Bold / ExtraBold, original OFL license included.
- QR: real matrix encoding `https://www.matths.kr/intro`, M error correction, four-module quiet zone.
- Contact: `dltkddbs4553@matths.kr`, previously verified against the public introduction page.
- Displayed website: `www.matths.kr`; the QR still links to its service introduction page.
- Reference principles inherited from v2: consistent alignment, clear typography hierarchy, restrained geometric explanation and whitespace; no reference artwork copied.

## Claim boundary

The parent-to-student reward message reflects the founder's requested model.
Rewards are expressly conditional. The current account / manual payout workflow
does not alone establish that every recipient is the student rather than a guardian.
Confirm actual student / guardian recipient policy before distribution. This
poster does not claim measured retention, learning efficacy or market-wide adoption.

## Rebuild and verification

Run `build_poster.py` with ReportLab, Pillow, fontTools and qrcode. Rasterize the SVG
with Sharp to 3508 px width at 300 ppi. Render the PDF with Poppler into
`qa/pdf-render.png`, inspect it visually, then run `verify_poster.py` with zxing-cpp.
Checks cover all required text, safe text edges, glyph coverage, exact single-page
A3 geometry, logo fidelity, absence of service screenshots, clickable links and
QR decoding in both the final PNG and the independent PDF render.
