# Signal Depths — Agent Handoff

Last reviewed: 2026-07-21
Baseline commit before this document: `a9a5465` (`Fix doorway access and boss discovery`)

This document is the fastest way for another agent to understand the current game, find the right code, and make changes without undoing recent work.

## Product summary

Signal Depths is a single-player, top-down, 8-bit browser dungeon crawler with a live-broadcast theme. A run lasts up to 720 seconds. The player chooses Knight, Mage, or Archer, explores a hidden 12-room floor, activates three signal pylons, defeats the Broadcast Warden, and exits from the final room.

The current public Sites build is:

- <https://signal-depths-game.keeganohare9.chatgpt.site>

The GitHub repository is:

- <https://github.com/keeganohare9-prog/crawler-game>

## Technology and runtime

- Next.js 16 + React 19 + TypeScript.
- The page is a client component. Gameplay renders into an HTML canvas; menus and HUD are React/HTML.
- The main deployment build uses vinext/Vite and a Cloudflare Worker-compatible entry point.
- GitHub Pages uses a separate static export build.
- No server database or object storage is currently configured. `.openai/hosting.json` has `d1: null` and `r2: null`.
- Persistent progress is browser-local via `localStorage`.
- Audio is synthesized at runtime with square-wave Web Audio oscillators; there are no audio files.
- Most pixel art is drawn with canvas primitives or CSS shapes; there is no sprite-sheet pipeline.

## Canonical project structure

| Path | Responsibility |
| --- | --- |
| `app/page.tsx` | Main game. Owns mutable run state, the animation loop, input, combat integration, collisions, room transitions, rendering, audio, menus, HUD, field guide, armory, and result screens. This is currently about 3,000 lines. |
| `app/globals.css` | All page, HUD, modal, guide, responsive, touch-control, and CSS-art styling. |
| `app/layout.tsx` | Metadata, social preview, favicon, and GitHub Pages asset-prefix handling. |
| `app/game/classes.ts` | Three class definitions and their base stats/identity. |
| `app/game/class-arsenal.ts` | Five Mage focuses and five Archer bows, including stats and unique projectile behaviors. |
| `app/game/combat-content.ts` | Six Knight weapons, weighted drop helpers, enemy behavior definitions, and reusable combat math helpers. |
| `app/game/equipment.ts` | Twelve equipment items across armor, boots, charm, and mod slots. |
| `app/game/floor.ts` | Framework-independent seeded floor/encounter model and pure helpers. `app/page.tsx` currently consumes its generated room kinds but does not use the full logical door graph. |
| `app/game/progression.ts` | Run upgrades, audience dares, sponsor thresholds, scoring, permanent unlock definitions, cursed-item definitions, and boss phase definitions. Some definitions are more complete than their current gameplay integration. |
| `tests/rendered-html.test.mjs` | Three smoke/contract tests covering the rendered shell and important implementation invariants. These are not end-to-end gameplay tests. |
| `worker/index.ts` | vinext/Cloudflare Worker entry point. |
| `vite.config.ts` | Sites/vinext local and production build configuration. |
| `next.config.ts` | Static-export and base-path behavior for GitHub Pages. |
| `.github/workflows/pages.yml` | Deploys the static export to GitHub Pages after pushes to `main`. |
| `.openai/hosting.json` | Sites project binding; preserve the existing opaque `project_id`. |
| `public/signal-depths-social.png` | Open Graph/X social card. |

Do not treat `app/page 2.tsx`, `app/globals 2.css`, or `tsconfig.tsbuildinfo` as canonical source files. They are currently untracked local artifacts and were intentionally left untouched. The canonical gameplay and stylesheet files have no ` 2` suffix.

## Runtime architecture

`Home()` in `app/page.tsx` has two complementary state layers:

1. `gameRef.current` is the authoritative, mutable, per-frame `Game` object. The animation loop mutates it directly for performance.
2. React state (`screen`, `hud`, modal flags, selected class, armory snapshot) drives menus and DOM UI. `makeHud()` creates a small snapshot from the mutable game roughly every 100 ms.

The core flow is:

```text
Title -> Class Selection -> Playing
                         -> Safe-room Upgrade -> Playing
                         -> Pause/Field Guide -> Playing
                         -> Won or Lost -> Run Summary -> Title/New Run
```

The frame loop is created in a `useEffect`:

```text
requestAnimationFrame
  -> updateGame(game, keys, dt)
  -> renderGameV2(ctx, game)
  -> periodically makeHud(game) and synchronize the React screen
```

Important architectural implications:

