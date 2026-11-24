import type { Lesson } from "./lessons.ts";
import { daysBetween } from "./text.ts";

/**
 * The learning gate decides where a lesson goes, so that a skill keeps its real
 * rules and does not fill up with one-off edge cases. See docs/design.md,
 * "Learning gate".
 */
export const GATE_LEVELS = ["balanced", "strict", "eager"] as const;
export type GateLevel = (typeof GATE_LEVELS)[number];

/**
 * - rule: main body of SKILL.md
 * - edge: references/learned-edge-cases.md, read only when the case comes up
 * - candidate: kept in learnings.md only; SKILL.md does not change
 * - ignored: about one run only
 * - expired: a candidate that did not come back in time
 */
export type Tier = "rule" | "edge" | "candidate" | "ignored" | "expired";

export interface GateThresholds {
  /** Sightings before a lesson becomes a rule. */
  ruleAt: number;
  /** Sightings before a lesson becomes an edge case. */
  edgeAt: number;
  /** A candidate expires after this many days without a sighting... */
  candidateDays: number;
  /** ...or after this many runs of the skill without a sighting. */
  candidateRuns: number;
}

export const THRESHOLDS: Record<GateLevel, GateThresholds> = {
  balanced: { ruleAt: 3, edgeAt: 2, candidateDays: 30, candidateRuns: 10 },
  strict: { ruleAt: 4, edgeAt: 3, candidateDays: 14, candidateRuns: 5 },
  eager: { ruleAt: 2, edgeAt: 2, candidateDays: 60, candidateRuns: 20 },
};

/** Classify one active lesson. `today` is YYYY-MM-DD; `runs` is the skill's current run counter. */
export function classify(lesson: Lesson, level: GateLevel, today: string, runs: number): Tier {
  const t = THRESHOLDS[level];
  if (lesson.oneOff) return "ignored";
  if (lesson.explicit || lesson.impact === "high" || lesson.source === "creator") return "rule";
  if (lesson.seen >= t.ruleAt) return "rule";
  if (lesson.seen >= t.edgeAt || lesson.impact === "medium") return "edge";
  const staleDays = lesson.lastSeen ? daysBetween(lesson.lastSeen, today) : 0;
  const staleRuns = runs - lesson.lastSeenRun;
  if (staleDays > t.candidateDays || staleRuns > t.candidateRuns) return "expired";
  return "candidate";
}
