import { BluerError } from "./errors.ts";

/**
 * The owner's plain version of a skill: a title, numbered steps and optional
 * notes. It is stored as intent.md and is never changed automatically.
 */
export interface Intent {
  title: string;
  steps: string[];
  /** Lines that are neither the title nor a step, for example "We have a cat, so do not use bleach." */
  notes: string[];
}

// "1. clean", "2) clean", "- clean", "* clean", "• clean"
const STEP_LINE = /^\s*(?:\d+[.)、]|[-*•])\s*(.+?)\s*$/u;
// A step number inside one line of text: "house work, 1. clean the table, 2. ..."
const INLINE_MARKER = /(^|[\s,;:，；：、])(\d+)[.)、]\s*/gu;
const TRAILING_PUNCT = /[\s,;:，；：、。.]+$/u;

function clean(text: string): string {
  return text.replace(/^[#\s]+/u, "").replace(TRAILING_PUNCT, "").trim();
}

/**
 * Read the owner's text. It accepts a title line followed by one step per line,
 * or everything on one line, as a person would type it in chat:
 *
 *   Doing house work, 1. clean the table, 2. clean the restroom
 */
export function parseIntent(text: string): Intent {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const stepLines = lines.filter((line) => STEP_LINE.test(line));
  if (lines.length > 1 && stepLines.length > 0) {
    const others = lines.filter((line) => !STEP_LINE.test(line)).map(clean);
    const title = others[0];
    if (!title) {
      throw new BluerError('Add a title line before the steps, for example "Doing house work".');
    }
    const steps = stepLines.map((line) => clean(STEP_LINE.exec(line)?.[1] ?? "")).filter(Boolean);
    return { title, steps, notes: others.slice(1).filter(Boolean) };
  }

  return parseInline(lines.join(" "));
}

function parseInline(text: string): Intent {
  const markers = [...text.matchAll(INLINE_MARKER)];
  const first = markers[0];
  if (!first) {
    throw new BluerError(
      'I could not find any steps. Number them, for example: "Doing house work, 1. clean the table, 2. clean the kitchen".',
    );
  }
  // A marker match starts with the character before the number; skip it.
  const startOf = (m: RegExpExecArray): number => (m.index ?? 0) + (m[1] ?? "").length;
  const title = clean(text.slice(0, startOf(first)));
  if (!title) {
    throw new BluerError('Add a title before the steps, for example "Doing house work, 1. clean the table".');
  }
  const steps = markers
    .map((m, i) => {
      const next = markers[i + 1];
      return clean(text.slice((m.index ?? 0) + m[0].length, next ? startOf(next) : text.length));
    })
    .filter(Boolean);
  return { title, steps, notes: [] };
}

export function formatIntent(intent: Intent): string {
  const steps = intent.steps.map((step, i) => `${i + 1}. ${step}`).join("\n");
  const notes = intent.notes.length > 0 ? `\n\n${intent.notes.join("\n")}` : "";
  return `# ${intent.title}\n\n${steps}${notes}\n`;
}

/** A skill name from a title: "Doing house work" → "doing-house-work". Empty when the title has no Latin letters or digits. */
export function slugify(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
}

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Agent Skills names: lowercase letters, digits and single hyphens, at most 64 characters. */
export function checkName(name: string): void {
  if (name.length > 64 || !NAME.test(name)) {
    throw new BluerError(
      `"${name}" is not a valid skill name. Use lowercase letters, digits and hyphens, for example "house-work".`,
    );
  }
}
