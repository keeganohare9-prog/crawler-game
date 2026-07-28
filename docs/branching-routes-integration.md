# Branching routes integration

`app/game/floor-navigation.ts` embeds the logical `generateFloor` graph in the
live 4×3 canvas. It is intentionally separate from `app/page.tsx` so the graph
and collision contract can be tested before changing the render loop.

## Integration checklist

1. In `makeGame`, build one floor and call `buildFloorNavigation(floor)`. Store
   the floor and navigation map on `Game`; derive `roomKinds` by physical slot
   from `navigation.placements`, rather than logical room order.
2. Spawn the player, enemies, chests, boss, and pylons using each placement's
   `slot.index`. Use `navigation.pylonRoomIds` instead of hard-coded room indices
   `[2, 5, 8]`. The default selection intentionally retains those logical IDs.
3. At each wall, convert the current physical room index with
   `roomIdAtSlot`, then call `connectionInDirection`. Permit the doorway only
   when a connection exists and its encounter/boss gate is open. Crossing a
   linked doorway (`physicallyAdjacent === false`) moves the player just inside
   the reciprocal doorway in `connection.toSlot`; this is required because not
   every generated tree is mathematically embeddable as a spanning subgraph of
   a 4×3 grid. A neighboring cell without a graph connection remains a wall.
4. In `drawGame`, render doorway geometry and route clues only for returned
   connections. `connection.hint` describes the destination without exposing
   its exact room kind.
5. Replace minimap sequential adjacency with `navigation.connections`; mark
   occupied slots via `roomIdBySlotIndex`. This makes side branches visible as
   real branches after discovery.
6. Keep encounter state keyed by `RoomId` (or add a physical-index adapter)
   before allowing sparse grids for floors shorter than twelve rooms.
7. Rebuild navigation for floor two, then apply its maze and boss variants by
   logical room ID before spawning entities.

The adapter validates that every generated room, all selected pylons, and the
boss are reachable from the entry. It also fails early if a malformed graph
cannot be embedded into the configured physical grid.
