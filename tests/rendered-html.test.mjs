import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the Signal Depths game shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Signal Depths/);
  assert.match(html, /ENTER THE DEPTHS/);
  assert.match(html, /CRAWLER FIELD GUIDE/);
  assert.match(html, /Shift plus Space/);
  assert.match(html, /HEAVY/);
  assert.doesNotMatch(html, /CONTROL DECK/);
  assert.doesNotMatch(html, /Your site is taking shape|react-loading-skeleton/);
});

test("includes the complete three-class combat specification", async () => {
  const [page, classes, arsenal] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/classes.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/class-arsenal.ts", import.meta.url), "utf8"),
  ]);
  assert.match(classes, /knight:/);
  assert.match(classes, /mage:/);
  assert.match(classes, /archer:/);
  assert.match(classes, /Committed Strike/);
  assert.match(classes, /Gravity Sigil/);
  assert.match(classes, /Power Shot/);
  assert.match(page, /screen === "class-select"/);
  assert.match(page, /shiftUsedForHeavy/);
  assert.match(page, /action === "heavy"/);
  assert.match(page, /section === "classes"/);
  assert.match(page, /arsenalClass/);
  assert.match(page, /groundClassArsenal/);
  for (const id of ["signal-grimoire", "cinder-codex", "frost-prism", "storm-orb", "void-lantern", "relay-recurve", "deadeye-longbow", "splitwire-bow", "bankshot-bow", "gearshot-repeater"]) assert.match(arsenal, new RegExp(id));
});

test("supports a persistent keyboard or mouse control profile", async () => {
  const [page, runtime] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/runtime-types.ts", import.meta.url), "utf8"),
  ]);
  assert.match(runtime, /type ControlMode = "keyboard" \| "mouse"/);
  assert.match(page, /signal-depths-control-mode/);
  assert.match(page, /onPointerMove=\{aimAtPointer\}/);
  assert.match(page, /event\.button === 0/);
  assert.match(page, /else heavyAttack\(\)/);
  assert.match(page, /LEFT CLICK/);
  assert.match(page, /RIGHT CLICK/);
  assert.match(page, /mouseAimScale/);
  assert.match(page, /holdToAttack/);
  assert.match(page, /keyboardAimAssist/);
  assert.match(page, /applyKeyboardAimAssist/);
  assert.match(page, /Mouse aim range/);
  assert.match(page, /Hold to attack/);
  assert.match(page, /Keyboard aim assist/);
  assert.match(page, /Choose control mode/);
});

test("offers a persistent unlimited game tester mode", async () => {
  const [page, runtime] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/runtime-types.ts", import.meta.url), "utf8"),
  ]);
  assert.match(runtime, /testerMode: boolean/);
  assert.match(page, /signal-depths-tester-mode/);
  assert.match(page, /function applyTesterLoadout/);
  assert.match(page, /if \(game\.testerMode\) return/);
  assert.match(page, /TESTER MODE ONLINE/);
  assert.match(page, /TESTER MODE \/\/ LIMITERS OFF/);
  assert.match(page, /Remove combat and resource limits/);
  assert.match(page, /game\.testerMode \? 0/);
  assert.match(page, /!game\.testerMode && \(game\.time <= 0 \|\| p\.hp <= 0\)/);
});

test("offers persistent broadcast contracts that alter run risk and payout", async () => {
  const [page, runtime] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/runtime-types.ts", import.meta.url), "utf8"),
  ]);
  assert.match(runtime, /type BroadcastContractId = "redline" \| "iron-signal" \| "one-take"/);
  assert.match(page, /signal-depths-broadcast-contract/);
  assert.match(page, /enemySpeed: 1\.25/);
  assert.match(page, /enemyHealth: 1\.35/);
  assert.match(page, /playerHealth: \.7/);
  assert.match(page, /scoreMultiplier: 1\.5/);
  assert.match(page, /BROADCAST CONTRACT/);
  assert.match(page, /ACTIVE CONTRACT/);
});

