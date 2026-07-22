/** Pure maze geometry shared by collision, rendering, and encounter logic. */
export const MAZE_WALL_CELLS = new Set([
  "2,3", "2,4", "2,5", "2,6", "2,7",
  "4,1", "4,2", "4,3", "4,4", "4,5", "4,7",
  "6,3", "6,4", "6,5", "6,6", "6,7",
]);

export const MAZE_WRONG_TURNS = [
  { x: 1, y: 6 },
  { x: 3, y: 1 },
  { x: 5, y: 7 },
] as const;

export function isMazeWallCell(localX: number, localY: number) {
  return MAZE_WALL_CELLS.has(`${localX},${localY}`);
}

export function mazeGoalPosition(roomIndex: number, roomColumns: number, tileSize: number) {
  return {
    x: ((roomIndex % roomColumns) * 8 + 5.5) * tileSize,
    y: (Math.floor(roomIndex / roomColumns) * 8 + 4.5) * tileSize,
  };
}
