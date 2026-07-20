/**
 * Framework-independent combat content for Signal Depths.
 *
 * All durations are milliseconds, distances are world-space pixels, and angles
 * are radians. Helpers are pure so they can be used by the canvas game loop,
 * tests, procedural generation, or a future server-side run simulator.
 */

export type WeaponId =
  | "cleaver"
  | "spear"
  | "hammer"
  | "twin-knives"
  | "shock-baton"
  | "scrap-launcher";

export type WeaponRarity = "common" | "uncommon" | "rare";
export type DamageType = "slash" | "pierce" | "impact" | "shock" | "scrap";

export interface ProjectileDefinition {
  speed: number;
  radius: number;
  lifetimeMs: number;
  pierce: number;
  spreadRadians: number;
}

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  description: string;
  rarity: WeaponRarity;
  damageType: DamageType;
  damage: number;
  range: number;
  cooldownMs: number;
  arcRadians: number;
  knockback: number;
  /** Null means the weapon does not consume ammunition. */
  ammo: number | null;
  projectile: ProjectileDefinition | null;
  attacksPerInput: number;
}

export const WEAPONS = {
  cleaver: {
    id: "cleaver",
    name: "Signal Cleaver",
    description: "A reliable, broad swing with enough weight to make space.",
    rarity: "common",
    damageType: "slash",
    damage: 22,
    range: 48,
    cooldownMs: 340,
    arcRadians: 1.65,
    knockback: 12,
    ammo: null,
    projectile: null,
    attacksPerInput: 1,
  },
  spear: {
    id: "spear",
    name: "Antenna Spear",
    description: "Long, narrow reach that rewards careful alignment.",
    rarity: "common",
    damageType: "pierce",
    damage: 19,
    range: 76,
    cooldownMs: 420,
    arcRadians: 0.42,
    knockback: 9,
    ammo: null,
    projectile: null,
    attacksPerInput: 1,
  },
  hammer: {
    id: "hammer",
    name: "Dead-Air Hammer",
    description: "Slow and loud; its impact sends crowds tumbling away.",
    rarity: "uncommon",
    damageType: "impact",
    damage: 39,
    range: 45,
    cooldownMs: 720,
    arcRadians: 1.25,
    knockback: 28,
    ammo: null,
    projectile: null,
    attacksPerInput: 1,
  },
  "twin-knives": {
    id: "twin-knives",
    name: "Twin Static Knives",
    description: "Two close, rapid cuts for players willing to stay in danger.",
    rarity: "uncommon",
    damageType: "slash",
    damage: 11,
    range: 34,
    cooldownMs: 190,
    arcRadians: 1.05,
    knockback: 4,
    ammo: null,
    projectile: null,
    attacksPerInput: 2,
  },
  "shock-baton": {
    id: "shock-baton",
    name: "Shock Baton",
    description: "A compact strike that can arc into two nearby targets.",
    rarity: "rare",
    damageType: "shock",
    damage: 20,
    range: 42,
    cooldownMs: 470,
    arcRadians: 1.35,
    knockback: 7,
    ammo: null,
    projectile: {
      speed: 420,
      radius: 52,
      lifetimeMs: 90,
      pierce: 2,
      spreadRadians: 0,
    },
    attacksPerInput: 1,
  },
  "scrap-launcher": {
    id: "scrap-launcher",
    name: "Scrap Launcher",
    description: "Limited ammunition buys safe, forceful ranged attacks.",
    rarity: "rare",
    damageType: "scrap",
    damage: 27,
    range: 260,
    cooldownMs: 580,
    arcRadians: 0.18,
    knockback: 18,
    ammo: 8,
    projectile: {
      speed: 310,
      radius: 5,
      lifetimeMs: 900,
      pierce: 0,
      spreadRadians: 0.08,
    },
    attacksPerInput: 1,
  },
} as const satisfies Record<WeaponId, WeaponDefinition>;

export const WEAPON_IDS = Object.freeze(Object.keys(WEAPONS) as WeaponId[]);

