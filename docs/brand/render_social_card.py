"""Render the GitHub social preview card: docs/brand/social-card.png (1280 x 640).

GitHub shows this card when someone shares the repo link. Upload it by hand in
the repo's Settings > General > Social preview; the API cannot set it.

Requires Python 3.10+ and Pillow:

    python3 -m venv /tmp/card-venv && /tmp/card-venv/bin/pip install pillow
    /tmp/card-venv/bin/python docs/brand/render_social_card.py

Fonts: Menlo and Hiragino Sans GB on macOS; set BLUER_CARD_MONO and
BLUER_CARD_CJK to font files elsewhere.
"""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ICON = ROOT / "plugins" / "claude-code" / ".claude-plugin" / "icon.png"
OUT = ROOT / "docs" / "brand" / "social-card.png"

W, H = 1280, 640
BG = (13, 17, 23)
WHITE = (240, 246, 252)
TEXT = (201, 209, 217)
DIM = (125, 133, 144)
BLUE = (88, 166, 255)

MONO_FILES = ["/System/Library/Fonts/Menlo.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"]
CJK_FILES = ["/System/Library/Fonts/Hiragino Sans GB.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"]


def font(env: str, files: list[str], size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    for path in [os.environ.get(env, ""), *files]:
        if path and Path(path).exists():
            return ImageFont.truetype(path, size, index=index)
    raise SystemExit(f"No font found; set {env} to a font file.")


def main() -> None:
    card = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(card)

    icon = Image.open(ICON).convert("RGBA").resize((300, 300), Image.LANCZOS)
    card.paste(icon, (110, (H - 300) // 2), icon)

    x = 470
    d.text((x, 150), "bluer", font=font("BLUER_CARD_MONO", MONO_FILES, 96, index=1), fill=WHITE)
    tagline = font("BLUER_CARD_MONO", MONO_FILES, 30)
    d.text((x, 280), "Agent skills you write in three lines,", font=tagline, fill=TEXT)
    d.text((x, 322), "that get better every time they run.", font=tagline, fill=TEXT)
    d.text((x, 395), "青出于蓝而胜于蓝", font=font("BLUER_CARD_CJK", CJK_FILES, 34), fill=BLUE)
    small = font("BLUER_CARD_MONO", MONO_FILES, 22)
    d.text((x, 470), "Claude Code · OpenAI Codex · MIT", font=small, fill=DIM)
    d.text((x, 505), "github.com/BulldromeQ/bluer-skills", font=small, fill=DIM)

    card.save(OUT, optimize=True)
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