test("applies deterministic audience rules and class build synergies consistently", async () => {
  const [page, features, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/broadcast-features.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  for (const id of ["hot_mics", "glass_floor", "speed_round", "sponsor_frenzy", "dead_air", "encore"]) assert.match(features, new RegExp(`id: "${id}"`));
  for (const id of ["knight_breaker", "knight_vanguard", "mage_storm", "mage_void", "archer_deadeye", "archer_trickshot"]) assert.match(features, new RegExp(`id: "${id}"`));
  assert.match(features, /audienceBallot/);
  assert.match(features, /resolveAudienceVote/);
  assert.match(features, /BUILD_SYNERGY_GUIDE/);
  assert.match(page, /function settleAudienceRoomClear/);
  assert.match(page, /settleAudienceRoomClear\(game, 450, 7\)/);
  assert.match(page, /audienceModifierRooms = Math\.max\(0, game\.audienceModifierRooms - 1\)/);
  assert.match(page, /function applyAudienceSpeed/);
  assert.match(page, /applyAudienceSpeed\(game, spawned\)/);
  assert.match(page, /audienceSpeedMultiplier \?\? 1/);
  assert.match(page, /function healPlayer/);
  assert.match(page, /healPlayer\(game, 2\)/);
  assert.match(page, /healPlayer\(game, 3\)/);
  assert.match(page, /healPlayer\(game, 4\)/);
  assert.match(page, /healPlayer\(game, p\.maxHp - p\.hp\)/);
  assert.match(page, /AUDIENCE VOTES \/\/ ROOMS 3, 6, AND 9/);
  assert.match(page, /BUILD \/\/ \{buildSynergyFor\(currentGame\)\.name\.toUpperCase\(\)\}/);
  assert.match(styles, /\.audience-rule-grid/);
  assert.match(styles, /\.synergy-guide-card/);
});

test("makes cursed relics deterministic, playable, and visible", async () => {
  const [page, runtime, cursed, progression, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/runtime-types.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/cursed-items.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/progression.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(cursed, /selectCursedItem/);
  assert.match(cursed, /selectCursedDropRoom/);
  assert.match(runtime, /groundCursedItems: GroundCursedItem\[\]/);
  assert.match(runtime, /cursedItemId: CursedItemId \| null/);
  assert.match(page, /function carryCursedItem/);
  assert.match(page, /CURSE ACCEPTED/);
  assert.match(page, /cursedHypeMultiplier/);
  assert.match(page, /cursedRoomsCleared\+\+/);
  assert.match(page, /activeDareId === "cursed_carrier"/);
  assert.match(progression, /cursedItemsCarried/);
  assert.match(styles, /\.carried-curse/);
  assert.match(styles, /\.curse-guide-card/);
});

test("uses wide doorways, a sealed boss gate, and Gambler's Cache rooms", async () => {
  const [page, floor] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/floor.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /\[2, 3, 4, 5, 6\]\.includes/);
  assert.match(page, /return kind === "boss"/);
  assert.match(page, /function bossGateOpen/);
  assert.match(page, /function movePlayer/);
  assert.match(page, /function recoverEmbeddedEntity/);
  assert.match(page, /function displaceEntity/);
  assert.doesNotMatch(page, /enemy\.x \+=/);
  assert.match(page, /label: "BOSS"/);
  assert.doesNotMatch(page, /BOSS GATE SEALED/);
  assert.match(page, /function chaseWaypoint/);
  assert.match(page, /function doorwayQueueBlocked/);
  assert.match(page, /function doorwayClearanceTarget/);
  assert.doesNotMatch(page, /sharesPlayerRoom && distance > 235/);
  assert.match(page, /function enemyApproachTarget/);
  assert.match(page, /function separateEnemies/);
  assert.match(page, /Math\.random\(\) < \.5/);
  assert.match(page, /releaseLootAmbush/);
  assert.match(floor, /"loot"/);
  assert.doesNotMatch(floor, /"trap"/);
});

test("stages the Broadcast Warden encounter before combat begins", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /bossAwakenTime/);
  assert.match(page, /bossIntroTime/);
  assert.match(page, /bossEngaged/);
  assert.match(page, /FINAL SIGNAL ACCEPTED/);
  assert.match(page, /BROADCAST WARDEN/);
  assert.match(page, /BOSS_VERSUS_DURATION/);
  assert.match(page, /function drawBossVersusSplash/);
  assert.match(page, /function drawVersusPlayerHeadshot/);
  assert.match(page, /function drawVersusBossHeadshot/);
  assert.match(page, /FINAL ENCOUNTER \/\/ LIVE/);
  assert.match(page, /fillText\("VS"/);
  assert.match(page, /PHASE SHIFT/);
  assert.match(page, /enemy\.kind === "boss" && \(activePylons < game\.pylons\.length \|\| !game\.bossEngaged\)/);
});

