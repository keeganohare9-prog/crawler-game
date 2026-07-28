import type { RoomKind } from "./floor";
import { CURSED_ITEMS, type CursedItemDefinition } from "./progression";

export type CursedItemId = (typeof CURSED_ITEMS)[number]["id"];

export const CURSED_ITEM_IDS = CURSED_ITEMS.map((item) => item.id) as readonly CursedItemId[];

export function getCursedItem(id: CursedItemId | null | undefined): CursedItemDefinition | null {
  return CURSED_ITEMS.find((item) => item.id === id) ?? null;
}

function hash(value: string | number) {
  const text = String(value);
  let result = 2166136261;
  for (let index = 0; index < text.length; index++) {
    result ^= text.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

/** Stable for a floor seed, so restarting the same seed produces the same curse. */
export function selectCursedItem(seed: string | number): (typeof CURSED_ITEMS)[number] {
  return CURSED_ITEMS[hash(`${seed}:cursed-item`) % CURSED_ITEMS.length];
}

/**
 * Selects one valuable non-boss encounter to hold the floor's cursed drop.
 * The fallback keeps hand-authored/test floors eligible without spawning in safety.
 */
export function selectCursedDropRoom(roomKinds: readonly RoomKind[], seed: string | number): number {
  const valuable = roomKinds
    .map((kind, index) => ({ kind, index }))
    .filter(({ kind, index }) => index > 0 && ["loot", "treasure", "broadcast", "elite"].includes(kind))
    .map(({ index }) => index);
  const candidates = valuable.length
    ? valuable
    : roomKinds.map((kind, index) => ({ kind, index })).filter(({ kind, index }) => index > 0 && kind !== "boss" && kind !== "safe").map(({ index }) => index);
  return candidates[hash(`${seed}:cursed-room`) % Math.max(1, candidates.length)] ?? -1;
}

export function cursedHypeMultiplier(id: CursedItemId | null): number {
  return id === "idol_open_mic" ? 1.3 : 1;
}

export function cursedMoveSpeedMultiplier(id: CursedItemId | null): number {
  return id === "boots_bad_timing" ? 1.25 : 1;
}

export function cursedDamageMultiplier(id: CursedItemId | null): number {
  return id === "glass_transmitter" ? 1.45 : 1;
}

export function cursedHazardWarningReduction(id: CursedItemId | null): number {
  return id === "boots_bad_timing" ? 0.3 : 0;
}

export function cursedIncomingDamage(id: CursedItemId | null, amount: number, source: string): number {
  if (id === "mirror_badge" && source === "Void projectile") return amount * 0.35;
  if (id === "mirror_badge" && /strike|slash|bite|eruption/i.test(source)) return amount * 1.35;
  return amount;
}

export function cursedEffectLines(item: CursedItemDefinition): { upside: string; downside: string } {
  switch (item.id) {
    case "idol_open_mic": return { upside: "+30% Hype gains and better rare-cache odds", downside: "Enemies detect you through adjacent rooms" };
    case "boots_bad_timing": return { upside: "+25% movement speed", downside: "Floor-surge warnings are 0.3 seconds shorter" };
    case "glass_transmitter": return { upside: "+45% damage dealt", downside: "Maximum health reduced by 30% while carried" };
    case "hungry_crown": return { upside: "Kills restore 4 health", downside: "Lose 0.5 health/sec after 4 seconds out of combat" };
    case "mirror_badge": return { upside: "Take 65% less projectile damage", downside: "Take 35% more melee damage" };
    default: return { upside: "Generates bonus Hype", downside: "Carries an unstable broadcast curse" };
  }
}
