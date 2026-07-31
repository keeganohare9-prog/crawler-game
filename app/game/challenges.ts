/**
 * Browser-independent challenge modifier rules.
 *
 * This module owns selection, unlock, gameplay-effect, and reward math only.
 * Callers remain responsible for persistence and applying the aggregated effects
 * to a run.
 */

export type ChallengeModifierId =
  | "rush_hour"
  | "field_medicine"
  | "dry_signal"
  | "elite_feed"
  | "cursed_contract"
  | "closing_window"
  | "blackout_floor";

export type ChallengeProgressStat =
  | "lifetimeRuns"
  | "lifetimeKills"
  | "bossesDefeated"
  | "highestHype"
  | "secretsFound"
  | "daresCompleted";

export type ChallengeProgress = Partial<Record<ChallengeProgressStat, number>>;

export interface ChallengeUnlockRequirement {
  readonly stat: ChallengeProgressStat;
  readonly atLeast: number;
  readonly label: string;
}

export interface ChallengeGameplayEffects {
  readonly enemySpeedMultiplier: number;
  readonly enemyHealthMultiplier: number;
  readonly enemyDamageMultiplier: number;
  readonly eliteChanceBonus: number;
  readonly healingMultiplier: number;
  readonly disableHealing: boolean;
  readonly startingTonicDelta: number;
  readonly forceCursedItem: boolean;
  readonly lockCursedItem: boolean;
  readonly timeLimitMultiplier: number;
  readonly visibilityRadiusMultiplier: number;
}

export interface ChallengeModifierDefinition {
  readonly id: ChallengeModifierId;
  readonly name: string;
  readonly description: string;
  readonly risk: string;
  readonly effects: Partial<ChallengeGameplayEffects>;
  readonly fragmentMultiplier: number;
  readonly scoreMultiplier: number;
  readonly unlock?: ChallengeUnlockRequirement;
  /** Modifiers in the same group cannot be selected together. */
  readonly exclusiveGroup?: "healing";
}

export const DEFAULT_CHALLENGE_EFFECTS: ChallengeGameplayEffects = Object.freeze({
  enemySpeedMultiplier: 1,
  enemyHealthMultiplier: 1,
  enemyDamageMultiplier: 1,
  eliteChanceBonus: 0,
  healingMultiplier: 1,
  disableHealing: false,
  startingTonicDelta: 0,
  forceCursedItem: false,
  lockCursedItem: false,
  timeLimitMultiplier: 1,
  visibilityRadiusMultiplier: 1,
});

