import assert from "node:assert/strict";
import test from "node:test";

import { generateFloor } from "../app/game/floor.ts";
import {
  buildFloorNavigation,
  connectionInDirection,
  roomIdAtSlot,
} from "../app/game/floor-navigation.ts";

test("embeds generated twelve-room graphs into the live 4x3 grid", () => {
  for (let seed = 0; seed < 250; seed += 1) {
    const floor = generateFloor(seed, { roomCount: 12 });
    const navigation = buildFloorNavigation(floor);
    assert.equal(navigation.placements.length, 12);
    assert.equal(new Set(navigation.placements.map(({ slot }) => slot.index)).size, 12);
    assert.equal(roomIdAtSlot(navigation, navigation.slotByRoomId[floor.entryRoomId].index), floor.entryRoomId);

    for (const connection of navigation.connections) {
      const distance = Math.abs(connection.fromSlot.col - connection.toSlot.col)
        + Math.abs(connection.fromSlot.row - connection.toSlot.row);
      assert.equal(connection.physicallyAdjacent, distance === 1);
      assert.equal(connectionInDirection(navigation, connection.fromRoomId, connection.direction)?.doorId, connection.doorId);
    }
    for (const room of floor.rooms) {
      const placement = navigation.slotByRoomId[room.id];
      const directions = navigation.connectionsByRoom[room.id].map(({ direction }) => direction);
      assert.equal(new Set(directions).size, directions.length);
      assert.ok(!directions.includes("north") || placement.row > 0);
      assert.ok(!directions.includes("east") || placement.col < navigation.columns - 1);
      assert.ok(!directions.includes("south") || placement.row < navigation.rows - 1);
      assert.ok(!directions.includes("west") || placement.col > 0);
    }
  }
});

test("places three reachable pylons away from the entry and boss", () => {
  const floor = generateFloor("objective-spread", { roomCount: 12 });
  const navigation = buildFloorNavigation(floor);
  assert.deepEqual(navigation.pylonRoomIds, ["room-2", "room-5", "room-8"]);
  assert.equal(navigation.reachableRoomIds.length, floor.roomCount);
  for (const roomId of [...navigation.pylonRoomIds, floor.bossRoomId]) {
    assert.ok(navigation.reachableRoomIds.includes(roomId));
  }
  assert.equal(navigation.slotByRoomId[floor.entryRoomId].index, 0);
  assert.equal(navigation.slotByRoomId[floor.bossRoomId].index, 11);
});

test("rejects disconnected objectives before runtime integration", () => {
  const floor = generateFloor("broken", { roomCount: 12 });
  floor.doors = floor.doors.filter((door) => door.from !== floor.bossRoomId && door.to !== floor.bossRoomId);
  assert.throws(() => buildFloorNavigation(floor), /connect every room/);
});
