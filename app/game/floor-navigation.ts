import type {
  CardinalDirection,
  DoorDefinition,
  FogMetadata,
  ProceduralFloor,
  RoomId,
  RoomKind,
} from "./floor";

/**
 * Adapter between the procedural room graph and the live game's 4x3 canvas.
 *
 * The canvas can keep using room indices and world-space collision while this
 * map decides which shared walls actually contain doors. Logical room order is
 * deliberately independent from physical slot order.
 */

export interface PhysicalGridSlot {
  col: number;
  row: number;
  index: number;
}

export interface PhysicalRoomPlacement {
  roomId: RoomId;
  roomOrder: number;
  kind: RoomKind;
  hint: FogMetadata["hint"];
  slot: PhysicalGridSlot;
  isEntry: boolean;
  isBoss: boolean;
  isPylon: boolean;
}

export interface PhysicalDoorConnection {
  doorId: string;
  reverseDoorId: string | null;
  fromRoomId: RoomId;
  toRoomId: RoomId;
  fromSlot: PhysicalGridSlot;
  toSlot: PhysicalGridSlot;
  /** Direction in the physical 4x3 grid, not the graph's logical layout. */
  direction: CardinalDirection;
  /**
   * False when a graph edge is represented by a linked doorway. Crossing it
   * must place the player just inside the destination's reciprocal doorway.
   */
  physicallyAdjacent: boolean;
  gate: DoorDefinition["gate"];
  hint: FogMetadata["hint"];
}

export interface FloorNavigationMap {
  columns: number;
  rows: number;
  placements: PhysicalRoomPlacement[];
  slotByRoomId: Partial<Record<RoomId, PhysicalGridSlot>>;
  roomIdBySlotIndex: Array<RoomId | null>;
  connections: PhysicalDoorConnection[];
  connectionsByRoom: Partial<Record<RoomId, PhysicalDoorConnection[]>>;
  pylonRoomIds: RoomId[];
  reachableRoomIds: RoomId[];
}

export interface FloorNavigationOptions {
  columns?: number;
  rows?: number;
  /** Opt in when a compact adjacent embedding is preferable to stable indices. */
  preferAdjacentPlacement?: boolean;
  /** Defaults to three rooms spread through the generated room order. */
  pylonCount?: number;
  /** Primarily useful to retain objective state while rebuilding a map. */
  pylonRoomIds?: readonly RoomId[];
}

const DIRECTIONS: readonly CardinalDirection[] = ["north", "east", "south", "west"];

function slotAt(index: number, columns: number): PhysicalGridSlot {
  return { index, col: index % columns, row: Math.floor(index / columns) };
}

function adjacentSlotIndices(index: number, columns: number, rows: number): number[] {
  const { col, row } = slotAt(index, columns);
  const result: number[] = [];
  if (row > 0) result.push(index - columns);
  if (col < columns - 1) result.push(index + 1);
  if (row < rows - 1) result.push(index + columns);
  if (col > 0) result.push(index - 1);
  return result;
}

function physicalDirection(from: PhysicalGridSlot, to: PhysicalGridSlot): CardinalDirection | null {
  if (to.col === from.col && to.row === from.row - 1) return "north";
  if (to.col === from.col + 1 && to.row === from.row) return "east";
  if (to.col === from.col && to.row === from.row + 1) return "south";
  if (to.col === from.col - 1 && to.row === from.row) return "west";
  return null;
}

function undirectedNeighbors(floor: ProceduralFloor): Map<RoomId, Set<RoomId>> {
  const knownRooms = new Set(floor.rooms.map((room) => room.id));
  const neighbors = new Map(floor.rooms.map((room) => [room.id, new Set<RoomId>()]));
  floor.doors.forEach((door) => {
    if (!knownRooms.has(door.from) || !knownRooms.has(door.to)) {
      throw new Error(`Door ${door.id} references a room outside this floor.`);
    }
    neighbors.get(door.from)!.add(door.to);
    neighbors.get(door.to)!.add(door.from);
  });
  return neighbors;
}

function collectReachable(entryRoomId: RoomId, neighbors: ReadonlyMap<RoomId, ReadonlySet<RoomId>>): RoomId[] {
  const queue = [entryRoomId];
  const visited = new Set<RoomId>();
  while (queue.length > 0) {
    const roomId = queue.shift()!;
    if (visited.has(roomId)) continue;
    visited.add(roomId);
    neighbors.get(roomId)?.forEach((neighbor) => {
      if (!visited.has(neighbor)) queue.push(neighbor);
    });
  }
  return [...visited];
}

/**
 * Picks objective rooms near 1/4, 1/2, and 3/4 of a twelve-room run. For the
 * current live floor this preserves logical rooms 2, 5, and 8.
 */
