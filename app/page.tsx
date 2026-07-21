"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { generateFloor, type RoomKind } from "./game/floor";
import { WEAPONS, getWeapon, selectWeaponDrop, type WeaponId } from "./game/combat-content";
import { EQUIPMENT, EQUIPMENT_IDS, selectEquipmentDrop, type EquipmentId, type EquipmentSlot } from "./game/equipment";
import { AUDIENCE_DARES, PERMANENT_UNLOCKS, RUN_UPGRADES, bossPhaseForHealth, chooseAudienceDares, chooseSafeRoomUpgrades, newlyEarnedUnlocks, sponsorRewardsCrossed, summarizeRun, type RunStats, type RunUpgradeId } from "./game/progression";
import { PLAYER_CLASSES, PLAYER_CLASS_IDS, type PlayerClassId } from "./game/classes";

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

type EnemyKind = "skitter" | "warden" | "spitter" | "healer" | "mimic" | "volatile" | "boss";
type Enemy = {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  cooldown: number;
  flash: number;
  windup: number;
  recovery: number;
  elite: boolean;
};
type ProjectileKind = "enemy" | "scrap" | "arc-bolt" | "arrow" | "power-arrow";
type Projectile = { x: number; y: number; vx: number; vy: number; life: number; damage: number; owner?: "enemy" | "player"; pierce?: number; weaponId?: WeaponId; kind?: ProjectileKind; splash?: number; splashDamage?: number; traveled?: number; slow?: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number };
type Pylon = { x: number; y: number; active: boolean };
type Chest = { x: number; y: number; open: boolean; openFx: number };
type ItemKind = "tonic" | "bomb" | "fury";
type GroundItem = { id: number; kind: ItemKind; x: number; y: number; phase: number };
type GroundWeapon = { id: number; weaponId: WeaponId; x: number; y: number; phase: number };
type GroundEquipment = { id: number; equipmentId: EquipmentId; x: number; y: number; phase: number };
type Trap = { x: number; y: number; phase: number };
type Screen = "title" | "class-select" | "playing" | "paused" | "upgrade" | "won" | "lost";
type HelpSection = "mission" | "classes" | "controls" | "arsenal" | "enemies" | "rooms";
type Game = {
  screen: Screen;
  player: {
    classId: PlayerClassId;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    stamina: number;
    classResource: number;
    reloadTime: number;
    damage: number;
    speed: number;
    dirX: number;
    dirY: number;
    attackCd: number;
    attackFx: number;
    dodgeCd: number;
    invuln: number;
    potions: number;
    bombs: number;
    furyVials: number;
    furyTime: number;
    weaponId: WeaponId;
    ammo: number;
    moving: boolean;
    stepTimer: number;
    heavyFx: number;
  };
  enemies: Enemy[];
  projectiles: Projectile[];
  particles: Particle[];
  pylons: Pylon[];
  chests: Chest[];
  groundItems: GroundItem[];
  groundWeapons: GroundWeapon[];
  groundEquipment: GroundEquipment[];
  traps: Trap[];
  explored: Set<string>;
  time: number;
  score: number;
  hype: number;
  kills: number;
  bossDead: boolean;
  safeUsed: boolean;
  message: string;
  messageTime: number;
  elapsed: number;
  nextId: number;
  shake: number;
  hitStop: number;
  floorSeed: number;
  roomKinds: RoomKind[];
  roomStarted: boolean[];
  roomCleared: boolean[];
  roomTimers: number[];
  currentRoomIndex: number;
  upgrades: RunUpgradeId[];
  upgradeChoices: RunUpgradeId[];
  activeDareId: string;
  dareProgress: number;
  dareComplete: boolean;
  damageTaken: number;
  damageBySource: Record<string, number>;
  deathRoomKind: RoomKind | null;
  weaponAttacks: Record<WeaponId, number>;
  weaponHits: Record<WeaponId, number>;
  equipped: Record<EquipmentSlot, EquipmentId | null>;
  discoveredEquipment: EquipmentId[];
  discoveredEnemies: EnemyKind[];
  maxHype: number;
  roomsCleared: number;
  lastBossPhase: string;
  resultsSaved: boolean;
  newUnlocks: string[];
  sponsorHypeChecked: number;
};

type Hud = {
  hp: number;
  maxHp: number;
  stamina: number;
  classId: PlayerClassId;
  className: string;
  resourceName: string;
  classResource: number;
  classResourceMax: number;
  time: number;
  score: number;
  hype: number;
  rooms: number;
  pylons: number;
  potions: number;
  bombs: number;
  furyVials: number;
  furyTime: number;
  weaponName: string;
  ammo: number;
  nearbyEquipmentId: EquipmentId | null;
  equipmentNames: string[];
  roomKind: RoomKind;
  roomsCleared: number;
  dareName: string;
  dareProgress: number;
  dareTarget: number;
  message: string;
  objective: string;
};

type ArmorySnapshot = {
  weapons: WeaponId[];
  equipment: EquipmentId[];
  enemies: EnemyKind[];
  unlocks: string[];
  runs: number;
  kills: number;
};

const EMPTY_ARMORY: ArmorySnapshot = { weapons: ["cleaver"], equipment: [], enemies: [], unlocks: [], runs: 0, kills: 0 };

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
  equipmentNames: [],
  roomKind: "safe",
  roomsCleared: 0,
  dareName: "Personal Space Denied",
  dareProgress: 0,
  dareTarget: 5,
  message: "SIGNAL ACQUIRED // SUBJECT 404 ENTERS THE FLOOR",
  objective: "Activate 3 signal pylons",
};

const enemyStats: Record<EnemyKind, Omit<Enemy, "id" | "kind" | "x" | "y" | "cooldown" | "flash" | "windup" | "recovery" | "elite">> = {
  skitter: { hp: 28, maxHp: 28, speed: 68, damage: 9 },
  warden: { hp: 65, maxHp: 65, speed: 39, damage: 16 },
  spitter: { hp: 34, maxHp: 34, speed: 48, damage: 8 },
  healer: { hp: 42, maxHp: 42, speed: 43, damage: 5 },
  mimic: { hp: 78, maxHp: 78, speed: 58, damage: 18 },
  volatile: { hp: 36, maxHp: 36, speed: 56, damage: 24 },
  boss: { hp: 260, maxHp: 260, speed: 46, damage: 20 },
};

const ENEMY_GUIDE: Array<{ kind: EnemyKind; name: string; role: string; tip: string }> = [
  { kind: "skitter", name: "Razorback Skitter", role: "Fast pack hunter", tip: "The striped carapace and six twitching legs are your warning: use wide swings before the pack surrounds you." },
  { kind: "warden", name: "Ironjaw Warden", role: "Armored bruiser", tip: "Watch its shield and raised shock-club. Dodge the heavy strike late, then punish the recovery." },
  { kind: "spitter", name: "Void Spitter", role: "Ranged controller", tip: "Its single bright eye tracks targets while its tentacles retreat. Close the gap or weave between purple bolts." },
  { kind: "healer", name: "Halo Medic", role: "Enemy support", tip: "Orbiting repair nodes identify this floating medic. Eliminate it before it restores wounded allies." },
  { kind: "mimic", name: "Gilt-Maw Mimic", role: "Treasure ambusher", tip: "Look for eyes beneath the golden lid. Strike, disengage, and stay clear of its tongue and double row of teeth." },
  { kind: "volatile", name: "Fusewalker", role: "Walking explosion", tip: "Its fuse and flashing containment ring mean detonation. Lure it near other enemies, then escape." },
  { kind: "boss", name: "Broadcast Warden", role: "Three-phase floor boss", tip: "Activate all three pylons first. Watch for phase changes and radial volleys." },
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
  { kind: "trap", name: "Trap", copy: "Read the floor rhythm and survive the hazard cycle." },
  { kind: "treasure", name: "Treasure", copy: "Open the cache—but be ready for a mimic." },
  { kind: "elite", name: "Elite", copy: "A dangerous squad guarding stronger loot." },
  { kind: "puzzle", name: "Puzzle", copy: "Activate its signal objective or clear its defender." },
  { kind: "broadcast", name: "Broadcast", copy: "A ratings challenge that rewards speed and aggression." },
  { kind: "boss", name: "Boss", copy: "The final arena. It stays sealed until all pylons are live." },
];

function routeHint(kind: RoomKind) {
  if (kind === "safe") return { icon: "+", label: "REST", color: "#34d399" };
  if (["treasure", "broadcast"].includes(kind)) return { icon: "$", label: "REWARD", color: "#f4d35e" };
  if (["elite", "boss", "survival"].includes(kind)) return { icon: "!", label: "DANGER", color: "#ff4d6d" };
  if (kind === "puzzle") return { icon: "◆", label: "SIGNAL", color: "#76c7dc" };
  return { icon: "?", label: "UNKNOWN", color: "#9aaba4" };
}

