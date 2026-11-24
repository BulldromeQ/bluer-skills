import assert from "node:assert/strict";
import { appendFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { claudeCode } from "../src/agents/claude-code.ts";
import { git } from "../src/git.ts";
import { DEFAULT_SETTINGS } from "../src/home.ts";
import * as store from "../src/store.ts";

const roots: string[] = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function setup(overrides: Partial<store.Context> = {}): store.Context {
  const root = mkdtempSync(join(tmpdir(), "bluer-test-"));
  roots.push(root);
  const userHome = join(root, "user");
  mkdirSync(join(userHome, ".claude"), { recursive: true });
  return { home: join(root, "bluer"), userHome, today: "2026-11-24", settings: { ...DEFAULT_SETTINGS }, ...overrides };
}

const HOUSE = "Doing house work, 1. clean the table, 2. clean the restroom, 3. clean the kitchen";
const skillFile = (ctx: store.Context, name: string, file: string): string => readFileSync(join(ctx.home, "skills", name, file), "utf8");

describe("createSkill", () => {
  let ctx: store.Context;
  beforeEach(() => {
    ctx = setup();
  });

  it("makes v1, commits it and links it into Claude Code", () => {
    const made = store.createSkill(ctx, HOUSE);
    assert.equal(made.name, "doing-house-work");
    assert.equal(made.version, 1);
    assert.equal(skillFile(ctx, made.name, "intent.md"), "# Doing house work\n\n1. clean the table\n2. clean the restroom\n3. clean the kitchen\n");
    assert.match(skillFile(ctx, made.name, "SKILL.md"), /^---\nname: doing-house-work\n/);
    assert.match(git(ctx.home, ["log", "-1", "--format=%s"]), /^doing-house-work v1: created from intent\.md$/);
    assert.equal(git(ctx.home, ["status", "--porcelain"]), "");

    const linked = join(claudeCode.skillsDir(ctx.userHome), made.name);
    assert.ok(lstatSync(linked).isSymbolicLink());
    assert.equal(readlinkSync(linked), made.dir);
    assert.equal(made.links[0]?.result, "linked");
  });

  it("does not overwrite a skill the agent already has", () => {
    const existing = join(claudeCode.skillsDir(ctx.userHome), "doing-house-work");
    mkdirSync(existing, { recursive: true });
    writeFileSync(join(existing, "SKILL.md"), "mine");
    const made = store.createSkill(ctx, HOUSE);
    assert.equal(made.links[0]?.result, "skipped");
    assert.equal(readFileSync(join(existing, "SKILL.md"), "utf8"), "mine");

    assert.equal(store.link(ctx, made.name, claudeCode, true), "replaced");
    assert.ok(lstatSync(existing).isSymbolicLink());
  });

  it("asks for a name when the title has no Latin letters", () => {
    assert.throws(() => store.createSkill(ctx, "做家务，1. 擦桌子"), /--name/);
    assert.equal(store.createSkill(ctx, "做家务，1. 擦桌子", { name: "house-work" }).name, "house-work");
  });

  it("refuses a second skill with the same name", () => {
    store.createSkill(ctx, HOUSE, { link: false });
    assert.throws(() => store.createSkill(ctx, HOUSE, { link: false }), /already exists/);
  });
});

describe("learn", () => {
  it("moves a lesson from candidate to edge case to rule, one version per change", () => {
    const ctx = setup();
    const { name } = store.createSkill(ctx, HOUSE, { link: false });
    const lesson = { text: "Wipe with a damp cloth, then dry it", step: "1" };

    const first = store.learn(ctx, name, lesson);
    assert.deepEqual([first.tier, first.version], ["candidate", null]);
    const second = store.learn(ctx, name, lesson);
    assert.deepEqual([second.tier, second.version], ["edge", 2]);
    assert.ok(existsSync(join(ctx.home, "skills", name, "references", "learned-edge-cases.md")));
    const third = store.learn(ctx, name, { ...lesson, step: "clean the table" });
    assert.deepEqual([third.tier, third.version], ["rule", 3]);
    assert.ok(!existsSync(join(ctx.home, "skills", name, "references", "learned-edge-cases.md")));
    assert.match(skillFile(ctx, name, "SKILL.md"), /## 1\. clean the table\n\n- Wipe with a damp cloth, then dry it/);
    assert.equal(git(ctx.home, ["status", "--porcelain"]), "");
  });

  it("rejects a step the skill does not have", () => {
    const ctx = setup();
    const { name } = store.createSkill(ctx, HOUSE, { link: false });
    assert.throws(() => store.learn(ctx, name, { text: "x", step: "9" }), /no step 9/);
    assert.throws(() => store.learn(ctx, name, { text: "x", step: "wash the car" }), /Its steps are/);
  });

  it("waits for approval in review mode", () => {
    const ctx = setup({ settings: { ...DEFAULT_SETTINGS, learning: "review" } });
    const { name } = store.createSkill(ctx, HOUSE, { link: false });
    const result = store.learn(ctx, name, { text: "Never use bleach", explicit: true });
    assert.deepEqual([result.tier, result.version], ["pending", null]);
    assert.doesNotMatch(skillFile(ctx, name, "SKILL.md"), /bleach/);

    const approved = store.approve(ctx, name, "all");
    assert.deepEqual(approved, { approved: ["L1"], version: 2 });
    assert.match(skillFile(ctx, name, "SKILL.md"), /bleach/);
  });

  it("refuses to learn when learning is off", () => {
    const ctx = setup({ settings: { ...DEFAULT_SETTINGS, learning: "off" } });
    const { name } = store.createSkill(ctx, HOUSE, { link: false });
    assert.throws(() => store.learn(ctx, name, { text: "x" }), /Learning is off/);
  });
});

describe("intent changes, hand edits and rollback", () => {
  it("keeps learned rules when the owner adds a step", () => {
    const ctx = setup();
    const { name } = store.createSkill(ctx, HOUSE, { link: false });
    store.learn(ctx, name, { text: "Never use bleach", explicit: true });
    appendFileSync(join(ctx.home, "skills", name, "intent.md"), "4. clean the living room\n");
    assert.deepEqual(store.rebuild(ctx, name), { version: 3 });
    const skillMd = skillFile(ctx, name, "SKILL.md");
    assert.match(skillMd, /## 4\. clean the living room/);
    assert.match(skillMd, /Never use bleach/);
    assert.deepEqual(store.rebuild(ctx, name), { version: null });
  });

  it("saves a hand edit to SKILL.md as a pending lesson instead of losing it", () => {
    const ctx = setup();
    const { name } = store.createSkill(ctx, HOUSE, { link: false });
    appendFileSync(join(ctx.home, "skills", name, "SKILL.md"), "\n- Open a window first\n");
    assert.equal(store.status(ctx, name).handEdited, true);

    store.rebuild(ctx, name);
    const status = store.status(ctx, name);
    assert.equal(status.handEdited, false);
    assert.equal(status.counts.pending, 1);
    assert.match(status.pending[0]?.text ?? "", /hand-edits\/SKILL-v1-2026-11-24\.md/);
    assert.match(skillFile(ctx, name, "hand-edits/SKILL-v1-2026-11-24.md"), /Open a window first/);
  });

  it("rolls lessons back, keeps the owner's intent and makes a new version", () => {
    const ctx = setup();
    const { name } = store.createSkill(ctx, HOUSE, { link: false });
    store.learn(ctx, name, { text: "Never use bleach", explicit: true }); // v2
    store.learn(ctx, name, { text: "Use only cold water", explicit: true }); // v3
    appendFileSync(join(ctx.home, "skills", name, "intent.md"), "4. clean the living room\n");
    store.rebuild(ctx, name); // v4

    assert.deepEqual(store.rollback(ctx, name, 2), { version: 5 });
    const skillMd = skillFile(ctx, name, "SKILL.md");
    assert.match(skillMd, /Never use bleach/);
    assert.doesNotMatch(skillMd, /cold water/);
    assert.match(skillMd, /## 4\. clean the living room/);
    assert.match(skillMd, /version: "5"/);
    assert.deepEqual(
      store.history(ctx, name).map((v) => v.summary),
      ["created from intent.md", "learned L1: Never use bleach", "learned L2: Use only cold water", "rebuilt", "rolled back lessons to v2"],
    );
    assert.throws(() => store.rollback(ctx, name, 5), /already at v5/);
    assert.throws(() => store.rollback(ctx, name, 42), /no v42/);
  });
});

describe("adoptSkill", () => {
  function existingSkill(ctx: store.Context, frontmatter: string): string {
    const dir = join(ctx.userHome, "old-skills", "pdf-tables");
    mkdirSync(join(dir, "scripts"), { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), `---\n${frontmatter}\n---\n\n# PDF tables\n\nRun scripts/extract.py.\n`);
    writeFileSync(join(dir, "scripts", "extract.py"), "print('hi')\n");
    return dir;
  }

  it("keeps the original as v0 and adds lessons on top", () => {
    const ctx = setup();
    const src = existingSkill(ctx, "name: pdf-tables\ndescription: Extract tables from PDF files.");
    const { name } = store.adoptSkill(ctx, src);
    assert.equal(name, "pdf-tables");
    assert.deepEqual(store.history(ctx, name).map((v) => v.version), [0]);
    assert.ok(existsSync(join(ctx.home, "skills", name, "scripts", "extract.py")));
    assert.equal(store.status(ctx, name).handEdited, false);

    const result = store.learn(ctx, name, { text: "Scanned files need OCR first", impact: "high" });
    assert.equal(result.version, 1);
    assert.match(skillFile(ctx, name, "SKILL.md"), /Run scripts\/extract\.py\.\n\n## Learned rules\n\n- Scanned files need OCR first/);
    assert.match(readFileSync(join(src, "SKILL.md"), "utf8"), /^---\nname: pdf-tables/);
  });

  it("reports frontmatter that is not valid YAML", () => {
    const ctx = setup();
    const src = existingSkill(ctx, "name: pdf-tables\ndescription: Use when: the user has a PDF");
    assert.throws(() => store.adoptSkill(ctx, src), /not valid YAML/);
  });

  it("refuses a folder without SKILL.md", () => {
    const ctx = setup();
    assert.throws(() => store.adoptSkill(ctx, ctx.userHome), /no SKILL\.md/);
  });
});

describe("recordRun and listSkills", () => {
  it("counts runs, and expires a candidate after 10 runs without a sighting", () => {
    const ctx = setup();
    const { name } = store.createSkill(ctx, HOUSE, { link: false });
    store.learn(ctx, name, { text: "Maybe use a microfiber cloth" });
    for (let i = 0; i < 11; i++) store.recordRun(ctx, name);
    store.rebuild(ctx, name);
    assert.equal(store.status(ctx, name).counts.expired, 1);
    assert.deepEqual(store.listSkills(ctx), [name]);
  });
});