const RARITY_DROP_WEIGHT: Readonly<Record<WeaponRarity, number>> = {
  common: 58,
  uncommon: 30,
  rare: 12,
};

export interface WeaponDropOptions {
  exclude?: readonly WeaponId[];
  allowedRarities?: readonly WeaponRarity[];
  /** Multiplies the normal weight of individual weapons. Zero disables one. */
  weightOverrides?: Partial<Record<WeaponId, number>>;
}

export function getWeapon(id: WeaponId): WeaponDefinition {
  return WEAPONS[id];
}

/** Selects a weapon drop. The injected RNG should return a value in [0, 1). */
export function selectWeaponDrop(
  random: () => number = Math.random,
  options: WeaponDropOptions = {},
): WeaponDefinition | null {
  const excluded = new Set(options.exclude ?? []);
  const allowed = options.allowedRarities
    ? new Set(options.allowedRarities)
    : null;
  const choices = WEAPON_IDS.map((id) => WEAPONS[id]).filter(
    (weapon) => !excluded.has(weapon.id) && (!allowed || allowed.has(weapon.rarity)),
  );
  const weights = choices.map((weapon) =>
    Math.max(0, RARITY_DROP_WEIGHT[weapon.rarity] * (options.weightOverrides?.[weapon.id] ?? 1)),
  );
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return null;

  let roll = clampUnit(random()) * total;
  for (let index = 0; index < choices.length; index += 1) {
    roll -= weights[index];
    if (roll < 0) return choices[index];
  }
  return choices[choices.length - 1] ?? null;
}

