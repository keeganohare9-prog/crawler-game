"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { generateFloor, type RoomKind } from "./game/floor";
import { WEAPONS, getWeapon, selectWeaponDrop, type WeaponId } from "./game/combat-content";
import { AUDIENCE_DARES, RUN_UPGRADES, bossPhaseForHealth, chooseAudienceDares, chooseSafeRoomUpgrades, newlyEarnedUnlocks, sponsorRewardsCrossed, summarizeRun, type RunStats, type RunUpgradeId } from "./game/progression";

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
  elite: boolean;
};
type Projectile = { x: number; y: number; vx: number; vy: number; life: number; damage: number; owner?: "enemy" | "player"; pierce?: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number };
type Pylon = { x: number; y: number; active: boolean };
type Chest = { x: number; y: number; open: boolean };
type ItemKind = "tonic" | "bomb" | "fury";
type GroundItem = { id: number; kind: ItemKind; x: number; y: number; phase: number };
type GroundWeapon = { id: number; weaponId: WeaponId; x: number; y: number; phase: number };
type Trap = { x: number; y: number; phase: number };
type Screen = "title" | "playing" | "paused" | "upgrade" | "won" | "lost";
type HelpSection = "mission" | "controls" | "arsenal" | "enemies" | "rooms";
type Game = {
  screen: Screen;
  player: {
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    stamina: number;
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
  };
  enemies: Enemy[];
  projectiles: Projectile[];
  particles: Particle[];
  pylons: Pylon[];
  chests: Chest[];
  groundItems: GroundItem[];
  groundWeapons: GroundWeapon[];
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
  roomKind: RoomKind;
  roomsCleared: number;
  dareName: string;
  dareProgress: number;
  dareTarget: number;
  message: string;
  objective: string;
};

const initialHud: Hud = {
  hp: 100,
  maxHp: 100,
  stamina: 100,
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
  roomKind: "safe",
  roomsCleared: 0,
  dareName: "Personal Space Denied",
  dareProgress: 0,
  dareTarget: 5,
  message: "SIGNAL ACQUIRED // SUBJECT 404 ENTERS THE FLOOR",
  objective: "Activate 3 signal pylons",
};

const enemyStats: Record<EnemyKind, Omit<Enemy, "id" | "kind" | "x" | "y" | "cooldown" | "flash" | "windup" | "elite">> = {
  skitter: { hp: 28, maxHp: 28, speed: 68, damage: 9 },
  warden: { hp: 65, maxHp: 65, speed: 39, damage: 16 },
  spitter: { hp: 34, maxHp: 34, speed: 48, damage: 8 },
  healer: { hp: 42, maxHp: 42, speed: 43, damage: 5 },
  mimic: { hp: 78, maxHp: 78, speed: 58, damage: 18 },
  volatile: { hp: 36, maxHp: 36, speed: 56, damage: 24 },
  boss: { hp: 260, maxHp: 260, speed: 46, damage: 20 },
};

const ENEMY_GUIDE: Array<{ kind: EnemyKind; name: string; role: string; tip: string }> = [
  { kind: "skitter", name: "Skitter", role: "Fast pack hunter", tip: "Keep moving and use wide swings before the pack surrounds you." },
  { kind: "warden", name: "Warden", role: "Armored bruiser", tip: "Its heavy strike has a long warning. Dodge late, then punish the recovery." },
  { kind: "spitter", name: "Spitter", role: "Ranged controller", tip: "It retreats when crowded. Close the gap or weave between purple bolts." },
  { kind: "healer", name: "Signal Medic", role: "Enemy support", tip: "Eliminate it first or it will repeatedly restore wounded allies." },
  { kind: "mimic", name: "Cache Mimic", role: "Treasure ambusher", tip: "A suspicious cache bites hard. Strike, disengage, and avoid trading hits." },
  { kind: "volatile", name: "Volatile", role: "Walking explosion", tip: "Its flashing ring means detonation. Lure it near other enemies, then escape." },
  { kind: "boss", name: "Broadcast Warden", role: "Three-phase floor boss", tip: "Activate all three pylons first. Watch for phase changes and radial volleys." },
];

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

