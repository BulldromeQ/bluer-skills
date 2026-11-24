import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { AGENTS, linkSkill, type AgentAdapter, type LinkResult } from "./agents/index.ts";
import { buildSkill, EDGE_CASES_FILE, type BuildResult } from "./build.ts";
import { BluerError } from "./errors.ts";
import { splitFrontmatter } from "./frontmatter.ts";
import { classify, type Tier } from "./gate.ts";
import { commitPaths, git } from "./git.ts";
import { backupsDir, initHome, skillsDir, type LearningMode, type Settings } from "./home.ts";
import { checkName, formatIntent, parseIntent, slugify, type Intent } from "./intent.ts";
import { formatLearnings, parseLearnings, recordLesson, type Lesson, type LessonInput } from "./lessons.ts";
import { normalizeKey, oneLine, sha256 } from "./text.ts";

/** Everything an operation needs from outside: where the home is, today's date and the user's settings. */
export interface Context {
  home: string;
  /** The user's home folder, where agents keep their skills. */
  userHome: string;
  today: string;
  settings: Settings;
}

/** A skill's own state, stored in bluer.json in the skill folder. */
export interface SkillMeta {
  /** "intent": built from intent.md. "base": an adopted skill, built from base/SKILL.md. */
  mode: "intent" | "base";
  /** "local", or later "git:<url>" / "plugin:<name>" for skills from someone else. */
  source: string;
  version: number;
  /** How many times an agent used the skill. Candidates expire by this count too. */
  runs: number;
  /** sha256 of the SKILL.md bluer last wrote. A different hash means a hand edit. */
  builtHash: string;
  /** Overrides the global learning mode for this skill. */
  learning?: LearningMode;
  /** The description an agent wrote; it decides when agents load the skill (design D27). */
  description?: string;
  /** The id of the lesson recorded last, so that "undo that" can find it. */
  lastLesson?: string;
}

interface Skill {
  name: string;
  dir: string;
  meta: SkillMeta;
  intent: Intent | null;
  base: string | null;
  lessons: Lesson[];
  changelog: string;
}

const read = (path: string): string => readFileSync(path, "utf8");
const readIfExists = (path: string): string | null => (existsSync(path) ? read(path) : null);
const skillPathInRepo = (name: string): string => `skills/${name}`;
const changelogHeader = (name: string): string => `# Changelog: ${name}\n\n`;

function loadSkill(ctx: Context, name: string): Skill {
  checkName(name);
  const dir = join(skillsDir(ctx.home), name);
  const metaFile = join(dir, "bluer.json");
  if (!existsSync(metaFile)) throw new BluerError(`There is no skill named "${name}". Run "bluer list" to see your skills.`);
  const meta = JSON.parse(read(metaFile)) as SkillMeta;
  const intentText = meta.mode === "intent" ? read(join(dir, "intent.md")) : null;
  return {
    name,
    dir,
    meta,
    intent: intentText === null ? null : parseIntent(intentText),
    base: meta.mode === "base" ? read(join(dir, "base", "SKILL.md")) : null,
    lessons: parseLearnings(readIfExists(join(dir, "learnings.md")) ?? ""),
    changelog: readIfExists(join(dir, "CHANGELOG.md")) ?? changelogHeader(name),
  };
}

function writeMeta(skill: Skill): void {
  writeFileSync(join(skill.dir, "bluer.json"), JSON.stringify(skill.meta, null, 2) + "\n");
}

function build(ctx: Context, skill: Skill, lessons: Lesson[], version: number): BuildResult {
  return buildSkill({
    name: skill.name,
    intent: skill.intent,
    base: skill.base,
    description: skill.meta.description ?? null,
    lessons,
    gate: ctx.settings.gate,
    today: ctx.today,
    runs: skill.meta.runs,
    version,
  });
}

