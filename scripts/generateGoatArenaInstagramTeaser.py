#!/usr/bin/env python3
"""Generate the GOAT Arena connected Instagram teaser campaign."""

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "output" / "social" / "goat-arena-coming-soon-20260809"
OUT = ROOT / "output" / "social" / "goat-arena-coming-soon-20260809-v8-clean"
MASTER_SOURCE = SOURCE_DIR / "goat-arena-triptych-master-generated.png"
MATTHS_MARK = ROOT / "public" / "images" / "matths-mark.png"

WIDTH = 1080
HEIGHT = 1440
PANORAMA_WIDTH = WIDTH * 3

FONT_KR = "/System/Library/Fonts/AppleSDGothicNeo.ttc"

NIGHT = (7, 9, 19)
NAVY = (10, 16, 34)
WHITE = (246, 247, 255)
MUTED = (155, 167, 201)
VIOLET = (118, 84, 247)
BLUE = (49, 87, 246)
CYAN = (25, 199, 233)
MAGENTA = (216, 66, 238)
GOLD = (232, 196, 111)


def font(size: int, weight: str = "regular") -> ImageFont.FreeTypeFont:
    indices = {
        "light": 8,
        "regular": 0,
        "medium": 2,
        "semibold": 4,
        "bold": 6,
        "extrabold": 14,
        "heavy": 16,
    }
    return ImageFont.truetype(FONT_KR, size, index=indices[weight])


def horizontal_gradient(width: int, height: int, stops: list[tuple[float, tuple[int, int, int]]]) -> Image.Image:
    x = np.linspace(0.0, 1.0, width)
    arr = np.zeros((height, width, 4), dtype=np.uint8)
    for index in range(len(stops) - 1):
        start_pos, start_color = stops[index]
        end_pos, end_color = stops[index + 1]
        mask = (x >= start_pos) & (x <= end_pos)
        t = np.zeros_like(x)
        t[mask] = (x[mask] - start_pos) / max(end_pos - start_pos, 1e-6)
        for channel in range(3):
            values = start_color[channel] + (end_color[channel] - start_color[channel]) * t
            arr[:, mask, channel] = values[mask].astype(np.uint8)
    arr[:, :, 3] = 255
    return Image.fromarray(arr, "RGBA")


def vertical_gradient(width: int, height: int, top, bottom, top_alpha=255, bottom_alpha=255) -> Image.Image:
    y = np.linspace(0.0, 1.0, height)[:, None]
    arr = np.zeros((height, width, 4), dtype=np.uint8)
    for channel in range(3):
        arr[:, :, channel] = (top[channel] + (bottom[channel] - top[channel]) * y).astype(np.uint8)
    arr[:, :, 3] = (top_alpha + (bottom_alpha - top_alpha) * y).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def cover_image(image: Image.Image, size: tuple[int, int], centering=(0.5, 0.5)) -> Image.Image:
    return ImageOps.fit(image.convert("RGB"), size, method=Image.Resampling.LANCZOS, centering=centering).convert("RGBA")


def draw_tracked_text(draw: ImageDraw.ImageDraw, xy, text, typeface, fill, tracking=0, anchor="la"):
    x, y = xy
    if tracking == 0:
        draw.text((x, y), text, font=typeface, fill=fill, anchor=anchor)
        return
    if anchor != "la":
        width = sum(draw.textlength(char, font=typeface) for char in text) + tracking * max(len(text) - 1, 0)
        if anchor.startswith("m"):
            x -= width / 2
        elif anchor.startswith("r"):
            x -= width
    for char in text:
        draw.text((x, y), char, font=typeface, fill=fill, anchor="la")
        x += draw.textlength(char, font=typeface) + tracking


def tracked_text_width(draw: ImageDraw.ImageDraw, text: str, typeface, tracking=0) -> float:
    return sum(draw.textlength(char, font=typeface) for char in text) + tracking * max(len(text) - 1, 0)


def gradient_text(image: Image.Image, xy, text, typeface, colors, tracking=0):
    x, y = xy
    mask = Image.new("L", image.size, 0)
    mask_draw = ImageDraw.Draw(mask)
    if tracking:
        draw_tracked_text(mask_draw, (x, y), text, typeface, 255, tracking=tracking)
    else:
        mask_draw.text((x, y), text, font=typeface, fill=255)
    gradient = horizontal_gradient(image.width, image.height, colors)
    gradient.putalpha(mask)
    image.alpha_composite(gradient)


