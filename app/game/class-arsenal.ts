import type { PlayerClassId } from "./classes";

export type ClassArsenalId =
  | "signal-grimoire" | "cinder-codex" | "frost-prism" | "storm-orb" | "void-lantern"
  | "relay-recurve" | "deadeye-longbow" | "splitwire-bow" | "bankshot-bow" | "gearshot-repeater";

export type ClassArsenalBehavior = "splash" | "blast" | "frost" | "chain" | "pull" | "precision" | "longshot" | "spread" | "bounce" | "rapid";

export interface ClassArsenalDefinition {
  id: ClassArsenalId;
  classId: Exclude<PlayerClassId, "knight">;
  name: string;
  rarity: "common" | "uncommon" | "rare";
  damageType: string;
  description: string;
  mechanic: string;
  damage: number;
  cooldown: number;
  speed: number;
  lifetime: number;
  pierce: number;
  shots: number;
  spread: number;
  splash: number;
  splashDamage: number;
  ammoCost: number;
  behavior: ClassArsenalBehavior;
  color: string;
}

export const CLASS_ARSENAL: Record<ClassArsenalId, ClassArsenalDefinition> = {
  "signal-grimoire": { id:"signal-grimoire", classId:"mage", name:"Signal Grimoire", rarity:"common", damageType:"arcane", description:"A balanced broadcast tome that casts forgiving bolts of condensed signal.", mechanic:"Arc Bolt · splashes nearby targets", damage:14, cooldown:.35, speed:270, lifetime:.84, pierce:0, shots:1, spread:0, splash:26, splashDamage:8, ammoCost:0, behavior:"splash", color:"#a78bfa" },
  "cinder-codex": { id:"cinder-codex", classId:"mage", name:"Cinder Codex", rarity:"uncommon", damageType:"fire", description:"A scorched manual that trades casting speed for violent room-clearing bursts.", mechanic:"Ember Orb · large, high-damage explosion", damage:20, cooldown:.56, speed:225, lifetime:1, pierce:0, shots:1, spread:0, splash:44, splashDamage:12, ammoCost:0, behavior:"blast", color:"#ff8a3d" },
  "frost-prism": { id:"frost-prism", classId:"mage", name:"Frost Prism", rarity:"uncommon", damageType:"frost", description:"A crystalline focus that fires narrow lances through enemy ranks.", mechanic:"Frost Lance · pierces and delays recovery", damage:17, cooldown:.48, speed:430, lifetime:.72, pierce:2, shots:1, spread:0, splash:0, splashDamage:0, ammoCost:0, behavior:"frost", color:"#76c7dc" },
  "storm-orb": { id:"storm-orb", classId:"mage", name:"Storm Orb", rarity:"rare", damageType:"shock", description:"A captive thunderhead that rewards finding tightly packed targets.", mechanic:"Chain Spark · jumps into two nearby enemies", damage:13, cooldown:.4, speed:350, lifetime:.76, pierce:0, shots:1, spread:0, splash:0, splashDamage:0, ammoCost:0, behavior:"chain", color:"#d9f7ff" },
  "void-lantern": { id:"void-lantern", classId:"mage", name:"Void Lantern", rarity:"rare", damageType:"gravity", description:"A forbidden lamp whose slow seeds drag a formation toward their impact.", mechanic:"Void Seed · pulls enemies into the hit point", damage:10, cooldown:.62, speed:190, lifetime:1.15, pierce:0, shots:1, spread:0, splash:54, splashDamage:6, ammoCost:0, behavior:"pull", color:"#ff8fab" },
  "relay-recurve": { id:"relay-recurve", classId:"archer", name:"Relay Recurve", rarity:"common", damageType:"pierce", description:"A responsive bow built for dependable ranged pressure and repositioning.", mechanic:"Quickshot · gains 25% damage at distance", damage:19, cooldown:.4, speed:560, lifetime:.58, pierce:0, shots:1, spread:0, splash:0, splashDamage:0, ammoCost:1, behavior:"precision", color:"#34d399" },
  "deadeye-longbow": { id:"deadeye-longbow", classId:"archer", name:"Deadeye Longbow", rarity:"uncommon", damageType:"pierce", description:"A severe longbow with a slow draw and unmatched first-target impact.", mechanic:"Deadeye · gains 55% damage at long range", damage:27, cooldown:.68, speed:700, lifetime:.54, pierce:0, shots:1, spread:0, splash:0, splashDamage:0, ammoCost:1, behavior:"longshot", color:"#f4d35e" },
  "splitwire-bow": { id:"splitwire-bow", classId:"archer", name:"Splitwire Bow", rarity:"uncommon", damageType:"spread", description:"A split-string mechanism that sends three lighter arrows across a fan.", mechanic:"Fan Volley · three arrows for two ammunition", damage:10, cooldown:.58, speed:520, lifetime:.62, pierce:0, shots:3, spread:.18, splash:0, splashDamage:0, ammoCost:2, behavior:"spread", color:"#ff8fab" },
  "bankshot-bow": { id:"bankshot-bow", classId:"archer", name:"Bankshot Bow", rarity:"rare", damageType:"trick", description:"A tuned ricochet bow that turns dungeon walls into attack angles.", mechanic:"Bankshot · arrows rebound twice from walls", damage:17, cooldown:.48, speed:500, lifetime:1.2, pierce:0, shots:1, spread:0, splash:0, splashDamage:0, ammoCost:1, behavior:"bounce", color:"#76c7dc" },
  "gearshot-repeater": { id:"gearshot-repeater", classId:"archer", name:"Gearshot Repeater", rarity:"rare", damageType:"rapid", description:"A compact clockwork bow that sacrifices impact for relentless fire.", mechanic:"Repeater · fastest recovery, weakest arrows", damage:10, cooldown:.18, speed:610, lifetime:.5, pierce:0, shots:1, spread:0, splash:0, splashDamage:0, ammoCost:1, behavior:"rapid", color:"#ff8a3d" },
};

export const CLASS_ARSENAL_IDS = Object.keys(CLASS_ARSENAL) as ClassArsenalId[];

export function arsenalForClass(classId: PlayerClassId) {
  return CLASS_ARSENAL_IDS.map((id) => CLASS_ARSENAL[id]).filter((entry) => entry.classId === classId);
}

export function selectClassArsenalDrop(classId: Exclude<PlayerClassId, "knight">, exclude: ClassArsenalId, random = Math.random) {
  const choices = arsenalForClass(classId).filter((entry) => entry.id !== exclude);
  return choices[Math.floor(random() * choices.length)] ?? choices[0];
}