- High-frequency gameplay values belong in `Game`, not new React state.
- React state is appropriate for menus, dialogs, and low-frequency presentation state.
- `makeGame()` is the run factory. Add new per-run fields both to the `Game` type and its returned object.
- `renderGameV2()` is the active renderer. An older `renderGame()` still exists; do not accidentally implement visual changes only in the old renderer.
- Canvas resolution is `768 × 512`. The logical world is a `4 × 3` grid of rooms; each room is `8 × 8` tiles and each tile is 32 pixels.
- The renderer exposes only the current room, preserving uncertainty about adjacent rooms.

## Floor and room system

The live implementation embeds a seeded logical graph into a 4-by-3 physical floor:

- 12 rooms total.
- Room 1 is the safe entry room.
- `buildFloorNavigation()` places the entry, boss, side branches, and connections into physical slots.
- Three reachable non-entry, non-boss rooms receive signal pylons.
- The remaining room kinds are seeded/shuffled and include ambush, loot, treasure, survival, elite, puzzle, and broadcast rooms.
- The second room is normalized to a basic ambush if generation makes it an elite, survival, or broadcast room.

Room visibility and navigation rules:

- Only the current room is rendered as playable space.
- Each floor deterministically hides three signal chambers in reachable non-safe, non-boss walls. A pulsing cracked wall reveals a `SIGNAL LEAK` at close range; interacting awards a seeded consumable, Hype, and a Hype-scaled score bonus. The HUD and run summary track discoveries across floors.
- Door labels hint at destination risk/reward without exposing the full room. `LINK` passages connect graph branches that cannot be represented by an adjacent physical slot.
- Boss routes use a skull and `BOSS` label; other threats use `DANGER`.
- Physical wall collision uses `isWallTile()`. Door openings span local tile positions `[2, 3, 4, 5, 6]` so the player does not need perfect alignment.
- Ordinary rooms never lock. Enemies from started rooms can pursue the player through doorways using `chaseWaypoint()`.
- The boss stays dormant and shielded until all three pylons are active. The dormant room can be entered and exited.
- Once all pylons are active and the player enters the live boss encounter, only the boss room locks until the Warden dies.
- Enemies are separated from the player every frame by `separateEnemyFromPlayer()` to prevent sprite/attack overlap.

Room completion is computed near the end of `updateGame()`. Loot rooms use a Gambler's Cache: opening the chest has a 50% chance to release a pursuing enemy group and a 50% chance to drop loot.

`app/game/floor.ts` owns logical generation; `app/game/floor-navigation.ts` validates reachability and adapts that graph to canvas slots, collision, route hints, pursuit, and the minimap. Keep those two models synchronized when adding room topology.

## Player classes

All classes share movement, stamina-based dodge, items, equipment, room objectives, and the same normal/heavy input scheme.

### Knight

- 100 Vital, 122 movement speed.
- Uses the six weapons in `combat-content.ts`.
- Basic: equipped weapon attack.
- Heavy: Committed Strike, costing 40 Drive/stamina; approximately 1.65× damage with greater knockback.
- Identity: durable close-range control.

Knight weapons:

- Signal Cleaver: broad, dependable slash.
- Antenna Spear: long, narrow thrust.
- Dead-Air Hammer: slow, heavy impact and knockback.
- Twin Static Knives: two fast, short-range cuts.
- Shock Baton: chain-oriented shock weapon.
- Scrap Launcher: limited-ammo ranged weapon.

### Mage

- 78 Vital, 116 movement speed.
- Mana max 100 and regenerates at 10 per second.
- Basic: the equipped focus's projectile pattern.
- Heavy: Gravity Sigil, costing 50 Mana; forward area damage, pull, and slow.
- Identity: fragile area damage and crowd control.

Mage focuses:

- Signal Grimoire: balanced splash.
- Cinder Codex: slower, larger explosion.
- Frost Prism: piercing lance and recovery delay.
- Storm Orb: chains to nearby targets.
- Void Lantern: impact splash that pulls nearby non-boss enemies.

### Archer

- 86 Vital, 130 movement speed.
- Quiver max 12. Attacks consume arrows; an empty quiver triggers a 0.95-second reload.
- Basic: the equipped bow's projectile pattern.
- Heavy: Power Shot, costing 3 arrows; high damage with two additional pierces and diminishing damage.
- Identity: mobility, sightlines, precision, and range bonuses.

Archer bows:

- Relay Recurve: 25% long-distance damage bonus.
- Deadeye Longbow: stronger long-range reward and short-range penalty.
- Splitwire Bow: three-arrow fan for two arrows.
- Bankshot Bow: two wall bounces.
- Gearshot Repeater: lowest damage and fastest recovery.

