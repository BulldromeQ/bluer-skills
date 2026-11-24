import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { BluerError } from "./errors.ts";
import { GATE_LEVELS, type GateLevel } from "./gate.ts";
import { commitPaths, ensureRepo } from "./git.ts";

export const LEARNING_MODES = ["auto", "review", "off"] as const;
export type LearningMode = (typeof LEARNING_MODES)[number];
export const SHARING_LEVELS = ["ask", "digest", "off"] as const;
export type SharingLevel = (typeof SHARING_LEVELS)[number];
export const TEST_LEVELS = ["standard", "light", "thorough"] as const;
export type TestLevel = (typeof TEST_LEVELS)[number];

/** Global settings, stored in <home>/settings.json. A skill's bluer.json can override `learning`. */
export interface Settings {
  learning: LearningMode;
  sharing: SharingLevel;
  tests: TestLevel;
  gate: GateLevel;
  /** Which skill writes SKILL.md v1. "builtin" uses bluer's own template. */
  creator: string;
}

export const DEFAULT_SETTINGS: Settings = {
  learning: "auto",
  sharing: "ask",
  tests: "standard",
  gate: "balanced",
  creator: "builtin",
};

/** The bluer home: $BLUER_HOME, or ~/.bluer. It is a git repo; each skill is a folder under skills/. */
export function defaultHome(env: NodeJS.ProcessEnv = process.env): string {
  return env.BLUER_HOME || join(homedir(), ".bluer");
}

export const skillsDir = (home: string): string => join(home, "skills");
export const backupsDir = (home: string): string => join(home, "backups");

/** Folders in the home that are local to this machine and never versioned: moved-aside agent folders, the CLI shim, hook state. */
const IGNORED = ["backups/", "bin/", "state/"];

/** Create the home on first use. Safe to call each time. */
export function initHome(home: string): { created: boolean } {
  const created = !existsSync(join(home, "settings.json"));
  mkdirSync(skillsDir(home), { recursive: true });
  ensureRepo(home);
  if (created) writeFileSync(join(home, "settings.json"), JSON.stringify(DEFAULT_SETTINGS, null, 2) + "\n");
  const ignoreFile = join(home, ".gitignore");
  const ignored = existsSync(ignoreFile) ? readFileSync(ignoreFile, "utf8") : "";
  const missing = IGNORED.filter((line) => !ignored.split("\n").includes(line));
  const prefix = ignored && !ignored.endsWith("\n") ? `${ignored}\n` : ignored;
  if (missing.length > 0) writeFileSync(ignoreFile, `${prefix}${missing.join("\n")}\n`);
  if (created || missing.length > 0) {
    commitPaths(home, ["settings.json", ".gitignore"], created ? "Create the bluer home" : "Ignore local-only folders");
  }
  return { created };
}

function check<T extends string>(allowed: readonly T[], value: unknown, key: string): T {
  if (allowed.includes(value as T)) return value as T;
  throw new BluerError(`settings.json: "${key}" must be one of ${allowed.join(", ")}.`);
}

export function loadSettings(home: string): Settings {
  const file = join(home, "settings.json");
  if (!existsSync(file)) return { ...DEFAULT_SETTINGS };
  const raw = { ...DEFAULT_SETTINGS, ...(JSON.parse(readFileSync(file, "utf8")) as Partial<Settings>) };
  return {
    learning: check(LEARNING_MODES, raw.learning, "learning"),
    sharing: check(SHARING_LEVELS, raw.sharing, "sharing"),
    tests: check(TEST_LEVELS, raw.tests, "tests"),
    gate: check(GATE_LEVELS, raw.gate, "gate"),
    creator: String(raw.creator),
  };
}
