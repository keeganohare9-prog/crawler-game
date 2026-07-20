"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const TILE = 32;
const MAP_W = 24;
const MAP_H = 16;
const WIDTH = MAP_W * TILE;
const HEIGHT = MAP_H * TILE;

type EnemyKind = "skitter" | "warden" | "spitter" | "boss";
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
};
type Projectile = { x: number; y: number; vx: number; vy: number; life: number; damage: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number };
type Pylon = { x: number; y: number; active: boolean };
type Chest = { x: number; y: number; open: boolean };
type Trap = { x: number; y: number; phase: number };
type Screen = "title" | "playing" | "paused" | "won" | "lost";
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
    moving: boolean;
    stepTimer: number;
  };
  enemies: Enemy[];
  projectiles: Projectile[];
  particles: Particle[];
  pylons: Pylon[];
  chests: Chest[];
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
  message: string;
  objective: string;
};

const initialHud: Hud = {
  hp: 100,
  maxHp: 100,
  stamina: 100,
  time: 300,
  score: 0,
  hype: 1,
  rooms: 1,
  pylons: 0,
  potions: 2,
  message: "SIGNAL ACQUIRED // SUBJECT 404 ENTERS THE FLOOR",
  objective: "Activate 3 signal pylons",
};

const enemyStats: Record<EnemyKind, Omit<Enemy, "id" | "kind" | "x" | "y" | "cooldown" | "flash">> = {
  skitter: { hp: 28, maxHp: 28, speed: 68, damage: 9 },
  warden: { hp: 65, maxHp: 65, speed: 39, damage: 16 },
  spitter: { hp: 34, maxHp: 34, speed: 48, damage: 8 },
  boss: { hp: 260, maxHp: 260, speed: 46, damage: 20 },
};

function makeGame(screen: Screen = "title"): Game {
  let nextId = 1;
  const enemy = (kind: EnemyKind, tx: number, ty: number): Enemy => ({
    id: nextId++,
    kind,
    x: tx * TILE + TILE / 2,
    y: ty * TILE + TILE / 2,
    cooldown: Math.random() * 1.2,
    flash: 0,
    ...enemyStats[kind],
  });

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
      moving: false,
      stepTimer: 0,
    },
    enemies: [
      enemy("skitter", 5, 5),
      enemy("skitter", 11, 3),
      enemy("spitter", 13, 5),
      enemy("warden", 5, 11),
      enemy("skitter", 6, 13),
      enemy("spitter", 11, 12),
      enemy("warden", 14, 12),
      enemy("skitter", 18, 12),
      enemy("spitter", 21, 11),
      enemy("boss", 20, 4),
    ],
    projectiles: [],
    particles: [],
    pylons: [
      { x: 6.5 * TILE, y: 2.5 * TILE, active: false },
      { x: 13.5 * TILE, y: 6.5 * TILE, active: false },
      { x: 3.5 * TILE, y: 13.5 * TILE, active: false },
    ],
    chests: [
      { x: 11.5 * TILE, y: 5.5 * TILE, open: false },
      { x: 14.5 * TILE, y: 10.5 * TILE, open: false },
      { x: 21.5 * TILE, y: 13.5 * TILE, open: false },
    ],
    traps: [
      { x: 5.5 * TILE, y: 10.5 * TILE, phase: 0 },
      { x: 6.5 * TILE, y: 10.5 * TILE, phase: 0.35 },
      { x: 10.5 * TILE, y: 6.5 * TILE, phase: 0.7 },
      { x: 18.5 * TILE, y: 11.5 * TILE, phase: 0.15 },
      { x: 19.5 * TILE, y: 11.5 * TILE, phase: 0.5 },
    ],
    explored: new Set(["0,0"]),
    time: 300,
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
  };
}

