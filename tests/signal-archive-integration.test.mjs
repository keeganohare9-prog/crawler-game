import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Signal Archive progression is connected to completed runs and the menu", async () => {
  const [page, runtime, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/runtime-types.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(page, /updateMetaProgressionAfterRun\(storedMeta, runId, summary\)/);
  assert.match(page, /mergeCompletedRunDiscoveries\(storedArchive/);
  assert.match(page, /SIGNAL FRAGMENTS/);
  assert.match(page, /NEW SIGNALS ARCHIVED/);
  assert.match(page, /ROUTE TAKEN/);
  assert.match(page, /THE SIGNAL ARCHIVE/);
  assert.match(styles, /\.archive-entry-grid/);
  assert.match(runtime, /newDiscoveries: string\[\]/);
  assert.match(runtime, /fragmentReward: number/);
});

test("selected kits and challenges alter live run construction", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /aggregateChallengeEffects\(challengeIds\)/);
  assert.match(page, /challengeEffects\.enemySpeedMultiplier/);
  assert.match(page, /challengeEffects\.enemyHealthMultiplier/);
  assert.match(page, /challengeEffects\.timeLimitMultiplier/);
  assert.match(page, /visibilityRadiusMultiplier/);
  assert.match(page, /starterKit\?\.startingItems\.tonics/);
  assert.match(page, /starterKit\?\.arsenalId/);
  assert.match(page, /lockCursedItem/);
  assert.match(page, /validateChallengeSelection\(next, challengeProgress\)/);
});
