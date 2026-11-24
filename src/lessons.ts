import { BluerError } from "./errors.ts";
import { normalizeKey, oneLine } from "./text.ts";

/** "creator": first detail written by the skill creator when the skill was made (design D26). */
export const LESSON_SOURCES = ["answer", "correction", "failure", "hand-edit", "creator"] as const;
export type LessonSource = (typeof LESSON_SOURCES)[number];

export const IMPACTS = ["low", "medium", "high"] as const;
export type Impact = (typeof IMPACTS)[number];

/**
 * - active: passes through the learning gate on each build.
 * - pending: waits for the user's approval (learning mode "review", or a hand edit to SKILL.md).
 * - expired: a candidate that did not come back in time. Kept, and active again if seen again.
 * - archived: its step was removed from intent.md. Active again if the step comes back.
 */
export const LESSON_STATUSES = ["active", "pending", "expired", "archived"] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

export interface Lesson {
  id: string;
  text: string;
  /** The step text from intent.md this lesson belongs to, or null for a general lesson. */
  step: string | null;
  source: LessonSource;
  impact: Impact;
  seen: number;
  firstSeen: string;
  lastSeen: string;
  /** The skill's run counter when this lesson was last seen. */
  lastSeenRun: number;
  /** The user said "always", "never" or "remember this". */
  explicit: boolean;
  /** About one run only, for example "today there is a cake on the table". */
  oneOff: boolean;
  status: LessonStatus;
}

export interface LessonInput {
  text: string;
  step?: string | null;
  source?: LessonSource;
  impact?: Impact;
  explicit?: boolean;
  oneOff?: boolean;
  /** Save a new lesson as pending instead of active. */
  pending?: boolean;
}

const lessonKey = (text: string, step: string | null): string =>
  `${step === null ? "" : normalizeKey(step)}\u0000${normalizeKey(text)}`;

const rank = (impact: Impact): number => IMPACTS.indexOf(impact);

/**
 * Add a lesson, or count one more sighting of a lesson that is already known.
 * A lesson seen a second time is no longer a one-off.
 */
export function recordLesson(
  lessons: Lesson[],
  input: LessonInput,
  today: string,
  run: number,
): { lessons: Lesson[]; lesson: Lesson; isNew: boolean } {
  const text = oneLine(input.text, 500);
  if (!text) throw new BluerError("A lesson needs some text.");
  const step = input.step ?? null;
  const impact = input.impact ?? "low";
  const key = lessonKey(text, step);
  const found = lessons.find((l) => lessonKey(l.text, l.step) === key);

  if (found) {
    const updated: Lesson = {
      ...found,
      seen: found.seen + 1,
      lastSeen: today,
      lastSeenRun: run,
      explicit: found.explicit || Boolean(input.explicit),
      oneOff: false,
      impact: rank(impact) > rank(found.impact) ? impact : found.impact,
      status: found.status === "active" ? "active" : input.pending ? "pending" : "active",
    };
    return { lessons: lessons.map((l) => (l === found ? updated : l)), lesson: updated, isNew: false };
  }

  const lesson: Lesson = {
    id: nextId(lessons),
    text,
    step,
    source: input.source ?? "correction",
    impact,
    seen: 1,
    firstSeen: today,
    lastSeen: today,
    lastSeenRun: run,
    explicit: Boolean(input.explicit),
    oneOff: Boolean(input.oneOff),
    status: input.pending ? "pending" : "active",
  };
  return { lessons: [...lessons, lesson], lesson, isNew: true };
}

function nextId(lessons: Lesson[]): string {
  const max = lessons.reduce((acc, l) => Math.max(acc, Number(l.id.slice(1)) || 0), 0);
  return `L${max + 1}`;
}

// learnings.md: one "## L<n>: <text>" block per lesson, followed by "- key: value" lines.

export function formatLearnings(skillName: string, lessons: Lesson[]): string {
  const header =
    `# Learnings: ${skillName}\n\n` +
    "bluer keeps this file. Each block is one lesson. To change a lesson, tell your agent or use the `bluer` CLI.\n";
  const blocks = lessons.map((l) =>
    [
      `## ${l.id}: ${l.text}`,
      "",
      `- step: ${l.step ?? ""}`,
      `- source: ${l.source}`,
      `- impact: ${l.impact}`,
      `- seen: ${l.seen}`,
      `- first-seen: ${l.firstSeen}`,
      `- last-seen: ${l.lastSeen}`,
      `- last-seen-run: ${l.lastSeenRun}`,
      `- explicit: ${l.explicit}`,
      `- one-off: ${l.oneOff}`,
      `- status: ${l.status}`,
    ].join("\n"),
  );
  return [header, ...blocks].join("\n") + "\n";
}

const HEADING = /^## (L\d+): (.*)$/;
const FIELD = /^- ([a-z-]+): ?(.*)$/;

export function parseLearnings(markdown: string): Lesson[] {
  const lessons: Lesson[] = [];
  let fields: Record<string, string> | null = null;
  let id = "";
  let text = "";

  const flush = (): void => {
    if (fields) lessons.push(toLesson(id, text, fields));
  };

  for (const line of markdown.split(/\r?\n/)) {
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      id = heading[1] ?? "";
      text = heading[2] ?? "";
      fields = {};
      continue;
    }
    const field = FIELD.exec(line);
    if (field && fields) fields[field[1] ?? ""] = (field[2] ?? "").trim();
  }
  flush();
  return lessons;
}

function pick<T extends string>(allowed: readonly T[], value: string | undefined, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function toLesson(id: string, text: string, f: Record<string, string>): Lesson {
  return {
    id,
    text,
    step: f.step ? f.step : null,
    source: pick(LESSON_SOURCES, f.source, "correction"),
    impact: pick(IMPACTS, f.impact, "low"),
    seen: Number(f.seen) || 1,
    firstSeen: f["first-seen"] ?? "",
    lastSeen: f["last-seen"] ?? "",
    lastSeenRun: Number(f["last-seen-run"]) || 0,
    explicit: f.explicit === "true",
    oneOff: f["one-off"] === "true",
    status: pick(LESSON_STATUSES, f.status, "active"),
  };
}
