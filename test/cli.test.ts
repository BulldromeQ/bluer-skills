import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

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
    assert.match(bluer("learn", "doing-house-work", "Never use bleach", "--always").stdout, /now a rule in SKILL\.md\.\nSKILL\.md is now v2\./);
    assert.match(bluer("status", "doing-house-work").stdout, /doing-house-work v2 .*\nLessons: 1 rule, 0 edge cases, 0 candidates/);
    assert.match(bluer("history", "doing-house-work").stdout, /v1 {2}2026-11-24 {2}created from intent\.md\nv2/);
    assert.match(bluer("rollback", "doing-house-work", "v1").stdout, /is now v3, with the lessons of v1/);
    assert.equal(bluer("list").stdout.trim(), "doing-house-work");
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
