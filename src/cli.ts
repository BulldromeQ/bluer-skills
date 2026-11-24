import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { parseArgs } from "node:util";
import { claudeCode } from "./agents/claude-code.ts";
import { handleHook, HOOK_EVENTS, type HookEvent, type HookInput } from "./agents/hooks.ts";
import { findAgent } from "./agents/index.ts";
import { BluerError } from "./errors.ts";
import { defaultHome, initHome, loadSettings } from "./home.ts";
import { IMPACTS, LESSON_SOURCES, type Impact, type Lesson, type LessonSource } from "./lessons.ts";
import * as store from "./store.ts";
import { todayIso } from "./text.ts";

const HELP = `bluer: agent skills you write in plain steps, that improve themselves with use.

Usage:
  bluer new "<title>, 1. <step>, 2. <step>"   Create a skill from plain steps
        [--name <name>] [--no-link]
  bluer adopt <folder> [--name <name>]          Bring an existing skill into bluer
  bluer learn <skill> "<lesson>"                Teach a skill something
        [--step <number or text>] [--source answer|correction|failure]
        [--impact low|medium|high] [--always] [--one-off]
  bluer approve <skill> [<id>... | --all]       Approve lessons that wait for review
  bluer forget <skill> [<id>... | --last]       Undo lessons the user does not want
  bluer restore <skill> <id>...                 Bring back forgotten lessons
  bluer used <skill>                            Count one use of a skill
  bluer build <skill>                           Rebuild SKILL.md, for example after you edit intent.md
  bluer add-step <skill> "<step>"               Add a step at the end of intent.md (only when the owner asks)
  bluer describe <skill> "<description>"        Set when agents should load the skill (at most 1024 characters)
  bluer list                                    List your skills
  bluer status <skill>                          Show a skill's version and lessons
  bluer history <skill>                         Show a skill's versions
  bluer rollback <skill> <version>              Return a skill to an earlier version
  bluer link <skill> [--agent <id>] [--replace] Make a skill visible to an agent (default: ${claudeCode.id})
  bluer init                                    Create the bluer home (done on first use)
  bluer hook <agent> <event>                    Used by agent plugins (claude-code, gemini-cli); reads the hook JSON on stdin

Skills live in $BLUER_HOME (default ~/.bluer). Agent folders are found under $BLUER_USER_HOME (default: your home folder).`;

type Out = (line: string) => void;

function context(env: NodeJS.ProcessEnv): store.Context {
  const home = defaultHome(env);
  return { home, userHome: env.BLUER_USER_HOME || homedir(), today: env.BLUER_TODAY || todayIso(), settings: loadSettings(home) };
}

function need(value: string | undefined, what: string): string {
  if (!value) throw new BluerError(`Missing ${what}. Run "bluer help" for usage.`);
  return value;
}

function oneOf<T extends string>(allowed: readonly T[], value: string | undefined, flag: string): T | undefined {
  if (value === undefined) return undefined;
  if (allowed.includes(value as T)) return value as T;
  throw new BluerError(`--${flag} must be one of ${allowed.join(", ")}.`);
}

const UNDO_HINT = 'Say "undo that" to remove it.';

/**
 * The output of "bluer learn". The first line is for the user, and the agent
 * shows it word for word, so that no lesson changes a skill without the user
 * seeing it. The second line is for the agent.
 */
export function learnReceipt(
  name: string,
  r: { lesson: Lesson; isNew: boolean; tier: store.LessonTier; version: number | null },
): string[] {
  const text = `"${r.lesson.text}"`;
  const inSkill = r.tier === "rule" || r.tier === "edge";
  let user: string;
  if (inSkill && r.version === null && !r.isNew) user = `${name} already knows: ${text}.`;
  else if (r.tier === "rule") user = `${name} learned: ${text}. It does this every time now. ${UNDO_HINT}`;
  else if (r.tier === "edge") user = `${name} learned: ${text}. It uses this when the case comes up again. ${UNDO_HINT}`;
  else if (r.tier === "candidate") user = `${name} noted: ${text}. It learns this if it keeps coming up. ${UNDO_HINT}`;
  else if (r.tier === "pending") user = `${name} saved: ${text}. It uses this after you approve it. ${UNDO_HINT}`;
  else if (r.tier === "ignored") user = `${name} did not learn ${text}: it is about this time only.`;
  else if (r.tier === "forgotten") user = `${name} did not learn ${text}: you asked it to forget this.`;
  else user = `${name} saved: ${text}.`;

  const seen = r.lesson.seen === 1 ? "seen once" : `seen ${r.lesson.seen} times`;
  const file = r.version === null ? "SKILL.md did not change" : `SKILL.md is now v${r.version}`;
  const next =
    r.tier === "forgotten" ? `To bring it back: bluer restore ${name} ${r.lesson.id}` : r.tier === "ignored" ? "" : `To undo: bluer forget ${name} ${r.lesson.id}`;
  return [user, `(Lesson ${r.lesson.id}, ${r.tier}, ${seen}; ${file}.${next ? ` ${next}` : ""})`];
}

