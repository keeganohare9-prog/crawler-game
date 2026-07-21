/**
 * Framework-independent procedural floor and encounter definitions.
 *
 * The generated floor is a logical graph of 8-12 rooms. `selectMvpRooms` maps
 * any six-room slice of that graph onto the canvas game's existing 3x2 grid,
 * which lets the UI migrate without changing its world dimensions first.
 */

export type Seed = number | string;

export type RoomId = `room-${number}`;

export type RoomKind =
  | "ambush"
  | "loot"
  | "treasure"
  | "survival"
  | "elite"
  | "puzzle"
  | "safe"
  | "broadcast"
  | "boss";

export type EnemyKind = "skitter" | "warden" | "spitter" | "boss";

export type CardinalDirection = "north" | "east" | "south" | "west";

export type RoomVisibility = "unexplored" | "discovered" | "current" | "cleared";

export interface LogicalPosition {
  x: number;
  y: number;
}

export interface PhysicalRoomSlot {
  /** Column in the existing 3x2 canvas grid. */
  col: 0 | 1 | 2;
  /** Row in the existing 3x2 canvas grid. */
  row: 0 | 1;
  index: 0 | 1 | 2 | 3 | 4 | 5;
}

export interface FogMetadata {
  visibility: RoomVisibility;
  /** Hints can be shown at a doorway without revealing the room itself. */
  hint: "unknown" | "danger" | "reward" | "rest" | "objective";
  revealKindOnDiscover: boolean;
}

export interface EnemySpawn {
  kind: EnemyKind;
  count: number;
  /** Relative 0-1 positions; the integrator can convert these to pixels. */
  formation: "center" | "corners" | "ring" | "edges" | "scattered";
  delaySeconds: number;
}

export interface EnemyWave {
  index: number;
  startsAfterSeconds: number;
  spawns: EnemySpawn[];
}

export interface EnemySpawnRecipe {
  id: string;
  waves: EnemyWave[];
  guaranteedDrop: "none" | "consumable" | "weapon" | "rare";
}

export type EncounterCompletionRule =
  | { type: "none" }
  | { type: "clear-enemies" }
  | { type: "survive"; seconds: number }
  | { type: "collect-reward"; count: number }
  | { type: "activate-switches"; count: number }
  | { type: "accept-or-decline" }
  | { type: "defeat-boss" };

export interface EncounterDefinition {
  id: string;
  kind: RoomKind;
  title: string;
  description: string;
  locksDoorsOnStart: boolean;
  completion: EncounterCompletionRule;
  spawnRecipe: EnemySpawnRecipe | null;
  rewardTier: "none" | "common" | "uncommon" | "rare" | "boss";
}

export interface DoorDefinition {
  id: string;
  from: RoomId;
  to: RoomId;
  direction: CardinalDirection;
  /** Boss gates can additionally be held by a floor-level objective. */
  gate: "standard" | "boss";
}

export interface RoomDefinition {
  id: RoomId;
  order: number;
  kind: RoomKind;
  logicalPosition: LogicalPosition;
  fog: FogMetadata;
  encounter: EncounterDefinition;
  doorIds: string[];
  isEntry: boolean;
  isCriticalPath: boolean;
}

export interface RouteChoice {
  from: RoomId;
  options: Array<{
    roomId: RoomId;
    doorId: string;
    hint: FogMetadata["hint"];
  }>;
}

export interface ProceduralFloor {
  version: 1;
  seed: number;
  roomCount: number;
  entryRoomId: RoomId;
  bossRoomId: RoomId;
  rooms: RoomDefinition[];
  doors: DoorDefinition[];
  routeChoices: RouteChoice[];
}

export interface MvpRoomSelection {
  rooms: Array<{
    room: RoomDefinition;
    slot: PhysicalRoomSlot;
  }>;
  roomToSlot: Partial<Record<RoomId, PhysicalRoomSlot>>;
  /** Doors whose two endpoints are both present in this six-room projection. */
  visibleDoors: DoorDefinition[];
}

