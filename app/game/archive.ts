import type { ClassArsenalId } from "./class-arsenal";
import type { WeaponId } from "./combat-content";
import type { CursedItemId } from "./cursed-items";
import type { EnemyKind } from "./floor";

type ArchiveEnemyId = Exclude<EnemyKind, "boss">;

export type ArchiveCategoryId = "enemies" | "arsenals" | "curses" | "bosses" | "endings" | "secrets";
export type ArchiveEntryId = `${"enemy" | "weapon" | "arsenal" | "curse" | "boss" | "ending" | "lore"}:${string}`;
export type ArchiveLockState = "unknown" | "corrupted";

export interface ArchiveCategory {
  id: ArchiveCategoryId;
  name: string;
  description: string;
  lockedLabel: string;
}

export interface ArchiveEntry {
  id: ArchiveEntryId;
  sourceId: string;
  category: ArchiveCategoryId;
  name: string;
  summary: string;
  detail: string;
  glyph: string;
  locked: {
    state: ArchiveLockState;
    name: string;
    summary: string;
    glyph: string;
  };
}

export interface ArchivePresentation {
  id: ArchiveEntryId;
  category: ArchiveCategoryId;
  discovered: boolean;
  state: "decoded" | ArchiveLockState;
  name: string;
  summary: string;
  detail: string | null;
  glyph: string;
}

export const ARCHIVE_CATEGORIES = [
  { id: "enemies", name: "Hostile Signals", description: "Creatures and constructs recorded on the floor.", lockedLabel: "UNKNOWN CONTACT" },
  { id: "arsenals", name: "Broadcast Arsenal", description: "Knight weapons, Mage focuses, and Archer bows.", lockedLabel: "UNREGISTERED ARMAMENT" },
  { id: "curses", name: "Cursed Relics", description: "Powerful objects whose signal always carries a price.", lockedLabel: "CORRUPTED RELIC" },
  { id: "bosses", name: "Headliners", description: "The entities waiting at the end of a transmission.", lockedLabel: "UNKNOWN HEADLINER" },
  { id: "endings", name: "Transmission Endings", description: "The ways a broadcast can leave the air.", lockedLabel: "ENDING REDACTED" },
  { id: "secrets", name: "Dead-Drop Lore", description: "Recovered fragments from hidden chambers and signal leaks.", lockedLabel: "DATA CORRUPTED" },
] as const satisfies readonly ArchiveCategory[];

const locked = (state: ArchiveLockState, name: string, glyph = "??") => ({
  state,
  name,
  summary: state === "corrupted" ? "SIGNAL DAMAGED // RECOVERY REQUIRED" : "NO VERIFIED SIGNAL",
  glyph,
});

const archiveEnemies = [
  ["skitter", "Razorback Skitter", "Fast pack hunter", "Its striped carapace announces a creature built to surround isolated crawlers.", "SK"],
  ["warden", "Ironjaw Warden", "Armored bruiser", "A shielded enforcer with a slow, punishing shock-club recovery.", "IW"],
  ["spitter", "Void Spitter", "Ranged controller", "Its bright eye tracks targets while the body retreats behind violet bolts.", "VS"],
  ["healer", "Halo Medic", "Enemy support", "Orbiting repair nodes restore the most damaged nearby hostile.", "HM"],
  ["mimic", "Gilt-Maw Mimic", "Treasure ambusher", "A cache-shaped predator with eyes beneath the lid and far too many teeth.", "GM"],
  ["volatile", "Fusewalker", "Walking explosion", "A flashing containment ring marks the short window before detonation.", "FW"],
  ["broadcaster", "Husk Broadcaster", "Interruptible summoner", "Its antenna calls reinforcements unless the transmission is cut by damage.", "HB"],
  ["bulwark", "Bulwark Drone", "Mobile shield projector", "Cyan links identify nearby hostiles protected by its field.", "BD"],
  ["burrower", "Scrap Burrower", "Subterranean ambusher", "Orange trails lead to an eruption point and a lingering field of shrapnel.", "SB"],
  ["ninja", "Signal Ninja", "Boss-linked assassin", "These fast blades keep the Ninja Master vulnerable while they remain alive.", "SN"],
] as const satisfies readonly [ArchiveEnemyId, string, string, string, string][];

