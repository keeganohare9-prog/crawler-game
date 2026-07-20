export type EquipmentSlot = "armor" | "boots" | "charm" | "mod";
export type EquipmentRarity = "common" | "uncommon" | "rare";
export type EquipmentId =
  | "scrap-plate" | "shockweave-vest" | "ratings-carapace"
  | "runner-boots" | "phase-treads" | "iron-stompers"
  | "blood-token" | "audience-eye" | "volatile-heart"
  | "razor-servo" | "kinetic-brace" | "storm-coil";

export interface EquipmentDefinition {
  id: EquipmentId;
  name: string;
  slot: EquipmentSlot;
  rarity: EquipmentRarity;
  perk: string;
  detail: string;
  color: string;
}

export const EQUIPMENT: Record<EquipmentId, EquipmentDefinition> = {
  "scrap-plate": { id: "scrap-plate", name: "Scrap Plate", slot: "armor", rarity: "common", perk: "Reinforced", detail: "+20 maximum Vital.", color: "#d6b06a" },
  "shockweave-vest": { id: "shockweave-vest", name: "Shockweave Vest", slot: "armor", rarity: "uncommon", perk: "Grounded", detail: "Enemy projectiles deal 25% less damage.", color: "#76c7dc" },
  "ratings-carapace": { id: "ratings-carapace", name: "Ratings Carapace", slot: "armor", rarity: "rare", perk: "Prime Time", detail: "Gain 40% more Hype from close combat.", color: "#a78bfa" },
  "runner-boots": { id: "runner-boots", name: "Runner Boots", slot: "boots", rarity: "common", perk: "Quickstep", detail: "+10% movement speed.", color: "#d6b06a" },
  "phase-treads": { id: "phase-treads", name: "Phase Treads", slot: "boots", rarity: "rare", perk: "Long Dodge", detail: "Dodges travel farther and remain safe longer.", color: "#a78bfa" },
  "iron-stompers": { id: "iron-stompers", name: "Iron Stompers", slot: "boots", rarity: "uncommon", perk: "Aftershock", detail: "Dodging through enemies deals 12 damage.", color: "#76c7dc" },
  "blood-token": { id: "blood-token", name: "Blood Token", slot: "charm", rarity: "rare", perk: "Leech Signal", detail: "Recover 3 Vital whenever you defeat an enemy.", color: "#ff4d6d" },
  "audience-eye": { id: "audience-eye", name: "Audience Eye", slot: "charm", rarity: "uncommon", perk: "Applause Engine", detail: "Fast weapons generate bonus Hype on hits.", color: "#f4d35e" },
  "volatile-heart": { id: "volatile-heart", name: "Volatile Heart", slot: "charm", rarity: "rare", perk: "Chain Reaction", detail: "Bombs detonate Fusewalkers for a second blast.", color: "#ff8a3d" },
  "razor-servo": { id: "razor-servo", name: "Razor Servo", slot: "mod", rarity: "common", perk: "Overclocked Edge", detail: "Slash weapons recover 15% faster.", color: "#d6b06a" },
  "kinetic-brace": { id: "kinetic-brace", name: "Kinetic Brace", slot: "mod", rarity: "uncommon", perk: "Heavy Frame", detail: "The Dead-Air Hammer deals 30% more damage.", color: "#76c7dc" },
  "storm-coil": { id: "storm-coil", name: "Storm Coil", slot: "mod", rarity: "rare", perk: "Conductive Arc", detail: "Shock chains jump farther and hit harder.", color: "#a78bfa" },
};

export const EQUIPMENT_IDS = Object.keys(EQUIPMENT) as EquipmentId[];

export function selectEquipmentDrop(random: () => number = Math.random, rareBoost = false): EquipmentDefinition {
  const weighted = EQUIPMENT_IDS.flatMap((id) => {
    const item = EQUIPMENT[id];
    const weight = item.rarity === "common" ? (rareBoost ? 1 : 5) : item.rarity === "uncommon" ? 3 : (rareBoost ? 4 : 1);
    return Array.from({ length: weight }, () => item);
  });
  return weighted[Math.floor(random() * weighted.length)] ?? EQUIPMENT["scrap-plate"];
}
