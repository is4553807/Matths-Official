#!/usr/bin/env python3
"""Split the isolated 3x3 rank sheet into uniform transparent web assets."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


RANK_NAMES = (
    "bronze",
    "silver",
    "gold",
    "platinum",
    "emerald",
    "diamond",
    "master",
    "grandmaster",
    "challenger",
)

OUTPUT_SIZE = (512, 640)
ART_MAX_SIZE = (400, 560)


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    thresholded = alpha.point(lambda value: 255 if value >= 12 else 0)
    bounds = thresholded.getbbox()
    if not bounds:
        raise ValueError("No visible crest pixels were found in a grid cell.")
    return bounds


def split_crests(source: Path, output_dir: Path) -> None:
    sheet = Image.open(source).convert("RGBA")
    output_dir.mkdir(parents=True, exist_ok=True)

    for index, name in enumerate(RANK_NAMES):
        row, column = divmod(index, 3)
        left = round(sheet.width * column / 3)
        right = round(sheet.width * (column + 1) / 3)
        top = round(sheet.height * row / 3)
        bottom = round(sheet.height * (row + 1) / 3)
        cell = sheet.crop((left, top, right, bottom))

        art = cell.crop(alpha_bbox(cell))
        scale = min(
            ART_MAX_SIZE[0] / art.width,
            ART_MAX_SIZE[1] / art.height,
        )
        art = art.resize(
            (
                max(1, round(art.width * scale)),
                max(1, round(art.height * scale)),
            ),
            Image.Resampling.LANCZOS,
        )

        canvas = Image.new("RGBA", OUTPUT_SIZE, (0, 0, 0, 0))
        offset = (
            (OUTPUT_SIZE[0] - art.width) // 2,
            (OUTPUT_SIZE[1] - art.height) // 2,
        )
        canvas.alpha_composite(art, offset)
        canvas.save(output_dir / f"{name}.png", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    split_crests(args.source, args.output_dir)


if __name__ == "__main__":
    main()
