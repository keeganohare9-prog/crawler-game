import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("roadmap systems preserve cumulative state and safely restore local progress", async () => {
  const [page, runtime] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/runtime-types.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /function parseStoredArray/);
  assert.match(page, /function storedNumber/);
  assert.doesNotMatch(page, /JSON\.parse\(localStorage\.getItem\("signal-depths-discovered/);
  assert.match(page, /next\.priorRoomsCleared = game\.priorRoomsCleared \+ game\.roomsCleared/);
  assert.match(page, /roomsDiscovered: game\.priorRoomsExplored \+ game\.explored\.size/);
  assert.match(runtime, /audienceSpeedMultiplier\?: number/);
  assert.match(page, /enemy\.speed \/= applied/);
  assert.match(page, /applyAudienceSpeed\(game, spawned\)/);
  assert.match(page, /addHype\(game, \.35\)/);
  assert.doesNotMatch(page, /game\.hype = Math\.min\(5/);
});