function isWallTile(tx: number, ty: number) {
  if (tx <= 0 || ty <= 0 || tx >= MAP_W - 1 || ty >= MAP_H - 1) return true;
  if ((tx === 8 || tx === 16) && ty !== 4 && ty !== 12) return true;
  if (ty === 8 && tx !== 4 && tx !== 12 && tx !== 20) return true;
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
    col: Math.max(0, Math.min(2, Math.floor(x / (8 * TILE)))),
    row: Math.max(0, Math.min(1, Math.floor(y / (8 * TILE)))),
  };
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
  const stride = p.moving ? Math.sin(game.elapsed * 13) : 0;
  const bob = p.moving ? Math.abs(stride) * -2 : Math.sin(game.elapsed * 3) * .5;
  const facingAngle = Math.atan2(p.dirY, p.dirX);
  ctx.save();
  ctx.translate(Math.round(p.x), Math.round(p.y + bob));
  if (game.shake > 0) ctx.rotate(Math.sin(game.elapsed * 80) * .035);
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
  ctx.fillStyle = "#dce7e4";
  ctx.fillRect(18, -3, 24, 6);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(21, -2, 19, 2);
  ctx.fillStyle = "#80918b";
  ctx.fillRect(38, -3, 6, 6);
  ctx.restore();

  if (p.attackFx > 0) {
    ctx.strokeStyle = `rgba(255,243,176,${Math.min(1, p.attackFx * 6)})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 38, facingAngle - 1.3, facingAngle + 1.2);
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

  const centerX = (current.col * 8 + 4) * TILE;
  const centerY = (current.row * 8 + 4) * TILE;
  ctx.strokeStyle = "#2c4a40";
  ctx.lineWidth = 2;
  ctx.strokeRect(centerX - 46, centerY - 46, 92, 92);
  drawPixelText(ctx, `SIGNAL ROOM 0${roomNumber}`, centerX, centerY - 51, "#5a8876", "center");

  const safeX = 12.5 * TILE;
  const safeY = 12.5 * TILE;
  ctx.fillStyle = game.safeUsed ? "#29433c" : "#34d399";
  ctx.fillRect(safeX - 20, safeY - 20, 40, 40);
  ctx.fillStyle = "#0b1713";
  ctx.fillRect(safeX - 13, safeY - 5, 26, 10);
  ctx.fillRect(safeX - 5, safeY - 13, 10, 26);

  const gateOpen = game.bossDead;
  ctx.fillStyle = gateOpen ? "#34d399" : "#ef4444";
  ctx.fillRect(22 * TILE + 3, 14 * TILE + 3, 26, 26);
  ctx.fillStyle = "#06100c";
  ctx.fillRect(22 * TILE + 10, 14 * TILE + 8, 12, 18);
  if (!gateOpen) ctx.fillRect(22 * TILE + 5, 14 * TILE + 13, 22, 5);

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
  if (game.pylons.some((x) => !x.active && dist(x, p) < 42)) prompt = "[F] JACK IN";
  else if (game.chests.some((x) => !x.open && dist(x, p) < 42)) prompt = "[F] CRACK CACHE";
  else if (gateOpen && Math.hypot(p.x - 22.5 * TILE, p.y - 14.5 * TILE) < 44) prompt = "[F] EXIT FLOOR";
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
  p.stamina = Math.min(100, p.stamina + dt * 24);

  game.particles = game.particles.filter((particle) => {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= .93;
    particle.vy *= .93;
    return particle.life > 0;
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
  moveEntity(p, mx * p.speed, my * p.speed, dt, 9);
  if (p.moving && p.stepTimer <= 0) {
    p.stepTimer = .13;
    burst(game, p.x - p.dirX * 7, p.y - p.dirY * 7 + 10, "#607068", 2, 24);
  }

  const roomId = `${Math.min(2, Math.floor(p.x / (8 * TILE)))},${Math.min(1, Math.floor(p.y / (8 * TILE)))}`;
  if (!game.explored.has(roomId)) {
    game.explored.add(roomId);
    game.score += 120;
    game.hype = Math.min(5, game.hype + 0.15);
    setMessage(game, `NEW SIGNAL ZONE // ROOM ${game.explored.size} OF 6`);
  }

  const safe = { x: 12.5 * TILE, y: 12.5 * TILE };
  if (!game.safeUsed && dist(safe, p) < 28) {
    game.safeUsed = true;
    p.hp = p.maxHp;
    p.potions += 1;
    game.score += 200;
    setMessage(game, "REST NODE CLAIMED // VITALS RESTORED +1 TONIC");
  }

  for (const trap of game.traps) {
    const active = (game.elapsed + trap.phase) % 1.5 < 0.72;
    if (active && dist(trap, p) < 19 && p.invuln <= 0) {
      p.hp -= 12;
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
    if (enemy.kind === "spitter") {
      if (distance < 100) moveEntity(enemy, -nx * enemy.speed, -ny * enemy.speed, dt, 11);
      else if (distance > 155) moveEntity(enemy, nx * enemy.speed, ny * enemy.speed, dt, 11);
      if (enemy.cooldown <= 0) {
        game.projectiles.push({ x: enemy.x, y: enemy.y, vx: nx * 165, vy: ny * 165, life: 2.2, damage: enemy.damage });
        enemy.cooldown = 1.55;
      }
    } else {
      moveEntity(enemy, nx * enemy.speed, ny * enemy.speed, dt, enemy.kind === "boss" ? 17 : 11);
      if (distance < (enemy.kind === "boss" ? 31 : 24) && enemy.cooldown <= 0 && p.invuln <= 0) {
        p.hp -= enemy.damage;
        p.invuln = 0.65;
        game.shake = enemy.kind === "boss" ? .28 : .16;
        burst(game, p.x, p.y, "#ff8fab", enemy.kind === "boss" ? 12 : 7, 110);
        enemy.cooldown = enemy.kind === "boss" ? 0.75 : 1.05;
        game.hype = Math.max(1, game.hype - 0.1);
      }
      if (enemy.kind === "boss" && enemy.cooldown <= 0.05 && Math.random() < 0.05) {
        for (let i = 0; i < 8; i++) {
          const angle = (Math.PI * 2 * i) / 8;
          game.projectiles.push({ x: enemy.x, y: enemy.y, vx: Math.cos(angle) * 125, vy: Math.sin(angle) * 125, life: 2.5, damage: 10 });
        }
      }
    }
  });

  game.projectiles = game.projectiles.filter((shot) => {
    shot.life -= dt;
    shot.x += shot.vx * dt;
    shot.y += shot.vy * dt;
    if (shot.life <= 0 || !canMove(shot.x, shot.y, 3)) return false;
    if (dist(shot, p) < 13 && p.invuln <= 0) {
      p.hp -= shot.damage;
      p.invuln = 0.65;
      game.shake = .14;
      burst(game, p.x, p.y, "#a78bfa", 7, 90);
      return false;
    }
    return true;
  });

  if (game.time <= 0 || p.hp <= 0) {
    p.hp = Math.max(0, p.hp);
    game.screen = "lost";
    setMessage(game, game.time <= 0 ? "BROADCAST WINDOW CLOSED" : "SUBJECT 404 OFFLINE");
  }
}

