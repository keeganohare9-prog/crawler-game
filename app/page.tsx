"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { generateFloor, type CardinalDirection, type RoomKind } from "./game/floor";
import { buildFloorNavigation, connectionInDirection, nextConnectionToward, roomIdAtSlot, type FloorNavigationMap, type PhysicalDoorConnection } from "./game/floor-navigation";
import { WEAPONS, getWeapon, selectWeaponDrop, type WeaponId } from "./game/combat-content";
import { EQUIPMENT, EQUIPMENT_IDS, selectEquipmentDrop, type EquipmentId, type EquipmentSlot } from "./game/equipment";
import { AUDIENCE_DARES, CURSED_ITEMS, PERMANENT_UNLOCKS, RUN_UPGRADES, bossPhaseForHealth, chooseAudienceDares, chooseSafeRoomUpgrades, newlyEarnedUnlocks, sponsorRewardsCrossed, summarizeRun, type RunStats, type RunUpgradeId } from "./game/progression";
import { cursedDamageMultiplier, cursedEffectLines, cursedHazardWarningReduction, cursedHypeMultiplier, cursedIncomingDamage, cursedMoveSpeedMultiplier, getCursedItem, selectCursedDropRoom, selectCursedItem, type CursedItemId } from "./game/cursed-items";
import { PLAYER_CLASSES, PLAYER_CLASS_IDS, type PlayerClassId } from "./game/classes";
import { CLASS_ARSENAL, arsenalForClass, selectClassArsenalDrop, type ClassArsenalId } from "./game/class-arsenal";
import { hazardStateAt, hazardTilesForRoom, isRoomObstacleTile, pointIsOnHazard } from "./game/room-layout";
import { MAZE_WRONG_TURNS, isMazeWallCell, mazeGoalPosition } from "./game/maze-layout";
import {
  AUDIENCE_MODIFIERS,
  BUILD_SYNERGY_GUIDE,
  activeBuildSynergy,
  addRunHistory,
  audienceBallot,
  dailySeed,
  localDateKey,
  parseRunHistory,
  resolveAudienceVote,
  type RunHistoryEntry,
} from "./game/broadcast-features";
import { generateSecretChambers, secretRewardLabel } from "./game/secrets";
import {
  STARTER_KITS,
  calculateSignalFragmentReward,
  getStarterKit,
  parseMetaProgressionProfile,
  purchaseStarterKit,
  selectStarterKit,
  updateMetaProgressionAfterRun,
  type MetaProgressionProfile,
  type StarterKitId,
} from "./game/meta-progression";
import {
  CHALLENGE_MODIFIERS,
  aggregateChallengeEffects,
  applyChallengeReward,
  challengeFragmentMultiplier,
  challengeScoreMultiplier,
  isChallengeUnlocked,
  validateChallengeSelection,
  type ChallengeModifierId,
  type ChallengeProgress,
} from "./game/challenges";
import {
  ARCHIVE_CATEGORIES,
  ARCHIVE_ENTRIES,
  acknowledgeArchiveDiscoveries,
  archiveCategoryProgress,
  archiveDiscoveryCallouts,
  archivePresentation,
  mergeCompletedRunDiscoveries,
  parseArchiveProfile,
  unacknowledgedArchiveIds,
  type ArchiveCategoryId,
  type ArchiveDiscoveryProfile,
} from "./game/archive";
import {
  DEFAULT_COMFORT_SETTINGS,
  type ArmorySnapshot,
  type BroadcastContractId,
  type Chest,
  type ComfortSettings,
  type ControlMode,
  type Enemy,
  type EnemyKind,
  type Game,
  type HelpSection,
  type Hud,
  type ItemKind,
  type Projectile,
  type Screen,
  type ScreenShakeLevel,
} from "./game/runtime-types";

const TILE = 32;
const ROOM_COLS = 4;
const ROOM_ROWS = 3;
const MAP_W = ROOM_COLS * 8;
const MAP_H = ROOM_ROWS * 8;
const WIDTH = 768;
const HEIGHT = 512;
const SAFE_X = 4.5 * TILE;
const SAFE_Y = 4.5 * TILE;
const EXIT_X = (MAP_W - 1.5) * TILE;
const EXIT_Y = (MAP_H - 1.5) * TILE;
const BOSS_VERSUS_DURATION = 3.4;

const EMPTY_ARMORY: ArmorySnapshot = { weapons: ["cleaver"], equipment: [], enemies: [], unlocks: [], runs: 0, kills: 0 };
const RUN_HISTORY_STORAGE_KEY = "signal-depths-run-history";
const META_PROGRESSION_STORAGE_KEY = "signal-depths-meta-progression";
const CHALLENGE_PROGRESS_STORAGE_KEY = "signal-depths-challenge-progress";
const SELECTED_CHALLENGES_STORAGE_KEY = "signal-depths-selected-challenges";
const ARCHIVE_STORAGE_KEY = "signal-depths-signal-archive";

function parseStoredArray<T>(raw: string | null, fallback: readonly T[], isValid: (value: unknown) => value is T): T[] {
  if (!raw) return [...fallback];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isValid) : [...fallback];
  } catch {
    return [...fallback];
  }
}

function storedNumber(raw: string | null) {
  const value = Number(raw ?? 0);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function parseChallengeProgress(raw: string | null): ChallengeProgress {
  try {
    const value = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    const read = (key: keyof ChallengeProgress) => {
      const candidate = Number(value?.[key] ?? 0);
      return Number.isFinite(candidate) && candidate >= 0 ? candidate : 0;
    };
    return {
      lifetimeRuns: read("lifetimeRuns"),
      lifetimeKills: read("lifetimeKills"),
      bossesDefeated: read("bossesDefeated"),
      highestHype: read("highestHype"),
      secretsFound: read("secretsFound"),
      daresCompleted: read("daresCompleted"),
    };
  } catch {
    return {};
  }
}

const initialHud: Hud = {
  hp: 100,
  maxHp: 100,
  stamina: 100,
  classId: "knight",
  className: "Knight",
  resourceName: "Drive",
  classResource: 100,
  classResourceMax: 100,
  time: 720,
  score: 0,
  hype: 1,
  rooms: 1,
  pylons: 0,
  potions: 2,
  bombs: 0,
  furyVials: 0,
  furyTime: 0,
  weaponName: "Signal Cleaver",
  ammo: 0,
  nearbyEquipmentId: null,
  nearbyCursedItemId: null,
  equipmentNames: [],
  cursedItemId: null,
  cursedRoomsCleared: 0,
  roomKind: "safe",
  roomsCleared: 0,
  secretsFound: 0,
  secretsTotal: 3,
  dareName: "Personal Space Denied",
  dareProgress: 0,
  dareTarget: 5,
  message: "SIGNAL ACQUIRED // SUBJECT 404 ENTERS THE FLOOR",
  objective: "Activate 3 signal pylons",
};

type BroadcastContract = {
  id: BroadcastContractId;
  name: string;
  tagline: string;
  risk: string;
  reward: string;
  enemySpeed: number;
  enemyHealth: number;
  playerHealth: number;
  startingHype: number;
  startingBombs: number;
  startingFury: number;
  scoreMultiplier: number;
};

const BROADCAST_CONTRACTS: Record<BroadcastContractId, BroadcastContract> = {
  redline: { id: "redline", name: "Redline Feed", tagline: "The floor runs hot.", risk: "Enemies move 25% faster", reward: "+30% score · Start at 1.5× hype", enemySpeed: 1.25, enemyHealth: 1, playerHealth: 1, startingHype: 1.5, startingBombs: 0, startingFury: 0, scoreMultiplier: 1.3 },
  "iron-signal": { id: "iron-signal", name: "Iron Signal", tagline: "Bigger targets. Bigger payout.", risk: "Enemies have 35% more health", reward: "+40% score · Start with a bomb", enemySpeed: 1, enemyHealth: 1.35, playerHealth: 1, startingHype: 1, startingBombs: 1, startingFury: 0, scoreMultiplier: 1.4 },
  "one-take": { id: "one-take", name: "One-Take Wonder", tagline: "No safety net, maximum ratings.", risk: "Maximum health reduced by 30%", reward: "+50% score · Start at 2× hype with Fury", enemySpeed: 1, enemyHealth: 1, playerHealth: .7, startingHype: 2, startingBombs: 0, startingFury: 1, scoreMultiplier: 1.5 },
};

const enemyStats: Record<EnemyKind, Omit<Enemy, "id" | "kind" | "x" | "y" | "cooldown" | "flash" | "windup" | "recovery" | "elite" | "homeRoomIndex">> = {
  skitter: { hp: 28, maxHp: 28, speed: 68, damage: 9 },
  warden: { hp: 65, maxHp: 65, speed: 39, damage: 16 },
  spitter: { hp: 34, maxHp: 34, speed: 48, damage: 8 },
  healer: { hp: 42, maxHp: 42, speed: 43, damage: 5 },
  mimic: { hp: 78, maxHp: 78, speed: 58, damage: 18 },
  volatile: { hp: 36, maxHp: 36, speed: 56, damage: 24 },
  broadcaster: { hp: 52, maxHp: 52, speed: 34, damage: 6 },
  bulwark: { hp: 74, maxHp: 74, speed: 38, damage: 10 },
  burrower: { hp: 48, maxHp: 48, speed: 54, damage: 17 },
  ninja: { hp: 24, maxHp: 24, speed: 86, damage: 11 },
  boss: { hp: 260, maxHp: 260, speed: 46, damage: 20 },
};

const ENEMY_GUIDE: Array<{ kind: EnemyKind; name: string; role: string; tip: string }> = [
  { kind: "skitter", name: "Razorback Skitter", role: "Fast pack hunter", tip: "The striped carapace and six twitching legs are your warning: use wide swings before the pack surrounds you." },
  { kind: "warden", name: "Ironjaw Warden", role: "Armored bruiser", tip: "Watch its shield and raised shock-club. Dodge the heavy strike late, then punish the recovery." },
  { kind: "spitter", name: "Void Spitter", role: "Ranged controller", tip: "Its single bright eye tracks targets while its tentacles retreat. Close the gap or weave between purple bolts." },
  { kind: "healer", name: "Halo Medic", role: "Enemy support", tip: "Orbiting repair nodes identify this floating medic. Eliminate it before it restores wounded allies." },
  { kind: "mimic", name: "Gilt-Maw Mimic", role: "Treasure ambusher", tip: "Look for eyes beneath the golden lid. Strike, disengage, and stay clear of its tongue and double row of teeth." },
  { kind: "volatile", name: "Fusewalker", role: "Walking explosion", tip: "Its fuse and flashing containment ring mean detonation. Lure it near other enemies, then escape." },
  { kind: "broadcaster", name: "Husk Broadcaster", role: "Interruptible summoner", tip: "When its antenna blooms into a bright signal ring, hit it before the transmission completes or it will call in more Skitters." },
  { kind: "bulwark", name: "Bulwark Drone", role: "Mobile shield projector", tip: "The cyan links mark protected enemies. Destroy the drone first or force its allies outside the shield radius." },
  { kind: "burrower", name: "Scrap Burrower", role: "Subterranean ambusher", tip: "Follow the orange ground trail and leave the marked eruption point before it surfaces. Its scrap field remains dangerous." },
  { kind: "ninja", name: "Signal Ninja", role: "Boss-linked assassin", tip: "The Ninja Master is vulnerable only while at least one of these fast assassins remains alive. Control the pack without clearing it too soon." },
  { kind: "boss", name: "Broadcast Warden / Static Conductor", role: "Seeded three-phase floor boss", tip: "The Warden fires closed radial volleys. The Static Conductor leaves two opposite safe lanes in its telegraphed signal cage—move into the open channel before it fires." },
];

const WEAPON_TACTICS: Record<WeaponId, string> = {
  cleaver: "Wide gold arc · dependable crowd control",
  spear: "White thrust line · precise long reach",
  hammer: "Expanding impact ring · huge knockback",
  "twin-knives": "Double pink trails · fastest recovery",
  "shock-baton": "Blue chain spark · arcs into nearby targets",
  "scrap-launcher": "Orange muzzle blast · safe ranged damage",
};

const ROOM_GUIDE: Array<{ kind: RoomKind; name: string; copy: string }> = [
  { kind: "safe", name: "Safe", copy: "Restore health and install one run upgrade." },
  { kind: "ambush", name: "Ambush", copy: "Doors lock until every attacker is defeated." },
  { kind: "survival", name: "Survival", copy: "Outlast the broadcast timer and clear the remaining enemies." },
  { kind: "loot", name: "Loot Gamble", copy: "Open the cache for a 50% reward chance—or release the enemies hiding inside." },
  { kind: "treasure", name: "Treasure", copy: "Open the cache—but be ready for a mimic." },
  { kind: "elite", name: "Elite", copy: "A dangerous squad guarding stronger loot." },
  { kind: "puzzle", name: "Puzzle", copy: "Activate its signal objective or clear its defender." },
  { kind: "broadcast", name: "Broadcast", copy: "A ratings challenge that rewards speed and aggression." },
  { kind: "maze", name: "Maze", copy: "A winding signal labyrinth. Wrong turns trip hidden shadow ambushes, so read the route before committing." },
  { kind: "boss", name: "Boss", copy: "Clearly marked with a skull. Its entrance stays sealed until every signal pylon is online; the gate displays your live pylon count." },
];

function routeHint(kind: RoomKind) {
  if (kind === "safe") return { icon: "+", label: "REST", color: "#34d399" };
  if (["treasure", "loot", "broadcast"].includes(kind)) return { icon: "$", label: "REWARD", color: "#f4d35e" };
  if (kind === "boss") return { icon: "☠", label: "BOSS", color: "#ff4d6d" };
  if (["elite", "survival"].includes(kind)) return { icon: "!", label: "DANGER", color: "#ff4d6d" };
  if (kind === "maze") return { icon: "#", label: "MAZE", color: "#76c7dc" };
  if (kind === "puzzle") return { icon: "◆", label: "SIGNAL", color: "#76c7dc" };
  return { icon: "?", label: "UNKNOWN", color: "#9aaba4" };
}

let activeMazeRooms = new Set<number>();
let activeFloorNavigation: FloorNavigationMap | null = null;

function makeGame(
  screen: Screen = "title",
  floorSeed = 40_413,
  classId: PlayerClassId = "knight",
  contractId: BroadcastContractId = "redline",
  floorNumber = 1,
  runMode: "standard" | "daily" = "standard",
  dailyKey: string | null = null,
  starterKitId: StarterKitId | null = null,
  challengeIds: ChallengeModifierId[] = [],
): Game {
  const playerClass = PLAYER_CLASSES[classId];
  const contract = BROADCAST_CONTRACTS[contractId];
  const starterKit = starterKitId && getStarterKit(starterKitId).classId === classId ? getStarterKit(starterKitId) : null;
  const challengeEffects = aggregateChallengeEffects(challengeIds);
  const floor = generateFloor(floorSeed, { roomCount: ROOM_COLS * ROOM_ROWS });
  const navigation = buildFloorNavigation(floor, { columns: ROOM_COLS, rows: ROOM_ROWS });
  activeFloorNavigation = navigation;
  const roomKinds = navigation.roomIdBySlotIndex.map((roomId) =>
    floor.rooms.find((room) => room.id === roomId)?.kind ?? "safe",
  );
  if (["elite", "survival", "broadcast"].includes(roomKinds[1])) roomKinds[1] = "ambush";
  if (floorNumber === 2) {
    const reservedRooms = new Set([
      navigation.slotByRoomId[floor.entryRoomId]!.index,
      navigation.slotByRoomId[floor.bossRoomId]!.index,
      ...navigation.pylonRoomIds.map((roomId) => navigation.slotByRoomId[roomId]!.index),
    ]);
    const mazeSlots: number[] = [];
    [4, 7].forEach((target) => {
      const placement = navigation.placements
        .filter(({ slot }) => !reservedRooms.has(slot.index) && !mazeSlots.includes(slot.index))
        .sort((left, right) => Math.abs(left.slot.index - target) - Math.abs(right.slot.index - target) || left.slot.index - right.slot.index)[0];
      if (placement) mazeSlots.push(placement.slot.index);
    });
    mazeSlots.forEach((slot) => { roomKinds[slot] = "maze"; });
  }
  activeMazeRooms = new Set(roomKinds.map((kind, index) => kind === "maze" ? index : -1).filter((index) => index >= 0));
  let nextId = 1;
  const enemy = (kind: EnemyKind, tx: number, ty: number, roomIndex: number, elite = false): Enemy => {
    const stats = enemyStats[kind];
    const progression = kind === "boss" ? 1 : .82 + (roomIndex / Math.max(1, roomKinds.length - 1)) * .28;
    const challengeElite = elite || (kind !== "boss" && ((nextId * 73 + floorSeed) % 1000) / 1000 < challengeEffects.eliteChanceBonus);
    const hp = Math.round(stats.hp * progression * (challengeElite ? 1.08 : 1) * contract.enemyHealth * challengeEffects.enemyHealthMultiplier);
    return {
      id: nextId++, kind, x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2,
      cooldown: Math.random() * 1.2, flash: 0, windup: 0, recovery: 0, elite: challengeElite, homeRoomIndex: roomIndex,
      ...stats,
      hp, maxHp: hp,
      damage: Math.max(4, Math.round(stats.damage * progression * challengeEffects.enemyDamageMultiplier)),
      speed: stats.speed * (.92 + progression * .08) * contract.enemySpeed * challengeEffects.enemySpeedMultiplier,
    };
  };

  const enemies: Enemy[] = [];
  const chests: Chest[] = [];
  roomKinds.forEach((kind, index) => {
    const col = index % ROOM_COLS;
    const row = Math.floor(index / ROOM_COLS);
    const tx = col * 8;
    const ty = row * 8;
    if (kind === "ambush") {
      enemies.push(enemy("skitter", tx + 3, ty + 3, index), enemy("skitter", tx + 6, ty + 5, index));
      if (index >= 3) enemies.push(enemy("spitter", tx + 5, ty + 2, index));
      if (index >= 6) enemies.push(enemy("burrower", tx + 2.5, ty + 5.5, index));
    }
    if (kind === "survival") enemies.push(enemy("skitter", tx + 2, ty + 5, index), enemy("broadcaster", tx + 6, ty + 2, index), enemy("warden", tx + 5, ty + 5, index));
    if (kind === "elite") enemies.push(enemy("warden", tx + 4, ty + 4, index, true), enemy("bulwark", tx + 6, ty + 2, index));
    if (kind === "broadcast") enemies.push(enemy("volatile", tx + 4, ty + 4, index), enemy("broadcaster", tx + 6, ty + 5, index));
    if (kind === "puzzle") enemies.push(enemy("spitter", tx + 5, ty + 3, index), enemy("burrower", tx + 2.5, ty + 5, index));
    if (kind === "treasure") enemies.push(enemy("mimic", tx + 5, ty + 5, index));
    // Maze enemies stay hidden until the crawler commits to a wrong branch.
    if (kind === "boss") {
      const floorBoss = enemy("boss", tx + 4, ty + 4, index, true);
      floorBoss.variant = floorNumber === 2 ? "ninja" : floorSeed % 2 === 0 ? "warden" : "conductor";
      if (floorNumber === 2) {
        floorBoss.hp = 390;
        floorBoss.maxHp = 390;
        floorBoss.speed = 62 * contract.enemySpeed;
        floorBoss.damage = 18;
      }
      enemies.push(floorBoss);
    }
    if (["treasure", "elite", "broadcast", "loot"].includes(kind)) chests.push({ x: (tx + 2.5) * TILE, y: (ty + 5.5) * TILE, open: false, openFx: 0 });
  });
  const pylonRoomIndices = navigation.pylonRoomIds.map((roomId) => navigation.slotByRoomId[roomId]!.index);
  const pylons = pylonRoomIndices.map((index) => {
    const col = index % ROOM_COLS;
    const row = Math.floor(index / ROOM_COLS);
    return { x: (col * 8 + 4.5) * TILE, y: (row * 8 + 4.5) * TILE, active: false };
  });
  const dare = chooseAudienceDares(floorSeed, classId === "knight" ? [] : ["close_quarters"], 1)[0] ?? AUDIENCE_DARES[0];
  const secrets = generateSecretChambers(floorSeed, roomKinds, ROOM_COLS, TILE);

  const game: Game = {
    screen,
    testerMode: false,
    floorNumber,
    player: {
      classId,
      classArsenalId: starterKit?.arsenalId ?? (classId === "archer" ? "relay-recurve" : "signal-grimoire"),
      x: 2.5 * TILE,
      y: 2.5 * TILE,
      hp: Math.round(playerClass.hp * contract.playerHealth),
      maxHp: Math.round(playerClass.hp * contract.playerHealth),
      stamina: 100,
      classResource: playerClass.resourceMax,
      reloadTime: 0,
      damage: 22,
      speed: playerClass.speed,
      dirX: 1,
      dirY: 0,
      attackCd: 0,
      attackFx: 0,
      dodgeCd: 0,
      invuln: 0,
      potions: Math.max(0, (starterKit?.startingItems.tonics ?? 2) + challengeEffects.startingTonicDelta),
      bombs: contract.startingBombs + (starterKit?.startingItems.bombs ?? 0),
      furyVials: contract.startingFury + (starterKit?.startingItems.furyVials ?? 0),
      furyTime: 0,
      weaponId: starterKit?.weaponId ?? "cleaver",
      ammo: getWeapon(starterKit?.weaponId ?? "cleaver").ammo ?? 0,
      moving: false,
      stepTimer: 0,
      heavyFx: 0,
      aimDistance: 72,
    },
    enemies,
    projectiles: [],
    particles: [],
    combatText: [],
    burrowHazards: [],
    pylons,
    chests,
    secrets,
    secretsFound: 0,
    secretsTotal: secrets.length,
    groundItems: [],
    groundWeapons: [],
    groundClassArsenal: [],
    groundEquipment: [],
    groundCursedItems: [],
    explored: new Set(["0"]),
    time: Math.round(720 * challengeEffects.timeLimitMultiplier),
    score: 0,
    contractId,
    starterKitId: starterKit?.id ?? null,
    challengeIds: [...challengeIds],
    scoreMultiplier: contract.scoreMultiplier * challengeScoreMultiplier(challengeIds),
    hype: contract.startingHype,
    kills: 0,
    bossDead: false,
    bossAwakenTime: 0,
    bossEngaged: false,
    bossIntroTime: 0,
    bossPhaseFx: 0,
    bossPhaseName: "",
    safeUsed: false,
    message: "SIGNAL ACQUIRED // SUBJECT 404 ENTERS THE FLOOR",
    messageTime: 4,
    elapsed: 0,
    nextId,
    shake: 0,
    hitStop: 0,
    floorSeed,
    navigation,
    roomKinds,
    roomStarted: roomKinds.map((_, index) => index === 0),
    roomCleared: roomKinds.map(() => false),
    roomTimers: roomKinds.map(() => 0),
    mazeAmbushes: new Set(),
    mazeSolved: new Set(),
    roomClearFx: 0,
    roomClearRoomIndex: -1,
    currentRoomIndex: 0,
    routeTaken: [roomKinds[0] ?? "safe"],
    upgrades: [],
    upgradeChoices: [],
    activeDareId: dare.id,
    dareProgress: 0,
    dareComplete: false,
    damageTaken: 0,
    damageBySource: {},
    deathRoomKind: null,
    weaponAttacks: Object.fromEntries(Object.keys(WEAPONS).map((id) => [id, 0])) as Record<WeaponId, number>,
    weaponHits: Object.fromEntries(Object.keys(WEAPONS).map((id) => [id, 0])) as Record<WeaponId, number>,
    equipped: { armor: null, boots: null, charm: null, mod: null },
    discoveredEquipment: [],
    discoveredEnemies: [],
    maxHype: contract.startingHype,
    roomsCleared: 0,
    priorRoomsCleared: 0,
    priorRoomsExplored: 0,
    lastBossPhase: "",
    resultsSaved: false,
    newUnlocks: [],
    newDiscoveries: [],
    fragmentReward: 0,
    sponsorHypeChecked: contract.startingHype,
    runMode,
    dailyKey,
    activeAudienceModifierId: null,
    audienceModifierRooms: 0,
    audienceMilestones: [],
    cursedItemId: null,
    cursedDropRoomIndex: selectCursedDropRoom(roomKinds, floorSeed),
    cursedDropSpawned: false,
    cursedRoomsCleared: 0,
    cursedItemsCarried: 0,
    cursedMaxHpLoss: 0,
    lastCombatTime: 0,
  };
  if (challengeEffects.forceCursedItem) carryCursedItem(game, selectCursedItem(`${floorSeed}:challenge`).id);
  return game;
}

function makeNextFloor(game: Game) {
  const nextSeed = game.runMode === "daily" && game.dailyKey
    ? dailySeed(`${game.dailyKey}:floor:${game.floorNumber + 1}`)
    : Math.floor(Math.random() * 1_000_000_000);
  const next = makeGame("playing", nextSeed, game.player.classId, game.contractId, game.floorNumber + 1, game.runMode, game.dailyKey, game.starterKitId, game.challengeIds);
  next.testerMode = game.testerMode;
  next.player = {
    ...next.player,
    classArsenalId: game.player.classArsenalId,
    hp: game.player.maxHp,
    maxHp: game.player.maxHp,
    damage: game.player.damage,
    potions: game.player.potions,
    bombs: game.player.bombs,
    furyVials: game.player.furyVials,
    weaponId: game.player.weaponId,
    ammo: game.player.ammo,
  };
  next.score = game.score;
  next.hype = game.hype;
  next.maxHype = game.maxHype;
  next.kills = game.kills;
  next.priorRoomsCleared = game.priorRoomsCleared + game.roomsCleared;
  next.priorRoomsExplored = game.priorRoomsExplored + game.explored.size;
  next.routeTaken = [...game.routeTaken, next.roomKinds[0] ?? "safe"];
  next.upgrades = [...game.upgrades];
  next.equipped = { ...game.equipped };
  next.discoveredEquipment = [...game.discoveredEquipment];
  next.discoveredEnemies = [...game.discoveredEnemies];
  next.secretsFound = game.secretsFound;
  next.secretsTotal += game.secretsTotal;
  next.damageTaken = game.damageTaken;
  next.damageBySource = { ...game.damageBySource };
  next.weaponAttacks = { ...game.weaponAttacks };
  next.weaponHits = { ...game.weaponHits };
  next.elapsed = game.elapsed;
  next.sponsorHypeChecked = game.sponsorHypeChecked;
  next.cursedItemId = game.cursedItemId;
  next.cursedRoomsCleared = game.cursedRoomsCleared;
  next.cursedItemsCarried = game.cursedItemsCarried;
  next.cursedMaxHpLoss = game.cursedMaxHpLoss;
  next.lastCombatTime = game.elapsed;
  next.message = "FLOOR 02 // SHADOW NETWORK ACQUIRED";
  if (next.testerMode) applyTesterLoadout(next);
  return next;
}

function mazeRoomIndexForTile(tx: number, ty: number) {
  return Math.floor(ty / 8) * ROOM_COLS + Math.floor(tx / 8);
}

function isWallTile(tx: number, ty: number) {
  if (tx <= 0 || ty <= 0 || tx >= MAP_W - 1 || ty >= MAP_H - 1) return true;
  const verticalDoorway = [2, 3, 4, 5, 6].includes(((ty % 8) + 8) % 8);
  const horizontalDoorway = [2, 3, 4, 5, 6].includes(((tx % 8) + 8) % 8);
  if (tx % 8 === 0) {
    if (!verticalDoorway) return true;
    const row = Math.floor(ty / 8);
    const rightCol = Math.floor(tx / 8);
    const leftIndex = row * ROOM_COLS + rightCol - 1;
    const rightIndex = row * ROOM_COLS + rightCol;
    const leftRoomId = activeFloorNavigation ? roomIdAtSlot(activeFloorNavigation, leftIndex) : null;
    const rightRoomId = activeFloorNavigation ? roomIdAtSlot(activeFloorNavigation, rightIndex) : null;
    const hasDoor = Boolean(
      leftRoomId && connectionInDirection(activeFloorNavigation!, leftRoomId, "east")
      || rightRoomId && connectionInDirection(activeFloorNavigation!, rightRoomId, "west"),
    );
    if (activeFloorNavigation && !hasDoor) return true;
  }
  if (ty % 8 === 0) {
    if (!horizontalDoorway) return true;
    const col = Math.floor(tx / 8);
    const bottomRow = Math.floor(ty / 8);
    const topIndex = (bottomRow - 1) * ROOM_COLS + col;
    const bottomIndex = bottomRow * ROOM_COLS + col;
    const topRoomId = activeFloorNavigation ? roomIdAtSlot(activeFloorNavigation, topIndex) : null;
    const bottomRoomId = activeFloorNavigation ? roomIdAtSlot(activeFloorNavigation, bottomIndex) : null;
    const hasDoor = Boolean(
      topRoomId && connectionInDirection(activeFloorNavigation!, topRoomId, "south")
      || bottomRoomId && connectionInDirection(activeFloorNavigation!, bottomRoomId, "north"),
    );
    if (activeFloorNavigation && !hasDoor) return true;
  }
  const roomCol = Math.floor(tx / 8);
  const roomRow = Math.floor(ty / 8);
  const roomIndex = roomRow * ROOM_COLS + roomCol;
  if (activeMazeRooms.has(roomIndex)) {
    const localX = ((tx % 8) + 8) % 8;
    const localY = ((ty % 8) + 8) % 8;
    if (isMazeWallCell(localX, localY)) return true;
    return false;
  }
  return isRoomObstacleTile(tx, ty, ROOM_COLS, ROOM_ROWS);
}

function canMove(x: number, y: number, radius = 10) {
  const points = [
    [x - radius, y - radius],
    [x + radius, y - radius],
    [x - radius, y + radius],
    [x + radius, y + radius],
  ];
  return points.every(([px, py]) => !isWallTile(Math.floor(px / TILE), Math.floor(py / TILE)));
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function applyKeyboardAimAssist(game: Game) {
  const player = game.player;
  const target = game.enemies
    .filter((enemy) => enemy.hp > 0 && enemyIsTargetable(enemy) && roomIndexFor(enemy.x, enemy.y) === roomIndexFor(player.x, player.y) && (enemy.kind !== "boss" || game.bossEngaged))
    .map((enemy) => {
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const distance = Math.hypot(dx, dy);
      const alignment = (dx * player.dirX + dy * player.dirY) / Math.max(1, distance);
      return { enemy, dx, dy, distance, alignment };
    })
    .filter((entry) => entry.distance < 180 && entry.alignment > Math.cos(.42))
    .sort((a, b) => (b.alignment - a.alignment) || (a.distance - b.distance))[0];
  if (!target) return;
  const targetX = target.dx / Math.max(1, target.distance);
  const targetY = target.dy / Math.max(1, target.distance);
  const assistedX = player.dirX * .65 + targetX * .35;
  const assistedY = player.dirY * .65 + targetY * .35;
  const length = Math.max(1, Math.hypot(assistedX, assistedY));
  player.dirX = assistedX / length;
  player.dirY = assistedY / length;
}

function roomFor(x: number, y: number) {
  return {
    col: Math.max(0, Math.min(ROOM_COLS - 1, Math.floor(x / (8 * TILE)))),
    row: Math.max(0, Math.min(ROOM_ROWS - 1, Math.floor(y / (8 * TILE)))),
  };
}

function roomIndexFor(x: number, y: number) {
  const room = roomFor(x, y);
  return room.row * ROOM_COLS + room.col;
}

function directionBetweenSlots(fromIndex: number, toIndex: number): CardinalDirection | null {
  const delta = toIndex - fromIndex;
  if (delta === -ROOM_COLS) return "north";
  if (delta === 1 && Math.floor(fromIndex / ROOM_COLS) === Math.floor(toIndex / ROOM_COLS)) return "east";
  if (delta === ROOM_COLS) return "south";
  if (delta === -1 && Math.floor(fromIndex / ROOM_COLS) === Math.floor(toIndex / ROOM_COLS)) return "west";
  return null;
}

function connectionFromSlot(game: Game, slotIndex: number, direction: CardinalDirection) {
  const roomId = roomIdAtSlot(game.navigation, slotIndex);
  return roomId ? connectionInDirection(game.navigation, roomId, direction) : null;
}

function doorwayArrival(navigation: FloorNavigationMap, connection: PhysicalDoorConnection, lane = 0) {
  const reverse = connection.reverseDoorId
    ? gameConnectionById(navigation, connection.reverseDoorId)
    : null;
  const arrivalDirection = reverse?.direction ?? (connection.direction === "north" ? "south" : connection.direction === "south" ? "north" : connection.direction === "east" ? "west" : "east");
  const left = connection.toSlot.col * 8 * TILE;
  const top = connection.toSlot.row * 8 * TILE;
  if (arrivalDirection === "west") return { x: left + 1.25 * TILE, y: top + 4.5 * TILE + lane };
  if (arrivalDirection === "east") return { x: left + 6.75 * TILE, y: top + 4.5 * TILE + lane };
  if (arrivalDirection === "north") return { x: left + 4.5 * TILE + lane, y: top + 1.25 * TILE };
  return { x: left + 4.5 * TILE + lane, y: top + 6.75 * TILE };
}

function gameConnectionById(navigation: FloorNavigationMap | null, doorId: string) {
  return navigation?.connections.find((connection) => connection.doorId === doorId) ?? null;
}

function doorwayLane(id: number) {
  // Three narrow lanes keep a crowd from converging on one exact point while
  // retaining enough clearance for the largest non-boss enemy at the frame.
  return (id % 3 - 1) * 18;
}

function chaseWaypoint(game: Game, from: { x: number; y: number; id?: number }, target: { x: number; y: number }) {
  const sourceRoom = roomFor(from.x, from.y);
  const targetRoom = roomFor(target.x, target.y);
  if (sourceRoom.col === targetRoom.col && sourceRoom.row === targetRoom.row) return target;
  const sourceIndex = sourceRoom.row * ROOM_COLS + sourceRoom.col;
  const targetIndex = targetRoom.row * ROOM_COLS + targetRoom.col;
  const sourceRoomId = roomIdAtSlot(game.navigation, sourceIndex);
  const targetRoomId = roomIdAtSlot(game.navigation, targetIndex);
  const connection = sourceRoomId && targetRoomId
    ? nextConnectionToward(game.navigation, sourceRoomId, targetRoomId)
    : null;
  if (!connection) return { x: from.x, y: from.y };
  const roomLeft = sourceRoom.col * 8 * TILE;
  const roomTop = sourceRoom.row * 8 * TILE;
  const lane = doorwayLane(from.id ?? 0);
  if (connection.direction === "west") return { x: roomLeft + 20, y: roomTop + 4.5 * TILE + lane };
  if (connection.direction === "east") return { x: roomLeft + 8 * TILE - 20, y: roomTop + 4.5 * TILE + lane };
  if (connection.direction === "north") return { x: roomLeft + 4.5 * TILE + lane, y: roomTop + 20 };
  return { x: roomLeft + 4.5 * TILE + lane, y: roomTop + 8 * TILE - 20 };
}

function doorwayQueueBlocked(enemy: Enemy, target: { x: number; y: number }, enemies: Enemy[]) {
  const sourceRoom = roomFor(enemy.x, enemy.y);
  const targetRoom = roomFor(target.x, target.y);
  if (sourceRoom.col === targetRoom.col && sourceRoom.row === targetRoom.row) return false;

  const horizontal = sourceRoom.col !== targetRoom.col;
  const direction = horizontal
    ? (targetRoom.col > sourceRoom.col ? 1 : -1)
    : (targetRoom.row > sourceRoom.row ? 1 : -1);
  const boundary = horizontal
    ? (sourceRoom.col + (direction > 0 ? 1 : 0)) * 8 * TILE
    : (sourceRoom.row + (direction > 0 ? 1 : 0)) * 8 * TILE;
  const progress = horizontal ? (boundary - enemy.x) * direction : (boundary - enemy.y) * direction;
  if (progress < -22 || progress > 76) return false;

  const lane = horizontal
    ? (sourceRoom.row * 8 + 4.5) * TILE + doorwayLane(enemy.id)
    : (sourceRoom.col * 8 + 4.5) * TILE + doorwayLane(enemy.id);
  return enemies.some((other) => {
    if (other.id === enemy.id || other.hp <= 0 || doorwayLane(other.id) !== doorwayLane(enemy.id)) return false;
    const otherRoom = roomFor(other.x, other.y);
    if (otherRoom.col !== sourceRoom.col || otherRoom.row !== sourceRoom.row) return false;
    const lateralGap = horizontal ? Math.abs(other.y - lane) : Math.abs(other.x - lane);
    const otherProgress = horizontal ? (boundary - other.x) * direction : (boundary - other.y) * direction;
    return lateralGap < 17 && otherProgress < progress && progress - otherProgress < 34;
  });
}

function doorwayClearanceTarget(enemy: Enemy) {
  const room = roomFor(enemy.x, enemy.y);
  const roomLeft = room.col * 8 * TILE;
  const roomTop = room.row * 8 * TILE;
  const localX = enemy.x - roomLeft;
  const localY = enemy.y - roomTop;
  const doorCenter = 4.5 * TILE;
  const inVerticalDoorBand = Math.abs(localY - doorCenter) < 72;
  const inHorizontalDoorBand = Math.abs(localX - doorCenter) < 72;
  const clearance = 56;

  if (room.col > 0 && localX < 42 && inVerticalDoorBand) return { x: roomLeft + clearance, y: enemy.y };
  if (room.col < ROOM_COLS - 1 && localX > 8 * TILE - 42 && inVerticalDoorBand) return { x: roomLeft + 8 * TILE - clearance, y: enemy.y };
  if (room.row > 0 && localY < 42 && inHorizontalDoorBand) return { x: enemy.x, y: roomTop + clearance };
  if (room.row < ROOM_ROWS - 1 && localY > 8 * TILE - 42 && inHorizontalDoorBand) return { x: enemy.x, y: roomTop + 8 * TILE - clearance };
  return null;
}

function enemyApproachTarget(enemy: Enemy, player: Game["player"]) {
  if (["boss", "healer", "spitter", "volatile", "broadcaster", "bulwark"].includes(enemy.kind)) return player;
  if (dist(enemy, player) > 112) return player;
  const reach = enemy.kind === "mimic" ? 28 : enemy.kind === "warden" ? 28 : 24;
  const angle = ((enemy.id * 137.5) % 360) * Math.PI / 180;
  const radius = reach + 5;
  const target = { x: player.x + Math.cos(angle) * radius, y: player.y + Math.sin(angle) * radius };
  return canMove(target.x, target.y, 11) ? target : player;
}

function encounterLocks(kind: RoomKind) {
  return kind === "boss";
}

function isRoomLocked(game: Game, roomIndex: number) {
  if (game.roomKinds[roomIndex] === "maze") return game.roomStarted[roomIndex] && !game.mazeSolved.has(roomIndex);
  return Boolean(bossGateOpen(game) && game.roomStarted[roomIndex] && !game.roomCleared[roomIndex] && encounterLocks(game.roomKinds[roomIndex]));
}

function bossGateOpen(game: Game) {
  return game.pylons.every((pylon) => pylon.active) && game.bossAwakenTime <= 0;
}

function bossDisplayName(boss: Enemy | undefined) {
  if (boss?.variant === "ninja") return "NINJA MASTER";
  if (boss?.variant === "conductor") return "STATIC CONDUCTOR";
  return "BROADCAST WARDEN";
}

function burst(game: Game, x: number, y: number, color: string, count: number, speed = 80) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const force = speed * (0.35 + Math.random() * 0.65);
    const life = 0.22 + Math.random() * 0.28;
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * force,
      vy: Math.sin(angle) * force,
      life,
      maxLife: life,
      color,
      size: 1.5 + Math.random() * 2.5,
    });
  }
}