/** Selects unique drops, stopping early when the eligible catalog is exhausted. */
export function selectUniqueWeaponDrops(
  count: number,
  random: () => number = Math.random,
  options: WeaponDropOptions = {},
): WeaponDefinition[] {
  const selected: WeaponDefinition[] = [];
  const excluded = new Set(options.exclude ?? []);
  for (let index = 0; index < Math.max(0, Math.floor(count)); index += 1) {
    const drop = selectWeaponDrop(random, { ...options, exclude: [...excluded] });
    if (!drop) break;
    selected.push(drop);
    excluded.add(drop.id);
  }
  return selected;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface AttackTelegraph {
  windUpMs: number;
  activeMs: number;
  recoveryMs: number;
  /** Time before impact when the visual/audio cue must be fully visible. */
  cueLeadMs: number;
  /** The attack may be stagger-cancelled until this point in its wind-up. */
  interruptibleUntilMs: number;
  cue: "flash" | "ground-ring" | "projectile-line" | "pulse" | "shake";
}

export type EnemyBehaviorId =
  | "skitter-flank"
  | "warden-guard"
  | "spitter-pool"
  | "healer-support"
  | "mimic-ambush"
  | "volatile-explosion";

export interface EnemyBehaviorConfig {
  id: EnemyBehaviorId;
  moveSpeed: number;
  preferredRange: number;
  cooldownMs: number;
  telegraph: AttackTelegraph;
}

export interface SkitterFlankConfig extends EnemyBehaviorConfig {
  id: "skitter-flank";
  flankAngleRadians: number;
  flankDistance: number;
  switchSideAfterMs: number;
}

export interface WardenGuardConfig extends EnemyBehaviorConfig {
  id: "warden-guard";
  guardRadius: number;
  interceptDistance: number;
  protectedDamageReduction: number;
}

export interface SpitterPoolConfig extends EnemyBehaviorConfig {
  id: "spitter-pool";
  poolRadius: number;
  poolLifetimeMs: number;
  tickEveryMs: number;
  damagePerTick: number;
}

export interface HealerSupportConfig extends EnemyBehaviorConfig {
  id: "healer-support";
  healRange: number;
  healAmount: number;
  fleeRange: number;
}

export interface MimicAmbushConfig extends EnemyBehaviorConfig {
  id: "mimic-ambush";
  revealDistance: number;
  lungeDistance: number;
  disguiseDelayMs: number;
}

export interface VolatileExplosionConfig extends EnemyBehaviorConfig {
  id: "volatile-explosion";
  blastRadius: number;
  innerRadius: number;
  maxDamage: number;
  damagesEnemies: boolean;
}

/** Wind-ups are intentionally >= 400ms so every heavy attack is readable. */
export const ENEMY_BEHAVIORS = {
  skitter: {
    id: "skitter-flank",
    moveSpeed: 82,
    preferredRange: 34,
    cooldownMs: 950,
    telegraph: {
      windUpMs: 420,
      activeMs: 120,
      recoveryMs: 460,
      cueLeadMs: 360,
      interruptibleUntilMs: 310,
      cue: "flash",
    },
    flankAngleRadians: 1.05,
    flankDistance: 70,
    switchSideAfterMs: 1800,
  },
  warden: {
    id: "warden-guard",
    moveSpeed: 42,
    preferredRange: 45,
    cooldownMs: 1450,
    telegraph: {
      windUpMs: 680,
      activeMs: 180,
      recoveryMs: 620,
      cueLeadMs: 600,
      interruptibleUntilMs: 430,
      cue: "ground-ring",
    },
    guardRadius: 74,
    interceptDistance: 38,
    protectedDamageReduction: 0.35,
  },
  spitter: {
    id: "spitter-pool",
    moveSpeed: 47,
    preferredRange: 145,
    cooldownMs: 1900,
    telegraph: {
      windUpMs: 760,
      activeMs: 100,
      recoveryMs: 540,
      cueLeadMs: 700,
      interruptibleUntilMs: 510,
      cue: "projectile-line",
    },
    poolRadius: 31,
    poolLifetimeMs: 4600,
    tickEveryMs: 500,
    damagePerTick: 4,
  },
  healer: {
    id: "healer-support",
    moveSpeed: 45,
    preferredRange: 115,
    cooldownMs: 2800,
    telegraph: {
      windUpMs: 900,
      activeMs: 180,
      recoveryMs: 650,
      cueLeadMs: 820,
      interruptibleUntilMs: 760,
      cue: "pulse",
    },
    healRange: 155,
    healAmount: 18,
    fleeRange: 72,
  },
  mimic: {
    id: "mimic-ambush",
    moveSpeed: 72,
    preferredRange: 25,
    cooldownMs: 1250,
    telegraph: {
      windUpMs: 520,
      activeMs: 160,
      recoveryMs: 720,
      cueLeadMs: 470,
      interruptibleUntilMs: 350,
      cue: "shake",
    },
    revealDistance: 42,
    lungeDistance: 82,
    disguiseDelayMs: 500,
  },
  volatile: {
    id: "volatile-explosion",
    moveSpeed: 58,
    preferredRange: 24,
    cooldownMs: 999_999,
    telegraph: {
      windUpMs: 1200,
      activeMs: 120,
      recoveryMs: 0,
      cueLeadMs: 1100,
      interruptibleUntilMs: 900,
      cue: "pulse",
    },
    blastRadius: 92,
    innerRadius: 34,
    maxDamage: 34,
    damagesEnemies: true,
  },
} as const satisfies {
  skitter: SkitterFlankConfig;
  warden: WardenGuardConfig;
  spitter: SpitterPoolConfig;
  healer: HealerSupportConfig;
  mimic: MimicAmbushConfig;
  volatile: VolatileExplosionConfig;
};

export function skitterFlankTarget(
  player: Vec2,
  playerFacing: Vec2,
  flankSide: -1 | 1,
  config: SkitterFlankConfig = ENEMY_BEHAVIORS.skitter,
): Vec2 {
  const facing = normalize(playerFacing);
  const angle = Math.atan2(facing.y, facing.x) + config.flankAngleRadians * flankSide;
  return {
    x: player.x + Math.cos(angle) * config.flankDistance,
    y: player.y + Math.sin(angle) * config.flankDistance,
  };
}

/** Returns the point between an ally and the threat where a warden should stand. */
export function wardenGuardTarget(
  ally: Vec2,
  threat: Vec2,
  config: WardenGuardConfig = ENEMY_BEHAVIORS.warden,
): Vec2 {
  const towardThreat = normalize({ x: threat.x - ally.x, y: threat.y - ally.y });
  const distance = Math.min(config.guardRadius, config.interceptDistance);
  return { x: ally.x + towardThreat.x * distance, y: ally.y + towardThreat.y * distance };
}

export interface HazardPool {
  center: Vec2;
  radius: number;
  lifetimeMs: number;
  tickEveryMs: number;
  damagePerTick: number;
}

/** Leads a moving target, while capping prediction so the warning stays fair. */
export function createSpitterHazardPool(
  player: Vec2,
  playerVelocity: Vec2,
  projectileTravelMs: number,
  config: SpitterPoolConfig = ENEMY_BEHAVIORS.spitter,
): HazardPool {
  const predictionMs = Math.min(Math.max(projectileTravelMs, 0), 500);
  return {
    center: {
      x: player.x + playerVelocity.x * (predictionMs / 1000),
      y: player.y + playerVelocity.y * (predictionMs / 1000),
    },
    radius: config.poolRadius,
    lifetimeMs: config.poolLifetimeMs,
    tickEveryMs: config.tickEveryMs,
    damagePerTick: config.damagePerTick,
  };
}

export interface HealCandidate extends Vec2 {
  id: string;
  hp: number;
  maxHp: number;
}

/** Picks the lowest-health ally in range; stable IDs break equal-health ties. */
export function selectHealerTarget(
  healer: Vec2,
  candidates: readonly HealCandidate[],
  config: HealerSupportConfig = ENEMY_BEHAVIORS.healer,
): HealCandidate | null {
  const rangeSquared = config.healRange * config.healRange;
  return (
    candidates
      .filter((ally) => ally.hp > 0 && ally.hp < ally.maxHp && distanceSquared(healer, ally) <= rangeSquared)
      .slice()
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.id.localeCompare(b.id))[0] ?? null
  );
}