function makeHud(game: Game): Hud {
  const pylons = game.pylons.filter((pylon) => pylon.active).length;
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
    message: game.messageTime > 0 ? game.message : "THE SIGNAL HUMS. KEEP MOVING.",
    objective: pylons < 3 ? `Activate ${3 - pylons} signal pylon${3 - pylons === 1 ? "" : "s"}` : game.bossDead ? "Reach the exit gate" : "Defeat the Broadcast Warden",
  };
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<Game>(makeGame());
  const keysRef = useRef(new Set<string>());
  const audioRef = useRef<AudioContext | null>(null);
  const [screen, setScreen] = useState<Screen>("title");
  const [hud, setHud] = useState<Hud>(initialHud);
  const [highScore, setHighScore] = useState(0);

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
    gameRef.current = makeGame("playing");
    keysRef.current.clear();
    setScreen("playing");
    setHud(initialHud);
    beep(164, 0.1);
    canvasRef.current?.focus();
  }, [beep]);

  const attack = useCallback(() => {
    const game = gameRef.current;
    if (game.screen !== "playing") return;
    const p = game.player;
    if (p.attackCd > 0) return;
    p.attackCd = 0.34;
    p.attackFx = 0.2;
    burst(game, p.x + p.dirX * 24, p.y + p.dirY * 24, "#fff3b0", 3, 42);
    let hits = 0;
    game.enemies.forEach((enemy) => {
      const dx = enemy.x - p.x;
      const dy = enemy.y - p.y;
      const distance = Math.hypot(dx, dy);
      const facing = (dx * p.dirX + dy * p.dirY) / Math.max(1, distance);
      if (distance < 54 && facing > 0.12) {
        if (enemy.kind === "boss" && game.pylons.filter((x) => x.active).length < 3) {
          setMessage(game, "WARDEN SHIELDED // FEED THE THREE SIGNALS");
          return;
        }
        enemy.hp -= p.damage;
        enemy.flash = 0.14;
        enemy.x += p.dirX * 12;
        enemy.y += p.dirY * 12;
        burst(game, enemy.x, enemy.y, enemy.kind === "boss" ? "#ff4d6d" : "#f4d35e", enemy.kind === "boss" ? 13 : 8, 120);
        hits++;
      }
    });
    const dead = game.enemies.filter((enemy) => enemy.hp <= 0);
    dead.forEach((enemy) => {
      burst(game, enemy.x, enemy.y, enemy.kind === "boss" ? "#ff4d6d" : "#dce7e4", enemy.kind === "boss" ? 30 : 16, 160);
      game.kills++;
      game.hype = Math.min(5, game.hype + (enemy.kind === "boss" ? 1.4 : 0.22));
      game.score += Math.round((enemy.kind === "boss" ? 1600 : 140) * game.hype);
      if (enemy.kind === "boss") {
        game.bossDead = true;
        setMessage(game, "WARDEN DOWN // EXIT CHANNEL UNLOCKED");
      }
    });
    game.enemies = game.enemies.filter((enemy) => enemy.hp > 0);
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
    p.invuln = 0.38;
    p.stamina -= 30;
    moveEntity(p, p.dirX * 390, p.dirY * 390, 0.11, 9);
    burst(game, p.x - p.dirX * 16, p.y - p.dirY * 16, "#76c7dc", 11, 95);
    game.shake = .08;
    beep(320, 0.05);
  }, [beep]);

  const usePotion = useCallback(() => {
    const game = gameRef.current;
    const p = game.player;
    if (game.screen !== "playing" || p.potions <= 0 || p.hp >= p.maxHp) return;
    p.potions--;
    p.hp = Math.min(p.maxHp, p.hp + 45);
    burst(game, p.x, p.y, "#34d399", 14, 75);
    setMessage(game, "VITAL TONIC // +45 HEALTH");
    beep(520, 0.12);
  }, [beep]);

  const interact = useCallback(() => {
    const game = gameRef.current;
    const p = game.player;
    if (game.screen !== "playing") return;
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
      const upgrades = [
        () => { p.damage += 7; setMessage(game, "LOOT: UNLICENSED CLEAVER // +7 DAMAGE"); },
        () => { p.maxHp += 20; p.hp += 20; setMessage(game, "LOOT: PADDED PANIC VEST // +20 MAX HEALTH"); },
        () => { p.speed += 14; setMessage(game, "LOOT: QUESTIONABLE SNEAKERS // +14 SPEED"); },
        () => { p.potions += 2; setMessage(game, "LOOT: BACK-ALLEY TONICS // +2 POTIONS"); },
      ];
      upgrades[Math.floor(Math.random() * upgrades.length)]();
      game.score += 180;
      beep(610, 0.15);
      return;
    }
    if (game.bossDead && Math.hypot(p.x - 22.5 * TILE, p.y - 14.5 * TILE) < 44) {
      game.score += Math.round(game.time * 10 + p.hp * 5 + game.explored.size * 100);
      game.screen = "won";
      setMessage(game, "FLOOR CLEARED // SIGNAL PRESERVED");
      syncScreen(game);
      beep(860, 0.25);
    }
  }, [beep, syncScreen]);

  const pressAction = useCallback((action: "attack" | "dodge" | "interact" | "potion") => {
    if (action === "attack") attack();
    if (action === "dodge") dodge();
    if (action === "interact") interact();
    if (action === "potion") usePotion();
  }, [attack, dodge, interact, usePotion]);

  useEffect(() => {
    setHighScore(Number(localStorage.getItem("signal-depths-high-score") || 0));
  }, []);

  useEffect(() => {
    const onDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
      if (!event.repeat) {
        if (key === " " || key === "j") attack();
        if (key === "shift" || key === "k") dodge();
        if (key === "f") interact();
        if (key === "e") usePotion();
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
  }, [attack, dodge, interact, syncScreen, usePotion]);

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
            <div><span>WEAPON</span><b>RUST CLEAVER</b></div>
            <div><span>TONICS [E]</span><b>{hud.potions}</b></div>
          </div>
          <div className="objective-card">
            <span>CURRENT DIRECTIVE</span>
            <strong>{hud.objective}</strong>
          </div>
        </aside>

        <div className="stage-wrap">
          <div className="broadcast-strip"><i />LIVE FEED 001<i /></div>
          <div className="canvas-frame">
            <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} tabIndex={0} aria-label="Top-down dungeon game. Use WASD to move, Space to attack, Shift to dodge, F to interact, and E to heal." />
            {screen === "title" && (
              <div className="game-overlay title-overlay">
                <div className="signal-icon" aria-hidden="true"><span /></div>
                <p>THE FLOOR IS LISTENING</p>
                <h2>SURVIVE THE FEED.<br />STEAL THE SIGNAL.</h2>
                <p className="intro-copy">Six rooms. Three pylons. One warden standing between you and the surface.</p>
                <button onClick={startGame}>ENTER THE DEPTHS</button>
                {highScore > 0 && <small>LOCAL RECORD // {highScore.toLocaleString()}</small>}
              </div>
            )}
            {screen === "paused" && (
              <div className="pause-actions"><button onClick={() => { gameRef.current.screen = "playing"; syncScreen(gameRef.current); }}>RESUME FEED</button></div>
            )}
            {(screen === "won" || screen === "lost") && (
              <div className={`game-overlay result-overlay ${screen}`}>
                <p>{screen === "won" ? "FLOOR TRANSMISSION COMPLETE" : "SIGNAL LOST"}</p>
                <h2>{screen === "won" ? "YOU MADE GOOD TELEVISION." : "THE FLOOR KEEPS ITS SECRETS."}</h2>
                <div className="result-score"><span>FINAL SCORE</span><b>{hud.score.toLocaleString()}</b></div>
                <button onClick={startGame}>RUN IT AGAIN</button>
              </div>
            )}
          </div>
          <div className="message-feed"><span>FLOORCAST</span><p>{hud.message}</p></div>
        </div>

        <aside className="side-panel map-panel">
          <p className="panel-label">FLOOR 01 // TRACE</p>
          <MiniMap rooms={hud.rooms} pylons={hud.pylons} bossDead={gameRef.current.bossDead} />
          <div className="progress-list">
            <p><span>ROOMS TRACED</span><b>{hud.rooms}/6</b></p>
            <p><span>PYLONS LIVE</span><b>{hud.pylons}/3</b></p>
            <p><span>WARDEN</span><b>{gameRef.current.bossDead ? "DOWN" : hud.pylons === 3 ? "LIVE" : "DORMANT"}</b></p>
          </div>
          <div className="controls-card">
            <span>CONTROL DECK</span>
            <p><kbd>WASD</kbd> MOVE</p>
            <p><kbd>SPACE</kbd> ATTACK</p>
            <p><kbd>SHIFT</kbd> DODGE</p>
            <p><kbd>F</kbd> INTERACT</p>
            <p><kbd>E</kbd> TONIC</p>
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
          <button onClick={() => pressAction("potion")}>HEAL</button>
          <button onClick={() => pressAction("interact")}>USE</button>
          <button onClick={() => pressAction("dodge")}>DODGE</button>
          <button className="attack-button" onClick={() => pressAction("attack")}>HIT</button>
        </div>
      </section>
      <footer><span>AN ORIGINAL ARCADE DESCENT</span><span>ESC // PAUSE</span><span>LOCAL SAVE ENABLED</span></footer>
    </main>
  );
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
  return (
    <div className="mini-map" aria-label={`${rooms} of 6 rooms discovered`}>
      {[0, 1, 2, 3, 4, 5].map((room) => (
        <div key={room} className={`${room < rooms ? "seen" : ""} ${room === 2 && !bossDead ? "danger" : ""}`}>
          {room < pylons ? <i className="pylon-dot" /> : null}
          {room === 5 && bossDead ? <i className="exit-dot" /> : null}
        </div>
      ))}
    </div>
  );
}
