import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classify } from "../src/gate.ts";
import type { Lesson } from "../src/lessons.ts";

const DAY = "2026-11-24";

function lesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: "L1",
    text: "Wipe with a damp cloth",
    step: null,
    source: "correction",
    impact: "low",
    seen: 1,
    firstSeen: DAY,
    lastSeen: DAY,
    lastSeenRun: 0,
    explicit: false,
    oneOff: false,
    status: "active",
    ...overrides,
  };
}

describe("classify (balanced)", () => {
  it("keeps a lesson seen once as a candidate", () => {
    assert.equal(classify(lesson(), "balanced", DAY, 0), "candidate");
  });

  it("makes an edge case at 2 sightings and a rule at 3", () => {
    assert.equal(classify(lesson({ seen: 2 }), "balanced", DAY, 0), "edge");
    assert.equal(classify(lesson({ seen: 3 }), "balanced", DAY, 0), "rule");
  });

  it("makes a rule at once when the user says always or never", () => {
    assert.equal(classify(lesson({ explicit: true }), "balanced", DAY, 0), "rule");
  });

  it("makes a rule at once when the lesson prevented a costly failure", () => {
    assert.equal(classify(lesson({ impact: "high" }), "balanced", DAY, 0), "rule");
  });

  it("makes an edge case at once for medium impact", () => {
    assert.equal(classify(lesson({ impact: "medium" }), "balanced", DAY, 0), "edge");
  });

  it("ignores a one-off, even when the user marked it explicit", () => {
    assert.equal(classify(lesson({ oneOff: true, explicit: true }), "balanced", DAY, 0), "ignored");
  });

  it("expires a candidate after 30 days or 10 runs without a sighting", () => {
    assert.equal(classify(lesson({ lastSeen: "2026-10-25" }), "balanced", DAY, 0), "candidate");
    assert.equal(classify(lesson({ lastSeen: "2026-10-24" }), "balanced", DAY, 0), "expired");
    assert.equal(classify(lesson({ lastSeenRun: 0 }), "balanced", DAY, 10), "candidate");
    assert.equal(classify(lesson({ lastSeenRun: 0 }), "balanced", DAY, 11), "expired");
  });

  it("never expires a rule or an edge case", () => {
    assert.equal(classify(lesson({ seen: 2, lastSeen: "2025-01-01" }), "balanced", DAY, 99), "edge");
    assert.equal(classify(lesson({ seen: 3, lastSeen: "2025-01-01" }), "balanced", DAY, 99), "rule");
  });
});

describe("classify (other levels)", () => {
  it("strict needs more sightings and expires sooner", () => {
    assert.equal(classify(lesson({ seen: 3 }), "strict", DAY, 0), "edge");
    assert.equal(classify(lesson({ seen: 4 }), "strict", DAY, 0), "rule");
    assert.equal(classify(lesson({ lastSeen: "2026-11-09" }), "strict", DAY, 0), "expired");
  });

  it("eager makes a rule at 2 sightings and keeps candidates longer", () => {
    assert.equal(classify(lesson({ seen: 2 }), "eager", DAY, 0), "rule");
    assert.equal(classify(lesson({ lastSeen: "2026-10-01" }), "eager", DAY, 0), "candidate");
  });
});
