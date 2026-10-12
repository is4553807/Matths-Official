#!/usr/bin/env python3
"""Place an Arena grid behind handwriting generated on white paper.

Image generation happens separately with the built-in image tool. This utility
only normalizes the white paper and performs deterministic grid composition.
"""

import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageChops, ImageOps

GRID_RENDERER = Path(__file__).resolve().with_name('renderMatthsNoteGrid.cjs')


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def compose(args):
    source_path = args.input.resolve()
    output_path = args.output.resolve()
    grid_path = args.grid_output.resolve()
    white_path = args.white_output.resolve()
    manifest_path = args.manifest.resolve()
    targets = [output_path, grid_path, white_path, manifest_path]
    if len(set(targets + [source_path])) != 5:
        raise ValueError('Input and output paths must all be distinct.')
    if any(path.exists() for path in targets):
        raise FileExistsError('Choose new output paths; existing files are preserved.')
    if not 200 <= args.white_level <= 255:
        raise ValueError('Invalid white normalization level.')
    node = shutil.which('node')
    if not node:
        raise RuntimeError('Node.js is required for the shared Matths note-grid renderer.')
    spec = json.loads(subprocess.run([node, str(GRID_RENDERER), '--spec', 'true'],
                                    text=True, capture_output=True, check=True).stdout)
    pixel_ratio = args.pixel_ratio if args.pixel_ratio is not None else spec['exportScale']
    if pixel_ratio <= 0:
        raise ValueError('Pixel ratio must be positive.')

    with Image.open(source_path) as opened:
        source = ImageOps.exif_transpose(opened).convert('RGB')
    width, height = source.size

    # Turn almost-white generator noise into pure white. Dark pen strokes remain
    # dark; the unmodified generated source is retained as a separate file.
    level = args.white_level
    lookup = [min(255, round(value * 255 / level)) for value in range(256)]
    if args.remove_legacy_blue_grid:
        # One-time migration of the earlier generated blue-grid previews.
        # Dark monochrome pen strokes are retained; colored pale grid pixels
        # are removed. New images must be generated on plain white paper.
        luminance = Image.new('L', source.size)
        luminance.putdata([
            255 if blue - red > 3 and min(red, green, blue) > 170
            else max(red, green, blue)
            for red, green, blue in source.getdata()
        ])
    else:
        luminance = ImageOps.grayscale(source)
    white = luminance.point(lookup).convert('RGB')

    for path in targets:
        path.parent.mkdir(parents=True, exist_ok=True)
    rendered = subprocess.run([node, str(GRID_RENDERER), '--width', str(width / pixel_ratio),
                               '--height', str(height / pixel_ratio), '--scale', str(pixel_ratio),
                               '--png', str(grid_path)], text=True, capture_output=True, check=True)
    renderer_metadata = json.loads(rendered.stdout)
    with Image.open(grid_path) as opened:
        grid = opened.convert('RGB')

    # Multiply places the grid behind the ink: white paper reveals the grid,
    # while black handwriting remains black even at line intersections.
    result = ImageChops.multiply(white, grid)
    assert result.size == source.size
    assert ImageChops.subtract(result, white).getbbox() is None
    white.save(white_path)
    result.save(output_path)
    manifest = {
        'schemaVersion': 'MATTHS_WHITE_HANDWRITING_GRID_COMPOSITION_V2',
        'generatedBackground': 'WHITE_ONLY',
        'gridCreatedBy': 'scripts/composeArenaHandwritingGrid.py',
        'gridGenerationUsesAI': False,
        'composition': 'grayscale white-paper normalization then RGB multiply',
        'size': [width, height],
        'noteGridSpec': spec,
        'pixelRatio': pixel_ratio,
        'spacingLogicalPoints': spec['spacing'],
        'spacingPixels': spec['spacing'] * pixel_ratio,
        'lineWidthLogicalPoints': spec['lineWidth'],
        'lineWidthPixels': spec['lineWidth'] * pixel_ratio,
        'gridRenderer': renderer_metadata['renderer'],
        'legacyGeneratedBlueGridRemoved': args.remove_legacy_blue_grid,
        'whiteNormalizationLevel': level,
        'inkGeometryResized': False,
        'sourceImage': str(source_path),
        'normalizedWhiteImage': str(white_path),
        'gridOnlyImage': str(grid_path),
        'compositedImage': str(output_path),
        'sourceSha256': sha256(source_path),
        'outputSha256': sha256(output_path),
    }
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True, help='Generated white-background handwriting PNG')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--white-output', type=Path, required=True)
    parser.add_argument('--grid-output', type=Path, required=True)
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--pixel-ratio', type=float, default=None, help='Raster pixels per logical point (default: shared app export scale)')
    parser.add_argument('--remove-legacy-blue-grid', action='store_true', help='One-time migration of older generated previews; new images use white backgrounds')
    parser.add_argument('--white-level', type=int, default=250)
    compose(parser.parse_args())


if __name__ == '__main__':
    main()
