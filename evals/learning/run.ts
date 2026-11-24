// Runs the learning eval: each case in cases.yaml is a two-turn session with a
// real agent, and the case checks what bluer recorded. See evals/README.md.
//
//   node evals/learning/run.ts --agent claude-code [--model sonnet]
//   node evals/learning/run.ts --agent gemini-cli [--model gemini-2.5-flash]
//   options: --cases id,id  --jobs 4  --keep  --summary
//
// Each case gets its own scratch folder, so the run never touches your real
// ~/.bluer, ~/.claude or ~/.gemini. Claude Code runs with
// --setting-sources project,local, so your own settings, plugins and
// instructions stay out of the session.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { parse as parseYaml } from "yaml";
import { classify } from "../../src/gate.ts";
import { parseIntent } from "../../src/intent.ts";
import { parseLearnings, type Lesson } from "../../src/lessons.ts";
import { todayIso } from "../../src/text.ts";

const REPO = join(import.meta.dirname, "..", "..");
const CLI = join(REPO, "src", "main.ts");
const TURN_TIMEOUT_MS = 5 * 60 * 1000;

interface SkillFixture {
  intent: string;
  description: string;
  task: string;
}
interface Seed {
  text: string;
  step?: number;
  always?: boolean;
  "one-off"?: boolean;
  times?: number;
}
interface ExpectedLesson {
  match: string;
  tier: string | string[];
  step?: number | "none";
}
interface Case {
  id: string;
  skill: string;
  task?: string;
  message: string;
  files?: Record<string, string>;
  seed?: Seed[];
  expect: { lessons?: ExpectedLesson[]; none?: boolean; forbid?: string[] };
}
interface Turn {
  text: string;
  costUsd: number;
  model: string;
  ok: boolean;
  error?: string;
}
interface CaseResult {
  id: string;
  pass: boolean;
  failures: string[];
  loaded: boolean;
  recorded: string[];
  receipt: "shown" | "missing" | "n/a";
  costUsd: number;
  model: string;
  reply: string;
  dir: string;
}

const { values } = parseArgs({
  options: {
    agent: { type: "string", default: "claude-code" },
    model: { type: "string" },
    cases: { type: "string" },
    jobs: { type: "string", default: "4" },
    keep: { type: "boolean", default: false },
    summary: { type: "boolean", default: false },
  },
});
const agent = values.agent ?? "claude-code";
if (agent !== "claude-code" && agent !== "gemini-cli") throw new Error(`--agent must be claude-code or gemini-cli, not ${agent}.`);

const spec = parseYaml(readFileSync(join(import.meta.dirname, "cases.yaml"), "utf8")) as { skills: Record<string, SkillFixture>; cases: Case[] };
const wanted = values.cases?.split(",").map((s) => s.trim());
const cases = spec.cases.filter((c) => !wanted || wanted.includes(c.id));
if (cases.length === 0) throw new Error("No cases match --cases.");