const enemyEntries: readonly ArchiveEntry[] = archiveEnemies.map(([sourceId, name, summary, detail, glyph]) => ({
  id: `enemy:${sourceId}` as ArchiveEntryId,
  sourceId,
  category: "enemies" as const,
  name,
  summary,
  detail,
  glyph,
  locked: locked("unknown", "UNKNOWN CONTACT"),
}));

const archiveWeapons = [
  ["cleaver", "Signal Cleaver", "COMMON SLASH WEAPON", "A reliable broad swing with enough weight to make space.", "SL"],
  ["spear", "Antenna Spear", "COMMON PIERCE WEAPON", "Long, narrow reach that rewards careful alignment.", "PI"],
  ["hammer", "Dead-Air Hammer", "UNCOMMON IMPACT WEAPON", "A slow impact that sends crowds tumbling away.", "IM"],
  ["twin-knives", "Twin Static Knives", "UNCOMMON SLASH WEAPON", "Two rapid cuts for crawlers willing to remain in danger.", "SL"],
  ["shock-baton", "Shock Baton", "RARE SHOCK WEAPON", "A compact strike that arcs into nearby targets.", "SH"],
  ["scrap-launcher", "Scrap Launcher", "RARE SCRAP WEAPON", "Limited ammunition buys safe, forceful ranged attacks.", "SC"],
] as const satisfies readonly [WeaponId, string, string, string, string][];

const weaponEntries: readonly ArchiveEntry[] = archiveWeapons.map(([sourceId, name, summary, detail, glyph]) => ({
  id: `weapon:${sourceId}` as ArchiveEntryId,
  sourceId,
  category: "arsenals",
  name,
  summary,
  detail,
  glyph,
  locked: locked("unknown", "UNREGISTERED WEAPON"),
}));

const archiveClassArsenals = [
  ["signal-grimoire", "Signal Grimoire", "MAGE // Arc Bolt splashes nearby targets", "A balanced broadcast tome casting condensed signal bolts.", "MG"],
  ["cinder-codex", "Cinder Codex", "MAGE // Large ember explosion", "A scorched manual trading casting speed for violent bursts.", "MG"],
  ["frost-prism", "Frost Prism", "MAGE // Piercing frost lance", "A crystalline focus that fires through enemy ranks.", "MG"],
  ["storm-orb", "Storm Orb", "MAGE // Chain spark", "A captive thunderhead rewarding tightly packed targets.", "MG"],
  ["void-lantern", "Void Lantern", "MAGE // Gravity pull", "A forbidden lamp whose seeds drag formations toward impact.", "MG"],
  ["relay-recurve", "Relay Recurve", "ARCHER // Distance bonus", "A responsive bow built for pressure and repositioning.", "AR"],
  ["deadeye-longbow", "Deadeye Longbow", "ARCHER // Longshot", "A severe longbow with unmatched first-target impact.", "AR"],
  ["splitwire-bow", "Splitwire Bow", "ARCHER // Three-arrow spread", "A split-limbed bow turning one release into a fan.", "AR"],
  ["bankshot-bow", "Bankshot Bow", "ARCHER // Ricochet", "A tuned frame that turns walls into firing angles.", "AR"],
  ["gearshot-repeater", "Gearshot Repeater", "ARCHER // Rapid fire", "A fast mechanical bow built to sustain pressure.", "AR"],
] as const satisfies readonly [ClassArsenalId, string, string, string, string][];

const classArsenalEntries: readonly ArchiveEntry[] = archiveClassArsenals.map(([sourceId, name, summary, detail, glyph]) => ({
  id: `arsenal:${sourceId}` as ArchiveEntryId,
  sourceId,
  category: "arsenals",
  name,
  summary,
  detail,
  glyph,
  locked: locked("unknown", glyph === "MG" ? "UNREGISTERED FOCUS" : "UNREGISTERED BOW"),
}));

const archiveCurses = [
  ["idol_open_mic", "Open-Mic Idol", 5, "Fantastic for ratings. Terrible for privacy."],
  ["boots_bad_timing", "Boots of Bad Timing", 4, "Impossibly quick, suspiciously unlucky."],
  ["glass_transmitter", "Glass Transmitter", 6, "Makes every hit louder—including theirs."],
  ["hungry_crown", "The Hungry Crown", 7, "Rewards aggression and punishes hesitation."],
  ["mirror_badge", "Mirror Badge", 5, "Projectiles dim while close-range impacts intensify."],
] as const satisfies readonly [CursedItemId, string, number, string][];

