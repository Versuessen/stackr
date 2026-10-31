// The farm catalogue: what can be ordered as a build, where it usually stands, and what each tier
// includes. Picked from what big-project SMPs build again and again (iron, gold/XP, raid, shulker,
// creeper/rocket, sugar cane, bamboo, crops, blaze, guardian, enderman, wither skeleton …).

import type { FarmTier, Localized } from './types.js';

export type FarmScene = 'day' | 'nether' | 'end';
export type FarmGroup = 'basics' | 'mobs' | 'plants' | 'storage';

export interface FarmDef {
  key: string;
  name: Localized;
  output: Localized; // what comes out, shown as a short line
  description: Localized;
  group: FarmGroup;
  scene: FarmScene;
  dimension: 'overworld' | 'nether' | 'end'; // default for the coordinate field
  days: [number, number, number]; // rough build days per tier
  popular?: boolean; // shown on the home page
}

const L = (de: string, en: string): Localized => ({ de, en });

export const FARMS: FarmDef[] = [
  { key: 'iron', group: 'basics', scene: 'day', dimension: 'overworld', days: [2, 3, 5], popular: true,
    name: L('Eisenfarm', 'Iron farm'), output: L('Eisen, Mohnblumen', 'Iron, poppies'),
    description: L('Golem-Farm mit Dorfbewohnern. Das Eisen für Schienen, Trichter und Ambosse.', 'Golem farm with villagers. The iron for rails, hoppers and anvils.') },
  { key: 'gold', group: 'mobs', scene: 'nether', dimension: 'nether', days: [3, 4, 6], popular: true,
    name: L('Gold- & XP-Farm', 'Gold & XP farm'), output: L('Gold, XP, verrottetes Fleisch', 'Gold, XP, rotten flesh'),
    description: L('Zombifizierte Piglins auf dem Netherdach. Bester Ort zum Reparieren und Verzaubern.', 'Zombified piglins on the nether roof. The best place to repair and enchant.') },
  { key: 'raid', group: 'mobs', scene: 'day', dimension: 'overworld', days: [4, 5, 7], popular: true,
    name: L('Raidfarm', 'Raid farm'), output: L('Totems, Smaragde, Schwarzpulver', 'Totems, emeralds, gunpowder'),
    description: L('Totems der Unsterblichkeit und Smaragde für den Handel.', 'Totems of undying and emeralds for trading.') },
  { key: 'shulker', group: 'storage', scene: 'end', dimension: 'end', days: [4, 5, 7], popular: true,
    name: L('Shulkerfarm', 'Shulker farm'), output: L('Shulkerschalen, Shulker-Kisten', 'Shulker shells, shulker boxes'),
    description: L('Endlos Shulker-Kisten, sobald das Lager knapp wird. Steht im End.', 'Endless shulker boxes once storage gets tight. Built in the End.') },
  { key: 'rocket', group: 'mobs', scene: 'day', dimension: 'overworld', days: [3, 4, 6], popular: true,
    name: L('Raketenfarm (Creeper)', 'Rocket farm (creeper)'), output: L('Schwarzpulver für Raketen', 'Gunpowder for rockets'),
    description: L('Creeper-Farm für Schwarzpulver. Zusammen mit Zuckerrohr dein Raketennachschub fürs Elytra.', 'Creeper farm for gunpowder. Together with sugar cane, your rocket supply for the elytra.') },
  { key: 'cane', group: 'plants', scene: 'day', dimension: 'overworld', days: [1, 2, 3], popular: true,
    name: L('Zuckerrohrfarm', 'Sugar cane farm'), output: L('Zuckerrohr → Papier, Zucker', 'Sugar cane → paper, sugar'),
    description: L('Papier für Raketen, Bücher und Karten, Zucker fürs Brauen.', 'Paper for rockets, books and maps, sugar for brewing.') },
  { key: 'tree', group: 'plants', scene: 'day', dimension: 'overworld', days: [2, 3, 5], popular: true,
    name: L('Baumfarm', 'Tree farm'), output: L('Holz nach Wahl', 'Logs of your choice'),
    description: L('Holz nach Wahl der Baumart.', 'Logs from the tree type of your choice.') },
  { key: 'bamboo', group: 'plants', scene: 'day', dimension: 'overworld', days: [1, 2, 3],
    name: L('Bambusfarm', 'Bamboo farm'), output: L('Bambus → Brennstoff, Bambusholz, Gerüste', 'Bamboo → fuel, bamboo wood, scaffolding'),
    description: L('Schnell wachsender Brennstoff und Baumaterial.', 'Fast-growing fuel and building material.') },
  { key: 'stone', group: 'basics', scene: 'day', dimension: 'overworld', days: [1, 2, 3],
    name: L('Stein-/Bruchsteingenerator', 'Stone / cobblestone generator'), output: L('Stein, Bruchstein', 'Stone, cobblestone'),
    description: L('Baumaterial in Mengen.', 'Building material in bulk.') },
  { key: 'wool', group: 'basics', scene: 'day', dimension: 'overworld', days: [2, 3, 4],
    name: L('Wollfarm', 'Wool farm'), output: L('Wolle, auf Wunsch alle Farben', 'Wool, all colours on request'),
    description: L('Schafe und Scheren, auf Wunsch alle Farben.', 'Sheep and shears, all colours on request.') },
  { key: 'bonemeal', group: 'plants', scene: 'day', dimension: 'overworld', days: [1, 2, 3],
    name: L('Knochenmehlfarm', 'Bone meal farm'), output: L('Knochenmehl', 'Bone meal'),
    description: L('Komposter-Farm. Knochenmehl für Blumen, Moos, Bäume und weiße Farbe.', 'Composter farm. Bone meal for flowers, moss, trees and white dye.') },
  { key: 'flower', group: 'plants', scene: 'day', dimension: 'overworld', days: [2, 3, 4],
    name: L('Blumen- & Farbstofffarm', 'Flower & dye farm'), output: L('Blumen → alle Farbstoffe', 'Flowers → every dye'),
    description: L('Farbstoffe für Beton, Wolle, Glas und Terrakotta.', 'Dyes for concrete, wool, glass and terracotta.') },
  { key: 'crops', group: 'plants', scene: 'day', dimension: 'overworld', days: [2, 3, 4],
    name: L('Feldfarm (Weizen, Karotten, Kartoffeln)', 'Crop farm (wheat, carrots, potatoes)'), output: L('Weizen, Karotten, Kartoffeln, Rote Bete', 'Wheat, carrots, potatoes, beetroot'),
    description: L('Von Dorfbewohnern geerntet, voll automatisch. Essen und Handelsware.', 'Harvested by villagers, fully automatic. Food and trading goods.') },
  { key: 'pumpkin', group: 'plants', scene: 'day', dimension: 'overworld', days: [1, 2, 3],
    name: L('Kürbis- & Melonenfarm', 'Pumpkin & melon farm'), output: L('Kürbisse, Melonen', 'Pumpkins, melons'),
    description: L('Für Handel, Essen und Laternen.', 'For trading, food and lanterns.') },
  { key: 'kelp', group: 'plants', scene: 'day', dimension: 'overworld', days: [1, 2, 3],
    name: L('Seetangfarm', 'Kelp farm'), output: L('Seetang → getrocknete Seetangblöcke', 'Kelp → dried kelp blocks'),
    description: L('Brennstoff für Öfen und Schmelzanlagen.', 'Fuel for furnaces and smelting arrays.') },
  { key: 'hoglin', group: 'mobs', scene: 'nether', dimension: 'nether', days: [3, 4, 5],
    name: L('Hoglinfarm', 'Hoglin farm'), output: L('Schweinefleisch, Leder', 'Porkchops, leather'),
    description: L('Essen ohne Ende und Leder für Bücher.', 'Endless food and leather for books.') },
  { key: 'blaze', group: 'mobs', scene: 'nether', dimension: 'nether', days: [3, 4, 6],
    name: L('Lohenfarm', 'Blaze farm'), output: L('Lohenruten, XP', 'Blaze rods, XP'),
    description: L('Ruten für Brauen und Enderaugen. An einer Netherfestung.', 'Rods for brewing and eyes of ender. At a nether fortress.') },
  { key: 'wither', group: 'mobs', scene: 'nether', dimension: 'nether', days: [4, 5, 7],
    name: L('Witherskelettfarm', 'Wither skeleton farm'), output: L('Witherskelett-Schädel, Kohle, Knochen', 'Wither skeleton skulls, coal, bones'),
    description: L('Schädel für Wither und Leuchtfeuer. An einer Netherfestung.', 'Skulls for withers and beacons. At a nether fortress.') },
  { key: 'enderman', group: 'mobs', scene: 'end', dimension: 'end', days: [3, 4, 6],
    name: L('Endermanfarm', 'Enderman farm'), output: L('Enderperlen, viel XP', 'Ender pearls, lots of XP'),
    description: L('Im End. Perlen für Teleporter und Enderaugen, dazu sehr schnelle XP.', 'In the End. Pearls for teleporters and eyes of ender, plus very fast XP.') },
  { key: 'guardian', group: 'mobs', scene: 'day', dimension: 'overworld', days: [5, 6, 8],
    name: L('Wächterfarm', 'Guardian farm'), output: L('Prismarin, Fisch, XP', 'Prismarine, fish, XP'),
    description: L('An einem Ozeanmonument. Prismarin für Bauten und Seelaternen.', 'At an ocean monument. Prismarine for builds and sea lanterns.') },
  { key: 'slime', group: 'mobs', scene: 'day', dimension: 'overworld', days: [2, 3, 5],
    name: L('Schleimfarm', 'Slime farm'), output: L('Schleimbälle', 'Slime balls'),
    description: L('In einem Schleimchunk. Für Klebrige Kolben und Flugmaschinen.', 'In a slime chunk. For sticky pistons and flying machines.') },
  { key: 'trading', group: 'storage', scene: 'day', dimension: 'overworld', days: [3, 5, 7],
    name: L('Handelshalle (Dorfbewohner)', 'Villager trading hall'), output: L('Verzauberte Bücher, Werkzeuge, Handel', 'Enchanted books, tools, trades'),
    description: L('Dorfbewohner mit den Berufen, die du brauchst, sicher in Zellen.', 'Villagers with the professions you need, safe in cells.') },
];

export const FARM_KEYS = FARMS.map((f) => f.key);
export const farmDef = (key: string) => FARMS.find((f) => f.key === key);

/** Extras each tier already includes. Lower tiers can still add them as an option. */
export const TIER_INCLUDES: Record<FarmTier, string[]> = { 1: [], 2: ['storage'], 3: ['storage', 'sorting'] };
