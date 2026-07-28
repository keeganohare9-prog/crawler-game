import type { RoomKind } from "./floor";

export type SecretWall = "north" | "east" | "south" | "west";
export type SecretReward = "tonic" | "bomb" | "fury";

export type SecretChamber = {
  id: string;
  roomIndex: number;
  wall: SecretWall;
  x: number;
  y: number;
  reward: SecretReward;
  discovered: boolean;
};

function seededRandom(seed: number) {
  let state = (seed ^ 0x9e3779b9) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Places hidden chambers without consuming the run's random stream. Safe,
 * boss, and maze rooms are excluded so every crack is reachable and optional.
 */
export function generateSecretChambers(
  seed: number,
  roomKinds: readonly RoomKind[],
  roomColumns: number,
  tileSize: number,
  count = 3,
): SecretChamber[] {
  const random = seededRandom(seed);
  const candidates = roomKinds
    .map((kind, roomIndex) => ({ kind, roomIndex, order: random() }))
    .filter(({ kind }) => kind !== "safe" && kind !== "boss" && kind !== "maze")
    .sort((a, b) => a.order - b.order)
    .slice(0, Math.min(count, roomKinds.length));
  const walls: readonly SecretWall[] = ["north", "east", "south", "west"];
  const rewards: readonly SecretReward[] = ["tonic", "bomb", "fury"];

  return candidates.map(({ roomIndex }, index) => {
    const wall = walls[Math.floor(random() * walls.length)] ?? "north";
    const along = random() < .5 ? 1.5 : 6.5;
    const roomCol = roomIndex % roomColumns;
    const roomRow = Math.floor(roomIndex / roomColumns);
    const localX = wall === "west" ? .55 : wall === "east" ? 7.45 : along;
    const localY = wall === "north" ? .55 : wall === "south" ? 7.45 : along;
    return {
      id: `secret-${seed}-${roomIndex}`,
      roomIndex,
      wall,
      x: (roomCol * 8 + localX) * tileSize,
      y: (roomRow * 8 + localY) * tileSize,
      reward: rewards[(Math.floor(random() * rewards.length) + index) % rewards.length] ?? "tonic",
      discovered: false,
    };
  });
}

export function secretRewardLabel(reward: SecretReward) {
  if (reward === "tonic") return "VITAL TONIC";
  if (reward === "bomb") return "ROOMBREAKER BOMB";
  return "FURY VIAL";
}
