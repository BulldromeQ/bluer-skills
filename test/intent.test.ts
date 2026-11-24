import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BluerError } from "../src/errors.ts";
import { checkName, formatIntent, parseIntent, slugify } from "../src/intent.ts";

describe("parseIntent", () => {
  it("reads everything typed on one line, as in chat", () => {
    const intent = parseIntent("Doing house work, 1. clean the table, 2. clean the restroom, 3. clean the kitchen");
    assert.deepEqual(intent, {
      title: "Doing house work",
      steps: ["clean the table", "clean the restroom", "clean the kitchen"],
      notes: [],
    });
  });

  it("reads Chinese punctuation on one line", () => {
    const intent = parseIntent("做家务：1. 擦桌子，2. 打扫厕所，3、打扫厨房。");
    assert.deepEqual(intent.steps, ["擦桌子", "打扫厕所", "打扫厨房"]);
    assert.equal(intent.title, "做家务");
  });

  it("reads a title line, one step per line and notes", () => {
    const intent = parseIntent("# Doing house work\n\n1. clean the table\n2) clean the restroom\n- clean the kitchen\n\nWe have a cat.");
    assert.deepEqual(intent, {
      title: "Doing house work",
      steps: ["clean the table", "clean the restroom", "clean the kitchen"],
      notes: ["We have a cat"],
    });
  });

  it("round-trips through formatIntent", () => {
    const intent = parseIntent("Doing house work, 1. clean the table, 2. clean the kitchen");
    assert.deepEqual(parseIntent(formatIntent(intent)), intent);
  });

  it("asks for steps when there are none", () => {
    assert.throws(() => parseIntent("Doing house work"), BluerError);
  });

  it("asks for a title when there is none", () => {
    assert.throws(() => parseIntent("1. clean the table\n2. clean the kitchen"), /title/);
    assert.throws(() => parseIntent("1. clean the table, 2. clean the kitchen"), /title/);
  });

  it("does not read a version number as a step", () => {
    const intent = parseIntent("Update to v2.0, 1. download it, 2. install it");
    assert.equal(intent.title, "Update to v2.0");
    assert.deepEqual(intent.steps, ["download it", "install it"]);
  });
});

describe("slugify and checkName", () => {
  it("makes a valid skill name from a title", () => {
    assert.equal(slugify("Doing house work!"), "doing-house-work");
    assert.equal(slugify("Café  menu"), "cafe-menu");
  });

  it("returns an empty name for a title with no Latin letters, so the user picks one", () => {
    assert.equal(slugify("做家务"), "");
  });

  it("rejects names agents do not accept", () => {
    assert.throws(() => checkName("House-Work"), BluerError);
    assert.throws(() => checkName("house--work"), BluerError);
    assert.throws(() => checkName("a".repeat(65)), BluerError);
    assert.doesNotThrow(() => checkName("house-work-2"));
  });
});
