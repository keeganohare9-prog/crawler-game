/**
 * Data and deterministic helpers for progression across a Signal Depths run.
 *
 * This module deliberately contains no browser APIs. The caller owns mutable run
 * state and persistence; the definitions here are safe to use from gameplay,
 * server rendering, and unit tests.
 */

export type Rarity = "common" | "uncommon" | "rare" | "legendary" | "cursed";

export type RunUpgradeId =
  | "reinforced_heart"
  | "razor_arc"
  | "second_wind"
  | "phase_steps"
  | "static_guard"
  | "volatile_mix"
  | "long_fuse"
  | "blood_broadcast"
  | "scavenger_protocol"
  | "kinetic_return"
  | "crowd_favorite"
  | "last_signal";

export interface RunUpgradeDefinition {
  readonly id: RunUpgradeId;
  readonly name: string;
  readonly description: string;
  readonly rarity: Exclude<Rarity, "cursed">;
  readonly maxStacks: number;
  readonly tags: readonly string[];
  readonly effects: Readonly<Record<string, number>>;
}

export const RUN_UPGRADES = [
  { id: "reinforced_heart", name: "Reinforced Heart", description: "+20 maximum health and heal 20 health immediately.", rarity: "common", maxStacks: 3, tags: ["survival"], effects: { maxHealth: 20, instantHeal: 20 } },
  { id: "razor_arc", name: "Razor Arc", description: "Sword swings are 15% wider and deal 10% more damage.", rarity: "common", maxStacks: 3, tags: ["melee"], effects: { attackArcMultiplier: 0.15, meleeDamageMultiplier: 0.1 } },
  { id: "second_wind", name: "Second Wind", description: "Stamina starts regenerating sooner and regenerates 20% faster.", rarity: "common", maxStacks: 2, tags: ["stamina"], effects: { staminaDelayMultiplier: -0.2, staminaRegenMultiplier: 0.2 } },
  { id: "phase_steps", name: "Phase Steps", description: "Dodges travel 20% farther and gain 80 ms of invulnerability.", rarity: "uncommon", maxStacks: 2, tags: ["dodge"], effects: { dodgeDistanceMultiplier: 0.2, invulnerabilityMs: 80 } },
  { id: "static_guard", name: "Static Guard", description: "A perfect dodge reflects nearby projectiles for double damage.", rarity: "rare", maxStacks: 1, tags: ["dodge", "projectile"], effects: { reflectedProjectileDamageMultiplier: 2 } },
  { id: "volatile_mix", name: "Volatile Mix", description: "Bombs ignite survivors for damage over time.", rarity: "uncommon", maxStacks: 2, tags: ["bomb"], effects: { burnDamagePerSecond: 5, burnDurationSeconds: 3 } },
  { id: "long_fuse", name: "Long Fuse", description: "Fury lasts 4 seconds longer and grants 10% movement speed.", rarity: "uncommon", maxStacks: 2, tags: ["fury"], effects: { furyDurationSeconds: 4, furyMoveSpeedMultiplier: 0.1 } },
  { id: "blood_broadcast", name: "Blood Broadcast", description: "Kills restore 2 health while below 35% health.", rarity: "rare", maxStacks: 2, tags: ["survival", "kill"], effects: { lowHealthThreshold: 0.35, healthOnKill: 2 } },
  { id: "scavenger_protocol", name: "Scavenger Protocol", description: "Enemies have a 12% greater chance to drop an item.", rarity: "common", maxStacks: 3, tags: ["loot"], effects: { itemDropChance: 0.12 } },
  { id: "kinetic_return", name: "Kinetic Return", description: "Knocking an enemy into a wall deals 18 bonus damage.", rarity: "uncommon", maxStacks: 3, tags: ["melee", "knockback"], effects: { wallImpactDamage: 18 } },
  { id: "crowd_favorite", name: "Crowd Favorite", description: "Gain 15% more hype, but enemies move 5% faster.", rarity: "rare", maxStacks: 2, tags: ["hype", "risk"], effects: { hypeMultiplier: 0.15, enemySpeedMultiplier: 0.05 } },
  { id: "last_signal", name: "Last Signal", description: "Once per run, survive lethal damage at 1 health and emit a shockwave.", rarity: "legendary", maxStacks: 1, tags: ["survival"], effects: { lethalSaveCharges: 1, shockwaveDamage: 35 } },
] as const satisfies readonly RunUpgradeDefinition[];