export function selectPylonRoomIds(floor: ProceduralFloor, count = 3): RoomId[] {
  const candidates = floor.rooms.filter((room) => room.id !== floor.entryRoomId && room.id !== floor.bossRoomId);
  const safeCount = Math.max(0, Math.min(candidates.length, Math.floor(count)));
  const selected: RoomId[] = [];
  for (let index = 0; index < safeCount; index += 1) {
    const targetOrder = Math.floor(((index + 1) * (floor.roomCount - 1)) / (safeCount + 1));
    const candidate = [...candidates]
      .filter((room) => !selected.includes(room.id))
      .sort((left, right) =>
        Math.abs(left.order - targetOrder) - Math.abs(right.order - targetOrder)
        || left.order - right.order,
      )[0];
    if (candidate) selected.push(candidate.id);
  }
  return selected;
}

function embedRooms(
  floor: ProceduralFloor,
  neighbors: ReadonlyMap<RoomId, ReadonlySet<RoomId>>,
  columns: number,
  rows: number,
): Map<RoomId, number> | null {
  const entrySlot = 0;
  const assigned = new Map<RoomId, number>([[floor.entryRoomId, entrySlot]]);
  const occupied = new Set([entrySlot]);

  const search = (): boolean => {
    if (assigned.size === floor.rooms.length) return true;

    const nextRoom = floor.rooms
      .filter((room) => !assigned.has(room.id))
      .map((room) => ({
        room,
        assignedNeighbors: [...(neighbors.get(room.id) ?? [])].filter((id) => assigned.has(id)),
        degree: neighbors.get(room.id)?.size ?? 0,
      }))
      .filter(({ assignedNeighbors }) => assignedNeighbors.length > 0)
      .sort((left, right) =>
        right.assignedNeighbors.length - left.assignedNeighbors.length
        || right.degree - left.degree
        || left.room.order - right.room.order,
      )[0];
    if (!nextRoom) return false;

    const firstNeighborSlot = assigned.get(nextRoom.assignedNeighbors[0]!)!;
    const candidates = adjacentSlotIndices(firstNeighborSlot, columns, rows)
      .filter((slot) => !occupied.has(slot))
      .filter((slot) => nextRoom.assignedNeighbors.every((neighbor) =>
        adjacentSlotIndices(assigned.get(neighbor)!, columns, rows).includes(slot),
      ))
      // Critical rooms prefer extending away from the entry; leaves fill gaps.
      .sort((left, right) => {
        const leftSlot = slotAt(left, columns);
        const rightSlot = slotAt(right, columns);
        const leftDistance = leftSlot.col + leftSlot.row;
        const rightDistance = rightSlot.col + rightSlot.row;
        return nextRoom.room.isCriticalPath
          ? rightDistance - leftDistance || right - left
          : leftDistance - rightDistance || left - right;
      });

    for (const candidate of candidates) {
      assigned.set(nextRoom.room.id, candidate);
      occupied.add(candidate);

      const hasCapacity = [...(neighbors.get(nextRoom.room.id) ?? [])]
        .filter((neighbor) => !assigned.has(neighbor))
        .length <= adjacentSlotIndices(candidate, columns, rows).filter((slot) => !occupied.has(slot)).length;
      if (hasCapacity && search()) return true;

      assigned.delete(nextRoom.room.id);
      occupied.delete(candidate);
    }
    return false;
  };

  return search() ? assigned : null;
}

