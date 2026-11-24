import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { learnReceipt } from "../src/cli.ts";
import type { Lesson } from "../src/lessons.ts";

const MAIN = join(import.meta.dirname, "..", "src", "main.ts");
const root = mkdtempSync(join(tmpdir(), "bluer-cli-"));
after(() => rmSync(root, { recursive: true, force: true }));

function bluer(...args: string[]): { code: number | null; stdout: string; stderr: string } {
  const env = { ...process.env, BLUER_HOME: join(root, "bluer"), HOME: join(root, "user"), BLUER_TODAY: "2026-11-24" };
  const r = spawnSync(process.execPath, [MAIN, ...args], { env, encoding: "utf8" });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

describe("bluer CLI", () => {
  it("prints help", () => {
    const r = bluer("help");
    assert.equal(r.code, 0);
    assert.match(r.stdout, /bluer new/);
  });

  it("runs the main loop end to end", () => {
    assert.match(bluer("new", "Doing house work, 1. clean the table, 2. clean the kitchen", "--no-link").stdout, /Created "doing-house-work" v1/);
    assert.equal(
      bluer("learn", "doing-house-work", "Never use bleach", "--always").stdout,
      'doing-house-work learned: "Never use bleach". It does this every time now. Say "undo that" to remove it.\n' +
        "(Lesson L1, rule, seen once; SKILL.md is now v2. To undo: bluer forget doing-house-work L1)\n",
    );
    assert.match(bluer("status", "doing-house-work").stdout, /doing-house-work v2 .*\nLessons: 1 rule, 0 edge cases, 0 candidates.*\n  rule {6}L1 {3}Never use bleach\n/);
    assert.match(bluer("history", "doing-house-work").stdout, /v1 {2}2026-11-24 {2}created from intent\.md\nv2/);
    assert.equal(
      bluer("forget", "doing-house-work", "--last").stdout,
      'doing-house-work forgot: "Never use bleach". It no longer does this.\n(SKILL.md is now v3. To bring it back: bluer restore doing-house-work L1)\n',
    );
    assert.match(bluer("restore", "doing-house-work", "L1").stdout, /^doing-house-work remembers again: "Never use bleach"\. It does this every time now\.\n\(SKILL\.md is now v4\.\)/);
    assert.match(bluer("rollback", "doing-house-work", "v1").stdout, /is now v5, with the lessons of v1/);
    assert.equal(bluer("list").stdout.trim(), "doing-house-work");
  });

  it("tells the user what each lesson did, in the first line", () => {
    const lesson: Lesson = {
      id: "L3", text: "keep it short", step: null, source: "correction", impact: "low", seen: 1,
      firstSeen: "2026-11-24", lastSeen: "2026-11-24", lastSeenRun: 0, explicit: false, oneOff: false, status: "active",
    };
    const first = (tier: Parameters<typeof learnReceipt>[1]["tier"], extra: { isNew?: boolean; version?: number | null } = {}): string =>
      learnReceipt("email", { lesson, tier, isNew: extra.isNew ?? true, version: extra.version === undefined ? 2 : extra.version })[0] ?? "";
    assert.equal(first("rule"), 'email learned: "keep it short". It does this every time now. Say "undo that" to remove it.');
    assert.equal(first("edge"), 'email learned: "keep it short". It uses this when the case comes up again. Say "undo that" to remove it.');
    assert.equal(first("candidate", { version: null }), 'email noted: "keep it short". It learns this if it keeps coming up. Say "undo that" to remove it.');
    assert.equal(first("pending", { version: null }), 'email saved: "keep it short". It uses this after you approve it. Say "undo that" to remove it.');
    assert.equal(first("ignored", { version: null }), 'email did not learn "keep it short": it is about this time only.');
    assert.equal(first("forgotten", { version: null }), 'email did not learn "keep it short": you asked it to forget this.');
    assert.equal(first("rule", { isNew: false, version: null }), 'email already knows: "keep it short".');
    assert.match(learnReceipt("email", { lesson, tier: "forgotten", isNew: false, version: null })[1] ?? "", /To bring it back: bluer restore email L3\)$/);
  });

  it("prints user errors without a stack trace and exits 1", () => {
    const r = bluer("learn", "no-such-skill", "x");
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^bluer: There is no skill named "no-such-skill"/);
    assert.doesNotMatch(r.stderr, /at .*\.ts:\d+/);
  });

  it("rejects an unknown option", () => {
    const r = bluer("list", "--colour");
    assert.equal(r.code, 1);
    assert.match(r.stderr, /^bluer: /);
  });
});