export interface FloorGenerationOptions {
  /** Clamped to 8-12. Defaults to a seeded random value in that range. */
  roomCount?: number;
  /** A zero-based six-room page used for the initial 3x2 MVP projection. */
  mvpPage?: number;
}

export interface EncounterProgress {
  started: boolean;
  completed: boolean;
  enemiesRemaining: number;
  elapsedSeconds: number;
  rewardsCollected: number;
  switchesActivated: number;
  decisionMade: boolean;
  bossDefeated: boolean;
}

export interface DoorLockContext {
  encounter: EncounterProgress;
  bossGateRequirementMet?: boolean;
}

export type DoorLockReason = "open" | "encounter" | "boss-objective";

export interface DoorLockState {
  locked: boolean;
  reason: DoorLockReason;
}

const ROOM_KIND_HINTS: Record<RoomKind, FogMetadata["hint"]> = {
  ambush: "danger",
  loot: "reward",
  treasure: "reward",
  survival: "danger",
  elite: "danger",
  puzzle: "objective",
  safe: "rest",
  broadcast: "objective",
  boss: "danger",
};

const PHYSICAL_SLOTS: readonly PhysicalRoomSlot[] = [
  { col: 0, row: 0, index: 0 },
  { col: 1, row: 0, index: 1 },
  { col: 2, row: 0, index: 2 },
  { col: 0, row: 1, index: 3 },
  { col: 1, row: 1, index: 4 },
  { col: 2, row: 1, index: 5 },
] as const;

const STANDARD_KINDS: readonly RoomKind[] = [
  "ambush",
  "loot",
  "treasure",
  "survival",
  "elite",
  "puzzle",
  "broadcast",
] as const;

