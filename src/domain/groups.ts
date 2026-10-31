// Extra filters for the item search: material groups (wood, stone, ore …) and the dimension an
// item can be obtained in. Derived from item ids; one item can be in several groups and several
// dimensions (gravel exists in the overworld and the nether, obsidian everywhere, …).

export type ItemGroup = 'wood' | 'stone' | 'ore' | 'colour' | 'plants' | 'mob' | 'light';
export type Dimension = 'overworld' | 'nether' | 'end';

export const GROUPS: ItemGroup[] = ['wood', 'stone', 'ore', 'colour', 'plants', 'mob', 'light'];
export const DIMENSIONS: Dimension[] = ['overworld', 'nether', 'end'];

const WOODS = '(?:oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|pale_oak|poplar|bamboo|crimson|warped)';
const COLOURS = '(?:white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|cyan|purple|blue|brown|green|red|black)';
const STONES = '(?:mossy|cracked|resin_bricks|resin_block|sulfur|cinnabar|stone|cobblestone|mossy_cobblestone|deepslate|cobbled_deepslate|andesite|diorite|granite|tuff|calcite|dripstone|brick|bricks|mud_brick|sandstone|red_sandstone|blackstone|basalt|smooth_stone|prismarine|end_stone|purpur|netherrack|nether_brick|red_nether_brick|quartz|resin_brick|polished|chiseled|cut|smooth)';

const RULES: Record<ItemGroup, RegExp[]> = {
  wood: [
    new RegExp(`^(?:stripped_)?${WOODS}_(?:log|wood|stem|hyphae|planks|stairs|slab|fence|fence_gate|door|trapdoor|button|pressure_plate|sign|hanging_sign|boat|chest_boat|raft|chest_raft|shelf|block|mosaic|mosaic_stairs|mosaic_slab)$`),
    /^(?:stick|chest|trapped_chest|barrel|crafting_table|bookshelf|chiseled_bookshelf|ladder|lectern|composter|loom|cartography_table|fletching_table|smithing_table|note_block|jukebox|beehive|bowl|campfire|soul_campfire|scaffolding)$/,
  ],
  stone: [
    new RegExp(`^(?:infested_)?(?:${STONES})(?:_[a-z_]+)?$`), // (ores are excluded in groupsOf)
    /^(?:gravel|clay|mud|packed_mud|obsidian|crying_obsidian|amethyst_block|pointed_dripstone|magma_block|furnace|blast_furnace|smoker|stonecutter|grindstone|reinforced_deepslate)$/,
  ],
  ore: [
    /_ore$/, /^raw_/, /_ingot$/, /_nugget$/, /^netherite_scrap$/, /^ancient_debris$/,
    /^(?:diamond|emerald|lapis_lazuli|redstone|coal|charcoal|quartz|amethyst_shard|copper_ingot|netherite_ingot)$/,
    /^(?:iron|gold|diamond|emerald|lapis|redstone|coal|copper|netherite|raw_iron|raw_gold|raw_copper|amethyst)_block$/,
    /copper/, /^(?:iron_bars|iron_chain|chain|iron_door|iron_trapdoor|anvil|chipped_anvil|damaged_anvil|cauldron|hopper|heavy_weighted_pressure_plate|light_weighted_pressure_plate)$/,
  ],
  colour: [
    new RegExp(`^${COLOURS}_(?!ice$|sand$|sandstone|nether_brick|mushroom|glazed_terracotta$)[a-z_]+$`),
    new RegExp(`^${COLOURS}_glazed_terracotta$`),
    /^(?:terracotta|candle|shulker_box|bundle)$/,
  ],
  plants: [
    /_sapling$/, /_leaves$/, /_seeds$/, /coral/, /^(?:dirt|coarse_dirt|rooted_dirt|grass_block|podzol|mycelium|farmland|pitcher_pod|glistering_melon_slice|baked_potato|poisonous_potato|sponge|wet_sponge|brown_mushroom_block|red_mushroom_block|mushroom_stem|shelf_mushroom|mangrove_roots|crimson_nylium|warped_nylium|sugar|snowball|snow_block|ice|packed_ice|blue_ice|honey_block|honey_bottle)$/, /^(?:wheat|carrot|potato|beetroot|melon|melon_slice|pumpkin|carved_pumpkin|sugar_cane|bamboo|cactus|kelp|dried_kelp|dried_kelp_block|vine|glow_lichen|moss_block|moss_carpet|pale_moss_block|pale_moss_carpet|brown_mushroom|red_mushroom|crimson_fungus|warped_fungus|sweet_berries|glow_berries|cocoa_beans|nether_wart|chorus_fruit|chorus_flower|lily_pad|hay_block|sea_pickle|seagrass|short_grass|tall_grass|fern|large_fern|dead_bush|azalea|flowering_azalea|spore_blossom|big_dripleaf|small_dripleaf|twisting_vines|weeping_vines|crimson_roots|warped_roots|nether_sprouts|hanging_roots|mangrove_propagule|pink_petals|wildflowers|leaf_litter|bush|firefly_bush|cactus_flower|short_dry_grass|tall_dry_grass|torchflower|pitcher_plant|eyeblossom|open_eyeblossom|closed_eyeblossom|bone_meal|apple)$/,
    /^(?:dandelion|poppy|blue_orchid|allium|azure_bluet|red_tulip|orange_tulip|white_tulip|pink_tulip|oxeye_daisy|cornflower|lily_of_the_valley|wither_rose|sunflower|lilac|rose_bush|peony)$/,
  ],
  mob: [
    /^(?:bone|string|gunpowder|rotten_flesh|spider_eye|ender_pearl|blaze_rod|breeze_rod|ghast_tear|slime_ball|magma_cream|leather|feather|ink_sac|glow_ink_sac|phantom_membrane|shulker_shell|rabbit_hide|rabbit_foot|prismarine_shard|prismarine_crystals|nautilus_shell|honeycomb|egg|blue_egg|brown_egg|totem_of_undying|turtle_scute|armadillo_scute|heavy_core|trial_key|ominous_trial_key|wind_charge|resin_clump|nether_star|dragon_breath|echo_shard|experience_bottle|beef|porkchop|chicken|mutton|rabbit|cod|salmon|tropical_fish|pufferfish)$/,
    /_head$/, /_skull$/,
  ],
  light: [
    /^(?:glass|glass_pane|tinted_glass|torch|soul_torch|redstone_torch|copper_torch|lantern|soul_lantern|copper_lantern|glowstone|glowstone_dust|sea_lantern|shroomlight|end_rod|beacon|conduit|jack_o_lantern|redstone_lamp|copper_bulb|ochre_froglight|verdant_froglight|pearlescent_froglight|light)$/,
    /_(?:stained_glass|stained_glass_pane|candle|lantern|copper_bulb)$/,
  ],
};

