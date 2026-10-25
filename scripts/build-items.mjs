// Builds the Stackr item lookup for one Minecraft Java version.
// Usage: node build-items.mjs 26.3 > items-26.3.json
// Sources: item registry + item components from misode/mcmeta (generated from Mojang's data),
// English names from the client assets, German names from Mojang's asset index.
// No textures are downloaded or stored.

const version = process.argv[2] || '26.3';
const MCMETA = `https://raw.githubusercontent.com/misode/mcmeta/${version}`;

async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

// Items that exist in the registry but can't be obtained in survival, so nobody can deliver them.
const NOT_IN_SURVIVAL = new Set([
  'air', 'barrier', 'bedrock', 'budding_amethyst', 'chain_command_block', 'command_block', 'command_block_minecart',
  'debug_stick', 'end_portal_frame', 'jigsaw', 'knowledge_book', 'light', 'petrified_oak_slab', 'reinforced_deepslate',
  'repeating_command_block', 'spawner', 'structure_block', 'structure_void', 'test_block', 'test_instance_block',
  'trial_spawner', 'vault', 'farmland', 'dirt_path', 'frogspawn', 'infested_stone', 'infested_cobblestone',
  'infested_stone_bricks', 'infested_mossy_stone_bricks', 'infested_cracked_stone_bricks', 'infested_chiseled_stone_bricks',
  'infested_deepslate', 'player_head', 'bundle_of_all'
]);

function category(id, comp, blocks) {
  if (id.endsWith('_spawn_egg')) return 'egg';
  if (comp['minecraft:food'] || comp['minecraft:consumable'] && !comp['minecraft:potion_contents']) return 'food';
  if (comp['minecraft:potion_contents'] || id.includes('potion') || id === 'tipped_arrow') return 'brewing';
  if (comp['minecraft:equippable'] && comp['minecraft:max_damage']) return 'armor';
  if (comp['minecraft:tool'] || comp['minecraft:weapon'] || ['bow', 'crossbow', 'trident', 'mace', 'shield', 'fishing_rod', 'shears', 'flint_and_steel', 'brush'].includes(id)) return 'tools';
  if (/redstone|repeater|comparator|piston|observer|hopper|dropper|dispenser|lever|button|pressure_plate|rail|tripwire|daylight|target|crafter|note_block|sculk_sensor|lightning_rod|tnt/.test(id)) return 'redstone';
  if (blocks.has(id)) return 'blocks';
  return 'materials';
}

const [registries, components, versionInfo] = await Promise.all([
  json(`${MCMETA}-summary/registries/data.min.json`),
  json(`${MCMETA}-summary/item_components/data.min.json`),
  json(`${MCMETA}-summary/version.json`),
]);
const en = await json(`${MCMETA}-assets-json/assets/minecraft/lang/en_us.json`);

const manifest = await json('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
const entry = manifest.versions.find((v) => v.id === version);
if (!entry) throw new Error(`Version ${version} not in Mojang manifest`);
const meta = await json(entry.url);
const index = await json(meta.assetIndex.url);
const deHash = index.objects['minecraft/lang/de_de.json'].hash;
const de = await json(`https://resources.download.minecraft.net/${deHash.slice(0, 2)}/${deHash}`);

const blocks = new Set(registries.block);
const items = registries.item
  .filter((id) => !NOT_IN_SURVIVAL.has(id) && !id.endsWith('_spawn_egg'))
  .map((id) => {
    const comp = components[id] || {};
    const key = comp['minecraft:item_name']?.translate || `item.minecraft.${id}`;
    return {
      id,
      en: en[key] || id,
      de: de[key] || en[key] || id,
      stack: comp['minecraft:max_stack_size'] ?? 64,
      cat: category(id, comp, blocks),
      rare: comp['minecraft:rarity'] && comp['minecraft:rarity'] !== 'common' ? comp['minecraft:rarity'] : undefined,
    };
  })
  .sort((a, b) => a.de.localeCompare(b.de, 'de'));

process.stdout.write(JSON.stringify({
  version: versionInfo.id,
  dataVersion: versionInfo.data_version,
  generated: new Date().toISOString().slice(0, 10),
  count: items.length,
  items,
}));
