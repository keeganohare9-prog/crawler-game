export type HazardState = "dormant" | "warning" | "active";

export type RoomTile = { x: number; y: number };

const PILLAR_PATTERNS: RoomTile[][] = [
  [{ x: 2, y: 2 }, { x: 6, y: 6 }],
  [{ x: 2, y: 2 }, { x: 2, y: 6 }],
  [{ x: 6, y: 6 }, { x: 2, y: 6 }],
];

// The center cross (local rows/columns 3–5) is always open, so every doorway
// remains connected even when enemies are crowding the room.
export function obstacleTilesForRoom(roomIndex: number, roomCount: number): RoomTile[] {
  if (roomIndex === 0 || roomIndex === roomCount - 1) return [];
  return PILLAR_PATTERNS[roomIndex % PILLAR_PATTERNS.length];
}

export function isRoomObstacleTile(tx: number, ty: number, roomCols: number, roomRows: number) {
  if (tx < 0 || ty < 0) return false;
  const roomCol = Math.floor(tx / 8);
  const roomRow = Math.floor(ty / 8);
  if (roomCol >= roomCols || roomRow >= roomRows) return false;
  const roomIndex = roomRow * roomCols + roomCol;
  const localX = tx - roomCol * 8;
  const localY = ty - roomRow * 8;
  return obstacleTilesForRoom(roomIndex, roomCols * roomRows)
    .some((tile) => tile.x === localX && tile.y === localY);
}

export function hazardTilesForRoom(roomIndex: number, roomCols: number, roomCount: number): RoomTile[] {
  if (roomIndex === 0 || roomIndex === roomCount - 1) return [];
  const roomCol = roomIndex % roomCols;
  const roomRow = Math.floor(roomIndex / roomCols);
  const y = roomRow * 8 + 6;
  return [3, 4, 5].map((localX) => ({ x: roomCol * 8 + localX, y }));
}

export function hazardStateAt(elapsed: number, roomIndex: number): HazardState {
  const cycle = (elapsed + roomIndex * .47) % 3.6;
  if (cycle < 1.65) return "dormant";
  if (cycle < 2.75) return "warning";
  return "active";
}

export function pointIsOnHazard(x: number, y: number, tiles: RoomTile[], tileSize: number) {
  const tx = Math.floor(x / tileSize);
  const ty = Math.floor(y / tileSize);
  return tiles.some((tile) => tile.x === tx && tile.y === ty);
}
