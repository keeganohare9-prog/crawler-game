import assert from "node:assert/strict";
import test from "node:test";

import {
  ARCHIVE_CATEGORIES,
  ARCHIVE_ENTRIES,
  EMPTY_ARCHIVE_PROFILE,
  acknowledgeArchiveDiscoveries,
  archiveCategoryProgress,
  archiveDiscoveryCallouts,
  archivePresentation,
  mergeCompletedRunDiscoveries,
  migrateArchiveProfile,
  newArchiveDiscoveryIds,
  parseArchiveProfile,
  unacknowledgedArchiveIds,
} from "../app/game/archive.ts";

test("catalog has stable unique entries across every archive category", () => {
  assert.deepEqual(ARCHIVE_CATEGORIES.map((category) => category.id), ["enemies", "arsenals", "curses", "bosses", "endings", "secrets"]);
  assert.equal(new Set(ARCHIVE_ENTRIES.map((entry) => entry.id)).size, ARCHIVE_ENTRIES.length);
  for (const category of ARCHIVE_CATEGORIES) {
    assert.ok(ARCHIVE_ENTRIES.some((entry) => entry.category === category.id), `${category.id} should not be empty`);
  }
  assert.ok(ARCHIVE_ENTRIES.some((entry) => entry.id === "weapon:cleaver"));
  assert.ok(ARCHIVE_ENTRIES.some((entry) => entry.id === "arsenal:storm-orb"));
  assert.ok(ARCHIVE_ENTRIES.some((entry) => entry.id === "curse:hungry_crown"));
});

test("locked entries expose unknown or corrupted presentation without leaking detail", () => {
  const enemy = ARCHIVE_ENTRIES.find((entry) => entry.id === "enemy:skitter");
  const lore = ARCHIVE_ENTRIES.find((entry) => entry.id === "lore:channel-zero");
  assert.ok(enemy && lore);
  assert.deepEqual(archivePresentation(enemy, EMPTY_ARCHIVE_PROFILE), {
    id: "enemy:skitter", category: "enemies", discovered: false, state: "unknown",
    name: "UNKNOWN CONTACT", summary: "NO VERIFIED SIGNAL", detail: null, glyph: "??",
  });
  assert.equal(archivePresentation(lore, EMPTY_ARCHIVE_PROFILE).state, "corrupted");
  const decoded = archivePresentation(enemy, { version: 2, discoveredIds: ["enemy:skitter"], acknowledgedIds: [] });
  assert.equal(decoded.name, "Razorback Skitter");
  assert.match(decoded.detail, /striped carapace/);
});

test("profiles safely parse and migrate grouped legacy discoveries", () => {
  assert.deepEqual(parseArchiveProfile("{broken"), EMPTY_ARCHIVE_PROFILE);
  assert.deepEqual(parseArchiveProfile(JSON.stringify({ discoveredIds: ["enemy:nope", 5] })), EMPTY_ARCHIVE_PROFILE);

  const migrated = migrateArchiveProfile({
    version: 1,
    enemies: ["skitter", "missing"],
    weapons: ["cleaver"],
    classArsenals: ["storm-orb"],
    curses: ["hungry_crown"],
    seenIds: ["enemy:skitter", "enemy:missing"],
  });
  assert.deepEqual(migrated, {
    version: 2,
    discoveredIds: ["enemy:skitter", "weapon:cleaver", "arsenal:storm-orb", "curse:hungry_crown"],
    acknowledgedIds: ["enemy:skitter"],
  });
});

test("completed runs merge discoveries idempotently and unlock secret lore tiers", () => {
  const first = mergeCompletedRunDiscoveries(EMPTY_ARCHIVE_PROFILE, {
    enemies: ["skitter", "spitter"],
    weapons: ["cleaver"],
    classArsenals: ["storm-orb"],
    curses: ["glass_transmitter"],
    bosses: ["static-conductor"],
    ending: "escaped",
    secretsFound: 3,
    lore: ["shadow-carrier"],
  });
  assert.ok(first.newIds.includes("boss:static-conductor"));
  assert.ok(first.newIds.includes("ending:escaped"));
  assert.ok(first.newIds.includes("lore:signal-leak"));
  assert.ok(first.newIds.includes("lore:ratings-ledger"));
  assert.ok(first.newIds.includes("lore:channel-zero"));
  assert.ok(first.newIds.includes("lore:shadow-carrier"));

  const repeated = mergeCompletedRunDiscoveries(first.profile, { enemies: ["skitter"], secretsFound: 3 });
  assert.deepEqual(repeated.newIds, []);
  assert.equal(new Set(repeated.profile.discoveredIds).size, repeated.profile.discoveredIds.length);
});

test("progress, new detection, callouts, and acknowledgement agree", () => {
  const before = EMPTY_ARCHIVE_PROFILE;
  const after = mergeCompletedRunDiscoveries(before, { enemies: ["skitter"], weapons: ["cleaver"], ending: "subject-offline" }).profile;
  const fresh = newArchiveDiscoveryIds(before, after);
  assert.deepEqual(fresh, ["enemy:skitter", "weapon:cleaver", "ending:subject-offline"]);
  assert.deepEqual(unacknowledgedArchiveIds(after), fresh);

  const callouts = archiveDiscoveryCallouts([...fresh, "enemy:skitter"]);
  assert.equal(callouts.length, 3);
  assert.equal(callouts[0].kicker, "NEW SIGNAL ARCHIVED");
  assert.equal(callouts[0].title, "Razorback Skitter");

  const progress = archiveCategoryProgress(after);
  assert.deepEqual(progress.find((entry) => entry.category === "enemies")?.discovered, 1);
  assert.deepEqual(progress.find((entry) => entry.category === "endings")?.percent, 33);

  const acknowledged = acknowledgeArchiveDiscoveries(after, ["enemy:skitter", "ending:escaped"]);
  assert.deepEqual(acknowledged.acknowledgedIds, ["enemy:skitter"]);
  assert.deepEqual(unacknowledgedArchiveIds(acknowledged), ["weapon:cleaver", "ending:subject-offline"]);
});