const curseEntries: readonly ArchiveEntry[] = archiveCurses.map(([sourceId, name, hypePerRoom, detail]) => ({
  id: `curse:${sourceId}` as ArchiveEntryId,
  sourceId,
  category: "curses",
  name,
  summary: `CURSED // +${hypePerRoom} HYPE PER ROOM`,
  detail,
  glyph: "!",
  locked: locked("corrupted", "CORRUPTED RELIC", "!!"),
}));

const bossEntries: readonly ArchiveEntry[] = [
  { id: "boss:broadcast-warden", sourceId: "broadcast-warden", category: "bosses", name: "Broadcast Warden", summary: "Channel 13 floor boss", detail: "A three-phase bruiser whose radial volleys close every channel.", glyph: "BW", locked: locked("unknown", "UNKNOWN HEADLINER") },
  { id: "boss:static-conductor", sourceId: "static-conductor", category: "bosses", name: "Static Conductor", summary: "Static Network floor boss", detail: "Its signal cage leaves two opposite safe lanes before the array fires.", glyph: "SC", locked: locked("unknown", "UNKNOWN HEADLINER") },
  { id: "boss:ninja-master", sourceId: "ninja-master", category: "bosses", name: "Ninja Master", summary: "Shadow Network floor boss", detail: "A master assassin alternating vulnerable waves with an invincible rest-mode storm.", glyph: "NM", locked: locked("unknown", "UNKNOWN HEADLINER") },
];

const endingEntries: readonly ArchiveEntry[] = [
  { id: "ending:escaped", sourceId: "escaped", category: "endings", name: "Signal Escaped", summary: "Transmission complete", detail: "The boss fell and Subject 404 reached the exit channel before the feed closed.", glyph: "EX", locked: locked("corrupted", "ENDING REDACTED") },
  { id: "ending:subject-offline", sourceId: "subject-offline", category: "endings", name: "Subject Offline", summary: "Vital signal lost", detail: "The crawler fell, but the archive retained the final frames.", glyph: "KO", locked: locked("corrupted", "ENDING REDACTED") },
  { id: "ending:window-closed", sourceId: "window-closed", category: "endings", name: "Broadcast Window Closed", summary: "Transmission timed out", detail: "The countdown reached dead air before the exit channel opened.", glyph: "00", locked: locked("corrupted", "ENDING REDACTED") },
];

const loreEntries: readonly ArchiveEntry[] = [
  { id: "lore:signal-leak", sourceId: "signal-leak", category: "secrets", name: "The Signal Behind the Wall", summary: "First hidden chamber recovered", detail: "The floor's masonry is a shell. Something beneath it is still broadcasting.", glyph: "01", locked: locked("corrupted", "DATA CORRUPTED") },
  { id: "lore:ratings-ledger", sourceId: "ratings-ledger", category: "secrets", name: "Ratings Ledger", summary: "Two hidden chambers recovered", detail: "Every injury, detour, and narrow escape was priced before Subject 404 entered.", glyph: "02", locked: locked("corrupted", "DATA CORRUPTED") },
  { id: "lore:channel-zero", sourceId: "channel-zero", category: "secrets", name: "Channel Zero", summary: "Three hidden chambers recovered", detail: "Channel 13 is not the first broadcast. It is the first one the audience remembers.", glyph: "03", locked: locked("corrupted", "DATA CORRUPTED") },
  { id: "lore:shadow-carrier", sourceId: "shadow-carrier", category: "secrets", name: "The Shadow Carrier", summary: "Floor-two fragment", detail: "The Shadow Network does not transmit through machines. It transmits through survivors.", glyph: "04", locked: locked("corrupted", "DATA CORRUPTED") },
];

export const ARCHIVE_ENTRIES: readonly ArchiveEntry[] = [
  ...enemyEntries,
  ...weaponEntries,
  ...classArsenalEntries,
  ...curseEntries,
  ...bossEntries,
  ...endingEntries,
  ...loreEntries,
];

const ENTRY_BY_ID = new Map(ARCHIVE_ENTRIES.map((entry) => [entry.id, entry]));

export interface ArchiveDiscoveryProfile {
  version: 2;
  discoveredIds: ArchiveEntryId[];
  acknowledgedIds: ArchiveEntryId[];
}