export interface UpgradeStack {
  readonly id: RunUpgradeId;
  readonly stacks: number;
}

/** Returns a stable set of distinct upgrade choices for a safe room. */
export function chooseSafeRoomUpgrades(
  seed: string | number,
  owned: readonly UpgradeStack[],
  choiceCount = 3,
): readonly RunUpgradeDefinition[] {
  const ownedStacks = new Map(owned.map((entry) => [entry.id, entry.stacks]));
  const eligible = RUN_UPGRADES.filter(
    (upgrade) => (ownedStacks.get(upgrade.id) ?? 0) < upgrade.maxStacks,
  );
  return seededSample(eligible, choiceCount, `${seed}:safe-room`);
}

export type DareId =
  | "untouched"
  | "no_tonic"
  | "trap_artist"
  | "speed_feed"
  | "close_quarters"
  | "bomb_double"
  | "cursed_carrier"
  | "perfect_dodge";

export interface AudienceDareDefinition {
  readonly id: DareId;
  readonly name: string;
  readonly briefing: string;
  readonly trackingKey: string;
  readonly target: number;
  readonly hypeReward: number;
  readonly scoreReward: number;
  readonly failureRule?: string;
}

export const AUDIENCE_DARES = [
  { id: "untouched", name: "Untouched", briefing: "Clear the next combat room without taking damage.", trackingKey: "roomsClearedUntouched", target: 1, hypeReward: 18, scoreReward: 650, failureRule: "Take damage before the room clears." },
  { id: "no_tonic", name: "Dry Run", briefing: "Clear the next two rooms without using a tonic.", trackingKey: "roomsClearedWithoutTonic", target: 2, hypeReward: 14, scoreReward: 500, failureRule: "Use a healing tonic." },
  { id: "trap_artist", name: "Cache Cracker", briefing: "Open and resolve a Gambler's Cache loot room.", trackingKey: "lootRoomsCleared", target: 1, hypeReward: 20, scoreReward: 800 },
  { id: "speed_feed", name: "Speed Feed", briefing: "Clear a combat room in under 25 seconds.", trackingKey: "fastRoomClears", target: 1, hypeReward: 16, scoreReward: 600 },
  { id: "close_quarters", name: "Personal Space Denied", briefing: "Defeat 5 enemies with melee attacks.", trackingKey: "meleeKills", target: 5, hypeReward: 12, scoreReward: 450 },
  { id: "bomb_double", name: "Two-for-One", briefing: "Defeat 2 enemies with a single bomb.", trackingKey: "multiBombKills", target: 1, hypeReward: 22, scoreReward: 900 },
  { id: "cursed_carrier", name: "Bad Influence", briefing: "Carry a cursed item through 3 cleared rooms.", trackingKey: "cursedRoomsCleared", target: 3, hypeReward: 25, scoreReward: 1000, failureRule: "Drop or cleanse every cursed item." },
  { id: "perfect_dodge", name: "Frame Perfect", briefing: "Perfect-dodge 4 telegraphed attacks.", trackingKey: "perfectDodges", target: 4, hypeReward: 18, scoreReward: 700 },
] as const satisfies readonly AudienceDareDefinition[];

export function chooseAudienceDares(
  seed: string | number,
  excluded: readonly DareId[] = [],
  choiceCount = 2,
): readonly AudienceDareDefinition[] {
  const blocked = new Set(excluded);
  return seededSample(
    AUDIENCE_DARES.filter((dare) => !blocked.has(dare.id)),
    choiceCount,
    `${seed}:audience-dare`,
  );
}