/**
 * Write the skill's files and commit them. A new version is made only when
 * SKILL.md or the edge-case file changes, or when `always` is set. A hand edit
 * to SKILL.md is never lost: it is saved under hand-edits/ and recorded as a
 * pending lesson before the rebuild.
 */
function save(ctx: Context, skill: Skill, summary: string, opts: { always?: boolean } = {}): { version: number | null } {
  const skillMdPath = join(skill.dir, "SKILL.md");
  const edgePath = join(skill.dir, EDGE_CASES_FILE);
  let lessons = skill.lessons;

  const current = readIfExists(skillMdPath);
  if (current !== null && skill.meta.builtHash && sha256(current) !== skill.meta.builtHash) {
    const saved = `hand-edits/SKILL-v${skill.meta.version}-${ctx.today}.md`;
    mkdirSync(join(skill.dir, "hand-edits"), { recursive: true });
    writeFileSync(join(skill.dir, saved), current);
    lessons = recordLesson(
      lessons,
      { text: `SKILL.md was edited by hand. The edit is saved in ${saved}. Turn it into lessons.`, source: "hand-edit", impact: "medium", pending: true },
      ctx.today,
      skill.meta.runs,
    ).lessons;
  }

  const same = build(ctx, skill, lessons, skill.meta.version);
  const changed = same.skillMd !== (current ?? "") || (same.edgeCasesMd ?? "") !== (readIfExists(edgePath) ?? "");
  const message = oneLine(summary, 72);
  let version: number | null = null;
  let result = same;

  if (changed || opts.always) {
    version = skill.meta.version + 1;
    result = build(ctx, skill, lessons, version);
    writeFileSync(skillMdPath, result.skillMd);
    if (result.edgeCasesMd === null) rmSync(edgePath, { force: true });
    else {
      mkdirSync(dirname(edgePath), { recursive: true });
      writeFileSync(edgePath, result.edgeCasesMd);
    }
    skill.changelog = `${skill.changelog.trimEnd()}\n- v${version} (${ctx.today}): ${message}\n`;
    writeFileSync(join(skill.dir, "CHANGELOG.md"), skill.changelog);
    skill.meta = { ...skill.meta, version, builtHash: sha256(result.skillMd) };
  }

  skill.lessons = result.lessons;
  writeFileSync(join(skill.dir, "learnings.md"), formatLearnings(skill.name, result.lessons));
  writeMeta(skill);
  commitPaths(ctx.home, [skillPathInRepo(skill.name)], version === null ? `${skill.name}: ${message}` : `${skill.name} v${version}: ${message}`);
  return { version };
}

export interface LinkReport {
  agent: AgentAdapter;
  result: LinkResult | "skipped";
  reason?: string;
}

/** Link into each installed agent's skills folder, once per folder: several agents can share one (~/.agents/skills). */
function linkToInstalledAgents(ctx: Context, name: string, dir: string): LinkReport[] {
  const seen = new Set<string>();
  const agents = AGENTS.filter((a) => {
    if (!a.isInstalled(ctx.userHome)) return false;
    const folder = a.skillsDir(ctx.userHome);
    if (seen.has(folder)) return false;
    seen.add(folder);
    return true;
  });
  return agents.map((agent) => {
    try {
      return { agent, result: linkSkill(agent, { userHome: ctx.userHome, skillDir: dir, name, backupsDir: backupsDir(ctx.home) }) };
    } catch (err) {
      if (err instanceof BluerError) return { agent, result: "skipped" as const, reason: err.message };
      throw err;
    }
  });
}