export const EMPTY_ARCHIVE_PROFILE: ArchiveDiscoveryProfile = {
  version: 2,
  discoveredIds: [],
  acknowledgedIds: [],
};

function uniqueKnownIds(values: readonly unknown[]): ArchiveEntryId[] {
  const result: ArchiveEntryId[] = [];
  for (const value of values) {
    if (typeof value !== "string" || !ENTRY_BY_ID.has(value as ArchiveEntryId) || result.includes(value as ArchiveEntryId)) continue;
    result.push(value as ArchiveEntryId);
  }
  return result;
}

function resolveLegacyId(value: unknown, category?: ArchiveCategoryId | "weapons" | "classArsenals" | "lore"): ArchiveEntryId | null {
  if (typeof value !== "string") return null;
  if (ENTRY_BY_ID.has(value as ArchiveEntryId)) return value as ArchiveEntryId;
  const prefix = category === "enemies" ? "enemy"
    : category === "weapons" ? "weapon"
    : category === "classArsenals" || category === "arsenals" ? "arsenal"
    : category === "curses" ? "curse"
    : category === "bosses" ? "boss"
    : category === "endings" ? "ending"
    : category === "secrets" || category === "lore" ? "lore"
    : null;
  const preferred = prefix ? `${prefix}:${value}` as ArchiveEntryId : null;
  if (preferred && ENTRY_BY_ID.has(preferred)) return preferred;
  const matches = ARCHIVE_ENTRIES.filter((entry) => entry.sourceId === value);
  return matches.length === 1 ? matches[0]!.id : null;
}

function collectLegacyIds(record: Record<string, unknown>): ArchiveEntryId[] {
  const ids: ArchiveEntryId[] = [];
  const append = (values: unknown, category?: Parameters<typeof resolveLegacyId>[1]) => {
    if (!Array.isArray(values)) return;
    values.forEach((value) => {
      const resolved = resolveLegacyId(value, category);
      if (resolved) ids.push(resolved);
    });
  };
  append(record.discoveredIds);
  append(record.discovered);
  append(record.enemies, "enemies");
  append(record.weapons, "weapons");
  append(record.classArsenals, "classArsenals");
  append(record.arsenals, "arsenals");
  append(record.curses, "curses");
  append(record.bosses, "bosses");
  append(record.endings, "endings");
  append(record.secrets, "secrets");
  append(record.lore, "lore");
  return uniqueKnownIds(ids);
}

export function migrateArchiveProfile(value: unknown): ArchiveDiscoveryProfile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...EMPTY_ARCHIVE_PROFILE, discoveredIds: [], acknowledgedIds: [] };
  const record = value as Record<string, unknown>;
  const discoveredIds = collectLegacyIds(record);
  const acknowledgedRaw = Array.isArray(record.acknowledgedIds) ? record.acknowledgedIds : Array.isArray(record.seenIds) ? record.seenIds : [];
  const acknowledgedIds = uniqueKnownIds(acknowledgedRaw.map((id) => resolveLegacyId(id)).filter(Boolean))
    .filter((id) => discoveredIds.includes(id));
  return { version: 2, discoveredIds, acknowledgedIds };
}

export function parseArchiveProfile(raw: string | null | undefined): ArchiveDiscoveryProfile {
  if (!raw) return { ...EMPTY_ARCHIVE_PROFILE, discoveredIds: [], acknowledgedIds: [] };
  try {
    return migrateArchiveProfile(JSON.parse(raw));
  } catch {
    return { ...EMPTY_ARCHIVE_PROFILE, discoveredIds: [], acknowledgedIds: [] };
  }
}

export interface CompletedRunDiscovery {
  enemies?: readonly string[];
  weapons?: readonly WeaponId[];
  classArsenals?: readonly ClassArsenalId[];
  curses?: readonly string[];
  bosses?: readonly ("broadcast-warden" | "static-conductor" | "ninja-master")[];
  ending?: "escaped" | "subject-offline" | "window-closed";
  secretsFound?: number;
  lore?: readonly string[];
}

export interface ArchiveMergeResult {
  profile: ArchiveDiscoveryProfile;
  newIds: ArchiveEntryId[];
}