Class-compatible arsenal drops replace the current focus/bow and put the previous one on the floor. Knight weapons use the same swap behavior.

## Enemies and boss

Enemy kinds in the live game:

- Razorback Skitter: fast melee pack unit.
- Ironjaw Warden: slower armored bruiser with a longer telegraph.
- Void Spitter: retreats at close range and fires projectiles.
- Halo Medic: approaches and heals wounded allies.
- Gilt-Maw Mimic: tough treasure ambusher.
- Fusewalker: chases, telegraphs, and explodes, damaging nearby units too.
- Broadcast Warden: three-phase boss with melee and radial projectile patterns.

Enemy stats are defined in `enemyStats` inside `app/page.tsx`; more reusable behavior specifications live in `app/game/combat-content.ts`. These are not a single unified source of truth yet.

The boss is invulnerable/dormant before three pylons. Floor-one seeds deterministically select either the Broadcast Warden or Static Conductor. Both use `bossPhaseForHealth()` to select Opening Monologue, Ratings Spike, or Dead Air based on remaining-health ratio. The Warden closes the arena with radial volleys; the Conductor telegraphs a signal cage with two opposite green safe lanes before firing, and its warning window shortens by phase. Floor two remains the Ninja Master encounter.

## Loot, equipment, upgrades, and progression

Consumables:

- `1` Vital Tonic: heals 45 Vital.
- `2` Roombreaker Bomb: 55 damage to enemies in the current room.
- `3` Fury Vial: 1.75× damage for 8 seconds; Long Fuse upgrades extend it.

Equipment has four slots: armor, boots, charm, and mod. Equipping a new item swaps the previous item back onto the floor. Mage and Archer currently use a restricted compatible equipment pool in `selectClassEquipmentDrop()`; Knight uses the whole table.

Safe entry interaction fully heals the player, grants a tonic, and opens a choice of three seeded run upgrades. The game also tracks an audience dare and sponsor rewards tied to Hype thresholds.

- Six class/loadout build synergies activate from matching arsenals, upgrades, and equipment, adding damage, movement, or kill-Hype bonuses.
- Audience votes trigger after rooms 3, 6, and 9. A seeded ballot selects one of six temporary risk/reward rules for the next one or two clears.
- One deterministic cursed relic can drop per floor. All five `CURSED_ITEMS` have live upsides, drawbacks, per-room Hype, HUD/guide presentation, and `cursed_carrier` dare support.
- Standard and date-seeded Daily runs share the same two-floor campaign. The Armory stores a defensive, capped history of the 12 most recent transmissions.

Before changing balance, check whether the specific `RUN_UPGRADES`, `AUDIENCE_DARES`, `PERMANENT_UNLOCKS`, or other declarative entry is referenced in `app/page.tsx`.

## Controls

| Input | Action |
| --- | --- |
| `WASD` or arrow keys | Move and face. |
| `Space` or `J` | Basic attack. |
| `Shift + Space` | Heavy attack. |
| Tap/release `Shift` without a heavy, or press `K` | Dodge. |
| `F` | Interact, activate pylons, open chests, pick up items, or swap weapons/focuses. |
| Hold `F` for about 520 ms near equipment | Equip/swap equipment. |
| `E` or `1` | Use Vital Tonic. |
| `2` | Use Roombreaker Bomb. |
| `3` | Use Fury Vial. |
| `?` or `H` | Toggle the Crawler Field Guide. Opening it during play pauses the run. |
| `Esc` | Pause/resume or close the active guide/armory context. |

Touch controls are rendered below the game with movement, item, interact, dodge, heavy, and attack buttons.

## UI surfaces

- Title overlay: enter the dungeon or open the armory.
- Class selection: choose one of three classes and inspect its basic/heavy attacks.
- HUD: Vital, Drive, class resource, consumables, objective, active weapon/focus, equipment loadout, timer, score, and Hype.
- Crawler Field Guide: Mission, Classes, Controls, Arsenal, Enemies, and Rooms. Class and arsenal sections have class-level filters and show one class catalog at a time.
- Armory: persistent discoveries, available Knight starting weapons, equipment archive, enemy archive, and permanent unlocks.
- Upgrade overlay: select one run upgrade.
- Result overlay: grade, score, exploration, kills, rooms, Hype, damage sources, combat readout, and new unlocks.

When adding a weapon, class focus, enemy, equipment item, room type, or control, update the corresponding field-guide art and copy in the same change.

## Browser-local persistence

The game writes these `localStorage` keys:

