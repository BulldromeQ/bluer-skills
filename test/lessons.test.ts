import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatLearnings, parseLearnings, recordLesson, type Lesson } from "../src/lessons.ts";

const DAY = "2026-11-24";

describe("recordLesson", () => {
  it("adds a new lesson with defaults", () => {
    const { lessons, lesson, isNew } = recordLesson([], { text: "Wipe with a damp cloth", step: "clean the table" }, DAY, 0);
    assert.equal(isNew, true);
    assert.equal(lessons.length, 1);
    assert.deepEqual(lesson, {
      id: "L1",
      text: "Wipe with a damp cloth",
      step: "clean the table",
      source: "correction",
      impact: "low",
      seen: 1,
      firstSeen: DAY,
      lastSeen: DAY,
      lastSeenRun: 0,
      explicit: false,
      oneOff: false,
      status: "active",
    });
  });

  it("counts the same lesson again, ignoring case, spaces and end punctuation", () => {
    let lessons: Lesson[] = recordLesson([], { text: "Wipe with a damp cloth", step: "clean the table" }, DAY, 0).lessons;
    const again = recordLesson(lessons, { text: "wipe with a  damp cloth.", step: "Clean the table", impact: "medium" }, "2026-11-25", 3);
    lessons = again.lessons;
    assert.equal(again.isNew, false);
    assert.equal(lessons.length, 1);
    assert.equal(again.lesson.seen, 2);
    assert.equal(again.lesson.lastSeen, "2026-11-25");
    assert.equal(again.lesson.lastSeenRun, 3);
    assert.equal(again.lesson.impact, "medium");
  });

  it("treats the same text on another step as another lesson", () => {
    const first = recordLesson([], { text: "Use a damp cloth", step: "clean the table" }, DAY, 0).lessons;
    const second = recordLesson(first, { text: "Use a damp cloth", step: "clean the kitchen" }, DAY, 0);
    assert.equal(second.isNew, true);
    assert.equal(second.lesson.id, "L2");
  });

  it("stops treating a lesson as a one-off when it comes back", () => {
    const first = recordLesson([], { text: "A cake is on the table", oneOff: true }, DAY, 0).lessons;
    const again = recordLesson(first, { text: "A cake is on the table" }, DAY, 0);
    assert.equal(again.lesson.oneOff, false);
  });

  it("keeps an approved lesson active in review mode, and reactivates an expired one", () => {
    const active = recordLesson([], { text: "Dry the table" }, DAY, 0).lessons;
    assert.equal(recordLesson(active, { text: "Dry the table", pending: true }, DAY, 0).lesson.status, "active");
    const expired = active.map((l) => ({ ...l, status: "expired" as const }));
    assert.equal(recordLesson(expired, { text: "Dry the table" }, DAY, 0).lesson.status, "active");
    assert.equal(recordLesson(expired, { text: "Dry the table", pending: true }, DAY, 0).lesson.status, "pending");
  });

  it("rejects an empty lesson", () => {
    assert.throws(() => recordLesson([], { text: "   " }, DAY, 0), /text/);
  });
});

describe("learnings.md", () => {
  it("round-trips every field", () => {
    let lessons: Lesson[] = [];
    lessons = recordLesson(lessons, { text: "Wipe with a damp cloth: then dry", step: "clean the table", impact: "high" }, DAY, 2).lessons;
    lessons = recordLesson(lessons, { text: "Never use bleach", explicit: true, source: "answer" }, DAY, 2).lessons;
    lessons = recordLesson(lessons, { text: "Cake today", oneOff: true, pending: true }, DAY, 2).lessons;
    assert.deepEqual(parseLearnings(formatLearnings("house-work", lessons)), lessons);
  });

  it("reads an empty file as no lessons", () => {
    assert.deepEqual(parseLearnings(formatLearnings("house-work", [])), []);
    assert.deepEqual(parseLearnings(""), []);
  });
});
