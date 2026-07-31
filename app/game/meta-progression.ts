import type { ClassArsenalId } from "./class-arsenal";
import type { PlayerClassId } from "./classes";
import type { WeaponId } from "./combat-content";
import type { RunSummary } from "./progression";

export const META_PROGRESSION_VERSION = 1 as const;
export const MAX_PROCESSED_RUN_IDS = 50;

export type StarterKitId = "antenna_vanguard" | "frost_operator" | "splitwire_scout";

export interface StarterKitDefinition {
  readonly id: StarterKitId;
  readonly name: string;
  readonly classId: PlayerClassId;
  readonly cost: number;
  readonly description: string;
  readonly tradeoff: string;
  readonly weaponId?: WeaponId;
  readonly arsenalId?: ClassArsenalId;
  readonly startingItems: {
    readonly tonics: number;
    readonly bombs: number;
    readonly furyVials: number;
  };
}

/** Horizontal starting choices: each gains a specialty and gives up sustain. */
export const STARTER_KITS = [
  {
    id: "antenna_vanguard",
    name: "Antenna Vanguard",
    classId: "knight",
    cost: 45,
    description: "Enter with the long-reaching Antenna Spear and a Roombreaker Bomb.",
    tradeoff: "Starts with one Vital Tonic instead of two; the spear is slower and narrower than the cleaver.",
    weaponId: "spear",
    startingItems: { tonics: 1, bombs: 1, furyVials: 0 },
  },
  {
    id: "frost_operator",
    name: "Frost Operator",
    classId: "mage",
    cost: 55,
    description: "Enter with the piercing Frost Prism and one Fury Vial.",
    tradeoff: "Starts with one Vital Tonic; the prism loses the Signal Grimoire's forgiving splash damage.",
    arsenalId: "frost-prism",
    startingItems: { tonics: 1, bombs: 0, furyVials: 1 },
  },
  {
    id: "splitwire_scout",
    name: "Splitwire Scout",
    classId: "archer",
    cost: 50,
    description: "Enter with the three-arrow Splitwire Bow and a Roombreaker Bomb.",
    tradeoff: "Starts with one Vital Tonic; each volley costs two arrows and deals less focused damage.",
    arsenalId: "splitwire-bow",
    startingItems: { tonics: 1, bombs: 1, furyVials: 0 },
  },
] as const satisfies readonly StarterKitDefinition[];

export const STARTER_KIT_IDS = STARTER_KITS.map((kit) => kit.id) as StarterKitId[];

export interface MetaProgressionProfile {
  readonly version: typeof META_PROGRESSION_VERSION;
  readonly signalFragments: number;
  readonly lifetimeFragmentsEarned: number;
  readonly lifetimeFragmentsSpent: number;
  readonly completedRuns: number;
  readonly unlockedKitIds: StarterKitId[];
  readonly selectedKitId: StarterKitId | null;
  /** Bounded idempotency ledger; prevents a result screen from paying twice. */
  readonly processedRunIds: string[];
}

export interface SignalFragmentBreakdown {
  readonly broadcast: number;
  readonly victory: number;
  readonly grade: number;
  readonly exploration: number;
  readonly bosses: number;
  readonly dares: number;
  readonly secrets: number;
  readonly hype: number;
}

export interface SignalFragmentReward {
  readonly total: number;
  readonly breakdown: SignalFragmentBreakdown;
}

export type KitActionFailure = "unknown-kit" | "already-unlocked" | "insufficient-fragments" | "locked";

export interface KitActionResult {
  readonly profile: MetaProgressionProfile;
  readonly changed: boolean;
  readonly reason: KitActionFailure | null;
}

export interface CompletedRunUpdate {
  readonly profile: MetaProgressionProfile;
  readonly reward: SignalFragmentReward;
  readonly applied: boolean;
}

export function createMetaProgressionProfile(): MetaProgressionProfile {
  return {
    version: META_PROGRESSION_VERSION,
    signalFragments: 0,
    lifetimeFragmentsEarned: 0,
    lifetimeFragmentsSpent: 0,
    completedRuns: 0,
    unlockedKitIds: [],
    selectedKitId: null,
    processedRunIds: [],
  };
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeInteger(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value)))
    : fallback;
}

function isStarterKitId(value: unknown): value is StarterKitId {
  return typeof value === "string" && STARTER_KIT_IDS.includes(value as StarterKitId);
}

function safeKitIds(value: unknown): StarterKitId[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isStarterKitId))];
}

function safeRunIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))]
    .slice(0, MAX_PROCESSED_RUN_IDS);
}

/**
 * Migrates both the versioned schema and an early unversioned prototype that
 * used `fragments`, `unlockedKits`, and `selectedKit` field names.
 */