function makeGame(screen: Screen = "title", floorSeed = 40_413, classId: PlayerClassId = "knight"): Game {
  const playerClass = PLAYER_CLASSES[classId];
  const floor = generateFloor(floorSeed, { roomCount: ROOM_COLS * ROOM_ROWS });
  const roomKinds = floor.rooms.map((room) => room.kind);
  if (["elite", "survival", "broadcast"].includes(roomKinds[1])) roomKinds[1] = "ambush";
  let nextId = 1;
  const enemy = (kind: EnemyKind, tx: number, ty: number, roomIndex: number, elite = false): Enemy => {
    const stats = enemyStats[kind];
    const progression = kind === "boss" ? 1 : .82 + (roomIndex / Math.max(1, roomKinds.length - 1)) * .28;
    const hp = Math.round(stats.hp * progression * (elite ? 1.08 : 1));
    return {
      id: nextId++, kind, x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2,
      cooldown: Math.random() * 1.2, flash: 0, windup: 0, recovery: 0, elite,
      ...stats,
      hp, maxHp: hp,
      damage: Math.max(4, Math.round(stats.damage * progression)),
      speed: stats.speed * (.92 + progression * .08),
    };
  };

  const enemies: Enemy[] = [];
  const chests: Chest[] = [];
  const traps: Trap[] = [];
  roomKinds.forEach((kind, index) => {
    const col = index % ROOM_COLS;
    const row = Math.floor(index / ROOM_COLS);
    const tx = col * 8;
    const ty = row * 8;
    if (kind === "ambush") {
      enemies.push(enemy("skitter", tx + 3, ty + 3, index), enemy("skitter", tx + 6, ty + 5, index));
      if (index >= 3) enemies.push(enemy("spitter", tx + 5, ty + 2, index));
    }
    if (kind === "survival") enemies.push(enemy("skitter", tx + 2, ty + 5, index), enemy("skitter", tx + 6, ty + 2, index), enemy("warden", tx + 5, ty + 5, index));
    if (kind === "elite") enemies.push(enemy("warden", tx + 4, ty + 4, index, true), enemy("healer", tx + 6, ty + 2, index));
    if (kind === "broadcast") enemies.push(enemy("volatile", tx + 4, ty + 4, index), enemy("skitter", tx + 6, ty + 5, index));
    if (kind === "puzzle") enemies.push(enemy("spitter", tx + 5, ty + 3, index));
    if (kind === "treasure") enemies.push(enemy("mimic", tx + 5, ty + 5, index));
    if (kind === "boss") enemies.push(enemy("boss", tx + 4, ty + 4, index, true));
    if (["treasure", "elite", "broadcast"].includes(kind)) chests.push({ x: (tx + 2.5) * TILE, y: (ty + 5.5) * TILE, open: false, openFx: 0 });
    if (kind === "trap") {
      traps.push(
        { x: (tx + 3.5) * TILE, y: (ty + 3.5) * TILE, phase: 0 },
        { x: (tx + 4.5) * TILE, y: (ty + 3.5) * TILE, phase: .35 },
        { x: (tx + 5.5) * TILE, y: (ty + 4.5) * TILE, phase: .7 },
      );
    }
  });
  const pylonRoomIndices = [2, 5, 8];
  const pylons = pylonRoomIndices.map((index) => {
    const col = index % ROOM_COLS;
    const row = Math.floor(index / ROOM_COLS);
    return { x: (col * 8 + 4.5) * TILE, y: (row * 8 + 4.5) * TILE, active: false };
  });
  const dare = chooseAudienceDares(floorSeed, classId === "knight" ? [] : ["close_quarters"], 1)[0] ?? AUDIENCE_DARES[0];

  return {
    screen,
    player: {
      classId,
      x: 2.5 * TILE,
      y: 2.5 * TILE,
      hp: playerClass.hp,
      maxHp: playerClass.hp,
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
      potions: 2,
      bombs: 0,
      furyVials: 0,
      furyTime: 0,
      weaponId: "cleaver",
      ammo: 0,
      moving: false,
      stepTimer: 0,
      heavyFx: 0,
    },
    enemies,
    projectiles: [],
    particles: [],
    pylons,
    chests,
    groundItems: [],
    groundWeapons: [],
    groundEquipment: [],
    traps,
    explored: new Set(["0"]),
    time: 720,
    score: 0,
    hype: 1,
    kills: 0,
    bossDead: false,
    safeUsed: false,
    message: "SIGNAL ACQUIRED // SUBJECT 404 ENTERS THE FLOOR",
    messageTime: 4,
    elapsed: 0,
    nextId,
    shake: 0,
    hitStop: 0,
    floorSeed,
    roomKinds,
    roomStarted: roomKinds.map((_, index) => index === 0),
    roomCleared: roomKinds.map(() => false),
    roomTimers: roomKinds.map(() => 0),
    currentRoomIndex: 0,
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
    maxHype: 1,
    roomsCleared: 0,
    lastBossPhase: "",
    resultsSaved: false,
    newUnlocks: [],
    sponsorHypeChecked: 1,
  };
}

