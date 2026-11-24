import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSkill, EDGE_CASES_FILE, type BuildInput } from "../src/build.ts";
import { splitFrontmatter } from "../src/frontmatter.ts";
import { parseIntent } from "../src/intent.ts";
import { recordLesson, type Lesson, type LessonInput } from "../src/lessons.ts";

const DAY = "2026-11-24";
const intent = parseIntent("Doing house work, 1. clean the table, 2. clean the restroom, 3. clean the kitchen");

function lessonsFrom(...inputs: Array<LessonInput & { times?: number }>): Lesson[] {
  let lessons: Lesson[] = [];
  for (const { times = 1, ...input } of inputs) {
    for (let i = 0; i < times; i++) lessons = recordLesson(lessons, input, DAY, 0).lessons;
  }
  return lessons;
}

function input(overrides: Partial<BuildInput> = {}): BuildInput {
  return { name: "doing-house-work", intent, base: null, lessons: [], gate: "balanced", today: DAY, runs: 0, version: 1, ...overrides };
}

describe("buildSkill from intent", () => {
  it("writes valid Agent Skills frontmatter, even with ': ' in the title", () => {
    const tricky = parseIntent("Cleaning: the house, 1. clean the table");
    const { skillMd } = buildSkill(input({ intent: tricky, version: 7 }));
    const { data } = splitFrontmatter(skillMd);
    assert.equal(data.name, "doing-house-work");
    assert.match(String(data.description), /^Steps for "Cleaning: the house"/);
    assert.deepEqual(data.metadata, { "built-by": "bluer-skills", version: "7" });
  });

  it("lists every step, and puts each rule under its step", () => {
    const lessons = lessonsFrom(
      { text: "Wipe with a damp cloth, then dry it", step: "clean the table", times: 3 },
      { text: "Never use bleach", explicit: true },
    );
    const { skillMd, tiers } = buildSkill(input({ lessons }));
    assert.equal(tiers.rule.length, 2);
    assert.match(skillMd, /## 1\. clean the table\n\n- Wipe with a damp cloth, then dry it\n\n## 2\. clean the restroom/);
    assert.match(skillMd, /## General rules\n\n- Never use bleach/);
  });

  it("keeps candidates and one-offs out of SKILL.md", () => {
    const lessons = lessonsFrom({ text: "Maybe use a microfiber cloth" }, { text: "There is a cake today", oneOff: true });
    const { skillMd, edgeCasesMd, tiers } = buildSkill(input({ lessons }));
    assert.equal(tiers.candidate.length, 1);
    assert.equal(tiers.ignored.length, 1);
    assert.doesNotMatch(skillMd, /microfiber|cake/);
    assert.equal(edgeCasesMd, null);
  });

  it("puts edge cases in their own file and points to it", () => {
    const lessons = lessonsFrom({ text: "If the sink is blocked, do not use chemicals", step: "clean the kitchen", times: 2 });
    const { skillMd, edgeCasesMd } = buildSkill(input({ lessons }));
    assert.ok(skillMd.includes(`(${EDGE_CASES_FILE})`));
    assert.doesNotMatch(skillMd, /sink/);
    assert.match(edgeCasesMd ?? "", /## 3\. clean the kitchen\n\n- If the sink is blocked/);
  });

  it("archives lessons for a removed step and brings them back with the step", () => {
    const lessons = lessonsFrom({ text: "Restock the paper towels", step: "clean the restroom", times: 3 });
    const without = parseIntent("Doing house work, 1. clean the table, 2. clean the kitchen");
    const removed = buildSkill(input({ intent: without, lessons }));
    assert.equal(removed.lessons[0]?.status, "archived");
    assert.doesNotMatch(removed.skillMd, /paper towels/);

    const restored = buildSkill(input({ lessons: removed.lessons }));
    assert.equal(restored.lessons[0]?.status, "active");
    assert.match(restored.skillMd, /paper towels/);
  });

  it("keeps lessons when the owner adds a step", () => {
    const lessons = lessonsFrom({ text: "Wipe with a damp cloth", step: "clean the table", times: 3 });
    const more = parseIntent("Doing house work, 1. clean the table, 2. clean the restroom, 3. clean the kitchen, 4. clean the living room");
    const { skillMd } = buildSkill(input({ intent: more, lessons }));
    assert.match(skillMd, /## 1\. clean the table\n\n- Wipe with a damp cloth/);
    assert.match(skillMd, /## 4\. clean the living room/);
  });

  it("marks expired candidates", () => {
    const lessons = lessonsFrom({ text: "Maybe use a microfiber cloth" });
    const { lessons: out } = buildSkill(input({ lessons, today: "2027-01-31" }));
    assert.equal(out[0]?.status, "expired");
  });

  it("skips pending lessons", () => {
    const lessons = lessonsFrom({ text: "Never use bleach", explicit: true, pending: true });
    assert.doesNotMatch(buildSkill(input({ lessons })).skillMd, /bleach/);
  });

  it("is the same for the same input", () => {
    const lessons = lessonsFrom({ text: "Never use bleach", explicit: true });
    assert.equal(buildSkill(input({ lessons })).skillMd, buildSkill(input({ lessons })).skillMd);
  });
});

describe("buildSkill from an adopted skill", () => {
  const base = "---\nname: pdf-tables\ndescription: Extract tables from PDF files.\nlicense: MIT\n---\n\n# PDF tables\n\nUse tool A.\n";

  it("keeps the original text and fields, and adds learned rules at the end", () => {
    const lessons = lessonsFrom({ text: "Tool A fails on scanned files; use tool B", impact: "high" });
    const { skillMd } = buildSkill(input({ name: "pdf-tables", intent: null, base, lessons, version: 1 }));
    const { data, body } = splitFrontmatter(skillMd);
    assert.equal(data.description, "Extract tables from PDF files.");
    assert.equal(data.license, "MIT");
    assert.ok(body.trimStart().startsWith("# PDF tables\n\nUse tool A.\n\n## Learned rules\n\n- Tool A fails on scanned files"));
  });
});
