"""Render the bluer icon: plugins/claude-code/.claude-plugin/icon.png (1024 x 1024).

The icon is one leaf of the indigo plant (蓝). Its color runs from a plant teal at
the stem to a deep, bright blue at the tip: blue comes from the plant, yet it is
bluer than the plant (青出于蓝而胜于蓝).

Requires Python 3.10+ and Pillow:

    /tmp/demo-venv/bin/python docs/brand/render_icon.py
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "plugins" / "claude-code" / ".claude-plugin" / "icon.png"

SIZE = 1024
SS = 4  # supersampling factor, for smooth edges
N = SIZE * SS

BACKGROUND_TOP = (16, 24, 40)
BACKGROUND_BOTTOM = (8, 12, 22)
STEM_COLOR = (94, 184, 160)  # plant teal
MID_COLOR = (56, 132, 255)  # bright blue
TIP_COLOR = (64, 72, 230)  # deep indigo blue


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))  # type: ignore[return-value]


def vertical_gradient(top, bottom) -> Image.Image:
    img = Image.new("RGB", (N, N))
    d = ImageDraw.Draw(img)
    for y in range(N):
        d.line([(0, y), (N, y)], fill=lerp(top, bottom, y / (N - 1)))
    return img


R = 0.46  # circle radius, as a share of the canvas
OFFSET = 0.28  # circle centers' distance from the middle
HALF_LENGTH = math.sqrt(R * R - OFFSET * OFFSET)  # half the leaf's length
AXIS = (math.cos(math.radians(-45)), math.sin(math.radians(-45)))  # from stem to tip (up and to the right)


def point_on_axis(share: float) -> tuple[float, float]:
    """A point on the leaf's center line: -1 is the stem end, 1 is the tip."""
    c = N / 2
    return (c + AXIS[0] * share * HALF_LENGTH * N, c + AXIS[1] * share * HALF_LENGTH * N)


def leaf_mask() -> Image.Image:
    """A pointed leaf: the overlap of two circles, turned 45 degrees to lie along AXIS."""
    r, offset = int(N * R), int(N * OFFSET)
    cx, cy = N // 2, N // 2
    a = Image.new("L", (N, N), 0)
    b = Image.new("L", (N, N), 0)
    ImageDraw.Draw(a).ellipse([cx - r, cy - offset - r, cx + r, cy - offset + r], fill=255)
    ImageDraw.Draw(b).ellipse([cx - r, cy + offset - r, cx + r, cy + offset + r], fill=255)
    leaf = ImageChops.multiply(a, b)  # a vertical leaf
    return leaf.rotate(45, resample=Image.BICUBIC, center=(cx, cy))  # counter-clockwise: the tip points up and to the right


def axis_gradient() -> Image.Image:
    """Teal at the stem, bright blue in the middle, deep blue at the tip."""
    img = Image.new("RGB", (N, N))
    px = img.load()
    base = point_on_axis(-1)
    length = 2 * HALF_LENGTH * N
    for y in range(0, N, SS):
        for x in range(0, N, SS):
            t = ((x - base[0]) * AXIS[0] + (y - base[1]) * AXIS[1]) / length
            t = min(1.0, max(0.0, t))
            color = lerp(STEM_COLOR, MID_COLOR, t / 0.5) if t < 0.5 else lerp(MID_COLOR, TIP_COLOR, (t - 0.5) / 0.5)
            for dy in range(SS):
                for dx in range(SS):
                    px[x + dx, y + dy] = color
    return img


def main() -> None:
    canvas = vertical_gradient(BACKGROUND_TOP, BACKGROUND_BOTTOM)
    d = ImageDraw.Draw(canvas)

    # The stem, drawn first so the leaf covers its top.
    base = point_on_axis(-1)
    stem_end = (base[0] - AXIS[0] * N * 0.09, base[1] - AXIS[1] * N * 0.09)
    stem_in = point_on_axis(-0.8)
    d.line([stem_end, stem_in], fill=STEM_COLOR, width=int(N * 0.022))
    d.ellipse([stem_end[0] - N * 0.011, stem_end[1] - N * 0.011, stem_end[0] + N * 0.011, stem_end[1] + N * 0.011], fill=STEM_COLOR)

    # A soft glow behind the leaf.
    glow = leaf_mask().filter(ImageFilter.GaussianBlur(N * 0.045))
    glow_color = Image.new("RGB", (N, N), (40, 90, 210))
    canvas = Image.composite(glow_color, canvas, glow.point(lambda v: v * 0.5))

    # The leaf.
    leaf = leaf_mask()
    canvas = Image.composite(axis_gradient(), canvas, leaf)

    # The midrib: a vein that tapers from the stem to near the tip.
    d = ImageDraw.Draw(canvas)
    start, end_ = point_on_axis(-0.88), point_on_axis(0.72)
    normal = (-AXIS[1], AXIS[0])
    w0, w1 = N * 0.009, N * 0.002
    d.polygon(
        [
            (start[0] + normal[0] * w0, start[1] + normal[1] * w0),
            (end_[0] + normal[0] * w1, end_[1] + normal[1] * w1),
            (end_[0] - normal[0] * w1, end_[1] - normal[1] * w1),
            (start[0] - normal[0] * w0, start[1] - normal[1] * w0),
        ],
        fill=(18, 40, 96),
    )

    # Rounded-square corners.
    corners = Image.new("L", (N, N), 0)
    ImageDraw.Draw(corners).rounded_rectangle([0, 0, N - 1, N - 1], radius=int(N * 0.22), fill=255)
    out = Image.new("RGBA", (N, N), (0, 0, 0, 0))
    out.paste(canvas, (0, 0), corners)

    out = out.resize((SIZE, SIZE), Image.LANCZOS)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, optimize=True)
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
