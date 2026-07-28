import type { ClassArsenalId } from "./class-arsenal";
import type { PlayerClassId } from "./classes";
import type { WeaponId } from "./combat-content";
import type { EquipmentId } from "./equipment";
import type { RunUpgradeId } from "./progression";

export type AudienceModifierId =
  | "hot_mics"
  | "glass_floor"
  | "speed_round"
  | "sponsor_frenzy"
  | "dead_air"
  | "encore";

export interface AudienceModifier {
  id: AudienceModifierId;
  name: string;
  ballot: string;
  description: string;
  durationRooms: number;
  enemySpeedMultiplier: number;
  enemyDamageMultiplier: number;
  playerDamageMultiplier: number;
  scoreMultiplier: number;
  hypeOnRoomClear: number;
  disableHealing: boolean;
}

export const AUDIENCE_MODIFIERS: readonly AudienceModifier[] = [
  {
    id: "hot_mics",
    name: "Hot Mics",
    ballot: "LOUDER HITS",
    description: "Everyone deals 25% more damage for two cleared rooms.",
    durationRooms: 2,
    enemySpeedMultiplier: 1,
    enemyDamageMultiplier: 1.25,
    playerDamageMultiplier: 1.25,
    scoreMultiplier: 1.1,
    hypeOnRoomClear: 3,
    disableHealing: false,
  },
  {
    id: "glass_floor",
    name: "Glass Floor",
    ballot: "NO HEALING",
    description: "Healing is blocked, but cleared rooms pay bonus score and Hype.",
    durationRooms: 2,
    enemySpeedMultiplier: 1,
    enemyDamageMultiplier: 1,
    playerDamageMultiplier: 1,
    scoreMultiplier: 1.3,
    hypeOnRoomClear: 6,
    disableHealing: true,
  },
  {
    id: "speed_round",
    name: "Speed Round",
    ballot: "FASTER FLOOR",
    description: "Enemies move 20% faster while the audience doubles down.",
    durationRooms: 2,
    enemySpeedMultiplier: 1.2,
    enemyDamageMultiplier: 1,
    playerDamageMultiplier: 1,
    scoreMultiplier: 1.2,
    hypeOnRoomClear: 5,
    disableHealing: false,
  },
  {
    id: "sponsor_frenzy",
    name: "Sponsor Frenzy",
    ballot: "BIG PAYOUT",
    description: "Combat stays normal and cleared rooms earn a large ratings bonus.",
    durationRooms: 1,
    enemySpeedMultiplier: 1,
    enemyDamageMultiplier: 1,
    playerDamageMultiplier: 1,
    scoreMultiplier: 1.5,
    hypeOnRoomClear: 8,
    disableHealing: false,
  },
  {
    id: "dead_air",
    name: "Dead Air",
    ballot: "SILENCE",
    description: "Enemies hit harder, but the player also gains a damage boost.",
    durationRooms: 2,
    enemySpeedMultiplier: 0.9,
    enemyDamageMultiplier: 1.2,
    playerDamageMultiplier: 1.15,
    scoreMultiplier: 1.2,
    hypeOnRoomClear: 4,
    disableHealing: false,
  },
  {
    id: "encore",
    name: "Encore",
    ballot: "FINAL SPRINT",
    description: "Enemies accelerate for one room and that clear earns extra Hype.",
    durationRooms: 1,
    enemySpeedMultiplier: 1.3,
    enemyDamageMultiplier: 1.1,
    playerDamageMultiplier: 1,
    scoreMultiplier: 1.35,
    hypeOnRoomClear: 10,
    disableHealing: false,
  },
] as const;

function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function audienceBallot(
  floorSeed: string | number,
  milestone: number,
): readonly [AudienceModifier, AudienceModifier] {
  const start = hashSeed(`${floorSeed}:audience:${milestone}`) % AUDIENCE_MODIFIERS.length;
  const offset = 1 + (hashSeed(`${milestone}:${floorSeed}:opponent`) % (AUDIENCE_MODIFIERS.length - 1));
  return [
    AUDIENCE_MODIFIERS[start]!,
    AUDIENCE_MODIFIERS[(start + offset) % AUDIENCE_MODIFIERS.length]!,
  ];
}