export function shouldRevealMimic(
  mimic: Vec2,
  player: Vec2,
  interacted: boolean,
  disguisedForMs: number,
  config: MimicAmbushConfig = ENEMY_BEHAVIORS.mimic,
): boolean {
  return (
    disguisedForMs >= config.disguiseDelayMs &&
    (interacted || distanceSquared(mimic, player) <= config.revealDistance ** 2)
  );
}

export function mimicLungeTarget(
  mimic: Vec2,
  player: Vec2,
  config: MimicAmbushConfig = ENEMY_BEHAVIORS.mimic,
): Vec2 {
  const direction = normalize({ x: player.x - mimic.x, y: player.y - mimic.y });
  return {
    x: mimic.x + direction.x * config.lungeDistance,
    y: mimic.y + direction.y * config.lungeDistance,
  };
}

/** Smooth falloff keeps the blast threatening without punishing edge dodges. */
export function volatileExplosionDamage(
  explosion: Vec2,
  target: Vec2,
  config: VolatileExplosionConfig = ENEMY_BEHAVIORS.volatile,
): number {
  const distance = Math.sqrt(distanceSquared(explosion, target));
  if (distance >= config.blastRadius) return 0;
  if (distance <= config.innerRadius) return config.maxDamage;
  const falloff = 1 - (distance - config.innerRadius) / (config.blastRadius - config.innerRadius);
  return Math.max(1, Math.round(config.maxDamage * falloff));
}

/** True while an attack is still in its deliberately interruptible wind-up. */
export function isTelegraphInterruptible(telegraph: AttackTelegraph, elapsedMs: number): boolean {
  return elapsedMs >= 0 && elapsedMs <= telegraph.interruptibleUntilMs;
}

export function telegraphProgress(telegraph: AttackTelegraph, elapsedMs: number): number {
  if (telegraph.windUpMs <= 0) return 1;
  return Math.min(1, Math.max(0, elapsedMs / telegraph.windUpMs));
}

function distanceSquared(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

function normalize(vector: Vec2): Vec2 {
  const length = Math.hypot(vector.x, vector.y);
  return length > 0 ? { x: vector.x / length, y: vector.y / length } : { x: 1, y: 0 };
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(0.999_999_999, Math.max(0, value));
}