function run(cmd: string, args: string[], opts: { cwd: string; env: NodeJS.ProcessEnv }): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString()));
    const timer = setTimeout(() => child.kill("SIGKILL"), TURN_TIMEOUT_MS);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function bluer(env: NodeJS.ProcessEnv, args: string[]): void {
  const r = spawnSync(process.execPath, [CLI, ...args], { env, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`bluer ${args.join(" ")}: ${r.stderr}`);
}

/** Set up the case folder, the skill and the agent's home. Returns the env for the agent. */
function prepare(c: Case, dir: string): { env: NodeJS.ProcessEnv; proj: string; home: string; seeds: Map<string, Lesson> } {
  const fixture = spec.skills[c.skill];
  if (!fixture) throw new Error(`Case ${c.id}: unknown skill ${c.skill}.`);
  const home = join(dir, "bluer");
  const user = join(dir, "user");
  const proj = join(dir, "proj");
  mkdirSync(proj, { recursive: true });
  mkdirSync(user, { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: proj });
  for (const [file, text] of Object.entries(c.files ?? {})) writeFileSync(join(proj, file), text);

  const env: NodeJS.ProcessEnv = { ...process.env, BLUER_HOME: home, BLUER_USER_HOME: user };
  delete env.BLUER_NODE;
  bluer(env, ["new", fixture.intent, "--name", c.skill, "--no-link"]);
  bluer(env, ["describe", c.skill, fixture.description]);
  for (const s of c.seed ?? []) {
    for (let i = 0; i < (s.times ?? 1); i++) {
      bluer(env, ["learn", c.skill, s.text, ...(s.step ? ["--step", String(s.step)] : []), ...(s.always ? ["--always"] : []), ...(s["one-off"] ? ["--one-off"] : [])]);
    }
  }

  const skillDir = join(home, "skills", c.skill);
  const seeds = new Map(parseLearnings(readFileSync(join(skillDir, "learnings.md"), "utf8")).map((l) => [l.id, l] as const));
  if (agent === "claude-code") {
    mkdirSync(join(proj, ".claude", "skills"), { recursive: true });
    symlinkSync(skillDir, join(proj, ".claude", "skills", c.skill));
  } else {
    env.GEMINI_CLI_HOME = user;
    mkdirSync(join(user, ".agents", "skills"), { recursive: true });
    symlinkSync(skillDir, join(user, ".agents", "skills", c.skill));
    mkdirSync(join(user, ".gemini"), { recursive: true });
    writeFileSync(join(user, ".gemini", "settings.json"), JSON.stringify({ security: { auth: { selectedType: "gemini-api-key" } } }, null, 2));
    const link = spawnSync(geminiBin(), ["extensions", "link", REPO, "--consent"], { env, encoding: "utf8", cwd: proj });
    if (link.status !== 0) throw new Error(`gemini extensions link: ${link.stderr}`);
    writeFileSync(
      join(dir, "policy.toml"),
      `[[rule]]\ntoolName = "run_shell_command"\ncommandPrefix = ${JSON.stringify(join(home, "bin", "bluer"))}\ndecision = "allow"\npriority = 100\n\n` +
        `[[rule]]\ntoolName = "activate_skill"\ndecision = "allow"\npriority = 100\n\n` +
        `[[rule]]\ntoolName = "read_file"\ndecision = "allow"\npriority = 100\n`,
    );
  }
  return { env, proj, home, seeds };
}

function geminiBin(): string {
  return process.env.GEMINI_BIN || "gemini";
}

async function turn(text: string, resume: boolean, ctx: { env: NodeJS.ProcessEnv; proj: string; home: string; dir: string }): Promise<Turn> {
  if (agent === "claude-code") {
    const args = ["-p", text, "--plugin-dir", join(REPO, "plugins", "claude-code"), "--setting-sources", "project,local"];
    args.push("--allowedTools", `Bash(${join(ctx.home, "bin", "bluer")} *)`, "--output-format", "json");
    if (values.model) args.push("--model", values.model);
    if (resume) args.push("-c");
    const r = await run("claude", args, { cwd: ctx.proj, env: ctx.env });
    try {
      const out = JSON.parse(r.stdout) as { result?: string; total_cost_usd?: number; modelUsage?: Record<string, unknown>; is_error?: boolean };
      return { text: out.result ?? "", costUsd: out.total_cost_usd ?? 0, model: Object.keys(out.modelUsage ?? {}).join("+"), ok: !out.is_error };
    } catch {
      return { text: "", costUsd: 0, model: "", ok: false, error: (r.stderr || r.stdout).slice(0, 500) };
    }
  }
  const args = ["--skip-trust", "--policy", join(ctx.dir, "policy.toml"), "-o", "stream-json", "-p", text];
  if (values.model) args.push("--model", values.model);
  if (resume) args.push("-r", "latest");
  const r = await run(geminiBin(), args, { cwd: ctx.proj, env: ctx.env });
  let reply = "";
  let model = "";
  for (const line of r.stdout.split("\n")) {
    try {
      const e = JSON.parse(line) as { type?: string; role?: string; content?: string; model?: string };
      if (e.type === "init" && e.model) model = e.model;
      if (e.type === "message" && e.role === "assistant") reply += e.content ?? "";
    } catch {
      // not a JSON line
    }
  }
  return { text: reply, costUsd: 0, model, ok: r.code === 0, error: r.code === 0 ? undefined : r.stderr.slice(-500) };
}

function tierOf(lesson: Lesson, runs: number, today: string): string {
  if (["forgotten", "pending", "archived", "expired"].includes(lesson.status)) return lesson.status;
  return classify(lesson, "balanced", today, runs);
}

function evaluate(c: Case, home: string, seeds: Map<string, Lesson>, reply: string): Omit<CaseResult, "id" | "costUsd" | "model" | "reply" | "dir"> {
  const skillDir = join(home, "skills", c.skill);
  const learningsText = readFileSync(join(skillDir, "learnings.md"), "utf8");
  const meta = JSON.parse(readFileSync(join(skillDir, "bluer.json"), "utf8")) as { runs: number };
  const steps = parseIntent(readFileSync(join(skillDir, "intent.md"), "utf8")).steps;
  const lessons = parseLearnings(learningsText);
  const seeded = new Set(seeds.keys());
  const today = todayIso();
  const stepOf = (l: Lesson): number | "none" => (l.step === null ? "none" : steps.indexOf(l.step) + 1);
  const describe = (l: Lesson): string => `${l.id} "${l.text}" -> ${tierOf(l, meta.runs, today)}, step ${stepOf(l)}${seeded.has(l.id) ? " (seed)" : ""}`;
  const failures: string[] = [];

  for (const want of c.expect.lessons ?? []) {
    const tiers = Array.isArray(want.tier) ? want.tier : [want.tier];
    const re = new RegExp(want.match, "i");
    const found = lessons.find((l) => re.test(l.text) && tiers.includes(tierOf(l, meta.runs, today)) && (want.step === undefined || stepOf(l) === want.step));
    if (!found) failures.push(`no lesson /${want.match}/ as ${tiers.join("|")}${want.step === undefined ? "" : ` at step ${want.step}`}`);
  }
  const fresh = lessons.filter((l) => !seeded.has(l.id));
  if (c.expect.none) {
    const real = fresh.filter((l) => tierOf(l, meta.runs, today) !== "ignored");
    if (real.length > 0) failures.push(`expected no lesson, got ${real.map((l) => `"${l.text}"`).join(", ")}`);
  }
  for (const pattern of c.expect.forbid ?? []) {
    if (new RegExp(pattern, "i").test(learningsText)) failures.push(`learnings.md holds forbidden text /${pattern}/`);
  }

  // A change: a new lesson, or a seed lesson seen again or forgotten.
  const changed = fresh.length > 0 || lessons.some((l) => seeds.has(l.id) && (l.status !== seeds.get(l.id)?.status || l.seen !== seeds.get(l.id)?.seen));
  const receiptRe = new RegExp(`${c.skill} (learned|noted|saved|already knows|forgot|did not learn)`, "i");
  return {
    pass: failures.length === 0,
    failures,
    loaded: meta.runs > 0,
    recorded: lessons.map(describe),
    receipt: !changed ? "n/a" : receiptRe.test(reply) ? "shown" : "missing",
  };
}

async function runCase(c: Case, root: string): Promise<CaseResult> {
  const dir = mkdtempSync(join(root, `${c.id}-`));
  const base = { id: c.id, costUsd: 0, model: "", reply: "", dir, loaded: false, recorded: [], receipt: "n/a" as const };
  try {
    const { env, proj, home, seeds } = prepare(c, dir);
    const ctx = { env, proj, home, dir };
    const first = await turn(c.task ?? spec.skills[c.skill]?.task ?? "", false, ctx);
    if (!first.ok) return { ...base, pass: false, failures: [`turn 1 failed: ${first.error ?? first.text.slice(0, 200)}`] };
    const second = await turn(c.message, true, ctx);
    const result = evaluate(c, home, seeds, second.text);
    if (!second.ok) result.failures.unshift(`turn 2 failed: ${second.error ?? ""}`);
    return { ...base, ...result, pass: result.pass && second.ok, costUsd: first.costUsd + second.costUsd, model: first.model || second.model, reply: second.text };
  } catch (err) {
    return { ...base, pass: false, failures: [`setup failed: ${(err as Error).message}`] };
  }
}

async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
      const r = results[i] as unknown as CaseResult;
      console.log(`${r.pass ? "PASS" : "FAIL"} ${r.id}${r.pass ? "" : `: ${r.failures.join("; ")}`}`);
    }
  });
  await Promise.all(workers);
  return results;
}