// Only obtainable in one dimension. Everything not listed is overworld.
const NETHER_ONLY = [
  /^(?:crimson|warped)_/, /^stripped_(?:crimson|warped)_/, /netherrack/, /nether_brick/, /^nether_wart/, /^(?:soul_sand|soul_soil|soul_torch|soul_lantern|soul_campfire)$/,
  /blackstone/, /basalt/, /^glowstone$/, /^(?:shroomlight|magma_cream|blaze_rod|blaze_powder|ghast_tear|quartz|nether_quartz_ore|nether_gold_ore|ancient_debris|netherite|weeping_vines|twisting_vines|nether_sprouts|crying_obsidian|respawn_anchor|wither_skeleton_skull|piglin_head|lodestone)/,
  /^netherite_/, /^(?:smooth_quartz|quartz_)/, /^chiseled_quartz/, /^gilded_blackstone$/, /^ochre_froglight$|^verdant_froglight$|^pearlescent_froglight$/,
];
const END_ONLY = [
  /^end_stone/, /^purpur/, /^chorus/, /^(?:shulker_shell|elytra|dragon_breath|dragon_egg|dragon_head|end_rod|end_crystal|popped_chorus_fruit)$/, /shulker_box$/,
];
// Also found in the nether / the end besides the overworld.
const ALSO_NETHER = /^(?:gravel|magma_block|obsidian|gold_nugget|gold_ingot|ender_pearl|bone|string|brown_mushroom|red_mushroom|lava_bucket|glowstone_dust|gunpowder|leather|rotten_flesh|arrow|bow|crossbow|golden_sword|wither_rose|spider_eye|coal|skeleton_skull)$/;
const ALSO_END = /^(?:obsidian|ender_pearl|ender_eye)$/;

export function groupsOf(id: string): ItemGroup[] {
  return GROUPS.filter((g) => RULES[g].some((r) => r.test(id)) && !(g === 'stone' && /_ore$/.test(id)));
}

export function dimensionsOf(id: string): Dimension[] {
  if (NETHER_ONLY.some((r) => r.test(id))) return ['nether'];
  if (END_ONLY.some((r) => r.test(id))) return ['end'];
  const out: Dimension[] = ['overworld'];
  if (ALSO_NETHER.test(id)) out.push('nether');
  if (ALSO_END.test(id)) out.push('end');
  return out;
}