export function buildFloorNavigation(
  floor: ProceduralFloor,
  options: FloorNavigationOptions = {},
): FloorNavigationMap {
  const columns = Math.max(1, Math.floor(options.columns ?? 4));
  const rows = Math.max(1, Math.floor(options.rows ?? 3));
  if (floor.rooms.length > columns * rows) {
    throw new Error(`Floor has ${floor.rooms.length} rooms but the ${columns}x${rows} grid has only ${columns * rows} slots.`);
  }

  const neighbors = undirectedNeighbors(floor);
  const reachableRoomIds = collectReachable(floor.entryRoomId, neighbors);
  if (reachableRoomIds.length !== floor.rooms.length || !reachableRoomIds.includes(floor.bossRoomId)) {
    throw new Error("Generated floor must connect every room, including the boss, to the entry.");
  }

  const requestedPylons = options.pylonRoomIds
    ? [...options.pylonRoomIds]
    : selectPylonRoomIds(floor, options.pylonCount);
  const pylonRoomIds = [...new Set(requestedPylons)];
  const roomIds = new Set(floor.rooms.map((room) => room.id));
  if (
    pylonRoomIds.some((id) => !roomIds.has(id) || id === floor.entryRoomId || id === floor.bossRoomId)
    || pylonRoomIds.some((id) => !reachableRoomIds.includes(id))
  ) {
    throw new Error("Every pylon must occupy a reachable non-entry, non-boss room.");
  }

  // Some generated trees cannot be a spanning subgraph of a 4x3 grid (their
  // checkerboard partitions are unbalanced). Those use linked doorways while
  // retaining a stable row-major physical placement.
  const slotIndexByRoomId = (options.preferAdjacentPlacement
    ? embedRooms(floor, neighbors, columns, rows)
    : null) ?? new Map(floor.rooms.map((room, index) => [room.id, index]));
  const slotByRoomId: Partial<Record<RoomId, PhysicalGridSlot>> = {};
  const roomIdBySlotIndex: Array<RoomId | null> = Array(columns * rows).fill(null);
  const pylonSet = new Set(pylonRoomIds);
  const placements = floor.rooms.map((room): PhysicalRoomPlacement => {
    const slot = slotAt(slotIndexByRoomId.get(room.id)!, columns);
    slotByRoomId[room.id] = slot;
    roomIdBySlotIndex[slot.index] = room.id;
    return {
      roomId: room.id,
      roomOrder: room.order,
      kind: room.kind,
      hint: room.fog.hint,
      slot,
      isEntry: room.id === floor.entryRoomId,
      isBoss: room.id === floor.bossRoomId,
      isPylon: pylonSet.has(room.id),
    };
  });

  const roomById = new Map(floor.rooms.map((room) => [room.id, room]));
  const doorByEndpoints = new Map(floor.doors.map((door) => [`${door.from}:${door.to}`, door]));
  const usedDirections = new Map<RoomId, Set<CardinalDirection>>();
  const directionByDoorId = new Map<string, CardinalDirection>();
  floor.rooms.forEach((room) => usedDirections.set(room.id, new Set()));
  floor.doors.forEach((door) => {
    const used = usedDirections.get(door.from)!;
    const fromSlot = slotByRoomId[door.from]!;
    const toSlot = slotByRoomId[door.to]!;
    const available = DIRECTIONS.filter((direction) =>
      direction === "north" ? fromSlot.row > 0
      : direction === "east" ? fromSlot.col < columns - 1
      : direction === "south" ? fromSlot.row < rows - 1
      : fromSlot.col > 0,
    );
    const exact = physicalDirection(fromSlot, toSlot);
    const dx = toSlot.col - fromSlot.col;
    const dy = toSlot.row - fromSlot.row;
    const approximate: CardinalDirection = Math.abs(dx) >= Math.abs(dy)
      ? dx >= 0 ? "east" : "west"
      : dy >= 0 ? "south" : "north";
    const direction = [exact, approximate, ...available]
      .find((candidate): candidate is CardinalDirection => candidate !== null && available.includes(candidate) && !used.has(candidate))!;
    if (!direction) throw new Error(`Room ${door.from} has more connections than its physical slot can expose.`);
    used.add(direction);
    directionByDoorId.set(door.id, direction);
  });

  const connections = floor.doors.map((door): PhysicalDoorConnection => {
    const fromSlot = slotByRoomId[door.from]!;
    const toSlot = slotByRoomId[door.to]!;
    return {
      doorId: door.id,
      reverseDoorId: doorByEndpoints.get(`${door.to}:${door.from}`)?.id ?? null,
      fromRoomId: door.from,
      toRoomId: door.to,
      fromSlot,
      toSlot,
      direction: directionByDoorId.get(door.id)!,
      physicallyAdjacent: physicalDirection(fromSlot, toSlot) !== null,
      gate: door.gate,
      hint: roomById.get(door.to)!.fog.hint,
    };
  });
  const connectionsByRoom: Partial<Record<RoomId, PhysicalDoorConnection[]>> = {};
  floor.rooms.forEach((room) => {
    connectionsByRoom[room.id] = DIRECTIONS.flatMap((direction) =>
      connections.filter((connection) => connection.fromRoomId === room.id && connection.direction === direction),
    );
  });

  return {
    columns,
    rows,
    placements,
    slotByRoomId,
    roomIdBySlotIndex,
    connections,
    connectionsByRoom,
    pylonRoomIds,
    reachableRoomIds,
  };
}

/** The live collision/render loop can query one wall without scanning doors. */
export function connectionInDirection(
  navigation: FloorNavigationMap,
  roomId: RoomId,
  direction: CardinalDirection,
): PhysicalDoorConnection | null {
  return navigation.connectionsByRoom[roomId]?.find((connection) => connection.direction === direction) ?? null;
}

export function roomIdAtSlot(navigation: FloorNavigationMap, slotIndex: number): RoomId | null {
  return navigation.roomIdBySlotIndex[slotIndex] ?? null;
}

/** First doorway on the shortest generated route between two rooms. */
export function nextConnectionToward(
  navigation: FloorNavigationMap,
  fromRoomId: RoomId,
  targetRoomId: RoomId,
): PhysicalDoorConnection | null {
  if (fromRoomId === targetRoomId) return null;
  const queue: Array<{ roomId: RoomId; first: PhysicalDoorConnection | null }> = [{ roomId: fromRoomId, first: null }];
  const visited = new Set<RoomId>([fromRoomId]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const connection of navigation.connectionsByRoom[current.roomId] ?? []) {
      if (visited.has(connection.toRoomId)) continue;
      const first = current.first ?? connection;
      if (connection.toRoomId === targetRoomId) return first;
      visited.add(connection.toRoomId);
      queue.push({ roomId: connection.toRoomId, first });
    }
  }
  return null;
}