const root = mkdtempSync(join(tmpdir(), "bluer-eval-"));
console.log(`Running ${cases.length} cases with ${agent}${values.model ? ` (${values.model})` : ""}, ${values.jobs} at a time. Work folder: ${root}`);
const results = await pool(cases, Number(values.jobs) || 4, (c) => runCase(c, root));

const passed = results.filter((r) => r.pass).length;
const cost = results.reduce((sum, r) => sum + r.costUsd, 0);
const model = [...new Set(results.map((r) => r.model).filter(Boolean))].join(", ") || values.model || "default";
const shown = results.filter((r) => r.receipt === "shown").length;
const needed = results.filter((r) => r.receipt !== "n/a").length;
const groups = new Map<string, { pass: number; total: number }>();
for (const r of results) {
  const g = r.id.split("-")[0] ?? r.id;
  const entry = groups.get(g) ?? { pass: 0, total: 0 };
  entry.total += 1;
  if (r.pass) entry.pass += 1;
  groups.set(g, entry);
}

console.log("");
for (const r of results) {
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id}  (skill loaded: ${r.loaded ? "yes" : "no"}, receipt: ${r.receipt})`);
  for (const line of r.recorded) console.log(`        ${line}`);
  for (const f of r.failures) console.log(`      ! ${f}`);
}
console.log("");
console.log(`${passed}/${results.length} passed with ${agent} (${model}). Receipt shown in ${shown}/${needed} sessions that changed a lesson. Cost: $${cost.toFixed(2)}.`);
console.log([...groups].map(([g, v]) => `${g} ${v.pass}/${v.total}`).join(", "));

const resultsDir = join(import.meta.dirname, "results");
mkdirSync(resultsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const file = join(resultsDir, `${stamp}-${agent}.json`);
writeFileSync(file, JSON.stringify({ agent, model, date: todayIso(), passed, total: results.length, costUsd: cost, results }, null, 2) + "\n");
console.log(`Results: ${file}`);

if (values.summary) {
  const summaryFile = join(import.meta.dirname, "RESULTS.md");
  const header =
    "# Learning eval results\n\nOne line per full run of `evals/learning/run.ts --summary`. See [../README.md](../README.md) for what the cases test.\n\n" +
    "| Date | Agent | Model | Passed | By group | Receipt shown |\n|---|---|---|---|---|---|\n";
  const old = existsSync(summaryFile) ? readFileSync(summaryFile, "utf8") : header;
  const row = `| ${todayIso()} | ${agent} | ${model} | ${passed}/${results.length} | ${[...groups].map(([g, v]) => `${g} ${v.pass}/${v.total}`).join(", ")} | ${shown}/${needed} |\n`;
  writeFileSync(summaryFile, (old.startsWith("# Learning eval results") ? old : header) + row);
  console.log(`Added a line to ${summaryFile}`);
}

if (!values.keep) rmSync(root, { recursive: true, force: true });