export const CHALLENGE_MODIFIERS = [
  {
    id: "rush_hour",
    name: "Rush Hour",
    description: "The floor runs at an unsafe broadcast speed.",
    risk: "Enemies move 25% faster.",
    effects: { enemySpeedMultiplier: 1.25 },
    fragmentMultiplier: 1.15,
    scoreMultiplier: 1.2,
    unlock: { stat: "lifetimeKills", atLeast: 40, label: "Defeat 40 lifetime enemies" },
  },
  {
    id: "field_medicine",
    name: "Field Medicine",
    description: "Supplies are scarce and every heal is improvised.",
    risk: "Start with one fewer tonic; all player healing is halved.",
    effects: { healingMultiplier: 0.5, startingTonicDelta: -1 },
    fragmentMultiplier: 1.1,
    scoreMultiplier: 1.12,
    exclusiveGroup: "healing",
  },
  {
    id: "dry_signal",
    name: "Dry Signal",
    description: "The sponsor feed refuses every source of recovery.",
    risk: "All player healing is disabled for the entire run.",
    effects: { healingMultiplier: 0, disableHealing: true, startingTonicDelta: -2 },
    fragmentMultiplier: 1.3,
    scoreMultiplier: 1.35,
    unlock: { stat: "bossesDefeated", atLeast: 1, label: "Defeat one boss" },
    exclusiveGroup: "healing",
  },
  {
    id: "elite_feed",
    name: "Elite Feed",
    description: "The audience has replaced ordinary opposition with headliners.",
    risk: "Elite chance rises by 30%; enemies gain 20% health and 15% damage.",
    effects: { eliteChanceBonus: 0.3, enemyHealthMultiplier: 1.2, enemyDamageMultiplier: 1.15 },
    fragmentMultiplier: 1.3,
    scoreMultiplier: 1.4,
    unlock: { stat: "daresCompleted", atLeast: 2, label: "Complete two audience dares" },
  },
  {
    id: "cursed_contract",
    name: "Cursed Contract",
    description: "A cursed relic enters with you and cannot leave the broadcast.",
    risk: "Begin with a deterministic cursed item that cannot be dropped or replaced.",
    effects: { forceCursedItem: true, lockCursedItem: true },
    fragmentMultiplier: 1.25,
    scoreMultiplier: 1.3,
    unlock: { stat: "highestHype", atLeast: 60, label: "Reach 60 Hype" },
  },
  {
    id: "closing_window",
    name: "Closing Window",
    description: "The network has cut the broadcast slot short.",
    risk: "The run timer is reduced to 65% of its normal duration.",
    effects: { timeLimitMultiplier: 0.65 },
    fragmentMultiplier: 1.25,
    scoreMultiplier: 1.32,
    unlock: { stat: "lifetimeRuns", atLeast: 3, label: "Complete three runs" },
  },
  {
    id: "blackout_floor",
    name: "Blackout Floor",
    description: "The feed illuminates only the crawler's immediate surroundings.",
    risk: "Visible range is reduced to 55% of normal.",
    effects: { visibilityRadiusMultiplier: 0.55 },
    fragmentMultiplier: 1.2,
    scoreMultiplier: 1.25,
    unlock: { stat: "secretsFound", atLeast: 2, label: "Find two secrets" },
  },
] as const satisfies readonly ChallengeModifierDefinition[];

export const CHALLENGE_MODIFIER_IDS = CHALLENGE_MODIFIERS.map((modifier) => modifier.id) as readonly ChallengeModifierId[];

const CHALLENGE_BY_ID = new Map<ChallengeModifierId, ChallengeModifierDefinition>(
  CHALLENGE_MODIFIERS.map((modifier) => [modifier.id, modifier]),
);

export function getChallengeModifier(id: ChallengeModifierId): ChallengeModifierDefinition {
  const modifier = CHALLENGE_BY_ID.get(id);
  if (!modifier) throw new Error(`Unknown challenge modifier: ${id}`);
  return modifier;
}

export function isChallengeUnlocked(
  modifier: ChallengeModifierDefinition | ChallengeModifierId,
  progress: ChallengeProgress,
): boolean {
  const definition = typeof modifier === "string" ? getChallengeModifier(modifier) : modifier;
  if (!definition.unlock) return true;
  return Math.max(0, progress[definition.unlock.stat] ?? 0) >= definition.unlock.atLeast;
}

export function unlockedChallengeModifiers(progress: ChallengeProgress): readonly ChallengeModifierDefinition[] {
  return CHALLENGE_MODIFIERS.filter((modifier) => isChallengeUnlocked(modifier, progress));
}

export interface ChallengeSelectionValidation {
  readonly valid: boolean;
  readonly selected: readonly ChallengeModifierDefinition[];
  readonly errors: readonly string[];
}

