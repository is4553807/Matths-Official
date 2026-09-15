# Matths networking poster v2

## Deliverables

- `../matths-networking-poster-v2.png`: A3-proportioned artwork, 3508 × 4960 px, 300 ppi.
- `../matths-networking-poster-v2.svg`: portable vector artwork, with all poster copy outlined and the original UI embedded. Import this file into Figma without relying on locally installed fonts.
- `matths-networking-poster-editable-text.svg`: text-editable companion, using SUIT. Install the included OFL-licensed fonts before editing text in a design tool.
- Project-level `output/pdf/matths-networking-poster-a3-v2.pdf`: one-page, exact A3 PDF, with embedded fonts, vector typography/lines/QR and clickable links.

## Final design brief

Create a Korean startup-networking poster for Matths. Preserve the slogan
"Learn, Achieve, Get Rewarded". Lead with "부모의 교육비가, 학생의 성과 보상으로."
Explain both the education-fee flow and the learning/competition/achievement/
conditional-reward/relearning cycle. Show one real product capture. Use the
official logo, navy/white/cyan palette, consistent left alignment, a restrained
typographic hierarchy and generous margins. Include a real, decodable website
QR and the public business contact. No invented user metrics, simulated UI,
stock students, coins, money imagery, glow, 3D stairs or generated artwork.

## Design references, reviewed 2026-09-14

- [Reddit: typography poster feedback](https://www.reddit.com/r/graphic_design/comments/1sj3der/typography_posters/): search-indexed feedback on typographic hierarchy and negative space. The full page was not visually accessible due to Reddit's human-verification screen; no CAPTCHA was bypassed.
- [Reddit: motivational poster critique](https://www.reddit.com/r/graphic_design/comments/1osw6sm/need_feedback_on_this_motivational_poster/): readable page and discussion about alignment, a middle tier of type and reducing disconnected decoration. Informed the uniform left alignment and short stage explanations. No artwork was copied.
- [Figma: infographic example](https://www.figma.com/templates/infographic-example/): inspected the actual page and its graphic visually in the browser. Informed the clean separation of text and geometric explanation; only composition principles were used, not the template or its artwork.

## Execution and source assets

The imagegen skill's vector/code-native exception was applied: this poster is
principally exact Korean typography, an existing logo, a real interface capture
and a QR. It was authored as native vector layout, not edited from a generated
image. The built-in image-generation tool and CLI fallback were not used for v2.

- Logo: `public/images/brand/matths-logo-light.svg`, rendered once at 1600 px into `assets/official-logo.png`. Geometry and colors were not modified.
- Interface: `public/images/home-devices/matths-iphone-dark.jpg`. Embedded unchanged, retaining aspect ratio; only the poster's display boundary has rounded corners. This capture is a product illustration, not evidence of current engagement or performance.
- Typography: [SUIT](https://github.com/sun-typeface/SUIT), Regular/Bold/ExtraBold; original license included in `fonts/OFL-LICENSE.txt`.
- QR: encoded from `https://www.matths.kr/intro` using a real QR matrix, medium error correction and a four-module white quiet zone. Not drawn or hallucinated by an image generator.
- Contact: public business email `dltkddbs4553@matths.kr`, verified on the service introduction page.

## Copy boundary

The parent-to-student reward headline represents the founder's requested business
model. Rewards are expressly conditional. The implementation provides account
registration and a manual payout-confirmation workflow; it does not by itself
prove that every payout recipient is the student rather than a guardian.
Confirm the student/guardian recipient policy before distributing this as an
unqualified operational claim. No usage, retention, revenue or learning-effect
figures have been invented.

## Rebuild and verify

Use the bundled Python runtime with `reportlab`, Pillow, `fonttools`, `qrcode`
and `zxing-cpp`. Run `build_poster.py`, render the SVG with Sharp at 3508 px width
and 300 ppi, and render the PDF with Poppler into `qa/pdf-render.png` for visual review. Run
`verify_poster.py` against the latest files after every change.

Validation includes exact copy, font glyph coverage, text widths and safe edges,
one-page A3 geometry, clickable PDF links, and QR decoding in both the delivered
PNG and the actual PDF render. Visual review additionally checks clipping,
alignment, screenshot fidelity, hierarchy and spacing. Results are recorded in
`verification.json`.