function isWallTile(tx: number, ty: number) {
  if (tx <= 0 || ty <= 0 || tx >= MAP_W - 1 || ty >= MAP_H - 1) return true;
  if (tx % 8 === 0 && ty % 8 !== 4) return true;
  if (ty % 8 === 0 && tx % 8 !== 4) return true;
  return false;
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

function encounterLocks(kind: RoomKind) {
  return ["ambush", "trap", "survival", "elite", "puzzle", "boss"].includes(kind);
}

function isRoomLocked(game: Game, roomIndex: number) {
  return Boolean(game.roomStarted[roomIndex] && !game.roomCleared[roomIndex] && encounterLocks(game.roomKinds[roomIndex]));
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

function moveEntity(entity: { x: number; y: number }, vx: number, vy: number, dt: number, radius = 10) {
  const nx = entity.x + vx * dt;
  if (canMove(nx, entity.y, radius)) entity.x = nx;
  const ny = entity.y + vy * dt;
  if (canMove(entity.x, ny, radius)) entity.y = ny;
}

function separateEnemyFromPlayer(game: Game, enemy: Enemy) {
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

function setMessage(game: Game, message: string) {
  game.message = message;
  game.messageTime = 3.2;
}

function hasEquipment(game: Game, id: EquipmentId) {
  return Object.values(game.equipped).includes(id);
}

function selectClassEquipmentDrop(classId: PlayerClassId, rareBoost = false) {
  if (classId === "knight") return selectEquipmentDrop(Math.random, rareBoost);
  const compatible: EquipmentId[] = ["scrap-plate", "shockweave-vest", "runner-boots", "phase-treads", "iron-stompers", "blood-token", "volatile-heart"];
  const preferred = compatible.filter((id) => rareBoost ? EQUIPMENT[id].rarity !== "common" : true);
  const pool = preferred.length ? preferred : compatible;
  return EQUIPMENT[pool[Math.floor(Math.random() * pool.length)] ?? "scrap-plate"];
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
    game.player.hp += 20;
  }
  if (!game.discoveredEquipment.includes(id)) game.discoveredEquipment.push(id);
  return previous;
}

function hurtPlayer(game: Game, amount: number, source: string) {
  if (source === "Void projectile" && hasEquipment(game, "shockweave-vest")) amount *= .75;
  amount = Math.round(amount);
  game.player.hp -= amount;
  game.damageTaken += amount;
  game.damageBySource[source] = (game.damageBySource[source] ?? 0) + amount;
}

function creditEnemyDeaths(game: Game, dead: Enemy[]) {
  dead.forEach((enemy) => {
    burst(game, enemy.x, enemy.y, enemy.kind === "boss" ? "#ff4d6d" : "#dce7e4", enemy.kind === "boss" ? 34 : 20, 175);
    burst(game, enemy.x, enemy.y, "#f4d35e", enemy.kind === "boss" ? 18 : 7, 90);
    game.kills++;
    if (game.upgrades.includes("blood_broadcast") && game.player.hp / game.player.maxHp < .35) game.player.hp = Math.min(game.player.maxHp, game.player.hp + 2);
    if (hasEquipment(game, "blood-token")) game.player.hp = Math.min(game.player.maxHp, game.player.hp + 3);
    game.hype += enemy.kind === "boss" ? 15 : 1.5;
    game.maxHype = Math.max(game.maxHype, game.hype);
    game.score += Math.round((enemy.kind === "boss" ? 1600 : 140) * game.hype);
    if (enemy.kind === "boss") {
      game.bossDead = true;
      setMessage(game, "WARDEN DOWN // EXIT CHANNEL UNLOCKED");
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

  game.traps.forEach((trap) => {
    const active = (game.elapsed + trap.phase) % 1.5 < 0.72;
    ctx.fillStyle = active ? "#ef4444" : "#3b2828";
    ctx.fillRect(trap.x - 13, trap.y - 13, 26, 26);
    ctx.fillStyle = active ? "#fca5a5" : "#6b3f3f";
    for (let i = -8; i <= 8; i += 8) {
      ctx.beginPath();
      ctx.moveTo(trap.x + i - 3, trap.y + 8);
      ctx.lineTo(trap.x + i, trap.y - 8);
      ctx.lineTo(trap.x + i + 3, trap.y + 8);
      ctx.fill();
    }
  });

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

  const activePylons = game.pylons.filter((pylon) => pylon.active).length;
  const boss = game.enemies.find((enemy) => enemy.kind === "boss");
  if (boss && activePylons < 3) {
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

function drawEnemySprite(ctx: CanvasRenderingContext2D, enemy: Enemy, time: number, player: Game["player"]) {
  const t = time * (enemy.kind === "skitter" ? 13 : 7) + enemy.id;
  const bob = Math.sin(t) * (enemy.kind === "boss" ? 1.2 : 1.7);
  const squash = enemy.flash > 0 ? 1.18 : 1;
  const flash = enemy.flash > 0;
  ctx.save();
  ctx.translate(Math.round(enemy.x), Math.round(enemy.y + bob));
  ctx.scale(squash, 2 - squash);
  ctx.globalAlpha = enemy.recovery > 0 ? .68 : 1;
  ctx.fillStyle = "rgba(0,0,0,.5)";
  ctx.fillRect(enemy.kind === "boss" ? -22 : -14, enemy.kind === "boss" ? 19 : 12, enemy.kind === "boss" ? 44 : 28, 5);

  if (enemy.windup > 0) {
    const aim = Math.atan2(player.y - enemy.y, player.x - enemy.x);
    const pulse = .58 + Math.sin(time * 24) * .2;
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.rotate(aim);
    if (enemy.kind === "volatile") {
      ctx.rotate(-aim);
      ctx.strokeStyle = "#ff4d6d"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(255,77,109,.12)";
      ctx.beginPath(); ctx.arc(0, 0, 70, 0, Math.PI * 2); ctx.fill();
    } else if (enemy.kind === "spitter") {
      ctx.strokeStyle = "#a78bfa"; ctx.lineWidth = 3; ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(Math.min(220, Math.hypot(player.x - enemy.x, player.y - enemy.y)), 0); ctx.stroke();
    } else {
      const reach = enemy.kind === "boss" ? 50 : enemy.kind === "mimic" ? 42 : 36;
      ctx.fillStyle = enemy.kind === "boss" ? "rgba(255,77,109,.22)" : "rgba(244,211,94,.2)";
      ctx.beginPath(); ctx.moveTo(5, 0); ctx.arc(0, 0, reach, -.48, .48); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = enemy.kind === "boss" ? "#ff4d6d" : "#f4d35e"; ctx.lineWidth = 2; ctx.stroke();
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

  const barW = enemy.kind === "boss" ? 46 : 28;
  const barY = enemy.y - (enemy.kind === "boss" ? 34 : 24);
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

function drawPlayerSprite(ctx: CanvasRenderingContext2D, game: Game) {
  const p = game.player;
  if (p.classId !== "knight") { drawRangedPlayerSprite(ctx, game); return; }
  const weapon = getWeapon(p.weaponId);
  const stride = p.moving ? Math.sin(game.elapsed * 13) : 0;
  const bob = p.moving ? Math.abs(stride) * -2 : Math.sin(game.elapsed * 3) * .5;
  const facingAngle = Math.atan2(p.dirY, p.dirX);
  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y + bob));
  if (game.shake > 0) ctx.rotate(Math.sin(game.elapsed * 80) * .035);
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
  const swingProgress = p.attackFx > 0 ? 1 - p.attackFx / .2 : 1;
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

function renderGameV2(ctx: CanvasRenderingContext2D, game: Game) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#050706";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const current = roomFor(game.player.x, game.player.y);
  const roomNumber = current.row * 3 + current.col + 1;
  const camX = current.col * 8 * TILE + 4 * TILE;
  const camY = current.row * 8 * TILE + 4 * TILE;
  const shakeX = game.shake > 0 ? (Math.random() - .5) * 7 : 0;
  const shakeY = game.shake > 0 ? (Math.random() - .5) * 7 : 0;

  ctx.save();
  ctx.beginPath();
  ctx.rect(128, 0, 512, 512);
  ctx.clip();
  ctx.setTransform(2, 0, 0, 2, WIDTH / 2 - camX * 2 + shakeX, HEIGHT / 2 - camY * 2 + shakeY);

  for (let ty = 0; ty < MAP_H; ty++) {
    for (let tx = 0; tx < MAP_W; tx++) {
      const wall = isWallTile(tx, ty);
      if (wall) {
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
  const roomLeft = current.col * 8 * TILE;
  const roomTop = current.row * 8 * TILE;
  const currentRoomIndex = current.row * ROOM_COLS + current.col;
  const roomLocked = isRoomLocked(game, currentRoomIndex);
  const doorY = roomTop + 4.5 * TILE;
  const doorX = roomLeft + 4.5 * TILE;
  const pulse = .72 + Math.sin(game.elapsed * 5) * .2;
  ctx.save();
  ctx.shadowColor = roomLocked ? "#ff4d6d" : "#f4d35e";
  ctx.shadowBlur = 10;
  ctx.fillStyle = roomLocked ? `rgba(255,77,109,${pulse})` : `rgba(244,211,94,${pulse})`;
  ctx.strokeStyle = roomLocked ? "#ff8fab" : "#fff3b0";
  ctx.lineWidth = 2;
  if (current.col > 0) {
    const hint = routeHint(game.roomKinds[currentRoomIndex - 1]);
    ctx.fillRect(roomLeft + 2, doorY - 24, 7, 48);
    ctx.strokeRect(roomLeft + 1, doorY - 27, 13, 54);
    drawPixelText(ctx, `◀ ${hint.icon}`, roomLeft + 28, doorY + 4, hint.color, "center");
    drawPixelText(ctx, hint.label, roomLeft + 40, doorY - 12, hint.color, "center");
  }
  if (current.col < ROOM_COLS - 1) {
    const hint = routeHint(game.roomKinds[currentRoomIndex + 1]);
    ctx.fillRect(roomLeft + 8 * TILE - 9, doorY - 24, 7, 48);
    ctx.strokeRect(roomLeft + 8 * TILE - 14, doorY - 27, 13, 54);
    drawPixelText(ctx, `${hint.icon} ▶`, roomLeft + 8 * TILE - 28, doorY + 4, hint.color, "center");
    drawPixelText(ctx, hint.label, roomLeft + 8 * TILE - 40, doorY - 12, hint.color, "center");
  }
  if (current.row > 0) {
    const hint = routeHint(game.roomKinds[currentRoomIndex - ROOM_COLS]);
    ctx.fillRect(doorX - 24, roomTop + 2, 48, 7);
    ctx.strokeRect(doorX - 27, roomTop + 1, 54, 13);
    drawPixelText(ctx, `▲ ${hint.icon} ${hint.label}`, doorX, roomTop + 27, hint.color, "center");
  }
  if (current.row < ROOM_ROWS - 1) {
    const hint = routeHint(game.roomKinds[currentRoomIndex + ROOM_COLS]);
    ctx.fillRect(doorX - 24, roomTop + 8 * TILE - 9, 48, 7);
    ctx.strokeRect(doorX - 27, roomTop + 8 * TILE - 14, 54, 13);
    drawPixelText(ctx, `▼ ${hint.icon} ${hint.label}`, doorX, roomTop + 8 * TILE - 20, hint.color, "center");
  }
  ctx.restore();

  const centerX = (current.col * 8 + 4) * TILE;
  const centerY = (current.row * 8 + 4) * TILE;
  ctx.strokeStyle = "#2c4a40";
  ctx.lineWidth = 2;
  ctx.strokeRect(centerX - 46, centerY - 46, 92, 92);
  drawPixelText(ctx, `ROOM ${String(roomNumber).padStart(2, "0")} // ${game.roomKinds[currentRoomIndex].toUpperCase()}`, centerX, centerY - 51, roomLocked ? "#ff8fab" : "#5a8876", "center");

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

  game.traps.forEach((trap) => {
    const active = (game.elapsed + trap.phase) % 1.5 < .72;
    ctx.fillStyle = active ? "#ef4444" : "#3b2828";
    ctx.fillRect(trap.x - 13, trap.y - 13, 26, 26);
    ctx.fillStyle = active ? "#fca5a5" : "#6b3f3f";
    for (let i = -8; i <= 8; i += 8) {
      ctx.beginPath();
      ctx.moveTo(trap.x + i - 3, trap.y + 8);
      ctx.lineTo(trap.x + i, trap.y - 8);
      ctx.lineTo(trap.x + i + 3, trap.y + 8);
      ctx.fill();
    }
  });

  game.pylons.forEach((pylon) => {
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

  game.chests.forEach((chest) => {
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

  game.groundWeapons.forEach((drop) => {
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
    if (shot.kind === "arc-bolt") {
      ctx.fillStyle = "rgba(167,139,250,.25)"; ctx.beginPath(); ctx.arc(shot.x, shot.y, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#a78bfa"; ctx.fillRect(shot.x - 5, shot.y - 5, 10, 10);
      ctx.fillStyle = "#fff"; ctx.fillRect(shot.x - 2, shot.y - 2, 4, 4);
    } else if (shot.kind === "arrow" || shot.kind === "power-arrow") {
      const angle = Math.atan2(shot.vy, shot.vx);
      ctx.save(); ctx.translate(shot.x, shot.y); ctx.rotate(angle);
      ctx.fillStyle = shot.kind === "power-arrow" ? "#d8ffe9" : "#d6b06a"; ctx.fillRect(-11, -1, shot.kind === "power-arrow" ? 28 : 22, shot.kind === "power-arrow" ? 3 : 2);
      ctx.fillStyle = "#34d399"; ctx.fillRect(10, -4, 7, 8); ctx.fillRect(-13, -4, 4, 8); ctx.restore();
    } else {
      ctx.fillStyle = shot.owner === "player" ? "rgba(244,211,94,.3)" : "rgba(255,77,109,.28)";
      ctx.fillRect(shot.x - 8, shot.y - 8, 16, 16);
      ctx.fillStyle = shot.owner === "player" ? "#f4d35e" : "#ff6b6b"; ctx.fillRect(shot.x - 4, shot.y - 4, 8, 8);
      ctx.fillStyle = "#fff"; ctx.fillRect(shot.x - 2, shot.y - 2, 4, 4);
    }
  });

  game.particles.forEach((particle) => {
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  });
  ctx.globalAlpha = 1;

  game.enemies.forEach((enemy) => drawEnemySprite(ctx, enemy, game.elapsed, game.player));
  drawPlayerSprite(ctx, game);

  const activePylons = game.pylons.filter((pylon) => pylon.active).length;
  const boss = game.enemies.find((enemy) => enemy.kind === "boss");
  if (boss && activePylons < 3) {
    ctx.strokeStyle = "rgba(255,77,109,.78)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, 32 + Math.sin(game.elapsed * 5) * 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  const p = game.player;
  let prompt = "";
  const nearbyItem = game.groundItems.find((item) => dist(item, p) < 38);
  const nearbyWeapon = game.groundWeapons.find((drop) => dist(drop, p) < 42);
  const nearbyEquipment = game.groundEquipment.find((drop) => dist(drop, p) < 42);
  if (nearbyEquipment) prompt = `[HOLD F] EQUIP ${EQUIPMENT[nearbyEquipment.equipmentId].name.toUpperCase()}`;
  else if (nearbyWeapon) prompt = `[F] EQUIP ${getWeapon(nearbyWeapon.weaponId).name.toUpperCase()}`;
  else if (nearbyItem) prompt = `[F] PICK UP ${nearbyItem.kind.toUpperCase()}`;
  else if (game.pylons.some((x) => !x.active && dist(x, p) < 42)) prompt = "[F] JACK IN";
  else if (game.chests.some((x) => !x.open && dist(x, p) < 42)) prompt = "[F] CRACK CACHE";
  else if (gateOpen && Math.hypot(p.x - EXIT_X, p.y - EXIT_Y) < 44) prompt = "[F] EXIT FLOOR";
  if (prompt) drawPixelText(ctx, prompt, p.x, p.y - 34, "#fff3b0", "center");
  ctx.restore();

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

  if (game.screen === "paused") {
    ctx.fillStyle = "rgba(4,6,6,.78)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawPixelText(ctx, "TRANSMISSION PAUSED", WIDTH / 2, HEIGHT / 2, "#f4d35e", "center");
  }
}

function updateGame(game: Game, keys: Set<string>, dt: number) {
  if (game.screen !== "playing") return;
  game.elapsed += dt;
  game.shake = Math.max(0, game.shake - dt);
  if (game.hitStop > 0) {
    game.hitStop = Math.max(0, game.hitStop - dt);
    return;
  }
  game.time = Math.max(0, game.time - dt);
  game.messageTime = Math.max(0, game.messageTime - dt);
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
      game.player.hp += reward.maxHealth;
    }
    if (threshold.id === "sponsor_cache" && game.player.classId === "knight") {
      const rareWeapon = selectWeaponDrop(Math.random, { exclude: [game.player.weaponId], allowedRarities: ["rare"] });
      if (rareWeapon) game.groundWeapons.push({ id: game.nextId++, weaponId: rareWeapon.id, x: game.player.x + 24, y: game.player.y + 18, phase: 0 });
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
    p.dirX = mx;
    p.dirY = my;
  }
  p.moving = Boolean(mx || my);
  const previousX = p.x;
  const previousY = p.y;
  const equipmentSpeed = hasEquipment(game, "runner-boots") ? 1.1 : 1;
  moveEntity(p, mx * p.speed * equipmentSpeed, my * p.speed * equipmentSpeed, dt, 9);
  if (p.moving && p.stepTimer <= 0) {
    p.stepTimer = .13;
    burst(game, p.x - p.dirX * 7, p.y - p.dirY * 7 + 10, "#607068", 2, 24);
  }

  let currentRoomIndex = roomIndexFor(p.x, p.y);
  const activePylonCount = game.pylons.filter((pylon) => pylon.active).length;
  if (game.roomKinds[currentRoomIndex] === "boss" && activePylonCount < 3) {
    p.x = previousX;
    p.y = previousY;
    currentRoomIndex = roomIndexFor(p.x, p.y);
    setMessage(game, `BOSS GATE SEALED // ${3 - activePylonCount} SIGNAL${3 - activePylonCount === 1 ? "" : "S"} MISSING`);
  }
  if (currentRoomIndex !== game.currentRoomIndex) {
    game.currentRoomIndex = currentRoomIndex;
    game.roomStarted[currentRoomIndex] = true;
    const kind = game.roomKinds[currentRoomIndex];
    setMessage(game, `${kind.toUpperCase()} ENCOUNTER // ${encounterLocks(kind) ? "DOORS LOCKING" : "SIGNAL ACQUIRED"}`);
  }
  const roomId = String(currentRoomIndex);
  if (!game.explored.has(roomId)) {
    game.explored.add(roomId);
    game.score += 120;
    game.hype += 3;
    game.maxHype = Math.max(game.maxHype, game.hype);
    setMessage(game, `NEW SIGNAL ZONE // ROOM ${game.explored.size} OF ${ROOM_COLS * ROOM_ROWS}`);
  }

  game.roomTimers[currentRoomIndex] += dt;
  if (isRoomLocked(game, currentRoomIndex)) {
    const room = roomFor(p.x, p.y);
    const inset = 17;
    p.x = Math.max(room.col * 8 * TILE + inset, Math.min((room.col + 1) * 8 * TILE - inset, p.x));
    p.y = Math.max(room.row * 8 * TILE + inset, Math.min((room.row + 1) * 8 * TILE - inset, p.y));
  }

  const safe = { x: SAFE_X, y: SAFE_Y };
  if (!game.safeUsed && dist(safe, p) < 28) {
    game.safeUsed = true;
    p.hp = p.maxHp;
    p.potions += 1;
    game.score += 200;
    game.upgradeChoices = chooseSafeRoomUpgrades(game.floorSeed, [], 8)
      .filter((upgrade) => p.classId === "knight" || !["razor_arc", "kinetic_return"].includes(upgrade.id))
      .slice(0, 3)
      .map((upgrade) => upgrade.id);
    game.screen = "upgrade";
    setMessage(game, "REST NODE CLAIMED // CHOOSE ONE RUN UPGRADE");
  }

  for (const trap of game.traps) {
    const active = (game.elapsed + trap.phase) % 1.5 < 0.72;
    if (active && dist(trap, p) < 19 && p.invuln <= 0) {
      hurtPlayer(game, 12, "Floor spikes");
      p.invuln = 0.8;
      game.shake = .18;
      burst(game, p.x, p.y, "#ff4d6d", 8, 105);
      game.hype = Math.max(1, game.hype - 0.2);
      setMessage(game, "FLOOR SPIKES // THE AUDIENCE WINCES");
    }
  }

  const activePylons = game.pylons.filter((pylon) => pylon.active).length;
  const playerRoom = roomFor(p.x, p.y);
  game.enemies.forEach((enemy) => {
    enemy.cooldown -= dt;
    enemy.flash = Math.max(0, enemy.flash - dt);
    enemy.recovery = Math.max(0, enemy.recovery - dt);
    const enemyRoom = roomFor(enemy.x, enemy.y);
    if (enemyRoom.col !== playerRoom.col || enemyRoom.row !== playerRoom.row) return;
    if (!game.discoveredEnemies.includes(enemy.kind)) game.discoveredEnemies.push(enemy.kind);
    if (enemy.kind === "boss" && activePylons < 3) return;
    const dx = p.x - enemy.x;
    const dy = p.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 235) return;
    const nx = dx / Math.max(1, distance);
    const ny = dy / Math.max(1, distance);
    if (enemy.recovery > 0) return;
    if (enemy.kind === "healer") {
      const ally = game.enemies
        .filter((candidate) => candidate.id !== enemy.id && roomIndexFor(candidate.x, candidate.y) === currentRoomIndex && candidate.hp < candidate.maxHp)
        .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
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
            if (other.id !== enemy.id && dist(other, enemy) < 70) other.hp -= 25;
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
      if (enemy.kind === "boss") {
        const phase = bossPhaseForHealth(enemy.hp, enemy.maxHp);
        if (phase.id !== game.lastBossPhase) {
          game.lastBossPhase = phase.id;
          setMessage(game, `BOSS PHASE // ${phase.name.toUpperCase()}`);
          game.shake = .35;
        }
      }
      const reach = enemy.kind === "boss" ? 34 : enemy.kind === "mimic" ? 28 : 24;
      if (enemy.windup > 0) {
        enemy.windup -= dt;
        if (enemy.windup <= 0 && distance < reach + 12 && p.invuln <= 0) {
          hurtPlayer(game, enemy.damage, enemy.kind === "boss" ? "Broadcast Warden" : enemy.kind === "warden" ? "Ironjaw strike" : enemy.kind === "mimic" ? "Mimic bite" : "Skitter slash");
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
      if (enemy.kind === "boss" && enemy.cooldown <= .05 && Math.random() < .06) {
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
  game.enemies = game.enemies.filter((enemy) => enemy.hp > 0);

  game.projectiles = game.projectiles.filter((shot) => {
    shot.life -= dt;
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    shot.traveled = (shot.traveled ?? 0) + Math.hypot(shot.vx, shot.vy) * dt;
    if (shot.life <= 0 || !canMove(shot.x, shot.y, 3)) return false;
    if (shot.owner === "player") {
      const target = game.enemies.find((enemy) => dist(shot, enemy) < 15);
      if (target) {
        let damage = shot.damage;
        if ((shot.kind === "arrow" || shot.kind === "power-arrow") && (shot.traveled ?? 0) > 140) damage *= 1.25;
        if (shot.kind === "arrow" && (shot.traveled ?? 0) < 55) damage *= .85;
        target.hp -= damage;
        if (game.player.classId === "knight") game.weaponHits[shot.weaponId ?? game.player.weaponId]++;
        target.flash = .14;
        const color = shot.kind === "arc-bolt" ? "#a78bfa" : shot.kind === "arrow" || shot.kind === "power-arrow" ? "#34d399" : "#f4d35e";
        burst(game, target.x, target.y, color, shot.kind === "power-arrow" ? 14 : 8, shot.kind === "power-arrow" ? 145 : 100);
        if (shot.splash && shot.splashDamage) {
          game.enemies.filter((enemy) => enemy.id !== target.id && dist(enemy, target) < shot.splash!).forEach((enemy) => {
            enemy.hp -= shot.splashDamage!;
            enemy.flash = .14;
            burst(game, enemy.x, enemy.y, "#a78bfa", 6, 70);
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
  const remainingInRoom = game.enemies.filter((enemy) => roomIndexFor(enemy.x, enemy.y) === encounterIndex).length;
  const chestInRoomOpened = game.chests.some((chest) => roomIndexFor(chest.x, chest.y) === encounterIndex && chest.open);
  const pylonInRoomActive = game.pylons.some((pylon) => roomIndexFor(pylon.x, pylon.y) === encounterIndex && pylon.active);
  if (encounterKind === "boss" && remainingInRoom === 0) game.bossDead = true;
  let encounterComplete = false;
  if (encounterKind === "safe") encounterComplete = game.safeUsed;
  if (["ambush", "elite"].includes(encounterKind)) encounterComplete = remainingInRoom === 0;
  if (encounterKind === "survival") encounterComplete = game.roomTimers[encounterIndex] >= 25 && remainingInRoom === 0;
  if (encounterKind === "trap") encounterComplete = game.roomTimers[encounterIndex] >= 15;
  if (encounterKind === "puzzle") encounterComplete = pylonInRoomActive || remainingInRoom === 0;
  if (encounterKind === "treasure") encounterComplete = chestInRoomOpened;
  if (encounterKind === "broadcast") encounterComplete = game.roomTimers[encounterIndex] >= 8 && remainingInRoom === 0;
  if (encounterKind === "boss") encounterComplete = game.bossDead;
  if (encounterComplete && !game.roomCleared[encounterIndex]) {
    game.roomCleared[encounterIndex] = true;
    game.roomsCleared++;
    game.score += encounterKind === "boss" ? 1800 : encounterKind === "elite" ? 650 : 320;
    game.hype += encounterKind === "elite" ? 12 : 7;
    game.maxHype = Math.max(game.maxHype, game.hype);
    if (p.classId === "knight" && ["elite", "broadcast", "treasure"].includes(encounterKind)) {
      const weapon = selectWeaponDrop(Math.random, { exclude: [p.weaponId] });
      if (weapon) {
        const room = roomFor(p.x, p.y);
        game.groundWeapons.push({ id: game.nextId++, weaponId: weapon.id, x: (room.col * 8 + 4.5) * TILE, y: (room.row * 8 + 4.5) * TILE, phase: Math.random() * 6 });
      }
    }
    if (!game.dareComplete && game.activeDareId !== "close_quarters" && game.activeDareId !== "bomb_double") game.dareProgress++;
    const dare = AUDIENCE_DARES.find((entry) => entry.id === game.activeDareId);
    if (dare && game.dareProgress >= dare.target && !game.dareComplete) {
      game.dareComplete = true;
      game.hype += dare.hypeReward;
      game.score += dare.scoreReward;
      setMessage(game, `DARE COMPLETE // ${dare.name.toUpperCase()} +${dare.scoreReward}`);
    } else {
      setMessage(game, `${encounterKind.toUpperCase()} CLEARED // DOORS RELEASED`);
    }
  }

  if (game.time <= 0 || p.hp <= 0) {
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
    score: Math.floor(game.score),
    hype: game.hype,
    rooms: game.explored.size,
    pylons,
    potions: game.player.potions,
    bombs: game.player.bombs,
    furyVials: game.player.furyVials,
    furyTime: game.player.furyTime,
    weaponName: game.player.classId === "mage" ? "Signal Grimoire" : game.player.classId === "archer" ? "Relay Recurve" : getWeapon(game.player.weaponId).name,
    ammo: game.player.classId === "archer" ? game.player.classResource : game.player.ammo,
    nearbyEquipmentId: game.groundEquipment.find((drop) => dist(drop, game.player) < 42)?.equipmentId ?? null,
    equipmentNames: (Object.values(game.equipped).filter(Boolean) as EquipmentId[]).map((id) => EQUIPMENT[id].name),
    roomKind: game.roomKinds[game.currentRoomIndex] ?? "safe",
    roomsCleared: game.roomsCleared,
    dareName: dare.name,
    dareProgress: game.dareProgress,
    dareTarget: dare.target,
    message: game.messageTime > 0 ? game.message : "THE SIGNAL HUMS. KEEP MOVING.",
    objective: pylons < 3 ? `Activate ${3 - pylons} signal pylon${3 - pylons === 1 ? "" : "s"}` : game.bossDead ? "Reach the exit gate" : "Defeat the Broadcast Warden",
  };
}

function runStatsFor(game: Game): RunStats {
  const elitesDefeated = game.roomKinds.filter((kind, index) => kind === "elite" && game.roomCleared[index]).length;
  return {
    won: game.screen === "won",
    elapsedSeconds: Math.round(game.elapsed),
    roomsDiscovered: game.explored.size,
    totalRooms: game.roomKinds.length,
    roomsCleared: game.roomsCleared,
    enemiesDefeated: game.kills,
    elitesDefeated,
    bossesDefeated: game.bossDead ? 1 : 0,
    damageTaken: Math.round(game.damageTaken),
    deaths: game.screen === "lost" && game.player.hp <= 0 ? 1 : 0,
    highestHype: Math.round(game.maxHype),
    daresCompleted: game.dareComplete ? 1 : 0,
    secretsFound: 0,
    lootValue: game.upgrades.length * 250 + game.discoveredEquipment.length * 180 + game.groundWeapons.length * 120,
    remainingSeconds: Math.round(game.time),
    favoriteWeapon: getWeapon(game.player.weaponId).name,
  };
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(makeGame());
  const keysRef = useRef(new Set<string>());
  const audioRef = useRef<AudioContext | null>(null);
  const interactHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shiftUsedForHeavy = useRef(false);
  const [screen, setScreen] = useState<Screen>("title");
  const [hud, setHud] = useState<Hud>(() => makeHud(gameRef.current));
  const [highScore, setHighScore] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSection, setHelpSection] = useState<HelpSection>("mission");
  const [armoryOpen, setArmoryOpen] = useState(false);
  const [armory, setArmory] = useState<ArmorySnapshot>(EMPTY_ARMORY);
  const [starterWeapon, setStarterWeapon] = useState<WeaponId>("cleaver");
  const [selectedClass, setSelectedClass] = useState<PlayerClassId>("knight");
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
      gain.gain.setValueAtTime(0.035, audio.currentTime);
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
      const lifetimeRuns = Number(localStorage.getItem("signal-depths-lifetime-runs") || 0) + 1;
      const lifetimeKills = Number(localStorage.getItem("signal-depths-lifetime-kills") || 0) + game.kills;
      const storedUnlocks = JSON.parse(localStorage.getItem("signal-depths-unlocks") || "[]") as string[];
      const earned = newlyEarnedUnlocks({ ...stats, lifetimeRuns, lifetimeKills }, storedUnlocks);
      game.newUnlocks = earned.map((unlock) => unlock.name);
      localStorage.setItem("signal-depths-lifetime-runs", String(lifetimeRuns));
      localStorage.setItem("signal-depths-lifetime-kills", String(lifetimeKills));
      localStorage.setItem("signal-depths-unlocks", JSON.stringify([...storedUnlocks, ...earned.map((unlock) => unlock.id)]));
      const merge = <T,>(stored: T[], found: T[]) => [...new Set([...stored, ...found])];
      const storedWeapons = JSON.parse(localStorage.getItem("signal-depths-discovered-weapons") || "[\"cleaver\"]") as WeaponId[];
      const storedEquipment = JSON.parse(localStorage.getItem("signal-depths-discovered-equipment") || "[]") as EquipmentId[];
      const storedEnemies = JSON.parse(localStorage.getItem("signal-depths-discovered-enemies") || "[]") as EnemyKind[];
      localStorage.setItem("signal-depths-discovered-weapons", JSON.stringify(merge(storedWeapons, [game.player.weaponId])));
      localStorage.setItem("signal-depths-discovered-equipment", JSON.stringify(merge(storedEquipment, game.discoveredEquipment)));
      localStorage.setItem("signal-depths-discovered-enemies", JSON.stringify(merge(storedEnemies, game.discoveredEnemies)));
      setArmory({ weapons: merge(storedWeapons, [game.player.weaponId]), equipment: merge(storedEquipment, game.discoveredEquipment), enemies: merge(storedEnemies, game.discoveredEnemies), unlocks: merge(storedUnlocks, earned.map((unlock) => unlock.id)), runs: lifetimeRuns, kills: lifetimeKills });
      game.resultsSaved = true;
    }
    setScreen(game.screen);
    setHud(makeHud(game));
    if (game.screen === "won" || game.screen === "lost") {
      const saved = Number(localStorage.getItem("signal-depths-high-score") || 0);
      if (game.score > saved) {
        localStorage.setItem("signal-depths-high-score", String(Math.floor(game.score)));
        setHighScore(Math.floor(game.score));
      }
    }
  }, []);

  const startGame = useCallback(() => {
    const nextGame = makeGame("playing", Math.floor(Math.random() * 1_000_000_000), selectedClass);
    nextGame.player.weaponId = starterWeapon;
    nextGame.player.ammo = getWeapon(starterWeapon).ammo ?? 0;
    gameRef.current = nextGame;
    keysRef.current.clear();
    setScreen("playing");
    setHud(makeHud(nextGame));
    beep(164, 0.1);
    canvasRef.current?.focus();
    localStorage.setItem("signal-depths-player-class", selectedClass);
  }, [beep, selectedClass, starterWeapon]);

  const openClassSelection = useCallback(() => {
    gameRef.current.screen = "class-select";
    setScreen("class-select");
    beep(360, .08);
  }, [beep]);

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
    if (upgradeId === "reinforced_heart") { p.maxHp += 20; p.hp = Math.min(p.maxHp, p.hp + 20); }
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
    if (p.attackCd > 0) return;
    if (p.classId === "mage") {
      p.attackCd = .35;
      p.attackFx = .24;
      game.projectiles.push({
        x: p.x + p.dirX * 18, y: p.y + p.dirY * 18,
        vx: p.dirX * 270, vy: p.dirY * 270, life: .84,
        damage: 14 * (p.furyTime > 0 ? 1.75 : 1), owner: "player", pierce: 0,
        kind: "arc-bolt", splash: 26, splashDamage: 8 * (p.furyTime > 0 ? 1.75 : 1), traveled: 0,
      });
      burst(game, p.x + p.dirX * 20, p.y + p.dirY * 20, "#a78bfa", 8, 60);
      beep(430, .09);
      return;
    }
    if (p.classId === "archer") {
      if (p.reloadTime > 0) { setMessage(game, "RESTRINGING QUIVER // HOLD THE LINE"); return; }
      if (p.classResource <= 0) {
        p.reloadTime = .95;
        setMessage(game, "QUIVER EMPTY // RELOADING");
        beep(80, .05);
        return;
      }
      p.classResource--;
      if (p.classResource <= 0) p.reloadTime = .95;
      p.attackCd = .4;
      p.attackFx = .2;
      game.projectiles.push({
        x: p.x + p.dirX * 20, y: p.y + p.dirY * 20,
        vx: p.dirX * 560, vy: p.dirY * 560, life: .58,
        damage: 19 * (p.furyTime > 0 ? 1.75 : 1), owner: "player", pierce: 0, kind: "arrow", traveled: 0,
      });
      burst(game, p.x - p.dirX * 8, p.y - p.dirY * 8, "#34d399", 4, 45);
      beep(610, .045);
      return;
    }
    const weapon = getWeapon(p.weaponId);
    if (weapon.ammo !== null && p.ammo <= 0) {
      setMessage(game, `${weapon.name.toUpperCase()} // OUT OF AMMO`);
      beep(70, .05);
      return;
    }
    const servoBoost = hasEquipment(game, "razor-servo") && weapon.damageType === "slash" ? .85 : 1;
    p.attackCd = (weapon.cooldownMs / 1000) * servoBoost;
    p.attackFx = p.weaponId === "hammer" ? .3 : p.weaponId === "spear" ? .24 : .2;
    game.weaponAttacks[p.weaponId]++;
    burst(game, p.x + p.dirX * 24, p.y + p.dirY * 24, "#fff3b0", 3, 42);
    if (weapon.projectile && p.weaponId === "scrap-launcher") {
      p.ammo--;
      game.projectiles.push({ x: p.x + p.dirX * 18, y: p.y + p.dirY * 18, vx: p.dirX * weapon.projectile.speed, vy: p.dirY * weapon.projectile.speed, life: weapon.projectile.lifetimeMs / 1000, damage: weapon.damage * (p.furyTime > 0 ? 1.75 : 1), owner: "player", pierce: weapon.projectile.pierce, weaponId: p.weaponId });
      game.shake = .1;
      beep(130, .09);
      return;
    }
    let hits = 0;
    game.enemies.forEach((enemy) => {
      const dx = enemy.x - p.x;
      const dy = enemy.y - p.y;
      const distance = Math.hypot(dx, dy);
      const facing = (dx * p.dirX + dy * p.dirY) / Math.max(1, distance);
      const facingThreshold = Math.cos(weapon.arcRadians / 2);
      if (distance < weapon.range && facing > facingThreshold) {
        if (enemy.kind === "boss" && game.pylons.filter((x) => x.active).length < 3) {
          setMessage(game, "WARDEN SHIELDED // FEED THE THREE SIGNALS");
          return;
        }
        const hammerArmor = p.weaponId === "hammer" && game.equipped.armor ? 1.1 : 1;
        const kinetic = p.weaponId === "hammer" && hasEquipment(game, "kinetic-brace") ? 1.3 : 1;
        enemy.hp -= weapon.damage * weapon.attacksPerInput * hammerArmor * kinetic * (p.furyTime > 0 ? 1.75 : 1) * (game.upgrades.filter((id) => id === "razor_arc").length ? 1.1 : 1);
        enemy.flash = 0.14;
        enemy.x += p.dirX * weapon.knockback;
        enemy.y += p.dirY * weapon.knockback;
        burst(game, enemy.x, enemy.y, enemy.kind === "boss" ? "#ff4d6d" : "#f4d35e", enemy.kind === "boss" ? 13 : 8, 120);
        hits++;
        if (p.weaponId === "shock-baton") {
          const stormCoil = hasEquipment(game, "storm-coil");
          game.enemies.filter((candidate) => candidate.id !== enemy.id && dist(candidate, enemy) < (stormCoil ? 84 : 58)).slice(0, stormCoil ? 3 : 2).forEach((candidate) => {
            candidate.hp -= weapon.damage * (stormCoil ? .85 : .65);
            candidate.flash = .14;
            burst(game, candidate.x, candidate.y, "#76c7dc", 7, 80);
          });
        }
      }
    });
    game.weaponHits[p.weaponId] += hits;
    if (hits && hasEquipment(game, "audience-eye") && (p.weaponId === "twin-knives" || weapon.cooldownMs <= 340)) {
      game.hype += hits * .08;
      game.maxHype = Math.max(game.maxHype, game.hype);
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
    if (game.screen !== "playing" || p.attackCd > 0) return;
    if (p.classId === "mage") {
      if (p.classResource < 50) { setMessage(game, "GRAVITY SIGIL // NOT ENOUGH MANA"); beep(72, .05); return; }
      p.classResource -= 50;
      p.attackCd = .9;
      p.heavyFx = .7;
      const center = { x: p.x + p.dirX * 95, y: p.y + p.dirY * 95 };
      let hits = 0;
      game.enemies.forEach((enemy) => {
        const distance = dist(enemy, center);
        if (roomIndexFor(enemy.x, enemy.y) !== roomIndexFor(p.x, p.y) || distance >= 64) return;
        if (enemy.kind === "boss" && game.pylons.filter((node) => node.active).length < 3) return;
        enemy.hp -= (distance < 38 ? 36 : 22) * (p.furyTime > 0 ? 1.75 : 1);
        enemy.flash = .22;
        enemy.recovery = Math.max(enemy.recovery, enemy.kind === "boss" ? .18 : .55);
        if (enemy.kind !== "boss") {
          const dx = center.x - enemy.x;
          const dy = center.y - enemy.y;
          const length = Math.max(1, Math.hypot(dx, dy));
          enemy.x += (dx / length) * 18;
          enemy.y += (dy / length) * 18;
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
      if (p.reloadTime > 0 || p.classResource < 3) { setMessage(game, "POWER SHOT // THREE ARROWS REQUIRED"); beep(72, .05); return; }
      p.classResource -= 3;
      if (p.classResource <= 0) p.reloadTime = .95;
      p.attackCd = .9;
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
    if (p.stamina < 40) { setMessage(game, "COMMITTED STRIKE // NOT ENOUGH DRIVE"); beep(72, .05); return; }
    if (weapon.ammo !== null && p.ammo < 2) { setMessage(game, `${weapon.name.toUpperCase()} // TWO ROUNDS REQUIRED`); beep(72, .05); return; }
    p.stamina -= 40;
    p.attackCd = Math.max(.62, weapon.cooldownMs / 1000 * 1.25);
    p.heavyFx = .62;
    game.weaponAttacks[p.weaponId]++;
    if (p.weaponId === "scrap-launcher" && weapon.projectile) {
      p.ammo -= 2;
      game.projectiles.push({ x: p.x + p.dirX * 20, y: p.y + p.dirY * 20, vx: p.dirX * 430, vy: p.dirY * 430, life: .82, damage: weapon.damage * 1.65, owner: "player", pierce: 2, weaponId: p.weaponId, kind: "scrap", traveled: 0 });
    } else {
      let hits = 0;
      game.enemies.forEach((enemy) => {
        const dx = enemy.x - p.x;
        const dy = enemy.y - p.y;
        const distance = Math.hypot(dx, dy);
        const facing = (dx * p.dirX + dy * p.dirY) / Math.max(1, distance);
        if (distance < weapon.range * 1.15 && facing > Math.cos(Math.min(Math.PI, weapon.arcRadians * 1.35) / 2)) {
          if (enemy.kind === "boss" && game.pylons.filter((node) => node.active).length < 3) return;
          enemy.hp -= weapon.damage * weapon.attacksPerInput * 1.65 * (p.furyTime > 0 ? 1.75 : 1);
          enemy.flash = .22;
          const knockback = enemy.kind === "boss" ? weapon.knockback * .35 : weapon.knockback * 1.6;
          enemy.x += p.dirX * knockback;
          enemy.y += p.dirY * knockback;
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

  const dodge = useCallback(() => {
    const game = gameRef.current;
    const p = game.player;
    if (game.screen !== "playing" || p.dodgeCd > 0 || p.stamina < 30) return;
    const phaseTreads = hasEquipment(game, "phase-treads");
    p.dodgeCd = phaseTreads ? .55 : 0.65;
    const classInvuln = p.classId === "mage" ? .46 : p.classId === "archer" ? .32 : .38;
    const classDistance = p.classId === "mage" ? .8 : p.classId === "archer" ? 1.18 : 1;
    p.invuln = classInvuln + game.upgrades.filter((id) => id === "phase_steps").length * .08 + (phaseTreads ? .1 : 0);
    p.stamina -= 30;
    moveEntity(p, p.dirX * 390 * classDistance * (game.upgrades.includes("phase_steps") ? 1.2 : 1) * (phaseTreads ? 1.2 : 1), p.dirY * 390 * classDistance * (game.upgrades.includes("phase_steps") ? 1.2 : 1) * (phaseTreads ? 1.2 : 1), 0.11, 9);
    if (hasEquipment(game, "iron-stompers")) game.enemies.filter((enemy) => dist(enemy, p) < 30).forEach((enemy) => { enemy.hp -= 12; enemy.flash = .16; burst(game, enemy.x, enemy.y, "#76c7dc", 8, 90); });
    burst(game, p.x - p.dirX * 16, p.y - p.dirY * 16, p.classId === "mage" ? "#a78bfa" : p.classId === "archer" ? "#34d399" : "#76c7dc", 11, 95);
    game.shake = .08;
    beep(320, 0.05);
  }, [beep]);

  const useItem = useCallback((kind: ItemKind) => {
    const game = gameRef.current;
    const p = game.player;
    if (game.screen !== "playing") return;
    if (kind === "tonic") {
      if (p.potions <= 0 || p.hp >= p.maxHp) return;
      p.potions--;
      p.hp = Math.min(p.maxHp, p.hp + 45);
      burst(game, p.x, p.y, "#34d399", 14, 75);
      setMessage(game, "[1] VITAL TONIC // +45 HEALTH");
      beep(520, 0.12);
      return;
    }
    if (kind === "fury") {
      if (p.furyVials <= 0) return;
      p.furyVials--;
      p.furyTime = 8 + game.upgrades.filter((id) => id === "long_fuse").length * 4;
      burst(game, p.x, p.y, "#ff4d6d", 20, 105);
      setMessage(game, "[3] FURY VIAL // DAMAGE BOOSTED FOR 8 SECONDS");
      beep(690, 0.16);
      return;
    }
    if (p.bombs <= 0) return;
    p.bombs--;
    const playerRoom = roomFor(p.x, p.y);
    burst(game, p.x, p.y, "#76c7dc", 34, 190);
    game.shake = .32;
    game.hitStop = .08;
    game.enemies.forEach((enemy) => {
      const enemyRoom = roomFor(enemy.x, enemy.y);
      const bossShielded = enemy.kind === "boss" && game.pylons.filter((pylon) => pylon.active).length < 3;
      if (enemyRoom.col === playerRoom.col && enemyRoom.row === playerRoom.row && !bossShielded) {
        enemy.hp -= 55;
        enemy.flash = .2;
        burst(game, enemy.x, enemy.y, "#d9f7ff", 12, 135);
        if (enemy.kind === "volatile" && hasEquipment(game, "volatile-heart")) {
          burst(game, enemy.x, enemy.y, "#ff8a3d", 22, 175);
          game.enemies.filter((other) => other.id !== enemy.id && dist(other, enemy) < 78).forEach((other) => { other.hp -= 35; other.flash = .2; });
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

  const usePotion = useCallback(() => useItem("tonic"), [useItem]);

  const interact = useCallback(() => {
    const game = gameRef.current;
    const p = game.player;
    if (game.screen !== "playing") return;
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
    const pylon = game.pylons.find((x) => !x.active && dist(x, p) < 42);
    if (pylon) {
      pylon.active = true;
      burst(game, pylon.x, pylon.y, "#f4d35e", 20, 115);
      const count = game.pylons.filter((x) => x.active).length;
      game.score += 280 * count;
      game.hype = Math.min(5, game.hype + 0.35);
      setMessage(game, count === 3 ? "ALL SIGNALS LIVE // THE WARDEN WAKES" : `PYLON ${count}/3 ONLINE // AUDIENCE LOCKED IN`);
      beep(720, 0.18);
      return;
    }
    const chest = game.chests.find((x) => !x.open && dist(x, p) < 42);
    if (chest) {
      chest.open = true;
      chest.openFx = .8;
      burst(game, chest.x, chest.y, "#f4d35e", 14, 90);
      const lootTable: ItemKind[] = ["tonic", "bomb", "fury"];
      const firstKind = lootTable[Math.floor(Math.random() * lootTable.length)];
      const equipment = selectClassEquipmentDrop(p.classId, game.roomKinds[roomIndexFor(chest.x, chest.y)] === "elite");
      game.groundItems.push(
        { id: game.nextId++, kind: firstKind, x: chest.x - 18, y: chest.y + 18, phase: Math.random() * 6 },
      );
      game.groundEquipment.push({ id: game.nextId++, equipmentId: equipment.id, x: chest.x + 18, y: chest.y + 18, phase: Math.random() * 6 });
      game.score += 180;
      setMessage(game, `CACHE OPEN // ${equipment.rarity.toUpperCase()} ${equipment.slot.toUpperCase()} DROP`);
      beep(610, 0.15);
      return;
    }
    if (game.bossDead && Math.hypot(p.x - EXIT_X, p.y - EXIT_Y) < 44) {
      game.score += Math.round(game.time * 10 + p.hp * 5 + game.explored.size * 100);
      game.screen = "won";
      setMessage(game, "FLOOR CLEARED // SIGNAL PRESERVED");
      syncScreen(game);
      beep(860, 0.25);
    }
  }, [beep, syncScreen]);

  const pressAction = useCallback((action: "attack" | "heavy" | "dodge" | "interact" | "potion" | "bomb" | "fury") => {
    if (action === "attack") attack();
    if (action === "heavy") heavyAttack();
    if (action === "dodge") dodge();
    if (action === "interact") interact();
    if (action === "potion") usePotion();
    if (action === "bomb") useItem("bomb");
    if (action === "fury") useItem("fury");
  }, [attack, dodge, heavyAttack, interact, useItem, usePotion]);

  useEffect(() => {
    setHighScore(Number(localStorage.getItem("signal-depths-high-score") || 0));
    const snapshot: ArmorySnapshot = {
      weapons: JSON.parse(localStorage.getItem("signal-depths-discovered-weapons") || "[\"cleaver\"]"),
      equipment: JSON.parse(localStorage.getItem("signal-depths-discovered-equipment") || "[]"),
      enemies: JSON.parse(localStorage.getItem("signal-depths-discovered-enemies") || "[]"),
      unlocks: JSON.parse(localStorage.getItem("signal-depths-unlocks") || "[]"),
      runs: Number(localStorage.getItem("signal-depths-lifetime-runs") || 0),
      kills: Number(localStorage.getItem("signal-depths-lifetime-kills") || 0),
    };
    setArmory(snapshot);
    const savedStarter = localStorage.getItem("signal-depths-starter-weapon") as WeaponId | null;
    const allowedStarters: WeaponId[] = ["cleaver", ...(snapshot.unlocks.includes("weapon_spear") ? ["spear" as WeaponId] : []), ...(snapshot.unlocks.includes("weapon_hammer") ? ["hammer" as WeaponId] : [])];
    if (savedStarter && allowedStarters.includes(savedStarter)) setStarterWeapon(savedStarter);
    const savedClass = localStorage.getItem("signal-depths-player-class") as PlayerClassId | null;
    if (savedClass && PLAYER_CLASS_IDS.includes(savedClass)) setSelectedClass(savedClass);
  }, []);

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
      if (!event.repeat) {
        if (armoryOpen) {
          if (key === "escape") setArmoryOpen(false);
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
          const gearNearby = game.groundEquipment.some((drop) => dist(drop, game.player) < 42);
          if (gearNearby) interactHoldTimer.current = setTimeout(interact, 520);
          else interact();
        }
        if (key === "e") usePotion();
        if (key === "1") useItem("tonic");
        if (key === "2") useItem("bomb");
        if (key === "3") useItem("fury");
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
  }, [armoryOpen, attack, closeHelp, dodge, heavyAttack, helpOpen, interact, openHelp, syncScreen, useItem, usePotion]);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    let hudClock = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const game = gameRef.current;
      updateGame(game, keysRef.current, dt);
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) renderGameV2(ctx, game);
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
  }, [screen, syncScreen]);

  const currentGame = gameRef.current;
  const runSummary = summarizeRun(runStatsFor(currentGame));
  const activeDare = AUDIENCE_DARES.find((dare) => dare.id === currentGame.activeDareId) ?? AUDIENCE_DARES[0];
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
          <p className="panel-label">SUBJECT 404 // {hud.className.toUpperCase()}</p>
          <div className={`portrait ${hud.classId}`} aria-hidden="true"><span>{hud.className.toUpperCase()}</span></div>
          <Meter label="Vital" value={hud.hp} max={hud.maxHp} tone="health" />
          <Meter label="Drive" value={hud.stamina} max={100} tone="stamina" />
          {hud.classId !== "knight" && <Meter label={hud.resourceName} value={hud.classResource} max={hud.classResourceMax} tone={hud.classId === "mage" ? "mana" : "quiver"} />}
          <div className="inventory-grid">
            <button onClick={() => useItem("tonic")} aria-label={`Use vital tonic, ${hud.potions} available`}><kbd>1</kbd><span>TONIC</span><b>×{hud.potions}</b></button>
            <button onClick={() => useItem("bomb")} aria-label={`Use room bomb, ${hud.bombs} available`}><kbd>2</kbd><span>BOMB</span><b>×{hud.bombs}</b></button>
            <button className={hud.furyTime > 0 ? "active" : ""} onClick={() => useItem("fury")} aria-label={`Use fury vial, ${hud.furyVials} available`}><kbd>3</kbd><span>FURY</span><b>{hud.furyTime > 0 ? `${Math.ceil(hud.furyTime)}s` : `×${hud.furyVials}`}</b></button>
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
            <small>{hud.ammo > 0 ? `${hud.ammo} ROUNDS` : "UNLIMITED"}</small>
          </div>
          <div className="gear-rack">
            <span>LOADOUT</span>
            {(["armor", "boots", "charm", "mod"] as EquipmentSlot[]).map((slot) => {
              const id = currentGame.equipped[slot];
              return <p key={slot}><b>{slot}</b><em>{id ? EQUIPMENT[id].name : "EMPTY"}</em></p>;
            })}
          </div>
        </aside>

        <div className="stage-wrap">
          <div className="broadcast-strip"><i />LIVE FEED 001<i /></div>
          <div className="canvas-frame">
            <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} tabIndex={0} aria-label="Top-down dungeon game. Use WASD to move, Space to attack, Shift plus Space for a heavy attack, Shift or K to dodge, F to interact, and number keys 1, 2, and 3 to use items." />
            {screen === "title" && (
              <div className="game-overlay title-overlay">
                <div className="signal-icon" aria-hidden="true"><span /></div>
                <p>THE FLOOR IS LISTENING</p>
                <h2>SURVIVE THE FEED.<br />STEAL THE SIGNAL.</h2>
                <p className="intro-copy">Twelve unknown rooms. Three signal pylons. One audience waiting for a spectacular escape.</p>
                <div className="title-actions"><button onClick={openClassSelection}>ENTER THE DEPTHS</button><button className="secondary" onClick={() => setArmoryOpen(true)}>OPEN ARMORY</button></div>
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
                <div className="class-actions"><button className="secondary" onClick={() => { gameRef.current.screen = "title"; setScreen("title"); }}>BACK</button><button onClick={startGame}>DESCEND AS {PLAYER_CLASSES[selectedClass].name.toUpperCase()}</button></div>
              </div>
            )}
            {screen === "playing" && hud.nearbyEquipmentId && (() => {
              const item = EQUIPMENT[hud.nearbyEquipmentId];
              const equippedId = currentGame.equipped[item.slot];
              const equipped = equippedId ? EQUIPMENT[equippedId] : null;
              return <div className={`loot-compare ${item.rarity}`}><span>{item.rarity} {item.slot}</span><strong>{item.name}</strong><p>{item.perk} // {item.detail}</p><i>{equipped ? `REPLACES: ${equipped.name} — ${equipped.detail}` : `${item.slot.toUpperCase()} SLOT EMPTY`}</i><small>HOLD <kbd>F</kbd> TO SWAP</small></div>;
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
                <p>{screen === "won" ? "FLOOR TRANSMISSION COMPLETE" : "SIGNAL LOST"}</p>
                <div className="result-grade"><b>{runSummary.grade}</b><span>{runSummary.gradeLabel}</span></div>
                <div className="result-score"><span>FINAL SCORE</span><b>{hud.score.toLocaleString()}</b></div>
                <div className="result-stats">
                  <span><b>{runSummary.explorationPercent}%</b> EXPLORED</span>
                  <span><b>{currentGame.kills}</b> KILLS</span>
                  <span><b>{currentGame.roomsCleared}</b> CLEARED</span>
                  <span><b>×{currentGame.maxHype.toFixed(1)}</b> MAX HYPE</span>
                </div>
                <div className="result-breakdown">
                  <div><span>DAMAGE REPORT</span>{damageBreakdown.length ? damageBreakdown.map(([source, amount]) => <p key={source}><b>{source}</b><em>{Math.round(amount)}</em></p>) : <p><b>Untouched</b><em>0</em></p>}</div>
                  <div><span>COMBAT READOUT</span><p><b>{mostUsedWeapon?.[1] ? getWeapon(mostUsedWeapon[0]).name : "No weapon used"}</b><em>{mostUsedWeapon?.[1] ?? 0} ATK</em></p><p><b>Hits per attack</b><em>{hitsPerAttack}</em></p>{screen === "lost" && <p><b>Signal lost in</b><em>{currentGame.deathRoomKind?.toUpperCase() ?? (currentGame.time <= 0 ? "TIMEOUT" : "UNKNOWN")}</em></p>}</div>
                </div>
                {currentGame.newUnlocks.length > 0 && <p className="unlock-line">UNLOCKED // {currentGame.newUnlocks.join(" + ")}</p>}
                <button onClick={openClassSelection}>CHOOSE NEXT CRAWLER</button>
              </div>
            )}
          </div>
          <div className="message-feed"><span>FLOORCAST</span><p>{hud.message}</p></div>
        </div>

        <aside className="side-panel map-panel">
          <p className="panel-label">FLOOR 01 // TRACE</p>
          <MiniMap rooms={hud.rooms} pylons={hud.pylons} bossDead={currentGame.bossDead} />
          <div className="progress-list">
            <p><span>ROOMS TRACED</span><b>{hud.rooms}/{ROOM_COLS * ROOM_ROWS}</b></p>
            <p><span>ROOMS CLEARED</span><b>{hud.roomsCleared}/{ROOM_COLS * ROOM_ROWS}</b></p>
            <p><span>PYLONS LIVE</span><b>{hud.pylons}/3</b></p>
            <p><span>WARDEN</span><b>{currentGame.bossDead ? "DOWN" : hud.pylons === 3 ? "LIVE" : "DORMANT"}</b></p>
          </div>
          <div className={`dare-card ${currentGame.dareComplete ? "complete" : ""}`}>
            <span>AUDIENCE DARE</span>
            <strong>{hud.dareName}</strong>
            <p>{activeDare.briefing}</p>
            <i><em style={{ width: `${Math.min(100, (hud.dareProgress / Math.max(1, hud.dareTarget)) * 100)}%` }} /></i>
            <small>{currentGame.dareComplete ? "COMPLETE" : `${hud.dareProgress}/${hud.dareTarget}`}</small>
          </div>
          <div className="controls-card">
            <span>CONTROL DECK</span>
            <p><kbd>WASD</kbd> MOVE</p>
            <p><kbd>SPACE</kbd> ATTACK</p>
            <p><kbd>SHIFT + SPACE</kbd> HEAVY</p>
            <p><kbd>SHIFT / K</kbd> DODGE</p>
            <p><kbd>F</kbd> INTERACT</p>
            <p><kbd>1 / 2 / 3</kbd> ITEMS</p>
          </div>
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
          onSectionChange={setHelpSection}
          onClose={closeHelp}
        />
      )}
      {armoryOpen && <ArmoryModal snapshot={armory} starterWeapon={starterWeapon} onStarterChange={(weapon) => { setStarterWeapon(weapon); localStorage.setItem("signal-depths-starter-weapon", weapon); }} onClose={() => setArmoryOpen(false)} />}
      <footer><span>AN ORIGINAL ARCADE DESCENT</span><span>ESC // PAUSE</span><span>LOCAL SAVE ENABLED</span></footer>
    </main>
  );
}

function ArmoryModal({ snapshot, starterWeapon, onStarterChange, onClose }: { snapshot: ArmorySnapshot; starterWeapon: WeaponId; onStarterChange: (weapon: WeaponId) => void; onClose: () => void }) {
  const starterUnlock: Partial<Record<WeaponId, string>> = { spear: "weapon_spear", hammer: "weapon_hammer" };
  return (
    <div className="help-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="help-dialog armory-dialog" role="dialog" aria-modal="true" aria-labelledby="armory-title">
        <header className="help-header"><div><span>PERSISTENT COLLECTION // LOCAL SAVE</span><h2 id="armory-title">THE ARMORY</h2></div><button className="help-close" onClick={onClose} aria-label="Close Armory">×</button></header>
        <div className="armory-summary"><p><b>{snapshot.runs}</b> RUNS</p><p><b>{snapshot.kills}</b> KILLS</p><p><b>{snapshot.weapons.length}/{Object.keys(WEAPONS).length}</b> WEAPONS</p><p><b>{snapshot.equipment.length}/{EQUIPMENT_IDS.length}</b> GEAR</p></div>
        <div className="armory-scroll">
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
        <footer className="help-footer"><span>DISCOVERIES AND STARTER CHOICES SAVE ON THIS DEVICE</span><button onClick={onClose}>RETURN TO THE FEED</button></footer>
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

function HelpGuide({ section, onSectionChange, onClose }: { section: HelpSection; onSectionChange: (section: HelpSection) => void; onClose: () => void }) {
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
                  <li><b>Beat the Warden.</b> The boss gate opens after all pylons are active. Defeat it, then use the green exit.</li>
                </ol>
                <div className="guide-callout"><strong>HYPE = SCORE POWER</strong><span>Clear rooms and complete audience dares to raise your multiplier and trigger sponsor drops.</span></div>
              </div>
            </div>
          )}
          {section === "controls" && (
            <div className="guide-section">
              <div className="control-guide-grid">
                <GuideControl keys="W A S D" title="Move" copy="Travel, aim your next strike, and approach interactable objects." />
                <GuideControl keys="SPACE / J" title="Basic Attack" copy="Use your class's normal strike, spell, or shot in the direction you face." />
                <GuideControl keys="SHIFT + SPACE" title="Heavy Attack" copy="Commit class resources to a stronger attack with unique control or piercing behavior." />
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
              <div className="class-guide-grid">
                {PLAYER_CLASS_IDS.map((classId) => { const entry = PLAYER_CLASSES[classId]; return <article className="guide-card class-guide-card" key={classId} style={{ "--class-color": entry.color } as CSSProperties}><ClassArt classId={classId} /><div><span>{entry.role}</span><h3>{entry.name} // {entry.tagline}</h3><p>{entry.description}</p><strong>{entry.basicName}</strong><small>{entry.basicDescription}</small><strong>{entry.heavyName}</strong><small>{entry.heavyDescription}</small><em>STRONG: {entry.strengths}<br />WATCH: {entry.weakness}</em></div></article>; })}
              </div>
            </div>
          )}
          {section === "arsenal" && (
            <div className="guide-section">
              <p className="guide-intro">Weapon drops appear after valuable encounters. Stand near one and press <kbd>F</kbd> to equip it; your old weapon drops to the floor.</p>
              <div className="arsenal-grid">
                {Object.values(WEAPONS).map((weapon) => (
                  <article className="guide-card weapon-guide-card" key={weapon.id}>
                    <GuideWeaponArt weapon={weapon.id} />
                    <div><span>{weapon.rarity} // {weapon.damageType}</span><h3>{weapon.name}</h3><p>{weapon.description}</p><strong className="weapon-tactic">{WEAPON_TACTICS[weapon.id]}</strong><small>{weapon.damage} DMG · {weapon.range} RANGE · {weapon.cooldownMs}ms RECOVERY{weapon.ammo ? ` · ${weapon.ammo} AMMO` : ""}</small></div>
                  </article>
                ))}
              </div>
              <p className="guide-intro equipment-guide-intro">Equipment occupies one of four slots: armor, boots, charm, or weapon mod. Matching perks creates builds that can change how you move, score, heal, and attack.</p>
              <div className="arsenal-grid">{EQUIPMENT_IDS.map((id) => { const item = EQUIPMENT[id]; return <article className="guide-card weapon-guide-card" key={id}><EquipmentArt item={id} /><div><span>{item.rarity} // {item.slot}</span><h3>{item.name}</h3><p><b>{item.perk}</b> — {item.detail}</p></div></article>; })}</div>
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

function MiniMap({ rooms, pylons, bossDead }: { rooms: number; pylons: number; bossDead: boolean }) {
  const totalRooms = ROOM_COLS * ROOM_ROWS;
  return (
    <div className="mini-map" aria-label={`${rooms} of ${totalRooms} rooms discovered`}>
      {Array.from({ length: totalRooms }, (_, room) => (
        <div key={room} className={`${room < rooms ? "seen" : ""} ${room === totalRooms - 1 && !bossDead ? "danger" : ""}`}>
          {[2, 5, 8].slice(0, pylons).includes(room) ? <i className="pylon-dot" /> : null}
          {room === totalRooms - 1 && bossDead ? <i className="exit-dot" /> : null}
        </div>
      ))}
    </div>
  );
}