function showDamage(game: Game, enemy: Enemy, amount: number, heavy = false, color = "#fff3b0") {
  const life = heavy ? .72 : .58;
  game.combatText.push({
    x: enemy.x + (Math.random() - .5) * 8,
    y: enemy.y - (enemy.kind === "boss" ? 36 : 25),
    text: `${heavy ? "!" : ""}${Math.max(1, Math.round(amount))}`,
    life,
    maxLife: life,
    color,
    scale: heavy ? 1.25 : 1,
  });
}

function colorForProjectile(shot: Projectile) {
  return shot.arsenalId ? CLASS_ARSENAL[shot.arsenalId].color : shot.kind === "arc-bolt" ? "#a78bfa" : shot.kind === "arrow" || shot.kind === "power-arrow" ? "#34d399" : "#f4d35e";
}

function moveEntity(entity: { x: number; y: number }, vx: number, vy: number, dt: number, radius = 10) {
  const nx = entity.x + vx * dt;
  if (canMove(nx, entity.y, radius)) entity.x = nx;
  const ny = entity.y + vy * dt;
  if (canMove(entity.x, ny, radius)) entity.y = ny;
}

function recoverEmbeddedEntity(entity: { x: number; y: number }, radius = 10) {
  if (canMove(entity.x, entity.y, radius)) return;

  // Knockback from an older frame/save can leave an entity overlapping a wall.
  // Find the nearest valid point so regular steering can resume.
  for (let distance = 2; distance <= TILE * 2; distance += 2) {
    for (let step = 0; step < 16; step++) {
      const angle = (step / 16) * Math.PI * 2;
      const x = entity.x + Math.cos(angle) * distance;
      const y = entity.y + Math.sin(angle) * distance;
      if (canMove(x, y, radius)) {
        entity.x = x;
        entity.y = y;
        return;
      }
    }
  }
}

function displaceEntity(entity: { x: number; y: number }, dx: number, dy: number, radius = 10) {
  recoverEmbeddedEntity(entity, radius);
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
  for (let step = 0; step < steps; step++) {
    moveEntity(entity, dx / steps, dy / steps, 1, radius);
  }
}

function movePlayer(game: Game, vx: number, vy: number, dt: number, radius = 10) {
  const player = game.player;
  const attemptMove = (x: number, y: number) => {
    const currentRoom = roomIndexFor(player.x, player.y);
    const geometricRoom = roomIndexFor(x, y);
    if (geometricRoom === currentRoom) {
      if (!canMove(x, y, radius)) return false;
      player.x = x;
      player.y = y;
      return true;
    }
    if (game.roomKinds[currentRoom] === "maze" && !game.mazeSolved.has(currentRoom)) return false;
    const direction = directionBetweenSlots(currentRoom, geometricRoom);
    const connection = direction ? connectionFromSlot(game, currentRoom, direction) : null;
    if (!connection) return false;
    const targetRoom = connection.toSlot.index;
    if (game.roomKinds[targetRoom] === "boss" && !bossGateOpen(game)) return false;
    if (targetRoom === geometricRoom && canMove(x, y, radius)) {
      player.x = x;
      player.y = y;
      return true;
    }
    const arrival = doorwayArrival(game.navigation, connection);
    if (!canMove(arrival.x, arrival.y, radius)) return false;
    player.x = arrival.x;
    player.y = arrival.y;
    return true;
  };

  const nx = player.x + vx * dt;
  attemptMove(nx, player.y);
  const ny = player.y + vy * dt;
  attemptMove(player.x, ny);
}

function separateEnemyFromPlayer(game: Game, enemy: Enemy) {
  if (!enemyIsTargetable(enemy)) return;
  const player = game.player;
  const minimumDistance = enemy.kind === "boss" ? 42 : enemy.kind === "warden" || enemy.kind === "mimic" ? 32 : 28;
  const dx = enemy.x - player.x;
  const dy = enemy.y - player.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= minimumDistance) return;

  const baseX = distance > .01 ? dx / distance : -(player.dirX || 1);
  const baseY = distance > .01 ? dy / distance : -player.dirY;
  const directions = [
    { x: baseX, y: baseY },
    { x: -baseY, y: baseX },
    { x: baseY, y: -baseX },
  ];
  const enemyRadius = enemy.kind === "boss" ? 17 : 11;

  for (const direction of directions) {
    const targetX = player.x + direction.x * minimumDistance;
    const targetY = player.y + direction.y * minimumDistance;
    if (canMove(targetX, targetY, enemyRadius)) {
      enemy.x = targetX;
      enemy.y = targetY;
      return;
    }
  }

  for (const direction of directions) {
    const targetX = enemy.x - direction.x * minimumDistance;
    const targetY = enemy.y - direction.y * minimumDistance;
    if (canMove(targetX, targetY, 9)) {
      player.x = targetX;
      player.y = targetY;
      return;
    }
  }
}

function separateEnemies(game: Game) {
  const living = game.enemies.filter((enemy) => enemy.hp > 0 && enemyIsTargetable(enemy));
  for (let i = 0; i < living.length; i++) {
    for (let j = i + 1; j < living.length; j++) {
      const first = living[i];
      const second = living[j];
      const firstRadius = first.kind === "boss" ? 17 : 11;
      const secondRadius = second.kind === "boss" ? 17 : 11;
      const minimumDistance = firstRadius + secondRadius + 4;
      const dx = second.x - first.x;
      const dy = second.y - first.y;
      const distance = Math.hypot(dx, dy);
      if (distance >= minimumDistance) continue;

      const fallbackAngle = ((first.id * 53 + second.id * 97) % 360) * Math.PI / 180;
      const nx = distance > .01 ? dx / distance : Math.cos(fallbackAngle);
      const ny = distance > .01 ? dy / distance : Math.sin(fallbackAngle);
      const correction = (minimumDistance - distance) / 2;
      displaceEntity(first, -nx * correction, -ny * correction, firstRadius);
      displaceEntity(second, nx * correction, ny * correction, secondRadius);
    }
  }
}

function setMessage(game: Game, message: string) {
  game.message = message;
  game.messageTime = 3.2;
}

function hasEquipment(game: Game, id: EquipmentId) {
  return Object.values(game.equipped).includes(id);
}

function buildSynergyFor(game: Game) {
  return activeBuildSynergy({
    classId: game.player.classId,
    weaponId: game.player.weaponId,
    arsenalId: game.player.classArsenalId,
    upgrades: game.upgrades,
    equipment: Object.values(game.equipped),
  });
}

function audienceModifierFor(game: Game) {
  return AUDIENCE_MODIFIERS.find((modifier) => modifier.id === game.activeAudienceModifierId) ?? null;
}

function challengeEffectsFor(game: Game) {
  return aggregateChallengeEffects(game.challengeIds);
}

function healPlayer(game: Game, amount: number) {
  const effects = challengeEffectsFor(game);
  if (amount <= 0 || audienceModifierFor(game)?.disableHealing || effects.disableHealing) return 0;
  const before = game.player.hp;
  game.player.hp = Math.min(game.player.maxHp, game.player.hp + amount * effects.healingMultiplier);
  return game.player.hp - before;
}

function finishAudienceModifier(game: Game) {
  game.enemies.forEach((enemy) => {
    const applied = enemy.audienceSpeedMultiplier ?? 1;
    if (applied !== 1) enemy.speed /= applied;
    enemy.audienceSpeedMultiplier = 1;
  });
  game.activeAudienceModifierId = null;
  game.audienceModifierRooms = 0;
}

function applyAudienceSpeed(game: Game, enemy: Enemy) {
  const multiplier = audienceModifierFor(game)?.enemySpeedMultiplier ?? 1;
  enemy.speed *= multiplier;
  enemy.audienceSpeedMultiplier = multiplier;
}

function triggerAudienceVote(game: Game, milestone: number) {
  const ballot = audienceBallot(game.floorSeed, milestone);
  const result = resolveAudienceVote(game.floorSeed, milestone, ballot);
  finishAudienceModifier(game);
  game.activeAudienceModifierId = result.winner.id;
  game.audienceModifierRooms = result.winner.durationRooms;
  game.audienceMilestones.push(milestone);
  game.enemies.forEach((enemy) => applyAudienceSpeed(game, enemy));
  addHype(game, 3);
  game.combatText.push({ x: game.player.x, y: game.player.y - 36, text: `${result.winnerPercent}% VOTE`, life: 1.4, maxLife: 1.4, color: "#ff8fab", scale: 1 });
  setMessage(game, `AUDIENCE VOTE ${result.winnerPercent}% // ${result.winner.name.toUpperCase()} — ${result.winner.ballot}`);
}

function settleAudienceRoomClear(game: Game, baseScore: number, baseHype: number) {
  const modifier = audienceModifierFor(game);
  game.score += Math.round(baseScore * (modifier?.scoreMultiplier ?? 1));
  addHype(game, baseHype + (modifier?.hypeOnRoomClear ?? 0));
  if (!modifier) return;
  game.audienceModifierRooms = Math.max(0, game.audienceModifierRooms - 1);
  if (game.audienceModifierRooms === 0) finishAudienceModifier(game);
}

function enemyIsTargetable(enemy: Enemy) {
  return enemy.burrowPhase !== "underground" && enemy.burrowPhase !== "erupting";
}

function meleeAttackHits(
  player: Game["player"],
  enemy: Enemy,
  weapon: ReturnType<typeof getWeapon>,
  heavy = false,
) {
  const targetRadius = enemy.kind === "boss" ? 24 : enemy.kind === "warden" || enemy.kind === "mimic" ? 16 : 12;
  if (weapon.id === "hammer") {
    const impactDistance = heavy ? 54 : 48;
    const impactRadius = heavy ? 39 : 32;
    const impactX = player.x + player.dirX * impactDistance;
    const impactY = player.y + player.dirY * impactDistance;
    return Math.hypot(enemy.x - impactX, enemy.y - impactY) <= impactRadius + targetRadius;
  }
  const dx = enemy.x - player.x;
  const dy = enemy.y - player.y;
  const distance = Math.hypot(dx, dy);
  const facing = (dx * player.dirX + dy * player.dirY) / Math.max(1, distance);
  const range = weapon.range * (heavy ? 1.15 : 1) + targetRadius;
  const arc = heavy ? Math.min(Math.PI, weapon.arcRadians * 1.35) : weapon.arcRadians;
  return distance <= range && facing >= Math.cos(arc / 2);
}

function shieldingBulwark(game: Game, target: Enemy) {
  if (target.kind === "bulwark") return null;
  return game.enemies.find((enemy) =>
    enemy.kind === "bulwark" && enemy.hp > 0 && (enemy.shieldTime ?? 0) > 0 &&
    roomIndexFor(enemy.x, enemy.y) === roomIndexFor(target.x, target.y) && dist(enemy, target) < 82
  ) ?? null;
}

function damageEnemy(game: Game, target: Enemy, rawDamage: number) {
  if (!enemyIsTargetable(target)) return 0;
  if (target.kind === "boss" && target.variant === "ninja") {
    const livingNinjas = game.enemies.some((enemy) => enemy.kind === "ninja" && enemy.hp > 0 && enemy.homeRoomIndex === target.homeRoomIndex);
    if ((target.restTime ?? 0) > 0 || !livingNinjas) {
      game.combatText.push({ x: target.x, y: target.y - 43, text: (target.restTime ?? 0) > 0 ? "REST MODE" : "SUMMONING", life: .44, maxLife: .44, color: "#dcd3ff", scale: .8 });
      burst(game, target.x, target.y, "#a78bfa", 5, 65);
      return 0;
    }
  }
  const shield = shieldingBulwark(game, target);
  const audienceDamage = audienceModifierFor(game)?.playerDamageMultiplier ?? 1;
  const damage = rawDamage * cursedDamageMultiplier(game.cursedItemId) * buildSynergyFor(game).damageMultiplier * audienceDamage * (shield ? .55 : 1);
  target.hp -= damage;
  if (damage > 0) game.lastCombatTime = game.elapsed;
  if (shield) {
    burst(game, target.x, target.y, "#76c7dc", 5, 65);
    game.combatText.push({ x: target.x, y: target.y - 31, text: "SHIELDED", life: .42, maxLife: .42, color: "#76c7dc", scale: .75 });
  }
  if (target.kind === "broadcaster" && target.windup > 0 && target.castStartHp !== undefined) {
    const channelDamage = target.castStartHp - target.hp;
    if (channelDamage >= Math.max(12, target.maxHp * .18)) {
      target.windup = 0;
      target.castStartHp = undefined;
      target.cooldown = 2.8;
      target.recovery = .6;
      burst(game, target.x, target.y, "#ffffff", 13, 105);
      game.combatText.push({ x: target.x, y: target.y - 34, text: "SIGNAL CUT", life: .72, maxLife: .72, color: "#fff3b0", scale: .9 });
    }
  }
  return damage;
}

function spawnRuntimeEnemy(game: Game, kind: EnemyKind, x: number, y: number, roomIndex: number, summonerId?: number) {
  const stats = enemyStats[kind];
  const contract = BROADCAST_CONTRACTS[game.contractId];
  const challengeEffects = challengeEffectsFor(game);
  const progression = .82 + (roomIndex / Math.max(1, game.roomKinds.length - 1)) * .28;
  const elite = kind !== "boss" && ((game.nextId * 73 + game.floorSeed) % 1000) / 1000 < challengeEffects.eliteChanceBonus;
  const hp = Math.round(stats.hp * progression * contract.enemyHealth * challengeEffects.enemyHealthMultiplier * (elite ? 1.08 : 1));
  const spawned: Enemy = {
    id: game.nextId++, kind, x, y, hp, maxHp: hp,
    speed: stats.speed * (.92 + progression * .08) * contract.enemySpeed * challengeEffects.enemySpeedMultiplier,
    damage: Math.max(4, Math.round(stats.damage * progression * challengeEffects.enemyDamageMultiplier)),
    cooldown: .45, flash: .18, windup: 0, recovery: .3, elite, homeRoomIndex: roomIndex, summonerId,
  };
  applyAudienceSpeed(game, spawned);
  game.enemies.push(spawned);
  return spawned;
}

function summonBroadcasterHusks(game: Game, broadcaster: Enemy) {
  const offsets = broadcaster.id % 2 ? [[-30, 22], [30, -22]] : [[-30, -22], [30, 22]];
  offsets.forEach(([dx, dy]) => {
    const x = broadcaster.x + dx;
    const y = broadcaster.y + dy;
    if (canMove(x, y, 11)) {
      spawnRuntimeEnemy(game, "skitter", x, y, broadcaster.homeRoomIndex, broadcaster.id);
      burst(game, x, y, "#ff4d9a", 10, 90);
    }
  });
}

function summonSignalNinjas(game: Game, boss: Enemy, count = 4) {
  for (let index = 0; index < count; index++) {
    const angle = (index / count) * Math.PI * 2 + boss.id * .31;
    const x = boss.x + Math.cos(angle) * 70;
    const y = boss.y + Math.sin(angle) * 70;
    if (canMove(x, y, 11)) {
      const ninja = spawnRuntimeEnemy(game, "ninja", x, y, boss.homeRoomIndex, boss.id);
      ninja.scale = .64;
      ninja.hp = Math.max(1, Math.round(ninja.hp * .72));
      ninja.maxHp = ninja.hp;
      burst(game, x, y, "#a78bfa", 12, 105);
    }
  }
}

function triggerMazeWrongTurn(game: Game, roomIndex: number) {
  const roomCol = roomIndex % ROOM_COLS;
  const roomRow = Math.floor(roomIndex / ROOM_COLS);
  MAZE_WRONG_TURNS.forEach((turn, turnIndex) => {
    const key = `${roomIndex}:${turnIndex}`;
    const x = (roomCol * 8 + turn.x + .5) * TILE;
    const y = (roomRow * 8 + turn.y + .5) * TILE;
    if (game.mazeAmbushes.has(key) || Math.hypot(game.player.x - x, game.player.y - y) > 18) return;
    game.mazeAmbushes.add(key);
    const spawnOffsets = [[-38, 0], [38, 0], [0, -38], [0, 38], [-32, -32], [32, 32]];
    let spawned = 0;
    for (const [dx, dy] of spawnOffsets) {
      if (spawned >= 2) break;
      if (!canMove(x + dx, y + dy, 11)) continue;
      spawnRuntimeEnemy(game, "ninja", x + dx, y + dy, roomIndex);
      burst(game, x + dx, y + dy, "#a78bfa", 12, 95);
      spawned++;
    }
    game.shake = Math.max(game.shake, .22);
    setMessage(game, "WRONG PATH // SHADOW AMBUSH REVEALED");
  });
}

function updateMazeRoom(game: Game, roomIndex: number) {
  triggerMazeWrongTurn(game, roomIndex);
  if (game.mazeSolved.has(roomIndex)) return;
  const goal = mazeGoalPosition(roomIndex, ROOM_COLS, TILE);
  if (dist(game.player, goal) > 20) return;
  game.mazeSolved.add(roomIndex);
  game.roomCleared[roomIndex] = true;
  game.roomsCleared++;
  settleAudienceRoomClear(game, 450, 7);
  game.roomClearFx = 1.2;
  game.roomClearRoomIndex = roomIndex;
  const curse = getCursedItem(game.cursedItemId);
  if (curse) {
    game.cursedRoomsCleared++;
    addHype(game, curse.hypePerRoom);
    game.score += curse.hypePerRoom * 40;
  }
  if (!game.dareComplete && game.activeDareId === "cursed_carrier" && game.cursedItemId) game.dareProgress++;
  const dare = AUDIENCE_DARES.find((entry) => entry.id === game.activeDareId);
  if (dare && game.dareProgress >= dare.target && !game.dareComplete) {
    game.dareComplete = true;
    addHype(game, dare.hypeReward);
    game.score += dare.scoreReward;
  }
  spawnFloorCurse(game, roomIndex, goal.x, goal.y);
  burst(game, goal.x, goal.y, "#76c7dc", 24, 120);
  setMessage(game, "MAZE SOLVED // ALL ROUTES RELEASED");
  if ([3, 6, 9].includes(game.roomsCleared) && !game.audienceMilestones.includes(game.roomsCleared)) {
    triggerAudienceVote(game, game.roomsCleared);
  }
}

function selectClassEquipmentDrop(classId: PlayerClassId, rareBoost = false) {
  if (classId === "knight") return selectEquipmentDrop(Math.random, rareBoost);
  const compatible: EquipmentId[] = ["scrap-plate", "shockweave-vest", "runner-boots", "phase-treads", "iron-stompers", "blood-token", "volatile-heart"];
  const preferred = compatible.filter((id) => rareBoost ? EQUIPMENT[id].rarity !== "common" : true);
  const pool = preferred.length ? preferred : compatible;
  return EQUIPMENT[pool[Math.floor(Math.random() * pool.length)] ?? "scrap-plate"];
}

function releaseLootAmbush(game: Game, chest: Chest) {
  const room = roomFor(chest.x, chest.y);
  const roomIndex = room.row * ROOM_COLS + room.col;
  const progression = .86 + (roomIndex / Math.max(1, game.roomKinds.length - 1)) * .24;
  const spawns: Array<{ kind: EnemyKind; tx: number; ty: number }> = [
    { kind: "skitter", tx: 5.5, ty: 2.5 },
    { kind: "skitter", tx: 6, ty: 5.5 },
    { kind: Math.random() < .5 ? "spitter" : "warden", tx: 4.5, ty: 3.5 },
  ];
  spawns.forEach(({ kind, tx, ty }) => {
    const stats = enemyStats[kind];
    const effects = challengeEffectsFor(game);
    const elite = ((game.nextId * 73 + game.floorSeed) % 1000) / 1000 < effects.eliteChanceBonus;
    const hp = Math.round(stats.hp * progression * effects.enemyHealthMultiplier * (elite ? 1.08 : 1));
    const spawned: Enemy = { id:game.nextId++, kind, x:(room.col * 8 + tx) * TILE, y:(room.row * 8 + ty) * TILE, hp, maxHp:hp, speed:stats.speed * effects.enemySpeedMultiplier, damage:Math.round(stats.damage * progression * effects.enemyDamageMultiplier), cooldown:.4 + Math.random() * .8, flash:.2, windup:0, recovery:.25, elite, homeRoomIndex:roomIndex };
    applyAudienceSpeed(game, spawned);
    game.enemies.push(spawned);
  });
}

function equipItem(game: Game, id: EquipmentId) {
  const item = EQUIPMENT[id];
  const previous = game.equipped[item.slot];
  if (previous === "scrap-plate") {
    game.player.maxHp = Math.max(1, game.player.maxHp - 20);
    game.player.hp = Math.min(game.player.hp, game.player.maxHp);
  }
  game.equipped[item.slot] = id;
  if (id === "scrap-plate") {
    game.player.maxHp += 20;
    healPlayer(game, 20);
  }
  if (!game.discoveredEquipment.includes(id)) game.discoveredEquipment.push(id);
  return previous;
}

function addHype(game: Game, amount: number) {
  game.hype += amount * cursedHypeMultiplier(game.cursedItemId);
  game.maxHype = Math.max(game.maxHype, game.hype);
}

function carryCursedItem(game: Game, id: CursedItemId | null) {
  const previous = game.cursedItemId;
  if (previous === id) return previous;
  if (game.cursedMaxHpLoss > 0) {
    game.player.maxHp += game.cursedMaxHpLoss;
    game.player.hp = Math.min(game.player.maxHp, game.player.hp);
    game.cursedMaxHpLoss = 0;
  }
  game.cursedItemId = id;
  if (id === "glass_transmitter") {
    game.cursedMaxHpLoss = Math.max(1, Math.round(game.player.maxHp * .3));
    game.player.maxHp = Math.max(1, game.player.maxHp - game.cursedMaxHpLoss);
    game.player.hp = Math.min(game.player.hp, game.player.maxHp);
  }
  if (id && previous === null) game.cursedItemsCarried++;
  return previous;
}

function spawnFloorCurse(game: Game, roomIndex: number, x: number, y: number) {
  if (game.cursedDropSpawned || roomIndex !== game.cursedDropRoomIndex) return;
  const item = selectCursedItem(`${game.floorSeed}:${game.floorNumber}`);
  game.cursedDropSpawned = true;
  game.groundCursedItems.push({ id: game.nextId++, cursedItemId: item.id, x, y, phase: (game.floorSeed % 628) / 100 });
  burst(game, x, y, "#ff4d9a", 28, 135);
  setMessage(game, `CURSED RELIC DETECTED // ${item.name.toUpperCase()}`);
}

function hurtPlayer(game: Game, amount: number, source: string) {
  if (game.testerMode) return;
  if (source === "Void projectile" && hasEquipment(game, "shockweave-vest")) amount *= .75;
  amount *= audienceModifierFor(game)?.enemyDamageMultiplier ?? 1;
  amount = cursedIncomingDamage(game.cursedItemId, amount, source);
  amount = Math.round(amount);
  game.player.hp -= amount;
  game.damageTaken += amount;
  game.damageBySource[source] = (game.damageBySource[source] ?? 0) + amount;
  game.lastCombatTime = game.elapsed;
}

function applyTesterLoadout(game: Game) {
  const player = game.player;
  player.hp = player.maxHp;
  player.stamina = 100;
  player.classResource = PLAYER_CLASSES[player.classId].resourceMax;
  player.reloadTime = 0;
  player.attackCd = 0;
  player.dodgeCd = 0;
  player.potions = 99;
  player.bombs = 99;
  player.furyVials = 99;
  if (getWeapon(player.weaponId).ammo !== null) player.ammo = 99;
  game.time = Math.max(game.time, 720);
}

function creditEnemyDeaths(game: Game, dead: Enemy[]) {
  dead.forEach((enemy) => {
    burst(game, enemy.x, enemy.y, enemy.kind === "boss" ? "#ff4d6d" : "#dce7e4", enemy.kind === "boss" ? 34 : 20, 175);
    burst(game, enemy.x, enemy.y, "#f4d35e", enemy.kind === "boss" ? 18 : 7, 90);
    game.combatText.push({ x: enemy.x, y: enemy.y - (enemy.kind === "boss" ? 44 : 30), text: enemy.kind === "boss" ? `${bossDisplayName(enemy)} DOWN` : "K.O.", life: .85, maxLife: .85, color: "#ff8fab", scale: enemy.kind === "boss" ? 1.35 : 1.15 });
    game.kills++;
    if (game.upgrades.includes("blood_broadcast") && game.player.hp / game.player.maxHp < .35) healPlayer(game, 2);
    if (hasEquipment(game, "blood-token")) healPlayer(game, 3);
    if (game.cursedItemId === "hungry_crown") healPlayer(game, 4);
    addHype(game, enemy.kind === "boss" ? 15 : 1.5);
    addHype(game, buildSynergyFor(game).hypeOnKill);
    game.score += Math.round((enemy.kind === "boss" ? 1600 : 140) * game.hype);
    if (enemy.kind === "boss") {
      game.bossDead = true;
      setMessage(game, `${bossDisplayName(enemy)} DOWN // EXIT CHANNEL UNLOCKED`);
    }
  });
}

function drawPixelText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = "#f4d35e", align: CanvasTextAlign = "left") {
  ctx.save();
  ctx.font = "bold 12px monospace";
  ctx.textAlign = align;
  ctx.fillStyle = "#08090a";
  ctx.fillText(text, x + 2, y + 2);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.restore();
}