/** Stable 32-bit seed normalization for both numeric and human-readable seeds. */
export function normalizeSeed(seed: Seed): number {
  if (typeof seed === "number" && Number.isFinite(seed)) return seed >>> 0;
  const text = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed: number): () => number {
  let state = seed || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(values: readonly T[], random: () => number): T {
  return values[Math.floor(random() * values.length)] as T;
}

function clampRoomCount(roomCount: number): number {
  return Math.max(8, Math.min(12, Math.floor(roomCount)));
}

function roomId(index: number): RoomId {
  return `room-${index}`;
}

function directionBetween(from: LogicalPosition, to: LogicalPosition): CardinalDirection {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "east" : "west";
  return dy >= 0 ? "south" : "north";
}

function opposite(direction: CardinalDirection): CardinalDirection {
  if (direction === "north") return "south";
  if (direction === "south") return "north";
  if (direction === "east") return "west";
  return "east";
}

function makeRecipe(kind: RoomKind, intensity: number): EnemySpawnRecipe | null {
  const count = Math.max(1, intensity);
  switch (kind) {
    case "ambush":
      return {
        id: `ambush-${intensity}`,
        waves: [{ index: 0, startsAfterSeconds: 0.4, spawns: [
          { kind: "skitter", count: count + 1, formation: "edges", delaySeconds: 0 },
          { kind: "spitter", count: Math.max(1, count - 1), formation: "corners", delaySeconds: 0.7 },
        ] }],
        guaranteedDrop: "consumable",
      };
    case "survival":
      return {
        id: `survival-${intensity}`,
        waves: [0, 1, 2].map((wave) => ({
          index: wave,
          startsAfterSeconds: wave * 9,
          spawns: [{
            kind: wave === 2 ? "warden" : "skitter",
            count: wave === 2 ? 1 : count + wave,
            formation: wave % 2 === 0 ? "edges" : "ring",
            delaySeconds: 0,
          }],
        })),
        guaranteedDrop: "consumable",
      };
    case "elite":
      return {
        id: `elite-${intensity}`,
        waves: [{ index: 0, startsAfterSeconds: 0.6, spawns: [
          { kind: "warden", count: 1, formation: "center", delaySeconds: 0 },
          { kind: "spitter", count: Math.min(2, count), formation: "corners", delaySeconds: 0.8 },
        ] }],
        guaranteedDrop: "rare",
      };
    case "broadcast":
      return {
        id: `broadcast-${intensity}`,
        waves: [{ index: 0, startsAfterSeconds: 0, spawns: [
          { kind: pick(["skitter", "spitter", "warden"] as const, createRandom(intensity)), count, formation: "scattered", delaySeconds: 1 },
        ] }],
        guaranteedDrop: "weapon",
      };
    case "boss":
      return {
        id: "broadcast-warden",
        waves: [
          { index: 0, startsAfterSeconds: 0.8, spawns: [{ kind: "boss", count: 1, formation: "center", delaySeconds: 0 }] },
          { index: 1, startsAfterSeconds: 18, spawns: [{ kind: "skitter", count: 3, formation: "edges", delaySeconds: 0 }] },
          { index: 2, startsAfterSeconds: 34, spawns: [{ kind: "spitter", count: 2, formation: "corners", delaySeconds: 0 }] },
        ],
        guaranteedDrop: "rare",
      };
    default:
      return null;
  }
}

function makeEncounter(kind: RoomKind, order: number): EncounterDefinition {
  const intensity = 1 + Math.floor(order / 3);
  const base = {
    id: `${kind}-${order}`,
    kind,
    spawnRecipe: makeRecipe(kind, intensity),
  };

  switch (kind) {
    case "ambush":
      return { ...base, title: "Dead-Air Ambush", description: "The doors seal as movement floods the room.", locksDoorsOnStart: true, completion: { type: "clear-enemies" }, rewardTier: "common" };
    case "loot":
      return { ...base, title: "Gambler's Cache", description: "Open the cache: half pay out, half release a waiting ambush.", locksDoorsOnStart: false, completion: { type: "collect-reward", count: 1 }, rewardTier: "uncommon" };
    case "treasure":
      return { ...base, title: "Sponsor Cache", description: "Choose and collect a reward from the broadcast cache.", locksDoorsOnStart: false, completion: { type: "collect-reward", count: 1 }, rewardTier: "uncommon" };
    case "survival":
      return { ...base, title: "Hold the Feed", description: "Stay alive while three waves enter the room.", locksDoorsOnStart: true, completion: { type: "survive", seconds: 30 }, rewardTier: "uncommon" };
    case "elite":
      return { ...base, title: "Prime-Time Threat", description: "A dangerous enemy guards a guaranteed rare drop.", locksDoorsOnStart: true, completion: { type: "clear-enemies" }, rewardTier: "rare" };
    case "puzzle":
      return { ...base, title: "Relay Sequence", description: "Activate three relays in the signaled order.", locksDoorsOnStart: true, completion: { type: "activate-switches", count: 3 }, rewardTier: "uncommon" };
    case "safe":
      return { ...base, title: "Off-Air Shelter", description: "Heal and choose a run upgrade.", locksDoorsOnStart: false, completion: { type: "none" }, rewardTier: "none" };
    case "broadcast":
      return { ...base, title: "Audience Dare", description: "Accept or decline a dangerous optional modifier.", locksDoorsOnStart: false, completion: { type: "accept-or-decline" }, rewardTier: "rare" };
    case "boss":
      return { ...base, title: "The Broadcast Warden", description: "End the floor's transmission.", locksDoorsOnStart: true, completion: { type: "defeat-boss" }, rewardTier: "boss" };
  }
}

function createKinds(count: number, random: () => number): RoomKind[] {
  // Entry is safe, final room is boss. Mandatory middle rooms guarantee variety.
  const middleCount = count - 2;
  const mandatory: RoomKind[] = ["ambush", "loot", "treasure", "survival", "elite", "puzzle", "broadcast"];
  const kinds = mandatory.slice(0, middleCount);
  while (kinds.length < middleCount) kinds.push(pick(STANDARD_KINDS, random));

  // Deterministic Fisher-Yates shuffle.
  for (let index = kinds.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [kinds[index], kinds[target]] = [kinds[target] as RoomKind, kinds[index] as RoomKind];
  }
  return ["safe", ...kinds, "boss"];
}

/**
 * Generates a deterministic logical floor. The same seed and options always
 * produce byte-for-byte equivalent room, route, encounter, and spawn data.
 */
export function generateFloor(seed: Seed, options: FloorGenerationOptions = {}): ProceduralFloor {
  const normalizedSeed = normalizeSeed(seed);
  const random = createRandom(normalizedSeed);
  const count = clampRoomCount(options.roomCount ?? (8 + Math.floor(random() * 5)));
  const kinds = createKinds(count, random);

  const rooms: RoomDefinition[] = kinds.map((kind, order) => ({
    id: roomId(order),
    order,
    kind,
    logicalPosition: { x: order, y: 0 },
    fog: {
      visibility: order === 0 ? "current" : "unexplored",
      hint: order === 0 ? "rest" : ROOM_KIND_HINTS[kind],
      revealKindOnDiscover: kind !== "broadcast",
    },
    encounter: makeEncounter(kind, order),
    doorIds: [],
    isEntry: order === 0,
    isCriticalPath: true,
  }));

  // Move optional rooms into side branches while preserving a guaranteed path.
  const branchIndices = new Set<number>();
  for (let index = 2; index < count - 2; index += 3) {
    if (random() > 0.25) branchIndices.add(index);
  }
  branchIndices.forEach((index) => {
    const room = rooms[index] as RoomDefinition;
    room.logicalPosition = { x: index - 1, y: random() < 0.5 ? -1 : 1 };
    room.isCriticalPath = false;
  });

  const doors: DoorDefinition[] = [];
  const connect = (left: RoomDefinition, right: RoomDefinition, gate: DoorDefinition["gate"] = "standard") => {
    const forwardDirection = directionBetween(left.logicalPosition, right.logicalPosition);
    const forwardId = `door-${left.id}-${right.id}`;
    const backwardId = `door-${right.id}-${left.id}`;
    doors.push(
      { id: forwardId, from: left.id, to: right.id, direction: forwardDirection, gate },
      { id: backwardId, from: right.id, to: left.id, direction: opposite(forwardDirection), gate },
    );
    left.doorIds.push(forwardId);
    right.doorIds.push(backwardId);
  };

  let previousCritical = rooms[0] as RoomDefinition;
  for (let index = 1; index < rooms.length; index += 1) {
    const room = rooms[index] as RoomDefinition;
    if (!room.isCriticalPath) {
      connect(previousCritical, room);
      continue;
    }
    connect(previousCritical, room, room.kind === "boss" ? "boss" : "standard");
    previousCritical = room;
  }

  const routeChoices: RouteChoice[] = rooms.flatMap((room) => {
    const options = doors
      .filter((door) => door.from === room.id)
      .map((door) => {
        const target = rooms.find((candidate) => candidate.id === door.to) as RoomDefinition;
        return { roomId: target.id, doorId: door.id, hint: target.fog.hint };
      });
    return options.length > 1 ? [{ from: room.id, options }] : [];
  });

  return {
    version: 1,
    seed: normalizedSeed,
    roomCount: count,
    entryRoomId: rooms[0]!.id,
    bossRoomId: rooms[rooms.length - 1]!.id,
    rooms,
    doors,
    routeChoices,
  };
}

/** Maps one logical six-room page onto the current left-to-right 3x2 layout. */
export function selectMvpRooms(floor: ProceduralFloor, page = 0): MvpRoomSelection {
  const pageCount = Math.ceil(floor.rooms.length / PHYSICAL_SLOTS.length);
  const safePage = Math.max(0, Math.min(pageCount - 1, Math.floor(page)));
  const start = safePage * PHYSICAL_SLOTS.length;
  const selected = floor.rooms.slice(start, start + PHYSICAL_SLOTS.length);
  const rooms = selected.map((room, index) => ({
    room,
    slot: PHYSICAL_SLOTS[index] as PhysicalRoomSlot,
  }));
  const selectedIds = new Set(selected.map((room) => room.id));
  const roomToSlot: Partial<Record<RoomId, PhysicalRoomSlot>> = {};
  rooms.forEach(({ room, slot }) => { roomToSlot[room.id] = slot; });
  return {
    rooms,
    roomToSlot,
    visibleDoors: floor.doors.filter((door) => selectedIds.has(door.from) && selectedIds.has(door.to)),
  };
}

export function createEncounterProgress(): EncounterProgress {
  return {
    started: false,
    completed: false,
    enemiesRemaining: 0,
    elapsedSeconds: 0,
    rewardsCollected: 0,
    switchesActivated: 0,
    decisionMade: false,
    bossDefeated: false,
  };
}

/** Pure completion check, intended to be called after each gameplay event. */
export function isEncounterComplete(
  definition: EncounterDefinition,
  progress: EncounterProgress,
): boolean {
  const rule = definition.completion;
  switch (rule.type) {
    case "none": return true;
    case "clear-enemies": return progress.started && progress.enemiesRemaining <= 0;
    case "survive": return progress.started && progress.elapsedSeconds >= rule.seconds;
    case "collect-reward": return progress.rewardsCollected >= rule.count;
    case "activate-switches": return progress.switchesActivated >= rule.count;
    case "accept-or-decline": return progress.decisionMade;
    case "defeat-boss": return progress.bossDefeated;
  }
}

/** Returns a copied progress object with its completion flag synchronized. */
export function updateEncounterProgress(
  definition: EncounterDefinition,
  progress: EncounterProgress,
  patch: Partial<Omit<EncounterProgress, "completed">>,
): EncounterProgress {
  const next = { ...progress, ...patch };
  return { ...next, completed: isEncounterComplete(definition, next) };
}

/**
 * Computes whether one side of a door should render/behave as locked.
 * Encounter locks take precedence over boss objective gates.
 */
export function getDoorLockState(
  door: DoorDefinition,
  room: RoomDefinition,
  context: DoorLockContext,
): DoorLockState {
  if (
    room.encounter.locksDoorsOnStart
    && context.encounter.started
    && !context.encounter.completed
  ) {
    return { locked: true, reason: "encounter" };
  }
  if (door.gate === "boss" && context.bossGateRequirementMet === false) {
    return { locked: true, reason: "boss-objective" };
  }
  return { locked: false, reason: "open" };
}

/** Updates fog without mutating the generated floor definition. */
export function setCurrentRoomVisibility(
  floor: ProceduralFloor,
  currentRoomId: RoomId,
  clearedRoomIds: ReadonlySet<RoomId> = new Set<RoomId>(),
): ProceduralFloor {
  return {
    ...floor,
    rooms: floor.rooms.map((room) => {
      let visibility: RoomVisibility = room.fog.visibility;
      if (clearedRoomIds.has(room.id)) visibility = "cleared";
      else if (room.id === currentRoomId) visibility = "current";
      else if (visibility === "current") visibility = "discovered";
      return { ...room, fog: { ...room.fog, visibility } };
    }),
  };
}

/** Returns only information safe to display before the destination is entered. */
export function getDoorwayPreview(
  floor: ProceduralFloor,
  doorId: string,
): { roomId: RoomId; hint: FogMetadata["hint"]; kind?: RoomKind } | null {
  const door = floor.doors.find((candidate) => candidate.id === doorId);
  if (!door) return null;
  const target = floor.rooms.find((room) => room.id === door.to);
  if (!target) return null;
  const mayRevealKind = target.fog.visibility !== "unexplored" && target.fog.revealKindOnDiscover;
  return {
    roomId: target.id,
    hint: target.fog.visibility === "unexplored" ? "unknown" : target.fog.hint,
    ...(mayRevealKind ? { kind: target.kind } : {}),
  };
}