export function validateChallengeSelection(
  ids: readonly string[],
  progress: ChallengeProgress,
  maximumSelected = 3,
): ChallengeSelectionValidation {
  const errors: string[] = [];
  const selected: ChallengeModifierDefinition[] = [];
  const seen = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) {
      errors.push(`Challenge ${id} is selected more than once.`);
      continue;
    }
    seen.add(id);
    const definition = CHALLENGE_BY_ID.get(id as ChallengeModifierId);
    if (!definition) {
      errors.push(`Unknown challenge modifier: ${id}.`);
      continue;
    }
    selected.push(definition);
    if (!isChallengeUnlocked(definition, progress)) {
      errors.push(`${definition.name} is locked: ${definition.unlock!.label}.`);
    }
  }

  const safeMaximum = Math.max(0, Math.floor(maximumSelected));
  if (selected.length > safeMaximum) errors.push(`Select at most ${safeMaximum} challenge modifier${safeMaximum === 1 ? "" : "s"}.`);

  const exclusiveGroups = new Map<string, ChallengeModifierDefinition[]>();
  selected.forEach((modifier) => {
    if (!modifier.exclusiveGroup) return;
    const grouped = exclusiveGroups.get(modifier.exclusiveGroup) ?? [];
    grouped.push(modifier);
    exclusiveGroups.set(modifier.exclusiveGroup, grouped);
  });
  exclusiveGroups.forEach((grouped) => {
    if (grouped.length > 1) errors.push(`${grouped.map((modifier) => modifier.name).join(" and ")} cannot be combined.`);
  });

  return { valid: errors.length === 0, selected, errors };
}

/** Aggregates normalized gameplay effects; multiplicative effects stack multiplicatively. */
export function aggregateChallengeEffects(ids: readonly ChallengeModifierId[]): ChallengeGameplayEffects {
  let effects: ChallengeGameplayEffects = { ...DEFAULT_CHALLENGE_EFFECTS };
  for (const id of new Set(ids)) {
    const next = getChallengeModifier(id).effects;
    effects = {
      enemySpeedMultiplier: effects.enemySpeedMultiplier * (next.enemySpeedMultiplier ?? 1),
      enemyHealthMultiplier: effects.enemyHealthMultiplier * (next.enemyHealthMultiplier ?? 1),
      enemyDamageMultiplier: effects.enemyDamageMultiplier * (next.enemyDamageMultiplier ?? 1),
      eliteChanceBonus: Math.min(1, effects.eliteChanceBonus + (next.eliteChanceBonus ?? 0)),
      healingMultiplier: effects.healingMultiplier * (next.healingMultiplier ?? 1),
      disableHealing: effects.disableHealing || (next.disableHealing ?? false),
      startingTonicDelta: effects.startingTonicDelta + (next.startingTonicDelta ?? 0),
      forceCursedItem: effects.forceCursedItem || (next.forceCursedItem ?? false),
      lockCursedItem: effects.lockCursedItem || (next.lockCursedItem ?? false),
      timeLimitMultiplier: effects.timeLimitMultiplier * (next.timeLimitMultiplier ?? 1),
      visibilityRadiusMultiplier: effects.visibilityRadiusMultiplier * (next.visibilityRadiusMultiplier ?? 1),
    };
  }
  if (effects.disableHealing) effects = { ...effects, healingMultiplier: 0 };
  return effects;
}

function roundedMultiplier(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function challengeScoreMultiplier(ids: readonly ChallengeModifierId[]): number {
  return roundedMultiplier([...new Set(ids)].reduce((total, id) => total * getChallengeModifier(id).scoreMultiplier, 1));
}

export function challengeFragmentMultiplier(ids: readonly ChallengeModifierId[]): number {
  return roundedMultiplier([...new Set(ids)].reduce((total, id) => total * getChallengeModifier(id).fragmentMultiplier, 1));
}

export function challengeRewardMultipliers(ids: readonly ChallengeModifierId[]): { score: number; fragments: number } {
  return {
    score: challengeScoreMultiplier(ids),
    fragments: challengeFragmentMultiplier(ids),
  };
}

export function applyChallengeReward(baseReward: number, multiplier: number): number {
  if (!Number.isFinite(baseReward) || !Number.isFinite(multiplier)) return 0;
  return Math.max(0, Math.round(Math.max(0, baseReward) * Math.max(0, multiplier)));
}
