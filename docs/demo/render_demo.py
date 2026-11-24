"""Render the README demo: docs/demo/bluer-demo.gif (and an .mp4 for sharing).

The demo is a scripted animation, not a screen recording, so it renders the
same way each time. Each agent line paraphrases what Claude Code said in a live
test of the plugin; keep it that way when you change the story.

Requires Python 3.10+, Pillow and ffmpeg:

    python3 -m venv /tmp/demo-venv && /tmp/demo-venv/bin/pip install pillow
    /tmp/demo-venv/bin/python docs/demo/render_demo.py

Fonts: Menlo and Hiragino Sans GB on macOS; set BLUER_DEMO_MONO and
BLUER_DEMO_CJK to font files elsewhere.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import textwrap
from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT_DIR = Path(__file__).resolve().parent
W, H = 1280, 720
SCALE = 1  # render size multiplier

# Colors (GitHub dark, with bluer's blue as the accent).
BG = (13, 17, 23)
PANEL = (22, 27, 34)
BORDER = (48, 54, 61)
TEXT = (201, 209, 217)
DIM = (125, 133, 144)
BLUE = (88, 166, 255)
GREEN = (63, 185, 80)
GOLD = (210, 153, 34)
HIGHLIGHT = (23, 46, 77)
CAPTION_BG = (31, 111, 235)
WHITE = (240, 246, 252)


def font(path_env: str, defaults: list[str], size: int, index: int = 0) -> ImageFont.FreeTypeFont:
    candidates = [os.environ[path_env]] if os.environ.get(path_env) else defaults
    for path in candidates:
        if Path(path).exists():
            return ImageFont.truetype(path, size * SCALE, index=index)
    sys.exit(f"No font found; set {path_env} to a font file.")


MONO_FILES = ["/System/Library/Fonts/Menlo.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"]
CJK_FILES = ["/System/Library/Fonts/Hiragino Sans GB.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"]
MONO = font("BLUER_DEMO_MONO", MONO_FILES, 17)
MONO_BOLD = font("BLUER_DEMO_MONO", MONO_FILES, 17, index=1)
SMALL = font("BLUER_DEMO_MONO", MONO_FILES, 14)
CAPTION = font("BLUER_DEMO_MONO", MONO_FILES, 20, index=1)
TITLE = font("BLUER_DEMO_MONO", MONO_FILES, 44, index=1)
CJK = font("BLUER_DEMO_CJK", CJK_FILES, 26)

CHAR_W = MONO.getlength("M") / SCALE
LINE_H = 24

# Layout: chat on the left, the two files on the right, a caption at the bottom.
MARGIN = 24
CHAT_X, CHAT_Y, CHAT_W = MARGIN, 104, 700
RIGHT_X = CHAT_X + CHAT_W + MARGIN
RIGHT_W = W - RIGHT_X - MARGIN
CAPTION_H = 56
BOTTOM = H - CAPTION_H - MARGIN


@dataclass
class Message:
    role: str  # "you", "agent" or "divider"
    text: str
    shown: int | None = None  # characters typed so far; None means all
    emphasis: str = ""  # paragraphs that contain this text are drawn in green


@dataclass
class Line:
    text: str
    kind: str = "text"  # "text", "heading", "rule", "dim"
    new: bool = False


@dataclass
class State:
    caption: str = ""
    chat: list[Message] = field(default_factory=list)
    intent: list[Line] = field(default_factory=list)
    skill: list[Line] = field(default_factory=list)
    version: int = 0
    intent_note: str = ""
    thinking: bool = False


def px(v: float) -> int:
    return int(v * SCALE)


def draw_text(d: ImageDraw.ImageDraw, xy: tuple[float, float], text: str, fill, f=MONO) -> None:
    d.text((px(xy[0]), px(xy[1])), text, fill=fill, font=f)


def rect(d: ImageDraw.ImageDraw, box: tuple[float, float, float, float], fill=None, outline=None, radius=8) -> None:
    d.rounded_rectangle([px(v) for v in box], radius=px(radius), fill=fill, outline=outline, width=px(1))


def wrap(text: str, width_chars: int) -> list[str]:
    lines: list[str] = []
    for para in text.split("\n"):
        lines.extend(textwrap.wrap(para, width_chars) or [""])
    return lines


def render_chat(d: ImageDraw.ImageDraw, state: State) -> None:
    rect(d, (CHAT_X, CHAT_Y - 40, CHAT_X + CHAT_W, BOTTOM), fill=PANEL, outline=BORDER)
    draw_text(d, (CHAT_X + 16, CHAT_Y - 30), "agent chat", DIM, SMALL)
    label_w = 8
    width_chars = int((CHAT_W - 32) / CHAR_W) - label_w
    rows: list[tuple[str, str, bool]] = []  # (label, text, emphasized)
    for m in state.chat:
        if m.role == "divider":
            rows.append(("--", m.text, True))
            rows.append(("", "", False))
            continue
        text = m.text if m.shown is None else m.text[: m.shown]
        cursor = m.shown is not None and m.shown < len(m.text)
        first = True
        for para in (text + ("▌" if cursor else "")).split("\n"):
            emphasized = bool(m.emphasis) and m.emphasis in para  # the whole paragraph, across wrapped rows
            for line in wrap(para, width_chars):
                rows.append((m.role if first else "", line, emphasized))
                first = False
        rows.append(("", "", False))
    if state.thinking:
        rows.append(("agent", "…", True))
    max_rows = int((BOTTOM - CHAT_Y - 12) / LINE_H)
    rows = rows[-max_rows:]
    y = CHAT_Y
    for label, line, emphasized in rows:
        x = CHAT_X + 16
        if label == "--":
            text = f" {line} "
            tw = MONO.getlength(text) / SCALE
            mid = CHAT_X + CHAT_W / 2
            d.line([px(CHAT_X + 16), px(y + 11), px(CHAT_X + CHAT_W - 16), px(y + 11)], fill=BORDER, width=px(1))
            d.rectangle([px(mid - tw / 2), px(y), px(mid + tw / 2), px(y + 22)], fill=PANEL)
            draw_text(d, (mid - tw / 2, y), text, GOLD)
        else:
            if label:
                draw_text(d, (x, y), f"{label} ›", BLUE if label == "you" else GREEN, MONO_BOLD)
            color = DIM if (label == "agent" and line == "…") else GREEN if emphasized else TEXT
            draw_text(d, (x + label_w * CHAR_W, y), line, color, MONO_BOLD if emphasized else MONO)
        y += LINE_H


def render_file(d: ImageDraw.ImageDraw, top: float, height: float, name: str, who: str, lines: list[Line], badge: str = "", note: str = "") -> None:
    rect(d, (RIGHT_X, top, RIGHT_X + RIGHT_W, top + height), fill=PANEL, outline=BORDER)
    draw_text(d, (RIGHT_X + 16, top + 12), name, WHITE, MONO_BOLD)
    draw_text(d, (RIGHT_X + 16 + MONO_BOLD.getlength(name) / SCALE + 12, top + 13), who, DIM, SMALL)
    if badge:
        bw = SMALL.getlength(badge) / SCALE + 16
        rect(d, (RIGHT_X + RIGHT_W - bw - 14, top + 10, RIGHT_X + RIGHT_W - 14, top + 34), fill=HIGHLIGHT, outline=BLUE, radius=11)
        draw_text(d, (RIGHT_X + RIGHT_W - bw - 6, top + 14), badge, BLUE, SMALL)
    d.line([px(RIGHT_X), px(top + 44), px(RIGHT_X + RIGHT_W), px(top + 44)], fill=BORDER, width=px(1))
    width_chars = int((RIGHT_W - 40) / CHAR_W)
    y = top + 54
    for line in lines:
        for i, chunk in enumerate(wrap(line.text, width_chars - (2 if line.kind == "rule" else 0))):
            if y > top + height - LINE_H:
                return
            if line.new:
                d.rectangle([px(RIGHT_X + 8), px(y - 2), px(RIGHT_X + RIGHT_W - 8), px(y + LINE_H - 4)], fill=HIGHLIGHT)
            color = {"heading": WHITE, "rule": TEXT, "dim": DIM}.get(line.kind, TEXT)
            indent = 16 if line.kind == "rule" and i > 0 else 0
            draw_text(d, (RIGHT_X + 16 + indent, y), chunk, GREEN if line.new and line.kind == "rule" else color, MONO_BOLD if line.kind == "heading" else MONO)
            y += LINE_H
    if note:
        draw_text(d, (RIGHT_X + RIGHT_W - SMALL.getlength(note) / SCALE - 16, top + height - 26), note, DIM, SMALL)


def render(state: State) -> Image.Image:
    img = Image.new("RGB", (px(W), px(H)), BG)
    d = ImageDraw.Draw(img)
    draw_text(d, (MARGIN, 20), "bluer", BLUE, MONO_BOLD)
    draw_text(d, (MARGIN + MONO_BOLD.getlength("bluer ") / SCALE, 22), "skills you write in three lines, that get better every time they run", DIM, SMALL)
    render_chat(d, state)
    intent_h = 232
    render_file(d, CHAT_Y - 40, intent_h, "intent.md", "yours, in your words", state.intent, note=state.intent_note)
    render_file(d, CHAT_Y - 40 + intent_h + 16, BOTTOM - (CHAT_Y - 40 + intent_h + 16), "SKILL.md", "what the agent reads", state.skill, badge=f"v{state.version}" if state.version else "")
    if state.caption:
        rect(d, (MARGIN, H - CAPTION_H - 8, W - MARGIN, H - 12), fill=CAPTION_BG, radius=10)
        tw = CAPTION.getlength(state.caption) / SCALE
        draw_text(d, ((W - tw) / 2, H - CAPTION_H + 5), state.caption, WHITE, CAPTION)
    return img


def end_card() -> Image.Image:
    img = Image.new("RGB", (px(W), px(H)), BG)
    d = ImageDraw.Draw(img)
    lines = [
        ("bluer skills", TITLE, BLUE, 210),
        ("Write three lines. Your agent learns the rest.", CAPTION, WHITE, 290),
        ("Your version stays short. Every change is a version you can undo.", MONO, DIM, 335),
        ("github.com/BulldromeQ/bluer-skills", MONO_BOLD, TEXT, 430),
        ("青出于蓝而胜于蓝", CJK, GOLD, 500),
    ]
    for text, f, color, y in lines:
        tw = f.getlength(text) / SCALE
        draw_text(d, ((W - tw) / 2, y), text, color, f)
    return img


# --- the story ---------------------------------------------------------------

STEPS = ["read my notes from this week", "write a short summary", "email it to my team"]


def intent_lines(steps: list[str], new_index: int | None = None) -> list[Line]:
    lines = [Line("# Weekly update email", "heading"), Line("")]
    lines += [Line(f"{i + 1}. {s}", new=i == new_index) for i, s in enumerate(steps)]
    return lines


def skill_lines(steps: list[str], rules: dict[int, list[str]], new_rules: set[str] = frozenset(), new_step: int | None = None) -> list[Line]:
    lines = [Line("# Weekly update email", "heading")]
    for i, step in enumerate(steps):
        lines.append(Line(f"## {i + 1}. {step}", "heading", new=i == new_step))
        for rule in rules.get(i, []):
            lines.append(Line(f"- {rule}", "rule", new=rule in new_rules))
    return lines


class Movie:
    def __init__(self) -> None:
        self.frames: list[tuple[Image.Image, int]] = []
        self.state = State()

    def hold(self, ms: int) -> None:
        self.frames.append((render(self.state), ms))

    def type(self, text: str, chars_per_frame: int = 3, frame_ms: int = 40) -> None:
        msg = Message("you", text, 0)
        self.state.chat.append(msg)
        for n in range(0, len(text) + chars_per_frame, chars_per_frame):
            msg.shown = min(n, len(text))
            self.hold(frame_ms)
        msg.shown = None
        self.hold(300)

    def reply(self, text: str, think_ms: int = 700, emphasis: str = "") -> None:
        self.state.thinking = True
        self.hold(think_ms)
        self.state.thinking = False
        self.state.chat.append(Message("agent", text, emphasis=emphasis))


def story() -> Movie:
    m = Movie()
    s = m.state
    s.intent_note = ""

    # 1. Write the steps.
    s.caption = "1 · Write the steps, the way you'd tell a person"
    m.hold(900)
    m.type("Make a skill for my weekly update email: 1. read my notes from this week, 2. write a short summary, 3. email it to my team")
    m.reply('Done: the skill "weekly-update-email" is ready. Type /weekly-update-email, or just ask for your weekly update.')
    s.intent = intent_lines(STEPS)
    s.skill = skill_lines(STEPS, {})
    s.version = 1
    m.hold(2600)

    # 2. Use it, and correct it once.
    s.caption = "2 · Correct it once. You see what it learned."
    m.type("/weekly-update-email shipped search, fixed three bugs, onboarded Ana")
    m.reply("Draft (not sent):\nHi team, here is my update for this week. This week was a busy one. First, I shipped the new search page, which took most of the week. Second, I fixed three bugs...")
    m.hold(1600)
    m.type("Too long. Keep it under 150 words, and always CC my manager Sam.")
    m.reply(
        'weekly-update-email learned: "keep it under 150 words". It does this every time now. Say "undo that" to remove it.\n\n'
        'weekly-update-email learned: "always CC my manager Sam". It does this every time now. Say "undo that" to remove it.',
        emphasis="learned",
    )
    rules = {1: ["Keep it under 150 words"], 2: ["Always CC my manager Sam"]}
    s.skill = skill_lines(STEPS, rules, new_rules={"Keep it under 150 words", "Always CC my manager Sam"})
    s.version = 3
    s.intent_note = "unchanged"
    m.hold(3400)

    # 3. Next week, it remembers.
    s.caption = "3 · Next week, in a new session, it remembers"
    s.skill = skill_lines(STEPS, rules)
    s.intent_note = ""
    s.chat = [Message("divider", "next week · new session")]
    m.hold(900)
    m.type("/weekly-update-email shipped the login page, met the design team")
    m.reply("Draft (not sent):\nTo: team   CC: Sam\nHi team, this week I shipped the login page and met the design team. Thanks!", emphasis="CC: Sam")
    s.skill = skill_lines(STEPS, rules, new_rules={"Keep it under 150 words", "Always CC my manager Sam"})
    s.intent_note = "still 3 lines"
    m.hold(3400)

    # 4. Change your version; nothing learned is lost.
    s.caption = "4 · Add a step. Nothing it learned is lost."
    m.type("Add a step to my weekly update: 4. add my plan for next week")
    m.reply("Added step 4. Your other steps and the two rules are unchanged.")
    steps4 = STEPS + ["add my plan for next week"]
    s.intent = intent_lines(steps4, new_index=3)
    s.skill = skill_lines(steps4, rules, new_step=3)
    s.version = 4
    s.intent_note = "4 lines, still yours"
    m.hold(3600)

    m.frames.append((end_card(), 3500))
    return m


def encode(frames: list[tuple[Image.Image, int]]) -> None:
    if not shutil.which("ffmpeg"):
        sys.exit("ffmpeg is needed: https://ffmpeg.org")
    with tempfile.TemporaryDirectory() as tmp:
        listing = []
        for i, (img, ms) in enumerate(frames):
            path = Path(tmp, f"f{i:04d}.png")
            img.save(path)
            listing.append(f"file '{path}'\nduration {ms / 1000:.3f}")
        listing.append(f"file '{Path(tmp, f'f{len(frames) - 1:04d}.png')}'")  # ffmpeg needs the last file twice
        concat = Path(tmp, "frames.txt")
        concat.write_text("\n".join(listing) + "\n")
        base = ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(concat)]
        gif = OUT_DIR / "bluer-demo.gif"
        palette = "fps=20,split[a][b];[a]palettegen=max_colors=48:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle"
        subprocess.run([*base, "-vf", palette, "-loop", "0", str(gif)], check=True)
        mp4 = OUT_DIR / "bluer-demo.mp4"
        subprocess.run([*base, "-vf", "fps=30,format=yuv420p", "-c:v", "libx264", "-crf", "20", "-movflags", "+faststart", str(mp4)], check=True)
        print(f"{gif.name}: {gif.stat().st_size / 1024:.0f} KB, {mp4.name}: {mp4.stat().st_size / 1024:.0f} KB, {sum(ms for _, ms in frames) / 1000:.1f} s")


if __name__ == "__main__":
    movie = story()
    if len(sys.argv) == 3 and sys.argv[1] == "--stills":
        # Save a few frames as PNG to check the layout without encoding.
        out = Path(sys.argv[2])
        out.mkdir(parents=True, exist_ok=True)
        for i in sorted({len(movie.frames) // 5, len(movie.frames) // 2, len(movie.frames) - 2, len(movie.frames) - 1}):
            movie.frames[i][0].save(out / f"still-{i:04d}.png")
        print(f"wrote stills to {out}")
    else:
        encode(movie.frames)