/** Simulates a reproducible audience vote so daily runs have identical conditions. */
export function resolveAudienceVote(
  floorSeed: string | number,
  milestone: number,
  ballot: readonly [AudienceModifier, AudienceModifier],
): { winner: AudienceModifier; winnerPercent: number } {
  const roll = hashSeed(`${floorSeed}:vote:${milestone}`) % 41;
  const firstPercent = 30 + roll;
  return firstPercent >= 50
    ? { winner: ballot[0], winnerPercent: firstPercent }
    : { winner: ballot[1], winnerPercent: 100 - firstPercent };
}

export type BuildSynergyId =
  | "knight_breaker"
  | "knight_vanguard"
  | "mage_storm"
  | "mage_void"
  | "archer_deadeye"
  | "archer_trickshot";

export interface BuildSynergy {
  id: BuildSynergyId;
  name: string;
  description: string;
  damageMultiplier: number;
  speedMultiplier: number;
  hypeOnKill: number;
}

export interface BuildLoadout {
  classId: PlayerClassId;
  weaponId: WeaponId;
  arsenalId: ClassArsenalId;
  upgrades: readonly RunUpgradeId[];
  equipment: readonly (EquipmentId | null)[];
}

export const BUILD_SYNERGY_GUIDE = [
  { id: "knight_breaker", classId: "knight", name: "Wall Breaker", recipe: "Hammer or Shock Baton + Kinetic Return or Kinetic Brace", payoff: "+18% damage and +1 Hype per kill" },
  { id: "knight_vanguard", classId: "knight", name: "Blood Vanguard", recipe: "Cleaver or Twin Knives + Razor Arc or Blood Broadcast", payoff: "+12% damage and +1 Hype per kill" },
  { id: "mage_storm", classId: "mage", name: "Storm Circuit", recipe: "Storm Orb + Static Guard or Storm Coil", payoff: "+16% damage and +1 Hype per kill" },
  { id: "mage_void", classId: "mage", name: "Event Horizon", recipe: "Void Lantern + Crowd Favorite or Audience Eye", payoff: "+15% damage and +5% movement speed" },
  { id: "archer_deadeye", classId: "archer", name: "Prime-Time Sniper", recipe: "Deadeye Longbow or Relay Recurve + Crowd Favorite or Audience Eye", payoff: "+15% damage and +1 Hype per kill" },
  { id: "archer_trickshot", classId: "archer", name: "Trickshot Feed", recipe: "Splitwire or Bankshot Bow + Phase Steps or Runner Boots", payoff: "+12% damage, +6% movement speed, and +1 Hype per kill" },
] as const satisfies readonly {
  id: BuildSynergyId;
  classId: PlayerClassId;
  name: string;
  recipe: string;
  payoff: string;
}[];

const NO_SYNERGY = {
  id: null,
  name: "Open Signal",
  description: "Add a matching weapon, focus, upgrade, or equipment perk to form a build.",
  damageMultiplier: 1,
  speedMultiplier: 1,
  hypeOnKill: 0,
} as const;