/** Create a skill from the owner's plain text and make v1. */
export function createSkill(
  ctx: Context,
  text: string,
  opts: { name?: string; link?: boolean } = {},
): { name: string; dir: string; version: number; links: LinkReport[] } {
  initHome(ctx.home);
  const intent = parseIntent(text);
  const name = opts.name ?? slugify(intent.title);
  if (!name) {
    throw new BluerError(`Pick a name for "${intent.title}" with --name, using lowercase letters, digits and hyphens.`);
  }
  checkName(name);
  const dir = join(skillsDir(ctx.home), name);
  if (existsSync(dir)) throw new BluerError(`A skill named "${name}" already exists. Pick another name with --name.`);

  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "intent.md"), formatIntent(intent));
  const skill: Skill = {
    name,
    dir,
    meta: { mode: "intent", source: "local", version: 0, runs: 0, builtHash: "" },
    intent,
    base: null,
    lessons: [],
    changelog: changelogHeader(name),
  };
  const { version } = save(ctx, skill, "created from intent.md", { always: true });
  const links = opts.link === false ? [] : linkToInstalledAgents(ctx, name, dir);
  return { name, dir, version: version ?? 1, links };
}

/**
 * Copy an existing skill into the bluer home. The original SKILL.md is kept
 * unchanged as version 0, and lessons are added on top of it. The original
 * folder is not touched; "bluer link --replace" swaps it for the bluer copy.
 */
export function adoptSkill(ctx: Context, path: string, opts: { name?: string } = {}): { name: string; dir: string } {
  initHome(ctx.home);
  const src = resolve(path);
  const text = readIfExists(join(src, "SKILL.md"));
  if (text === null) throw new BluerError(`There is no SKILL.md in ${src}.`);
  const real = realpathSync(src);
  if (real.startsWith(realpathSync(skillsDir(ctx.home)) + sep)) throw new BluerError(`${src} is already a bluer skill.`);
  if (real.includes(`${sep}.claude${sep}plugins${sep}`)) {
    throw new BluerError("Skills installed by a plugin cannot be adopted yet. See \"Open questions\" Q1 in docs/design.md.");
  }

  const { data } = splitFrontmatter(text);
  const name = opts.name ?? (typeof data.name === "string" ? data.name : basename(src));
  checkName(name);
  const dir = join(skillsDir(ctx.home), name);
  if (existsSync(dir)) throw new BluerError(`A skill named "${name}" already exists. Pick another name with --name.`);

  cpSync(src, dir, { recursive: true, dereference: true, filter: (from) => basename(from) !== ".git" });
  mkdirSync(join(dir, "base"), { recursive: true });
  writeFileSync(join(dir, "base", "SKILL.md"), text);
  writeFileSync(join(dir, "learnings.md"), formatLearnings(name, []));
  const shownPath = src.startsWith(homedir()) ? `~${src.slice(homedir().length)}` : src;
  writeFileSync(join(dir, "CHANGELOG.md"), `${changelogHeader(name)}- v0 (${ctx.today}): adopted from ${shownPath}\n`);
  const meta: SkillMeta = { mode: "base", source: "local", version: 0, runs: 0, builtHash: sha256(text) };
  writeFileSync(join(dir, "bluer.json"), JSON.stringify(meta, null, 2) + "\n");
  commitPaths(ctx.home, [skillPathInRepo(name)], `${name} v0: adopted from ${shownPath}`);
  return { name, dir };
}

export interface LearnInput extends Omit<LessonInput, "pending" | "step"> {
  /** A step number ("2") or the step's text. */
  step?: string;
}

/**
 * Record a lesson, run it through the learning gate and rebuild the skill if
 * the gate lets it in. A lesson id ("L2") as the text counts one more sighting
 * of that lesson, in its own words and at its own step: an agent says the same
 * thing in new words each time, and only repeats move a lesson up the gate.
 */