// Kept as a compact fallback/reference renderer while V2 drives the live feed.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function renderGame(ctx: CanvasRenderingContext2D, game: Game) {
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#08090a";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const wall = isWallTile(tx, ty);
      if (wall) {
        ctx.fillStyle = (tx + ty) % 2 ? "#252c2b" : "#2e3734";
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        ctx.fillStyle = "#46524d";
        ctx.fillRect(tx * TILE + 2, ty * TILE + 2, TILE - 4, 4);
        ctx.fillStyle = "#151a19";
        ctx.fillRect(tx * TILE + 4, ty * TILE + 20, TILE - 8, 8);
      } else {
        ctx.fillStyle = (tx + ty) % 2 ? "#101615" : "#131a18";
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        ctx.fillStyle = "#18211e";
        ctx.fillRect(tx * TILE + 3, ty * TILE + 3, 2, 2);
        ctx.fillRect(tx * TILE + 25, ty * TILE + 24, 3, 3);
      }
    }
  }

  // Broadcast room markers.
  [[4, 4], [12, 4], [20, 4], [4, 12], [12, 12], [20, 12]].forEach(([tx, ty], i) => {
    ctx.strokeStyle = "#253a33";
    ctx.lineWidth = 2;
    ctx.strokeRect(tx * TILE - 42, ty * TILE - 42, 84, 84);
    drawPixelText(ctx, `R-0${i + 1}`, tx * TILE, ty * TILE - 48, "#4c7062", "center");
  });

  // Safe pad.
  const safeX = 12.5 * TILE;
  const safeY = 12.5 * TILE;
  ctx.fillStyle = game.safeUsed ? "#29433c" : "#34d399";
  ctx.fillRect(safeX - 20, safeY - 20, 40, 40);
  ctx.fillStyle = "#0b1713";
  ctx.fillRect(safeX - 13, safeY - 5, 26, 10);
  ctx.fillRect(safeX - 5, safeY - 13, 10, 26);

  // Exit gate.
  const gateOpen = game.bossDead;
  ctx.fillStyle = gateOpen ? "#34d399" : "#ef4444";
  ctx.fillRect(22 * TILE + 3, 14 * TILE + 3, 26, 26);
  ctx.fillStyle = "#06100c";
  ctx.fillRect(22 * TILE + 10, 14 * TILE + 8, 12, 18);
  if (!gateOpen) ctx.fillRect(22 * TILE + 5, 14 * TILE + 13, 22, 5);

  game.pylons.forEach((pylon) => {
    ctx.fillStyle = pylon.active ? "#f4d35e" : "#7b5c20";
    ctx.fillRect(pylon.x - 8, pylon.y - 18, 16, 36);
    ctx.fillStyle = pylon.active ? "#fff3b0" : "#312a1c";
    ctx.fillRect(pylon.x - 14, pylon.y - 22, 28, 8);
    if (pylon.active) {
      ctx.strokeStyle = "rgba(244,211,94,.32)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pylon.x, pylon.y, 23 + Math.sin(game.elapsed * 5) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  const fallbackMazeRoom = roomIndexFor(game.player.x, game.player.y);
  if (game.roomKinds[fallbackMazeRoom] === "maze" && !game.mazeSolved.has(fallbackMazeRoom)) {
    const goal = mazeGoalPosition(fallbackMazeRoom, ROOM_COLS, TILE);
    const pulse = 7 + Math.sin(game.elapsed * 6) * 2;
    ctx.save(); ctx.translate(goal.x, goal.y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "rgba(118,199,220,.24)"; ctx.fillRect(-pulse, -pulse, pulse * 2, pulse * 2);
    ctx.fillStyle = "#76c7dc"; ctx.fillRect(-5, -5, 10, 10);
    ctx.fillStyle = "#d9f7ff"; ctx.fillRect(-2, -2, 4, 4); ctx.restore();
    drawPixelText(ctx, "ROUTE CORE", goal.x, goal.y - 16, "#76c7dc", "center");
  }

  game.chests.forEach((chest) => {
    ctx.fillStyle = chest.open ? "#4a3420" : "#b7791f";
    ctx.fillRect(chest.x - 14, chest.y - 10, 28, 20);
    ctx.fillStyle = chest.open ? "#231a12" : "#f4d35e";
    ctx.fillRect(chest.x - 2, chest.y - 3, 5, 7);
    if (chest.open) ctx.fillRect(chest.x - 12, chest.y - 14, 24, 4);
  });

  game.groundItems.forEach((item) => {
    const bob = Math.sin(game.elapsed * 5 + item.phase) * 3;
    const color = item.kind === "tonic" ? "#34d399" : item.kind === "bomb" ? "#76c7dc" : "#ff4d6d";
    ctx.fillStyle = "rgba(0,0,0,.5)";
    ctx.fillRect(item.x - 9, item.y + 10, 18, 4);
    ctx.shadowColor = color;
    ctx.shadowBlur = 9;
    ctx.fillStyle = color;
    if (item.kind === "tonic") {
      ctx.fillRect(item.x - 6, item.y - 7 + bob, 12, 15);
      ctx.fillStyle = "#e9e2c7";
      ctx.fillRect(item.x - 3, item.y - 11 + bob, 6, 5);
      ctx.fillRect(item.x - 3, item.y - 3 + bob, 6, 2);
    } else if (item.kind === "bomb") {
      ctx.beginPath();
      ctx.arc(item.x, item.y + bob, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f4d35e";
      ctx.fillRect(item.x + 4, item.y - 10 + bob, 3, 7);
      ctx.fillStyle = "#fff3b0";
      ctx.fillRect(item.x + 7, item.y - 12 + bob, 3, 3);
    } else {
      ctx.fillRect(item.x - 7, item.y - 8 + bob, 14, 16);
      ctx.fillStyle = "#fff3b0";
      ctx.fillRect(item.x - 2, item.y - 6 + bob, 4, 12);
      ctx.fillRect(item.x - 5, item.y - 1 + bob, 10, 3);
    }
    ctx.shadowBlur = 0;
    drawPixelText(ctx, item.kind === "tonic" ? "1" : item.kind === "bomb" ? "2" : "3", item.x, item.y - 18 + bob, color, "center");
  });

  game.groundCursedItems.forEach((drop) => {
    const item = getCursedItem(drop.cursedItemId);
    if (!item) return;
    const bob = Math.sin(game.elapsed * 4 + drop.phase) * 4;
    ctx.save();
    ctx.translate(drop.x, drop.y + bob);
    ctx.rotate(Math.PI / 4);
    ctx.shadowColor = "#ff4d9a";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "rgba(255,77,154,.25)";
    ctx.fillRect(-13, -13, 26, 26);
    ctx.fillStyle = "#ff4d9a";
    ctx.fillRect(-8, -8, 16, 16);
    ctx.fillStyle = "#fff3b0";
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
    drawPixelText(ctx, item.name.toUpperCase(), drop.x, drop.y - 25 + bob, "#ff8fab", "center");
  });

  game.groundWeapons.forEach((drop) => {
    const bob = Math.sin(game.elapsed * 4 + drop.phase) * 3;
    const weapon = getWeapon(drop.weaponId);
    const color = weapon.rarity === "rare" ? "#a78bfa" : weapon.rarity === "uncommon" ? "#76c7dc" : "#f4d35e";
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = color;
    ctx.save();
    ctx.translate(drop.x, drop.y + bob);
    ctx.rotate(-.55);
    ctx.fillRect(-17, -3, 34, 6);
    ctx.fillStyle = "#fff3b0";
    ctx.fillRect(8, -5, 9, 10);
    ctx.restore();
    ctx.shadowBlur = 0;
    drawPixelText(ctx, weapon.name.toUpperCase(), drop.x, drop.y - 20 + bob, color, "center");
  });

  game.groundClassArsenal.forEach((drop) => {
    const item = CLASS_ARSENAL[drop.arsenalId];
    const bob = Math.sin(game.elapsed * 4 + drop.phase) * 3;
    ctx.save(); ctx.translate(drop.x, drop.y + bob); ctx.shadowColor = item.color; ctx.shadowBlur = 12;
    ctx.strokeStyle = item.color; ctx.lineWidth = 3;
    if (item.classId === "mage") { ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = item.color; ctx.fillRect(-4, -4, 8, 8); }
    else { ctx.rotate(-.45); ctx.beginPath(); ctx.arc(0, 0, 13, -1.2, 1.2); ctx.stroke(); ctx.fillStyle = "#d6b06a"; ctx.fillRect(8, -1, 22, 2); }
    ctx.restore();
    drawPixelText(ctx, item.name.toUpperCase(), drop.x, drop.y - 20 + bob, item.color, "center");
  });

  game.groundEquipment.forEach((drop) => {
    const bob = Math.sin(game.elapsed * 4 + drop.phase) * 3;
    const item = EQUIPMENT[drop.equipmentId];
    ctx.save();
    ctx.translate(drop.x, drop.y + bob);
    ctx.shadowColor = item.color; ctx.shadowBlur = 12;
    ctx.fillStyle = item.color;
    ctx.fillRect(-10, -10, 20, 20);
    ctx.fillStyle = "#09100e";
    if (item.slot === "armor") { ctx.fillRect(-6, -6, 12, 14); ctx.fillRect(-10, -5, 4, 7); ctx.fillRect(6, -5, 4, 7); }
    if (item.slot === "boots") { ctx.fillRect(-8, -7, 6, 12); ctx.fillRect(2, -7, 6, 12); ctx.fillRect(-10, 3, 8, 4); ctx.fillRect(2, 3, 8, 4); }
    if (item.slot === "charm") { ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(-2, -10, 4, 5); }
    if (item.slot === "mod") { ctx.fillRect(-7, -3, 14, 6); ctx.fillRect(-3, -7, 6, 14); }
    ctx.restore();
    drawPixelText(ctx, item.name.toUpperCase(), drop.x, drop.y - 21 + bob, item.color, "center");
  });

  game.projectiles.forEach((shot) => {
    ctx.fillStyle = "#ff6b6b";
    ctx.fillRect(shot.x - 4, shot.y - 4, 8, 8);
    ctx.fillStyle = "#ffd0d0";
    ctx.fillRect(shot.x - 2, shot.y - 2, 4, 4);
  });

  game.enemies.forEach((enemy) => {
    const color = enemy.flash > 0 ? "#ffffff" : enemy.kind === "boss" ? "#ff4d6d" : enemy.kind === "warden" ? "#f97316" : enemy.kind === "spitter" ? "#a78bfa" : "#7ddf64";
    ctx.fillStyle = "rgba(0,0,0,.45)";
    ctx.fillRect(enemy.x - 13, enemy.y + 10, 26, 6);
    ctx.fillStyle = color;
    if (enemy.kind === "boss") {
      ctx.fillRect(enemy.x - 20, enemy.y - 20, 40, 40);
      ctx.fillStyle = "#250812";
      ctx.fillRect(enemy.x - 12, enemy.y - 8, 7, 7);
      ctx.fillRect(enemy.x + 5, enemy.y - 8, 7, 7);
      ctx.fillRect(enemy.x - 9, enemy.y + 8, 18, 5);
    } else {
      ctx.fillRect(enemy.x - 12, enemy.y - 12, 24, 24);
      ctx.fillStyle = "#111817";
      ctx.fillRect(enemy.x - 7, enemy.y - 5, 5, 5);
      ctx.fillRect(enemy.x + 3, enemy.y - 5, 5, 5);
      if (enemy.kind === "spitter") ctx.fillRect(enemy.x - 4, enemy.y + 4, 8, 6);
    }
    const barW = enemy.kind === "boss" ? 42 : 26;
    ctx.fillStyle = "#351419";
    ctx.fillRect(enemy.x - barW / 2, enemy.y - (enemy.kind === "boss" ? 29 : 20), barW, 4);
    ctx.fillStyle = "#ff4d6d";
    ctx.fillRect(enemy.x - barW / 2, enemy.y - (enemy.kind === "boss" ? 29 : 20), barW * (enemy.hp / enemy.maxHp), 4);
  });

  const p = game.player;
  ctx.fillStyle = "rgba(0,0,0,.5)";
  ctx.fillRect(p.x - 13, p.y + 10, 26, 6);
  if (p.invuln <= 0 || Math.floor(game.elapsed * 18) % 2 === 0) {
    ctx.fillStyle = "#e9e2c7";
    ctx.fillRect(p.x - 10, p.y - 13, 20, 25);
    ctx.fillStyle = "#17201e";
    ctx.fillRect(p.x - 7, p.y - 8, 5, 5);
    ctx.fillRect(p.x + 2, p.y - 8, 5, 5);
    ctx.fillStyle = "#f4d35e";
    ctx.fillRect(p.x - 11, p.y + 5, 22, 7);
  }
  ctx.strokeStyle = "#f4d35e";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(p.x + p.dirX * 10, p.y + p.dirY * 10);
  ctx.lineTo(p.x + p.dirX * 22, p.y + p.dirY * 22);
  ctx.stroke();
  if (p.attackFx > 0) {
    ctx.strokeStyle = "rgba(255,243,176,.85)";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(p.x + p.dirX * 18, p.y + p.dirY * 18, 24, -0.8, 0.8);
    ctx.stroke();
  }

  const activePylonCount = game.pylons.filter((pylon) => pylon.active).length;
  const boss = game.enemies.find((enemy) => enemy.kind === "boss");
  if (boss && activePylonCount < game.pylons.length) {
    ctx.strokeStyle = "rgba(255,77,109,.72)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, 29 + Math.sin(game.elapsed * 5) * 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Context prompt.
  let prompt = "";
  if (game.pylons.some((x) => !x.active && dist(x, p) < 42)) prompt = "[F] JACK IN";
  else if (game.chests.some((x) => !x.open && dist(x, p) < 42)) prompt = "[F] CRACK CACHE";
  else if (gateOpen && Math.hypot(p.x - 22.5 * TILE, p.y - 14.5 * TILE) < 44) prompt = "[F] EXIT FLOOR";
  if (prompt) drawPixelText(ctx, prompt, p.x, p.y - 31, "#fff3b0", "center");

  if (game.screen === "paused") {
    ctx.fillStyle = "rgba(4,6,6,.76)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawPixelText(ctx, "TRANSMISSION PAUSED", WIDTH / 2, HEIGHT / 2, "#f4d35e", "center");
  }
}

function drawEnemySprite(ctx: CanvasRenderingContext2D, enemy: Enemy, time: number, player: Game["player"], highContrastTelegraphs = false) {
  if (enemy.kind === "burrower" && (enemy.burrowPhase === "underground" || enemy.burrowPhase === "erupting")) return;
  const t = time * (enemy.kind === "skitter" ? 13 : 7) + enemy.id;
  const bob = Math.sin(t) * (enemy.kind === "boss" ? 1.2 : 1.7);
  const squash = enemy.flash > 0 ? 1.18 : 1;
  const visualScale = enemy.scale ?? 1;
  const flash = enemy.flash > 0;
  ctx.save();
  ctx.translate(Math.round(enemy.x), Math.round(enemy.y + bob));
  ctx.scale(squash * visualScale, (2 - squash) * visualScale);
  ctx.globalAlpha = enemy.recovery > 0 ? .68 : 1;
  ctx.fillStyle = "rgba(0,0,0,.5)";
  ctx.fillRect(enemy.kind === "boss" ? -22 : -14, enemy.kind === "boss" ? 19 : 12, enemy.kind === "boss" ? 44 : 28, 5);

  if (enemy.windup > 0) {
    const aim = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const pulse = .58 + Math.sin(time * 24) * .2;
    ctx.save();
    ctx.globalAlpha = highContrastTelegraphs ? 1 : pulse;
    ctx.rotate(aim);
    if (enemy.kind === "broadcaster") {
      ctx.rotate(-aim);
      ctx.strokeStyle = highContrastTelegraphs ? "#ffffff" : "#ff4d9a"; ctx.lineWidth = highContrastTelegraphs ? 5 : 3;
      for (const radius of [24, 34, 45]) { ctx.beginPath(); ctx.arc(0, 0, radius, -2.7, -.45); ctx.stroke(); }
      ctx.fillStyle = highContrastTelegraphs ? "#ffffff" : "#ff8fab";
      ctx.fillRect(-3, -29, 6, 12);
    } else if (enemy.kind === "bulwark") {
      ctx.rotate(-aim);
      ctx.strokeStyle = highContrastTelegraphs ? "#ffffff" : "#76c7dc"; ctx.lineWidth = highContrastTelegraphs ? 5 : 3;
      ctx.beginPath(); ctx.arc(0, 0, 35, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 48, -.8, .8); ctx.stroke();
    } else if (enemy.kind === "volatile") {
      ctx.rotate(-aim);
      ctx.strokeStyle = highContrastTelegraphs ? "#ffffff" : "#ff4d6d"; ctx.lineWidth = highContrastTelegraphs ? 6 : 4;
      ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = highContrastTelegraphs ? "rgba(255,77,109,.38)" : "rgba(255,77,109,.12)";
      ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.fill();
    } else if (enemy.kind === "spitter") {
      ctx.strokeStyle = highContrastTelegraphs ? "#ffffff" : "#a78bfa"; ctx.lineWidth = highContrastTelegraphs ? 5 : 3; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(Math.min(220, Math.hypot(player.x - enemy.x, player.y - enemy.y)), 0); ctx.stroke();
    } else {
      const reach = enemy.kind === "boss" ? 50 : enemy.kind === "mimic" ? 42 : 36;
      ctx.fillStyle = highContrastTelegraphs ? "rgba(255,255,255,.34)" : enemy.kind === "boss" ? "rgba(255,77,109,.22)" : "rgba(244,211,94,.2)";
      ctx.beginPath(); ctx.moveTo(5, 0); ctx.arc(0, 0, reach, -.48, .48); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = highContrastTelegraphs ? "#ffffff" : enemy.kind === "boss" ? "#ff4d6d" : "#f4d35e"; ctx.lineWidth = highContrastTelegraphs ? 4 : 2; ctx.stroke();
    }
    ctx.restore();
  }

  if (enemy.kind === "skitter") {
    const step = Math.sin(t) * 4;
    ctx.strokeStyle = flash ? "#fff" : "#315b38";
    ctx.lineWidth = 3;
    for (let side = -1; side <= 1; side += 2) {
      [-7, 0, 7].forEach((offset, index) => {
        ctx.beginPath();
        ctx.moveTo(side * 8, offset);
        ctx.lineTo(side * (14 + index * 2), offset + (index - 1) * 5 + step * side * (index % 2 ? -1 : 1));
        ctx.lineTo(side * (18 + index), offset + (index - 1) * 7);
        ctx.stroke();
      });
    }
    ctx.strokeStyle = flash ? "#fff" : "#7ddf64";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-5, -12); ctx.lineTo(-11, -20); ctx.lineTo(-15, -19); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5, -12); ctx.lineTo(11, -20); ctx.lineTo(15, -19); ctx.stroke();
    ctx.fillStyle = flash ? "#fff" : "#325d37";
    ctx.fillRect(-12, -3, 24, 15);
    ctx.fillStyle = flash ? "#fff" : "#4f9a4a";
    ctx.fillRect(-10, -7, 20, 13);
    ctx.fillStyle = flash ? "#fff" : "#8bea72";
    ctx.fillRect(-8, -14, 16, 11);
    ctx.fillRect(-11, -9, 5, 8);
    ctx.fillRect(6, -9, 5, 8);
    ctx.fillStyle = "#182018";
    ctx.fillRect(-6, -11, 4, 4); ctx.fillRect(2, -11, 4, 4);
    ctx.fillStyle = "#f4d35e";
    ctx.fillRect(-5, -10, 2, 2); ctx.fillRect(3, -10, 2, 2);
    ctx.fillStyle = "#b8ff9f";
    ctx.fillRect(-9, 0, 18, 3);
    ctx.fillStyle = "#203f28";
    ctx.fillRect(-2, -6, 4, 17);
    ctx.fillRect(-7, 7, 14, 3);
  } else if (enemy.kind === "spitter") {
    const tentacle = Math.sin(t) * 3;
    ctx.strokeStyle = flash ? "#fff" : "#60458f";
    ctx.lineWidth = 4;
    [-10, -4, 4, 10].forEach((offset, index) => {
      ctx.beginPath(); ctx.moveTo(offset, 7); ctx.lineTo(offset + (index < 2 ? -4 : 4), 15 + tentacle * (index % 2 ? -1 : 1)); ctx.lineTo(offset + (index < 2 ? -8 : 8), 18); ctx.stroke();
    });
    ctx.fillStyle = flash ? "#fff" : "#654aa0";
    ctx.fillRect(-13, -7, 26, 16);
    ctx.fillStyle = flash ? "#fff" : "#a78bfa";
    ctx.fillRect(-10, -14, 20, 21);
    ctx.fillRect(-13, -8, 26, 10);
    ctx.fillStyle = "#dcd3ff";
    ctx.fillRect(-7, -10, 14, 7);
    ctx.fillStyle = "#24173a";
    ctx.fillRect(-4, -9, 8, 6);
    ctx.fillStyle = "#ff4d9a";
    ctx.fillRect(-2, -8, 4, 4);
    ctx.fillStyle = flash ? "#fff" : "#493270";
    ctx.fillRect(-7, 1, 14, 8);
    ctx.fillStyle = "#181020";
    ctx.fillRect(-4, 3, 8, 5);
    ctx.fillStyle = "#ff8fab";
    ctx.fillRect(-2, 7, 4, 5 + Math.max(0, Math.sin(t)) * 3);
    ctx.fillStyle = "#d8ccff";
    ctx.fillRect(-13, -2, 4, 3); ctx.fillRect(9, -2, 4, 3);
  } else if (enemy.kind === "warden") {
    const arm = Math.sin(t) * 2;
    ctx.fillStyle = flash ? "#fff" : "#512416";
    ctx.fillRect(-20, -7 + arm, 8, 24); ctx.fillRect(12, -7 - arm, 8, 24);
    ctx.fillStyle = flash ? "#fff" : "#a43e17";
    ctx.fillRect(-17, -12, 9, 11); ctx.fillRect(8, -12, 9, 11);
    ctx.fillStyle = flash ? "#fff" : "#e65d18";
    ctx.fillRect(-13, -10, 26, 27);
    ctx.fillStyle = "#ff9d3d";
    ctx.fillRect(-10, -17, 20, 13);
    ctx.fillStyle = "#4a1d0d";
    ctx.fillRect(-14, -21, 6, 10); ctx.fillRect(8, -21, 6, 10);
    ctx.fillRect(-8, -13, 16, 5);
    ctx.fillStyle = "#ffd06e";
    ctx.fillRect(-6, -11, 4, 3); ctx.fillRect(2, -11, 4, 3);
    ctx.fillStyle = "#6e2d13";
    ctx.fillRect(-9, -1, 18, 12);
    ctx.fillStyle = "#f4d35e";
    ctx.fillRect(-11, 2, 22, 4); ctx.fillRect(-3, 6, 6, 10);
    ctx.fillStyle = "#37251e";
    ctx.fillRect(16, -3 - arm, 6, 24); ctx.fillRect(12, 13 - arm, 14, 7);
    ctx.fillStyle = "#7c8b85";
    ctx.fillRect(-24, -5 + arm, 8, 24); ctx.fillRect(-27, 1 + arm, 14, 12);
  } else if (enemy.kind === "healer") {
    const orbit = time * 2.4;
    ctx.strokeStyle = flash ? "#fff" : "rgba(52,211,153,.55)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 19 + Math.sin(t) * 2, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 2; i++) {
      const angle = orbit + i * Math.PI;
      ctx.fillStyle = flash ? "#fff" : "#8fffd0";
      ctx.fillRect(Math.cos(angle) * 18 - 3, Math.sin(angle) * 10 - 3, 6, 6);
    }
    ctx.fillStyle = flash ? "#fff" : "#176a51";
    ctx.fillRect(-13, -7, 26, 20);
    ctx.fillStyle = flash ? "#fff" : "#34d399";
    ctx.fillRect(-10, -16, 20, 22);
    ctx.fillRect(-14, -10, 5, 13); ctx.fillRect(9, -10, 5, 13);
    ctx.fillStyle = "#d5fff0";
    ctx.fillRect(-7, -13, 14, 8);
    ctx.fillStyle = "#092b20";
    ctx.fillRect(-5, -11, 10, 5);
    ctx.fillStyle = "#76c7dc";
    ctx.fillRect(-3, -10, 6, 3);
    ctx.fillStyle = "#eafff7";
    ctx.fillRect(-3, -2, 6, 15); ctx.fillRect(-8, 3, 16, 6);
    ctx.fillStyle = "#1a4a3a";
    ctx.fillRect(-6, 11, 12, 5);
    ctx.fillStyle = "#f4d35e";
    ctx.fillRect(-2, -21, 4, 6); ctx.fillRect(1, -22, 6, 3);
  } else if (enemy.kind === "broadcaster") {
    const signal = Math.sin(t * 1.3) > 0;
    ctx.fillStyle = flash ? "#fff" : "#35152c";
    ctx.fillRect(-14, -10, 28, 27); ctx.fillRect(-10, 16, 7, 6); ctx.fillRect(3, 16, 7, 6);
    ctx.fillStyle = flash ? "#fff" : "#a82f78";
    ctx.fillRect(-11, -15, 22, 25);
    ctx.fillStyle = "#ff8fab";
    ctx.fillRect(-7, -9, 14, 5); ctx.fillRect(-8, 1, 16, 3);
    ctx.fillStyle = "#160b13";
    ctx.fillRect(-5, -8, 10, 4);
    ctx.strokeStyle = flash ? "#fff" : "#f4d35e"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(0, -27); ctx.lineTo(8, -33); ctx.stroke();
    ctx.fillStyle = signal ? "#fff3b0" : "#ff4d9a"; ctx.fillRect(6, -35, 6, 6);
  } else if (enemy.kind === "bulwark") {
    const hover = Math.sin(t) * 2;
    ctx.strokeStyle = flash ? "#fff" : "#76c7dc"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, -2, 17, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = flash ? "#fff" : "#295b68";
    ctx.fillRect(-15, -10, 30, 20); ctx.fillRect(-21, -5, 7, 12); ctx.fillRect(14, -5, 7, 12);
    ctx.fillStyle = flash ? "#fff" : "#76c7dc";
    ctx.fillRect(-10, -14, 20, 8); ctx.fillRect(-5, -3, 10, 7);
    ctx.fillStyle = "#d9f7ff"; ctx.fillRect(-3, -1, 6, 3);
    ctx.fillStyle = "#16333a"; ctx.fillRect(-10, 12 + hover, 7, 5); ctx.fillRect(3, 12 - hover, 7, 5);
  } else if (enemy.kind === "burrower") {
    const drill = Math.floor(time * 14) % 2;
    ctx.fillStyle = flash ? "#fff" : "#713019";
    ctx.fillRect(-15, -9, 27, 22); ctx.fillRect(-10, 12, 7, 7); ctx.fillRect(3, 12, 7, 7);
    ctx.fillStyle = flash ? "#fff" : "#c65321";
    ctx.fillRect(-11, -14, 22, 25);
    ctx.fillStyle = "#ffad42"; ctx.fillRect(-8, -10, 16, 5);
    ctx.fillStyle = "#2b1810"; ctx.fillRect(-5, -8, 10, 4);
    ctx.fillStyle = drill ? "#dce7e4" : "#87938f";
    ctx.beginPath(); ctx.moveTo(11, -10); ctx.lineTo(27, 0); ctx.lineTo(11, 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ff4d6d"; ctx.fillRect(-3, -7, 6, 3);
  } else if (enemy.kind === "ninja") {
    const scarf = Math.sin(t) * 4;
    ctx.fillStyle = flash ? "#fff" : "#130f20";
    ctx.fillRect(-10, 9, 8, 10); ctx.fillRect(3, 9, 8, 10);
    ctx.fillStyle = flash ? "#fff" : "#3b2763";
    ctx.fillRect(-13, -9, 26, 24); ctx.fillRect(-16, -4, 6, 17); ctx.fillRect(10, -4, 6, 17);
    ctx.fillStyle = flash ? "#fff" : "#211638";
    ctx.beginPath(); ctx.moveTo(-15, -11); ctx.lineTo(0, -25); ctx.lineTo(15, -11); ctx.lineTo(11, 2); ctx.lineTo(-11, 2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#d8ccff"; ctx.fillRect(-9, -10, 18, 7);
    ctx.fillStyle = "#111018"; ctx.fillRect(-7, -9, 5, 4); ctx.fillRect(3, -9, 5, 4);
    ctx.fillStyle = "#ff4d9a"; ctx.fillRect(-5, -8, 3, 2); ctx.fillRect(4, -8, 3, 2);
    ctx.fillStyle = "#a78bfa"; ctx.fillRect(10, -1, 18 + scarf, 5); ctx.fillRect(18 + scarf, 3, 13, 4);
    ctx.save(); ctx.rotate(-.7); ctx.fillStyle = "#dce7e4"; ctx.fillRect(12, -2, 20, 3); ctx.fillStyle = "#f4d35e"; ctx.fillRect(8, -4, 6, 7); ctx.restore();
  } else if (enemy.kind === "mimic") {
    const jaw = 5 + Math.abs(Math.sin(t)) * 6;
    const foot = Math.sin(t) * 3;
    ctx.fillStyle = flash ? "#fff" : "#5d3719";
    ctx.fillRect(-13, 10, 7, 8 + foot); ctx.fillRect(6, 10, 7, 8 - foot);
    ctx.fillStyle = flash ? "#fff" : "#8a521f";
    ctx.fillRect(-17, -1, 34, 17);
    ctx.fillStyle = "#2a0d0d";
    ctx.fillRect(-14, 2, 28, jaw + 5);
    ctx.fillStyle = "#fff3b0";
    for (let tooth = -11; tooth <= 8; tooth += 6) { ctx.fillRect(tooth, 2, 4, 5); ctx.fillRect(tooth + 3, 7 + jaw, 4, 4); }
    ctx.fillStyle = "#ff4d6d";
    ctx.fillRect(-5, 8, 10, 8 + jaw);
    ctx.fillStyle = flash ? "#fff" : "#b7791f";
    ctx.fillRect(-16, -15, 32, 15);
    ctx.fillStyle = "#f4d35e";
    ctx.fillRect(-14, -13, 28, 5); ctx.fillRect(-3, -16, 6, 11);
    ctx.fillStyle = "#3a1711";
    ctx.fillRect(-10, -7, 7, 5); ctx.fillRect(3, -7, 7, 5);
    ctx.fillStyle = "#ff8fab";
    ctx.fillRect(-8, -6, 3, 3); ctx.fillRect(5, -6, 3, 3);
    ctx.fillStyle = "#d69b39";
    ctx.fillRect(-20, -3, 5, 14); ctx.fillRect(15, -3, 5, 14);
  } else if (enemy.kind === "volatile") {
    const pulse = 1 + Math.sin(t * 1.6) * .09;
    ctx.scale(pulse, pulse);
    ctx.fillStyle = flash ? "#fff" : "#7a2619";
    ctx.fillRect(-10, 8, 7, 8); ctx.fillRect(3, 8, 7, 8);
    ctx.fillStyle = flash ? "#fff" : "#ff6b35";
    ctx.fillRect(-13, -10, 26, 22);
    ctx.fillRect(-10, -14, 20, 30);
    ctx.fillStyle = "#ffad42";
    ctx.fillRect(-9, -9, 18, 5); ctx.fillRect(-9, 4, 18, 5);
    ctx.fillStyle = "#35110b";
    ctx.fillRect(-7, -3, 5, 5); ctx.fillRect(3, -3, 5, 5);
    ctx.fillRect(-3, 8, 6, 5);
    ctx.fillStyle = "#fff3b0";
    ctx.fillRect(-1, -12, 3, 7); ctx.fillRect(3, -9, 5, 3);
    ctx.strokeStyle = "#35110b"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-7, 2); ctx.lineTo(-2, 5); ctx.lineTo(2, 0); ctx.lineTo(7, 3); ctx.stroke();
    ctx.strokeStyle = "#f4d35e"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(5, -13); ctx.lineTo(10, -20); ctx.lineTo(14, -18); ctx.stroke();
    ctx.fillStyle = Math.sin(t * 3) > 0 ? "#fff3b0" : "#ff4d6d";
    ctx.fillRect(12, -21, 5, 5);
    ctx.strokeStyle = "#ff4d6d";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 19 + Math.sin(t * 2) * 3, 0, Math.PI * 2); ctx.stroke();
  } else if (enemy.variant === "ninja") {
    const pulse = 1 + Math.sin(t) * .04;
    ctx.scale(pulse, pulse);
    const scarf = Math.sin(t * .7) * 5;
    ctx.fillStyle = flash ? "#fff" : "#120b20";
    ctx.fillRect(-17, 16, 12, 15); ctx.fillRect(6, 16, 12, 15);
    ctx.fillStyle = flash ? "#fff" : "#3b2763";
    ctx.fillRect(-25, -8, 50, 36); ctx.fillRect(-34, -2, 12, 30); ctx.fillRect(22, -2, 12, 30);
    ctx.fillStyle = flash ? "#fff" : "#211638";
    ctx.beginPath(); ctx.moveTo(-25, -15); ctx.lineTo(0, -38); ctx.lineTo(25, -15); ctx.lineTo(20, 4); ctx.lineTo(-20, 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#d8ccff"; ctx.fillRect(-16, -18, 32, 11);
    ctx.fillStyle = "#111018"; ctx.fillRect(-13, -16, 10, 6); ctx.fillRect(4, -16, 10, 6);
    ctx.fillStyle = "#ff4d9a"; ctx.fillRect(-9, -14, 5, 3); ctx.fillRect(7, -14, 5, 3);
    ctx.fillStyle = "#a78bfa"; ctx.fillRect(20, -3, 30 + scarf, 7); ctx.fillRect(39 + scarf, 4, 20, 6);
    ctx.strokeStyle = "#f4d35e"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-31, 18); ctx.lineTo(-45, -14); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(31, 18); ctx.lineTo(45, -14); ctx.stroke();
    ctx.fillStyle = "#dce7e4"; ctx.fillRect(-49, -17, 12, 6); ctx.fillRect(37, -17, 12, 6);
  } else {
    const pulse = 1 + Math.sin(t) * .06;
    ctx.scale(pulse, pulse);
    const fist = Math.sin(t * .7) * 4;
    ctx.strokeStyle = flash ? "#fff" : "#f4d35e"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-10, -24); ctx.lineTo(-16, -33); ctx.lineTo(-20, -31); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, -24); ctx.lineTo(16, -33); ctx.lineTo(20, -31); ctx.stroke();
    ctx.fillStyle = flash ? "#fff" : "#741b35";
    ctx.fillRect(-31, -9 + fist, 12, 34); ctx.fillRect(19, -9 - fist, 12, 34);
    ctx.fillStyle = flash ? "#fff" : "#ff4d6d";
    ctx.fillRect(-21, -5, 42, 31);
    ctx.fillStyle = "#8f1f3b";
    ctx.fillRect(-25, -12, 12, 16); ctx.fillRect(13, -12, 12, 16);
    ctx.fillStyle = flash ? "#fff" : "#353d3b";
    ctx.fillRect(-19, -25, 38, 23);
    ctx.fillStyle = "#18211e";
    ctx.fillRect(-15, -21, 30, 15);
    ctx.fillStyle = "#76c7dc";
    ctx.fillRect(-11, -17, 7, 6); ctx.fillRect(4, -17, 7, 6);
    ctx.fillStyle = "#ff4d6d";
    ctx.fillRect(-9, -15, 3, 3); ctx.fillRect(6, -15, 3, 3);
    ctx.fillStyle = "#f4d35e";
    ctx.fillRect(-16, -2, 32, 5); ctx.fillRect(-5, 3, 10, 13);
    ctx.fillStyle = "#1b070d";
    ctx.fillRect(-11, 18, 8, 10); ctx.fillRect(3, 18, 8, 10);
    ctx.fillStyle = "#fff3b0";
    ctx.fillRect(-27, 18 + fist, 7, 7); ctx.fillRect(20, 18 - fist, 7, 7);
  }
  if (enemy.recovery > 0) {
    ctx.fillStyle = "#9aaba4";
    ctx.fillRect(-9, enemy.kind === "boss" ? 32 : 22, 5, 3);
    ctx.fillRect(-2, enemy.kind === "boss" ? 32 : 22, 5, 3);
    ctx.fillRect(5, enemy.kind === "boss" ? 32 : 22, 5, 3);
  }
  ctx.restore();

  const barW = enemy.kind === "boss" ? 46 : 28 * visualScale;
  const barY = enemy.y - (enemy.kind === "boss" ? 34 : 24 * visualScale);
  ctx.fillStyle = "#351419";
  ctx.fillRect(enemy.x - barW / 2, barY, barW, 4);
  ctx.fillStyle = "#ff4d6d";
  ctx.fillRect(enemy.x - barW / 2, barY, barW * (enemy.hp / enemy.maxHp), 4);
}

