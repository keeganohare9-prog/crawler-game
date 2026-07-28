import assert from "node:assert/strict";
import test from "node:test";

import {
  addRunHistory,
  dailySeed,
  localDateKey,
  parseRunHistory,
} from "../app/game/broadcast-features.ts";

const validRun = {
  id: "daily:2026-07-28",
  endedAt: "2026-07-28T12:00:00.000Z",
  mode: "daily",
  dailyKey: "2026-07-28",
  classId: "mage",
  won: true,
  score: 12345,
  grade: "S",
  roomsCleared: 20,
  kills: 42,
  maxHype: 4.5,
  boss: "Ninja Master",
};

test("daily keys and seeds are deterministic in local calendar time", () => {
  const date = new Date(2026, 6, 28, 23, 59, 59);
  assert.equal(localDateKey(date), "2026-07-28");
  assert.equal(dailySeed("2026-07-28"), dailySeed("2026-07-28"));
  assert.notEqual(dailySeed("2026-07-28"), dailySeed("2026-07-29"));
});

test("run history ignores malformed storage and retains valid records", () => {
  assert.deepEqual(parseRunHistory("{broken"), []);
  assert.deepEqual(parseRunHistory(JSON.stringify([null, { score: "many" }, validRun])), [validRun]);
  assert.deepEqual(parseRunHistory(JSON.stringify([{ ...validRun, score: null }, { ...validRun, maxHype: "loud" }])), []);
});

test("run history is newest-first, deduplicated, and bounded", () => {
  const history = Array.from({ length: 15 }, (_, index) => ({ ...validRun, id: `run-${index}` }));
  const next = addRunHistory(history, { ...validRun, id: "run-4", score: 999 }, 12);
  assert.equal(next.length, 12);
  assert.equal(next[0].id, "run-4");
  assert.equal(next[0].score, 999);
  assert.equal(next.filter((entry) => entry.id === "run-4").length, 1);
});