export function learn(
  ctx: Context,
  name: string,
  input: LearnInput,
): { lesson: Lesson; isNew: boolean; tier: LessonTier; version: number | null } {
  const skill = loadSkill(ctx, name);
  const mode = skill.meta.learning ?? ctx.settings.learning;
  if (mode === "off") throw new BluerError(`Learning is off for "${name}".`);

  const id = /^L\d+$/i.test(input.text.trim()) ? input.text.trim().toUpperCase() : null;
  const known = id === null ? undefined : skill.lessons.find((l) => l.id === id);
  if (id !== null && !known) throw new BluerError(`"${name}" has no lesson ${id}. Run "bluer status ${name}" to see its lessons.`);
  const step = known ? known.step : resolveStep(skill, input.step);
  const text = known ? known.text : input.text;
  const recorded = recordLesson(skill.lessons, { ...input, text, step, pending: mode === "review" }, ctx.today, skill.meta.runs);
  skill.lessons = recorded.lessons;
  skill.meta = { ...skill.meta, lastLesson: recorded.lesson.id };
  const verb = recorded.isNew ? "learned" : "saw again";
  const { version } = save(ctx, skill, `${verb} ${recorded.lesson.id}: ${recorded.lesson.text}`);
  const lesson = skill.lessons.find((l) => l.id === recorded.lesson.id) ?? recorded.lesson;
  return { lesson, isNew: recorded.isNew, tier: tierOf(ctx, skill, lesson), version };
}

/** Where a lesson is now: a gate tier, or a status that keeps it out of the gate. */
export type LessonTier = Tier | "pending" | "archived" | "forgotten";

function tierOf(ctx: Context, skill: Skill, lesson: Lesson): LessonTier {
  if (lesson.status === "pending" || lesson.status === "archived" || lesson.status === "forgotten") return lesson.status;
  if (lesson.status === "expired") return "expired";
  return classify(lesson, ctx.settings.gate, ctx.today, skill.meta.runs);
}

function pickLessons(skill: Skill, ids: string[] | "last", want: (l: Lesson) => boolean, what: string): Lesson[] {
  const wanted = ids === "last" ? (skill.meta.lastLesson ? [skill.meta.lastLesson] : []) : ids;
  if (wanted.length === 0) throw new BluerError(`"${skill.name}" has no lesson recorded yet.`);
  return wanted.map((id) => {
    const lesson = skill.lessons.find((l) => l.id === id.toUpperCase());
    if (!lesson) throw new BluerError(`"${skill.name}" has no lesson ${id}. Run "bluer status ${skill.name}" to see its lessons.`);
    if (!want(lesson)) throw new BluerError(`Lesson ${lesson.id} of "${skill.name}" is ${what}.`);
    return lesson;
  });
}

/**
 * Undo lessons the user does not want: the last one recorded, or the ones with
 * these ids. A forgotten lesson stays in learnings.md, so it does not come back
 * when an agent records it again; restore() brings it back.
 */
export function forget(ctx: Context, name: string, ids: string[] | "last"): { lessons: Lesson[]; version: number | null } {
  const skill = loadSkill(ctx, name);
  const picked = pickLessons(skill, ids, (l) => l.status !== "forgotten", "already forgotten");
  const pickedIds = new Set(picked.map((l) => l.id));
  skill.lessons = skill.lessons.map((l) => (pickedIds.has(l.id) ? { ...l, status: "forgotten" as const } : l));
  const summary = `forgot ${picked.map((l) => `${l.id}: ${l.text}`).join("; ")}`;
  const { version } = save(ctx, skill, summary);
  return { lessons: picked, version };
}

/** Bring back forgotten lessons. They go through the learning gate again. */
export function restore(ctx: Context, name: string, ids: string[]): { lessons: { lesson: Lesson; tier: LessonTier }[]; version: number | null } {
  const skill = loadSkill(ctx, name);
  const picked = pickLessons(skill, ids, (l) => l.status === "forgotten", "not forgotten");
  const pickedIds = new Set(picked.map((l) => l.id));
  skill.lessons = skill.lessons.map((l) => (pickedIds.has(l.id) ? { ...l, status: "active" as const } : l));
  const { version } = save(ctx, skill, `restored ${picked.map((l) => `${l.id}: ${l.text}`).join("; ")}`);
  const lessons = skill.lessons.filter((l) => pickedIds.has(l.id)).map((lesson) => ({ lesson, tier: tierOf(ctx, skill, lesson) }));
  return { lessons, version };
}