export interface SponsorRewardThreshold {
  readonly hype: number;
  readonly id: string;
  readonly name: string;
  readonly reward: Readonly<Record<string, number | string>>;
}

export const SPONSOR_REWARDS = [
  { hype: 15, id: "warm_applause", name: "Warm Applause", reward: { tonic: 1 } },
  { hype: 35, id: "supply_ping", name: "Supply Ping", reward: { bomb: 1, score: 250 } },
  { hype: 60, id: "featured_crawler", name: "Featured Crawler", reward: { fury: 1, score: 500 } },
  { hype: 90, id: "sponsor_cache", name: "Sponsor Cache", reward: { rarityFloor: "rare", itemChoices: 2 } },
  { hype: 125, id: "signal_royalty", name: "Signal Royalty", reward: { maxHealth: 15, score: 1000 } },
] as const satisfies readonly SponsorRewardThreshold[];

export function sponsorRewardsCrossed(
  previousHype: number,
  currentHype: number,
): readonly SponsorRewardThreshold[] {
  const low = Math.max(0, previousHype);
  const high = Math.max(low, currentHype);
  return SPONSOR_REWARDS.filter((reward) => reward.hype > low && reward.hype <= high);
}

export interface RunStats {
  readonly won: boolean;
  readonly elapsedSeconds: number;
  readonly roomsDiscovered: number;
  readonly totalRooms: number;
  readonly roomsCleared: number;
  readonly enemiesDefeated: number;
  readonly elitesDefeated: number;
  readonly bossesDefeated: number;
  readonly damageTaken: number;
  readonly deaths: number;
  readonly highestHype: number;
  readonly daresCompleted: number;
  readonly secretsFound: number;
  readonly lootValue: number;
  readonly remainingSeconds?: number;
  readonly favoriteWeapon?: string;
}

export interface RunSummary {
  readonly score: number;
  readonly grade: "S" | "A" | "B" | "C" | "D";
  readonly gradeLabel: string;
  readonly explorationPercent: number;
  readonly headline: string;
  readonly highlights: readonly string[];
  readonly stats: RunStats;
}

export function calculateRunScore(stats: RunStats): number {
  const exploration = stats.totalRooms > 0
    ? Math.round((stats.roomsDiscovered / stats.totalRooms) * 1500)
    : 0;
  const subtotal =
    (stats.won ? 3000 : 0) +
    stats.roomsCleared * 180 +
    stats.enemiesDefeated * 45 +
    stats.elitesDefeated * 300 +
    stats.bossesDefeated * 1500 +
    stats.daresCompleted * 500 +
    stats.secretsFound * 400 +
    Math.round(stats.lootValue * 0.5) +
    Math.max(0, stats.remainingSeconds ?? 0) * 4 +
    exploration;
  const survivalPenalty = stats.damageTaken * 3 + stats.deaths * 2000;
  const hypeMultiplier = 1 + Math.min(Math.max(stats.highestHype, 0), 150) / 300;
  return Math.max(0, Math.round((subtotal - survivalPenalty) * hypeMultiplier));
}

export function summarizeRun(stats: RunStats): RunSummary {
  const score = calculateRunScore(stats);
  const grade = score >= 10_000 ? "S" : score >= 7_500 ? "A" : score >= 5_000 ? "B" : score >= 2_500 ? "C" : "D";
  const explorationPercent = stats.totalRooms > 0
    ? Math.min(100, Math.round((stats.roomsDiscovered / stats.totalRooms) * 100))
    : 0;
  const highlights: string[] = [];
  if (stats.won) highlights.push("Signal escaped");
  if (explorationPercent === 100) highlights.push("Full floor mapped");
  if (stats.damageTaken === 0) highlights.push("Untouchable run");
  if (stats.daresCompleted >= 3) highlights.push("Audience darling");
  if (stats.secretsFound > 0) highlights.push(`${stats.secretsFound} secret${stats.secretsFound === 1 ? "" : "s"} found`);
  if (stats.favoriteWeapon) highlights.push(`Favorite: ${stats.favoriteWeapon}`);
  return {
    score,
    grade,
    gradeLabel: { S: "Signal Legend", A: "Prime Time", B: "Crowd Pleaser", C: "Still Broadcasting", D: "Dead Air" }[grade],
    explorationPercent,
    headline: stats.won ? "TRANSMISSION COMPLETE" : "SIGNAL LOST",
    highlights,
    stats,
  };
}

