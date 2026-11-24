import { createHash } from "node:crypto";

/** Lowercase, collapse spaces and drop end punctuation, so that two ways of writing the same step or lesson compare equal. */
export function normalizeKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\s.,;:!?。，；：！？]+$/u, "")
    .trim();
}

/** Join lines and spaces into one line, for headings, commit messages and changelog entries. */
export function oneLine(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Today's date as YYYY-MM-DD in local time. */
export function todayIso(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole days from `from` to `to`, both YYYY-MM-DD. */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}
