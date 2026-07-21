export type PlayerClassId = "knight" | "mage" | "archer";

export interface PlayerClassDefinition {
  id: PlayerClassId;
  name: string;
  role: string;
  tagline: string;
  description: string;
  hp: number;
  speed: number;
  resourceName: "Drive" | "Mana" | "Quiver";
  resourceMax: number;
  basicName: string;
  basicDescription: string;
  heavyName: string;
  heavyDescription: string;
  strengths: string;
  weakness: string;
  color: string;
}

export const PLAYER_CLASSES: Record<PlayerClassId, PlayerClassDefinition> = {
  knight: {
    id: "knight",
    name: "Knight",
    role: "MELEE // FRONTLINE",
    tagline: "Break the line.",
    description: "The original crawler: durable, direct, and built around a growing arsenal of brutal close-range weapons.",
    hp: 100,
    speed: 122,
    resourceName: "Drive",
    resourceMax: 100,
    basicName: "Weapon Strike",
    basicDescription: "Use the equipped weapon's normal attack, reach, recovery, and special effect.",
    heavyName: "Committed Strike",
    heavyDescription: "Spend 40 Drive for a weapon-specific blow with 1.65× damage and greater knockback.",
    strengths: "Durability · stagger · close control",
    weakness: "Must enter enemy threat range",
    color: "#f4d35e",
  },
  mage: {
    id: "mage",
    name: "Mage",
    role: "MAGIC // CONTROL",
    tagline: "Shape the room.",
    description: "A fragile signal-caster whose slow arc bolts splash through crowds and whose sigils bend enemy formations.",
    hp: 78,
    speed: 116,
    resourceName: "Mana",
    resourceMax: 100,
    basicName: "Arc Bolt",
    basicDescription: "Launch a slow orb for 14 direct damage and an 8-damage splash around its target.",
    heavyName: "Gravity Sigil",
    heavyDescription: "Spend 50 Mana to detonate a forward rune that damages, pulls, and slows a group.",
    strengths: "Area damage · control · forgiving aim",
    weakness: "Lowest health and weaker single-target damage",
    color: "#a78bfa",
  },
  archer: {
    id: "archer",
    name: "Archer",
    role: "DISTANCE // PRECISION",
    tagline: "Own the sightline.",
    description: "A fast physical marksman who earns extra damage at range and turns aligned enemies into one perfect shot.",
    hp: 86,
    speed: 130,
    resourceName: "Quiver",
    resourceMax: 12,
    basicName: "Quickshot",
    basicDescription: "Fire a fast arrow for 19 damage, gaining 25% damage beyond its ideal-distance threshold.",
    heavyName: "Power Shot",
    heavyDescription: "Spend 3 arrows to loose a 42-damage shot that pierces three enemies with diminishing force.",
    strengths: "Range · speed · single-target pressure",
    weakness: "Misses and close-range pressure are costly",
    color: "#34d399",
  },
};

export const PLAYER_CLASS_IDS = Object.keys(PLAYER_CLASSES) as PlayerClassId[];