export interface PermanentUnlockDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: "weapon" | "item" | "palette" | "modifier";
  readonly condition: { readonly stat: keyof RunStats | "lifetimeRuns" | "lifetimeKills"; readonly atLeast: number };
}

export const PERMANENT_UNLOCKS = [
  { id: "weapon_spear", name: "Antenna Spear Starter", description: "Defeat 15 lifetime enemies to select the Antenna Spear as a starting weapon.", category: "weapon", condition: { stat: "lifetimeKills", atLeast: 15 } },
  { id: "weapon_hammer", name: "Dead-Air Hammer Starter", description: "Defeat the Broadcast Warden to select the Dead-Air Hammer as a starting weapon.", category: "weapon", condition: { stat: "bossesDefeated", atLeast: 1 } },
  { id: "item_decoy", name: "Laugh Track Decoy", description: "Adds decoys to future loot pools.", category: "item", condition: { stat: "daresCompleted", atLeast: 3 } },
  { id: "item_freeze", name: "Pause Button", description: "Adds freeze canisters to future loot pools.", category: "item", condition: { stat: "secretsFound", atLeast: 2 } },
  { id: "palette_neon", name: "Neon Afterimage", description: "Unlocks a vivid player palette.", category: "palette", condition: { stat: "highestHype", atLeast: 100 } },
  { id: "modifier_blackout", name: "Blackout Floor", description: "Unlocks a low-visibility challenge modifier.", category: "modifier", condition: { stat: "bossesDefeated", atLeast: 1 } },
  { id: "palette_veteran", name: "Veteran Static", description: "Unlocks a weathered monochrome palette.", category: "palette", condition: { stat: "lifetimeRuns", atLeast: 10 } },
  { id: "modifier_rush", name: "Rush Hour", description: "Unlocks a faster, higher-scoring floor modifier.", category: "modifier", condition: { stat: "lifetimeKills", atLeast: 150 } },
] as const satisfies readonly PermanentUnlockDefinition[];

export type UnlockProgress = Partial<Record<keyof RunStats | "lifetimeRuns" | "lifetimeKills", number | boolean | string>>;

/** The caller should persist the returned IDs; this function never writes storage. */
export function newlyEarnedUnlocks(
  progress: UnlockProgress,
  alreadyUnlocked: readonly string[],
): readonly PermanentUnlockDefinition[] {
  const unlocked = new Set(alreadyUnlocked);
  return PERMANENT_UNLOCKS.filter((entry) => {
    const raw = progress[entry.condition.stat];
    const value = typeof raw === "number" ? raw : raw === true ? 1 : 0;
    return !unlocked.has(entry.id) && value >= entry.condition.atLeast;
  });
}

export interface CursedItemDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly upside: Readonly<Record<string, number>>;
  readonly curse: Readonly<Record<string, number | string>>;
  readonly hypePerRoom: number;
}