test("adds traversable room pillars and a telegraphed pulse-floor hazard", async () => {
  const [page, layouts] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/room-layout.ts", import.meta.url), "utf8"),
  ]);
  assert.match(layouts, /obstacleTilesForRoom/);
  assert.match(layouts, /The center cross .* is always open/);
  assert.match(layouts, /"warning" \| "active"/);
  assert.match(layouts, /pointIsOnHazard/);
  assert.match(page, /isRoomObstacleTile\(tx, ty, ROOM_COLS, ROOM_ROWS\)/);
  assert.match(page, /SURGE WARNING/);
  assert.match(page, /hurtPlayer\(game, 9, "Floor surge"\)/);
});

test("adds three distinct support and ambush enemy types", async () => {
  const [page, floor, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/floor.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  for (const kind of ["broadcaster", "bulwark", "burrower"]) {
    assert.match(page, new RegExp(`kind === "${kind}"|kind: "${kind}"`));
    assert.match(floor, new RegExp(`"${kind}"`));
    assert.match(styles, new RegExp(`enemy-art\\.${kind}`));
  }
  assert.match(page, /function summonBroadcasterHusks/);
  assert.match(page, /SIGNAL CUT/);
  assert.match(page, /function shieldingBulwark/);
  assert.match(page, /SHIELDED/);
  assert.match(page, /burrowPhase/);
  assert.match(page, /Scrap Burrower eruption/);
  assert.match(page, /Burrower scrap field/);
  assert.match(page, /highContrastTelegraphs/);
});

test("adds a maze-driven second floor and a multi-state Ninja Master boss", async () => {
  const [page, floor, styles, runtime, maze] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/floor.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/game/runtime-types.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/maze-layout.ts", import.meta.url), "utf8"),
  ]);
  assert.match(runtime, /floorNumber: number/);
  assert.match(page, /mazeSlots\.forEach\(\(slot\) => \{ roomKinds\[slot\] = "maze"; \}\)/);
  assert.match(page, /activeMazeRooms/);
  assert.match(maze, /MAZE_WALL_CELLS/);
  assert.match(maze, /MAZE_WRONG_TURNS/);
  assert.match(page, /function triggerMazeWrongTurn/);
  assert.match(page, /WRONG PATH \/\/ SHADOW AMBUSH REVEALED/);
  assert.match(runtime, /mazeSolved: Set<number>/);
  assert.match(maze, /function mazeGoalPosition/);
  assert.match(page, /MAZE SOLVED \/\/ ALL ROUTES RELEASED/);
  assert.match(runtime, /variant\?:[^;]*"warden"[^;]*"ninja"/);
  assert.match(page, /function summonSignalNinjas/);
  assert.match(page, /NINJA REST MODE/);
  assert.match(page, /kind === "shuriken"/);
  assert.match(page, /behavior: "bounce"/);
  assert.match(page, /const starCount = 3/);
  assert.match(page, /Math\.cos\(angle\) \* 95/);
  assert.match(page, /ninja\.scale = \.64/);
  assert.match(page, /function makeNextFloor/);
  assert.match(page, /game\.floorNumber === 1/);
  assert.match(page, /NINJA MASTER/);
  assert.match(floor, /"maze"/);
  assert.match(floor, /"ninja"/);
  assert.match(styles, /enemy-art\.ninja/);
  assert.match(styles, /room-art\.maze/);
});

test("maps actual exploration state and clearly releases cleared rooms", async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(page, /game\.explored\.has\(String\(room\)\)/);
  assert.match(page, /game\.roomCleared\[room\]/);
  assert.match(page, /poweredPylons/);
  assert.match(page, /boss-locked/);
  assert.match(page, /exit-open/);
  assert.match(page, /SIGNAL SECURED/);
  assert.match(page, /EXITS RELEASED/);
  assert.match(styles, /\.mini-map > div\.current/);
  assert.match(styles, /\.mini-map > div\.cleared/);
});

test("bounds per-frame rendering and indexes enemy AI queries", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const firstTileX = current\.col \* 8/);
  assert.match(page, /tx <= lastTileX/);
  assert.match(page, /function indexLivingEnemies/);
  assert.match(page, /livingByHomeRoom/);
  assert.match(page, /summonsByOwner/);
  assert.match(page, /ninjasByHomeRoom/);
  assert.match(page, /isInActiveRoom/);
});