function resolveStep(skill: Skill, step: string | undefined): string | null {
  if (step === undefined || step === "") return null;
  if (!skill.intent) return step;
  const steps = skill.intent.steps;
  if (/^\d+$/.test(step)) {
    const found = steps[Number(step) - 1];
    if (found === undefined) throw new BluerError(`"${skill.name}" has ${steps.length} steps; there is no step ${step}.`);
    return found;
  }
  const found = steps.find((s) => normalizeKey(s) === normalizeKey(step));
  if (found === undefined) {
    throw new BluerError(`"${skill.name}" has no step "${step}". Its steps are: ${steps.map((s, i) => `${i + 1}. ${s}`).join("; ")}.`);
  }
  return found;
}

/** Approve pending lessons, all of them or the ones with these ids. */
export function approve(ctx: Context, name: string, ids: string[] | "all"): { approved: string[]; version: number | null } {
  const skill = loadSkill(ctx, name);
  const approved: string[] = [];
  skill.lessons = skill.lessons.map((l) => {
    if (l.status !== "pending" || (ids !== "all" && !ids.includes(l.id))) return l;
    approved.push(l.id);
    return { ...l, status: "active" };
  });
  if (approved.length === 0) throw new BluerError(`"${name}" has no pending lessons to approve.`);
  return { approved, ...save(ctx, skill, `approved ${approved.join(", ")}`) };
}

/**
 * Set the description agents use to decide when to load the skill. An agent
 * writes it; a rebuild never overwrites it (design D27).
 */
export function describeSkill(ctx: Context, name: string, description: string): { version: number | null } {
  const text = oneLine(description, 2000);
  if (!text) throw new BluerError("The description is empty.");
  if (text.length > 1024) throw new BluerError(`The description has ${text.length} characters. Agent Skills allow at most 1024.`);
  const skill = loadSkill(ctx, name);
  skill.meta = { ...skill.meta, description: text };
  return save(ctx, skill, "new description");
}

/**
 * Add a step at the end of intent.md, in the owner's words. Call this only
 * when the owner asked for the step: automatic changes never write intent.md
 * (design D2). The line is appended, so the rest of the file stays as written.
 */
export function addStep(ctx: Context, name: string, step: string): { number: number; version: number | null } {
  const text = oneLine(step, 500);
  if (!text) throw new BluerError("The step is empty.");
  const skill = loadSkill(ctx, name);
  if (!skill.intent) throw new BluerError(`"${name}" was adopted and has no intent.md yet, so it has no steps to add to.`);
  const file = join(skill.dir, "intent.md");
  const current = read(file);
  const number = skill.intent.steps.length + 1;
  writeFileSync(file, `${current.replace(/\s*$/, "")}\n${number}. ${text}\n`);
  const updated = loadSkill(ctx, name);
  if (updated.intent?.steps.length !== number) throw new BluerError("The new step could not be read back from intent.md. Check the file by hand.");
  return { number, ...save(ctx, updated, `added step ${number}: ${text}`) };
}

/** Whether a skill with this name is in the bluer home. */
export function hasSkill(ctx: Context, name: string): boolean {
  return NAME_OK.test(name) && existsSync(join(skillsDir(ctx.home), name, "bluer.json"));
}
const NAME_OK = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Rebuild SKILL.md, for example after the owner edited intent.md. */
export function rebuild(ctx: Context, name: string): { version: number | null } {
  const skill = loadSkill(ctx, name);
  return save(ctx, skill, "rebuilt");
}

/** Count one use of the skill. Agent adapters call this when the agent loads the skill. Not committed on its own. */
export function recordRun(ctx: Context, name: string): { runs: number } {
  const skill = loadSkill(ctx, name);
  skill.meta.runs += 1;
  writeMeta(skill);
  return { runs: skill.meta.runs };
}

export interface VersionEntry {
  version: number;
  date: string;
  summary: string;
}

