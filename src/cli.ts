import { homedir } from "node:os";
import { parseArgs } from "node:util";
import { claudeCode } from "./agents/claude-code.ts";
import { findAgent } from "./agents/index.ts";
import { BluerError } from "./errors.ts";
import { defaultHome, initHome, loadSettings } from "./home.ts";
import { IMPACTS, LESSON_SOURCES, type Impact, type LessonSource } from "./lessons.ts";
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
  bluer used <skill>                            Count one use of a skill
  bluer build <skill>                           Rebuild SKILL.md, for example after you edit intent.md
  bluer list                                    List your skills
  bluer status <skill>                          Show a skill's version and lessons
  bluer history <skill>                         Show a skill's versions
  bluer rollback <skill> <version>              Return a skill to an earlier version
  bluer link <skill> [--agent <id>] [--replace] Make a skill visible to an agent (default: ${claudeCode.id})
  bluer init                                    Create the bluer home (done on first use)

Skills live in $BLUER_HOME (default ~/.bluer).`;

type Out = (line: string) => void;

function context(env: NodeJS.ProcessEnv): store.Context {
  const home = defaultHome(env);
  return { home, userHome: homedir(), today: env.BLUER_TODAY || todayIso(), settings: loadSettings(home) };
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

const TIER_TEXT: Record<string, string> = {
  rule: "now a rule in SKILL.md",
  edge: "now an edge case, read only when it comes up",
  candidate: "a candidate: SKILL.md changes only if it comes back",
  ignored: "about this run only, so bluer does not use it",
  expired: "expired",
  pending: "waiting for your approval (bluer approve)",
};

export function run(argv: string[], env: NodeJS.ProcessEnv = process.env, out: Out = console.log): void {
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
      const seen = result.isNew ? "new" : `seen ${result.lesson.seen} times`;
      out(`Lesson ${result.lesson.id} for "${name}" (${seen}) is ${TIER_TEXT[result.tier] ?? result.tier}.`);
      out(result.version === null ? "SKILL.md did not change." : `SKILL.md is now v${result.version}.`);
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
      out(`Lessons: ${c.rule} rules, ${c.edge} edge cases, ${c.candidate} candidates, ${c.pending} pending, ${c.expired} expired, ${c.archived} archived, ${c.ignored} one-off.`);
      if (s.handEdited) out("SKILL.md was edited by hand. The next build saves the edit under hand-edits/ and keeps it as a pending lesson.");
      for (const l of s.pending) out(`  pending ${l.id}: ${l.text}`);
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