function makeGame(screen: Screen = "title", floorSeed = 40_413): Game {
  const floor = generateFloor(floorSeed, { roomCount: ROOM_COLS * ROOM_ROWS });
  const roomKinds = floor.rooms.map((room) => room.kind);
  let nextId = 1;
  const enemy = (kind: EnemyKind, tx: number, ty: number, elite = false): Enemy => ({
    id: nextId++,
    kind,
    x: tx * TILE + TILE / 2,
    y: ty * TILE + TILE / 2,
    cooldown: Math.random() * 1.2,
    flash: 0,
    windup: 0,
    elite,
    ...enemyStats[kind],
  });

  const enemies: Enemy[] = [];
  const chests: Chest[] = [];
  const traps: Trap[] = [];
  roomKinds.forEach((kind, index) => {
    const col = index % ROOM_COLS;
    const row = Math.floor(index / ROOM_COLS);
    const tx = col * 8;
    const ty = row * 8;
    if (kind === "ambush") enemies.push(enemy("skitter", tx + 3, ty + 3), enemy("skitter", tx + 6, ty + 5), enemy("spitter", tx + 5, ty + 2));
    if (kind === "survival") enemies.push(enemy("skitter", tx + 2, ty + 5), enemy("skitter", tx + 6, ty + 2), enemy("warden", tx + 5, ty + 5));
    if (kind === "elite") enemies.push(enemy("warden", tx + 4, ty + 4, true), enemy("healer", tx + 6, ty + 2));
    if (kind === "broadcast") enemies.push(enemy("volatile", tx + 4, ty + 4), enemy("skitter", tx + 6, ty + 5));
    if (kind === "puzzle") enemies.push(enemy("spitter", tx + 5, ty + 3));
    if (kind === "treasure") enemies.push(enemy("mimic", tx + 5, ty + 5));
    if (kind === "boss") enemies.push(enemy("boss", tx + 4, ty + 4, true));
    if (["treasure", "elite", "broadcast"].includes(kind)) chests.push({ x: (tx + 2.5) * TILE, y: (ty + 5.5) * TILE, open: false });
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
  const dare = chooseAudienceDares(floorSeed, [], 1)[0] ?? AUDIENCE_DARES[4];

  return {
    screen,
    player: {
      x: 2.5 * TILE,
      y: 2.5 * TILE,
      hp: 100,
      maxHp: 100,
      stamina: 100,
      damage: 22,
      speed: 122,
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
    },
    enemies,
    projectiles: [],
    particles: [],
    pylons,
    chests,
    groundItems: [],
    groundWeapons: [],
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

function setMessage(game: Game, message: string) {
  game.message = message;
  game.messageTime = 3.2;
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

function drawEnemySprite(ctx: CanvasRenderingContext2D, enemy: Enemy, time: number) {
  const t = time * (enemy.kind === "skitter" ? 13 : 7) + enemy.id;
  const bob = Math.sin(t) * (enemy.kind === "boss" ? 1.2 : 1.7);
  const squash = enemy.flash > 0 ? 1.18 : 1;
  const flash = enemy.flash > 0;
  ctx.save();
  ctx.translate(Math.round(enemy.x), Math.round(enemy.y + bob));
  ctx.scale(squash, 2 - squash);
  ctx.fillStyle = "rgba(0,0,0,.5)";
  ctx.fillRect(enemy.kind === "boss" ? -22 : -14, enemy.kind === "boss" ? 19 : 12, enemy.kind === "boss" ? 44 : 28, 5);

  if (enemy.kind === "skitter") {
    const leg = Math.sin(t) * 4;
    ctx.strokeStyle = flash ? "#fff" : "#406b36";
    ctx.lineWidth = 3;
    for (let side = -1; side <= 1; side += 2) {
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(side * 7, i * 5);
        ctx.lineTo(side * (15 + (i % 2) * leg), i * 8 + leg * side * .3);
        ctx.stroke();
      }
    }
    ctx.fillStyle = flash ? "#fff" : "#7ddf64";
    ctx.fillRect(-10, -11, 20, 22);
    ctx.fillStyle = flash ? "#fff" : "#a6f58f";
    ctx.fillRect(-7, -14, 14, 8);
    ctx.fillStyle = "#182018";
    ctx.fillRect(-6, -9, 4, 5);
    ctx.fillRect(2, -9, 4, 5);
    ctx.fillStyle = "#f4d35e";
    ctx.fillRect(-5, -8, 2, 2);
    ctx.fillRect(3, -8, 2, 2);
    ctx.fillStyle = "#35552e";
    ctx.fillRect(-6, 3, 12, 4);
  } else if (enemy.kind === "spitter") {
    const mouth = 3 + Math.max(0, Math.sin(t)) * 5;
    ctx.strokeStyle = flash ? "#fff" : "#614b91";
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + time * .7;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 8, Math.sin(angle) * 8);
      ctx.lineTo(Math.cos(angle) * 16, Math.sin(angle) * 16);
      ctx.stroke();
    }
    ctx.fillStyle = flash ? "#fff" : "#a78bfa";
    ctx.fillRect(-12, -12, 24, 24);
    ctx.fillStyle = "#d8ccff";
    ctx.fillRect(-7, -8, 14, 8);
    ctx.fillStyle = "#201632";
    ctx.fillRect(-3, -6, 6, 5);
    ctx.fillRect(-6, 3, 12, mouth);
    ctx.fillStyle = "#ff8fab";
    ctx.fillRect(-3, 5, 6, Math.max(1, mouth - 3));
  } else if (enemy.kind === "warden") {
    const arm = Math.sin(t) * 3;
    ctx.fillStyle = flash ? "#fff" : "#6e2d13";
    ctx.fillRect(-17, -7 + arm, 7, 19);
    ctx.fillRect(10, -7 - arm, 7, 19);
    ctx.fillStyle = flash ? "#fff" : "#f97316";
    ctx.fillRect(-12, -12, 24, 26);
    ctx.fillStyle = "#ffc27a";
    ctx.fillRect(-9, -16, 18, 10);
    ctx.fillStyle = "#4a1d0d";
    ctx.fillRect(-13, -18, 6, 8);
    ctx.fillRect(7, -18, 6, 8);
    ctx.fillRect(-7, -11, 5, 4);
    ctx.fillRect(2, -11, 5, 4);
    ctx.fillStyle = "#f4d35e";
    ctx.fillRect(-9, 1, 18, 5);
    ctx.fillStyle = "#513323";
    ctx.fillRect(13, -2 - arm, 7, 22);
  } else if (enemy.kind === "healer") {
    ctx.fillStyle = flash ? "#fff" : "#34d399";
    ctx.fillRect(-11, -13, 22, 27);
    ctx.fillStyle = "#d5fff0";
    ctx.fillRect(-7, -17, 14, 8);
    ctx.fillStyle = "#0b3b2b";
    ctx.fillRect(-3, -12, 6, 18);
    ctx.fillRect(-8, -6, 16, 6);
    ctx.strokeStyle = "rgba(52,211,153,.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 18 + Math.sin(t) * 3, 0, Math.PI * 2);
    ctx.stroke();
  } else if (enemy.kind === "mimic") {
    const mouth = 5 + Math.abs(Math.sin(t)) * 8;
    ctx.fillStyle = flash ? "#fff" : "#b7791f";
    ctx.fillRect(-15, -13, 30, 26);
    ctx.fillStyle = "#f4d35e";
    ctx.fillRect(-13, -11, 26, 6);
    ctx.fillStyle = "#260d0d";
    ctx.fillRect(-12, 1, 24, mouth);
    ctx.fillStyle = "#fff3b0";
    for (let tooth = -9; tooth <= 9; tooth += 6) ctx.fillRect(tooth, 1, 3, 5);
    ctx.fillStyle = "#ff4d6d";
    ctx.fillRect(-7, -8, 5, 4);
    ctx.fillRect(3, -8, 5, 4);
  } else if (enemy.kind === "volatile") {
    const pulse = 1 + Math.sin(t * 1.6) * .12;
    ctx.scale(pulse, pulse);
    ctx.fillStyle = flash ? "#fff" : "#ff8a3d";
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3b1208";
    ctx.fillRect(-7, -4, 5, 5);
    ctx.fillRect(3, -4, 5, 5);
    ctx.fillStyle = "#f4d35e";
    ctx.fillRect(-3, 4, 6, 5);
    ctx.strokeStyle = "#ff4d6d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 17 + Math.sin(t * 2) * 3, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    const pulse = 1 + Math.sin(t) * .06;
    ctx.scale(pulse, pulse);
    const fist = Math.sin(t * .7) * 4;
    ctx.fillStyle = flash ? "#fff" : "#8f1f3b";
    ctx.fillRect(-29, -8 + fist, 10, 31);
    ctx.fillRect(19, -8 - fist, 10, 31);
    ctx.fillStyle = flash ? "#fff" : "#ff4d6d";
    ctx.fillRect(-21, -21, 42, 44);
    ctx.fillStyle = "#ff8fab";
    ctx.fillRect(-15, -25, 8, 9);
    ctx.fillRect(7, -25, 8, 9);
    ctx.fillStyle = "#300914";
    ctx.fillRect(-13, -10, 8, 7);
    ctx.fillRect(5, -10, 8, 7);
    ctx.fillStyle = "#f4d35e";
    ctx.fillRect(-10, -8, 3, 3);
    ctx.fillRect(7, -8, 3, 3);
    ctx.fillStyle = "#1b070d";
    ctx.fillRect(-11, 7, 22, 7);
    ctx.fillStyle = "#fff3b0";
    ctx.fillRect(-8, 7, 4, 4);
    ctx.fillRect(4, 7, 4, 4);
    ctx.fillStyle = "#f4d35e";
    ctx.fillRect(-5, -1, 10, 10);
  }
  if (enemy.windup > 0) {
    ctx.strokeStyle = enemy.kind === "volatile" ? "#ff4d6d" : "#fff3b0";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, (enemy.kind === "boss" ? 34 : 23) - enemy.windup * 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  const barW = enemy.kind === "boss" ? 46 : 28;
  const barY = enemy.y - (enemy.kind === "boss" ? 34 : 24);
  ctx.fillStyle = "#351419";
  ctx.fillRect(enemy.x - barW / 2, barY, barW, 4);
  ctx.fillStyle = "#ff4d6d";
  ctx.fillRect(enemy.x - barW / 2, barY, barW * (enemy.hp / enemy.maxHp), 4);
}

function drawPlayerSprite(ctx: CanvasRenderingContext2D, game: Game) {
  const p = game.player;
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

  // Directional sword with a wide, readable swing.
  const swingProgress = p.attackFx > 0 ? 1 - p.attackFx / .2 : 1;
  const swordAngle = p.attackFx > 0 ? facingAngle - 1.45 + swingProgress * 2.55 : facingAngle + .18;
  ctx.rotate(swordAngle);
  ctx.fillStyle = "#6b4d22";
  ctx.fillRect(7, -3, 8, 6);
  ctx.fillStyle = "#f4d35e";
  ctx.fillRect(13, -5, 5, 10);
  const bladeLength = p.weaponId === "spear" ? 36 : p.weaponId === "hammer" ? 20 : p.weaponId === "twin-knives" ? 15 : 24;
  ctx.fillStyle = p.weaponId === "shock-baton" ? "#76c7dc" : "#dce7e4";
  ctx.fillRect(18, -3, bladeLength, p.weaponId === "hammer" ? 9 : 6);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(21, -2, Math.max(10, bladeLength - 5), 2);
  ctx.fillStyle = "#80918b";
  ctx.fillRect(18 + bladeLength - 4, -3, p.weaponId === "hammer" ? 13 : 6, p.weaponId === "hammer" ? 13 : 6);
  ctx.restore();

  if (p.attackFx > 0) {
    ctx.strokeStyle = `rgba(255,243,176,${Math.min(1, p.attackFx * 6)})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.min(62, Math.max(32, weapon.range * .8)), facingAngle - weapon.arcRadians / 2, facingAngle + weapon.arcRadians / 2);
    ctx.stroke();
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
    ctx.fillRect(roomLeft + 2, doorY - 24, 7, 48);
    ctx.strokeRect(roomLeft + 1, doorY - 27, 13, 54);
    drawPixelText(ctx, "◀", roomLeft + 22, doorY + 4, "#fff3b0", "center");
  }
  if (current.col < ROOM_COLS - 1) {
    ctx.fillRect(roomLeft + 8 * TILE - 9, doorY - 24, 7, 48);
    ctx.strokeRect(roomLeft + 8 * TILE - 14, doorY - 27, 13, 54);
    drawPixelText(ctx, "▶", roomLeft + 8 * TILE - 22, doorY + 4, "#fff3b0", "center");
  }
  if (current.row > 0) {
    ctx.fillRect(doorX - 24, roomTop + 2, 48, 7);
    ctx.strokeRect(doorX - 27, roomTop + 1, 54, 13);
    drawPixelText(ctx, "▲", doorX, roomTop + 27, "#fff3b0", "center");
  }
  if (current.row < ROOM_ROWS - 1) {
    ctx.fillRect(doorX - 24, roomTop + 8 * TILE - 9, 48, 7);
    ctx.strokeRect(doorX - 27, roomTop + 8 * TILE - 14, 54, 13);
    drawPixelText(ctx, "▼", doorX, roomTop + 8 * TILE - 20, "#fff3b0", "center");
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
    ctx.fillStyle = chest.open ? "#4a3420" : "#b7791f";
    ctx.fillRect(chest.x - 14, chest.y - 10 + bounce, 28, 20);
    ctx.fillStyle = chest.open ? "#231a12" : "#f4d35e";
    ctx.fillRect(chest.x - 2, chest.y - 3 + bounce, 5, 7);
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

  game.projectiles.forEach((shot) => {
    ctx.fillStyle = "rgba(255,77,109,.28)";
    ctx.fillRect(shot.x - 8, shot.y - 8, 16, 16);
    ctx.fillStyle = "#ff6b6b";
    ctx.fillRect(shot.x - 4, shot.y - 4, 8, 8);
    ctx.fillStyle = "#fff";
    ctx.fillRect(shot.x - 2, shot.y - 2, 4, 4);
  });

  game.particles.forEach((particle) => {
    ctx.globalAlpha = Math.max(0, particle.life / particle.maxLife);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
  });
  ctx.globalAlpha = 1;

  game.enemies.forEach((enemy) => drawEnemySprite(ctx, enemy, game.elapsed));
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
  if (nearbyWeapon) prompt = `[F] EQUIP ${getWeapon(nearbyWeapon.weaponId).name.toUpperCase()}`;
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
  p.dodgeCd = Math.max(0, p.dodgeCd - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  p.stepTimer = Math.max(0, p.stepTimer - dt);
  p.furyTime = Math.max(0, p.furyTime - dt);
  p.stamina = Math.min(100, p.stamina + dt * 24 * (game.upgrades.includes("second_wind") ? 1.2 : 1));

  game.particles = game.particles.filter((particle) => {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= .93;
    particle.vy *= .93;
    return particle.life > 0;
  });

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
    if (threshold.id === "sponsor_cache") {
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
  moveEntity(p, mx * p.speed, my * p.speed, dt, 9);
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
    game.upgradeChoices = chooseSafeRoomUpgrades(game.floorSeed, [], 3).map((upgrade) => upgrade.id);
    game.screen = "upgrade";
    setMessage(game, "REST NODE CLAIMED // CHOOSE ONE RUN UPGRADE");
  }

  for (const trap of game.traps) {
    const active = (game.elapsed + trap.phase) % 1.5 < 0.72;
    if (active && dist(trap, p) < 19 && p.invuln <= 0) {
      p.hp -= 12;
      game.damageTaken += 12;
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
    const enemyRoom = roomFor(enemy.x, enemy.y);
    if (enemyRoom.col !== playerRoom.col || enemyRoom.row !== playerRoom.row) return;
    if (enemy.kind === "boss" && activePylons < 3) return;
    const dx = p.x - enemy.x;
    const dy = p.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    if (distance > 235) return;
    const nx = dx / Math.max(1, distance);
    const ny = dy / Math.max(1, distance);
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
            p.hp -= enemy.damage;
            game.damageTaken += enemy.damage;
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
      enemy.windup = Math.max(0, enemy.windup - dt);
      if (distance < 100) moveEntity(enemy, -nx * enemy.speed, -ny * enemy.speed, dt, 11);
      else if (distance > 155) moveEntity(enemy, nx * enemy.speed, ny * enemy.speed, dt, 11);
      if (enemy.cooldown <= 0) {
        enemy.windup = .35;
        game.projectiles.push({ x: enemy.x, y: enemy.y, vx: nx * 165, vy: ny * 165, life: 2.2, damage: enemy.damage, owner: "enemy" });
        enemy.cooldown = 1.55;
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
          p.hp -= enemy.damage;
          game.damageTaken += enemy.damage;
          p.invuln = .65;
          game.shake = enemy.kind === "boss" ? .3 : .16;
          burst(game, p.x, p.y, "#ff8fab", enemy.kind === "boss" ? 12 : 7, 110);
        }
        return;
      }
      moveEntity(enemy, nx * enemy.speed, ny * enemy.speed, dt, enemy.kind === "boss" ? 17 : 11);
      if (distance < reach && enemy.cooldown <= 0) {
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
  game.enemies = game.enemies.filter((enemy) => enemy.hp > 0);

  game.projectiles = game.projectiles.filter((shot) => {
    shot.life -= dt;
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    if (shot.life <= 0 || !canMove(shot.x, shot.y, 3)) return false;
    if (shot.owner === "player") {
      const target = game.enemies.find((enemy) => dist(shot, enemy) < 15);
      if (target) {
        target.hp -= shot.damage;
        target.flash = .14;
        burst(game, target.x, target.y, "#f4d35e", 8, 100);
        shot.pierce = (shot.pierce ?? 0) - 1;
        return (shot.pierce ?? -1) >= 0;
      }
      return true;
    }
    if (dist(shot, p) < 13 && p.invuln <= 0) {
      p.hp -= shot.damage;
      game.damageTaken += shot.damage;
      p.invuln = 0.65;
      game.shake = .14;
      burst(game, p.x, p.y, "#a78bfa", 7, 90);
      return false;
    }
    return true;
  });

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
    if (["elite", "broadcast", "treasure"].includes(encounterKind)) {
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
    game.screen = "lost";
    setMessage(game, game.time <= 0 ? "BROADCAST WINDOW CLOSED" : "SUBJECT 404 OFFLINE");
  }
}

function makeHud(game: Game): Hud {
  const pylons = game.pylons.filter((pylon) => pylon.active).length;
  const dare = AUDIENCE_DARES.find((entry) => entry.id === game.activeDareId) ?? AUDIENCE_DARES[0];
  return {
    hp: Math.ceil(game.player.hp),
    maxHp: game.player.maxHp,
    stamina: Math.ceil(game.player.stamina),
    time: Math.ceil(game.time),
    score: Math.floor(game.score),
    hype: game.hype,
    rooms: game.explored.size,
    pylons,
    potions: game.player.potions,
    bombs: game.player.bombs,
    furyVials: game.player.furyVials,
    furyTime: game.player.furyTime,
    weaponName: getWeapon(game.player.weaponId).name,
    ammo: game.player.ammo,
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
    lootValue: game.upgrades.length * 250 + game.groundWeapons.length * 120,
    remainingSeconds: Math.round(game.time),
    favoriteWeapon: getWeapon(game.player.weaponId).name,
  };
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(makeGame());
  const keysRef = useRef(new Set<string>());
  const audioRef = useRef<AudioContext | null>(null);
  const [screen, setScreen] = useState<Screen>("title");
  const [hud, setHud] = useState<Hud>(() => makeHud(gameRef.current));
  const [highScore, setHighScore] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpSection, setHelpSection] = useState<HelpSection>("mission");
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
    const nextGame = makeGame("playing", Math.floor(Math.random() * 1_000_000_000));
    gameRef.current = nextGame;
    keysRef.current.clear();
    setScreen("playing");
    setHud(makeHud(nextGame));
    beep(164, 0.1);
    canvasRef.current?.focus();
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
    const weapon = getWeapon(p.weaponId);
    if (weapon.ammo !== null && p.ammo <= 0) {
      setMessage(game, `${weapon.name.toUpperCase()} // OUT OF AMMO`);
      beep(70, .05);
      return;
    }
    p.attackCd = weapon.cooldownMs / 1000;
    p.attackFx = 0.2;
    burst(game, p.x + p.dirX * 24, p.y + p.dirY * 24, "#fff3b0", 3, 42);
    if (weapon.projectile && p.weaponId === "scrap-launcher") {
      p.ammo--;
      game.projectiles.push({ x: p.x + p.dirX * 18, y: p.y + p.dirY * 18, vx: p.dirX * weapon.projectile.speed, vy: p.dirY * weapon.projectile.speed, life: weapon.projectile.lifetimeMs / 1000, damage: weapon.damage * (p.furyTime > 0 ? 1.75 : 1), owner: "player", pierce: weapon.projectile.pierce });
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
        enemy.hp -= weapon.damage * weapon.attacksPerInput * (p.furyTime > 0 ? 1.75 : 1) * (game.upgrades.filter((id) => id === "razor_arc").length ? 1.1 : 1);
        enemy.flash = 0.14;
        enemy.x += p.dirX * weapon.knockback;
        enemy.y += p.dirY * weapon.knockback;
        burst(game, enemy.x, enemy.y, enemy.kind === "boss" ? "#ff4d6d" : "#f4d35e", enemy.kind === "boss" ? 13 : 8, 120);
        hits++;
        if (p.weaponId === "shock-baton") {
          game.enemies.filter((candidate) => candidate.id !== enemy.id && dist(candidate, enemy) < 58).slice(0, 2).forEach((candidate) => {
            candidate.hp -= weapon.damage * .65;
            candidate.flash = .14;
            burst(game, candidate.x, candidate.y, "#76c7dc", 7, 80);
          });
        }
      }
    });
    const dead = game.enemies.filter((enemy) => enemy.hp <= 0);
    dead.forEach((enemy) => {
      burst(game, enemy.x, enemy.y, enemy.kind === "boss" ? "#ff4d6d" : "#dce7e4", enemy.kind === "boss" ? 30 : 16, 160);
      game.kills++;
      if (game.upgrades.includes("blood_broadcast") && p.hp / p.maxHp < .35) p.hp = Math.min(p.maxHp, p.hp + 2);
      game.hype += enemy.kind === "boss" ? 15 : 1.5;
      game.maxHype = Math.max(game.maxHype, game.hype);
      game.score += Math.round((enemy.kind === "boss" ? 1600 : 140) * game.hype);
      if (enemy.kind === "boss") {
        game.bossDead = true;
        setMessage(game, "WARDEN DOWN // EXIT CHANNEL UNLOCKED");
      }
    });
    game.enemies = game.enemies.filter((enemy) => enemy.hp > 0);
    if (dead.length && game.activeDareId === "close_quarters" && !game.dareComplete) game.dareProgress += dead.length;
    if (hits) {
      game.hitStop = .055;
      game.shake = dead.length ? .24 : .12;
      beep(96, 0.07);
    }
    else beep(180, 0.035);
  }, [beep]);

  const dodge = useCallback(() => {
    const game = gameRef.current;
    const p = game.player;
    if (game.screen !== "playing" || p.dodgeCd > 0 || p.stamina < 30) return;
    p.dodgeCd = 0.65;
    p.invuln = 0.38 + game.upgrades.filter((id) => id === "phase_steps").length * .08;
    p.stamina -= 30;
    moveEntity(p, p.dirX * 390 * (game.upgrades.includes("phase_steps") ? 1.2 : 1), p.dirY * 390 * (game.upgrades.includes("phase_steps") ? 1.2 : 1), 0.11, 9);
    burst(game, p.x - p.dirX * 16, p.y - p.dirY * 16, "#76c7dc", 11, 95);
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
    const weaponDrop = game.groundWeapons.find((drop) => dist(drop, p) < 42);
    if (weaponDrop) {
      const previousWeapon = p.weaponId;
      p.weaponId = weaponDrop.weaponId;
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
      burst(game, chest.x, chest.y, "#f4d35e", 14, 90);
      const lootTable: ItemKind[] = ["tonic", "bomb", "fury"];
      const firstKind = lootTable[Math.floor(Math.random() * lootTable.length)];
      const secondKind = lootTable[Math.floor(Math.random() * lootTable.length)];
      game.groundItems.push(
        { id: game.nextId++, kind: firstKind, x: chest.x - 18, y: chest.y + 18, phase: Math.random() * 6 },
        { id: game.nextId++, kind: secondKind, x: chest.x + 18, y: chest.y + 18, phase: Math.random() * 6 },
      );
      game.score += 180;
      setMessage(game, "CACHE OPEN // TWO ITEMS DROPPED — PRESS [F] TO COLLECT");
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

  const pressAction = useCallback((action: "attack" | "dodge" | "interact" | "potion" | "bomb" | "fury") => {
    if (action === "attack") attack();
    if (action === "dodge") dodge();
    if (action === "interact") interact();
    if (action === "potion") usePotion();
    if (action === "bomb") useItem("bomb");
    if (action === "fury") useItem("fury");
  }, [attack, dodge, interact, useItem, usePotion]);

  useEffect(() => {
    setHighScore(Number(localStorage.getItem("signal-depths-high-score") || 0));
  }, []);

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
      if (!event.repeat) {
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
        if (key === " " || key === "j") attack();
        if (key === "shift" || key === "k") dodge();
        if (key === "f") interact();
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
    const onUp = (event: KeyboardEvent) => keysRef.current.delete(event.key.toLowerCase());
    window.addEventListener("keydown", onDown, { passive: false });
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [attack, closeHelp, dodge, helpOpen, interact, openHelp, syncScreen, useItem, usePotion]);

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
          <p className="panel-label">SUBJECT 404</p>
          <div className="portrait" aria-hidden="true"><span>404</span></div>
          <Meter label="Vital" value={hud.hp} max={hud.maxHp} tone="health" />
          <Meter label="Drive" value={hud.stamina} max={100} tone="stamina" />
          <div className="inventory-grid">
            <button onClick={() => useItem("tonic")} aria-label={`Use vital tonic, ${hud.potions} available`}><kbd>1</kbd><span>TONIC</span><b>×{hud.potions}</b></button>
            <button onClick={() => useItem("bomb")} aria-label={`Use room bomb, ${hud.bombs} available`}><kbd>2</kbd><span>BOMB</span><b>×{hud.bombs}</b></button>
            <button className={hud.furyTime > 0 ? "active" : ""} onClick={() => useItem("fury")} aria-label={`Use fury vial, ${hud.furyVials} available`}><kbd>3</kbd><span>FURY</span><b>{hud.furyTime > 0 ? `${Math.ceil(hud.furyTime)}s` : `×${hud.furyVials}`}</b></button>
          </div>
          <div className="objective-card">
            <span>CURRENT DIRECTIVE</span>
            <strong>{hud.objective}</strong>
          </div>
          <div className="weapon-card">
            <span>ACTIVE WEAPON</span>
            <strong>{hud.weaponName}</strong>
            <small>{hud.ammo > 0 ? `${hud.ammo} ROUNDS` : "UNLIMITED"}</small>
          </div>
        </aside>

        <div className="stage-wrap">
          <div className="broadcast-strip"><i />LIVE FEED 001<i /></div>
          <div className="canvas-frame">
            <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} tabIndex={0} aria-label="Top-down dungeon game. Use WASD to move, Space to attack, Shift to dodge, F to interact, and number keys 1, 2, and 3 to use items." />
            {screen === "title" && (
              <div className="game-overlay title-overlay">
                <div className="signal-icon" aria-hidden="true"><span /></div>
                <p>THE FLOOR IS LISTENING</p>
                <h2>SURVIVE THE FEED.<br />STEAL THE SIGNAL.</h2>
                <p className="intro-copy">Twelve unknown rooms. Three signal pylons. One audience waiting for a spectacular escape.</p>
                <button onClick={startGame}>ENTER THE DEPTHS</button>
                {highScore > 0 && <small>LOCAL RECORD // {highScore.toLocaleString()}</small>}
              </div>
            )}
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
                {currentGame.newUnlocks.length > 0 && <p className="unlock-line">UNLOCKED // {currentGame.newUnlocks.join(" + ")}</p>}
                <button onClick={startGame}>RUN IT AGAIN</button>
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
            <p><kbd>SHIFT</kbd> DODGE</p>
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
          <button className="attack-button" onClick={() => pressAction("attack")}>HIT</button>
        </div>
      </section>
      <button className="help-launcher" onClick={openHelp} aria-label="Open crawler field guide" aria-haspopup="dialog">?</button>
      {helpOpen && (
        <HelpGuide
          section={helpSection}
          onSectionChange={setHelpSection}
          onClose={closeHelp}
        />
      )}
      <footer><span>AN ORIGINAL ARCADE DESCENT</span><span>ESC // PAUSE</span><span>LOCAL SAVE ENABLED</span></footer>
    </main>
  );
}

function HelpGuide({ section, onSectionChange, onClose }: { section: HelpSection; onSectionChange: (section: HelpSection) => void; onClose: () => void }) {
  const sections: Array<{ id: HelpSection; label: string }> = [
    { id: "mission", label: "Mission" },
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
                <GuideControl keys="SPACE / J" title="Attack" copy="Swing or fire your equipped weapon in the direction you face." />
                <GuideControl keys="SHIFT / K" title="Dodge" copy="Spend Drive for a fast burst with a brief window of invulnerability." />
                <GuideControl keys="F" title="Interact" copy="Activate pylons, open caches, collect drops, swap weapons, and exit." />
                <GuideControl keys="1 / E" title="Vital Tonic" copy="Restore 45 health. It cannot be used while already at full health." />
                <GuideControl keys="2" title="Roombreaker Bomb" copy="Deal 55 damage to every unshielded enemy in your current room." />
                <GuideControl keys="3" title="Fury Vial" copy="Temporarily boosts weapon damage and can be improved by upgrades." />
                <GuideControl keys="ESC" title="Pause" copy="Freeze the broadcast. The field guide also pauses an active run." />
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
                    <div><span>{weapon.rarity} // {weapon.damageType}</span><h3>{weapon.name}</h3><p>{weapon.description}</p><small>{weapon.damage} DMG · {weapon.range} RANGE · {weapon.cooldownMs}ms RECOVERY{weapon.ammo ? ` · ${weapon.ammo} AMMO` : ""}</small></div>
                  </article>
                ))}
              </div>
            </div>
          )}
          {section === "enemies" && (
            <div className="guide-section">
              <p className="guide-intro">Red or amber warning rings signal an incoming attack. A well-timed dodge is usually safer than one extra swing.</p>
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
              <p className="guide-intro">Each run rearranges the room types. Combat doors glow red and seal behind you until the encounter is complete.</p>
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
  return <div className={`guide-art weapon-art ${weapon}`} aria-hidden="true"><i /><b /><em /></div>;
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