export const CURSED_ITEMS = [
  { id: "idol_open_mic", name: "Open-Mic Idol", description: "Fantastic for ratings. Terrible for privacy.", upside: { hypeMultiplier: 0.3, rareDropChance: 0.15 }, curse: { enemyDetectionRadiusMultiplier: 1.5 }, hypePerRoom: 5 },
  { id: "boots_bad_timing", name: "Boots of Bad Timing", description: "Impossibly quick, suspiciously unlucky.", upside: { moveSpeedMultiplier: 0.25 }, curse: { trapTelegraphMs: -300 }, hypePerRoom: 4 },
  { id: "glass_transmitter", name: "Glass Transmitter", description: "Makes every hit louder—including theirs.", upside: { damageMultiplier: 0.45 }, curse: { maxHealthMultiplier: -0.3 }, hypePerRoom: 6 },
  { id: "hungry_crown", name: "The Hungry Crown", description: "Rewards aggression and punishes hesitation.", upside: { healthOnKill: 4 }, curse: { healthDrainPerSecondOutOfCombat: 0.5 }, hypePerRoom: 7 },
  { id: "mirror_badge", name: "Mirror Badge", description: "Projectiles fear you. Sword arms do not.", upside: { projectileDamageReduction: 0.65 }, curse: { meleeDamageTakenMultiplier: 0.35 }, hypePerRoom: 5 },
] as const satisfies readonly CursedItemDefinition[];

export interface BossPhaseDefinition {
  readonly id: "warden_intro" | "warden_overload" | "warden_dead_air";
  readonly name: string;
  readonly startsAtHealthRatio: number;
  readonly attacks: readonly string[];
  readonly arenaRule: string;
  readonly pylonInteraction: {
    readonly action: "disable" | "overload" | "reverse";
    readonly channelSeconds: number;
    readonly effect: string;
    readonly bossStunSeconds: number;
    readonly playerRisk: string;
  };
}

export const BOSS_PHASES = [
  { id: "warden_intro", name: "Opening Monologue", startsAtHealthRatio: 1, attacks: ["telegraphed cleave", "signal charge", "fan projectiles"], arenaRule: "Three shield pylons reduce damage to the Warden by 75%.", pylonInteraction: { action: "disable", channelSeconds: 1.2, effect: "Removes one shield layer and cancels the current projectile volley.", bossStunSeconds: 1, playerRisk: "Channeling leaves the player stationary." } },
  { id: "warden_overload", name: "Ratings Spike", startsAtHealthRatio: 0.66, attacks: ["rotating beam", "reinforcement summon", "double cleave"], arenaRule: "Disabled pylons periodically reactivate unless overloaded.", pylonInteraction: { action: "overload", channelSeconds: 1.5, effect: "Permanently breaks the pylon and deals 8% maximum health to the boss.", bossStunSeconds: 1.5, playerRisk: "The pylon emits a delayed damaging ring." } },
  { id: "warden_dead_air", name: "Dead Air", startsAtHealthRatio: 0.3, attacks: ["arena blackout", "chain charge", "signal storm"], arenaRule: "Hazard tiles spread from the arena edge toward the center.", pylonInteraction: { action: "reverse", channelSeconds: 0.9, effect: "Reverses the hazard spread and creates a temporary safe zone.", bossStunSeconds: 2, playerRisk: "A failed channel empowers the next signal storm." } },
] as const satisfies readonly BossPhaseDefinition[];

export function bossPhaseForHealth(currentHealth: number, maximumHealth: number): BossPhaseDefinition {
  const ratio = maximumHealth <= 0 ? 0 : Math.min(1, Math.max(0, currentHealth / maximumHealth));
  return [...BOSS_PHASES]
    .sort((a, b) => a.startsAtHealthRatio - b.startsAtHealthRatio)
    .find((phase) => ratio <= phase.startsAtHealthRatio) ?? BOSS_PHASES[0];
}

function seededSample<T>(items: readonly T[], count: number, seed: string): readonly T[] {
  const pool = [...items];
  const random = mulberry32(hashSeed(seed));
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(random() * (index + 1));
    [pool[index], pool[swapWith]] = [pool[swapWith], pool[index]];
  }
  return pool.slice(0, Math.max(0, Math.min(Math.floor(count), pool.length)));
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
