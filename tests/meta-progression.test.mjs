import assert from "node:assert/strict";
import test from "node:test";

import {
  STARTER_KITS,
  createMetaProgressionProfile,
  calculateSignalFragmentReward,
  parseMetaProgressionProfile,
  purchaseStarterKit,
  selectStarterKit,
  unlockStarterKit,
  updateMetaProgressionAfterRun,
} from "../app/game/meta-progression.ts";

const summary = {
  score: 10_500,
  grade: "S",
  gradeLabel: "Signal Legend",
  explorationPercent: 100,
  headline: "TRANSMISSION COMPLETE",
  highlights: [],
  stats: {
    won: true,
    elapsedSeconds: 500,
    roomsDiscovered: 12,
    totalRooms: 12,
    roomsCleared: 10,
    enemiesDefeated: 30,
    elitesDefeated: 2,
    bossesDefeated: 2,
    damageTaken: 50,
    deaths: 0,
    highestHype: 4.8,
    daresCompleted: 2,
    secretsFound: 2,
    lootValue: 800,
  },
};

test("safely parses, sanitizes, and migrates persisted profiles", () => {
  assert.deepEqual(parseMetaProgressionProfile("not json"), createMetaProgressionProfile());
  const migrated = parseMetaProgressionProfile(JSON.stringify({
    fragments: 70.9,
    unlockedKits: ["frost_operator", "frost_operator", "invalid"],
    selectedKit: "frost_operator",
    completedRuns: -5,
    processedRunIds: ["run-1", "run-1", 3],
  }));
  assert.equal(migrated.version, 1);
  assert.equal(migrated.signalFragments, 70);
  assert.deepEqual(migrated.unlockedKitIds, ["frost_operator"]);
  assert.equal(migrated.selectedKitId, "frost_operator");
  assert.equal(migrated.completedRuns, 0);
  assert.deepEqual(migrated.processedRunIds, ["run-1"]);
});

test("calculates a deterministic fragment reward with an auditable breakdown", () => {
  const reward = calculateSignalFragmentReward(summary);
  assert.deepEqual(reward.breakdown, {
    broadcast: 3,
    victory: 12,
    grade: 10,
    exploration: 5,
    bosses: 8,
    dares: 4,
    secrets: 4,
    hype: 4,
  });
  assert.equal(reward.total, 50);
  assert.deepEqual(calculateSignalFragmentReward(summary), reward);
});

test("defines exactly three balanced class-specific starter kits", () => {
  assert.equal(STARTER_KITS.length, 3);
  assert.deepEqual(new Set(STARTER_KITS.map((kit) => kit.classId)), new Set(["knight", "mage", "archer"]));
  for (const kit of STARTER_KITS) {
    assert.ok(kit.cost > 0);
    assert.ok(kit.tradeoff.length > 20);
    assert.equal(kit.startingItems.tonics, 1);
    assert.ok(Boolean(kit.weaponId) !== Boolean(kit.arsenalId));
  }
});

test("unlocks, purchases, and selects kits without mutating profiles", () => {
  const original = { ...createMetaProgressionProfile(), signalFragments: 60 };
  const tooExpensive = purchaseStarterKit({ ...original, signalFragments: 10 }, "antenna_vanguard");
  assert.equal(tooExpensive.reason, "insufficient-fragments");
  assert.equal(tooExpensive.profile.signalFragments, 10);

  const purchased = purchaseStarterKit(original, "antenna_vanguard");
  assert.equal(purchased.changed, true);
  assert.equal(purchased.profile.signalFragments, 15);
  assert.equal(purchased.profile.lifetimeFragmentsSpent, 45);
  assert.deepEqual(original.unlockedKitIds, []);

  const selected = selectStarterKit(purchased.profile, "antenna_vanguard");
  assert.equal(selected.profile.selectedKitId, "antenna_vanguard");
  assert.equal(selectStarterKit(original, "frost_operator").reason, "locked");

  const granted = unlockStarterKit(original, "splitwire_scout");
  assert.equal(granted.changed, true);
  assert.equal(granted.profile.signalFragments, 60);
});

test("awards a completed run once and keeps a bounded idempotency ledger", () => {
  const initial = createMetaProgressionProfile();
  const first = updateMetaProgressionAfterRun(initial, "run-001", summary);
  assert.equal(first.applied, true);
  assert.equal(first.profile.signalFragments, 50);
  assert.equal(first.profile.lifetimeFragmentsEarned, 50);
  assert.equal(first.profile.completedRuns, 1);

  const duplicate = updateMetaProgressionAfterRun(first.profile, "run-001", summary);
  assert.equal(duplicate.applied, false);
  assert.strictEqual(duplicate.profile, first.profile);
});
