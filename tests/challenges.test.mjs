import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function loadChallenges() {
  const source = await readFile(new URL("../app/game/challenges.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

test("challenge catalog covers every requested risk family", async () => {
  const { CHALLENGE_MODIFIERS, CHALLENGE_MODIFIER_IDS } = await loadChallenges();
  assert.equal(CHALLENGE_MODIFIERS.length, 7);
  assert.equal(new Set(CHALLENGE_MODIFIER_IDS).size, CHALLENGE_MODIFIERS.length);
  assert.ok(CHALLENGE_MODIFIERS.some((entry) => entry.effects.enemySpeedMultiplier > 1));
  assert.ok(CHALLENGE_MODIFIERS.some((entry) => entry.effects.healingMultiplier < 1));
  assert.ok(CHALLENGE_MODIFIERS.some((entry) => entry.effects.disableHealing));
  assert.ok(CHALLENGE_MODIFIERS.some((entry) => entry.effects.eliteChanceBonus > 0));
  assert.ok(CHALLENGE_MODIFIERS.some((entry) => entry.effects.forceCursedItem && entry.effects.lockCursedItem));
  assert.ok(CHALLENGE_MODIFIERS.some((entry) => entry.effects.timeLimitMultiplier < 1));
  assert.ok(CHALLENGE_MODIFIERS.some((entry) => entry.effects.visibilityRadiusMultiplier < 1));
});

test("unlock checks and selection validation reject invalid combinations", async () => {
  const { isChallengeUnlocked, unlockedChallengeModifiers, validateChallengeSelection } = await loadChallenges();
  assert.equal(isChallengeUnlocked("field_medicine", {}), true);
  assert.equal(isChallengeUnlocked("rush_hour", { lifetimeKills: 39 }), false);
  assert.equal(isChallengeUnlocked("rush_hour", { lifetimeKills: 40 }), true);
  assert.ok(unlockedChallengeModifiers({}).some((entry) => entry.id === "field_medicine"));

  const locked = validateChallengeSelection(["rush_hour"], { lifetimeKills: 2 });
  assert.equal(locked.valid, false);
  assert.match(locked.errors.join(" "), /locked/i);

  const conflict = validateChallengeSelection(["field_medicine", "dry_signal"], { bossesDefeated: 1 });
  assert.equal(conflict.valid, false);
  assert.match(conflict.errors.join(" "), /cannot be combined/i);

  const malformed = validateChallengeSelection(["field_medicine", "field_medicine", "not_real"], {});
  assert.equal(malformed.valid, false);
  assert.match(malformed.errors.join(" "), /more than once/);
  assert.match(malformed.errors.join(" "), /unknown/i);

  const tooMany = validateChallengeSelection(
    ["rush_hour", "elite_feed", "cursed_contract", "closing_window"],
    { lifetimeKills: 40, daresCompleted: 2, highestHype: 60, lifetimeRuns: 3 },
  );
  assert.equal(tooMany.valid, false);
  assert.match(tooMany.errors.join(" "), /at most 3/i);
});

test("combined effects stack by operation and make no-healing authoritative", async () => {
  const { aggregateChallengeEffects, DEFAULT_CHALLENGE_EFFECTS } = await loadChallenges();
  assert.deepEqual(aggregateChallengeEffects([]), DEFAULT_CHALLENGE_EFFECTS);

  const effects = aggregateChallengeEffects(["rush_hour", "elite_feed", "closing_window", "blackout_floor"]);
  assert.equal(effects.enemySpeedMultiplier, 1.25);
  assert.equal(effects.enemyHealthMultiplier, 1.2);
  assert.equal(effects.enemyDamageMultiplier, 1.15);
  assert.equal(effects.eliteChanceBonus, 0.3);
  assert.equal(effects.timeLimitMultiplier, 0.65);
  assert.equal(effects.visibilityRadiusMultiplier, 0.55);

  const dry = aggregateChallengeEffects(["dry_signal"]);
  assert.equal(dry.disableHealing, true);
  assert.equal(dry.healingMultiplier, 0);
  assert.equal(dry.startingTonicDelta, -2);

  const deduplicated = aggregateChallengeEffects(["rush_hour", "rush_hour"]);
  assert.equal(deduplicated.enemySpeedMultiplier, 1.25);
});

test("reward helpers combine modifiers without duplicate inflation", async () => {
  const {
    challengeFragmentMultiplier,
    challengeRewardMultipliers,
    challengeScoreMultiplier,
    applyChallengeReward,
  } = await loadChallenges();
  assert.equal(challengeScoreMultiplier(["rush_hour", "elite_feed"]), 1.68);
  assert.equal(challengeFragmentMultiplier(["rush_hour", "elite_feed"]), 1.495);
  assert.deepEqual(challengeRewardMultipliers(["rush_hour"]), { score: 1.2, fragments: 1.15 });
  assert.equal(challengeScoreMultiplier(["rush_hour", "rush_hour"]), 1.2);
  assert.equal(applyChallengeReward(100, 1.495), 150);
  assert.equal(applyChallengeReward(-100, 2), 0);
  assert.equal(applyChallengeReward(Number.NaN, 2), 0);
});