const TIER_PHRASE: Record<string, string> = {
  rule: "It does this every time now.",
  edge: "It uses this when the case comes up again.",
  candidate: "It learns this if it keeps coming up.",
  pending: "It uses this after you approve it.",
};

export function run(
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  out: Out = console.log,
  readStdin: () => string = () => readFileSync(0, "utf8"),
): void {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      name: { type: "string" },
      "no-link": { type: "boolean" },
      step: { type: "string" },
      source: { type: "string" },
      impact: { type: "string" },
      always: { type: "boolean" },
      "one-off": { type: "boolean" },
      all: { type: "boolean" },
      last: { type: "boolean" },
      agent: { type: "string" },
      replace: { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  const [command, ...args] = positionals;
  if (!command || command === "help" || values.help) {
    out(HELP);
    return;
  }
  if (command === "hook") {
    runHook(args, env, out, readStdin);
    return;
  }
  const ctx = context(env);

  switch (command) {
    case "init": {
      const { created } = initHome(ctx.home);
      out(created ? `Created the bluer home in ${ctx.home}.` : `The bluer home is ${ctx.home}.`);
      return;
    }
    case "new": {
      const text = need(args.join(" "), "the skill text");
      const made = store.createSkill(ctx, text, { name: values.name, link: !values["no-link"] });
      out(`Created "${made.name}" v${made.version} in ${made.dir}.`);
      for (const l of made.links) {
        out(l.result === "skipped" ? `Not linked to ${l.agent.displayName}: ${l.reason}` : `${l.agent.displayName} can now use it.`);
      }
      return;
    }
    case "adopt": {
      const adopted = store.adoptSkill(ctx, need(args[0], "the skill folder"), { name: values.name });
      out(`Adopted "${adopted.name}" as v0 in ${adopted.dir}. The original folder is unchanged.`);
      out(`To use the bluer copy, run: bluer link ${adopted.name} --replace`);
      return;
    }
    case "learn": {
      const name = need(args[0], "the skill name");
      const result = store.learn(ctx, name, {
        text: need(args.slice(1).join(" "), "the lesson text"),
        step: values.step,
        source: oneOf<LessonSource>(LESSON_SOURCES, values.source, "source"),
        impact: oneOf<Impact>(IMPACTS, values.impact, "impact"),
        explicit: values.always,
        oneOff: values["one-off"],
      });
      for (const line of learnReceipt(name, result)) out(line);
      return;
    }
    case "forget": {
      const name = need(args[0], "the skill name");
      const ids = values.last ? "last" : args.slice(1);
      if (ids !== "last" && ids.length === 0) throw new BluerError("Give lesson ids to forget, or --last.");
      const result = store.forget(ctx, name, ids);
      for (const l of result.lessons) out(`${name} forgot: "${l.text}".${result.version === null ? "" : " It no longer does this."}`);
      out(`(${result.version === null ? "SKILL.md did not change" : `SKILL.md is now v${result.version}`}. To bring it back: bluer restore ${name} ${result.lessons.map((l) => l.id).join(" ")})`);
      return;
    }
    case "restore": {
      const name = need(args[0], "the skill name");
      if (args.length < 2) throw new BluerError("Give the ids of the lessons to bring back.");
      const result = store.restore(ctx, name, args.slice(1));
      for (const { lesson, tier } of result.lessons) out(`${name} remembers again: "${lesson.text}". ${TIER_PHRASE[tier] ?? ""}`.trimEnd());
      out(`(${result.version === null ? "SKILL.md did not change" : `SKILL.md is now v${result.version}`}.)`);
      return;
    }
    case "approve": {
      const name = need(args[0], "the skill name");
      const ids = values.all ? "all" : args.slice(1);
      if (ids !== "all" && ids.length === 0) throw new BluerError("Give lesson ids to approve, or --all.");
      const result = store.approve(ctx, name, ids);
      out(`Approved ${result.approved.join(", ")}. ${result.version === null ? "SKILL.md did not change." : `SKILL.md is now v${result.version}.`}`);
      return;
    }
    case "used": {
      const name = need(args[0], "the skill name");
      out(`"${name}" has been used ${store.recordRun(ctx, name).runs} times.`);
      return;
    }
    case "add-step": {
      const name = need(args[0], "the skill name");
      const result = store.addStep(ctx, name, need(args.slice(1).join(" "), "the step text"));
      out(`Added step ${result.number} to "${name}". ${result.version === null ? "SKILL.md did not change." : `SKILL.md is now v${result.version}.`}`);
      return;
    }
    case "describe": {
      const name = need(args[0], "the skill name");
      const { version } = store.describeSkill(ctx, name, need(args.slice(1).join(" "), "the description"));
      out(version === null ? `"${name}" already has this description.` : `New description for "${name}". SKILL.md is now v${version}.`);
      return;
    }
    case "build": {
      const name = need(args[0], "the skill name");
      const { version } = store.rebuild(ctx, name);
      out(version === null ? `"${name}" is up to date.` : `Rebuilt "${name}" as v${version}.`);
      return;
    }
    case "list": {
      const names = store.listSkills(ctx);
      out(names.length === 0 ? 'No skills yet. Create one with: bluer new "<title>, 1. <step>, 2. <step>"' : names.join("\n"));
      return;
    }
    case "status": {
      const s = store.status(ctx, need(args[0], "the skill name"));
      const c = s.counts;
      out(`${s.name} v${s.version} (${s.mode === "intent" ? "built from intent.md" : "adopted"}, learning: ${s.learning})`);
      const n = (count: number, word: string, plural = `${word}s`): string => `${count} ${count === 1 ? word : plural}`;
      out(`Lessons: ${n(c.rule, "rule")}, ${n(c.edge, "edge case")}, ${n(c.candidate, "candidate")}, ${c.pending} pending, ${c.expired} expired, ${c.archived} archived, ${c.forgotten} forgotten, ${n(c.ignored, "one-off")}.`);
      if (s.handEdited) out("SKILL.md was edited by hand. The next build saves the edit under hand-edits/ and keeps it as a pending lesson.");
      const label = { rule: "rule", edge: "edge case", candidate: "candidate" };
      for (const { lesson, tier } of s.learned) out(`  ${label[tier].padEnd(9)} ${lesson.id.padEnd(4)} ${lesson.text}`);
      for (const l of s.pending) out(`  ${"pending".padEnd(9)} ${l.id.padEnd(4)} ${l.text}`);
      return;
    }
    case "history": {
      for (const v of store.history(ctx, need(args[0], "the skill name"))) out(`v${v.version}  ${v.date}  ${v.summary}`);
      return;
    }
    case "rollback": {
      const name = need(args[0], "the skill name");
      const target = Number(need(args[1], "the version").replace(/^v/, ""));
      if (!Number.isInteger(target)) throw new BluerError("The version must be a number, for example 2 or v2.");
      out(`"${name}" is now v${store.rollback(ctx, name, target).version}, with the lessons of v${target}. Your intent.md did not change.`);
      return;
    }
    case "link": {
      const name = need(args[0], "the skill name");
      const agent = findAgent(values.agent ?? claudeCode.id);
      const result = store.link(ctx, name, agent, Boolean(values.replace));
      const text = { linked: "can now use it", "already-linked": "already uses it", replaced: "now uses the bluer version; the old folder is in the bluer backups" };
      out(`${agent.displayName} ${text[result]}.`);
      return;
    }
    default:
      throw new BluerError(`Unknown command "${command}". Run "bluer help" for usage.`);
  }
}

/**
 * A hook must never break the user's session: any error goes to stderr, and
 * the command still exits 0 with no output.
 */
function runHook(args: string[], env: NodeJS.ProcessEnv, out: Out, readStdin: () => string): void {
  try {
    const [agentId, event] = args;
    const agent = findAgent(agentId ?? "");
    if (!agent.hooks) throw new BluerError(`bluer has no hooks for ${agent.displayName}.`);
    if (!HOOK_EVENTS.includes(event as HookEvent)) throw new BluerError(`Unknown hook event "${event ?? ""}".`);
    const raw = readStdin().trim();
    const input = (raw ? JSON.parse(raw) : {}) as HookInput;
    const ctx = context(env);
    initHome(ctx.home);
    const cliPath = env.BLUER_CLI_PATH || realpathSync(process.argv[1] ?? ".");
    const output = handleHook(agent, event as HookEvent, input, ctx, { cliPath });
    if (output) out(output);
  } catch (err) {
    console.error(`bluer hook: ${(err as Error).message}`);
  }
}