export function migrateMetaProgressionProfile(input: unknown): MetaProgressionProfile {
  const source = recordOf(input);
  if (!source) return createMetaProgressionProfile();
  const signalFragments = safeInteger(source.signalFragments ?? source.fragments);
  const unlockedKitIds = safeKitIds(source.unlockedKitIds ?? source.unlockedKits);
  const selectedCandidate = source.selectedKitId ?? source.selectedKit;
  const selectedKitId = isStarterKitId(selectedCandidate) && unlockedKitIds.includes(selectedCandidate)
    ? selectedCandidate
    : null;
  return {
    version: META_PROGRESSION_VERSION,
    signalFragments,
    lifetimeFragmentsEarned: Math.max(signalFragments, safeInteger(source.lifetimeFragmentsEarned, signalFragments)),
    lifetimeFragmentsSpent: safeInteger(source.lifetimeFragmentsSpent),
    completedRuns: safeInteger(source.completedRuns),
    unlockedKitIds,
    selectedKitId,
    processedRunIds: safeRunIds(source.processedRunIds),
  };
}

/** Accepts raw persisted JSON, parsed objects, null, or arbitrary input. */
export function parseMetaProgressionProfile(input: unknown): MetaProgressionProfile {
  if (typeof input !== "string") return migrateMetaProgressionProfile(input);
  try {
    return migrateMetaProgressionProfile(JSON.parse(input) as unknown);
  } catch {
    return createMetaProgressionProfile();
  }
}

export function calculateSignalFragmentReward(summary: RunSummary): SignalFragmentReward {
  const stats = summary.stats;
  const gradeReward = { S: 10, A: 7, B: 4, C: 2, D: 0 }[summary.grade];
  const breakdown: SignalFragmentBreakdown = {
    broadcast: 3,
    victory: stats.won ? 12 : 0,
    grade: gradeReward,
    exploration: Math.min(5, Math.floor(Math.max(0, summary.explorationPercent) / 20)),
    bosses: Math.min(8, safeInteger(stats.bossesDefeated) * 4),
    dares: Math.min(6, safeInteger(stats.daresCompleted) * 2),
    secrets: Math.min(6, safeInteger(stats.secretsFound) * 2),
    hype: Math.min(5, Math.floor(Math.max(0, stats.highestHype))),
  };
  return { total: Object.values(breakdown).reduce((total, amount) => total + amount, 0), breakdown };
}

export function getStarterKit(id: StarterKitId): StarterKitDefinition {
  return STARTER_KITS.find((kit) => kit.id === id)!;
}

export function unlockStarterKit(profile: MetaProgressionProfile, kitId: StarterKitId): KitActionResult {
  if (!STARTER_KIT_IDS.includes(kitId)) return { profile, changed: false, reason: "unknown-kit" };
  if (profile.unlockedKitIds.includes(kitId)) return { profile, changed: false, reason: "already-unlocked" };
  return {
    profile: { ...profile, unlockedKitIds: [...profile.unlockedKitIds, kitId] },
    changed: true,
    reason: null,
  };
}

export function purchaseStarterKit(profile: MetaProgressionProfile, kitId: StarterKitId): KitActionResult {
  if (!STARTER_KIT_IDS.includes(kitId)) return { profile, changed: false, reason: "unknown-kit" };
  if (profile.unlockedKitIds.includes(kitId)) return { profile, changed: false, reason: "already-unlocked" };
  const kit = getStarterKit(kitId);
  if (profile.signalFragments < kit.cost) return { profile, changed: false, reason: "insufficient-fragments" };
  return {
    profile: {
      ...profile,
      signalFragments: profile.signalFragments - kit.cost,
      lifetimeFragmentsSpent: profile.lifetimeFragmentsSpent + kit.cost,
      unlockedKitIds: [...profile.unlockedKitIds, kitId],
    },
    changed: true,
    reason: null,
  };
}

export function selectStarterKit(profile: MetaProgressionProfile, kitId: StarterKitId | null): KitActionResult {
  if (kitId === null) {
    return profile.selectedKitId === null
      ? { profile, changed: false, reason: null }
      : { profile: { ...profile, selectedKitId: null }, changed: true, reason: null };
  }
  if (!STARTER_KIT_IDS.includes(kitId)) return { profile, changed: false, reason: "unknown-kit" };
  if (!profile.unlockedKitIds.includes(kitId)) return { profile, changed: false, reason: "locked" };
  if (profile.selectedKitId === kitId) return { profile, changed: false, reason: null };
  return { profile: { ...profile, selectedKitId: kitId }, changed: true, reason: null };
}

export function updateMetaProgressionAfterRun(
  profile: MetaProgressionProfile,
  runId: string,
  summary: RunSummary,
): CompletedRunUpdate {
  const reward = calculateSignalFragmentReward(summary);
  const safeRunId = runId.trim();
  if (!safeRunId || profile.processedRunIds.includes(safeRunId)) return { profile, reward, applied: false };
  return {
    profile: {
      ...profile,
      signalFragments: profile.signalFragments + reward.total,
      lifetimeFragmentsEarned: profile.lifetimeFragmentsEarned + reward.total,
      completedRuns: profile.completedRuns + 1,
      processedRunIds: [safeRunId, ...profile.processedRunIds].slice(0, MAX_PROCESSED_RUN_IDS),
    },
    reward,
    applied: true,
  };
}