export function mergeCompletedRunDiscoveries(profile: ArchiveDiscoveryProfile, run: CompletedRunDiscovery): ArchiveMergeResult {
  const candidates: ArchiveEntryId[] = [];
  const add = (values: readonly string[] | undefined, category: Parameters<typeof resolveLegacyId>[1]) => values?.forEach((value) => {
    const id = resolveLegacyId(value, category);
    if (id) candidates.push(id);
  });
  add(run.enemies, "enemies");
  add(run.weapons, "weapons");
  add(run.classArsenals, "classArsenals");
  add(run.curses, "curses");
  add(run.bosses, "bosses");
  add(run.ending ? [run.ending] : [], "endings");
  add(run.lore, "lore");
  const secretCount = Math.max(0, Math.floor(run.secretsFound ?? 0));
  if (secretCount >= 1) candidates.push("lore:signal-leak");
  if (secretCount >= 2) candidates.push("lore:ratings-ledger");
  if (secretCount >= 3) candidates.push("lore:channel-zero");

  const discoveredIds = uniqueKnownIds([...profile.discoveredIds, ...candidates]);
  const previous = new Set(profile.discoveredIds);
  const newIds = discoveredIds.filter((id) => !previous.has(id));
  return {
    profile: {
      version: 2,
      discoveredIds,
      acknowledgedIds: uniqueKnownIds(profile.acknowledgedIds).filter((id) => discoveredIds.includes(id)),
    },
    newIds,
  };
}

export interface ArchiveCategoryProgress {
  category: ArchiveCategoryId;
  discovered: number;
  total: number;
  percent: number;
}

export function archiveCategoryProgress(profile: ArchiveDiscoveryProfile): ArchiveCategoryProgress[] {
  const discovered = new Set(profile.discoveredIds);
  return ARCHIVE_CATEGORIES.map(({ id }) => {
    const entries = ARCHIVE_ENTRIES.filter((entry) => entry.category === id);
    const count = entries.filter((entry) => discovered.has(entry.id)).length;
    return { category: id, discovered: count, total: entries.length, percent: entries.length ? Math.round(count / entries.length * 100) : 100 };
  });
}

export function archivePresentation(entry: ArchiveEntry, profile: ArchiveDiscoveryProfile): ArchivePresentation {
  if (profile.discoveredIds.includes(entry.id)) {
    return { id: entry.id, category: entry.category, discovered: true, state: "decoded", name: entry.name, summary: entry.summary, detail: entry.detail, glyph: entry.glyph };
  }
  return { id: entry.id, category: entry.category, discovered: false, state: entry.locked.state, name: entry.locked.name, summary: entry.locked.summary, detail: null, glyph: entry.locked.glyph };
}

export function newArchiveDiscoveryIds(before: ArchiveDiscoveryProfile, after: ArchiveDiscoveryProfile): ArchiveEntryId[] {
  const previous = new Set(before.discoveredIds);
  return uniqueKnownIds(after.discoveredIds).filter((id) => !previous.has(id));
}

export interface ArchiveDiscoveryCallout {
  id: ArchiveEntryId;
  category: ArchiveCategoryId;
  kicker: "NEW SIGNAL ARCHIVED";
  title: string;
  summary: string;
  glyph: string;
}

export function archiveDiscoveryCallouts(ids: readonly ArchiveEntryId[]): ArchiveDiscoveryCallout[] {
  return uniqueKnownIds(ids).map((id) => {
    const entry = ENTRY_BY_ID.get(id)!;
    return { id, category: entry.category, kicker: "NEW SIGNAL ARCHIVED", title: entry.name, summary: entry.summary, glyph: entry.glyph };
  });
}

export function unacknowledgedArchiveIds(profile: ArchiveDiscoveryProfile): ArchiveEntryId[] {
  const acknowledged = new Set(profile.acknowledgedIds);
  return uniqueKnownIds(profile.discoveredIds).filter((id) => !acknowledged.has(id));
}

export function acknowledgeArchiveDiscoveries(profile: ArchiveDiscoveryProfile, ids: readonly ArchiveEntryId[] = profile.discoveredIds): ArchiveDiscoveryProfile {
  const discovered = uniqueKnownIds(profile.discoveredIds);
  const allowed = new Set(discovered);
  const acknowledgedIds = uniqueKnownIds([...profile.acknowledgedIds, ...ids]).filter((id) => allowed.has(id));
  return { version: 2, discoveredIds: discovered, acknowledgedIds };
}