def brand_header(image: Image.Image, label: str, dark_chip=False):
    draw = ImageDraw.Draw(image)
    mark = Image.open(MATTHS_MARK).convert("RGBA").resize((54, 54), Image.Resampling.LANCZOS)
    if dark_chip:
        draw.rounded_rectangle((62, 60, 430, 132), radius=36, fill=(7, 9, 19, 160), outline=(180, 193, 255, 45), width=1)
    image.alpha_composite(mark, (72, 69))
    draw.text((144, 66), "MATTHS", font=font(27, "heavy"), fill=WHITE)
    draw_tracked_text(draw, (145, 102), label, font(12, "bold"), MUTED, tracking=2)


def footer(image: Image.Image, index: str, hint=""):
    draw = ImageDraw.Draw(image)
    y = HEIGHT - 104
    draw.line((72, y, WIDTH - 72, y), fill=(141, 162, 255, 44), width=1)
    draw_tracked_text(draw, (72, y + 29), "GOAT ARENA", font(13, "bold"), MUTED, tracking=2)
    draw.text((WIDTH // 2, y + 27), index, font=font(15, "semibold"), fill=(196, 205, 231), anchor="ma")
    draw_tracked_text(draw, (WIDTH - 72, y + 29), hint, font(13, "bold"), CYAN, tracking=1, anchor="ra")


def glow_circle(image: Image.Image, center, radius, color, alpha=135):
    layer = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    x, y = center
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(*color, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.65))
    image.alpha_composite(layer)


def inner_background(accent="violet") -> Image.Image:
    base = vertical_gradient(WIDTH, HEIGHT, NIGHT, NAVY).convert("RGBA")
    color = {"violet": VIOLET, "blue": BLUE, "cyan": CYAN, "magenta": MAGENTA}[accent]
    glow_circle(base, (865, 250), 300, color, 100)
    glow_circle(base, (145, 1150), 310, VIOLET if accent != "violet" else CYAN, 58)
    draw = ImageDraw.Draw(base)
    for radius in (150, 245, 350):
        draw.ellipse((WIDTH - 180 - radius, 70 - radius, WIDTH - 180 + radius, 70 + radius), outline=(*color, 26), width=1)
    return base


def draw_kicker(draw: ImageDraw.ImageDraw, text: str, y=216, accent=CYAN):
    kicker_font = font(14, "bold")
    text_width = draw.textlength(text, font=kicker_font) + max(len(text) - 1, 0) * 2
    right = min(WIDTH - 72, 72 + int(text_width) + 46)
    draw.rounded_rectangle((72, y, right, y + 46), radius=23, fill=(16, 20, 44), outline=accent, width=1)
    draw_tracked_text(draw, (94, y + 12), text, kicker_font, accent, tracking=2)


def draw_body(draw: ImageDraw.ImageDraw, text: str, xy, size=31, fill=MUTED, spacing=16):
    draw.multiline_text(xy, text, font=font(size, "medium"), fill=fill, spacing=spacing)


def draw_info_note(draw: ImageDraw.ImageDraw, text: str, y: int, label="ARENA INFO", accent=CYAN, size=27):
    draw.line((72, y, WIDTH - 72, y), fill=(*accent, 210), width=2)
    draw.line((72, y, 184, y), fill=accent, width=6)
    draw_tracked_text(draw, (72, y + 25), label, font(12, "bold"), accent, tracking=2)
    draw.multiline_text((72, y + 58), text, font=font(size, "semibold"), fill=(213, 220, 241), spacing=10)


def draw_hud_card(draw: ImageDraw.ImageDraw, box, label: str, value: str, accent=CYAN):
    left, top, right, bottom = box
    draw.rounded_rectangle(box, radius=28, fill=(12, 16, 39), outline=(*accent, 210), width=2)
    draw_tracked_text(draw, (left + 30, top + 24), label, font(14, "bold"), accent, tracking=2)
    draw.text((left + 30, bottom - 34), value, font=font(38, "heavy"), fill=WHITE, anchor="ls")


def make_panorama() -> Image.Image:
    source = Image.open(MASTER_SOURCE).convert("RGBA")
    # The generated ram/portal axis sits right of the source midpoint. Crop from
    # farther right so that the visual axis lands at the exact center of feed 2
    # while preserving one continuous background across all three covers.
    panorama = cover_image(source, (PANORAMA_WIDTH, HEIGHT), centering=(0.985, 0.5))

    # Keep the lower platform dramatic while reserving calm text zones.
    top_shade = vertical_gradient(PANORAMA_WIDTH, 660, NIGHT, NIGHT, top_alpha=210, bottom_alpha=0)
    bottom_shade = vertical_gradient(PANORAMA_WIDTH, 630, NIGHT, NIGHT, top_alpha=0, bottom_alpha=232)
    panorama.alpha_composite(top_shade, (0, 0))
    panorama.alpha_composite(bottom_shade, (0, HEIGHT - 630))

    draw = ImageDraw.Draw(panorama)
    for panel in range(3):
        x0 = panel * WIDTH
        # The completed grid has one quiet brand signature: feed 3, at far left.
        if panel == 0:
            mark = Image.open(MATTHS_MARK).convert("RGBA").resize((50, 50), Image.Resampling.LANCZOS)
            panorama.alpha_composite(mark, (x0 + 76, 72))
            draw.text((x0 + 144, 68), "MATTHS", font=font(27, "heavy"), fill=WHITE)
            draw_tracked_text(draw, (x0 + 145, 104), "GOAT ARENA PROJECT", font(11, "bold"), MUTED, tracking=2)
        draw.line((x0 + 76, HEIGHT - 130, x0 + WIDTH - 76, HEIGHT - 130), fill=(152, 169, 244, 50), width=1)

    # Grid-left tile: final upload / campaign close.
    # Use an outer-edge axis so the word opens toward the center artwork.
    draw_tracked_text(draw, (82, 515), "COMING", font(145, "heavy"), WHITE, tracking=-3)
    draw.text((86, 690), "배운 실력, 랭크로 증명하라.", font=font(32, "semibold"), fill=(211, 218, 239))
    draw_tracked_text(draw, (82, HEIGHT - 96), "LEARN · TEST · COMPETE", font(13, "bold"), (183, 196, 230), tracking=2)

    # Center tile: the reveal. Keep the generated ram symbol unobstructed.
    center_x = WIDTH
    draw.text((center_x + WIDTH // 2, 905), "GOAT", font=font(126, "heavy"), fill=WHITE, anchor="ma")
    arena_typeface = font(128, "heavy")
    arena_tracking = -2
    arena_width = tracked_text_width(draw, "ARENA", arena_typeface, arena_tracking)
    arena_x = center_x + (WIDTH - arena_width) / 2
    gradient_text(
        panorama,
        (arena_x, 1030),
        "ARENA",
        arena_typeface,
        [(0.0, MAGENTA), (0.5, VIOLET), (1.0, CYAN)],
        tracking=arena_tracking,
    )
    draw.text((center_x + WIDTH // 2, 1190), "1 VS 1 · MATH RANKED", font=font(29, "semibold"), fill=(220, 225, 244), anchor="ma")
    draw_tracked_text(draw, (center_x + WIDTH // 2, HEIGHT - 96), "1 VS 1 · MATH COMPETITION", font(13, "bold"), CYAN, tracking=2, anchor="ma")

    # Grid-right tile: first upload / initial teaser.
    right_x = WIDTH * 2
    # Mirror the left tile instead of centering both words independently. The
    # right edge follows the same 82px margin and leaves the energy flow open
    # toward the portal in the middle panel.
    draw_tracked_text(draw, (right_x + WIDTH - 82, 515), "SOON", font(176, "heavy"), WHITE, tracking=-2, anchor="ra")
    draw.text((right_x + WIDTH - 86, 710), "전국 수학 랭킹전이 시작된다.", font=font(32, "semibold"), fill=(211, 218, 239), anchor="ra")
    draw_tracked_text(draw, (right_x + WIDTH - 82, HEIGHT - 96), "GOAT ARENA · COMING SOON", font(13, "bold"), CYAN, tracking=2, anchor="ra")
    return panorama


def save_post_1(out_files):
    # Post 1 is uploaded first and therefore occupies the right side of the final grid.
    image = inner_background("violet")
    draw = ImageDraw.Draw(image)
    draw_kicker(draw, "THE NATIONAL RANKING", y=126, accent=GOLD)
    draw_tracked_text(draw, (72, 294), "YOUR RANK", font(28, "heavy"), MUTED, tracking=2)
    gradient_text(image, (72, 350), "# ???", font(150, "heavy"), [(0.0, GOLD), (0.55, VIOLET), (1.0, CYAN)], tracking=-3)
    draw.text((72, 570), "전국에서", font=font(88, "heavy"), fill=WHITE)
    draw.text((72, 690), "너의 위치를", font=font(88, "heavy"), fill=WHITE)
    gradient_text(image, (72, 810), "증명하라.", font(100, "heavy"), [(0.0, GOLD), (0.55, VIOLET), (1.0, CYAN)], tracking=0)
    draw_info_note(draw, "개인 최종 종합 순위로\n전국에서의 현재 위치를 공개", 1010, label="RANK INFO", accent=GOLD)
    footer(image, "02 / 03")
    path = OUT / "post-01_slide-02-national-ranking.png"
    image.convert("RGB").save(path, quality=95)
    out_files.append(path)

    image = inner_background("cyan")
    draw = ImageDraw.Draw(image)
    draw_kicker(draw, "SCHOOL LEADERBOARD", y=126, accent=CYAN)
    draw.text((72, 290), "너의 성적으로", font=font(88, "heavy"), fill=WHITE)
    draw.text((72, 412), "학교의 이름을", font=font(88, "heavy"), fill=WHITE)
    gradient_text(image, (72, 540), "랭킹에 올려라.", font(100, "heavy"), [(0.0, VIOLET), (1.0, CYAN)], tracking=0)
    draw_info_note(draw, "개인 최종 종합 순위를 바탕으로\n학교 평균 랭킹을 산정", 790, label="RANKING FORMULA", accent=CYAN, size=31)
    footer(image, "03 / 03")
    path = OUT / "post-01_slide-03-school-ranking.png"
    image.convert("RGB").save(path, quality=95)
    out_files.append(path)


def save_post_2(out_files):
    image = inner_background("blue")
    draw = ImageDraw.Draw(image)
    draw_kicker(draw, "EQUAL GROUND", y=126, accent=GOLD)
    draw.text((72, 292), "같은 난이도.", font=font(96, "heavy"), fill=WHITE)
    draw.text((72, 425), "같은 주관식 5문항.", font=font(74, "heavy"), fill=WHITE)
    draw.text((72, 590), "오직 실력으로", font=font(88, "heavy"), fill=WHITE)
    gradient_text(image, (72, 708), "승부하라.", font(106, "heavy"), [(0.0, GOLD), (0.5, VIOLET), (1.0, CYAN)], tracking=0)
    draw_hud_card(draw, (72, 900, WIDTH - 72, 1058), "MATCH LIMIT", "문항당 최대 10분 · 이전 문항 이동 불가", accent=GOLD)
    draw_info_note(draw, "점수 → 정답 수 → 정답 문항 풀이시간\n→ 전체 풀이시간 순으로 승패 판정", 1100, label="WIN CONDITION", accent=GOLD, size=25)
    footer(image, "02 / 03")
    path = OUT / "post-02_slide-02-same-conditions.png"
    image.convert("RGB").save(path, quality=95)
    out_files.append(path)

    image = inner_background("magenta")
    draw = ImageDraw.Draw(image)
    draw_kicker(draw, "TAKE THE HIGHER RANK", y=126, accent=GOLD)
    draw.text((72, 286), "이겨라,", font=font(116, "heavy"), fill=WHITE)
    gradient_text(image, (72, 445), "랭크를 빼앗아라.", font(96, "heavy"), [(0.0, GOLD), (0.5, MAGENTA), (1.0, VIOLET)], tracking=0)
    draw_hud_card(draw, (72, 650, 390, 820), "ATTACKER", "YOU", accent=CYAN)
    draw_hud_card(draw, (690, 650, WIDTH - 72, 820), "DEFENDER", "OPPONENT", accent=GOLD)
    draw.text((WIDTH // 2, 730), "⇄", font=font(68, "heavy"), fill=GOLD, anchor="mm")
    draw_tracked_text(draw, (WIDTH // 2, 850), "ATTACKER WIN = FULL SWAP", font(16, "bold"), GOLD, tracking=2, anchor="ma")
    draw_info_note(
        draw,
        "도전자 승리: 티어 · 티어 내 순위 · GP 전체 스왑\n방어자 승리: 두 사용자의 Arena 순위 유지",
        930,
        label="RESULT RULE",
        accent=GOLD,
        size=25,
    )
    footer(image, "03 / 03")
    path = OUT / "post-02_slide-03-rank-swap.png"
    image.convert("RGB").save(path, quality=95)
    out_files.append(path)


def save_post_3(out_files):
    image = inner_background("violet")
    draw = ImageDraw.Draw(image)
    draw_kicker(draw, "CLAIM YOUR FIRST TIER", y=126, accent=GOLD)
    draw.text((72, 286), "배치고사로", font=font(98, "heavy"), fill=WHITE)
    draw.text((72, 420), "시작 티어를", font=font(98, "heavy"), fill=WHITE)
    gradient_text(image, (72, 554), "확정하라.", font(114, "heavy"), [(0.0, GOLD), (0.55, VIOLET), (1.0, CYAN)], tracking=0)
    draw_hud_card(draw, (72, 760, WIDTH - 72, 940), "YOUR STARTING TIER", "???", accent=GOLD)
    draw_info_note(draw, "배치고사 결과가 GOAT Arena의\n첫 티어와 시작 위치를 결정", 1010, label="PLACEMENT INFO", accent=GOLD)
    footer(image, "02 / 03")
    path = OUT / "post-03_slide-02-placement.png"
    image.convert("RGB").save(path, quality=95)
    out_files.append(path)

    image = inner_background("cyan")
    draw = ImageDraw.Draw(image)
    draw_kicker(draw, "RANKED ASCENSION", y=126, accent=GOLD)
    draw.text((72, 286), "자격을 증명하고,", font=font(84, "heavy"), fill=WHITE)
    draw.text((72, 410), "RANKED를", font=font(108, "heavy"), fill=WHITE)
    gradient_text(image, (72, 552), "해금하라.", font(118, "heavy"), [(0.0, GOLD), (0.55, VIOLET), (1.0, CYAN)], tracking=-1)
    draw_hud_card(draw, (72, 760, 430, 930), "STEP 01", "UNRANKED", accent=VIOLET)
    draw.text((WIDTH // 2, 842), "→", font=font(60, "heavy"), fill=GOLD, anchor="mm")
    draw_hud_card(draw, (650, 760, WIDTH - 72, 930), "STEP 02", "RANKED", accent=CYAN)
    draw_info_note(draw, "Unranked에서 페이백 자격이 확정되면\nRanked 상위 경쟁 구간으로 진입", 1010, label="ENTRY CONDITION", accent=GOLD)
    footer(image, "03 / 03")
    path = OUT / "post-03_slide-03-ranked.png"
    image.convert("RGB").save(path, quality=95)
    out_files.append(path)


def contact_sheet(post_files: list[list[Path]]):
    thumb_width = 360
    thumb_height = 480
    gutter = 18
    label_height = 56
    canvas = Image.new("RGB", (thumb_width * 3 + gutter * 4, (thumb_height + label_height) * 3 + gutter * 4), NIGHT)
    draw = ImageDraw.Draw(canvas)
    for row, files in enumerate(post_files):
        draw.text((gutter, gutter + row * (thumb_height + label_height + gutter)), f"POST {row + 1} · UPLOAD {row + 1}", font=font(22, "bold"), fill=WHITE)
        y = gutter + label_height + row * (thumb_height + label_height + gutter)
        for column, path in enumerate(files):
            thumb = Image.open(path).convert("RGB").resize((thumb_width, thumb_height), Image.Resampling.LANCZOS)
            x = gutter + column * (thumb_width + gutter)
            canvas.paste(thumb, (x, y))
    canvas.save(OUT / "campaign-contact-sheet.png", quality=94)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    panorama = make_panorama()
    panorama.convert("RGB").save(OUT / "grid-master-3240x1440.png", quality=96)

    covers = {
        1: panorama.crop((WIDTH * 2, 0, WIDTH * 3, HEIGHT)),
        2: panorama.crop((WIDTH, 0, WIDTH * 2, HEIGHT)),
        3: panorama.crop((0, 0, WIDTH, HEIGHT)),
    }
    cover_paths = {}
    positions = {1: "right", 2: "center", 3: "left"}
    for post_number, cover in covers.items():
        path = OUT / f"post-{post_number:02d}_slide-01-cover-{positions[post_number]}.png"
        cover.convert("RGB").save(path, quality=96)
        cover_paths[post_number] = path

    post_1_inner = []
    post_2_inner = []
    post_3_inner = []
    save_post_1(post_1_inner)
    save_post_2(post_2_inner)
    save_post_3(post_3_inner)

    post_files = [
        [cover_paths[1], *post_1_inner],
        [cover_paths[2], *post_2_inner],
        [cover_paths[3], *post_3_inner],
    ]
    contact_sheet(post_files)

    # Instagram displays newest first. Uploading posts 1 -> 2 -> 3 yields left=3, center=2, right=1.
    grid_preview = Image.new("RGB", (PANORAMA_WIDTH, HEIGHT), NIGHT)
    grid_preview.paste(Image.open(cover_paths[3]).convert("RGB"), (0, 0))
    grid_preview.paste(Image.open(cover_paths[2]).convert("RGB"), (WIDTH, 0))
    grid_preview.paste(Image.open(cover_paths[1]).convert("RGB"), (WIDTH * 2, 0))
    grid_preview.save(OUT / "instagram-grid-preview.png", quality=96)

    print(f"Generated {sum(len(items) for items in post_files)} campaign images in {OUT}")


if __name__ == "__main__":
    main()