function drawWeaponModel(ctx: CanvasRenderingContext2D, weaponId: WeaponId, time = 0) {
  const glint = Math.sin(time * 8) > .65;
  ctx.fillStyle = "#51371f";
  ctx.fillRect(6, -3, 11, 6);
  ctx.fillStyle = "#f4d35e";
  ctx.fillRect(14, -5, 5, 10);

  if (weaponId === "cleaver") {
    ctx.fillStyle = "#8b9a94"; ctx.fillRect(18, -5, 8, 10);
    ctx.fillStyle = "#dce7e4";
    ctx.beginPath(); ctx.moveTo(24, -10); ctx.lineTo(48, -8); ctx.lineTo(53, -2); ctx.lineTo(47, 9); ctx.lineTo(24, 7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#5d6d67"; ctx.fillRect(25, 4, 23, 3); ctx.fillRect(43, -7, 6, 4);
    ctx.fillStyle = glint ? "#fff" : "#f4d35e"; ctx.fillRect(30, -6, 13, 2);
  } else if (weaponId === "spear") {
    ctx.fillStyle = "#9a7650"; ctx.fillRect(17, -2, 43, 4);
    ctx.fillStyle = "#65756f"; ctx.fillRect(27, -4, 4, 8); ctx.fillRect(43, -4, 4, 8);
    ctx.fillStyle = "#dce7e4";
    ctx.beginPath(); ctx.moveTo(58, -8); ctx.lineTo(74, 0); ctx.lineTo(58, 8); ctx.lineTo(62, 2); ctx.lineTo(54, 0); ctx.lineTo(62, -2); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#76c7dc"; ctx.fillRect(62, -2, 8, 4);
    ctx.fillStyle = glint ? "#fff" : "#76c7dc"; ctx.fillRect(68, -5, 3, 3); ctx.fillRect(68, 3, 3, 3);
  } else if (weaponId === "hammer") {
    ctx.fillStyle = "#7b5a35"; ctx.fillRect(17, -3, 28, 6);
    ctx.fillStyle = "#303936"; ctx.fillRect(36, -15, 22, 30);
    ctx.fillStyle = "#687a73"; ctx.fillRect(39, -12, 16, 24);
    ctx.fillStyle = "#17201d"; ctx.fillRect(42, -8, 10, 9);
    ctx.fillStyle = glint ? "#fff3b0" : "#ff4d6d"; ctx.fillRect(44, -6, 6, 5);
    ctx.fillStyle = "#f4d35e"; ctx.fillRect(42, 5, 10, 3);
    ctx.fillStyle = "#9caaa5"; ctx.fillRect(32, -12, 4, 24); ctx.fillRect(58, -10, 5, 20);
  } else if (weaponId === "twin-knives") {
    ctx.fillStyle = "#ff8fab"; ctx.fillRect(16, -9, 5, 6); ctx.fillRect(16, 3, 5, 6);
    ctx.fillStyle = "#dce7e4";
    ctx.beginPath(); ctx.moveTo(20, -10); ctx.lineTo(45, -8); ctx.lineTo(52, -3); ctx.lineTo(20, -4); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(20, 4); ctx.lineTo(52, 3); ctx.lineTo(45, 8); ctx.lineTo(20, 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#8a5c78"; ctx.fillRect(28, -7, 12, 2); ctx.fillRect(28, 5, 12, 2);
    ctx.fillStyle = glint ? "#fff" : "#ff8fab"; ctx.fillRect(44, -6, 5, 2); ctx.fillRect(44, 4, 5, 2);
  } else if (weaponId === "shock-baton") {
    ctx.fillStyle = "#243b40"; ctx.fillRect(17, -5, 34, 10);
    ctx.fillStyle = "#76c7dc"; ctx.fillRect(20, -3, 8, 6); ctx.fillRect(33, -3, 7, 6); ctx.fillRect(45, -4, 8, 8);
    ctx.fillStyle = "#d9f7ff"; ctx.fillRect(23, -2, 3, 4); ctx.fillRect(35, -2, 3, 4);
    ctx.fillStyle = glint ? "#fff" : "#76c7dc";
    ctx.fillRect(52, -9, 4, 7); ctx.fillRect(52, 2, 4, 7); ctx.fillRect(57, -3, 5, 6);
  } else {
    ctx.fillStyle = "#384743"; ctx.fillRect(15, -9, 38, 18);
    ctx.fillStyle = "#687a73"; ctx.fillRect(19, -7, 30, 12);
    ctx.fillStyle = "#1a211f"; ctx.fillRect(47, -5, 14, 10); ctx.fillRect(25, 8, 9, 10);
    ctx.fillStyle = "#ff8a3d"; ctx.fillRect(22, -4, 17, 5);
    ctx.fillStyle = "#f4d35e"; ctx.fillRect(25, -3, 10, 2);
    ctx.fillStyle = "#a43e17"; ctx.fillRect(34, 5, 10, 7);
    ctx.fillStyle = glint ? "#fff3b0" : "#ff4d6d"; ctx.fillRect(55, -3, 7, 6);
  }
}

function drawRangedPlayerSprite(ctx: CanvasRenderingContext2D, game: Game) {
  const p = game.player;
  const mage = p.classId === "mage";
  const stride = p.moving ? Math.sin(game.elapsed * 13) : 0;
  const bob = p.moving ? -Math.abs(stride) * 2 : Math.sin(game.elapsed * 3) * .5;
  const angle = Math.atan2(p.dirY, p.dirX);
  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y + bob));
  ctx.fillStyle = "rgba(0,0,0,.55)"; ctx.fillRect(-14, 13 - bob, 28, 6);
  if (p.invuln <= 0 || Math.floor(game.elapsed * 20) % 2 === 0) {
    ctx.fillStyle = mage ? "#281b46" : "#234334";
    ctx.fillRect(-9, 6 + stride * 2, 7, 11); ctx.fillRect(2, 6 - stride * 2, 7, 11);
    ctx.fillStyle = mage ? "#60458f" : "#315b38";
    ctx.fillRect(-11, -8, 22, 22);
    ctx.fillStyle = mage ? "#a78bfa" : "#34d399";
    ctx.fillRect(-8, -6, 5, 14); ctx.fillRect(-12, 5, 24, 4);
    ctx.fillStyle = "#efc39f"; ctx.fillRect(-8, -18, 16, 12);
    ctx.fillStyle = mage ? "#dcd3ff" : "#79502f";
    if (mage) { ctx.fillRect(-11, -23, 22, 7); ctx.fillRect(-7, -28, 14, 5); }
    else { ctx.fillRect(-10, -20, 20, 5); ctx.fillRect(-10, -16, 5, 5); }
    ctx.fillStyle = "#17201e"; ctx.fillRect(p.dirX >= 0 ? 2 : -5, -14, 3, 3);
  }
  ctx.rotate(angle);
  if (mage) {
    ctx.strokeStyle = "#795ab9"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(4, 9); ctx.lineTo(28, -9); ctx.stroke();
    ctx.fillStyle = "#dcd3ff"; ctx.fillRect(25, -13, 8, 8);
    ctx.strokeStyle = `rgba(167,139,250,${.55 + Math.sin(game.elapsed * 9) * .25})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(29, -9, 8, 0, Math.PI * 2); ctx.stroke();
  } else {
    ctx.strokeStyle = "#d6b06a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(18, 0, 20, -1.2, 1.2); ctx.stroke();
    ctx.strokeStyle = "#d8ffe9"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(25, -19); ctx.lineTo(25, 19); ctx.stroke();
    ctx.fillStyle = "#f4d35e"; ctx.fillRect(-17, -10, 6, 25);
  }
  ctx.restore();
  if (p.heavyFx > 0) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.strokeStyle = mage ? `rgba(167,139,250,${p.heavyFx})` : `rgba(52,211,153,${p.heavyFx})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.dirX * (mage ? 95 : 28), p.dirY * (mage ? 95 : 28), mage ? 64 * (1 - p.heavyFx * .35) : 22, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
}

function drawPlayerSprite(ctx: CanvasRenderingContext2D, game: Game, shakeScale = 1) {
  const p = game.player;
  if (p.classId !== "knight") { drawRangedPlayerSprite(ctx, game); return; }
  const weapon = getWeapon(p.weaponId);
  const stride = p.moving ? Math.sin(game.elapsed * 13) : 0;
  const bob = p.moving ? Math.abs(stride) * -2 : Math.sin(game.elapsed * 3) * .5;
  const facingAngle = Math.atan2(p.dirY, p.dirX);
  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y + bob));
  if (game.shake > 0 && shakeScale > 0) ctx.rotate(Math.sin(game.elapsed * 80) * .035 * shakeScale);
  if (p.furyTime > 0) {
    ctx.strokeStyle = `rgba(255,77,109,${.45 + Math.sin(game.elapsed * 10) * .2})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 22 + Math.sin(game.elapsed * 8) * 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(-14, 13 - bob, 28, 6);

  if (p.invuln <= 0 || Math.floor(game.elapsed * 20) % 2 === 0) {
    // Animated boots and trailing scarf.
    ctx.fillStyle = "#392b28";
    ctx.fillRect(-9, 7 + stride * 2, 7, 10);
    ctx.fillRect(2, 7 - stride * 2, 7, 10);
    ctx.fillStyle = "#ff4d6d";
    ctx.fillRect(-16 - p.dirX * 4, -3 - p.dirY * 4 + stride, 13, 6);
    ctx.fillRect(-20 - p.dirX * 5, 1 - p.dirY * 5 - stride, 8, 5);
    // Coat and belt.
    ctx.fillStyle = "#3b82a0";
    ctx.fillRect(-10, -8, 20, 22);
    ctx.fillStyle = "#76c7dc";
    ctx.fillRect(-7, -6, 5, 14);
    ctx.fillStyle = "#f4d35e";
    ctx.fillRect(-11, 5, 22, 5);
    ctx.fillStyle = "#513b20";
    ctx.fillRect(-2, 5, 5, 5);
    // Head, hair, and expressive eyes.
    ctx.fillStyle = "#f0c7a5";
    ctx.fillRect(-9, -18, 18, 13);
    ctx.fillStyle = "#6b3f2b";
    ctx.fillRect(-10, -20, 20, 6);
    ctx.fillRect(-10, -16, 5, 5);
    ctx.fillStyle = "#17201e";
    if (Math.abs(p.dirX) >= Math.abs(p.dirY)) {
      const eyeX = p.dirX > 0 ? 3 : -6;
      ctx.fillRect(eyeX, -13, 3, 3);
      ctx.fillRect(eyeX + (p.dirX > 0 ? 4 : -4), -13, 3, 3);
    } else {
      ctx.fillRect(-5, -13, 3, 3);
      ctx.fillRect(3, -13, 3, 3);
    }
    ctx.fillStyle = "#8b4d3b";
    ctx.fillRect(-3, -8, 6, 2);
  }

  // Every weapon has its own silhouette and attack motion.
  const attackFxDuration = p.weaponId === "hammer" ? .3 : p.weaponId === "spear" ? .24 : .2;
  const swingProgress = p.attackFx > 0
    ? Math.max(0, Math.min(1, 1 - p.attackFx / attackFxDuration))
    : 1;
  const swingAngle = p.attackFx > 0 ? facingAngle - weapon.arcRadians * .65 + swingProgress * weapon.arcRadians * 1.3 : facingAngle + .18;
  ctx.rotate(swingAngle);
  drawWeaponModel(ctx, p.weaponId, game.elapsed);
  ctx.restore();

  if (p.attackFx > 0) {
    const alpha = Math.min(1, p.attackFx * 6);
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(facingAngle);
    if (p.weaponId === "hammer") {
      ctx.fillStyle = `rgba(244,211,94,${alpha * .25})`;
      ctx.beginPath(); ctx.arc(48, 0, 30 * swingProgress, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(255,243,176,${alpha})`; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(48, 0, 12 + 26 * swingProgress, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(220,231,228,${alpha})`; ctx.fillRect(36, -23, 5, 5); ctx.fillRect(57, 17, 7, 4); ctx.fillRect(68, -12, 4, 7);
    } else if (p.weaponId === "spear") {
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(22, 0); ctx.lineTo(weapon.range * (.55 + swingProgress * .45), 0); ctx.stroke();
      ctx.strokeStyle = `rgba(118,199,220,${alpha})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(weapon.range * .9, 0, 5 + swingProgress * 9, 0, Math.PI * 2); ctx.stroke();
    } else if (p.weaponId === "shock-baton") {
      ctx.strokeStyle = `rgba(118,199,220,${alpha})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(22, -5); ctx.lineTo(35, 5); ctx.lineTo(45, -7); ctx.lineTo(57, 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(33, 4); ctx.lineTo(43, 11); ctx.lineTo(52, 4); ctx.stroke();
    } else if (p.weaponId === "scrap-launcher") {
      ctx.fillStyle = `rgba(255,138,61,${alpha})`;
      ctx.beginPath(); ctx.moveTo(48, 0); ctx.lineTo(65, -10); ctx.lineTo(61, 0); ctx.lineTo(65, 10); ctx.fill();
      ctx.fillStyle = `rgba(220,231,228,${alpha * .7})`; ctx.fillRect(20, -14, 7, 7); ctx.fillRect(10, -18, 5, 5);
    } else {
      ctx.strokeStyle = p.weaponId === "twin-knives" ? `rgba(255,143,171,${alpha})` : `rgba(255,243,176,${alpha})`;
      ctx.lineWidth = p.weaponId === "twin-knives" ? 3 : 6;
      ctx.beginPath(); ctx.arc(0, 0, Math.min(62, Math.max(32, weapon.range * .8)), -weapon.arcRadians / 2, weapon.arcRadians / 2); ctx.stroke();
      if (p.weaponId === "twin-knives") { ctx.beginPath(); ctx.arc(0, 0, 27, -weapon.arcRadians / 2 + .25, weapon.arcRadians / 2 - .25); ctx.stroke(); }
      if (p.weaponId === "cleaver") { ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 47, -.65, .65); ctx.stroke(); }
    }
    ctx.restore();
  }
  if (p.heavyFx > 0) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(facingAngle);
    ctx.strokeStyle = `rgba(255,243,176,${Math.min(1, p.heavyFx * 2)})`; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.arc(0, 0, Math.max(38, weapon.range), -Math.min(Math.PI, weapon.arcRadians * 1.35) / 2, Math.min(Math.PI, weapon.arcRadians * 1.35) / 2); ctx.stroke();
    ctx.restore();
  }
}

function drawMouseAim(ctx: CanvasRenderingContext2D, game: Game, showAimLine = true) {
  const player = game.player;
  const distance = Math.max(28, Math.min(220, player.aimDistance));
  const x = player.x + player.dirX * distance;
  const y = player.y + player.dirY * distance;
  const color = player.classId === "mage" ? "#a78bfa" : player.classId === "archer" ? "#34d399" : "#f4d35e";
  const pulse = 1 + Math.sin(game.elapsed * 9) * .12;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  if (showAimLine) {
    ctx.globalAlpha = .76;
    ctx.setLineDash([3, 4]);
    ctx.lineDashOffset = -game.elapsed * 18;
    ctx.beginPath();
    ctx.moveTo(player.x + player.dirX * 18, player.y + player.dirY * 18);
    ctx.lineTo(x - player.dirX * 9, y - player.dirY * 9);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = .94;
  ctx.beginPath();
  ctx.arc(x, y, 7 * pulse, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 12, y); ctx.lineTo(x - 4, y);
  ctx.moveTo(x + 4, y); ctx.lineTo(x + 12, y);
  ctx.moveTo(x, y - 12); ctx.lineTo(x, y - 4);
  ctx.moveTo(x, y + 4); ctx.lineTo(x, y + 12);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(x - 1, y - 1, 2, 2);
  ctx.restore();
}

function drawVersusPlayerHeadshot(ctx: CanvasRenderingContext2D, classId: PlayerClassId, x: number, y: number) {
  const accent = classId === "mage" ? "#a78bfa" : classId === "archer" ? "#34d399" : "#76c7dc";
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(3.1, 3.1);
  ctx.fillStyle = "rgba(0,0,0,.42)";
  ctx.fillRect(-31, 17, 62, 26);
  ctx.fillStyle = classId === "mage" ? "#281b46" : classId === "archer" ? "#234334" : "#3b82a0";
  ctx.fillRect(-28, 12, 56, 28);
  ctx.fillStyle = accent;
  ctx.fillRect(-28, 12, 9, 28); ctx.fillRect(19, 12, 9, 28);
  if (classId === "mage" || classId === "archer") {
    ctx.fillStyle = classId === "mage" ? "#60458f" : "#315b38";
    ctx.beginPath(); ctx.moveTo(-24, 2); ctx.lineTo(-17, -29); ctx.lineTo(0, -40); ctx.lineTo(17, -29); ctx.lineTo(24, 2); ctx.lineTo(17, 22); ctx.lineTo(-17, 22); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = "#efc39f";
  ctx.fillRect(-16, -23, 32, 35);
  if (classId === "knight") {
    ctx.fillStyle = "#6b3f2b";
    ctx.fillRect(-18, -31, 36, 11); ctx.fillRect(-18, -23, 8, 13);
  } else {
    ctx.fillStyle = classId === "mage" ? "#60458f" : "#315b38";
    ctx.fillRect(-18, -29, 36, 10); ctx.fillRect(-20, -23, 7, 28); ctx.fillRect(13, -23, 7, 28);
  }
  ctx.fillStyle = "#111817";
  ctx.fillRect(-11, -13, 7, 5); ctx.fillRect(5, -13, 7, 5);
  ctx.fillStyle = accent;
  ctx.fillRect(-8, -12, 3, 3); ctx.fillRect(7, -12, 3, 3);
  ctx.fillStyle = "#8b4d3b";
  ctx.fillRect(-6, 2, 13, 4);
  ctx.fillStyle = "#f4d35e";
  ctx.fillRect(-29, 23, 58, 6);
  ctx.restore();
}

function drawVersusBossHeadshot(ctx: CanvasRenderingContext2D, x: number, y: number, ninja = false) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(3.1, 3.1);
  if (ninja) {
    ctx.fillStyle = "rgba(0,0,0,.5)"; ctx.fillRect(-35, 14, 70, 30);
    ctx.fillStyle = "#3b2763"; ctx.fillRect(-34, 5, 68, 39); ctx.fillRect(-43, 14, 12, 29); ctx.fillRect(31, 14, 12, 29);
    ctx.fillStyle = "#211638";
    ctx.beginPath(); ctx.moveTo(-30, 1); ctx.lineTo(0, -43); ctx.lineTo(30, 1); ctx.lineTo(24, 24); ctx.lineTo(-24, 24); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#d8ccff"; ctx.fillRect(-22, -17, 44, 14);
    ctx.fillStyle = "#111018"; ctx.fillRect(-17, -14, 13, 8); ctx.fillRect(5, -14, 13, 8);
    ctx.fillStyle = "#ff4d9a"; ctx.fillRect(-12, -12, 6, 4); ctx.fillRect(9, -12, 6, 4);
    ctx.fillStyle = "#a78bfa"; ctx.fillRect(21, 3, 30, 8); ctx.fillRect(38, 11, 22, 7);
    ctx.fillStyle = "#f4d35e"; ctx.fillRect(-23, 21, 46, 6);
    ctx.restore();
    return;
  }
  ctx.fillStyle = "rgba(0,0,0,.5)";
  ctx.fillRect(-34, 13, 68, 31);
  ctx.fillStyle = "#741b35";
  ctx.fillRect(-34, 8, 68, 34); ctx.fillRect(-42, 14, 12, 27); ctx.fillRect(30, 14, 12, 27);
  ctx.fillStyle = "#ff4d6d";
  ctx.fillRect(-27, 5, 54, 31);
  ctx.fillStyle = "#353d3b";
  ctx.fillRect(-25, -32, 50, 40);
  ctx.fillStyle = "#18211e";
  ctx.fillRect(-19, -25, 38, 23);
  ctx.fillStyle = "#76c7dc";
  ctx.fillRect(-14, -18, 11, 8); ctx.fillRect(4, -18, 11, 8);
  ctx.fillStyle = "#ff4d6d";
  ctx.fillRect(-10, -16, 5, 4); ctx.fillRect(7, -16, 5, 4);
  ctx.fillStyle = "#f4d35e";
  ctx.fillRect(-20, 1, 40, 6); ctx.fillRect(-5, 8, 10, 24);
  ctx.strokeStyle = "#f4d35e"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-13, -32); ctx.lineTo(-21, -44); ctx.lineTo(-27, -42); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(13, -32); ctx.lineTo(21, -44); ctx.lineTo(27, -42); ctx.stroke();
  ctx.restore();
}

function drawBossVersusSplash(ctx: CanvasRenderingContext2D, game: Game) {
  const boss = game.enemies.find((enemy) => enemy.kind === "boss");
  const ninja = boss?.variant === "ninja";
  const conductor = boss?.variant === "conductor";
  const progress = 1 - game.bossIntroTime / BOSS_VERSUS_DURATION;
  const slam = 1 - Math.pow(1 - Math.min(1, progress / .28), 3);
  const fade = game.bossIntroTime < .35 ? game.bossIntroTime / .35 : 1;
  const playerX = 225 - (1 - slam) * 270;
  const bossX = 543 + (1 - slam) * 270;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.fillStyle = "#050706";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = "#102f39";
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(450, 0); ctx.lineTo(318, HEIGHT); ctx.lineTo(0, HEIGHT); ctx.closePath(); ctx.fill();
  ctx.fillStyle = conductor ? "#563f0f" : "#5c1029";
  ctx.beginPath(); ctx.moveTo(450, 0); ctx.lineTo(WIDTH, 0); ctx.lineTo(WIDTH, HEIGHT); ctx.lineTo(318, HEIGHT); ctx.closePath(); ctx.fill();
  ctx.globalAlpha = fade * .28;
  ctx.strokeStyle = "#d9f7ff"; ctx.lineWidth = 3;
  for (let y = -80; y < HEIGHT + 100; y += 32) { ctx.beginPath(); ctx.moveTo(0, y + progress * 90); ctx.lineTo(330, y - 90 + progress * 90); ctx.stroke(); }
  ctx.strokeStyle = conductor ? "#fff3b0" : "#ff8fab";
  for (let y = -80; y < HEIGHT + 100; y += 32) { ctx.beginPath(); ctx.moveTo(WIDTH, y + progress * 90); ctx.lineTo(438, y - 90 + progress * 90); ctx.stroke(); }
  ctx.globalAlpha = fade;
  drawPixelText(ctx, "FINAL ENCOUNTER // LIVE", WIDTH / 2, 38, "#fff3b0", "center");
  drawVersusPlayerHeadshot(ctx, game.player.classId, playerX, 250);
  drawVersusBossHeadshot(ctx, bossX, 250, ninja);
  ctx.fillStyle = "rgba(4,6,6,.86)";
  ctx.fillRect(117, 393, 233, 54); ctx.fillRect(418, 393, 233, 54);
  ctx.strokeStyle = "#76c7dc"; ctx.lineWidth = 3; ctx.strokeRect(117, 393, 233, 54);
  ctx.strokeStyle = "#ff4d6d"; ctx.strokeRect(418, 393, 233, 54);
  drawPixelText(ctx, "SUBJECT 404", 233, 414, "#76c7dc", "center");
  drawPixelText(ctx, PLAYER_CLASSES[game.player.classId].name.toUpperCase(), 233, 433, "#d9f7ff", "center");
  drawPixelText(ctx, ninja ? "SHADOW NETWORK" : conductor ? "STATIC NETWORK" : "CHANNEL 13", 535, 414, ninja ? "#a78bfa" : conductor ? "#f4d35e" : "#ff8fab", "center");
  drawPixelText(ctx, bossDisplayName(boss), 535, 433, "#fff3b0", "center");
  const vsScale = .84 + Math.sin(progress * Math.PI * 7) * .06;
  ctx.save();
  ctx.translate(WIDTH / 2, 258); ctx.rotate(-.08); ctx.scale(vsScale, vsScale);
  ctx.font = "italic 1000 96px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.lineJoin = "miter"; ctx.lineWidth = 15; ctx.strokeStyle = "#08090a"; ctx.strokeText("VS", 0, 0);
  ctx.lineWidth = 7; ctx.strokeStyle = "#fff3b0"; ctx.strokeText("VS", 0, 0);
  ctx.fillStyle = "#ff4d6d"; ctx.fillText("VS", 0, 0);
  ctx.restore();
  if (progress < .13) {
    ctx.globalAlpha = fade * (1 - progress / .13);
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  ctx.restore();
}

function renderGameV2(ctx: CanvasRenderingContext2D, game: Game, controlMode: ControlMode, comfort: ComfortSettings = DEFAULT_COMFORT_SETTINGS) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#050706";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const current = roomFor(game.player.x, game.player.y);
  const roomNumber = current.row * ROOM_COLS + current.col + 1;
  const roomLeft = current.col * 8 * TILE;
  const roomTop = current.row * 8 * TILE;
  const roomRight = roomLeft + 8 * TILE;
  const roomBottom = roomTop + 8 * TILE;
  const isInActiveRoom = (point: { x: number; y: number }, padding = 24) =>
    point.x >= roomLeft - padding && point.x <= roomRight + padding && point.y >= roomTop - padding && point.y <= roomBottom + padding;
  const camX = current.col * 8 * TILE + 4 * TILE;
  const camY = current.row * 8 * TILE + 4 * TILE;
  const shakeScale = comfort.screenShake === "off" ? 0 : comfort.screenShake === "low" ? .35 : 1;
  const shakeX = game.shake > 0 ? (Math.random() - .5) * 7 * shakeScale : 0;
  const shakeY = game.shake > 0 ? (Math.random() - .5) * 7 * shakeScale : 0;

  ctx.save();
  ctx.beginPath();
  ctx.rect(128, 0, 512, 512);
  ctx.clip();
  ctx.setTransform(2, 0, 0, 2, WIDTH / 2 - camX * 2 + shakeX, HEIGHT / 2 - camY * 2 + shakeY);

  // Only the active room can reach the clipped viewport. Limiting tile work here
  // avoids redrawing the other eleven rooms on every animation frame.
  const firstTileX = current.col * 8;
  const firstTileY = current.row * 8;
  const lastTileX = Math.min(MAP_W - 1, firstTileX + 8);
  const lastTileY = Math.min(MAP_H - 1, firstTileY + 8);
  for (let ty = firstTileY; ty <= lastTileY; ty++) {
    for (let tx = firstTileX; tx <= lastTileX; tx++) {
      const obstacle = !activeMazeRooms.has(mazeRoomIndexForTile(tx, ty)) && isRoomObstacleTile(tx, ty, ROOM_COLS, ROOM_ROWS);
      const wall = isWallTile(tx, ty);
      if (obstacle) {
        ctx.fillStyle = (tx + ty) % 2 ? "#101a17" : "#14201c";
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        ctx.shadowColor = "#76c7dc";
        ctx.shadowBlur = 7;
        ctx.fillStyle = "#243c37";
        ctx.fillRect(tx * TILE + 4, ty * TILE + 4, TILE - 8, TILE - 8);
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#58766c";
        ctx.fillRect(tx * TILE + 7, ty * TILE + 5, TILE - 14, 5);
        ctx.fillStyle = "#111d1a";
        ctx.fillRect(tx * TILE + 8, ty * TILE + 20, TILE - 16, 7);
        ctx.fillStyle = "#76c7dc";
        ctx.fillRect(tx * TILE + 14, ty * TILE + 12, 4, 4);
      } else if (wall) {
        ctx.fillStyle = (tx + ty) % 2 ? "#26312d" : "#303b36";
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        ctx.fillStyle = "#53645d";
        ctx.fillRect(tx * TILE + 2, ty * TILE + 2, TILE - 4, 5);
        ctx.fillStyle = "#18201d";
        ctx.fillRect(tx * TILE + 4, ty * TILE + 21, TILE - 8, 8);
        ctx.fillStyle = "#394741";
        ctx.fillRect(tx * TILE + 4, ty * TILE + 10, 11, 3);
      } else {
        ctx.fillStyle = (tx + ty) % 2 ? "#101a17" : "#14201c";
        ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
        ctx.strokeStyle = "#1d2c27";
        ctx.lineWidth = 1;
        ctx.strokeRect(tx * TILE + .5, ty * TILE + .5, TILE - 1, TILE - 1);
        ctx.fillStyle = "#284138";
        ctx.fillRect(tx * TILE + 4, ty * TILE + 5, 3, 2);
        ctx.fillRect(tx * TILE + 25, ty * TILE + 24, 3, 3);
      }
    }
  }

  // Bright threshold frames make every available passage readable at a glance.
  const currentRoomIndex = current.row * ROOM_COLS + current.col;
  const roomLocked = isRoomLocked(game, currentRoomIndex);
  const roomReleased = game.roomClearFx > 0 && game.roomClearRoomIndex === currentRoomIndex;
  const hazardTiles = game.roomKinds[currentRoomIndex] === "maze" ? [] : hazardTilesForRoom(currentRoomIndex, ROOM_COLS, ROOM_COLS * ROOM_ROWS);
  const hazardState = hazardStateAt(game.elapsed, currentRoomIndex, cursedHazardWarningReduction(game.cursedItemId));
  if (hazardState !== "dormant") {
    const active = hazardState === "active";
    const hazardPulse = .45 + Math.sin(game.elapsed * (active ? 18 : 9)) * .18;
    hazardTiles.forEach((tile) => {
      ctx.fillStyle = active ? `rgba(255,77,109,${.44 + hazardPulse * .3})` : `rgba(244,211,94,${.14 + hazardPulse * .16})`;
      ctx.fillRect(tile.x * TILE + 2, tile.y * TILE + 2, TILE - 4, TILE - 4);
      ctx.strokeStyle = active ? "#ff8fab" : "#f4d35e";
      ctx.lineWidth = active ? 3 : 2;
      ctx.strokeRect(tile.x * TILE + 4, tile.y * TILE + 4, TILE - 8, TILE - 8);
      ctx.fillStyle = active ? "#fff3b0" : "#8b6f27";
      ctx.fillRect(tile.x * TILE + 7, tile.y * TILE + 14, TILE - 14, 4);
    });
    const hazardCenterX = (hazardTiles[0]?.x ?? 0) * TILE + TILE * 1.5;
    const hazardY = (hazardTiles[0]?.y ?? 0) * TILE - 7;
    if (hazardTiles.length) drawPixelText(ctx, active ? "FLOOR SURGE" : "SURGE WARNING", hazardCenterX, hazardY, active ? "#ff8fab" : "#f4d35e", "center");
  }
  game.burrowHazards.forEach((hazard) => {
    if (!isInActiveRoom(hazard)) return;
    const pulse = .72 + Math.sin(game.elapsed * 17) * .16;
    ctx.fillStyle = `rgba(255,107,53,${Math.min(.28, hazard.life * .15)})`;
    ctx.beginPath(); ctx.arc(hazard.x, hazard.y, 34, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = comfort.highContrastTelegraphs ? "#ffffff" : `rgba(255,173,66,${pulse})`;
    ctx.lineWidth = comfort.highContrastTelegraphs ? 4 : 2;
    ctx.beginPath(); ctx.arc(hazard.x, hazard.y, 34, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = comfort.highContrastTelegraphs ? "#ffffff" : "#7a2619";
    for (let offset = -22; offset <= 22; offset += 11) ctx.fillRect(hazard.x + offset - 2, hazard.y - 3, 5, 6);
  });
  game.enemies.filter((enemy) => enemy.kind === "burrower" && enemy.burrowPhase).forEach((enemy) => {
    if (!isInActiveRoom(enemy)) return;
    const targetX = enemy.targetX ?? enemy.x;
    const targetY = enemy.targetY ?? enemy.y;
    const progress = 1 - Math.min(1, (enemy.phaseTime ?? 0) / (enemy.burrowPhase === "digging" ? .62 : enemy.burrowPhase === "erupting" ? .58 : .8));
    ctx.strokeStyle = comfort.highContrastTelegraphs ? "#ffffff" : enemy.burrowPhase === "erupting" ? "#ff4d6d" : "#ffad42";
    ctx.lineWidth = comfort.highContrastTelegraphs ? 4 : 3;
    ctx.setLineDash(enemy.burrowPhase === "underground" ? [5, 5] : []);
    ctx.beginPath(); ctx.arc(targetX, targetY, 16 + progress * 27, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = comfort.highContrastTelegraphs ? "rgba(255,255,255,.24)" : "rgba(255,77,109,.16)";
    if (enemy.burrowPhase === "erupting") { ctx.beginPath(); ctx.arc(targetX, targetY, 38, 0, Math.PI * 2); ctx.fill(); }
    if (enemy.burrowPhase === "underground") {
      ctx.fillStyle = comfort.highContrastTelegraphs ? "#ffffff" : "#ffad42";
      ctx.fillRect(enemy.x - 9, enemy.y - 3, 6, 6); ctx.fillRect(enemy.x + 2, enemy.y + 2, 8, 5);
    }
    drawPixelText(ctx, enemy.burrowPhase === "digging" ? "BURROWING" : enemy.burrowPhase === "erupting" ? "ERUPTION" : "SCRAP TRAIL", targetX, targetY - 45, comfort.highContrastTelegraphs ? "#ffffff" : "#ffad42", "center");
  });
  const doorY = roomTop + 4.5 * TILE;
  const doorX = roomLeft + 4.5 * TILE;
  const pulse = .72 + Math.sin(game.elapsed * 5) * .2;
  const activePylons = game.pylons.filter((pylon) => pylon.active).length;
  const pylonTotal = game.pylons.length;
  const westConnection = connectionFromSlot(game, currentRoomIndex, "west");
  const eastConnection = connectionFromSlot(game, currentRoomIndex, "east");
  const northConnection = connectionFromSlot(game, currentRoomIndex, "north");
  const southConnection = connectionFromSlot(game, currentRoomIndex, "south");
  const isBossEntranceLocked = (roomIndex: number) =>
    game.roomKinds[roomIndex] === "boss" && !bossGateOpen(game);
  const bossGateLabel = game.bossAwakenTime > 0 ? "POWERING BOSS" : `${activePylons}/${pylonTotal} BOSS`;
  const drawBossGate = (locked: boolean, x: number, y: number, vertical: boolean) => {
    if (!locked) return;
    ctx.save();
    ctx.shadowColor = "#ff4d6d";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#7f1d35";
    if (vertical) {
      ctx.fillRect(x - 5, y - 56, 10, 112);
      ctx.fillStyle = "#ff8fab";
      ctx.fillRect(x - 8, y - 30, 16, 8);
      ctx.fillRect(x - 8, y + 22, 16, 8);
    } else {
      ctx.fillRect(x - 56, y - 5, 112, 10);
      ctx.fillStyle = "#ff8fab";
      ctx.fillRect(x - 30, y - 8, 8, 16);
      ctx.fillRect(x + 22, y - 8, 8, 16);
    }
    ctx.restore();
  };
  ctx.save();
  ctx.shadowColor = roomLocked ? "#ff4d6d" : roomReleased ? "#34d399" : "#f4d35e";
  ctx.shadowBlur = roomReleased ? 18 : 10;
  ctx.fillStyle = roomLocked ? `rgba(255,77,109,${pulse})` : roomReleased ? `rgba(52,211,153,${pulse})` : `rgba(244,211,94,${pulse})`;
  ctx.strokeStyle = roomLocked ? "#ff8fab" : roomReleased ? "#d8ffe9" : "#fff3b0";
  ctx.lineWidth = roomReleased ? 3 : 2;
  if (westConnection) {
    const hint = routeHint(game.roomKinds[westConnection.toSlot.index]);
    const bossEntranceLocked = isBossEntranceLocked(westConnection.toSlot.index);
    ctx.fillRect(roomLeft + 2, doorY - 58, 7, 116);
    ctx.strokeRect(roomLeft + 1, doorY - 62, 13, 124);
    if (bossEntranceLocked) drawPixelText(ctx, `◀ ${bossGateLabel}`, roomLeft + 48, doorY - 12, "#ff8fab", "center");
    else {
      drawPixelText(ctx, `◀ ${hint.icon}`, roomLeft + 28, doorY + 4, hint.color, "center");
      drawPixelText(ctx, westConnection.physicallyAdjacent ? hint.label : `LINK ${hint.label}`, roomLeft + 40, doorY - 12, hint.color, "center");
    }
    drawBossGate(bossEntranceLocked, roomLeft + 4, doorY, true);
  }
  if (eastConnection) {
    const hint = routeHint(game.roomKinds[eastConnection.toSlot.index]);
    const bossEntranceLocked = isBossEntranceLocked(eastConnection.toSlot.index);
    ctx.fillRect(roomLeft + 8 * TILE - 9, doorY - 58, 7, 116);
    ctx.strokeRect(roomLeft + 8 * TILE - 14, doorY - 62, 13, 124);
    if (bossEntranceLocked) drawPixelText(ctx, `${bossGateLabel} ▶`, roomLeft + 8 * TILE - 48, doorY - 12, "#ff8fab", "center");
    else {
      drawPixelText(ctx, `${hint.icon} ▶`, roomLeft + 8 * TILE - 28, doorY + 4, hint.color, "center");
      drawPixelText(ctx, eastConnection.physicallyAdjacent ? hint.label : `LINK ${hint.label}`, roomLeft + 8 * TILE - 40, doorY - 12, hint.color, "center");
    }
    drawBossGate(bossEntranceLocked, roomLeft + 8 * TILE - 4, doorY, true);
  }
  if (northConnection) {
    const hint = routeHint(game.roomKinds[northConnection.toSlot.index]);
    const bossEntranceLocked = isBossEntranceLocked(northConnection.toSlot.index);
    ctx.fillRect(doorX - 58, roomTop + 2, 116, 7);
    ctx.strokeRect(doorX - 62, roomTop + 1, 124, 13);
    drawPixelText(ctx, bossEntranceLocked ? `▲ ${bossGateLabel}` : `▲ ${hint.icon} ${northConnection.physicallyAdjacent ? hint.label : `LINK ${hint.label}`}`, doorX, roomTop + 27, bossEntranceLocked ? "#ff8fab" : hint.color, "center");
    drawBossGate(bossEntranceLocked, doorX, roomTop + 4, false);
  }
  if (southConnection) {
    const hint = routeHint(game.roomKinds[southConnection.toSlot.index]);
    const bossEntranceLocked = isBossEntranceLocked(southConnection.toSlot.index);
    ctx.fillRect(doorX - 58, roomTop + 8 * TILE - 9, 116, 7);
    ctx.strokeRect(doorX - 62, roomTop + 8 * TILE - 14, 124, 13);
    drawPixelText(ctx, bossEntranceLocked ? `▼ ${bossGateLabel}` : `▼ ${hint.icon} ${southConnection.physicallyAdjacent ? hint.label : `LINK ${hint.label}`}`, doorX, roomTop + 8 * TILE - 20, bossEntranceLocked ? "#ff8fab" : hint.color, "center");
    drawBossGate(bossEntranceLocked, doorX, roomTop + 8 * TILE - 4, false);
  }
  ctx.restore();

  const centerX = (current.col * 8 + 4) * TILE;
  const centerY = (current.row * 8 + 4) * TILE;
  ctx.strokeStyle = "#2c4a40";
  ctx.lineWidth = 2;
  ctx.strokeRect(centerX - 46, centerY - 46, 92, 92);
  drawPixelText(ctx, `ROOM ${String(roomNumber).padStart(2, "0")} // ${game.roomKinds[currentRoomIndex].toUpperCase()}`, centerX, centerY - 51, roomLocked ? "#ff8fab" : "#5a8876", "center");
  if (roomReleased) {
    const releaseAlpha = Math.min(1, game.roomClearFx * 2.2);
    ctx.save();
    ctx.globalAlpha = releaseAlpha;
    ctx.fillStyle = "rgba(5,16,12,.88)";
    ctx.fillRect(centerX - 72, centerY - 23, 144, 43);
    ctx.strokeStyle = "#34d399";
    ctx.lineWidth = 2;
    ctx.strokeRect(centerX - 70, centerY - 21, 140, 39);
    drawPixelText(ctx, "SIGNAL SECURED", centerX, centerY - 4, "#d8ffe9", "center");
    drawPixelText(ctx, "EXITS RELEASED", centerX, centerY + 11, "#34d399", "center");
    ctx.restore();
  }

  game.secrets.forEach((secret) => {
    if (secret.roomIndex !== currentRoomIndex) return;
    const nearby = dist(secret, game.player) < 92;
    const signalPulse = .45 + Math.sin(game.elapsed * 8 + secret.roomIndex) * .25;
    ctx.save();
    ctx.translate(secret.x, secret.y);
    ctx.strokeStyle = secret.discovered ? "#f4d35e" : nearby ? "#76c7dc" : `rgba(118,199,220,${signalPulse})`;
    ctx.lineWidth = secret.discovered ? 3 : 1.5;
    ctx.shadowColor = secret.discovered ? "#f4d35e" : "#76c7dc";
    ctx.shadowBlur = secret.discovered ? 12 : nearby ? 7 : 0;
    const vertical = secret.wall === "east" || secret.wall === "west";
    ctx.beginPath();
    if (vertical) {
      ctx.moveTo(0, -13); ctx.lineTo(-4, -5); ctx.lineTo(3, 1); ctx.lineTo(-3, 7); ctx.lineTo(1, 14);
    } else {
      ctx.moveTo(-13, 0); ctx.lineTo(-5, -4); ctx.lineTo(1, 3); ctx.lineTo(7, -3); ctx.lineTo(14, 1);
    }
    ctx.stroke();
    if (secret.discovered) {
      ctx.fillStyle = "rgba(244,211,94,.22)";
      if (vertical) ctx.fillRect(-5, -17, 10, 34);
      else ctx.fillRect(-17, -5, 34, 10);
    } else if (nearby) {
      ctx.fillStyle = "#d9f7ff";
      ctx.fillRect(-2, -2, 4, 4);
    }
    ctx.restore();
    if (!secret.discovered && nearby) drawPixelText(ctx, "SIGNAL LEAK", secret.x, secret.y - 18, "#76c7dc", "center");
    if (secret.discovered) drawPixelText(ctx, "SECRET", secret.x, secret.y - 18, "#f4d35e", "center");
  });

  const safeX = SAFE_X;
  const safeY = SAFE_Y;
  ctx.fillStyle = game.safeUsed ? "#29433c" : "#34d399";
  ctx.fillRect(safeX - 20, safeY - 20, 40, 40);
  ctx.fillStyle = "#0b1713";
  ctx.fillRect(safeX - 13, safeY - 5, 26, 10);
  ctx.fillRect(safeX - 5, safeY - 13, 10, 26);

  const gateOpen = game.bossDead;
  ctx.fillStyle = gateOpen ? "#34d399" : "#ef4444";
  ctx.fillRect(EXIT_X - 13, EXIT_Y - 13, 26, 26);
  ctx.fillStyle = "#06100c";
  ctx.fillRect(EXIT_X - 6, EXIT_Y - 8, 12, 18);
  if (!gateOpen) ctx.fillRect(EXIT_X - 11, EXIT_Y - 3, 22, 5);

  game.pylons.forEach((pylon) => {
    if (!isInActiveRoom(pylon)) return;
    const wave = Math.sin(game.elapsed * 5) * 3;
    ctx.fillStyle = pylon.active ? "#f4d35e" : "#7b5c20";
    ctx.fillRect(pylon.x - 8, pylon.y - 18, 16, 36);
    ctx.fillStyle = pylon.active ? "#fff3b0" : "#312a1c";
    ctx.fillRect(pylon.x - 14, pylon.y - 22, 28, 8);
    if (pylon.active) {
      ctx.strokeStyle = "rgba(244,211,94,.38)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(pylon.x, pylon.y, 23 + wave, 0, Math.PI * 2);
      ctx.stroke();
    }
  });

  if (game.roomKinds[currentRoomIndex] === "maze" && !game.mazeSolved.has(currentRoomIndex)) {
    const goal = mazeGoalPosition(currentRoomIndex, ROOM_COLS, TILE);
    const pulse = 7 + Math.sin(game.elapsed * 6) * 2;
    ctx.save(); ctx.translate(goal.x, goal.y); ctx.rotate(Math.PI / 4);
    ctx.fillStyle = "rgba(118,199,220,.24)"; ctx.fillRect(-pulse, -pulse, pulse * 2, pulse * 2);
    ctx.fillStyle = "#76c7dc"; ctx.fillRect(-5, -5, 10, 10);
    ctx.fillStyle = "#d9f7ff"; ctx.fillRect(-2, -2, 4, 4); ctx.restore();
    drawPixelText(ctx, "ROUTE CORE", goal.x, goal.y - 16, "#76c7dc", "center");
  }

  game.chests.forEach((chest) => {
    if (!isInActiveRoom(chest)) return;
    const bounce = chest.open ? 0 : Math.sin(game.elapsed * 4) * 1.2;
    const reveal = chest.openFx > 0 ? Math.sin((.8 - chest.openFx) * 10) * chest.openFx : 0;
    if (chest.openFx > 0) {
      ctx.fillStyle = `rgba(244,211,94,${chest.openFx * .22})`;
      ctx.beginPath(); ctx.arc(chest.x, chest.y, 22 + (1 - chest.openFx) * 32, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = chest.open ? "#4a3420" : "#b7791f";
    ctx.fillRect(chest.x - 14, chest.y - 10 + bounce, 28, 20);
    ctx.fillStyle = chest.open ? "#231a12" : "#f4d35e";
    ctx.fillRect(chest.x - 2, chest.y - 3 + bounce, 5, 7);
    if (chest.open) ctx.fillRect(chest.x - 12, chest.y - 14 - reveal * 10, 24, 4);
  });

  game.groundItems.forEach((item) => {
    if (!isInActiveRoom(item)) return;
    const bob = Math.sin(game.elapsed * 5 + item.phase) * 3;
    const color = item.kind === "tonic" ? "#34d399" : item.kind === "bomb" ? "#76c7dc" : "#ff4d6d";
    ctx.fillStyle = "rgba(0,0,0,.5)";
    ctx.fillRect(item.x - 9, item.y + 10, 18, 4);
    ctx.shadowColor = color;
    ctx.shadowBlur = 9;
    ctx.fillStyle = color;
    if (item.kind === "tonic") {
      ctx.fillRect(item.x - 6, item.y - 7 + bob, 12, 15);
      ctx.fillStyle = "#e9e2c7";
      ctx.fillRect(item.x - 3, item.y - 11 + bob, 6, 5);
      ctx.fillRect(item.x - 3, item.y - 3 + bob, 6, 2);
    } else if (item.kind === "bomb") {
      ctx.beginPath();
      ctx.arc(item.x, item.y + bob, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f4d35e";
      ctx.fillRect(item.x + 4, item.y - 10 + bob, 3, 7);
      ctx.fillStyle = "#fff3b0";
      ctx.fillRect(item.x + 7, item.y - 12 + bob, 3, 3);
    } else {
      ctx.fillRect(item.x - 7, item.y - 8 + bob, 14, 16);
      ctx.fillStyle = "#fff3b0";
      ctx.fillRect(item.x - 2, item.y - 6 + bob, 4, 12);
      ctx.fillRect(item.x - 5, item.y - 1 + bob, 10, 3);
    }
    ctx.shadowBlur = 0;
    drawPixelText(ctx, item.kind === "tonic" ? "1" : item.kind === "bomb" ? "2" : "3", item.x, item.y - 18 + bob, color, "center");
  });

  game.groundCursedItems.forEach((drop) => {
    if (!isInActiveRoom(drop)) return;
    const item = getCursedItem(drop.cursedItemId);
    if (!item) return;
    const bob = Math.sin(game.elapsed * 4 + drop.phase) * 4;
    ctx.save();
    ctx.translate(drop.x, drop.y + bob);
    ctx.rotate(Math.PI / 4);
    ctx.shadowColor = "#ff4d9a";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "rgba(255,77,154,.25)";
    ctx.fillRect(-13, -13, 26, 26);
    ctx.fillStyle = "#ff4d9a";
    ctx.fillRect(-8, -8, 16, 16);
    ctx.fillStyle = "#fff3b0";
    ctx.fillRect(-3, -3, 6, 6);
    ctx.restore();
    drawPixelText(ctx, item.name.toUpperCase(), drop.x, drop.y - 25 + bob, "#ff8fab", "center");
  });

  game.groundWeapons.forEach((drop) => {
    if (!isInActiveRoom(drop)) return;
    const bob = Math.sin(game.elapsed * 4 + drop.phase) * 3;
    const weapon = getWeapon(drop.weaponId);
    const color = weapon.rarity === "rare" ? "#a78bfa" : weapon.rarity === "uncommon" ? "#76c7dc" : "#f4d35e";
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fillStyle = color;
    ctx.save();
    ctx.translate(drop.x, drop.y + bob);
    ctx.scale(.72, .72);
    ctx.rotate(-.55);
    ctx.translate(-28, 0);
    drawWeaponModel(ctx, drop.weaponId, game.elapsed + drop.phase);
    ctx.restore();
    ctx.shadowBlur = 0;
    drawPixelText(ctx, weapon.name.toUpperCase(), drop.x, drop.y - 20 + bob, color, "center");
  });

  game.projectiles.forEach((shot) => {
    if (!isInActiveRoom(shot)) return;
    if (shot.kind === "shuriken") {
      ctx.save(); ctx.translate(shot.x, shot.y); ctx.rotate(game.elapsed * 11 + shot.x * .01 + shot.y * .01);
      ctx.fillStyle = "rgba(167,139,250,.28)"; ctx.fillRect(-11, -11, 22, 22);
      ctx.fillStyle = "#d8ccff";
      for (let blade = 0; blade < 4; blade++) {
        ctx.rotate(Math.PI / 2);
        ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(12, 0); ctx.lineTo(0, 3); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = "#3b2763"; ctx.fillRect(-3, -3, 6, 6); ctx.restore();
    } else if (shot.kind === "arc-bolt") {
      const color = shot.arsenalId ? CLASS_ARSENAL[shot.arsenalId].color : "#a78bfa";
      ctx.globalAlpha = .28; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(shot.x, shot.y, shot.behavior === "blast" || shot.behavior === "pull" ? 12 : 10, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = color; ctx.fillRect(shot.x - 5, shot.y - 5, 10, 10);
      ctx.fillStyle = "#fff"; ctx.fillRect(shot.x - 2, shot.y - 2, 4, 4);
    } else if (shot.kind === "arrow" || shot.kind === "power-arrow") {
      const angle = Math.atan2(shot.vy, shot.vx);
      ctx.save(); ctx.translate(shot.x, shot.y); ctx.rotate(angle);
      ctx.fillStyle = shot.kind === "power-arrow" ? "#d8ffe9" : "#d6b06a"; ctx.fillRect(-11, -1, shot.kind === "power-arrow" ? 28 : 22, shot.kind === "power-arrow" ? 3 : 2);
      ctx.fillStyle = shot.arsenalId ? CLASS_ARSENAL[shot.arsenalId].color : "#34d399"; ctx.fillRect(10, -4, 7, 8); ctx.fillRect(-13, -4, 4, 8); ctx.restore();
    } else {
      ctx.fillStyle = shot.owner === "player" ? "rgba(244,211,94,.3)" : "rgba(255,77,109,.28)";
      ctx.fillRect(shot.x - 8, shot.y - 8, 16, 16);
      ctx.fillStyle = shot.owner === "player" ? "#f4d35e" : "#ff6b6b"; ctx.fillRect(shot.x - 4, shot.y - 4, 8, 8);
      ctx.fillStyle = "#fff"; ctx.fillRect(shot.x - 2, shot.y - 2, 4, 4);
    }
  });

  game.particles.forEach((particle) => {
    if (!isInActiveRoom(particle)) return;
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  });
  ctx.globalAlpha = 1;

  if (controlMode === "mouse" && game.screen === "playing") drawMouseAim(ctx, game, comfort.aimLine);
  game.enemies.filter((enemy) => enemy.kind === "bulwark" && enemy.hp > 0 && (enemy.shieldTime ?? 0) > 0).forEach((drone) => {
    ctx.strokeStyle = comfort.highContrastTelegraphs ? "#ffffff" : "rgba(118,199,220,.8)";
    ctx.lineWidth = comfort.highContrastTelegraphs ? 4 : 2;
    ctx.beginPath(); ctx.arc(drone.x, drone.y, 82, 0, Math.PI * 2); ctx.stroke();
    game.enemies.filter((ally) => ally.id !== drone.id && ally.hp > 0 && dist(ally, drone) < 82).forEach((ally) => {
      ctx.globalAlpha = .55; ctx.beginPath(); ctx.moveTo(drone.x, drone.y); ctx.lineTo(ally.x, ally.y); ctx.stroke(); ctx.globalAlpha = 1;
    });
  });
  game.enemies.forEach((enemy) => {
    if (isInActiveRoom(enemy)) drawEnemySprite(ctx, enemy, game.elapsed, game.player, comfort.highContrastTelegraphs);
  });
  game.enemies.filter((enemy) => enemy.kind === "boss" && enemy.variant === "ninja" && enemy.hp > 0 && (enemy.restTime ?? 0) > 0).forEach((ninjaBoss) => {
    ctx.strokeStyle = comfort.highContrastTelegraphs ? "#ffffff" : "#a78bfa";
    ctx.lineWidth = comfort.highContrastTelegraphs ? 5 : 3;
    ctx.setLineDash([7, 5]);
    ctx.beginPath(); ctx.arc(ninjaBoss.x, ninjaBoss.y, 44 + Math.sin(game.elapsed * 8) * 4, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    drawPixelText(ctx, "REST MODE // INVINCIBLE", ninjaBoss.x, ninjaBoss.y - 52, "#d8ccff", "center");
  });
  game.enemies.filter((enemy) => enemy.kind === "boss" && enemy.variant === "conductor" && enemy.hp > 0 && (enemy.specialTime ?? 0) > 0).forEach((conductor) => {
    const pattern = conductor.specialPattern ?? 0;
    const laneAngle = pattern * Math.PI / 6 + game.elapsed * .08;
    const telegraph = Math.max(0, conductor.specialTime ?? 0);
    ctx.save();
    ctx.strokeStyle = comfort.highContrastTelegraphs ? "#ffffff" : "#f4d35e";
    ctx.lineWidth = comfort.highContrastTelegraphs ? 5 : 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.arc(conductor.x, conductor.y, 58 + Math.sin(game.elapsed * 15) * 4, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#34d399";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(conductor.x - Math.cos(laneAngle) * 105, conductor.y - Math.sin(laneAngle) * 105);
    ctx.lineTo(conductor.x + Math.cos(laneAngle) * 105, conductor.y + Math.sin(laneAngle) * 105);
    ctx.stroke();
    ctx.restore();
    drawPixelText(ctx, `OPEN CHANNEL // ${telegraph.toFixed(1)}s`, conductor.x, conductor.y - 67, "#d8ffe9", "center");
  });
  drawPlayerSprite(ctx, game, shakeScale);

  game.combatText.forEach((popup) => {
    if (!isInActiveRoom(popup)) return;
    const progress = 1 - popup.life / popup.maxLife;
    ctx.save();
    ctx.globalAlpha = Math.min(1, popup.life * 4);
    ctx.translate(Math.round(popup.x), Math.round(popup.y - progress * 18));
    ctx.scale(popup.scale, popup.scale);
    drawPixelText(ctx, popup.text, 0, 0, popup.color, "center");
    ctx.restore();
  });

  const boss = game.enemies.find((enemy) => enemy.kind === "boss");
  if (boss && !game.bossEngaged) {
    ctx.strokeStyle = game.bossAwakenTime > 0 ? "rgba(244,211,94,.92)" : "rgba(255,77,109,.78)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, 32 + Math.sin(game.elapsed * (game.bossAwakenTime > 0 ? 14 : 5)) * 4, 0, Math.PI * 2);
    ctx.stroke();
    if (game.bossAwakenTime > 0) {
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(boss.x, boss.y, 42 + Math.sin(game.elapsed * 10) * 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  const p = game.player;
  let prompt = "";
  const nearbyItem = game.groundItems.find((item) => dist(item, p) < 38);
  const nearbyWeapon = game.groundWeapons.find((drop) => dist(drop, p) < 42);
  const nearbyClassArsenal = game.groundClassArsenal.find((drop) => dist(drop, p) < 42);
  const nearbyEquipment = game.groundEquipment.find((drop) => dist(drop, p) < 42);
  const nearbyCurse = game.groundCursedItems.find((drop) => dist(drop, p) < 42);
  if (nearbyCurse) prompt = `[HOLD F] CARRY ${getCursedItem(nearbyCurse.cursedItemId)?.name.toUpperCase()}`;
  else if (nearbyEquipment) prompt = `[HOLD F] EQUIP ${EQUIPMENT[nearbyEquipment.equipmentId].name.toUpperCase()}`;
  else if (nearbyWeapon) prompt = `[F] EQUIP ${getWeapon(nearbyWeapon.weaponId).name.toUpperCase()}`;
  else if (nearbyClassArsenal) prompt = `[F] EQUIP ${CLASS_ARSENAL[nearbyClassArsenal.arsenalId].name.toUpperCase()}`;
  else if (nearbyItem) prompt = `[F] PICK UP ${nearbyItem.kind.toUpperCase()}`;
  else if (game.secrets.some((secret) => !secret.discovered && dist(secret, p) < 46)) prompt = "[F] TRACE SIGNAL LEAK";
  else if (game.pylons.some((x) => !x.active && dist(x, p) < 42)) prompt = "[F] JACK IN";
  else if (game.chests.some((x) => !x.open && dist(x, p) < 42)) prompt = "[F] CRACK CACHE";
  else if (gateOpen && Math.hypot(p.x - EXIT_X, p.y - EXIT_Y) < 44) prompt = "[F] EXIT FLOOR";
  if (prompt) drawPixelText(ctx, prompt, p.x, p.y - 34, "#fff3b0", "center");
  ctx.restore();

  const visibilityMultiplier = challengeEffectsFor(game).visibilityRadiusMultiplier;
  if (visibilityMultiplier < 1) {
    const playerScreenX = WIDTH / 2 + (game.player.x - camX) * 2 + shakeX;
    const playerScreenY = HEIGHT / 2 + (game.player.y - camY) * 2 + shakeY;
    const radius = 210 * visibilityMultiplier;
    const blackout = ctx.createRadialGradient(playerScreenX, playerScreenY, radius * .36, playerScreenX, playerScreenY, radius);
    blackout.addColorStop(0, "rgba(1,3,3,0)");
    blackout.addColorStop(.58, "rgba(1,3,3,.16)");
    blackout.addColorStop(1, "rgba(1,3,3,.94)");
    ctx.save();
    ctx.beginPath();
    ctx.rect(128, 0, 512, HEIGHT);
    ctx.clip();
    ctx.fillStyle = blackout;
    ctx.fillRect(128, 0, 512, HEIGHT);
    ctx.restore();
  }

  // The side bands are literal unknown space: only the occupied room is broadcast.
  const shade = ctx.createLinearGradient(0, 0, 128, 0);
  shade.addColorStop(0, "#020303");
  shade.addColorStop(1, "#0a100e");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, 128, HEIGHT);
  ctx.save();
  ctx.translate(WIDTH, 0);
  ctx.scale(-1, 1);
  ctx.fillRect(0, 0, 128, HEIGHT);
  ctx.restore();
  ctx.strokeStyle = "#3b554c";
  ctx.lineWidth = 2;
  ctx.strokeRect(128, 1, 512, 510);
  drawPixelText(ctx, `ROOM 0${roomNumber}`, 66, 42, "#f4d35e", "center");
  drawPixelText(ctx, "UNKNOWN", 702, 42, "#52645d", "center");
  ctx.save();
  ctx.translate(68, HEIGHT / 2);
  ctx.rotate(-Math.PI / 2);
  drawPixelText(ctx, "NO SIGNAL BEYOND THIS ROOM", 0, 0, "#34463f", "center");
  ctx.restore();

  const showingBossBar = Boolean(boss && (game.bossEngaged || game.bossIntroTime > 0) && currentRoomIndex === boss?.homeRoomIndex);
  if (boss && showingBossBar) {
    const phase = boss.variant === "ninja" ? null : bossPhaseForHealth(boss.hp, boss.maxHp);
    const barX = 224;
    const barY = 28;
    const barWidth = 320;
    ctx.fillStyle = "rgba(5,7,6,.9)";
    ctx.fillRect(barX - 8, barY - 18, barWidth + 16, 42);
    ctx.strokeStyle = "#ff8fab";
    ctx.lineWidth = 2;
    ctx.strokeRect(barX, barY, barWidth, 12);
    ctx.fillStyle = "#401424";
    ctx.fillRect(barX + 2, barY + 2, barWidth - 4, 8);
    ctx.fillStyle = "#ff4d6d";
    ctx.fillRect(barX + 2, barY + 2, (barWidth - 4) * Math.max(0, boss.hp / boss.maxHp), 8);
    drawPixelText(ctx, bossDisplayName(boss), barX, barY - 5, "#fff3b0");
    drawPixelText(ctx, boss.variant === "ninja" ? (boss.restTime ?? 0) > 0 ? "REST MODE" : "SHADOW ASSAULT" : boss.variant === "conductor" && (boss.specialTime ?? 0) > 0 ? "SIGNAL CAGE" : phase!.name.toUpperCase(), barX + barWidth, barY - 5, boss.variant === "ninja" ? "#a78bfa" : boss.variant === "conductor" ? "#f4d35e" : "#ff8fab", "right");
  }

  if (game.bossAwakenTime > 0) {
    const progress = 1 - game.bossAwakenTime / 2.6;
    ctx.fillStyle = "rgba(5,7,6,.82)";
    ctx.fillRect(176, 204, 416, 82);
    ctx.strokeStyle = "#f4d35e";
    ctx.lineWidth = 2;
    ctx.strokeRect(184, 212, 400, 66);
    drawPixelText(ctx, "FINAL SIGNAL ACCEPTED", WIDTH / 2, 234, "#fff3b0", "center");
    const wakingBoss = game.enemies.find((enemy) => enemy.kind === "boss");
    drawPixelText(ctx, wakingBoss?.variant === "ninja" ? "SHADOW SEAL // BREAKING" : wakingBoss?.variant === "conductor" ? "STATIC ARRAY // POWERING" : "WARDEN CORE // POWERING", WIDTH / 2, 254, wakingBoss?.variant === "ninja" ? "#a78bfa" : wakingBoss?.variant === "conductor" ? "#f4d35e" : "#ff8fab", "center");
    ctx.fillStyle = "#3a2d14";
    ctx.fillRect(256, 264, 256, 5);
    ctx.fillStyle = "#f4d35e";
    ctx.fillRect(256, 264, 256 * Math.max(0, Math.min(1, progress)), 5);
  } else if (game.bossIntroTime > 0) {
    drawBossVersusSplash(ctx, game);
  }

  if (game.bossPhaseFx > 0) {
    const alpha = Math.min(.36, game.bossPhaseFx * .3);
    ctx.fillStyle = `rgba(255,77,109,${alpha})`;
    ctx.fillRect(128, 0, 512, HEIGHT);
    drawPixelText(ctx, `PHASE SHIFT // ${game.bossPhaseName}`, WIDTH / 2, HEIGHT / 2, "#ffffff", "center");
  }

  if (game.screen === "paused") {
    ctx.fillStyle = "rgba(4,6,6,.78)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawPixelText(ctx, "TRANSMISSION PAUSED", WIDTH / 2, HEIGHT / 2, "#f4d35e", "center");
  }
}

function indexLivingEnemies(enemies: Enemy[], playerRoomIndex: number) {
  const livingByHomeRoom = new Map<number, number>();
  const summonsByOwner = new Map<number, number>();
  const ninjasByHomeRoom = new Map<number, number>();
  const inPlayerRoom: Enemy[] = [];

  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    livingByHomeRoom.set(enemy.homeRoomIndex, (livingByHomeRoom.get(enemy.homeRoomIndex) ?? 0) + 1);
    if (enemy.summonerId !== undefined) summonsByOwner.set(enemy.summonerId, (summonsByOwner.get(enemy.summonerId) ?? 0) + 1);
    if (enemy.kind === "ninja") ninjasByHomeRoom.set(enemy.homeRoomIndex, (ninjasByHomeRoom.get(enemy.homeRoomIndex) ?? 0) + 1);
    if (roomIndexFor(enemy.x, enemy.y) === playerRoomIndex) inPlayerRoom.push(enemy);
  }

  return { livingByHomeRoom, summonsByOwner, ninjasByHomeRoom, inPlayerRoom };
}

function updateGame(game: Game, keys: Set<string>, dt: number, controlMode: ControlMode) {
  if (game.screen !== "playing") return;
  game.elapsed += dt;
  game.roomClearFx = Math.max(0, game.roomClearFx - dt);
  game.shake = Math.max(0, game.shake - dt);
  if (game.hitStop > 0) {
    game.hitStop = Math.max(0, game.hitStop - dt);
    return;
  }
  if (game.testerMode) applyTesterLoadout(game);
  game.messageTime = Math.max(0, game.messageTime - dt);
  if (game.bossAwakenTime > 0) {
    game.bossAwakenTime = Math.max(0, game.bossAwakenTime - dt);
    game.shake = Math.max(game.shake, .08);
    if (game.bossAwakenTime === 0) setMessage(game, game.floorNumber === 2 ? "SHADOW SEAL BROKEN // BOSS GATE RELEASED" : "WARDEN CORE ONLINE // BOSS GATE RELEASED");
  }
  if (game.bossIntroTime > 0) {
    game.bossIntroTime = Math.max(0, game.bossIntroTime - dt);
    game.shake = Math.max(game.shake, game.bossIntroTime > BOSS_VERSUS_DURATION - .38 ? .24 : .04);
    if (game.bossIntroTime === 0) {
      game.bossEngaged = true;
      const boss = game.enemies.find((enemy) => enemy.kind === "boss");
      if (boss?.variant === "ninja") {
        summonSignalNinjas(game, boss);
        setMessage(game, "NINJA MASTER LIVE // KEEP ONE ASSASSIN ALIVE");
      } else if (boss?.variant === "conductor") setMessage(game, "STATIC CONDUCTOR LIVE // WATCH FOR OPEN CHANNELS");
      else setMessage(game, "WARDEN LIVE // SURVIVE THE BROADCAST");
      if (boss) burst(game, boss.x, boss.y, boss.variant === "ninja" ? "#a78bfa" : "#ff8fab", 24, 145);
    }
    return;
  }
  game.time = Math.max(0, game.time - dt);
  game.bossPhaseFx = Math.max(0, game.bossPhaseFx - dt);
  const p = game.player;
  p.attackCd = Math.max(0, p.attackCd - dt);
  p.attackFx = Math.max(0, p.attackFx - dt);
  p.heavyFx = Math.max(0, p.heavyFx - dt);
  p.dodgeCd = Math.max(0, p.dodgeCd - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  p.stepTimer = Math.max(0, p.stepTimer - dt);
  p.furyTime = Math.max(0, p.furyTime - dt);
  p.stamina = Math.min(100, p.stamina + dt * 24 * (game.upgrades.includes("second_wind") ? 1.2 : 1));
  if (p.classId === "mage") p.classResource = Math.min(100, p.classResource + dt * 10);
  if (p.classId === "archer" && p.reloadTime > 0) {
    p.reloadTime = Math.max(0, p.reloadTime - dt);
    if (p.reloadTime === 0) {
      p.classResource = PLAYER_CLASSES.archer.resourceMax;
      setMessage(game, "QUIVER READY // TWELVE ARROWS");
    }
  }

  game.particles = game.particles.filter((particle) => {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= .93;
    particle.vy *= .93;
    return particle.life > 0;
  });
  game.combatText = game.combatText.filter((popup) => {
    popup.life -= dt;
    return popup.life > 0;
  });
  game.chests.forEach((chest) => { chest.openFx = Math.max(0, chest.openFx - dt); });

  const sponsorRewards = sponsorRewardsCrossed(game.sponsorHypeChecked, game.hype);
  game.sponsorHypeChecked = Math.max(game.sponsorHypeChecked, game.hype);
  sponsorRewards.forEach((threshold) => {
    const reward = threshold.reward;
    if (typeof reward.tonic === "number") game.player.potions += reward.tonic;
    if (typeof reward.bomb === "number") game.player.bombs += reward.bomb;
    if (typeof reward.fury === "number") game.player.furyVials += reward.fury;
    if (typeof reward.score === "number") game.score += reward.score;
    if (typeof reward.maxHealth === "number") {
      game.player.maxHp += reward.maxHealth;
      healPlayer(game, reward.maxHealth);
    }
    if (threshold.id === "sponsor_cache") {
      if (game.player.classId === "knight") {
        const rareWeapon = selectWeaponDrop(Math.random, { exclude: [game.player.weaponId], allowedRarities: ["rare"] });
        if (rareWeapon) game.groundWeapons.push({ id: game.nextId++, weaponId: rareWeapon.id, x: game.player.x + 24, y: game.player.y + 18, phase: 0 });
      } else {
        const classDrop = arsenalForClass(game.player.classId).filter((entry) => entry.rarity === "rare" && entry.id !== game.player.classArsenalId);
        const item = classDrop[Math.floor(Math.random() * classDrop.length)] ?? selectClassArsenalDrop(game.player.classId, game.player.classArsenalId);
        if (item) game.groundClassArsenal.push({ id: game.nextId++, arsenalId: item.id, x: game.player.x + 24, y: game.player.y + 18, phase: 0 });
      }
    }
    setMessage(game, `SPONSOR DROP // ${threshold.name.toUpperCase()}`);
  });

  let mx = 0;
  let my = 0;
  if (keys.has("arrowleft") || keys.has("a")) mx -= 1;
  if (keys.has("arrowright") || keys.has("d")) mx += 1;
  if (keys.has("arrowup") || keys.has("w")) my -= 1;
  if (keys.has("arrowdown") || keys.has("s")) my += 1;
  if (mx || my) {
    const len = Math.hypot(mx, my);
    mx /= len;
    my /= len;
    if (controlMode === "keyboard") {
      p.dirX = mx;
      p.dirY = my;
    }
  }
  p.moving = Boolean(mx || my);
  const equipmentSpeed = (hasEquipment(game, "runner-boots") ? 1.1 : 1) * buildSynergyFor(game).speedMultiplier;
  const cursedSpeed = cursedMoveSpeedMultiplier(game.cursedItemId);
  movePlayer(game, mx * p.speed * equipmentSpeed * cursedSpeed, my * p.speed * equipmentSpeed * cursedSpeed, dt, 9);
  if (!game.testerMode && game.cursedItemId === "hungry_crown" && game.elapsed - game.lastCombatTime > 4 && p.hp > 1) {
    const drain = Math.min(p.hp - 1, .5 * dt);
    p.hp -= drain;
    game.damageTaken += drain;
    game.damageBySource["Hungry Crown"] = (game.damageBySource["Hungry Crown"] ?? 0) + drain;
  }
  if (p.moving && p.stepTimer <= 0) {
    p.stepTimer = .13;
    burst(game, p.x - p.dirX * 7, p.y - p.dirY * 7 + 10, "#607068", 2, 24);
  }

  const currentRoomIndex = roomIndexFor(p.x, p.y);
  const activePylonCount = game.pylons.filter((pylon) => pylon.active).length;
  const currentRoomKind = game.roomKinds[currentRoomIndex];
  if (currentRoomIndex !== game.currentRoomIndex) {
    game.currentRoomIndex = currentRoomIndex;
    game.roomStarted[currentRoomIndex] = true;
    if (game.cursedItemId === "idol_open_mic") {
      const col = currentRoomIndex % ROOM_COLS;
      const row = Math.floor(currentRoomIndex / ROOM_COLS);
      [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]].forEach(([nearCol, nearRow]) => {
        if (nearCol >= 0 && nearCol < ROOM_COLS && nearRow >= 0 && nearRow < ROOM_ROWS) game.roomStarted[nearRow * ROOM_COLS + nearCol] = true;
      });
    }
    if (currentRoomKind === "boss" && bossGateOpen(game)) {
      const boss = game.enemies.find((enemy) => enemy.kind === "boss");
      game.bossEngaged = false;
      game.bossIntroTime = BOSS_VERSUS_DURATION;
      if (boss) {
        const phase = bossPhaseForHealth(boss.hp, boss.maxHp);
        game.lastBossPhase = phase.id;
        game.bossPhaseName = phase.name.toUpperCase();
        boss.cooldown = Math.max(boss.cooldown, 2.2);
        burst(game, boss.x, boss.y, boss.variant === "ninja" ? "#a78bfa" : "#ff4d6d", 36, 170);
      }
      game.shake = .55;
      setMessage(game, `LIVE FROM THE DEPTHS // THE ${bossDisplayName(boss)}`);
    } else if (currentRoomKind === "boss") {
      setMessage(game, `${game.floorNumber === 2 ? "NINJA MASTER SEALED" : "WARDEN DORMANT"} // ${game.pylons.length - activePylonCount} SIGNAL${game.pylons.length - activePylonCount === 1 ? "" : "S"} MISSING`);
    } else setMessage(game, `${currentRoomKind.toUpperCase()} ENCOUNTER // ${encounterLocks(currentRoomKind) ? "DOORS LOCKING" : "SIGNAL ACQUIRED"}`);
  }
  const roomId = String(currentRoomIndex);
  if (!game.explored.has(roomId)) {
    game.explored.add(roomId);
    game.routeTaken.push(currentRoomKind);
    game.score += 120;
    addHype(game, 3);
    if (currentRoomKind === "boss" && (game.bossEngaged || game.bossIntroTime > 0)) {
      const boss = game.enemies.find((enemy) => enemy.kind === "boss");
      setMessage(game, `LIVE FROM THE DEPTHS // THE ${bossDisplayName(boss)}`);
    }
    else setMessage(game, `NEW SIGNAL ZONE // ROOM ${game.explored.size} OF ${ROOM_COLS * ROOM_ROWS}`);
  }

  game.roomTimers[currentRoomIndex] += dt;
  if (currentRoomKind === "maze") updateMazeRoom(game, currentRoomIndex);
  const currentHazardTiles = currentRoomKind === "maze" ? [] : hazardTilesForRoom(currentRoomIndex, ROOM_COLS, ROOM_COLS * ROOM_ROWS);
  if (
    hazardStateAt(game.elapsed, currentRoomIndex, cursedHazardWarningReduction(game.cursedItemId)) === "active" &&
    pointIsOnHazard(p.x, p.y, currentHazardTiles, TILE) &&
    p.invuln <= 0
  ) {
    hurtPlayer(game, 9, "Floor surge");
    p.invuln = .75;
    game.shake = Math.max(game.shake, .16);
    game.combatText.push({ x: p.x, y: p.y - 25, text: "SURGE -9", life: .65, maxLife: .65, color: "#ff8fab", scale: 1 });
    burst(game, p.x, p.y, "#ff8fab", 10, 95);
  }
  game.burrowHazards = game.burrowHazards.filter((hazard) => {
    hazard.life -= dt;
    hazard.tick -= dt;
    if (hazard.life > 0 && roomIndexFor(hazard.x, hazard.y) === currentRoomIndex && dist(hazard, p) < 34 && hazard.tick <= 0 && p.invuln <= 0) {
      hurtPlayer(game, 7, "Burrower scrap field");
      p.invuln = .68;
      hazard.tick = .7;
      game.combatText.push({ x: p.x, y: p.y - 25, text: "SCRAP -7", life: .62, maxLife: .62, color: "#ffad42", scale: 1 });
      burst(game, p.x, p.y, "#ffad42", 8, 75);
    }
    return hazard.life > 0;
  });
  if (isRoomLocked(game, currentRoomIndex)) {
    const room = roomFor(p.x, p.y);
    const inset = 17;
    p.x = Math.max(room.col * 8 * TILE + inset, Math.min((room.col + 1) * 8 * TILE - inset, p.x));
    p.y = Math.max(room.row * 8 * TILE + inset, Math.min((room.row + 1) * 8 * TILE - inset, p.y));
  }

  const safe = { x: SAFE_X, y: SAFE_Y };
  if (!game.safeUsed && dist(safe, p) < 28) {
    game.safeUsed = true;
    healPlayer(game, p.maxHp - p.hp);
    p.potions += 1;
    game.score += 200;
    game.upgradeChoices = chooseSafeRoomUpgrades(game.floorSeed, [], 8)
      .filter((upgrade) => p.classId === "knight" || !["razor_arc", "kinetic_return"].includes(upgrade.id))
      .slice(0, 3)
      .map((upgrade) => upgrade.id);
    game.screen = "upgrade";
    setMessage(game, "REST NODE CLAIMED // CHOOSE ONE RUN UPGRADE");
  }

  const activePylons = game.pylons.filter((pylon) => pylon.active).length;
  const playerRoom = roomFor(p.x, p.y);
  const enemyIndex = indexLivingEnemies(game.enemies, currentRoomIndex);
  game.enemies.forEach((enemy) => {
    if (enemy.burrowPhase !== "underground" && enemy.burrowPhase !== "erupting") recoverEmbeddedEntity(enemy, enemy.kind === "boss" ? 17 : 11);
    enemy.cooldown -= dt;
    enemy.flash = Math.max(0, enemy.flash - dt);
    enemy.recovery = Math.max(0, enemy.recovery - dt);
    enemy.shieldTime = Math.max(0, (enemy.shieldTime ?? 0) - dt);
    const enemyRoom = roomFor(enemy.x, enemy.y);
    const enemyRoomIndex = enemyRoom.row * ROOM_COLS + enemyRoom.col;
    const sharesPlayerRoom = enemyRoom.col === playerRoom.col && enemyRoom.row === playerRoom.row;
    if (!sharesPlayerRoom && !game.roomStarted[enemyRoomIndex]) return;
    if (sharesPlayerRoom && !game.discoveredEnemies.includes(enemy.kind)) game.discoveredEnemies.push(enemy.kind);
    if (enemy.kind === "boss" && (activePylons < game.pylons.length || !game.bossEngaged)) return;
    const navigationGoal = sharesPlayerRoom ? enemyApproachTarget(enemy, p) : p;
    const chaseTarget = chaseWaypoint(game, enemy, navigationGoal);
    const dx = chaseTarget.x - enemy.x;
    const dy = chaseTarget.y - enemy.y;
    const navigationDistance = Math.hypot(dx, dy);
    const distance = dist(enemy, p);
    const nx = dx / Math.max(1, navigationDistance);
    const ny = dy / Math.max(1, navigationDistance);
    if (enemy.kind === "burrower" && enemy.burrowPhase) {
      enemy.phaseTime = Math.max(0, (enemy.phaseTime ?? 0) - dt);
      if (enemy.burrowPhase === "digging") {
        if ((enemy.phaseTime ?? 0) <= 0) {
          enemy.burrowPhase = "underground";
          enemy.phaseTime = .8;
          burst(game, enemy.x, enemy.y, "#ffad42", 10, 75);
        }
        return;
      }
      if (enemy.burrowPhase === "underground") {
        const targetX = enemy.targetX ?? enemy.x;
        const targetY = enemy.targetY ?? enemy.y;
        const travelX = targetX - enemy.x;
        const travelY = targetY - enemy.y;
        const travelLength = Math.max(1, Math.hypot(travelX, travelY));
        const room = roomFor(enemy.x, enemy.y);
        const inset = 24;
        enemy.x = Math.max(room.col * 8 * TILE + inset, Math.min((room.col + 1) * 8 * TILE - inset, enemy.x + (travelX / travelLength) * 175 * dt));
        enemy.y = Math.max(room.row * 8 * TILE + inset, Math.min((room.row + 1) * 8 * TILE - inset, enemy.y + (travelY / travelLength) * 175 * dt));
        if ((enemy.phaseTime ?? 0) <= 0 || travelLength < 6) {
          enemy.x = targetX;
          enemy.y = targetY;
          enemy.burrowPhase = "erupting";
          enemy.phaseTime = .58;
        }
        return;
      }
      if ((enemy.phaseTime ?? 0) <= 0) {
        if (dist(enemy, p) < 48 && p.invuln <= 0) {
          hurtPlayer(game, enemy.damage, "Scrap Burrower eruption");
          p.invuln = .72;
        }
        game.burrowHazards.push({ x: enemy.x, y: enemy.y, life: 2.6, tick: .15 });
        burst(game, enemy.x, enemy.y, "#ff6b35", 24, 165);
        game.shake = Math.max(game.shake, .24);
        enemy.burrowPhase = undefined;
        enemy.phaseTime = 0;
        enemy.cooldown = 3.2;
        enemy.recovery = .7;
      }
      return;
    }
    if (enemy.recovery > 0) return;
    if (sharesPlayerRoom) {
      const clearanceTarget = doorwayClearanceTarget(enemy);
      if (clearanceTarget) {
        const clearanceX = clearanceTarget.x - enemy.x;
        const clearanceY = clearanceTarget.y - enemy.y;
        const clearanceDistance = Math.max(1, Math.hypot(clearanceX, clearanceY));
        moveEntity(enemy, (clearanceX / clearanceDistance) * Math.max(58, enemy.speed), (clearanceY / clearanceDistance) * Math.max(58, enemy.speed), dt, enemy.kind === "boss" ? 17 : 11);
        return;
      }
    }
    if (!sharesPlayerRoom) {
      const sourceRoomId = roomIdAtSlot(game.navigation, enemyRoomIndex);
      const playerRoomId = roomIdAtSlot(game.navigation, currentRoomIndex);
      const connection = sourceRoomId && playerRoomId ? nextConnectionToward(game.navigation, sourceRoomId, playerRoomId) : null;
      if (connection && navigationDistance < 24) {
        const arrival = doorwayArrival(game.navigation, connection, doorwayLane(enemy.id));
        enemy.x = arrival.x;
        enemy.y = arrival.y;
        return;
      }
      if (connection?.physicallyAdjacent && doorwayQueueBlocked(enemy, chaseTarget, game.enemies)) return;
      moveEntity(enemy, nx * enemy.speed, ny * enemy.speed, dt, enemy.kind === "boss" ? 17 : 11);
      return;
    }
    if (enemy.kind === "broadcaster") {
      if (enemy.windup > 0) {
        enemy.windup -= dt;
        if (enemy.windup <= 0) {
          const roomPopulation = enemyIndex.livingByHomeRoom.get(enemy.homeRoomIndex) ?? 0;
          if (roomPopulation < 7) summonBroadcasterHusks(game, enemy);
          enemy.castStartHp = undefined;
          enemy.cooldown = 5.4;
          enemy.recovery = .5;
          burst(game, enemy.x, enemy.y, "#ff4d9a", 18, 125);
        }
        return;
      }
      if (distance < 105) moveEntity(enemy, -nx * enemy.speed, -ny * enemy.speed, dt, 11);
      else if (distance > 170) moveEntity(enemy, nx * enemy.speed, ny * enemy.speed, dt, 11);
      const activeHusks = enemyIndex.summonsByOwner.get(enemy.id) ?? 0;
      if (enemy.cooldown <= 0 && activeHusks < 3) {
        enemy.windup = 1.4;
        enemy.castStartHp = enemy.hp;
      }
      return;
    }
    if (enemy.kind === "bulwark") {
      const allies = enemyIndex.inPlayerRoom.filter((candidate) => candidate.id !== enemy.id);
      if (enemy.windup > 0) {
        enemy.windup -= dt;
        if (enemy.windup <= 0) {
          enemy.shieldTime = 2.5;
          enemy.shieldDirX = nx;
          enemy.shieldDirY = ny;
          enemy.cooldown = 4.5;
          burst(game, enemy.x, enemy.y, "#76c7dc", 14, 90);
        }
        return;
      }
      const localX = ((enemy.x % (8 * TILE)) + 8 * TILE) % (8 * TILE);
      const localY = ((enemy.y % (8 * TILE)) + 8 * TILE) % (8 * TILE);
      const clearOfDoor = localX > 48 && localX < 8 * TILE - 48 && localY > 48 && localY < 8 * TILE - 48;
      if (enemy.cooldown <= 0 && allies.length && clearOfDoor) {
        enemy.windup = .55;
        return;
      }
      if (distance < 82) moveEntity(enemy, -nx * enemy.speed, -ny * enemy.speed, dt, 11);
      else if (allies[0] && dist(enemy, allies[0]) > 64) {
        const allyDistance = Math.max(1, dist(enemy, allies[0]));
        moveEntity(enemy, ((allies[0].x - enemy.x) / allyDistance) * enemy.speed, ((allies[0].y - enemy.y) / allyDistance) * enemy.speed, dt, 11);
      }
      return;
    }
    if (enemy.kind === "burrower" && enemy.cooldown <= 0 && distance > 52 && distance < 185) {
      const room = roomFor(enemy.x, enemy.y);
      const inset = 28;
      enemy.targetX = Math.max(room.col * 8 * TILE + inset, Math.min((room.col + 1) * 8 * TILE - inset, p.x + p.dirX * 18));
      enemy.targetY = Math.max(room.row * 8 * TILE + inset, Math.min((room.row + 1) * 8 * TILE - inset, p.y + p.dirY * 18));
      if (!canMove(enemy.targetX, enemy.targetY, 11)) {
        enemy.targetX = p.x;
        enemy.targetY = p.y;
      }
      enemy.burrowPhase = "digging";
      enemy.phaseTime = .62;
      return;
    }
    if (enemy.kind === "healer") {
      let ally: Enemy | undefined;
      for (const candidate of enemyIndex.inPlayerRoom) {
        if (candidate.id === enemy.id || candidate.hp >= candidate.maxHp) continue;
        if (!ally || candidate.hp / candidate.maxHp < ally.hp / ally.maxHp) ally = candidate;
      }
      if (distance < 90) moveEntity(enemy, -nx * enemy.speed, -ny * enemy.speed, dt, 11);
      else if (ally) {
        const adx = ally.x - enemy.x;
        const ady = ally.y - enemy.y;
        const alen = Math.max(1, Math.hypot(adx, ady));
        moveEntity(enemy, (adx / alen) * enemy.speed, (ady / alen) * enemy.speed, dt, 11);
        if (alen < 75 && enemy.cooldown <= 0) {
          ally.hp = Math.min(ally.maxHp, ally.hp + 14);
          enemy.cooldown = 2.2;
          burst(game, ally.x, ally.y, "#34d399", 8, 55);
        }
      }
      return;
    }
    if (enemy.kind === "volatile") {
      if (enemy.windup > 0) {
        enemy.windup -= dt;
        if (enemy.windup <= 0) {
          burst(game, enemy.x, enemy.y, "#ff8a3d", 26, 180);
          game.shake = .3;
          if (distance < 74 && p.invuln <= 0) {
            hurtPlayer(game, enemy.damage, "Fusewalker blast");
            p.invuln = .7;
          }
          game.enemies.forEach((other) => {
            if (other.id !== enemy.id && dist(other, enemy) < 70) damageEnemy(game, other, 25);
          });
          enemy.hp = 0;
        }
        return;
      }
      if (distance < 64) {
        enemy.windup = .75;
        return;
      }
      moveEntity(enemy, nx * enemy.speed, ny * enemy.speed, dt, 11);
      return;
    }
    if (enemy.kind === "spitter") {
      if (enemy.windup > 0) {
        enemy.windup -= dt;
        if (enemy.windup <= 0) {
          const aimX = p.x - enemy.x;
          const aimY = p.y - enemy.y;
          const aimLength = Math.max(1, Math.hypot(aimX, aimY));
          game.projectiles.push({ x: enemy.x, y: enemy.y, vx: (aimX / aimLength) * 165, vy: (aimY / aimLength) * 165, life: 2.2, damage: enemy.damage, owner: "enemy" });
          enemy.cooldown = 1.55;
          enemy.recovery = .3;
          burst(game, enemy.x, enemy.y, "#a78bfa", 6, 55);
        }
        return;
      }
      if (distance < 100) moveEntity(enemy, -nx * enemy.speed, -ny * enemy.speed, dt, 11);
      else if (distance > 155) moveEntity(enemy, nx * enemy.speed, ny * enemy.speed, dt, 11);
      if (enemy.cooldown <= 0) {
        enemy.windup = .5;
      }
    } else {
      if (enemy.kind === "boss" && enemy.variant === "ninja") {
        const livingNinjas = enemyIndex.ninjasByHomeRoom.get(enemy.homeRoomIndex) ?? 0;
        if ((enemy.restTime ?? 0) > 0) {
          enemy.restTime = Math.max(0, (enemy.restTime ?? 0) - dt);
          if (enemy.cooldown <= 0) {
            const starCount = 3;
            for (let index = 0; index < starCount; index++) {
              const angle = (index / starCount) * Math.PI * 2 + game.elapsed * .42;
              game.projectiles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * 95, vy: Math.sin(angle) * 95, life: 5.5, damage: 10, owner: "enemy", kind: "shuriken", behavior: "bounce", bounces: 7 });
            }
            enemy.cooldown = 1.25;
            burst(game, enemy.x, enemy.y, "#dcd3ff", 10, 85);
          }
          if ((enemy.restTime ?? 0) <= 0) {
            game.projectiles = game.projectiles.filter((shot) => shot.kind !== "shuriken");
            summonSignalNinjas(game, enemy);
            enemy.cooldown = 1.2;
            setMessage(game, "NINJA WAVE // MASTER VULNERABLE");
          }
          return;
        }
        if (livingNinjas === 0) {
          enemy.restTime = 4.5;
          enemy.cooldown = 0;
          enemy.windup = 0;
          setMessage(game, "NINJA REST MODE // INVINCIBLE SHURIKEN STORM");
          return;
        }
      }
      if (enemy.kind === "boss" && enemy.variant !== "ninja") {
        const phase = bossPhaseForHealth(enemy.hp, enemy.maxHp);
        if (phase.id !== game.lastBossPhase) {
          game.lastBossPhase = phase.id;
          game.bossPhaseName = phase.name.toUpperCase();
          game.bossPhaseFx = 1.35;
          setMessage(game, `BOSS PHASE // ${phase.name.toUpperCase()}`);
          game.shake = .62;
          game.hitStop = .12;
          burst(game, enemy.x, enemy.y, phase.id === "warden_dead_air" ? "#ffffff" : "#ff4d6d", 42, 210);
        }
      }
      if (enemy.kind === "boss" && enemy.variant === "conductor") {
        if ((enemy.specialTime ?? 0) > 0) {
          enemy.specialTime = Math.max(0, (enemy.specialTime ?? 0) - dt);
          if (enemy.specialTime === 0) {
            const phase = bossPhaseForHealth(enemy.hp, enemy.maxHp);
            const pattern = enemy.specialPattern ?? 0;
            const laneAngle = pattern * Math.PI / 6 + game.elapsed * .08;
            const speed = phase.id === "warden_dead_air" ? 175 : phase.id === "warden_overload" ? 155 : 138;
            for (let index = 0; index < 12; index++) {
              if (index === 0 || index === 6) continue;
              const angle = laneAngle + index * Math.PI / 6;
              game.projectiles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 2.6, damage: 11, owner: "enemy" });
            }
            enemy.cooldown = phase.id === "warden_dead_air" ? 1.1 : 1.55;
            game.shake = Math.max(game.shake, .3);
            burst(game, enemy.x, enemy.y, "#f4d35e", 24, 150);
            setMessage(game, "SIGNAL CAGE FIRED // OPEN CHANNEL HOLDS");
          }
          return;
        }
        if (enemy.cooldown <= 0 && distance > 54) {
          const phase = bossPhaseForHealth(enemy.hp, enemy.maxHp);
          enemy.specialPattern = ((enemy.specialPattern ?? -1) + 1) % 6;
          enemy.specialTime = phase.id === "warden_dead_air" ? .55 : phase.id === "warden_overload" ? .7 : .9;
          enemy.cooldown = enemy.specialTime + 1.2;
          enemy.recovery = enemy.specialTime;
          setMessage(game, "STATIC CONDUCTOR // FIND THE OPEN CHANNEL");
          return;
        }
      }
      const reach = enemy.kind === "boss" ? 34 : enemy.kind === "mimic" ? 28 : 24;
      if (enemy.windup > 0) {
        enemy.windup -= dt;
        if (enemy.windup <= 0 && distance < reach + 12 && p.invuln <= 0) {
          hurtPlayer(game, enemy.damage, enemy.kind === "boss" ? enemy.variant === "ninja" ? "Ninja Master strike" : "Broadcast Warden" : enemy.kind === "ninja" ? "Signal Ninja slash" : enemy.kind === "warden" ? "Ironjaw strike" : enemy.kind === "mimic" ? "Mimic bite" : "Skitter slash");
          p.invuln = .65;
          game.shake = enemy.kind === "boss" ? .3 : .16;
          burst(game, p.x, p.y, "#ff8fab", enemy.kind === "boss" ? 12 : 7, 110);
        }
        if (enemy.windup <= 0) enemy.recovery = enemy.kind === "boss" ? .5 : enemy.kind === "warden" ? .68 : enemy.kind === "mimic" ? .42 : .25;
        return;
      }
      moveEntity(enemy, nx * enemy.speed, ny * enemy.speed, dt, enemy.kind === "boss" ? 17 : 11);
      const postMoveDistance = dist(enemy, p);
      if (postMoveDistance <= reach + 8 && enemy.cooldown <= 0) {
        enemy.windup = enemy.kind === "boss" ? .72 : enemy.kind === "warden" ? .58 : .4;
        enemy.cooldown = enemy.kind === "boss" ? 1.05 : 1.25;
        return;
      }
      if (enemy.kind === "boss" && enemy.variant === "warden" && enemy.cooldown <= .05 && Math.random() < .06) {
        const phase = bossPhaseForHealth(enemy.hp, enemy.maxHp);
        const count = phase.id === "warden_dead_air" ? 12 : phase.id === "warden_overload" ? 10 : 8;
        for (let i = 0; i < count; i++) {
          const angle = (Math.PI * 2 * i) / count + game.elapsed * .25;
          game.projectiles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * 125, vy: Math.sin(angle) * 125, life: 2.5, damage: 10, owner: "enemy" });
        }
        enemy.cooldown = 1.4;
      }
    }
  });
  const chainDeaths = game.enemies.filter((enemy) => enemy.hp <= 0);
  creditEnemyDeaths(game, chainDeaths);
  game.enemies.forEach((enemy) => {
    if (enemy.hp > 0 && roomIndexFor(enemy.x, enemy.y) === currentRoomIndex) separateEnemyFromPlayer(game, enemy);
  });
  separateEnemies(game);
  game.enemies = game.enemies.filter((enemy) => enemy.hp > 0);

  game.projectiles = game.projectiles.filter((shot) => {
    shot.life -= dt;
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.traveled = (shot.traveled ?? 0) + Math.hypot(shot.vx, shot.vy) * dt;
    if (shot.life <= 0) return false;
    if (!canMove(shot.x, shot.y, 3)) {
      if (shot.behavior === "bounce" && (shot.bounces ?? 0) > 0) {
        shot.x -= shot.vx * dt * 1.4; shot.y -= shot.vy * dt * 1.4;
        shot.vx *= -1; shot.vy *= -1; shot.bounces = (shot.bounces ?? 1) - 1;
        burst(game, shot.x, shot.y, "#76c7dc", 5, 55);
      } else return false;
    }
    if (shot.owner === "player") {
      const target = game.enemies.find((enemy) => enemyIsTargetable(enemy) && dist(shot, enemy) < 15);
      if (target) {
        if (target.kind === "boss" && !game.bossEngaged) return true;
        let damage = shot.damage;
        if ((shot.behavior === "precision" || shot.kind === "power-arrow") && (shot.traveled ?? 0) > 140) damage *= 1.25;
        if (shot.behavior === "longshot" && (shot.traveled ?? 0) > 150) damage *= 1.55;
        if (shot.behavior === "longshot" && (shot.traveled ?? 0) < 70) damage *= .7;
        if ((shot.behavior === "precision" || shot.behavior === "longshot") && (shot.traveled ?? 0) < 55) damage *= .85;
        damage = damageEnemy(game, target, damage);
        showDamage(game, target, damage, shot.kind === "power-arrow", colorForProjectile(shot));
        if (game.player.classId === "knight") game.weaponHits[shot.weaponId ?? game.player.weaponId]++;
        target.flash = .14;
        const color = colorForProjectile(shot);
        burst(game, target.x, target.y, color, shot.kind === "power-arrow" ? 14 : 8, shot.kind === "power-arrow" ? 145 : 100);
        if (shot.behavior === "frost") target.recovery = Math.max(target.recovery, target.kind === "boss" ? .18 : .52);
        if (shot.behavior === "chain") {
          game.enemies.filter((enemy) => enemy.id !== target.id && enemyIsTargetable(enemy) && dist(enemy, target) < 72).slice(0, 2).forEach((enemy) => { const chainDamage = damageEnemy(game, enemy, shot.damage * .62); showDamage(game, enemy, chainDamage, false, "#d9f7ff"); enemy.flash = .14; burst(game, enemy.x, enemy.y, "#d9f7ff", 7, 80); });
        }
        if (shot.splash && shot.splashDamage) {
          game.enemies.filter((enemy) => enemy.id !== target.id && enemyIsTargetable(enemy) && dist(enemy, target) < shot.splash!).forEach((enemy) => {
            const splashDamage = damageEnemy(game, enemy, shot.splashDamage!);
            showDamage(game, enemy, splashDamage, false, color);
            enemy.flash = .14;
            if (shot.behavior === "pull" && enemy.kind !== "boss") {
              const dx = target.x - enemy.x; const dy = target.y - enemy.y; const length = Math.max(1, Math.hypot(dx, dy));
              displaceEntity(enemy, (dx / length) * 20, (dy / length) * 20, 11);
            }
            burst(game, enemy.x, enemy.y, color, 6, 70);
          });
        }
        if (shot.kind === "power-arrow") shot.damage *= .85;
        shot.pierce = (shot.pierce ?? 0) - 1;
        return (shot.pierce ?? -1) >= 0;
      }
      return true;
    }
    if (dist(shot, p) < 13 && p.invuln <= 0) {
      hurtPlayer(game, shot.damage, "Void projectile");
      p.invuln = 0.65;
      game.shake = .14;
      burst(game, p.x, p.y, "#a78bfa", 7, 90);
      return false;
    }
    return true;
  });
  const projectileDeaths = game.enemies.filter((enemy) => enemy.hp <= 0);
  creditEnemyDeaths(game, projectileDeaths);
  game.enemies = game.enemies.filter((enemy) => enemy.hp > 0);

  const encounterIndex = roomIndexFor(p.x, p.y);
  const encounterKind = game.roomKinds[encounterIndex];
  const remainingInRoom = game.enemies.filter((enemy) => enemy.homeRoomIndex === encounterIndex).length;
  const chestInRoomOpened = game.chests.some((chest) => roomIndexFor(chest.x, chest.y) === encounterIndex && chest.open);
  const pylonInRoomActive = game.pylons.some((pylon) => roomIndexFor(pylon.x, pylon.y) === encounterIndex && pylon.active);
  if (encounterKind === "boss" && remainingInRoom === 0) game.bossDead = true;
  let encounterComplete = false;
  if (encounterKind === "safe") encounterComplete = game.safeUsed;
  if (["ambush", "elite"].includes(encounterKind)) encounterComplete = remainingInRoom === 0;
  if (encounterKind === "survival") encounterComplete = game.roomTimers[encounterIndex] >= 25 && remainingInRoom === 0;
  if (encounterKind === "loot") encounterComplete = chestInRoomOpened && remainingInRoom === 0;
  if (encounterKind === "puzzle") encounterComplete = pylonInRoomActive || remainingInRoom === 0;
  if (encounterKind === "treasure") encounterComplete = chestInRoomOpened;
  if (encounterKind === "broadcast") encounterComplete = game.roomTimers[encounterIndex] >= 8 && remainingInRoom === 0;
  if (encounterKind === "boss") encounterComplete = game.bossDead;
  if (encounterComplete && !game.roomCleared[encounterIndex]) {
    game.roomCleared[encounterIndex] = true;
    game.roomClearFx = 1.65;
    game.roomClearRoomIndex = encounterIndex;
    game.roomsCleared++;
    const roomScore = encounterKind === "boss" ? 1800 : encounterKind === "elite" ? 650 : 320;
    settleAudienceRoomClear(game, roomScore, encounterKind === "elite" ? 12 : 7);
    const carriedCurse = getCursedItem(game.cursedItemId);
    if (carriedCurse) {
      game.cursedRoomsCleared++;
      addHype(game, carriedCurse.hypePerRoom);
      game.score += carriedCurse.hypePerRoom * 40;
      game.combatText.push({ x: p.x, y: p.y - 38, text: `CURSE +${carriedCurse.hypePerRoom} HYPE`, life: .9, maxLife: .9, color: "#ff8fab", scale: .9 });
    }
    const clearedRoom = roomFor(p.x, p.y);
    spawnFloorCurse(game, encounterIndex, (clearedRoom.col * 8 + 4.5) * TILE, (clearedRoom.row * 8 + 4.5) * TILE);
    if (["elite", "broadcast", "treasure"].includes(encounterKind)) {
      const room = roomFor(p.x, p.y);
      if (p.classId === "knight") {
        const weapon = selectWeaponDrop(Math.random, { exclude: [p.weaponId] });
        if (weapon) {
        game.groundWeapons.push({ id: game.nextId++, weaponId: weapon.id, x: (room.col * 8 + 4.5) * TILE, y: (room.row * 8 + 4.5) * TILE, phase: Math.random() * 6 });
        }
      } else {
        const drop = selectClassArsenalDrop(p.classId, p.classArsenalId);
        if (drop) game.groundClassArsenal.push({ id: game.nextId++, arsenalId: drop.id, x: (room.col * 8 + 4.5) * TILE, y: (room.row * 8 + 4.5) * TILE, phase: Math.random() * 6 });
      }
    }
    if (!game.dareComplete && game.activeDareId === "cursed_carrier" && game.cursedItemId) game.dareProgress++;
    else if (!game.dareComplete && !["close_quarters", "bomb_double", "cursed_carrier"].includes(game.activeDareId)) game.dareProgress++;
    const dare = AUDIENCE_DARES.find((entry) => entry.id === game.activeDareId);
    if (dare && game.dareProgress >= dare.target && !game.dareComplete) {
      game.dareComplete = true;
      addHype(game, dare.hypeReward);
      game.score += dare.scoreReward;
      setMessage(game, `DARE COMPLETE // ${dare.name.toUpperCase()} +${dare.scoreReward}`);
    } else {
      setMessage(game, `${encounterKind.toUpperCase()} CLEARED // DOORS RELEASED`);
    }
    if ([3, 6, 9].includes(game.roomsCleared) && !game.audienceMilestones.includes(game.roomsCleared)) {
      triggerAudienceVote(game, game.roomsCleared);
    }
  }

  if (!game.testerMode && (game.time <= 0 || p.hp <= 0)) {
    p.hp = Math.max(0, p.hp);
    if (p.hp <= 0 && game.deathRoomKind === null) game.deathRoomKind = game.roomKinds[currentRoomIndex];
    game.screen = "lost";
    setMessage(game, game.time <= 0 ? "BROADCAST WINDOW CLOSED" : "SUBJECT 404 OFFLINE");
  }
}

function makeHud(game: Game): Hud {
  const pylons = game.pylons.filter((pylon) => pylon.active).length;
  const dare = AUDIENCE_DARES.find((entry) => entry.id === game.activeDareId) ?? AUDIENCE_DARES[0];
  const playerClass = PLAYER_CLASSES[game.player.classId];
  return {
    hp: Math.ceil(game.player.hp),
    maxHp: game.player.maxHp,
    stamina: Math.ceil(game.player.stamina),
    classId: game.player.classId,
    className: playerClass.name,
    resourceName: playerClass.resourceName,
    classResource: Math.ceil(game.player.classId === "knight" ? game.player.stamina : game.player.classResource),
    classResourceMax: playerClass.resourceMax,
    time: Math.ceil(game.time),
    score: Math.floor(game.score * game.scoreMultiplier),
    hype: game.hype,
    rooms: game.explored.size,
    pylons,
    potions: game.player.potions,
    bombs: game.player.bombs,
    furyVials: game.player.furyVials,
    furyTime: game.player.furyTime,
    weaponName: game.player.classId === "knight" ? getWeapon(game.player.weaponId).name : CLASS_ARSENAL[game.player.classArsenalId].name,
    ammo: game.player.classId === "archer" ? game.player.classResource : game.player.ammo,
    nearbyEquipmentId: game.groundEquipment.find((drop) => dist(drop, game.player) < 42)?.equipmentId ?? null,
    nearbyCursedItemId: game.groundCursedItems.find((drop) => dist(drop, game.player) < 42)?.cursedItemId ?? null,
    equipmentNames: (Object.values(game.equipped).filter(Boolean) as EquipmentId[]).map((id) => EQUIPMENT[id].name),
    cursedItemId: game.cursedItemId,
    cursedRoomsCleared: game.cursedRoomsCleared,
    roomKind: game.roomKinds[game.currentRoomIndex] ?? "safe",
    roomsCleared: game.roomsCleared,
    secretsFound: game.secretsFound,
    secretsTotal: game.secretsTotal,
    dareName: dare.name,
    dareProgress: game.dareProgress,
    dareTarget: dare.target,
    message: game.messageTime > 0 ? game.message : "THE SIGNAL HUMS. KEEP MOVING.",
    objective: pylons < 3 ? `Activate ${3 - pylons} signal pylon${3 - pylons === 1 ? "" : "s"}` : game.bossDead ? "Reach the exit gate" : `Defeat the ${bossDisplayName(game.enemies.find((enemy) => enemy.kind === "boss"))}`,
  };
}

function runStatsFor(game: Game): RunStats {
  const elitesDefeated = game.roomKinds.filter((kind, index) => kind === "elite" && game.roomCleared[index]).length;
  return {
    won: game.screen === "won",
    elapsedSeconds: Math.round(game.elapsed),
    roomsDiscovered: game.priorRoomsExplored + game.explored.size,
    totalRooms: game.floorNumber * game.roomKinds.length,
    roomsCleared: game.priorRoomsCleared + game.roomsCleared,
    enemiesDefeated: game.kills,
    elitesDefeated,
    bossesDefeated: game.bossDead ? game.floorNumber : Math.max(0, game.floorNumber - 1),
    damageTaken: Math.round(game.damageTaken),
    deaths: game.screen === "lost" && game.player.hp <= 0 ? 1 : 0,
    highestHype: Math.round(game.maxHype),
    daresCompleted: game.dareComplete ? 1 : 0,
    secretsFound: game.secretsFound,
    lootValue: game.upgrades.length * 250 + game.discoveredEquipment.length * 180 + (game.groundWeapons.length + game.groundClassArsenal.length) * 120,
    remainingSeconds: Math.round(game.time),
    favoriteWeapon: game.player.classId === "knight" ? getWeapon(game.player.weaponId).name : CLASS_ARSENAL[game.player.classArsenalId].name,
    cursedItemsCarried: game.cursedItemsCarried,
  };
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(makeGame());
  const keysRef = useRef(new Set<string>());
  const audioRef = useRef<AudioContext | null>(null);
  const interactHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shiftUsedForHeavy = useRef(false);
  const mouseAttackHeld = useRef(false);
  const [screen, setScreen] = useState<Screen>("title");
  const [hud, setHud] = useState<Hud>(initialHud);
  const [highScore, setHighScore] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSection, setHelpSection] = useState<HelpSection>("mission");
  const [armoryOpen, setArmoryOpen] = useState(false);
  const [armory, setArmory] = useState<ArmorySnapshot>(EMPTY_ARMORY);
  const [metaProfile, setMetaProfile] = useState<MetaProgressionProfile>(() => parseMetaProgressionProfile(null));
  const [archiveProfile, setArchiveProfile] = useState<ArchiveDiscoveryProfile>(() => parseArchiveProfile(null));
  const [archiveCategory, setArchiveCategory] = useState<ArchiveCategoryId>("enemies");
  const [challengeProgress, setChallengeProgress] = useState<ChallengeProgress>({});
  const [selectedChallengeIds, setSelectedChallengeIds] = useState<ChallengeModifierId[]>([]);
  const [starterWeapon, setStarterWeapon] = useState<WeaponId>("cleaver");
  const [selectedClass, setSelectedClass] = useState<PlayerClassId>("knight");
  const [selectedContract, setSelectedContract] = useState<BroadcastContractId>("redline");
  const [selectedRunMode, setSelectedRunMode] = useState<"standard" | "daily">("standard");
  const [runHistory, setRunHistory] = useState<RunHistoryEntry[]>([]);
  const [controlMode, setControlMode] = useState<ControlMode>("keyboard");
  const controlModeRef = useRef<ControlMode>("keyboard");
  const [comfortSettings, setComfortSettings] = useState<ComfortSettings>(DEFAULT_COMFORT_SETTINGS);
  const comfortSettingsRef = useRef<ComfortSettings>(DEFAULT_COMFORT_SETTINGS);
  const [testerMode, setTesterMode] = useState(false);
  const testerModeRef = useRef(false);
  const helpPreviousScreen = useRef<Screen | null>(null);

  const beep = useCallback((frequency = 220, duration = 0.06) => {
    try {
      const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const audio = audioRef.current ?? new AudioCtx();
      audioRef.current = audio;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = "square";
      oscillator.frequency.value = frequency;
      const volume = comfortSettingsRef.current.effectsVolume;
      if (volume <= 0) return;
      gain.gain.setValueAtTime(0.035 * volume, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration);
    } catch {
      // Audio is optional; browsers may block it until a gesture.
    }
  }, []);

  const syncScreen = useCallback((game: Game) => {
    if ((game.screen === "won" || game.screen === "lost") && !game.resultsSaved) {
      const stats = runStatsFor(game);
      const summary = summarizeRun(stats);
      game.score = Math.max(game.score, summary.score);
      const endedAt = new Date().toISOString();
      const runId = `${game.runMode}:${game.dailyKey ?? game.floorSeed}:${endedAt}`;
      const lifetimeRuns = storedNumber(localStorage.getItem("signal-depths-lifetime-runs")) + 1;
      const lifetimeKills = storedNumber(localStorage.getItem("signal-depths-lifetime-kills")) + game.kills;
      const storedUnlocks = parseStoredArray(localStorage.getItem("signal-depths-unlocks"), [], (value): value is string =>
        typeof value === "string" && PERMANENT_UNLOCKS.some((unlock) => unlock.id === value)
      );
      const earned = newlyEarnedUnlocks({ ...stats, lifetimeRuns, lifetimeKills }, storedUnlocks);
      game.newUnlocks = earned.map((unlock) => unlock.name);
      localStorage.setItem("signal-depths-lifetime-runs", String(lifetimeRuns));
      localStorage.setItem("signal-depths-lifetime-kills", String(lifetimeKills));
      localStorage.setItem("signal-depths-unlocks", JSON.stringify([...storedUnlocks, ...earned.map((unlock) => unlock.id)]));
      const merge = <T,>(stored: T[], found: T[]) => [...new Set([...stored, ...found])];
      const storedWeapons = parseStoredArray(localStorage.getItem("signal-depths-discovered-weapons"), ["cleaver" as WeaponId], (value): value is WeaponId =>
        typeof value === "string" && value in WEAPONS
      );
      const storedEquipment = parseStoredArray(localStorage.getItem("signal-depths-discovered-equipment"), [], (value): value is EquipmentId =>
        typeof value === "string" && EQUIPMENT_IDS.includes(value as EquipmentId)
      );
      const storedEnemies = parseStoredArray(localStorage.getItem("signal-depths-discovered-enemies"), [], (value): value is EnemyKind =>
        typeof value === "string" && value in enemyStats
      );
      localStorage.setItem("signal-depths-discovered-weapons", JSON.stringify(merge(storedWeapons, [game.player.weaponId])));
      localStorage.setItem("signal-depths-discovered-equipment", JSON.stringify(merge(storedEquipment, game.discoveredEquipment)));
      localStorage.setItem("signal-depths-discovered-enemies", JSON.stringify(merge(storedEnemies, game.discoveredEnemies)));
      const boss = game.floorNumber === 2
        ? "Ninja Master"
        : game.floorSeed % 2 === 0 ? "Broadcast Warden" : "Static Conductor";
      const historyEntry: RunHistoryEntry = {
        id: runId,
        endedAt,
        mode: game.runMode,
        ...(game.dailyKey ? { dailyKey: game.dailyKey } : {}),
        classId: game.player.classId,
        won: game.screen === "won",
        score: Math.floor(game.score * game.scoreMultiplier),
        grade: summary.grade,
        roomsCleared: game.priorRoomsCleared + game.roomsCleared,
        kills: game.kills,
        maxHype: game.maxHype,
        boss,
      };
      const history = addRunHistory(parseRunHistory(localStorage.getItem(RUN_HISTORY_STORAGE_KEY)), historyEntry);
      try {
        localStorage.setItem(RUN_HISTORY_STORAGE_KEY, JSON.stringify(history));
      } catch {
        // A completed run should still resolve if browser storage is unavailable.
      }
      setRunHistory(history);
      setArmory({ weapons: merge(storedWeapons, [game.player.weaponId]), equipment: merge(storedEquipment, game.discoveredEquipment), enemies: merge(storedEnemies, game.discoveredEnemies), unlocks: merge(storedUnlocks, earned.map((unlock) => unlock.id)), runs: lifetimeRuns, kills: lifetimeKills });

      const storedMeta = parseMetaProgressionProfile(localStorage.getItem(META_PROGRESSION_STORAGE_KEY));
      const metaUpdate = updateMetaProgressionAfterRun(storedMeta, runId, summary);
      const boostedFragmentReward = applyChallengeReward(metaUpdate.reward.total, challengeFragmentMultiplier(game.challengeIds));
      const fragmentBonus = Math.max(0, boostedFragmentReward - metaUpdate.reward.total);
      const nextMeta = metaUpdate.applied ? {
        ...metaUpdate.profile,
        signalFragments: metaUpdate.profile.signalFragments + fragmentBonus,
        lifetimeFragmentsEarned: metaUpdate.profile.lifetimeFragmentsEarned + fragmentBonus,
      } : metaUpdate.profile;
      game.fragmentReward = metaUpdate.applied ? boostedFragmentReward : 0;
      localStorage.setItem(META_PROGRESSION_STORAGE_KEY, JSON.stringify(nextMeta));
      setMetaProfile(nextMeta);

      const bossId = boss === "Ninja Master" ? "ninja-master" : boss === "Static Conductor" ? "static-conductor" : "broadcast-warden";
      const storedArchive = parseArchiveProfile(localStorage.getItem(ARCHIVE_STORAGE_KEY));
      const archiveUpdate = mergeCompletedRunDiscoveries(storedArchive, {
        enemies: game.discoveredEnemies,
        weapons: game.player.classId === "knight" ? [game.player.weaponId] : [],
        classArsenals: game.player.classId === "knight" ? [] : [game.player.classArsenalId],
        curses: game.cursedItemId ? [game.cursedItemId] : [],
        bosses: game.bossDead ? [bossId] : [],
        ending: game.screen === "won" ? "escaped" : game.time <= 0 ? "window-closed" : "subject-offline",
        secretsFound: game.secretsFound,
        lore: game.floorNumber >= 2 ? ["shadow-carrier"] : [],
      });
      game.newDiscoveries = archiveDiscoveryCallouts(archiveUpdate.newIds).map((callout) => callout.title);
      localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(archiveUpdate.profile));
      setArchiveProfile(archiveUpdate.profile);

      const storedChallengeProgress = parseChallengeProgress(localStorage.getItem(CHALLENGE_PROGRESS_STORAGE_KEY));
      const nextChallengeProgress: ChallengeProgress = {
        lifetimeRuns,
        lifetimeKills,
        bossesDefeated: (storedChallengeProgress.bossesDefeated ?? 0) + stats.bossesDefeated,
        highestHype: Math.max(storedChallengeProgress.highestHype ?? 0, stats.highestHype),
        secretsFound: (storedChallengeProgress.secretsFound ?? 0) + stats.secretsFound,
        daresCompleted: (storedChallengeProgress.daresCompleted ?? 0) + stats.daresCompleted,
      };
      localStorage.setItem(CHALLENGE_PROGRESS_STORAGE_KEY, JSON.stringify(nextChallengeProgress));
      setChallengeProgress(nextChallengeProgress);
      game.resultsSaved = true;
    }
    setScreen(game.screen);
    setHud(makeHud(game));
    if (game.screen === "won" || game.screen === "lost") {
      const saved = storedNumber(localStorage.getItem("signal-depths-high-score"));
      const contractScore = Math.floor(game.score * game.scoreMultiplier);
      if (contractScore > saved) {
        localStorage.setItem("signal-depths-high-score", String(contractScore));
        setHighScore(contractScore);
      }
    }
  }, []);

  const chooseControlMode = useCallback((mode: ControlMode) => {
    controlModeRef.current = mode;
    mouseAttackHeld.current = false;
    setControlMode(mode);
    localStorage.setItem("signal-depths-control-mode", mode);
    keysRef.current.clear();
    beep(mode === "mouse" ? 620 : 360, .07);
  }, [beep]);

  const updateComfortSetting = useCallback(<K extends keyof ComfortSettings>(key: K, value: ComfortSettings[K]) => {
    const next = { ...comfortSettingsRef.current, [key]: value };
    if (key === "holdToAttack" && value === false) mouseAttackHeld.current = false;
    comfortSettingsRef.current = next;
    setComfortSettings(next);
    localStorage.setItem("signal-depths-comfort-settings", JSON.stringify(next));
  }, []);

  const chooseTesterMode = useCallback((enabled: boolean) => {
    testerModeRef.current = enabled;
    setTesterMode(enabled);
    localStorage.setItem("signal-depths-tester-mode", String(enabled));
    const game = gameRef.current;
    game.testerMode = enabled;
    if (enabled) applyTesterLoadout(game);
    setMessage(game, enabled ? "TESTER MODE ONLINE // LIMITERS REMOVED" : "TESTER MODE OFFLINE // STANDARD RULES RESTORED");
    setHud(makeHud(game));
    beep(enabled ? 920 : 240, .1);
  }, [beep]);

  const startGame = useCallback(() => {
    const dateKey = selectedRunMode === "daily" ? localDateKey() : null;
    const seed = dateKey ? dailySeed(dateKey) : Math.floor(Math.random() * 1_000_000_000);
    const selectedKitId = metaProfile.selectedKitId && getStarterKit(metaProfile.selectedKitId).classId === selectedClass ? metaProfile.selectedKitId : null;
    const nextGame = makeGame("playing", seed, selectedClass, selectedContract, 1, selectedRunMode, dateKey, selectedKitId, selectedChallengeIds);
    if (!selectedKitId && selectedClass === "knight") {
      nextGame.player.weaponId = starterWeapon;
      nextGame.player.ammo = getWeapon(starterWeapon).ammo ?? 0;
    }
    nextGame.testerMode = testerModeRef.current;
    if (nextGame.testerMode) applyTesterLoadout(nextGame);
    gameRef.current = nextGame;
    keysRef.current.clear();
    setScreen("playing");
    setHud(makeHud(nextGame));
    beep(164, 0.1);
    canvasRef.current?.focus();
    localStorage.setItem("signal-depths-player-class", selectedClass);
    localStorage.setItem("signal-depths-broadcast-contract", selectedContract);
    localStorage.setItem("signal-depths-run-mode", selectedRunMode);
  }, [beep, metaProfile.selectedKitId, selectedChallengeIds, selectedClass, selectedContract, selectedRunMode, starterWeapon]);

  const openClassSelection = useCallback(() => {
    gameRef.current.screen = "class-select";
    setScreen("class-select");
    beep(360, .08);
  }, [beep]);

  const buyStarterKit = useCallback((kitId: StarterKitId) => {
    setMetaProfile((current) => {
      const result = purchaseStarterKit(current, kitId);
      if (result.changed) {
        localStorage.setItem(META_PROGRESSION_STORAGE_KEY, JSON.stringify(result.profile));
        beep(820, .14);
      } else beep(92, .08);
      return result.profile;
    });
  }, [beep]);

  const chooseStarterKit = useCallback((kitId: StarterKitId | null) => {
    setMetaProfile((current) => {
      const result = selectStarterKit(current, kitId);
      if (result.changed) {
        localStorage.setItem(META_PROGRESSION_STORAGE_KEY, JSON.stringify(result.profile));
        beep(610, .09);
      }
      return result.profile;
    });
  }, [beep]);

  const toggleChallenge = useCallback((challengeId: ChallengeModifierId) => {
    setSelectedChallengeIds((current) => {
      const next = current.includes(challengeId) ? current.filter((id) => id !== challengeId) : [...current, challengeId];
      const validation = validateChallengeSelection(next, challengeProgress);
      if (!validation.valid) {
        beep(82, .08);
        return current;
      }
      localStorage.setItem(SELECTED_CHALLENGES_STORAGE_KEY, JSON.stringify(next));
      beep(next.includes(challengeId) ? 690 : 260, .08);
      return next;
    });
  }, [beep, challengeProgress]);

  const closeArchive = useCallback(() => {
    setArchiveProfile((current) => {
      const next = acknowledgeArchiveDiscoveries(current);
      localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
    setArmoryOpen(false);
  }, []);

  const openHelp = useCallback(() => {
    const game = gameRef.current;
    helpPreviousScreen.current = game.screen;
    if (game.screen === "playing") {
      game.screen = "paused";
      syncScreen(game);
    }
    keysRef.current.clear();
    setHelpOpen(true);
    beep(430, .06);
  }, [beep, syncScreen]);

  const closeHelp = useCallback(() => {
    const game = gameRef.current;
    if (game.screen === "paused" && helpPreviousScreen.current === "playing") {
      game.screen = "playing";
      syncScreen(game);
      requestAnimationFrame(() => canvasRef.current?.focus());
    }
    helpPreviousScreen.current = null;
    setHelpOpen(false);
    beep(260, .05);
  }, [beep, syncScreen]);

  const chooseUpgrade = useCallback((upgradeId: RunUpgradeId) => {
    const game = gameRef.current;
    const p = game.player;
    game.upgrades.push(upgradeId);
    if (upgradeId === "reinforced_heart") { p.maxHp += 20; healPlayer(game, 20); }
    if (upgradeId === "second_wind") p.stamina = 100;
    if (upgradeId === "phase_steps") p.speed += 6;
    if (upgradeId === "long_fuse") p.furyVials++;
    if (upgradeId === "volatile_mix") p.bombs++;
    if (upgradeId === "last_signal") p.maxHp += 10;
    game.upgradeChoices = [];
    game.screen = "playing";
    setMessage(game, `UPGRADE INSTALLED // ${RUN_UPGRADES.find((upgrade) => upgrade.id === upgradeId)?.name.toUpperCase()}`);
    syncScreen(game);
    beep(820, .18);
    canvasRef.current?.focus();
  }, [beep, syncScreen]);

  const attack = useCallback(() => {
    const game = gameRef.current;
    if (game.screen !== "playing") return;
    const p = game.player;
    if (!game.testerMode && p.attackCd > 0) return;
    if (controlModeRef.current === "keyboard" && comfortSettingsRef.current.keyboardAimAssist) applyKeyboardAimAssist(game);
    if (p.classId === "mage") {
      const focus = CLASS_ARSENAL[p.classArsenalId];
      p.attackCd = game.testerMode ? 0 : focus.cooldown;
      p.attackFx = .24;
      const baseAngle = Math.atan2(p.dirY, p.dirX);
      for (let index = 0; index < focus.shots; index++) {
        const offset = (index - (focus.shots - 1) / 2) * focus.spread;
        const angle = baseAngle + offset;
        game.projectiles.push({ x:p.x + Math.cos(angle) * 18, y:p.y + Math.sin(angle) * 18, vx:Math.cos(angle) * focus.speed, vy:Math.sin(angle) * focus.speed, life:focus.lifetime, damage:focus.damage * (p.furyTime > 0 ? 1.75 : 1), owner:"player", pierce:focus.pierce, kind:"arc-bolt", splash:focus.splash, splashDamage:focus.splashDamage * (p.furyTime > 0 ? 1.75 : 1), traveled:0, arsenalId:focus.id, behavior:focus.behavior, bounces:focus.behavior === "bounce" ? 2 : 0 });
      }
      burst(game, p.x + p.dirX * 20, p.y + p.dirY * 20, focus.color, 8, 60);
      beep(focus.behavior === "frost" ? 520 : focus.behavior === "blast" ? 220 : 430, .09);
      return;
    }
    if (p.classId === "archer") {
      const bow = CLASS_ARSENAL[p.classArsenalId];
      if (!game.testerMode && p.reloadTime > 0) { setMessage(game, "RESTRINGING QUIVER // HOLD THE LINE"); return; }
      if (!game.testerMode && p.classResource < bow.ammoCost) {
        p.reloadTime = .95;
        setMessage(game, "QUIVER EMPTY // RELOADING");
        beep(80, .05);
        return;
      }
      if (!game.testerMode) p.classResource -= bow.ammoCost;
      if (!game.testerMode && p.classResource <= 0) p.reloadTime = .95;
      p.attackCd = game.testerMode ? 0 : bow.cooldown;
      p.attackFx = .2;
      const baseAngle = Math.atan2(p.dirY, p.dirX);
      for (let index = 0; index < bow.shots; index++) {
        const offset = (index - (bow.shots - 1) / 2) * bow.spread;
        const angle = baseAngle + offset;
        game.projectiles.push({ x:p.x + Math.cos(angle) * 20, y:p.y + Math.sin(angle) * 20, vx:Math.cos(angle) * bow.speed, vy:Math.sin(angle) * bow.speed, life:bow.lifetime, damage:bow.damage * (p.furyTime > 0 ? 1.75 : 1), owner:"player", pierce:bow.pierce, kind:"arrow", traveled:0, arsenalId:bow.id, behavior:bow.behavior, bounces:bow.behavior === "bounce" ? 2 : 0 });
      }
      burst(game, p.x - p.dirX * 8, p.y - p.dirY * 8, bow.color, bow.shots > 1 ? 8 : 4, 45);
      beep(bow.behavior === "rapid" ? 720 : bow.behavior === "longshot" ? 420 : 610, .045);
      return;
    }
    const weapon = getWeapon(p.weaponId);
    if (!game.testerMode && weapon.ammo !== null && p.ammo <= 0) {
      setMessage(game, `${weapon.name.toUpperCase()} // OUT OF AMMO`);
      beep(70, .05);
      return;
    }
    const servoBoost = hasEquipment(game, "razor-servo") && weapon.damageType === "slash" ? .85 : 1;
    p.attackCd = game.testerMode ? 0 : (weapon.cooldownMs / 1000) * servoBoost;
    p.attackFx = p.weaponId === "hammer" ? .3 : p.weaponId === "spear" ? .24 : .2;
    game.weaponAttacks[p.weaponId]++;
    burst(game, p.x + p.dirX * 24, p.y + p.dirY * 24, "#fff3b0", 3, 42);
    if (weapon.projectile && p.weaponId === "scrap-launcher") {
      if (!game.testerMode) p.ammo--;
      game.projectiles.push({ x: p.x + p.dirX * 18, y: p.y + p.dirY * 18, vx: p.dirX * weapon.projectile.speed, vy: p.dirY * weapon.projectile.speed, life: weapon.projectile.lifetimeMs / 1000, damage: weapon.damage * (p.furyTime > 0 ? 1.75 : 1), owner: "player", pierce: weapon.projectile.pierce, weaponId: p.weaponId });
      game.shake = .1;
      beep(130, .09);
      return;
    }
    let hits = 0;
    game.enemies.forEach((enemy) => {
      if (enemyIsTargetable(enemy) && meleeAttackHits(p, enemy, weapon)) {
        if (enemy.kind === "boss" && !game.bossEngaged) {
          setMessage(game, game.bossIntroTime > 0 ? "WARDEN AWAKENING // HOLD FOR THE BROADCAST" : "WARDEN SHIELDED // FEED THE THREE SIGNALS");
          return;
        }
        const hammerArmor = p.weaponId === "hammer" && game.equipped.armor ? 1.1 : 1;
        const kinetic = p.weaponId === "hammer" && hasEquipment(game, "kinetic-brace") ? 1.3 : 1;
        const damage = weapon.damage * weapon.attacksPerInput * hammerArmor * kinetic * (p.furyTime > 0 ? 1.75 : 1) * (game.upgrades.filter((id) => id === "razor_arc").length ? 1.1 : 1);
        const appliedDamage = damageEnemy(game, enemy, damage);
        if (appliedDamage <= 0) return;
        showDamage(game, enemy, appliedDamage, p.weaponId === "hammer", enemy.kind === "boss" ? "#ff8fab" : "#fff3b0");
        enemy.flash = 0.14;
        displaceEntity(enemy, p.dirX * weapon.knockback, p.dirY * weapon.knockback, enemy.kind === "boss" ? 17 : 11);
        burst(game, enemy.x, enemy.y, enemy.kind === "boss" ? "#ff4d6d" : "#f4d35e", enemy.kind === "boss" ? 13 : 8, 120);
        hits++;
        if (p.weaponId === "shock-baton") {
          const stormCoil = hasEquipment(game, "storm-coil");
          game.enemies.filter((candidate) => candidate.id !== enemy.id && enemyIsTargetable(candidate) && dist(candidate, enemy) < (stormCoil ? 84 : 58)).slice(0, stormCoil ? 3 : 2).forEach((candidate) => {
            const chainDamage = damageEnemy(game, candidate, weapon.damage * (stormCoil ? .85 : .65));
            showDamage(game, candidate, chainDamage, false, "#76c7dc");
            candidate.flash = .14;
            burst(game, candidate.x, candidate.y, "#76c7dc", 7, 80);
          });
        }
      }
    });
    game.weaponHits[p.weaponId] += hits;
    if (hits && hasEquipment(game, "audience-eye") && (p.weaponId === "twin-knives" || weapon.cooldownMs <= 340)) {
      addHype(game, hits * .08);
    }
    const dead = game.enemies.filter((enemy) => enemy.hp <= 0);
    creditEnemyDeaths(game, dead);
    game.enemies = game.enemies.filter((enemy) => enemy.hp > 0);
    if (dead.length && game.activeDareId === "close_quarters" && !game.dareComplete) game.dareProgress += dead.length;
    if (hits) {
      game.hitStop = .055;
      game.shake = dead.length ? .24 : .12;
      beep(96, 0.07);
    }
    else beep(180, 0.035);
  }, [beep]);

  const heavyAttack = useCallback(() => {
    const game = gameRef.current;
    const p = game.player;
    if (game.screen !== "playing" || (!game.testerMode && p.attackCd > 0)) return;
    if (controlModeRef.current === "keyboard" && comfortSettingsRef.current.keyboardAimAssist) applyKeyboardAimAssist(game);
    if (p.classId === "mage") {
      if (!game.testerMode && p.classResource < 50) { setMessage(game, "GRAVITY SIGIL // NOT ENOUGH MANA"); beep(72, .05); return; }
      if (!game.testerMode) p.classResource -= 50;
      p.attackCd = game.testerMode ? 0 : .9;
      p.heavyFx = .7;
      const center = { x: p.x + p.dirX * 95, y: p.y + p.dirY * 95 };
      let hits = 0;
      game.enemies.forEach((enemy) => {
        const distance = dist(enemy, center);
        if (!enemyIsTargetable(enemy) || roomIndexFor(enemy.x, enemy.y) !== roomIndexFor(p.x, p.y) || distance >= 64) return;
        if (enemy.kind === "boss" && !game.bossEngaged) return;
        const damage = (distance < 38 ? 36 : 22) * (p.furyTime > 0 ? 1.75 : 1);
        const appliedDamage = damageEnemy(game, enemy, damage);
        showDamage(game, enemy, appliedDamage, true, "#dcd3ff");
        enemy.flash = .22;
        enemy.recovery = Math.max(enemy.recovery, enemy.kind === "boss" ? .18 : .55);
        if (enemy.kind !== "boss") {
          const dx = center.x - enemy.x;
          const dy = center.y - enemy.y;
          const length = Math.max(1, Math.hypot(dx, dy));
          displaceEntity(enemy, (dx / length) * 18, (dy / length) * 18, 11);
        }
        burst(game, enemy.x, enemy.y, "#a78bfa", 12, 105);
        hits++;
      });
      burst(game, center.x, center.y, "#dcd3ff", 32, 185);
      game.shake = hits ? .25 : .12;
      game.hitStop = hits ? .07 : 0;
      const dead = game.enemies.filter((enemy) => enemy.hp <= 0);
      creditEnemyDeaths(game, dead);
      game.enemies = game.enemies.filter((enemy) => enemy.hp > 0);
      setMessage(game, `GRAVITY SIGIL // ${hits} TARGET${hits === 1 ? "" : "S"} BENT`);
      beep(185, .22);
      return;
    }
    if (p.classId === "archer") {
      if (!game.testerMode && (p.reloadTime > 0 || p.classResource < 3)) { setMessage(game, "POWER SHOT // THREE ARROWS REQUIRED"); beep(72, .05); return; }
      if (!game.testerMode) p.classResource -= 3;
      if (!game.testerMode && p.classResource <= 0) p.reloadTime = .95;
      p.attackCd = game.testerMode ? 0 : .9;
      p.heavyFx = .72;
      game.projectiles.push({
        x: p.x + p.dirX * 22, y: p.y + p.dirY * 22,
        vx: p.dirX * 650, vy: p.dirY * 650, life: .56,
        damage: 42 * (p.furyTime > 0 ? 1.75 : 1), owner: "player", pierce: 2, kind: "power-arrow", traveled: 0,
      });
      game.shake = .16;
      burst(game, p.x + p.dirX * 28, p.y + p.dirY * 28, "#d8ffe9", 14, 115);
      setMessage(game, "POWER SHOT // LINE BREAKER LOOSED");
      beep(820, .11);
      return;
    }
    const weapon = getWeapon(p.weaponId);
    if (!game.testerMode && p.stamina < 40) { setMessage(game, "COMMITTED STRIKE // NOT ENOUGH DRIVE"); beep(72, .05); return; }
    if (!game.testerMode && weapon.ammo !== null && p.ammo < 2) { setMessage(game, `${weapon.name.toUpperCase()} // TWO ROUNDS REQUIRED`); beep(72, .05); return; }
    if (!game.testerMode) p.stamina -= 40;
    p.attackCd = game.testerMode ? 0 : Math.max(.62, weapon.cooldownMs / 1000 * 1.25);
    p.heavyFx = .62;
    game.weaponAttacks[p.weaponId]++;
    if (p.weaponId === "scrap-launcher" && weapon.projectile) {
      if (!game.testerMode) p.ammo -= 2;
      game.projectiles.push({ x: p.x + p.dirX * 20, y: p.y + p.dirY * 20, vx: p.dirX * 430, vy: p.dirY * 430, life: .82, damage: weapon.damage * 1.65, owner: "player", pierce: 2, weaponId: p.weaponId, kind: "scrap", traveled: 0 });
    } else {
      let hits = 0;
      game.enemies.forEach((enemy) => {
        if (enemyIsTargetable(enemy) && meleeAttackHits(p, enemy, weapon, true)) {
          if (enemy.kind === "boss" && !game.bossEngaged) return;
          const damage = weapon.damage * weapon.attacksPerInput * 1.65 * (p.furyTime > 0 ? 1.75 : 1);
          const appliedDamage = damageEnemy(game, enemy, damage);
          if (appliedDamage <= 0) return;
          showDamage(game, enemy, appliedDamage, true, "#fff3b0");
          enemy.flash = .22;
          const knockback = enemy.kind === "boss" ? weapon.knockback * .35 : weapon.knockback * 1.6;
          displaceEntity(enemy, p.dirX * knockback, p.dirY * knockback, enemy.kind === "boss" ? 17 : 11);
          burst(game, enemy.x, enemy.y, "#fff3b0", 15, 155);
          hits++;
        }
      });
      game.weaponHits[p.weaponId] += hits;
      const dead = game.enemies.filter((enemy) => enemy.hp <= 0);
      creditEnemyDeaths(game, dead);
      game.enemies = game.enemies.filter((enemy) => enemy.hp > 0);
      game.hitStop = hits ? .09 : 0;
    }
    game.shake = .28;
    setMessage(game, `COMMITTED STRIKE // ${weapon.name.toUpperCase()}`);
    beep(88, .16);
  }, [beep]);

  const aimAtPointer = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (controlModeRef.current !== "mouse") return;
    const canvas = canvasRef.current;
    const game = gameRef.current;
    if (!canvas || game.screen !== "playing") return;
    const rect = canvas.getBoundingClientRect();
    const pointerX = (event.clientX - rect.left) * (WIDTH / rect.width);
    const pointerY = (event.clientY - rect.top) * (HEIGHT / rect.height);
    const room = roomFor(game.player.x, game.player.y);
    const cameraX = room.col * 8 * TILE + 4 * TILE;
    const cameraY = room.row * 8 * TILE + 4 * TILE;
    const playerScreenX = WIDTH / 2 + (game.player.x - cameraX) * 2;
    const playerScreenY = HEIGHT / 2 + (game.player.y - cameraY) * 2;
    const dx = pointerX - playerScreenX;
    const dy = pointerY - playerScreenY;
    const length = Math.hypot(dx, dy);
    if (length > 3) {
      game.player.dirX = dx / length;
      game.player.dirY = dy / length;
      game.player.aimDistance = Math.max(28, Math.min(220, (length / 2) * comfortSettingsRef.current.mouseAimScale));
    }
  }, []);

  const handleCanvasPointerDown = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (controlModeRef.current !== "mouse" || (event.button !== 0 && event.button !== 2)) return;
    event.preventDefault();
    canvasRef.current?.focus();
    aimAtPointer(event);
    if (event.button === 0) {
      mouseAttackHeld.current = comfortSettingsRef.current.holdToAttack;
      attack();
    }
    else heavyAttack();
  }, [aimAtPointer, attack, heavyAttack]);

  const handleCanvasContextMenu = useCallback((event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (controlModeRef.current === "mouse") event.preventDefault();
  }, []);

  const dodge = useCallback(() => {
    const game = gameRef.current;
    const p = game.player;
    if (game.screen !== "playing" || (!game.testerMode && (p.dodgeCd > 0 || p.stamina < 30))) return;
    const phaseTreads = hasEquipment(game, "phase-treads");
    p.dodgeCd = game.testerMode ? 0 : phaseTreads ? .55 : 0.65;
    const classInvuln = p.classId === "mage" ? .46 : p.classId === "archer" ? .32 : .38;
    const classDistance = p.classId === "mage" ? .8 : p.classId === "archer" ? 1.18 : 1;
    p.invuln = classInvuln + game.upgrades.filter((id) => id === "phase_steps").length * .08 + (phaseTreads ? .1 : 0);
    if (!game.testerMode) p.stamina -= 30;
    movePlayer(game, p.dirX * 390 * classDistance * (game.upgrades.includes("phase_steps") ? 1.2 : 1) * (phaseTreads ? 1.2 : 1), p.dirY * 390 * classDistance * (game.upgrades.includes("phase_steps") ? 1.2 : 1) * (phaseTreads ? 1.2 : 1), 0.11, 9);
    if (hasEquipment(game, "iron-stompers")) game.enemies.filter((enemy) => enemyIsTargetable(enemy) && dist(enemy, p) < 30).forEach((enemy) => { damageEnemy(game, enemy, 12); enemy.flash = .16; burst(game, enemy.x, enemy.y, "#76c7dc", 8, 90); });
    burst(game, p.x - p.dirX * 16, p.y - p.dirY * 16, p.classId === "mage" ? "#a78bfa" : p.classId === "archer" ? "#34d399" : "#76c7dc", 11, 95);
    game.shake = .08;
    beep(320, 0.05);
  }, [beep]);

  const activateItem = useCallback((kind: ItemKind) => {
    const game = gameRef.current;
    const p = game.player;
    if (game.screen !== "playing") return;
    if (kind === "tonic") {
      if ((!game.testerMode && p.potions <= 0) || p.hp >= p.maxHp) return;
      if (audienceModifierFor(game)?.disableHealing || challengeEffectsFor(game).disableHealing) {
        setMessage(game, challengeEffectsFor(game).disableHealing ? "CHALLENGE RULE // HEALING DISABLED FOR THIS RUN" : "AUDIENCE RULE // HEALING BLOCKED UNTIL THE VOTE EXPIRES");
        beep(82, .08);
        return;
      }
      if (!game.testerMode) p.potions--;
      const restored = healPlayer(game, 45);
      burst(game, p.x, p.y, "#34d399", 14, 75);
      setMessage(game, `[1] VITAL TONIC // +${Math.round(restored)} HEALTH`);
      beep(520, 0.12);
      return;
    }
    if (kind === "fury") {
      if (!game.testerMode && p.furyVials <= 0) return;
      if (!game.testerMode) p.furyVials--;
      p.furyTime = 8 + game.upgrades.filter((id) => id === "long_fuse").length * 4;
      burst(game, p.x, p.y, "#ff4d6d", 20, 105);
      setMessage(game, "[3] FURY VIAL // DAMAGE BOOSTED FOR 8 SECONDS");
      beep(690, 0.16);
      return;
    }
    if (!game.testerMode && p.bombs <= 0) return;
    if (!game.testerMode) p.bombs--;
    const playerRoom = roomFor(p.x, p.y);
    burst(game, p.x, p.y, "#76c7dc", 34, 190);
    game.shake = .32;
    game.hitStop = .08;
    game.enemies.forEach((enemy) => {
      const enemyRoom = roomFor(enemy.x, enemy.y);
      const bossShielded = enemy.kind === "boss" && !game.bossEngaged;
      if (enemyRoom.col === playerRoom.col && enemyRoom.row === playerRoom.row && !bossShielded && enemyIsTargetable(enemy)) {
        const bombDamage = damageEnemy(game, enemy, 55);
        showDamage(game, enemy, bombDamage, true, "#d9f7ff");
        enemy.flash = .2;
        burst(game, enemy.x, enemy.y, "#d9f7ff", 12, 135);
        if (enemy.kind === "volatile" && hasEquipment(game, "volatile-heart")) {
          burst(game, enemy.x, enemy.y, "#ff8a3d", 22, 175);
          game.enemies.filter((other) => other.id !== enemy.id && enemyIsTargetable(other) && dist(other, enemy) < 78).forEach((other) => { damageEnemy(game, other, 35); other.flash = .2; });
          enemy.hp = 0;
        }
      }
    });
    const dead = game.enemies.filter((enemy) => enemy.hp <= 0);
    dead.forEach((enemy) => {
      game.kills++;
      game.score += Math.round((enemy.kind === "boss" ? 1600 : 140) * game.hype);
      if (enemy.kind === "boss") game.bossDead = true;
    });
    game.enemies = game.enemies.filter((enemy) => enemy.hp > 0);
    if (dead.length >= 2 && game.activeDareId === "bomb_double" && !game.dareComplete) game.dareProgress = 1;
    setMessage(game, "[2] ROOMBREAKER BOMB // 55 DAMAGE TO THE ROOM");
    beep(110, .2);
  }, [beep]);

  const drinkPotion = useCallback(() => activateItem("tonic"), [activateItem]);

  const interact = useCallback(() => {
    const game = gameRef.current;
    const p = game.player;
    if (game.screen !== "playing") return;
    const cursedDrop = game.groundCursedItems.find((drop) => dist(drop, p) < 42);
    if (cursedDrop) {
      if (challengeEffectsFor(game).lockCursedItem && game.cursedItemId) {
        setMessage(game, "CURSED CONTRACT // RELIC LOCKED FOR THIS RUN");
        beep(82, .08);
        return;
      }
      const item = getCursedItem(cursedDrop.cursedItemId);
      if (!item) return;
      const previous = carryCursedItem(game, cursedDrop.cursedItemId);
      game.groundCursedItems = game.groundCursedItems.filter((drop) => drop.id !== cursedDrop.id);
      if (previous && previous !== item.id) game.groundCursedItems.push({ id: game.nextId++, cursedItemId: previous, x: cursedDrop.x + 18, y: cursedDrop.y + 12, phase: cursedDrop.phase + 1 });
      const effects = cursedEffectLines(item);
      burst(game, cursedDrop.x, cursedDrop.y, "#ff4d9a", 30, 145);
      setMessage(game, `CURSE ACCEPTED // ${item.name.toUpperCase()} — ${effects.upside}; ${effects.downside}`);
      beep(118, .28);
      return;
    }
    const equipmentDrop = game.groundEquipment.find((drop) => dist(drop, p) < 42);
    if (equipmentDrop) {
      const item = EQUIPMENT[equipmentDrop.equipmentId];
      const previous = equipItem(game, item.id);
      setArmory((current) => {
        const equipment = [...new Set([...current.equipment, item.id])];
        localStorage.setItem("signal-depths-discovered-equipment", JSON.stringify(equipment));
        return { ...current, equipment };
      });
      game.groundEquipment = game.groundEquipment.filter((drop) => drop.id !== equipmentDrop.id);
      if (previous !== item.id && previous) game.groundEquipment.push({ id: game.nextId++, equipmentId: previous, x: equipmentDrop.x + 16, y: equipmentDrop.y + 12, phase: Math.random() * 6 });
      burst(game, equipmentDrop.x, equipmentDrop.y, item.color, 20, 110);
      setMessage(game, `${item.slot.toUpperCase()} EQUIPPED // ${item.name.toUpperCase()} — ${item.perk}`);
      beep(item.rarity === "rare" ? 880 : 720, .16);
      return;
    }
    const classDrop = game.groundClassArsenal.find((drop) => dist(drop, p) < 42);
    if (classDrop) {
      const nextItem = CLASS_ARSENAL[classDrop.arsenalId];
      if (nextItem.classId !== p.classId) return;
      const previous = p.classArsenalId;
      p.classArsenalId = nextItem.id;
      game.groundClassArsenal = game.groundClassArsenal.filter((drop) => drop.id !== classDrop.id);
      if (previous !== nextItem.id) game.groundClassArsenal.push({ id: game.nextId++, arsenalId: previous, x: classDrop.x + 16, y: classDrop.y + 12, phase: Math.random() * 6 });
      burst(game, classDrop.x, classDrop.y, nextItem.color, 18, 115);
      setMessage(game, `EQUIPPED // ${nextItem.name.toUpperCase()} — ${nextItem.mechanic}`);
      beep(nextItem.rarity === "rare" ? 880 : 740, .15);
      return;
    }
    const weaponDrop = game.groundWeapons.find((drop) => dist(drop, p) < 42);
    if (weaponDrop) {
      const previousWeapon = p.weaponId;
      p.weaponId = weaponDrop.weaponId;
      setArmory((current) => {
        const weapons = [...new Set([...current.weapons, weaponDrop.weaponId])];
        localStorage.setItem("signal-depths-discovered-weapons", JSON.stringify(weapons));
        return { ...current, weapons };
      });
      const definition = getWeapon(weaponDrop.weaponId);
      p.ammo = definition.ammo ?? 0;
      game.groundWeapons = game.groundWeapons.filter((drop) => drop.id !== weaponDrop.id);
      if (previousWeapon !== weaponDrop.weaponId) game.groundWeapons.push({ id: game.nextId++, weaponId: previousWeapon, x: weaponDrop.x + 16, y: weaponDrop.y + 12, phase: Math.random() * 6 });
      burst(game, weaponDrop.x, weaponDrop.y, definition.rarity === "rare" ? "#a78bfa" : "#f4d35e", 16, 100);
      setMessage(game, `EQUIPPED // ${definition.name.toUpperCase()} — ${definition.description}`);
      beep(760, .14);
      return;
    }
    const groundItem = game.groundItems.find((item) => dist(item, p) < 38);
    if (groundItem) {
      if (groundItem.kind === "tonic") p.potions++;
      if (groundItem.kind === "bomb") p.bombs++;
      if (groundItem.kind === "fury") p.furyVials++;
      game.groundItems = game.groundItems.filter((item) => item.id !== groundItem.id);
      game.score += 75;
      burst(game, groundItem.x, groundItem.y, groundItem.kind === "tonic" ? "#34d399" : groundItem.kind === "bomb" ? "#76c7dc" : "#ff4d6d", 12, 90);
      setMessage(game, `PICKUP: ${groundItem.kind === "tonic" ? "[1] VITAL TONIC" : groundItem.kind === "bomb" ? "[2] ROOMBREAKER BOMB" : "[3] FURY VIAL"}`);
      beep(640, .1);
      return;
    }
    const secret = game.secrets.find((entry) => !entry.discovered && dist(entry, p) < 46);
    if (secret) {
      secret.discovered = true;
      game.secretsFound++;
      const secretScore = Math.round(500 * game.hype);
      game.score += secretScore;
      addHype(game, .2);
      if (secret.reward === "tonic") p.potions++;
      if (secret.reward === "bomb") p.bombs++;
      if (secret.reward === "fury") p.furyVials++;
      game.shake = Math.max(game.shake, .24);
      burst(game, secret.x, secret.y, "#76c7dc", 28, 130);
      game.combatText.push({ x: secret.x, y: secret.y - 28, text: `SECRET +${secretScore}`, life: 1.1, maxLife: 1.1, color: "#f4d35e", scale: 1 });
      setMessage(game, `SECRET CHAMBER ${game.secretsFound}/${game.secretsTotal} // ${secretRewardLabel(secret.reward)} +${secretScore}`);
      beep(920, .2);
      return;
    }
    const pylon = game.pylons.find((x) => !x.active && dist(x, p) < 42);
    if (pylon) {
      pylon.active = true;
      burst(game, pylon.x, pylon.y, "#f4d35e", 20, 115);
      const count = game.pylons.filter((x) => x.active).length;
      game.score += 280 * count;
      addHype(game, .35);
      if (count === game.pylons.length) {
        game.bossAwakenTime = 2.6;
        game.bossEngaged = false;
        game.shake = .45;
      }
      setMessage(game, count === 3 ? game.floorNumber === 2 ? "ALL SIGNALS LIVE // THE SHADOW SEAL BREAKS" : "ALL SIGNALS LIVE // THE WARDEN WAKES" : `PYLON ${count}/3 ONLINE // AUDIENCE LOCKED IN`);
      beep(720, 0.18);
      return;
    }
    const chest = game.chests.find((x) => !x.open && dist(x, p) < 42);
    if (chest) {
      chest.open = true;
      chest.openFx = .8;
      burst(game, chest.x, chest.y, "#f4d35e", 14, 90);
      const chestRoomKind = game.roomKinds[roomIndexFor(chest.x, chest.y)];
      if (chestRoomKind === "loot" && Math.random() < .5) {
        releaseLootAmbush(game, chest);
        addHype(game, 4);
        game.shake = .22;
        setMessage(game, "GAMBLER'S CACHE // AMBUSH RELEASED — THEY CAN FOLLOW");
        beep(105, .2);
        return;
      }
      const lootTable: ItemKind[] = ["tonic", "bomb", "fury"];
      const firstKind = lootTable[Math.floor(Math.random() * lootTable.length)];
      const equipment = selectClassEquipmentDrop(p.classId, chestRoomKind === "elite" || game.cursedItemId === "idol_open_mic");
      game.groundItems.push(
        { id: game.nextId++, kind: firstKind, x: chest.x - 18, y: chest.y + 18, phase: Math.random() * 6 },
      );
      game.groundEquipment.push({ id: game.nextId++, equipmentId: equipment.id, x: chest.x + 18, y: chest.y + 18, phase: Math.random() * 6 });
      game.score += 180;
      setMessage(game, chestRoomKind === "loot" ? `GAMBLER'S CACHE // PAYOUT — ${equipment.rarity.toUpperCase()} ${equipment.slot.toUpperCase()}` : `CACHE OPEN // ${equipment.rarity.toUpperCase()} ${equipment.slot.toUpperCase()} DROP`);
      beep(610, 0.15);
      return;
    }
    if (game.bossDead && Math.hypot(p.x - EXIT_X, p.y - EXIT_Y) < 44) {
      game.score += Math.round(game.time * 10 + p.hp * 5 + game.explored.size * 100);
      if (game.floorNumber === 1) {
        const nextFloor = makeNextFloor(game);
        gameRef.current = nextFloor;
        keysRef.current.clear();
        setScreen("playing");
        setHud(makeHud(nextFloor));
        canvasRef.current?.focus();
      } else {
        game.screen = "won";
        setMessage(game, "FLOOR 02 CLEARED // SHADOW NETWORK SILENCED");
        syncScreen(game);
      }
      beep(860, 0.25);
    }
  }, [beep, syncScreen]);

  const pressAction = useCallback((action: "attack" | "heavy" | "dodge" | "interact" | "potion" | "bomb" | "fury") => {
    if (action === "attack") attack();
    if (action === "heavy") heavyAttack();
    if (action === "dodge") dodge();
    if (action === "interact") interact();
    if (action === "potion") drinkPotion();
    if (action === "bomb") activateItem("bomb");
    if (action === "fury") activateItem("fury");
  }, [activateItem, attack, dodge, drinkPotion, heavyAttack, interact]);

  useEffect(() => {
    setHighScore(storedNumber(localStorage.getItem("signal-depths-high-score")));
    setRunHistory(parseRunHistory(localStorage.getItem(RUN_HISTORY_STORAGE_KEY)));
    const snapshot: ArmorySnapshot = {
      weapons: parseStoredArray(localStorage.getItem("signal-depths-discovered-weapons"), ["cleaver" as WeaponId], (value): value is WeaponId => typeof value === "string" && value in WEAPONS),
      equipment: parseStoredArray(localStorage.getItem("signal-depths-discovered-equipment"), [], (value): value is EquipmentId => typeof value === "string" && EQUIPMENT_IDS.includes(value as EquipmentId)),
      enemies: parseStoredArray(localStorage.getItem("signal-depths-discovered-enemies"), [], (value): value is EnemyKind => typeof value === "string" && value in enemyStats),
      unlocks: parseStoredArray(localStorage.getItem("signal-depths-unlocks"), [], (value): value is string => typeof value === "string" && PERMANENT_UNLOCKS.some((unlock) => unlock.id === value)),
      runs: storedNumber(localStorage.getItem("signal-depths-lifetime-runs")),
      kills: storedNumber(localStorage.getItem("signal-depths-lifetime-kills")),
    };
    setArmory(snapshot);
    const savedMeta = parseMetaProgressionProfile(localStorage.getItem(META_PROGRESSION_STORAGE_KEY));
    setMetaProfile(savedMeta);
    const savedArchive = parseArchiveProfile(localStorage.getItem(ARCHIVE_STORAGE_KEY));
    const migratedArchive = mergeCompletedRunDiscoveries(savedArchive, {
      enemies: snapshot.enemies,
      weapons: snapshot.weapons,
      classArsenals: ["signal-grimoire", "relay-recurve"],
    }).profile;
    setArchiveProfile(migratedArchive);
    localStorage.setItem(ARCHIVE_STORAGE_KEY, JSON.stringify(migratedArchive));
    const savedChallengeProgress = parseChallengeProgress(localStorage.getItem(CHALLENGE_PROGRESS_STORAGE_KEY));
    const hydratedChallengeProgress = {
      ...savedChallengeProgress,
      lifetimeRuns: Math.max(savedChallengeProgress.lifetimeRuns ?? 0, snapshot.runs),
      lifetimeKills: Math.max(savedChallengeProgress.lifetimeKills ?? 0, snapshot.kills),
    };
    setChallengeProgress(hydratedChallengeProgress);
    const savedChallenges = parseStoredArray(localStorage.getItem(SELECTED_CHALLENGES_STORAGE_KEY), [], (value): value is ChallengeModifierId =>
      typeof value === "string" && CHALLENGE_MODIFIERS.some((modifier) => modifier.id === value)
    );
    const validChallenges = savedChallenges.reduce<ChallengeModifierId[]>((selected, id) => {
      const candidate = [...selected, id];
      return validateChallengeSelection(candidate, hydratedChallengeProgress).valid ? candidate : selected;
    }, []);
    setSelectedChallengeIds(validChallenges);
    const savedStarter = localStorage.getItem("signal-depths-starter-weapon") as WeaponId | null;
    const allowedStarters: WeaponId[] = ["cleaver", ...(snapshot.unlocks.includes("weapon_spear") ? ["spear" as WeaponId] : []), ...(snapshot.unlocks.includes("weapon_hammer") ? ["hammer" as WeaponId] : [])];
    if (savedStarter && allowedStarters.includes(savedStarter)) setStarterWeapon(savedStarter);
    const savedClass = localStorage.getItem("signal-depths-player-class") as PlayerClassId | null;
    if (savedClass && PLAYER_CLASS_IDS.includes(savedClass)) setSelectedClass(savedClass);
    const savedContract = localStorage.getItem("signal-depths-broadcast-contract") as BroadcastContractId | null;
    if (savedContract && savedContract in BROADCAST_CONTRACTS) setSelectedContract(savedContract);
    const savedRunMode = localStorage.getItem("signal-depths-run-mode");
    if (savedRunMode === "daily" || savedRunMode === "standard") setSelectedRunMode(savedRunMode);
    const savedControlMode = localStorage.getItem("signal-depths-control-mode") as ControlMode | null;
    if (savedControlMode === "keyboard" || savedControlMode === "mouse") {
      controlModeRef.current = savedControlMode;
      setControlMode(savedControlMode);
    }
    const savedTesterMode = localStorage.getItem("signal-depths-tester-mode") === "true";
    testerModeRef.current = savedTesterMode;
    setTesterMode(savedTesterMode);
    gameRef.current.testerMode = savedTesterMode;
    if (savedTesterMode) applyTesterLoadout(gameRef.current);
    try {
      const savedComfort = JSON.parse(localStorage.getItem("signal-depths-comfort-settings") || "{}") as Partial<ComfortSettings>;
      const nextComfort: ComfortSettings = {
        aimLine: typeof savedComfort.aimLine === "boolean" ? savedComfort.aimLine : true,
        mouseAimScale: typeof savedComfort.mouseAimScale === "number" ? Math.max(.6, Math.min(1.4, savedComfort.mouseAimScale)) : 1,
        holdToAttack: typeof savedComfort.holdToAttack === "boolean" ? savedComfort.holdToAttack : false,
        keyboardAimAssist: typeof savedComfort.keyboardAimAssist === "boolean" ? savedComfort.keyboardAimAssist : false,
        screenShake: savedComfort.screenShake === "off" || savedComfort.screenShake === "low" || savedComfort.screenShake === "full" ? savedComfort.screenShake : "full",
        highContrastTelegraphs: typeof savedComfort.highContrastTelegraphs === "boolean" ? savedComfort.highContrastTelegraphs : false,
        effectsVolume: typeof savedComfort.effectsVolume === "number" ? Math.max(0, Math.min(1, savedComfort.effectsVolume)) : 1,
      };
      comfortSettingsRef.current = nextComfort;
      setComfortSettings(nextComfort);
    } catch {
      // Ignore malformed preferences and retain accessible defaults.
    }
  }, []);

  useEffect(() => {
    const stopHeldAttack = () => { mouseAttackHeld.current = false; };
    window.addEventListener("pointerup", stopHeldAttack);
    window.addEventListener("pointercancel", stopHeldAttack);
    window.addEventListener("blur", stopHeldAttack);
    return () => {
      window.removeEventListener("pointerup", stopHeldAttack);
      window.removeEventListener("pointercancel", stopHeldAttack);
      window.removeEventListener("blur", stopHeldAttack);
    };
  }, []);

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
      if (!event.repeat) {
        if (armoryOpen) {
          if (key === "escape") closeArchive();
          return;
        }
        if (key === "?" || key === "h") {
          if (helpOpen) closeHelp();
          else openHelp();
          return;
        }
        if (helpOpen && key === "escape") {
          closeHelp();
          return;
        }
        if (helpOpen) return;
        if (key === "shift") shiftUsedForHeavy.current = false;
        if (key === " ") {
          if (event.shiftKey || keysRef.current.has("shift")) {
            shiftUsedForHeavy.current = true;
            heavyAttack();
          } else attack();
        }
        if (key === "j") attack();
        if (key === "k") dodge();
        if (key === "f") {
          const game = gameRef.current;
          const gearNearby = game.groundEquipment.some((drop) => dist(drop, game.player) < 42) || game.groundCursedItems.some((drop) => dist(drop, game.player) < 42);
          if (gearNearby) interactHoldTimer.current = setTimeout(interact, 520);
          else interact();
        }
        if (key === "e") drinkPotion();
        if (key === "1") activateItem("tonic");
        if (key === "2") activateItem("bomb");
        if (key === "3") activateItem("fury");
        if (key === "escape") {
          const game = gameRef.current;
          if (game.screen === "playing") game.screen = "paused";
          else if (game.screen === "paused") game.screen = "playing";
          syncScreen(game);
        }
      }
      keysRef.current.add(key);
    };
    const onUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "f" && interactHoldTimer.current) {
        clearTimeout(interactHoldTimer.current);
        interactHoldTimer.current = null;
      }
      if (key === "shift" && !shiftUsedForHeavy.current && !helpOpen && !armoryOpen) dodge();
      if (key === "shift") shiftUsedForHeavy.current = false;
      keysRef.current.delete(key);
    };
    window.addEventListener("keydown", onDown, { passive: false });
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      if (interactHoldTimer.current) clearTimeout(interactHoldTimer.current);
    };
  }, [activateItem, armoryOpen, attack, closeArchive, closeHelp, dodge, drinkPotion, heavyAttack, helpOpen, interact, openHelp, syncScreen]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let hudClock = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const game = gameRef.current;
      updateGame(game, keysRef.current, dt, controlModeRef.current);
      if (mouseAttackHeld.current && comfortSettingsRef.current.holdToAttack && controlModeRef.current === "mouse") attack();
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) renderGameV2(ctx, game, controlModeRef.current, comfortSettingsRef.current);
      hudClock += dt;
      if (hudClock > 0.1) {
        hudClock = 0;
        setHud(makeHud(game));
        if (game.screen !== screen) syncScreen(game);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [attack, screen, syncScreen]);

  const currentGame = gameRef.current;
  const runSummary = summarizeRun(runStatsFor(currentGame));
  const baseFragmentReward = calculateSignalFragmentReward(runSummary);
  const displayedFragmentReward = currentGame.fragmentReward || applyChallengeReward(baseFragmentReward.total, challengeFragmentMultiplier(currentGame.challengeIds));
  const activeDare = AUDIENCE_DARES.find((dare) => dare.id === currentGame.activeDareId) ?? AUDIENCE_DARES[0];
  const activeAudienceModifier = audienceModifierFor(currentGame);
  const damageBreakdown = Object.entries(currentGame.damageBySource).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const mostUsedWeapon = (Object.entries(currentGame.weaponAttacks) as Array<[WeaponId, number]>).sort((a, b) => b[1] - a[1])[0];
  const hitsPerAttack = mostUsedWeapon && mostUsedWeapon[1] > 0 ? (currentGame.weaponHits[mostUsedWeapon[0]] / mostUsedWeapon[1]).toFixed(1) : "0.0";

  return (
    <main className="game-page">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-kicker">CHANNEL 13 // LIVE DESCENT</span>
          <h1>SIGNAL DEPTHS</h1>
        </div>
        <div className="run-stats" aria-label="Run statistics">
          <span><b>{String(hud.time).padStart(3, "0")}</b> SEC</span>
          <span><b>{String(hud.score).padStart(6, "0")}</b> SCORE</span>
          <span><b>×{hud.hype.toFixed(1)}</b> HYPE</span>
        </div>
      </header>

      <section className="game-shell" aria-label="Signal Depths game">
        <aside className="side-panel status-panel">
          <p className="panel-label">SUBJECT 404{" // "}{hud.className.toUpperCase()}</p>
          <Meter label="Vital" value={hud.hp} max={hud.maxHp} tone="health" />
          <Meter label="Drive" value={hud.stamina} max={100} tone="stamina" />
          {hud.classId !== "knight" && <Meter label={hud.resourceName} value={hud.classResource} max={hud.classResourceMax} tone={hud.classId === "mage" ? "mana" : "quiver"} />}
          <div className="inventory-grid">
            <button onClick={() => activateItem("tonic")} aria-label={`Use vital tonic, ${testerMode ? "unlimited" : hud.potions} available`}><kbd>1</kbd><span>TONIC</span><b>{testerMode ? "∞" : `×${hud.potions}`}</b></button>
            <button onClick={() => activateItem("bomb")} aria-label={`Use room bomb, ${testerMode ? "unlimited" : hud.bombs} available`}><kbd>2</kbd><span>BOMB</span><b>{testerMode ? "∞" : `×${hud.bombs}`}</b></button>
            <button className={hud.furyTime > 0 ? "active" : ""} onClick={() => activateItem("fury")} aria-label={`Use fury vial, ${testerMode ? "unlimited" : hud.furyVials} available`}><kbd>3</kbd><span>FURY</span><b>{testerMode ? "∞" : hud.furyTime > 0 ? `${Math.ceil(hud.furyTime)}s` : `×${hud.furyVials}`}</b></button>
          </div>
          <div className="objective-card">
            <span>CURRENT DIRECTIVE</span>
            <strong>{hud.objective}</strong>
          </div>
          <button className="help-launcher" onClick={openHelp} aria-label="Open crawler field guide" aria-haspopup="dialog">
            <b>?</b><span>CRAWLER FIELD GUIDE</span><kbd>H</kbd>
          </button>
          <div className="weapon-card">
            <span>{hud.classId === "knight" ? "ACTIVE WEAPON" : "CLASS FOCUS"}</span>
            <strong>{hud.weaponName}</strong>
            <small>{hud.classId === "archer" ? `${hud.ammo} ARROWS // ${CLASS_ARSENAL[currentGame.player.classArsenalId].mechanic.toUpperCase()}${currentGame.player.reloadTime > 0 ? " // RELOADING" : ""}` : hud.classId === "mage" ? CLASS_ARSENAL[currentGame.player.classArsenalId].mechanic.toUpperCase() : hud.ammo > 0 ? `${hud.ammo} ROUNDS` : "UNLIMITED"}</small>
            <small>BUILD // {buildSynergyFor(currentGame).name.toUpperCase()}</small>
          </div>
          <div className="gear-rack">
            <span>LOADOUT</span>
            {(["armor", "boots", "charm", "mod"] as EquipmentSlot[]).map((slot) => {
              const id = currentGame.equipped[slot];
              return <p key={slot}><b>{slot}</b><em>{id ? EQUIPMENT[id].name : "EMPTY"}</em></p>;
            })}
          </div>
          {hud.cursedItemId && (() => {
            const item = getCursedItem(hud.cursedItemId);
            if (!item) return null;
            const effects = cursedEffectLines(item);
            return <div className="carried-curse"><span>CURSED RELIC // {hud.cursedRoomsCleared} ROOMS CARRIED</span><strong>{item.name}</strong><small className="curse-upside">{effects.upside} · +{item.hypePerRoom} Hype/room</small><small className="curse-downside">{effects.downside}</small></div>;
          })()}
        </aside>

        <div className="stage-wrap">
          <div className="broadcast-strip"><i />LIVE FEED 001{testerMode && <b className="tester-mode-badge">TESTER MODE // LIMITERS OFF</b>}<i /></div>
          <div className="canvas-frame">
            <canvas
              ref={canvasRef}
              width={WIDTH}
              height={HEIGHT}
              tabIndex={0}
              className={controlMode === "mouse" ? "mouse-aim" : ""}
              aria-label={controlMode === "mouse" ? "Top-down dungeon game. Use WASD to move, the mouse to aim, left click to attack, right click for a heavy attack, Shift or K to dodge, F to interact, and number keys 1, 2, and 3 to use items." : "Top-down dungeon game. Use WASD to move and aim, Space to attack, Shift plus Space for a heavy attack, Shift or K to dodge, F to interact, and number keys 1, 2, and 3 to use items."}
              onPointerMove={aimAtPointer}
              onPointerDown={handleCanvasPointerDown}
              onContextMenu={handleCanvasContextMenu}
            />
            {screen === "title" && (
              <div className="game-overlay title-overlay">
                <div className="signal-icon" aria-hidden="true"><span /></div>
                <p>THE FLOOR IS LISTENING</p>
                <h2>SURVIVE THE FEED.<br />STEAL THE SIGNAL.</h2>
                <p className="intro-copy">Twelve unknown rooms. Three signal pylons. One audience waiting for a spectacular escape.</p>
                <div className="title-actions"><button onClick={openClassSelection}>ENTER THE DEPTHS</button><button className="secondary" onClick={() => setArmoryOpen(true)}>SIGNAL ARCHIVE{unacknowledgedArchiveIds(archiveProfile).length > 0 ? ` · ${unacknowledgedArchiveIds(archiveProfile).length} NEW` : ""}</button></div>
                <small>{metaProfile.signalFragments} SIGNAL FRAGMENTS AVAILABLE</small>
                {highScore > 0 && <small>LOCAL RECORD // {highScore.toLocaleString()}</small>}
              </div>
            )}
            {screen === "class-select" && (
              <div className="game-overlay class-select-overlay">
                <p>CHOOSE YOUR SIGNAL</p>
                <h2>WHO ENTERS THE DEPTHS?</h2>
                <div className="class-select-grid">
                  {PLAYER_CLASS_IDS.map((classId) => {
                    const entry = PLAYER_CLASSES[classId];
                    return <button key={classId} className={`class-choice ${selectedClass === classId ? "selected" : ""}`} onClick={() => setSelectedClass(classId)} style={{ "--class-color": entry.color } as CSSProperties}>
                      <ClassArt classId={classId} />
                      <span>{entry.role}</span><strong>{entry.name}</strong><em>{entry.tagline}</em>
                      <small>{entry.strengths}</small>
                    </button>;
                  })}
                </div>
                <div className="class-detail"><b>{PLAYER_CLASSES[selectedClass].basicName}</b><span>{PLAYER_CLASSES[selectedClass].basicDescription}</span><b>{PLAYER_CLASSES[selectedClass].heavyName}</b><span>{PLAYER_CLASSES[selectedClass].heavyDescription}</span></div>
                <div className="run-mode-select" role="radiogroup" aria-label="Choose run mode">
                  <button role="radio" aria-checked={selectedRunMode === "standard"} className={selectedRunMode === "standard" ? "selected" : ""} onClick={() => setSelectedRunMode("standard")}>
                    <span>STANDARD DESCENT</span><small>Fresh random signal every run.</small>
                  </button>
                  <button role="radio" aria-checked={selectedRunMode === "daily"} className={selectedRunMode === "daily" ? "selected" : ""} onClick={() => setSelectedRunMode("daily")}>
                    <span>DAILY BROADCAST // {localDateKey()}</span><small>One deterministic two-floor signal for everyone today.</small>
                  </button>
                </div>
                <div className="contract-heading"><span>BROADCAST CONTRACT</span><small>Choose the risk the audience is paying to see.</small></div>
                <div className="contract-select-grid" role="radiogroup" aria-label="Choose broadcast contract">
                  {(Object.values(BROADCAST_CONTRACTS) as BroadcastContract[]).map((contract) => <button key={contract.id} role="radio" aria-checked={selectedContract === contract.id} className={`contract-choice ${selectedContract === contract.id ? "selected" : ""}`} onClick={() => setSelectedContract(contract.id)}>
                    <span>{contract.name}</span><strong>{contract.tagline}</strong><small className="contract-risk">RISK // {contract.risk}</small><small className="contract-reward">PAYOUT // {contract.reward}</small>
                  </button>)}
                </div>
                <div className="kit-challenge-row">
                  <div className="selected-kit-card">
                    <span>STARTING KIT</span>
                    {(() => {
                      const kit = STARTER_KITS.find((entry) => entry.classId === selectedClass)!;
                      const unlocked = metaProfile.unlockedKitIds.includes(kit.id);
                      const selected = metaProfile.selectedKitId === kit.id;
                      return <button disabled={!unlocked} className={selected ? "selected" : ""} onClick={() => chooseStarterKit(selected ? null : kit.id)}><b>{unlocked ? kit.name : "STANDARD ISSUE"}</b><small>{unlocked ? selected ? "ACTIVE // CLICK FOR STANDARD ISSUE" : kit.description : `Unlock ${kit.name} in the Signal Archive · ${kit.cost} fragments`}</small></button>;
                    })()}
                  </div>
                  <div className="challenge-summary"><span>CHALLENGE STACK</span><b>{selectedChallengeIds.length}/3 ACTIVE</b><small>×{challengeScoreMultiplier(selectedChallengeIds).toFixed(2)} score · ×{challengeFragmentMultiplier(selectedChallengeIds).toFixed(2)} fragments</small></div>
                </div>
                <div className="challenge-select-grid" aria-label="Challenge modifiers">
                  {CHALLENGE_MODIFIERS.map((challenge) => {
                    const unlocked = isChallengeUnlocked(challenge, challengeProgress);
                    const selected = selectedChallengeIds.includes(challenge.id);
                    return <button key={challenge.id} disabled={!unlocked} aria-pressed={selected} className={`${selected ? "selected" : ""} ${unlocked ? "" : "locked"}`} onClick={() => toggleChallenge(challenge.id)}><span>{challenge.name}</span><small>{unlocked ? challenge.risk : "unlock" in challenge ? challenge.unlock.label : "LOCKED"}</small><em>+{Math.round((challenge.scoreMultiplier - 1) * 100)}% SCORE</em></button>;
                  })}
                </div>
                <div className="class-actions"><button className="secondary" onClick={() => { gameRef.current.screen = "title"; setScreen("title"); }}>BACK</button><button onClick={startGame}>DESCEND AS {PLAYER_CLASSES[selectedClass].name.toUpperCase()}</button></div>
              </div>
            )}
            {screen === "playing" && hud.nearbyEquipmentId && !hud.nearbyCursedItemId && (() => {
              const item = EQUIPMENT[hud.nearbyEquipmentId];
              const equippedId = currentGame.equipped[item.slot];
              const equipped = equippedId ? EQUIPMENT[equippedId] : null;
              return <div className={`loot-compare ${item.rarity}`}><span>{item.rarity} {item.slot}</span><strong>{item.name}</strong><p>{item.perk}{" // "}{item.detail}</p><i>{equipped ? `REPLACES: ${equipped.name} — ${equipped.detail}` : `${item.slot.toUpperCase()} SLOT EMPTY`}</i><small>HOLD <kbd>F</kbd> TO SWAP</small></div>;
            })()}
            {screen === "playing" && hud.nearbyCursedItemId && (() => {
              const item = getCursedItem(hud.nearbyCursedItemId);
              if (!item) return null;
              const effects = cursedEffectLines(item);
              const carried = getCursedItem(hud.cursedItemId);
              return <div className="loot-compare cursed"><span>CURSED // ONE RELIC LIMIT</span><strong>{item.name}</strong><p>{item.description}</p><i className="curse-upside">UPSIDE // {effects.upside} · +{item.hypePerRoom} Hype per cleared room</i><i className="curse-downside">CURSE // {effects.downside}</i><small>HOLD <kbd>F</kbd> TO {carried ? `REPLACE ${carried.name.toUpperCase()}` : "CARRY"}</small></div>;
            })()}
            {screen === "upgrade" && (
              <div className="game-overlay upgrade-overlay">
                <p>OFF-AIR SHELTER // ONE CHOICE</p>
                <h2>INSTALL A RUN UPGRADE</h2>
                <div className="upgrade-grid">
                  {currentGame.upgradeChoices.map((upgradeId) => {
                    const upgrade = RUN_UPGRADES.find((candidate) => candidate.id === upgradeId);
                    if (!upgrade) return null;
                    return (
                      <button key={upgrade.id} onClick={() => chooseUpgrade(upgrade.id)}>
                        <small>{upgrade.rarity.toUpperCase()}</small>
                        <strong>{upgrade.name}</strong>
                        <span>{upgrade.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {screen === "paused" && (
              <div className="pause-actions"><button onClick={() => { gameRef.current.screen = "playing"; syncScreen(gameRef.current); }}>RESUME FEED</button></div>
            )}
            {(screen === "won" || screen === "lost") && (
              <div className={`game-overlay result-overlay ${screen}`}>
                <p>{currentGame.runMode === "daily" ? `DAILY BROADCAST // ${currentGame.dailyKey}` : "STANDARD BROADCAST"} · {screen === "won" ? "FLOOR TRANSMISSION COMPLETE" : "SIGNAL LOST"}</p>
                <div className="result-grade"><b>{runSummary.grade}</b><span>{runSummary.gradeLabel}</span></div>
                <div className="result-score"><span>FINAL SCORE</span><b>{hud.score.toLocaleString()}</b></div>
                <div className="result-stats">
                  <span><b>{runSummary.explorationPercent}%</b> EXPLORED</span>
                  <span><b>{currentGame.kills}</b> KILLS</span>
                  <span><b>{currentGame.priorRoomsCleared + currentGame.roomsCleared}</b> CLEARED</span>
                  <span><b>{currentGame.secretsFound}</b> SECRETS</span>
                  <span><b>×{currentGame.maxHype.toFixed(1)}</b> MAX HYPE</span>
                </div>
                <div className="result-breakdown">
                  <div><span>DAMAGE REPORT</span>{damageBreakdown.length ? damageBreakdown.map(([source, amount]) => <p key={source}><b>{source}</b><em>{Math.round(amount)}</em></p>) : <p><b>Untouched</b><em>0</em></p>}</div>
                  <div><span>COMBAT READOUT</span><p><b>{currentGame.player.classId === "knight" ? (mostUsedWeapon?.[1] ? getWeapon(mostUsedWeapon[0]).name : "No weapon used") : CLASS_ARSENAL[currentGame.player.classArsenalId].name}</b><em>{currentGame.player.classId === "knight" ? `${mostUsedWeapon?.[1] ?? 0} ATK` : PLAYER_CLASSES[currentGame.player.classId].role.split(" // ")[0]}</em></p>{currentGame.player.classId === "knight" && <p><b>Hits per attack</b><em>{hitsPerAttack}</em></p>}{screen === "lost" && <p><b>Signal lost in</b><em>{currentGame.deathRoomKind?.toUpperCase() ?? (currentGame.time <= 0 ? "TIMEOUT" : "UNKNOWN")}</em></p>}</div>
                  <div><span>ROUTE TAKEN</span><p className="route-trace"><b>{currentGame.routeTaken.map((kind) => kind.toUpperCase()).join(" → ")}</b></p></div>
                  <div><span>SIGNAL FRAGMENTS</span><p><b>Base transmission</b><em>+{baseFragmentReward.total}</em></p><p><b>Challenge stack</b><em>×{challengeFragmentMultiplier(currentGame.challengeIds).toFixed(2)}</em></p><p className="fragment-total"><b>Archive payout</b><em>+{displayedFragmentReward}</em></p></div>
                </div>
                {runSummary.highlights.length > 0 && <p className="result-highlights">HIGHLIGHTS // {runSummary.highlights.join(" · ")}</p>}
                {currentGame.newUnlocks.length > 0 && <p className="unlock-line">UNLOCKED // {currentGame.newUnlocks.join(" + ")}</p>}
                {currentGame.newDiscoveries.length > 0 && <div className="discovery-callouts"><span>NEW SIGNALS ARCHIVED</span>{currentGame.newDiscoveries.slice(0, 5).map((name) => <b key={name}>{name}</b>)}</div>}
                <button onClick={openClassSelection}>CHOOSE NEXT CRAWLER</button>
              </div>
            )}
          </div>
          <div className="message-feed"><span>FLOORCAST</span><p>{hud.message}</p></div>
        </div>

        <aside className="side-panel map-panel">
          <p className="panel-label">{`FLOOR ${String(currentGame.floorNumber).padStart(2, "0")} // TRACE`}</p>
          <MiniMap game={currentGame} />
          <div className="progress-list">
            <p><span>ROOMS TRACED</span><b>{hud.rooms}/{ROOM_COLS * ROOM_ROWS}</b></p>
            <p><span>ROOMS CLEARED</span><b>{hud.roomsCleared}/{ROOM_COLS * ROOM_ROWS}</b></p>
            <p><span>SECRETS FOUND</span><b>{hud.secretsFound}/{hud.secretsTotal}</b></p>
            <p><span>PYLONS LIVE</span><b>{hud.pylons}/3</b></p>
            <p><span>{bossDisplayName(currentGame.enemies.find((enemy) => enemy.kind === "boss"))}</span><b>{currentGame.bossDead ? "DOWN" : hud.pylons === 3 ? "LIVE" : "DORMANT"}</b></p>
          </div>
          <div className={`dare-card ${currentGame.dareComplete ? "complete" : ""}`}>
            <span>AUDIENCE DARE</span>
            <strong>{hud.dareName}</strong>
            <p>{activeDare.briefing}</p>
            <i><em style={{ width: `${Math.min(100, (hud.dareProgress / Math.max(1, hud.dareTarget)) * 100)}%` }} /></i>
            <small>{currentGame.dareComplete ? "COMPLETE" : `${hud.dareProgress}/${hud.dareTarget}`}</small>
          </div>
          {activeAudienceModifier && <div className="active-contract"><span>AUDIENCE RULE // {currentGame.audienceModifierRooms} ROOM{currentGame.audienceModifierRooms === 1 ? "" : "S"}</span><strong>{activeAudienceModifier.name}</strong><small>{activeAudienceModifier.description}</small></div>}
          <div className="active-contract"><span>ACTIVE CONTRACT</span><strong>{BROADCAST_CONTRACTS[currentGame.contractId].name}</strong><small>{BROADCAST_CONTRACTS[currentGame.contractId].risk}{" // "}{Math.round((currentGame.scoreMultiplier - 1) * 100)}% SCORE BONUS</small></div>
        </aside>
      </section>

      <section className="touch-controls" aria-label="Touch controls">
        <div className="dpad">
          <button aria-label="Move up" onPointerDown={() => keysRef.current.add("w")} onPointerUp={() => keysRef.current.delete("w")}>▲</button>
          <button aria-label="Move left" onPointerDown={() => keysRef.current.add("a")} onPointerUp={() => keysRef.current.delete("a")}>◀</button>
          <button aria-label="Move down" onPointerDown={() => keysRef.current.add("s")} onPointerUp={() => keysRef.current.delete("s")}>▼</button>
          <button aria-label="Move right" onPointerDown={() => keysRef.current.add("d")} onPointerUp={() => keysRef.current.delete("d")}>▶</button>
        </div>
        <div className="action-pad">
          <button onClick={() => pressAction("potion")}>1 TONIC</button>
          <button onClick={() => pressAction("bomb")}>2 BOMB</button>
          <button onClick={() => pressAction("fury")}>3 FURY</button>
          <button onClick={() => pressAction("interact")}>USE</button>
          <button onClick={() => pressAction("dodge")}>DODGE</button>
          <button className="heavy-button" onClick={() => pressAction("heavy")}>HEAVY</button>
          <button className="attack-button" onClick={() => pressAction("attack")}>HIT</button>
        </div>
      </section>
      {helpOpen && (
        <HelpGuide
          section={helpSection}
          controlMode={controlMode}
          comfortSettings={comfortSettings}
          testerMode={testerMode}
          onSectionChange={setHelpSection}
          onControlModeChange={chooseControlMode}
          onComfortSettingChange={updateComfortSetting}
          onTesterModeChange={chooseTesterMode}
          onClose={closeHelp}
        />
      )}
      {armoryOpen && <ArmoryModal
        snapshot={armory}
        history={runHistory}
        starterWeapon={starterWeapon}
        metaProfile={metaProfile}
        archiveProfile={archiveProfile}
        archiveCategory={archiveCategory}
        onArchiveCategoryChange={setArchiveCategory}
        onBuyKit={buyStarterKit}
        onSelectKit={chooseStarterKit}
        onStarterChange={(weapon) => { setStarterWeapon(weapon); localStorage.setItem("signal-depths-starter-weapon", weapon); }}
        onClose={closeArchive}
      />}
      <footer><span>AN ORIGINAL ARCADE DESCENT</span><span>ESC // PAUSE</span><span>LOCAL SAVE ENABLED</span></footer>
    </main>
  );
}

function ArmoryModal({ snapshot, history, starterWeapon, metaProfile, archiveProfile, archiveCategory, onArchiveCategoryChange, onBuyKit, onSelectKit, onStarterChange, onClose }: {
  snapshot: ArmorySnapshot;
  history: readonly RunHistoryEntry[];
  starterWeapon: WeaponId;
  metaProfile: MetaProgressionProfile;
  archiveProfile: ArchiveDiscoveryProfile;
  archiveCategory: ArchiveCategoryId;
  onArchiveCategoryChange: (category: ArchiveCategoryId) => void;
  onBuyKit: (kitId: StarterKitId) => void;
  onSelectKit: (kitId: StarterKitId | null) => void;
  onStarterChange: (weapon: WeaponId) => void;
  onClose: () => void;
}) {
  const starterUnlock: Partial<Record<WeaponId, string>> = { spear: "weapon_spear", hammer: "weapon_hammer" };
  const archiveProgress = archiveCategoryProgress(archiveProfile);
  const discoveredTotal = archiveProgress.reduce((total, entry) => total + entry.discovered, 0);
  return (
    <div className="help-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="help-dialog armory-dialog" role="dialog" aria-modal="true" aria-labelledby="armory-title">
        <header className="help-header"><div><span>PERSISTENT COLLECTION // LOCAL SAVE</span><h2 id="armory-title">THE SIGNAL ARCHIVE</h2></div><button className="help-close" onClick={onClose} aria-label="Close Signal Archive">×</button></header>
        <div className="armory-summary"><p><b>{metaProfile.signalFragments}</b> FRAGMENTS</p><p><b>{discoveredTotal}/{ARCHIVE_ENTRIES.length}</b> SIGNALS</p><p><b>{snapshot.runs}</b> RUNS</p><p><b>{metaProfile.unlockedKitIds.length}/{STARTER_KITS.length}</b> KITS</p></div>
        <div className="armory-scroll">
          <section className="starter-kit-archive"><span className="guide-kicker">UNLOCKABLE STARTING KITS</span><h3>Spend fragments on sidegrades for future runs.</h3><div className="starter-kit-grid">
            {STARTER_KITS.map((kit) => {
              const unlocked = metaProfile.unlockedKitIds.includes(kit.id);
              const selected = metaProfile.selectedKitId === kit.id;
              return <article key={kit.id} className={selected ? "selected" : ""}><span>{PLAYER_CLASSES[kit.classId].name.toUpperCase()}{" // "}{kit.cost} FRAGMENTS</span><h4>{kit.name}</h4><p>{kit.description}</p><small>TRADEOFF{" // "}{kit.tradeoff}</small>{unlocked ? <button className={selected ? "selected" : ""} onClick={() => onSelectKit(selected ? null : kit.id)}>{selected ? "ACTIVE // USE STANDARD ISSUE" : "SELECT KIT"}</button> : <button disabled={metaProfile.signalFragments < kit.cost} onClick={() => onBuyKit(kit.id)}>{metaProfile.signalFragments >= kit.cost ? `UNLOCK FOR ${kit.cost}` : `NEED ${kit.cost - metaProfile.signalFragments} MORE`}</button>}</article>;
            })}
          </div></section>
          <section className="signal-catalog"><span className="guide-kicker">ARCHIVE COMPENDIUM</span><h3>Unknown signals remain corrupted until encountered.</h3>
            <nav className="archive-category-tabs" aria-label="Archive categories">{ARCHIVE_CATEGORIES.map((category) => { const progress = archiveProgress.find((entry) => entry.category === category.id)!; return <button key={category.id} className={archiveCategory === category.id ? "active" : ""} onClick={() => onArchiveCategoryChange(category.id)}><b>{category.name}</b><small>{progress.discovered}/{progress.total}</small></button>; })}</nav>
            <div className="archive-entry-grid">{ARCHIVE_ENTRIES.filter((entry) => entry.category === archiveCategory).map((entry) => { const view = archivePresentation(entry, archiveProfile); return <article key={entry.id} className={view.discovered ? "decoded" : view.state}><i>{view.glyph}</i><div><span>{view.discovered ? "DECODED" : view.state.toUpperCase()}</span><h4>{view.name}</h4><p>{view.summary}</p>{view.detail && <small>{view.detail}</small>}</div></article>; })}</div>
          </section>
          <section className="run-history"><span className="guide-kicker">RECENT TRANSMISSIONS</span><h3>Run history saved on this device.</h3>
            {history.length > 0 ? <div className="run-history-list">{history.map((entry) => <article key={entry.id}>
              <b className={`history-grade grade-${entry.grade.toLowerCase()}`}>{entry.grade}</b>
              <div><span>{entry.mode === "daily" ? `DAILY // ${entry.dailyKey}` : "STANDARD"} · {new Date(entry.endedAt).toLocaleDateString()}</span><strong>{PLAYER_CLASSES[entry.classId].name} · {entry.boss}</strong><small>{entry.won ? "ESCAPED" : "SIGNAL LOST"} · {entry.roomsCleared} ROOMS · {entry.kills} KILLS · ×{entry.maxHype.toFixed(1)} HYPE</small></div>
              <em>{entry.score.toLocaleString()}</em>
            </article>)}</div> : <p className="empty-history">No completed transmissions recorded yet.</p>}
          </section>
          <section><span className="guide-kicker">STARTING WEAPON</span><h3>Choose what enters the next run.</h3><div className="armory-grid weapon-collection">
            {Object.values(WEAPONS).map((weapon) => {
              const discovered = snapshot.weapons.includes(weapon.id);
              const unlockId = starterUnlock[weapon.id];
              const eligible = weapon.id === "cleaver" || Boolean(unlockId && snapshot.unlocks.includes(unlockId));
              return <article key={weapon.id} className={`collection-card ${discovered ? "" : "locked"}`}><GuideWeaponArt weapon={weapon.id} /><div><span>{discovered ? weapon.rarity : "UNKNOWN"}</span><h4>{discovered ? weapon.name : "UNDISCOVERED"}</h4><p>{discovered ? weapon.description : "Find this weapon during a run to reveal it."}</p>{eligible ? <button className={starterWeapon === weapon.id ? "selected" : ""} onClick={() => onStarterChange(weapon.id)}>{starterWeapon === weapon.id ? "SELECTED" : "START WITH THIS"}</button> : <small>{unlockId ? PERMANENT_UNLOCKS.find((entry) => entry.id === unlockId)?.description : "Discover in the dungeon"}</small>}</div></article>;
            })}
          </div></section>
          <section><span className="guide-kicker">EQUIPMENT ARCHIVE</span><h3>Four slots. Twelve build-changing perks.</h3><div className="armory-grid gear-collection">{EQUIPMENT_IDS.map((id) => { const item = EQUIPMENT[id]; const found = snapshot.equipment.includes(id); return <article key={id} className={`collection-card gear ${found ? item.rarity : "locked"}`}><EquipmentArt item={id} /><div><span>{found ? `${item.rarity} // ${item.slot}` : "UNKNOWN SIGNAL"}</span><h4>{found ? item.name : "UNDISCOVERED"}</h4><p>{found ? `${item.perk}: ${item.detail}` : "Open caches and clear dangerous encounters to find it."}</p></div></article>; })}</div></section>
          <section><span className="guide-kicker">THREAT ARCHIVE</span><h3>Enemies logged across every broadcast.</h3><div className="armory-grid enemy-collection">{ENEMY_GUIDE.map((enemy) => { const found = snapshot.enemies.includes(enemy.kind); return <article key={enemy.kind} className={`collection-card ${found ? "" : "locked"}`}><GuideEnemyArt kind={enemy.kind} /><div><span>{found ? enemy.role : "NO SIGNAL"}</span><h4>{found ? enemy.name : "UNIDENTIFIED"}</h4><p>{found ? enemy.tip : "Encounter this threat to record its field data."}</p></div></article>; })}</div></section>
        </div>
        <footer className="help-footer"><span>FRAGMENTS, DISCOVERIES, AND STARTING KITS SAVE ON THIS DEVICE</span><button onClick={onClose}>RETURN TO THE FEED</button></footer>
      </section>
    </div>
  );
}

function EquipmentArt({ item }: { item: EquipmentId }) {
  const definition = EQUIPMENT[item];
  return <div className={`equipment-art ${definition.slot}`} style={{ "--gear-color": definition.color } as CSSProperties} aria-hidden="true"><i /><b /><em /></div>;
}

function ClassArt({ classId }: { classId: PlayerClassId }) {
  return <div className={`class-art ${classId}`} aria-hidden="true"><i /><b /><em /><span /></div>;
}

function HelpGuide({ section, controlMode, comfortSettings, testerMode, onSectionChange, onControlModeChange, onComfortSettingChange, onTesterModeChange, onClose }: {
  section: HelpSection;
  controlMode: ControlMode;
  comfortSettings: ComfortSettings;
  testerMode: boolean;
  onSectionChange: (section: HelpSection) => void;
  onControlModeChange: (mode: ControlMode) => void;
  onComfortSettingChange: <K extends keyof ComfortSettings>(key: K, value: ComfortSettings[K]) => void;
  onTesterModeChange: (enabled: boolean) => void;
  onClose: () => void;
}) {
  const [guideClass, setGuideClass] = useState<PlayerClassId>("knight");
  const [arsenalClass, setArsenalClass] = useState<PlayerClassId>("knight");
  const sections: Array<{ id: HelpSection; label: string }> = [
    { id: "mission", label: "Mission" },
    { id: "classes", label: "Classes" },
    { id: "controls", label: "Controls" },
    { id: "arsenal", label: "Arsenal" },
    { id: "enemies", label: "Enemies" },
    { id: "rooms", label: "Rooms" },
  ];
  return (
    <div className="help-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="help-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <header className="help-header">
          <div><span>SUBJECT 404 // SURVIVAL FILE</span><h2 id="help-title">CRAWLER FIELD GUIDE</h2></div>
          <button className="help-close" onClick={onClose} aria-label="Close field guide" autoFocus>×</button>
        </header>
        <nav className="help-tabs" aria-label="Field guide sections">
          {sections.map((entry) => <button key={entry.id} className={section === entry.id ? "active" : ""} onClick={() => onSectionChange(entry.id)}>{entry.label}</button>)}
        </nav>
        <div className="help-content">
          {section === "mission" && (
            <div className="guide-mission">
              <div className="guide-hero-art" aria-hidden="true"><i /><b /><em /></div>
              <div>
                <p className="guide-kicker">THE SHORT VERSION</p>
                <h3>Make it through twelve unknown rooms and escape the broadcast.</h3>
                <ol>
                  <li><b>Explore.</b> Only your current room is visible. Doorways reveal nothing about what waits beyond.</li>
                  <li><b>Power the feed.</b> Find and activate three golden signal pylons with <kbd>F</kbd>.</li>
                  <li><b>Get stronger.</b> Open caches, collect items, swap weapons, and choose upgrades in safe rooms.</li>
                  <li><b>Beat the Warden.</b> The skull-marked boss gate shows your live pylon count and opens once all three pylons are active. The arena seals until the Warden falls.</li>
                </ol>
                <div className="guide-callout"><strong>HYPE = SCORE POWER</strong><span>Clear rooms and complete audience dares to raise your multiplier and trigger sponsor drops.</span></div>
                <div className="guide-callout audience-guide-callout"><strong>AUDIENCE VOTES // ROOMS 3, 6, AND 9</strong><span>At each milestone, the audience deterministically chooses one of two temporary rules. The HUD shows its remaining clears. Every clear—including maze routes—earns its payout and consumes one room. “No Healing” blocks tonics, kill healing, rest nodes, upgrades, equipment, curses, and sponsor healing until it expires.</span></div>
                <div className="audience-rule-grid">
                  {AUDIENCE_MODIFIERS.map((modifier) => <article key={modifier.id}><b>{modifier.name}</b><span>{modifier.durationRooms} ROOM{modifier.durationRooms === 1 ? "" : "S"}{" // "}{modifier.ballot}</span><small>{modifier.description}</small></article>)}
                </div>
              </div>
            </div>
          )}
          {section === "controls" && (
            <div className="guide-section">
              <div className="control-mode-setting">
                <div><span>CONTROL PROFILE</span><strong>Choose how your crawler aims and attacks.</strong><small>This preference saves on this device and can be changed at any time.</small></div>
                <div className="control-mode-options" role="group" aria-label="Choose control mode">
                  <button className={controlMode === "keyboard" ? "active" : ""} aria-pressed={controlMode === "keyboard"} onClick={() => onControlModeChange("keyboard")}><kbd>WASD + KEYS</kbd><b>Keyboard only</b><small>Movement sets your facing direction.</small></button>
                  <button className={controlMode === "mouse" ? "active" : ""} aria-pressed={controlMode === "mouse"} onClick={() => onControlModeChange("mouse")}><kbd>MOUSE</kbd><b>Mouse aim</b><small>Left click attacks. Right click uses your heavy attack.</small></button>
                </div>
              </div>
              <div className={`tester-mode-setting ${testerMode ? "active" : ""}`}>
                <div><span>GAME TESTER MODE</span><strong>Remove combat and resource limits.</strong><small>Grants invulnerability, unlimited time, stamina, mana, arrows, ammunition and items, plus instant attack, heavy-attack and dodge recovery. This preference saves on this device.</small></div>
                <button className={testerMode ? "active" : ""} aria-pressed={testerMode} onClick={() => onTesterModeChange(!testerMode)}>{testerMode ? "ENABLED" : "DISABLED"}</button>
              </div>
              <div className="comfort-settings" aria-label="Comfort and accessibility settings">
                <div className="comfort-setting-row">
                  <div><strong>Aim guide</strong><small>Show the dotted line between your crawler and mouse reticle.</small></div>
                  <button className={comfortSettings.aimLine ? "active" : ""} aria-pressed={comfortSettings.aimLine} onClick={() => onComfortSettingChange("aimLine", !comfortSettings.aimLine)}>{comfortSettings.aimLine ? "ON" : "OFF"}</button>
                </div>
                <label className="comfort-setting-row volume-setting">
                  <div><strong>Mouse aim range</strong><small>Scales how far the in-game reticle follows pointer movement.</small></div>
                  <span><input type="range" min="60" max="140" step="10" value={Math.round(comfortSettings.mouseAimScale * 100)} onChange={(event) => onComfortSettingChange("mouseAimScale", Number(event.target.value) / 100)} aria-label="Mouse aim range" /><b>{Math.round(comfortSettings.mouseAimScale * 100)}%</b></span>
                </label>
                <div className="comfort-setting-row">
                  <div><strong>Hold to attack</strong><small>Keep left click held to repeat basic attacks as recovery allows.</small></div>
                  <button className={comfortSettings.holdToAttack ? "active" : ""} aria-pressed={comfortSettings.holdToAttack} onClick={() => onComfortSettingChange("holdToAttack", !comfortSettings.holdToAttack)}>{comfortSettings.holdToAttack ? "ON" : "OFF"}</button>
                </div>
                <div className="comfort-setting-row">
                  <div><strong>Keyboard aim assist</strong><small>Gently nudges attacks toward a nearby target already close to your facing direction.</small></div>
                  <button className={comfortSettings.keyboardAimAssist ? "active" : ""} aria-pressed={comfortSettings.keyboardAimAssist} onClick={() => onComfortSettingChange("keyboardAimAssist", !comfortSettings.keyboardAimAssist)}>{comfortSettings.keyboardAimAssist ? "ON" : "OFF"}</button>
                </div>
                <div className="comfort-setting-row">
                  <div><strong>High-contrast telegraphs</strong><small>Give incoming enemy attacks thicker white outlines and stronger fills.</small></div>
                  <button className={comfortSettings.highContrastTelegraphs ? "active" : ""} aria-pressed={comfortSettings.highContrastTelegraphs} onClick={() => onComfortSettingChange("highContrastTelegraphs", !comfortSettings.highContrastTelegraphs)}>{comfortSettings.highContrastTelegraphs ? "ON" : "OFF"}</button>
                </div>
                <div className="comfort-setting-row shake-setting">
                  <div><strong>Screen shake</strong><small>Low reduces camera movement. Off also serves as reduced-motion mode.</small></div>
                  <div className="comfort-segments" role="group" aria-label="Screen shake intensity">
                    {(["off", "low", "full"] as ScreenShakeLevel[]).map((level) => <button key={level} className={comfortSettings.screenShake === level ? "active" : ""} aria-pressed={comfortSettings.screenShake === level} onClick={() => onComfortSettingChange("screenShake", level)}>{level.toUpperCase()}</button>)}
                  </div>
                </div>
                <label className="comfort-setting-row volume-setting">
                  <div><strong>Effects volume</strong><small>Controls attack, impact, interaction, and menu sounds.</small></div>
                  <span><input type="range" min="0" max="100" step="10" value={Math.round(comfortSettings.effectsVolume * 100)} onChange={(event) => onComfortSettingChange("effectsVolume", Number(event.target.value) / 100)} aria-label="Effects volume" /><b>{Math.round(comfortSettings.effectsVolume * 100)}%</b></span>
                </label>
              </div>
              <div className="control-guide-grid">
                <GuideControl keys="W A S D" title="Move" copy={controlMode === "mouse" ? "Move independently while the pointer controls your aim." : "Travel, aim your next strike, and approach interactable objects."} />
                <GuideControl keys={controlMode === "mouse" ? "LEFT CLICK" : "SPACE / J"} title="Basic Attack" copy={controlMode === "mouse" && comfortSettings.holdToAttack ? "Hold left click to repeat your class's normal attack whenever it recovers." : controlMode === "keyboard" && comfortSettings.keyboardAimAssist ? "Attacks receive a modest nudge toward a nearby target already close to your facing direction." : "Use your class's normal strike, spell, or shot in the direction you face."} />
                <GuideControl keys={controlMode === "mouse" ? "RIGHT CLICK" : "SHIFT + SPACE"} title="Heavy Attack" copy="Commit class resources to a stronger attack with unique control or piercing behavior." />
                <GuideControl keys="SHIFT / K" title="Dodge" copy="Tap Shift or press K to spend Drive for a brief window of invulnerability." />
                <GuideControl keys="F / HOLD F" title="Interact" copy="Tap for objects and consumables. Hold near equipment to confirm a gear swap." />
                <GuideControl keys="1 / E" title="Vital Tonic" copy="Restore 45 health. It cannot be used while already at full health." />
                <GuideControl keys="2" title="Roombreaker Bomb" copy="Deal 55 damage to every unshielded enemy in your current room." />
                <GuideControl keys="3" title="Fury Vial" copy="Temporarily boosts weapon damage and can be improved by upgrades." />
                <GuideControl keys="ESC" title="Pause" copy="Freeze the broadcast. The field guide also pauses an active run." />
              </div>
            </div>
          )}
          {section === "classes" && (
            <div className="guide-section">
              <p className="guide-intro">Choose a crawler before each descent. Every class shares movement, dodging, items, and room objectives, but solves combat with a different range, resource, and heavy attack.</p>
              <nav className="class-guide-nav" aria-label="Choose a class to inspect">
                {PLAYER_CLASS_IDS.map((classId) => {
                  const entry = PLAYER_CLASSES[classId];
                  return <button key={classId} className={guideClass === classId ? "active" : ""} onClick={() => setGuideClass(classId)} style={{ "--class-color": entry.color } as CSSProperties}><span>{entry.role}</span><b>{entry.name}</b></button>;
                })}
              </nav>
              <div className="class-guide-grid">
                {(() => { const entry = PLAYER_CLASSES[guideClass]; return <article className="guide-card class-guide-card" key={guideClass} style={{ "--class-color": entry.color } as CSSProperties}><ClassArt classId={guideClass} /><div><span>{entry.role}</span><h3>{entry.name}{" // "}{entry.tagline}</h3><p>{entry.description}</p><div className="class-move-grid"><section><strong>BASIC{" // "}{entry.basicName}</strong><small>{entry.basicDescription}</small></section><section><strong>HEAVY{" // "}{entry.heavyName}</strong><small>{entry.heavyDescription}</small></section></div><em>STRONG: {entry.strengths}<br />WATCH: {entry.weakness}</em></div></article>; })()}
              </div>
            </div>
          )}
          {section === "arsenal" && (
            <div className="guide-section">
              <p className="guide-intro">Class-compatible arsenal drops appear after valuable encounters. Stand near one and press <kbd>F</kbd> to equip it; your previous weapon or focus drops to the floor.</p>
              <nav className="arsenal-filter" aria-label="Filter arsenal by class">
                {PLAYER_CLASS_IDS.map((classId) => <button key={classId} className={arsenalClass === classId ? "active" : ""} onClick={() => setArsenalClass(classId)} style={{ "--class-color": PLAYER_CLASSES[classId].color } as CSSProperties}><ClassArt classId={classId} /><span>{PLAYER_CLASSES[classId].role}</span><b>{PLAYER_CLASSES[classId].name}</b><small>{classId === "knight" ? `${Object.keys(WEAPONS).length} WEAPONS` : `${arsenalForClass(classId).length} ${classId === "mage" ? "SPELLS" : "WEAPONS"}`}</small></button>)}
              </nav>
              <div className="arsenal-grid">
                {arsenalClass === "knight" && Object.values(WEAPONS).map((weapon) => (
                  <article className="guide-card weapon-guide-card" key={weapon.id}>
                    <GuideWeaponArt weapon={weapon.id} />
                    <div><span>{weapon.rarity}{" // "}{weapon.damageType}</span><h3>{weapon.name}</h3><p>{weapon.description}</p><strong className="weapon-tactic">{WEAPON_TACTICS[weapon.id]}</strong><small>{weapon.damage} DMG · {weapon.range} RANGE · {weapon.cooldownMs}ms RECOVERY{weapon.ammo ? ` · ${weapon.ammo} AMMO` : ""}</small></div>
                  </article>
                ))}
                {arsenalClass !== "knight" && arsenalForClass(arsenalClass).map((item) => <article className="guide-card weapon-guide-card class-arsenal-card" key={item.id} style={{ "--arsenal-color": item.color } as CSSProperties}><GuideClassArsenalArt item={item.id} /><div><span>{item.rarity}{" // "}{item.damageType}</span><h3>{item.name}</h3><p>{item.description}</p><strong className="weapon-tactic">{item.mechanic}</strong><small>{item.damage} DMG · {Math.round(item.cooldown * 1000)}ms RECOVERY · {item.speed} SPEED{item.ammoCost ? ` · ${item.ammoCost} ARROW${item.ammoCost === 1 ? "" : "S"}` : ""}</small></div></article>)}
              </div>
              <p className="guide-intro equipment-guide-intro">Equipment occupies one of four slots: armor, boots, charm, or weapon mod. Matching perks creates builds that can change how you move, score, heal, and attack.</p>
              <div className="arsenal-grid">{EQUIPMENT_IDS.map((id) => { const item = EQUIPMENT[id]; return <article className="guide-card weapon-guide-card" key={id}><EquipmentArt item={id} /><div><span>{item.rarity}{" // "}{item.slot}</span><h3>{item.name}</h3><p><b>{item.perk}</b> — {item.detail}</p></div></article>; })}</div>
              <p className="guide-intro equipment-guide-intro">Build synergies activate automatically when your current arsenal matches an upgrade or equipment perk. The active build name appears beneath your weapon in the run HUD; changing either ingredient updates it immediately.</p>
              <div className="synergy-guide-grid">{BUILD_SYNERGY_GUIDE.filter((synergy) => synergy.classId === arsenalClass).map((synergy) => <article className="guide-card synergy-guide-card" key={synergy.id}><div><span>{PLAYER_CLASSES[synergy.classId].name} BUILD</span><h3>{synergy.name}</h3><p>{synergy.recipe}</p><strong>{synergy.payoff}</strong></div></article>)}</div>
              <p className="guide-intro equipment-guide-intro">Cursed relics occupy a separate one-item carry slot. Each grants a powerful upside and bonus Hype on every room clear, but its drawback remains active until you replace it.</p>
              <div className="curse-guide-grid">{CURSED_ITEMS.map((item) => { const effects = cursedEffectLines(item); return <article className="guide-card curse-guide-card" key={item.id}><div className="curse-guide-art" aria-hidden="true"><i /></div><div><span>CURSED // +{item.hypePerRoom} HYPE PER ROOM</span><h3>{item.name}</h3><p>{item.description}</p><strong>{effects.upside}</strong><em>{effects.downside}</em></div></article>; })}</div>
            </div>
          )}
          {section === "enemies" && (
            <div className="guide-section">
              <p className="guide-intro">Read the floor before the enemy: gold cones warn of melee strikes, violet lines mark incoming bolts, and red circles show blast zones. Dimmed enemies are recovering—punish them before they reset.</p>
              <div className="enemy-guide-grid">
                {ENEMY_GUIDE.map((enemy) => (
                  <article className="guide-card enemy-guide-card" key={enemy.kind}>
                    <GuideEnemyArt kind={enemy.kind} />
                    <div><span>{enemy.role}</span><h3>{enemy.name}</h3><p>{enemy.tip}</p></div>
                  </article>
                ))}
              </div>
            </div>
          )}
          {section === "rooms" && (
            <div className="guide-section">
              <p className="guide-intro">Each run rearranges the room types. Door clues preserve the mystery while supporting informed gambles: gold means reward, red means danger, green means rest, blue means an objective, and gray remains unknown.</p>
              <div className="room-guide-grid">
                {ROOM_GUIDE.map((room) => <article className={`room-guide-card ${room.kind}`} key={room.kind}><GuideRoomArt kind={room.kind} /><div><span>{room.kind}</span><h3>{room.name}</h3><p>{room.copy}</p></div></article>)}
              </div>
            </div>
          )}
        </div>
        <footer className="help-footer"><span>PRESS <kbd>?</kbd> OR <kbd>H</kbd> TO TOGGLE</span><button onClick={onClose}>RETURN TO THE FEED</button></footer>
      </section>
    </div>
  );
}

function GuideControl({ keys, title, copy }: { keys: string; title: string; copy: string }) {
  return <article className="control-guide-card"><kbd>{keys}</kbd><div><h3>{title}</h3><p>{copy}</p></div></article>;
}

function GuideWeaponArt({ weapon }: { weapon: WeaponId }) {
  return <div className={`guide-art weapon-art ${weapon}`} aria-hidden="true"><i /><b /><em /><span /></div>;
}

function GuideClassArsenalArt({ item }: { item: ClassArsenalId }) {
  const entry = CLASS_ARSENAL[item];
  return <div className={`guide-art class-arsenal-art ${entry.classId} ${entry.behavior}`} style={{ "--arsenal-color": entry.color } as CSSProperties} aria-hidden="true"><i /><b /><em /><span /></div>;
}

function GuideEnemyArt({ kind }: { kind: EnemyKind }) {
  return <div className={`guide-art enemy-art ${kind}`} aria-hidden="true"><i /><b /><em /><span /></div>;
}

function GuideRoomArt({ kind }: { kind: RoomKind }) {
  return <div className={`guide-art room-art ${kind}`} aria-hidden="true"><i /><b /><em /></div>;
}

function Meter({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  return (
    <div className={`meter ${tone}`}>
      <div><span>{label}</span><b>{value}/{max}</b></div>
      <i><em style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} /></i>
    </div>
  );
}

function MiniMap({ game }: { game: Game }) {
  const totalRooms = ROOM_COLS * ROOM_ROWS;
  const currentRoom = roomIndexFor(game.player.x, game.player.y);
  const bossRoom = game.roomKinds.findIndex((kind) => kind === "boss");
  const exitRoom = roomIndexFor(EXIT_X, EXIT_Y);
  const poweredPylons = new Set(
    game.pylons.filter((pylon) => pylon.active).map((pylon) => roomIndexFor(pylon.x, pylon.y)),
  );
  return (
    <div className="mini-map" aria-label={`${game.explored.size} of ${totalRooms} rooms discovered`}>
      {Array.from({ length: totalRooms }, (_, room) => (
        (() => {
          const seen = game.explored.has(String(room));
          const roomId = roomIdAtSlot(game.navigation, room);
          const visibleRoutes = (roomId ? game.navigation.connectionsByRoom[roomId] ?? [] : [])
            .filter((connection) => game.explored.has(String(connection.toSlot.index)));
          const bossState = room === bossRoom && seen ? game.bossDead ? "boss-down" : bossGateOpen(game) ? "boss-live" : "boss-locked" : "";
          const exitState = room === exitRoom && seen ? game.bossDead ? "exit-open" : "exit-locked" : "";
          const classes = [seen ? "seen" : "unknown", seen && game.roomCleared[room] ? "cleared" : "", room === currentRoom ? "current" : "", bossState, exitState].filter(Boolean).join(" ");
          const stateLabel = !seen ? "unknown" : [
            game.roomCleared[room] ? "cleared" : "discovered",
            room === currentRoom ? "current" : "",
            bossState.replace("-", " "),
            exitState.replace("-", " "),
            poweredPylons.has(room) ? "pylon powered" : "",
          ].filter(Boolean).join(", ");
          return <div key={room} className={classes} aria-label={`Room ${room + 1}: ${stateLabel}`}>
            {visibleRoutes.map((connection) => <i key={connection.doorId} className={`map-route ${connection.direction} ${connection.physicallyAdjacent ? "" : "linked"}`} />)}
            {seen ? <span className="room-id">{String(room + 1).padStart(2, "0")}</span> : null}
            {room === currentRoom ? <i className="current-dot" /> : null}
            {seen && poweredPylons.has(room) ? <i className="pylon-dot" /> : null}
            {room === bossRoom && seen && !game.bossDead ? <i className="boss-dot">!</i> : null}
            {room === exitRoom && seen ? <i className="exit-dot" /> : null}
          </div>;
        })()
      ))}
    </div>
  );
}