export function activeBuildSynergy(loadout: BuildLoadout): BuildSynergy | typeof NO_SYNERGY {
  const upgradeSet = new Set(loadout.upgrades);
  const equipmentSet = new Set(loadout.equipment.filter(Boolean));

  if (
    loadout.classId === "knight" &&
    ["hammer", "shock-baton"].includes(loadout.weaponId) &&
    (upgradeSet.has("kinetic_return") || equipmentSet.has("kinetic-brace"))
  ) {
    return { id: "knight_breaker", name: "Wall Breaker", description: "Impact attacks deal 18% more damage.", damageMultiplier: 1.18, speedMultiplier: 1, hypeOnKill: 1 };
  }
  if (
    loadout.classId === "knight" &&
    ["cleaver", "twin-knives"].includes(loadout.weaponId) &&
    (upgradeSet.has("razor_arc") || upgradeSet.has("blood_broadcast"))
  ) {
    return { id: "knight_vanguard", name: "Blood Vanguard", description: "Close-range attacks deal 12% more damage and kills earn Hype.", damageMultiplier: 1.12, speedMultiplier: 1, hypeOnKill: 1 };
  }
  if (
    loadout.classId === "mage" &&
    loadout.arsenalId === "storm-orb" &&
    (upgradeSet.has("static_guard") || equipmentSet.has("storm-coil"))
  ) {
    return { id: "mage_storm", name: "Storm Circuit", description: "Storm damage rises 16% and kills earn Hype.", damageMultiplier: 1.16, speedMultiplier: 1, hypeOnKill: 1 };
  }
  if (
    loadout.classId === "mage" &&
    loadout.arsenalId === "void-lantern" &&
    (upgradeSet.has("crowd_favorite") || equipmentSet.has("audience-eye"))
  ) {
    return { id: "mage_void", name: "Event Horizon", description: "Void damage rises 15% and movement increases 5%.", damageMultiplier: 1.15, speedMultiplier: 1.05, hypeOnKill: 0 };
  }
  if (
    loadout.classId === "archer" &&
    ["deadeye-longbow", "relay-recurve"].includes(loadout.arsenalId) &&
    (upgradeSet.has("crowd_favorite") || equipmentSet.has("audience-eye"))
  ) {
    return { id: "archer_deadeye", name: "Prime-Time Sniper", description: "Precision damage rises 15% and kills earn Hype.", damageMultiplier: 1.15, speedMultiplier: 1, hypeOnKill: 1 };
  }
  if (
    loadout.classId === "archer" &&
    ["splitwire-bow", "bankshot-bow"].includes(loadout.arsenalId) &&
    (upgradeSet.has("phase_steps") || equipmentSet.has("runner-boots"))
  ) {
    return { id: "archer_trickshot", name: "Trickshot Feed", description: "Trick shots deal 12% more damage and movement increases 6%.", damageMultiplier: 1.12, speedMultiplier: 1.06, hypeOnKill: 1 };
  }
  return NO_SYNERGY;
}

export function dailySeed(dateKey: string): number {
  return hashSeed(`signal-depths:daily:${dateKey}`);
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export interface RunHistoryEntry {
  id: string;
  endedAt: string;
  mode: "standard" | "daily";
  dailyKey?: string;
  classId: PlayerClassId;
  won: boolean;
  score: number;
  grade: "S" | "A" | "B" | "C" | "D";
  roomsCleared: number;
  kills: number;
  maxHype: number;
  boss: string;
}

export function parseRunHistory(raw: string | null): RunHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is RunHistoryEntry => {
      if (!entry || typeof entry !== "object") return false;
      const candidate = entry as Partial<RunHistoryEntry>;
      return typeof candidate.id === "string"
        && typeof candidate.endedAt === "string"
        && (candidate.mode === "standard" || candidate.mode === "daily")
        && ["knight", "mage", "archer"].includes(candidate.classId ?? "")
        && typeof candidate.won === "boolean"
        && typeof candidate.score === "number" && Number.isFinite(candidate.score)
        && ["S", "A", "B", "C", "D"].includes(candidate.grade ?? "")
        && typeof candidate.roomsCleared === "number" && Number.isFinite(candidate.roomsCleared)
        && typeof candidate.kills === "number" && Number.isFinite(candidate.kills)
        && typeof candidate.maxHype === "number" && Number.isFinite(candidate.maxHype)
        && typeof candidate.boss === "string";
    }).slice(0, 12);
  } catch {
    return [];
  }
}

export function addRunHistory(
  history: readonly RunHistoryEntry[],
  entry: RunHistoryEntry,
  limit = 12,
): RunHistoryEntry[] {
  return [entry, ...history.filter((candidate) => candidate.id !== entry.id)].slice(0, Math.max(1, limit));
}