- `signal-depths-high-score`
- `signal-depths-lifetime-runs`
- `signal-depths-lifetime-kills`
- `signal-depths-unlocks`
- `signal-depths-discovered-weapons`
- `signal-depths-discovered-equipment`
- `signal-depths-discovered-enemies`
- `signal-depths-starter-weapon`
- `signal-depths-player-class`
- `signal-depths-run-mode`
- `signal-depths-run-history`

There is no schema version or migration layer. Preserve existing value shapes when changing persistence, or add defensive parsing/migration logic.

## Styling and artwork

- The visual language is dark broadcast-control-room UI with gold, pink, cyan, purple, and green signals.
- Canvas sprites are built by `drawEnemySprite()`, `drawPlayerSprite()`, `drawRangedPlayerSprite()`, and `drawWeaponModel()`.
- Field-guide art is CSS-driven through `GuideWeaponArt`, `GuideClassArsenalArt`, `GuideEnemyArt`, `GuideRoomArt`, and related selectors in `globals.css`.
- Character motion, attack arcs, recoil, warning telegraphs, particles, camera shake, hit-stop, and synthesized beeps provide combat feedback.
- Whenever gameplay art changes, check both the live canvas renderer and the field-guide CSS art; they are separate implementations.

## Development and validation

Prerequisite: Node.js `>=22.13.0`.

```bash
npm install
npm run dev
npm run build
npm test
```

Useful scripts:

- `npm run dev`: local vinext development server.
- `npm run build`: Sites/Cloudflare production build.
- `npm test`: runs a fresh production build, then the three Node tests.
- `npm run build:pages`: creates the GitHub Pages static export in `out/`.
- `npm run lint`: ESLint; it is separate from the build.

Testing limitations:

- Current tests render the server shell and inspect source for expected class/door/loot contracts.
- There is no automated movement, combat, collision, seeded-floor, or boss-progression simulation.
- For risky gameplay changes, add pure helper tests where possible and manually verify the live canvas behavior.

## Deployment

There are two delivery paths:

1. **Sites production**: the project ID is stored in `.openai/hosting.json`. Preserve it exactly. The latest confirmed production URL is the `chatgpt.site` URL above.
2. **GitHub Pages**: pushes to `main` run `.github/workflows/pages.yml`, execute `npm run build:pages`, and deploy `out/`.

`app/layout.tsx` and `next.config.ts` contain GitHub Pages base-path handling. Keep both deployment targets working when adding public assets or absolute paths.

## Known technical debt and common traps

1. `app/page.tsx` is a monolith. Prefer extracting pure data/rules first; avoid a broad refactor mixed with a gameplay feature.
2. `renderGame()` is legacy; `renderGameV2()` is active.
3. The floor module's logical graph is richer than the live grid integration.
4. Enemy data exists both in page-local live stats/AI and reusable content definitions.
5. Several progression definitions are aspirational or partially integrated. Data presence does not guarantee live behavior.
6. Randomness mixes seeded floor generation with `Math.random()` for spawns, drops, and loot outcomes, so complete runs are not reproducible from the floor seed.
7. `localStorage` reads use direct `JSON.parse()` in several places; corrupted values can currently break initialization.
8. The game has two deployment configurations; validate both when changing routing or assets.
9. Preserve unrelated/untracked local artifacts. Inspect `git status` before editing and stage only intended files.

## Recommended change workflow for the next agent

1. Read this file, then inspect `git status` before touching anything.
2. Read the relevant data module and the corresponding integration points in `app/page.tsx`.
3. If changing visuals, inspect both canvas drawing code and field-guide CSS art.
4. Make the smallest coherent change; preserve the current mutable-game/React-HUD split.
5. Update field-guide content for player-visible mechanics.
6. Add or update a test for important invariants.
7. Run `npm test`; run `npm run build:pages` too when assets, routing, metadata, or deployment behavior changed.
8. Manually verify movement/door traversal/combat for gameplay changes.
9. Commit only intended files, push `main` when authorized, and publish the same source revision through Sites when the public build should change.

## Current design invariants worth protecting

- The player chooses a class before every run.
- Normal attack is `Space`; heavy attack is `Shift + Space`.
- Only the current room is viewable.
- Doorways are visibly marked and forgiving to traverse.
- Ordinary rooms remain unlocked; enemies can follow between rooms.
- Loot rooms are a 50/50 reward-or-ambush gamble.
- The boss is guaranteed in the final room and clearly marked from adjacent doors.
- The dormant boss room remains escapable; the powered boss fight locks until victory.
- Enemies cannot occupy the same physical space as the player.
- Mage and Archer each retain at least five mechanically distinct arsenal options.
- The Crawler Field Guide mirrors the live classes, weapons/focuses, enemies, rooms, and controls.