const CHANGELOG_LINE = /^- v(\d+) \((\d{4}-\d{2}-\d{2})\): (.*)$/;

export function history(ctx: Context, name: string): VersionEntry[] {
  return loadSkill(ctx, name)
    .changelog.split("\n")
    .flatMap((line) => {
      const m = CHANGELOG_LINE.exec(line);
      return m ? [{ version: Number(m[1]), date: m[2] ?? "", summary: m[3] ?? "" }] : [];
    });
}

/**
 * Return a skill's lessons to the state they had at an earlier version, and
 * build a new version from them. The owner's intent.md stays as it is now:
 * rollback undoes what was learned, never what the owner wrote. Lessons
 * recorded after that version are dropped; git history keeps them, and they
 * come back as new lessons if they happen again.
 */
export function rollback(ctx: Context, name: string, target: number): { version: number } {
  const skill = loadSkill(ctx, name);
  if (target === skill.meta.version) throw new BluerError(`"${name}" is already at v${target}.`);
  if (!history(ctx, name).some((v) => v.version === target)) throw new BluerError(`"${name}" has no v${target}. Run "bluer history ${name}".`);

  const log = git(ctx.home, ["log", "--format=%H%x09%s", "--", skillPathInRepo(name)]).split("\n");
  const sha = log.find((line) => line.split("\t")[1]?.startsWith(`${name} v${target}:`))?.split("\t")[0];
  if (!sha) throw new BluerError(`Could not find the commit for "${name}" v${target}.`);

  const learnings = git(ctx.home, ["show", `${sha}:${skillPathInRepo(name)}/learnings.md`]);
  skill.lessons = parseLearnings(learnings);
  const saved = save(ctx, skill, `rolled back lessons to v${target}`, { always: true });
  return { version: saved.version ?? skill.meta.version };
}

export interface SkillStatus {
  name: string;
  mode: SkillMeta["mode"];
  version: number;
  learning: LearningMode;
  handEdited: boolean;
  counts: Record<Tier | "pending" | "archived" | "forgotten", number>;
  pending: Lesson[];
  /** Lessons the skill uses or may use soon (rules, edge cases, candidates), with their tiers. */
  learned: { lesson: Lesson; tier: "rule" | "edge" | "candidate" }[];
}

export function status(ctx: Context, name: string): SkillStatus {
  const skill = loadSkill(ctx, name);
  const current = readIfExists(join(skill.dir, "SKILL.md"));
  const result = build(ctx, skill, skill.lessons, skill.meta.version);
  const count = (s: Lesson["status"]): number => result.lessons.filter((l) => l.status === s).length;
  return {
    name,
    mode: skill.meta.mode,
    version: skill.meta.version,
    learning: skill.meta.learning ?? ctx.settings.learning,
    handEdited: current !== null && Boolean(skill.meta.builtHash) && sha256(current) !== skill.meta.builtHash,
    counts: {
      rule: result.tiers.rule.length,
      edge: result.tiers.edge.length,
      candidate: result.tiers.candidate.length,
      ignored: result.tiers.ignored.length,
      expired: count("expired"),
      pending: count("pending"),
      archived: count("archived"),
      forgotten: count("forgotten"),
    },
    pending: result.lessons.filter((l) => l.status === "pending"),
    learned: (["rule", "edge", "candidate"] as const).flatMap((tier) => result.tiers[tier].map((lesson) => ({ lesson, tier }))),
  };
}

export function listSkills(ctx: Context): string[] {
  const dir = skillsDir(ctx.home);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "bluer.json")))
    .map((e) => e.name)
    .sort();
}

export function link(ctx: Context, name: string, agent: AgentAdapter, replace: boolean): LinkResult {
  const skill = loadSkill(ctx, name);
  return linkSkill(agent, { userHome: ctx.userHome, skillDir: skill.dir, name, backupsDir: backupsDir(ctx.home), replace });
}
