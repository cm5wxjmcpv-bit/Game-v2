(function () {
  'use strict';

  const DEFAULT_WIDTH = 30;
  const DEFAULT_HEIGHT = 30;
  const STORAGE_PREVIEW_KEY = 'levelBuilderPreviewMap';
  const TEXTURE_CUSTOM_COLORS_STORAGE_KEY = 'levelBuilderTextureCustomColors';
  const CUSTOM_TEXTURE_LIBRARY_STORAGE_KEY = 'levelBuilderCustomTextureLibrary';
  const TEXTURE_MAX_SAVED_CUSTOM_COLORS = 16;
  const TEXTURE_HISTORY_LIMIT = 30;
  const MAP_HISTORY_LIMIT = 30;
  const MAX_MAP_SIDE = 200;
  const TEXTURE_COLORS = ['#000000', '#ffffff', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#06b6d4', null];
  const TEXTURE_SIZES = [16, 32, 64];
  const ENGINE_TILE_IDS = {
    floor_grass_a: 'floor_grass_a',
    floor_grass_b: 'floor_grass_b',
    floor_stone_a: 'floor_stone_a',
    floor_stone_b: 'floor_stone_b',
    floor_dirt_a: 'floor_dirt_a',
    floor_dirt_b: 'floor_dirt_b',
    floor_sand_a: 'floor_sand_a',
    floor_wood_a: 'floor_wood_a',
    floor_marble_a: 'floor_marble_a',
    floor_ice_a: 'floor_ice_a',
    wall_rock_a: 'wall_rock_a',
    wall_rock_b: 'wall_rock_b',
    wall_brick_a: 'wall_brick_a',
    wall_brick_b: 'wall_brick_b',
    wall_wood_a: 'wall_wood_a',
    hazard_lava: 'hazard_lava',
    hazard_water: 'hazard_water',
    hazard_swamp: 'hazard_swamp',
    hazard_poison: 'hazard_poison',
    special_portal_pad: 'special_portal_pad'
  };

  const TILE_IDS = {
    empty: 'empty',
    floor_stone: 'floor_stone',
    floor_wood: 'floor_wood',
    floor_grass: 'floor_grass',
    floor_sand: 'floor_sand',
    floor_dirt: 'floor_dirt',
    floor_cobble: 'floor_cobble',
    floor_tile: 'floor_tile',
    floor_moss: 'floor_moss',
    floor_snow: 'floor_snow',
    floor_ash: 'floor_ash',
    floor_crystal: 'floor_crystal',
    floor_darkstone: 'floor_darkstone',
    floor_marble: 'floor_marble',
    floor_ruins: 'floor_ruins',
    floor_planks: 'floor_planks',
    wall_stone: 'wall_stone',
    wall_wood: 'wall_wood',
    wall_brick: 'wall_brick',
    wall_metal: 'wall_metal',
    wall_ruin: 'wall_ruin',
    cliff: 'cliff',
    tree_block: 'tree_block',
    rock_block: 'rock_block',
    fence: 'fence',
    gate_closed: 'gate_closed',
    gate_open: 'gate_open',
    breakable_wall: 'breakable_wall',
    secret_wall: 'secret_wall',
    cave_wall: 'cave_wall',
    castle_wall: 'castle_wall',
    lava: 'lava',
    water: 'water',
    swamp: 'swamp',
    poison: 'poison',
    acid: 'acid',
    spikes: 'spikes',
    fire_trap: 'fire_trap',
    ice: 'ice',
    mud: 'mud',
    quicksand: 'quicksand',
    cursed_ground: 'cursed_ground',
    electric_floor: 'electric_floor',
    thorn_patch: 'thorn_patch',
    healing_pool: 'healing_pool',
    slow_field: 'slow_field',
    bridge: 'bridge',
    stairs_up: 'stairs_up',
    stairs_down: 'stairs_down',
    ladder: 'ladder',
    jump_pad: 'jump_pad',
    narrow_path: 'narrow_path',
    doorway: 'doorway',
    tunnel_entry: 'tunnel_entry',
    tunnel_exit: 'tunnel_exit',
    one_way_gate: 'one_way_gate'
  };

  const OBJECT_IDS = {
    none: 'none',
    player_start: 'player_start',
    respawn_point: 'respawn_point',
    checkpoint: 'checkpoint',
    portal_level: 'portal_level',
    portal_town: 'portal_town',
    portal_world: 'portal_world',
    exit_marker: 'exit_marker',
    return_portal: 'return_portal',
    boss_exit: 'boss_exit',
    locked_portal: 'locked_portal',
    enemy_spawn_basic: 'enemy_spawn_basic',
    enemy_spawn_ranged: 'enemy_spawn_ranged',
    enemy_spawn_tank: 'enemy_spawn_tank',
    enemy_spawn_swarm: 'enemy_spawn_swarm',
    enemy_spawn_runner: 'enemy_spawn_runner',
    enemy_spawn_elite: 'enemy_spawn_elite',
    enemy_spawn_boss: 'enemy_spawn_boss',
    enemy_patrol_point: 'enemy_patrol_point',
    enemy_zone_start: 'enemy_zone_start',
    enemy_zone_end: 'enemy_zone_end',
    ambush_spawn: 'ambush_spawn',
    chest_common: 'chest_common',
    chest_rare: 'chest_rare',
    chest_legendary: 'chest_legendary',
    loot_drop_spot: 'loot_drop_spot',
    resource_node: 'resource_node',
    hidden_cache: 'hidden_cache',
    reward_marker: 'reward_marker',
    breakable_loot: 'breakable_loot',
    boss_reward: 'boss_reward',
    gold_pile: 'gold_pile',
    fountain: 'fountain',
    blacksmith: 'blacksmith',
    armor_shop: 'armor_shop',
    potion_shop: 'potion_shop',
    general_shop: 'general_shop',
    special_shop: 'special_shop',
    inn: 'inn',
    storage: 'storage',
    crafting_station: 'crafting_station',
    npc_spot: 'npc_spot',
    signpost: 'signpost',
    town_portal: 'town_portal',
    quest_board: 'quest_board',
    map_board: 'map_board',
    town_decor: 'town_decor',
    trigger_marker: 'trigger_marker',
    story_trigger: 'story_trigger',
    cutscene_trigger: 'cutscene_trigger',
    dialogue_trigger: 'dialogue_trigger',
    area_enter_trigger: 'area_enter_trigger',
    boss_trigger: 'boss_trigger',
    trap_trigger: 'trap_trigger',
    wave_trigger: 'wave_trigger',
    unlock_trigger: 'unlock_trigger',
    secret_trigger: 'secret_trigger',
    tree: 'tree',
    rock: 'rock',
    bush: 'bush',
    torch: 'torch',
    banner: 'banner',
    statue: 'statue',
    rubble: 'rubble',
    crate: 'crate',
    barrel: 'barrel',
    table: 'table',
    chair: 'chair',
    pillar: 'pillar',
    bones: 'bones',
    skull_pile: 'skull_pile',
    campfire: 'campfire'
  };

  const PALETTE_DEFINITIONS = [
    { id: ENGINE_TILE_IDS.floor_stone_a, label: 'Engine Floor Stone A', layer: 'tile', group: 'Engine Core Tiles', color: '#d3be95', mapTypes: ['level', 'town'] },
    { id: ENGINE_TILE_IDS.floor_grass_a, label: 'Engine Floor Grass A', layer: 'tile', group: 'Engine Core Tiles', color: '#9ac8b4', mapTypes: ['level', 'town'] },
    { id: ENGINE_TILE_IDS.wall_rock_a, label: 'Engine Wall Rock A', layer: 'tile', group: 'Engine Core Tiles', color: '#4c5563', mapTypes: ['level', 'town'] },
    { id: ENGINE_TILE_IDS.hazard_water, label: 'Engine Hazard Water', layer: 'tile', group: 'Engine Core Tiles', color: '#2a78c8', mapTypes: ['level', 'town'] },
    { id: ENGINE_TILE_IDS.special_portal_pad, label: 'Engine Special Portal Pad', layer: 'tile', group: 'Engine Core Tiles', color: '#8f6a3b', mapTypes: ['level', 'town'] },

    { id: TILE_IDS.empty, label: 'Empty', layer: 'tile', group: 'Floors', color: '#e9edf3', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.floor_stone, label: 'Floor Stone', layer: 'tile', group: 'Floors', color: '#d3be95', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.floor_wood, label: 'Floor Wood', layer: 'tile', group: 'Floors', color: '#c4b0e2', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.floor_grass, label: 'Floor Grass', layer: 'tile', group: 'Floors', color: '#9ac8b4', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.floor_sand, label: 'Floor Sand', layer: 'tile', group: 'Floors', color: '#ebd089', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.floor_dirt, label: 'Floor Dirt', layer: 'tile', group: 'Floors', color: '#96724f', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.floor_cobble, label: 'Floor Cobble', layer: 'tile', group: 'Floors', color: '#a5a9b2', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.floor_tile, label: 'Floor Tile', layer: 'tile', group: 'Floors', color: '#cbd5e1', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.floor_moss, label: 'Floor Moss', layer: 'tile', group: 'Floors', color: '#5f8a47', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.floor_snow, label: 'Floor Snow', layer: 'tile', group: 'Floors', color: '#f4f8fd', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.floor_ash, label: 'Floor Ash', layer: 'tile', group: 'Floors', color: '#7c7d86', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.floor_crystal, label: 'Floor Crystal', layer: 'tile', group: 'Floors', color: '#76cff2', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.floor_darkstone, label: 'Floor Darkstone', layer: 'tile', group: 'Floors', color: '#4b5563', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.floor_marble, label: 'Floor Marble', layer: 'tile', group: 'Floors', color: '#e2e8f0', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.floor_ruins, label: 'Floor Ruins', layer: 'tile', group: 'Floors', color: '#8f8378', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.floor_planks, label: 'Floor Planks', layer: 'tile', group: 'Floors', color: '#9f7851', mapTypes: ['level', 'town'] },

    { id: TILE_IDS.wall_stone, label: 'Wall Stone', layer: 'tile', group: 'Walls / Blockers', color: '#4c5563', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.wall_wood, label: 'Wall Wood', layer: 'tile', group: 'Walls / Blockers', color: '#6b4a2f', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.wall_brick, label: 'Wall Brick', layer: 'tile', group: 'Walls / Blockers', color: '#994b3f', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.wall_metal, label: 'Wall Metal', layer: 'tile', group: 'Walls / Blockers', color: '#7b8795', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.wall_ruin, label: 'Wall Ruin', layer: 'tile', group: 'Walls / Blockers', color: '#7d7468', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.cliff, label: 'Cliff', layer: 'tile', group: 'Walls / Blockers', color: '#5f564c', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.tree_block, label: 'Tree Block', layer: 'tile', group: 'Walls / Blockers', color: '#2f6f3f', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.rock_block, label: 'Rock Block', layer: 'tile', group: 'Walls / Blockers', color: '#5d6471', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.fence, label: 'Fence', layer: 'tile', group: 'Walls / Blockers', color: '#8e6b3b', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.gate_closed, label: 'Gate Closed', layer: 'tile', group: 'Walls / Blockers', color: '#624737', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.gate_open, label: 'Gate Open', layer: 'tile', group: 'Walls / Blockers', color: '#9f8468', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.breakable_wall, label: 'Breakable Wall', layer: 'tile', group: 'Walls / Blockers', color: '#b26b52', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.secret_wall, label: 'Secret Wall', layer: 'tile', group: 'Walls / Blockers', color: '#444f63', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.cave_wall, label: 'Cave Wall', layer: 'tile', group: 'Walls / Blockers', color: '#3f3b38', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.castle_wall, label: 'Castle Wall', layer: 'tile', group: 'Walls / Blockers', color: '#707b8d', mapTypes: ['level', 'town'] },

    { id: TILE_IDS.lava, label: 'Lava', layer: 'tile', group: 'Hazards / Effects', color: '#e65032', effect: 'lava', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.water, label: 'Water', layer: 'tile', group: 'Hazards / Effects', color: '#2a78c8', effect: 'water', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.swamp, label: 'Swamp', layer: 'tile', group: 'Hazards / Effects', color: '#5e7f45', effect: 'swamp', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.poison, label: 'Poison', layer: 'tile', group: 'Hazards / Effects', color: '#4d9c34', effect: 'poison', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.acid, label: 'Acid', layer: 'tile', group: 'Hazards / Effects', color: '#b7cf2f', effect: 'acid', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.spikes, label: 'Spikes', layer: 'tile', group: 'Hazards / Effects', color: '#8c95a4', effect: 'spikes', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.fire_trap, label: 'Fire Trap', layer: 'tile', group: 'Hazards / Effects', color: '#d3572d', effect: 'fire_trap', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.ice, label: 'Ice', layer: 'tile', group: 'Hazards / Effects', color: '#a5d8ee', effect: 'ice', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.mud, label: 'Mud', layer: 'tile', group: 'Hazards / Effects', color: '#816247', effect: 'mud', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.quicksand, label: 'Quicksand', layer: 'tile', group: 'Hazards / Effects', color: '#d2b777', effect: 'quicksand', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.cursed_ground, label: 'Cursed Ground', layer: 'tile', group: 'Hazards / Effects', color: '#60307a', effect: 'cursed_ground', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.electric_floor, label: 'Electric Floor', layer: 'tile', group: 'Hazards / Effects', color: '#58c4ff', effect: 'electric_floor', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.thorn_patch, label: 'Thorn Patch', layer: 'tile', group: 'Hazards / Effects', color: '#43743f', effect: 'thorn_patch', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.healing_pool, label: 'Healing Pool', layer: 'tile', group: 'Hazards / Effects', color: '#4ca8ac', effect: 'healing_pool', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.slow_field, label: 'Slow Field', layer: 'tile', group: 'Hazards / Effects', color: '#6f8ea2', effect: 'slow_field', mapTypes: ['level', 'town'] },

    { id: TILE_IDS.bridge, label: 'Bridge', layer: 'tile', group: 'Travel / Movement', color: '#8f6a3b', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.stairs_up, label: 'Stairs Up', layer: 'tile', group: 'Travel / Movement', color: '#8ba5c7', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.stairs_down, label: 'Stairs Down', layer: 'tile', group: 'Travel / Movement', color: '#6f84a2', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.ladder, label: 'Ladder', layer: 'tile', group: 'Travel / Movement', color: '#af8f4f', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.jump_pad, label: 'Jump Pad', layer: 'tile', group: 'Travel / Movement', color: '#ce5d9f', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.narrow_path, label: 'Narrow Path', layer: 'tile', group: 'Travel / Movement', color: '#6f8261', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.doorway, label: 'Doorway', layer: 'tile', group: 'Travel / Movement', color: '#5c3a2d', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.tunnel_entry, label: 'Tunnel Entry', layer: 'tile', group: 'Travel / Movement', color: '#4d5b6d', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.tunnel_exit, label: 'Tunnel Exit', layer: 'tile', group: 'Travel / Movement', color: '#7d8ca2', mapTypes: ['level', 'town'] },
    { id: TILE_IDS.one_way_gate, label: 'One Way Gate', layer: 'tile', group: 'Travel / Movement', color: '#7c5d5d', mapTypes: ['level', 'town'] },

    { id: OBJECT_IDS.none, label: 'None', layer: 'object', group: 'Player / Portals', color: '#ffffff', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.player_start, label: 'Player Start', layer: 'object', group: 'Player / Portals', color: '#22c55e', unique: true, mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.respawn_point, label: 'Respawn Point', layer: 'object', group: 'Player / Portals', color: '#84cc16', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.checkpoint, label: 'Checkpoint', layer: 'object', group: 'Player / Portals', color: '#65a30d', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.portal_level, label: 'Portal Level', layer: 'object', group: 'Player / Portals', color: '#6c4ad2', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.portal_town, label: 'Portal Town', layer: 'object', group: 'Player / Portals', color: '#7c3aed', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.portal_world, label: 'Portal World', layer: 'object', group: 'Player / Portals', color: '#8b5cf6', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.exit_marker, label: 'Exit Marker', layer: 'object', group: 'Player / Portals', color: '#1d4ed8', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.return_portal, label: 'Return Portal', layer: 'object', group: 'Player / Portals', color: '#a855f7', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.boss_exit, label: 'Boss Exit', layer: 'object', group: 'Player / Portals', color: '#581c87', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.locked_portal, label: 'Locked Portal', layer: 'object', group: 'Player / Portals', color: '#312e81', mapTypes: ['level', 'town'] },

    { id: OBJECT_IDS.enemy_spawn_basic, label: 'Enemy Spawn Basic', layer: 'object', group: 'Enemies', color: '#8b5a2b', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.enemy_spawn_ranged, label: 'Enemy Spawn Ranged', layer: 'object', group: 'Enemies', color: '#92400e', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.enemy_spawn_tank, label: 'Enemy Spawn Tank', layer: 'object', group: 'Enemies', color: '#7c2d12', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.enemy_spawn_swarm, label: 'Enemy Spawn Swarm', layer: 'object', group: 'Enemies', color: '#a16207', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.enemy_spawn_runner, label: 'Enemy Spawn Runner', layer: 'object', group: 'Enemies', color: '#b45309', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.enemy_spawn_elite, label: 'Enemy Spawn Elite', layer: 'object', group: 'Enemies', color: '#c2410c', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.enemy_spawn_boss, label: 'Enemy Spawn Boss', layer: 'object', group: 'Enemies', color: '#991b1b', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.enemy_patrol_point, label: 'Enemy Patrol Point', layer: 'object', group: 'Enemies', color: '#b91c1c', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.enemy_zone_start, label: 'Enemy Zone Start', layer: 'object', group: 'Enemies', color: '#dc2626', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.enemy_zone_end, label: 'Enemy Zone End', layer: 'object', group: 'Enemies', color: '#ef4444', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.ambush_spawn, label: 'Ambush Spawn', layer: 'object', group: 'Enemies', color: '#7f1d1d', mapTypes: ['level', 'town'] },

    { id: OBJECT_IDS.chest_common, label: 'Chest Common', layer: 'object', group: 'Loot / Rewards', color: '#92400e', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.chest_rare, label: 'Chest Rare', layer: 'object', group: 'Loot / Rewards', color: '#1d4ed8', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.chest_legendary, label: 'Chest Legendary', layer: 'object', group: 'Loot / Rewards', color: '#f59e0b', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.loot_drop_spot, label: 'Loot Drop Spot', layer: 'object', group: 'Loot / Rewards', color: '#ca8a04', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.resource_node, label: 'Resource Node', layer: 'object', group: 'Loot / Rewards', color: '#15803d', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.hidden_cache, label: 'Hidden Cache', layer: 'object', group: 'Loot / Rewards', color: '#78350f', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.reward_marker, label: 'Reward Marker', layer: 'object', group: 'Loot / Rewards', color: '#a16207', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.breakable_loot, label: 'Breakable Loot', layer: 'object', group: 'Loot / Rewards', color: '#9a3412', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.boss_reward, label: 'Boss Reward', layer: 'object', group: 'Loot / Rewards', color: '#92400e', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.gold_pile, label: 'Gold Pile', layer: 'object', group: 'Loot / Rewards', color: '#d97706', mapTypes: ['level', 'town'] },

    { id: OBJECT_IDS.fountain, label: 'Fountain', layer: 'object', group: 'Town', color: '#0ea5e9', mapTypes: ['town', 'level'] },
    { id: OBJECT_IDS.blacksmith, label: 'Blacksmith', layer: 'object', group: 'Town', color: '#b45309', mapTypes: ['town'] },
    { id: OBJECT_IDS.armor_shop, label: 'Armor Shop', layer: 'object', group: 'Town', color: '#7c3aed', mapTypes: ['town'] },
    { id: OBJECT_IDS.potion_shop, label: 'Potion Shop', layer: 'object', group: 'Town', color: '#be185d', mapTypes: ['town'] },
    { id: OBJECT_IDS.general_shop, label: 'General Shop', layer: 'object', group: 'Town', color: '#0f766e', mapTypes: ['town'] },
    { id: OBJECT_IDS.special_shop, label: 'Special Shop', layer: 'object', group: 'Town', color: '#9333ea', mapTypes: ['town'] },
    { id: OBJECT_IDS.inn, label: 'Inn', layer: 'object', group: 'Town', color: '#334155', mapTypes: ['town'] },
    { id: OBJECT_IDS.storage, label: 'Storage', layer: 'object', group: 'Town', color: '#64748b', mapTypes: ['town'] },
    { id: OBJECT_IDS.crafting_station, label: 'Crafting Station', layer: 'object', group: 'Town', color: '#52525b', mapTypes: ['town'] },
    { id: OBJECT_IDS.npc_spot, label: 'NPC Spot', layer: 'object', group: 'Town', color: '#4b5563', mapTypes: ['town'] },
    { id: OBJECT_IDS.signpost, label: 'Signpost', layer: 'object', group: 'Town', color: '#854d0e', mapTypes: ['town'] },
    { id: OBJECT_IDS.town_portal, label: 'Town Portal', layer: 'object', group: 'Town', color: '#6d28d9', mapTypes: ['town'] },
    { id: OBJECT_IDS.quest_board, label: 'Quest Board', layer: 'object', group: 'Town', color: '#1d4ed8', mapTypes: ['town'] },
    { id: OBJECT_IDS.map_board, label: 'Map Board', layer: 'object', group: 'Town', color: '#0c4a6e', mapTypes: ['town'] },
    { id: OBJECT_IDS.town_decor, label: 'Town Decor', layer: 'object', group: 'Town', color: '#57534e', mapTypes: ['town'] },

    { id: OBJECT_IDS.trigger_marker, label: 'Trigger Marker', layer: 'object', group: 'Triggers / Events', color: '#1d4ed8', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.story_trigger, label: 'Story Trigger', layer: 'object', group: 'Triggers / Events', color: '#2563eb', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.cutscene_trigger, label: 'Cutscene Trigger', layer: 'object', group: 'Triggers / Events', color: '#1e40af', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.dialogue_trigger, label: 'Dialogue Trigger', layer: 'object', group: 'Triggers / Events', color: '#3730a3', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.area_enter_trigger, label: 'Area Enter Trigger', layer: 'object', group: 'Triggers / Events', color: '#0c4a6e', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.boss_trigger, label: 'Boss Trigger', layer: 'object', group: 'Triggers / Events', color: '#991b1b', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.trap_trigger, label: 'Trap Trigger', layer: 'object', group: 'Triggers / Events', color: '#b91c1c', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.wave_trigger, label: 'Wave Trigger', layer: 'object', group: 'Triggers / Events', color: '#be123c', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.unlock_trigger, label: 'Unlock Trigger', layer: 'object', group: 'Triggers / Events', color: '#4f46e5', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.secret_trigger, label: 'Secret Trigger', layer: 'object', group: 'Triggers / Events', color: '#6d28d9', mapTypes: ['level', 'town'] },

    { id: OBJECT_IDS.tree, label: 'Tree', layer: 'object', group: 'Decor', color: '#166534', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.rock, label: 'Rock', layer: 'object', group: 'Decor', color: '#6b7280', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.bush, label: 'Bush', layer: 'object', group: 'Decor', color: '#15803d', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.torch, label: 'Torch', layer: 'object', group: 'Decor', color: '#f97316', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.banner, label: 'Banner', layer: 'object', group: 'Decor', color: '#7c3aed', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.statue, label: 'Statue', layer: 'object', group: 'Decor', color: '#64748b', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.rubble, label: 'Rubble', layer: 'object', group: 'Decor', color: '#78716c', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.crate, label: 'Crate', layer: 'object', group: 'Decor', color: '#92400e', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.barrel, label: 'Barrel', layer: 'object', group: 'Decor', color: '#a16207', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.table, label: 'Table', layer: 'object', group: 'Decor', color: '#854d0e', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.chair, label: 'Chair', layer: 'object', group: 'Decor', color: '#713f12', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.pillar, label: 'Pillar', layer: 'object', group: 'Decor', color: '#475569', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.bones, label: 'Bones', layer: 'object', group: 'Decor', color: '#d4d4d8', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.skull_pile, label: 'Skull Pile', layer: 'object', group: 'Decor', color: '#e5e7eb', mapTypes: ['level', 'town'] },
    { id: OBJECT_IDS.campfire, label: 'Campfire', layer: 'object', group: 'Decor', color: '#ea580c', mapTypes: ['level', 'town'] }
  ];

  const LEGACY_ID_TO_TYPE = {
    0: TILE_IDS.empty,
    1: TILE_IDS.wall_stone,
    2: TILE_IDS.water,
    3: TILE_IDS.lava,
    4: OBJECT_IDS.player_start,
    5: OBJECT_IDS.portal_level,
    6: OBJECT_IDS.enemy_spawn_basic,
    7: TILE_IDS.bridge,
    10: TILE_IDS.floor_stone,
    11: TILE_IDS.floor_wood,
    12: TILE_IDS.floor_grass,
    13: TILE_IDS.floor_sand,
    21: TILE_IDS.swamp,
    100: OBJECT_IDS.blacksmith,
    101: OBJECT_IDS.armor_shop,
    102: OBJECT_IDS.potion_shop,
    103: OBJECT_IDS.special_shop,
    104: OBJECT_IDS.general_shop,
    105: OBJECT_IDS.fountain,
    106: OBJECT_IDS.npc_spot,
    120: OBJECT_IDS.chest_common,
    121: OBJECT_IDS.trigger_marker,
    122: OBJECT_IDS.enemy_spawn_boss
  };

  const DEFS_BY_ID = PALETTE_DEFINITIONS.reduce(function (acc, entry) {
    acc[entry.id] = entry;
    return acc;
  }, {});

  const dom = {
    gridContainer: document.getElementById('gridContainer'),
    palette: document.getElementById('palette'),
    eraserBtn: document.getElementById('eraserBtn'),
    paintToolBtn: document.getElementById('paintToolBtn'),
    fillToolBtn: document.getElementById('fillToolBtn'),
    mapHBarToolBtn: document.getElementById('mapHBarToolBtn'),
    mapVBarToolBtn: document.getElementById('mapVBarToolBtn'),
    mapLineToolBtn: document.getElementById('mapLineToolBtn'),
    layerTileBtn: document.getElementById('layerTileBtn'),
    layerObjectBtn: document.getElementById('layerObjectBtn'),
    mapBrushSizeSelect: document.getElementById('mapBrushSizeSelect'),
    mapBarLengthInput: document.getElementById('mapBarLengthInput'),
    mapBarThicknessInput: document.getElementById('mapBarThicknessInput'),
    mapUndoBtn: document.getElementById('mapUndoBtn'),
    mapRedoBtn: document.getElementById('mapRedoBtn'),
    selectedToolLabel: document.getElementById('selectedToolLabel'),
    activeToolLabel: document.getElementById('activeToolLabel'),
    activeLayerLabel: document.getElementById('activeLayerLabel'),
    mapTypeLabel: document.getElementById('mapTypeLabel'),
    mapIdLabel: document.getElementById('mapIdLabel'),
    gridSizeLabel: document.getElementById('gridSizeLabel'),
    gridSizeLabel2: document.getElementById('gridSizeLabel2'),
    message: document.getElementById('message'),
    tileLegend: document.getElementById('tileLegend'),
    exportBtn: document.getElementById('exportBtn'),
    exportGameBtn: document.getElementById('exportGameBtn'),
    importInput: document.getElementById('importInput'),
    clearBtn: document.getElementById('clearBtn'),
    openViewerBtn: document.getElementById('openViewerBtn'),
    mapTypeSelect: document.getElementById('mapTypeSelect'),
    mapIdInput: document.getElementById('mapIdInput'),
    mapNameInput: document.getElementById('mapNameInput'),
    mapWidthInput: document.getElementById('mapWidthInput'),
    mapHeightInput: document.getElementById('mapHeightInput'),
    applySizeBtn: document.getElementById('applySizeBtn'),
    tabMapEditorBtn: document.getElementById('tabMapEditorBtn'),
    tabViewerBtn: document.getElementById('tabViewerBtn'),
    tabItemEditorBtn: document.getElementById('tabItemEditorBtn'),
    tabTextureBuilderBtn: document.getElementById('tabTextureBuilderBtn'),
    mapEditorTab: document.getElementById('mapEditorTab'),
    viewerTab: document.getElementById('viewerTab'),
    itemEditorTab: document.getElementById('itemEditorTab'),
    textureBuilderTab: document.getElementById('textureBuilderTab'),
    openViewerFromTabBtn: document.getElementById('openViewerFromTabBtn'),
    itemList: document.getElementById('itemList'),
    itemEditorMessage: document.getElementById('itemEditorMessage'),
    itemNewBtn: document.getElementById('itemNewBtn'),
    itemSaveBtn: document.getElementById('itemSaveBtn'),
    itemDeleteBtn: document.getElementById('itemDeleteBtn'),
    itemExportBtn: document.getElementById('itemExportBtn'),
    itemImportInput: document.getElementById('itemImportInput'),
    itemIdInput: document.getElementById('itemIdInput'),
    itemNameInput: document.getElementById('itemNameInput'),
    itemCategorySelect: document.getElementById('itemCategorySelect'),
    itemBaseValueInput: document.getElementById('itemBaseValueInput'),
    itemStackableInput: document.getElementById('itemStackableInput'),
    itemRaritySelect: document.getElementById('itemRaritySelect'),
    itemEquipSlotInput: document.getElementById('itemEquipSlotInput'),
    itemModsInput: document.getElementById('itemModsInput'),
    itemPowerInput: document.getElementById('itemPowerInput'),
    itemAttackRangeInput: document.getElementById('itemAttackRangeInput'),
    itemCooldownInput: document.getElementById('itemCooldownInput'),
    itemEffectTypeInput: document.getElementById('itemEffectTypeInput'),
    itemEffectValueInput: document.getElementById('itemEffectValueInput'),
    itemEffectDurationInput: document.getElementById('itemEffectDurationInput'),
    equipSlotRow: document.getElementById('equipSlotRow'),
    modsRow: document.getElementById('modsRow'),
    weaponFields: document.getElementById('weaponFields'),
    consumableFields: document.getElementById('consumableFields'),
    textureSizeSelect: document.getElementById('textureSizeSelect'),
    textureColorPicker: document.getElementById('textureColorPicker'),
    texturePalette: document.getElementById('texturePalette'),
    texturePaintToolBtn: document.getElementById('texturePaintToolBtn'),
    textureFillToolBtn: document.getElementById('textureFillToolBtn'),
    textureEraserBtn: document.getElementById('textureEraserBtn'),
    textureHighlighterToolBtn: document.getElementById('textureHighlighterToolBtn'),
    textureEyedropperToolBtn: document.getElementById('textureEyedropperToolBtn'),
    textureHBarToolBtn: document.getElementById('textureHBarToolBtn'),
    textureVBarToolBtn: document.getElementById('textureVBarToolBtn'),
    textureLineToolBtn: document.getElementById('textureLineToolBtn'),
    textureBrushSizeSelect: document.getElementById('textureBrushSizeSelect'),
    textureHighlighterOpacityInput: document.getElementById('textureHighlighterOpacityInput'),
    textureBarLengthInput: document.getElementById('textureBarLengthInput'),
    textureBarThicknessInput: document.getElementById('textureBarThicknessInput'),
    textureLayerList: document.getElementById('textureLayerList'),
    textureUndoBtn: document.getElementById('textureUndoBtn'),
    textureRedoBtn: document.getElementById('textureRedoBtn'),
    textureAddLayerBtn: document.getElementById('textureAddLayerBtn'),
    textureClearLayerBtn: document.getElementById('textureClearLayerBtn'),
    textureFilenameInput: document.getElementById('textureFilenameInput'),
    textureSaveToLibraryBtn: document.getElementById('textureSaveToLibraryBtn'),
    textureExportBtn: document.getElementById('textureExportBtn'),
    textureExportPngBtn: document.getElementById('textureExportPngBtn'),
    textureExportEngineEntryBtn: document.getElementById('textureExportEngineEntryBtn'),
    textureImportInput: document.getElementById('textureImportInput'),
    textureLibraryExportBtn: document.getElementById('textureLibraryExportBtn'),
    textureLibraryImportInput: document.getElementById('textureLibraryImportInput'),
    textureLibraryList: document.getElementById('textureLibraryList'),
    textureGridContainer: document.getElementById('textureGridContainer'),
    textureSizeLabel: document.getElementById('textureSizeLabel'),
    textureSizeLabel2: document.getElementById('textureSizeLabel2'),
    textureSelectedColorLabel: document.getElementById('textureSelectedColorLabel'),
    textureActiveToolLabel: document.getElementById('textureActiveToolLabel'),
    textureMessage: document.getElementById('textureMessage')
  };

  const state = {
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
    mapType: 'level',
    mapId: 'level_001',
    mapName: 'Starter Level',
    tileLayer: createLayerGrid(DEFAULT_WIDTH, DEFAULT_HEIGHT, TILE_IDS.empty),
    objectLayer: createLayerGrid(DEFAULT_WIDTH, DEFAULT_HEIGHT, OBJECT_IDS.none),
    selectedByLayer: {
      tile: ENGINE_TILE_IDS.floor_stone_a,
      object: OBJECT_IDS.player_start
    },
    activeLayer: 'tile',
    activeTool: 'paint',
    mapBrushSize: 1,
    mapBarLength: 8,
    mapBarThickness: 1,
    mapShapeStart: null,
    mapUndoStack: [],
    mapRedoStack: [],
    mapPendingStrokeSnapshot: null,
    mapHasPendingStrokeChange: false,
    isPainting: false,
    lastPaintedCellKey: '',
    activeTab: 'mapEditor',
    itemDb: { items: [] },
    customTextureLibrary: {
      version: 1,
      textures: []
    },
    selectedItemIndex: -1,
    textureBuilder: {
      size: 16,
      layers: [],
      activeLayerId: '',
      selectedColor: '#000000',
      customColors: [],
      activeTool: 'paint',
      brushSize: 1,
      highlighterOpacity: 0.35,
      barLength: 8,
      barThickness: 1,
      previewCells: [],
      shapeStart: null,
      nextLayerId: 1,
      undoStack: [],
      redoStack: [],
      pendingStrokeSnapshot: null,
      hasPendingStrokeChange: false,
      isPainting: false,
      lastPaintedCellKey: ''
    }
  };

  initialize();

  function initialize() {
    state.customTextureLibrary = loadCustomTextureLibraryFromStorage();
    syncCustomTextureDefinitionsFromLibrary();
    renderPalette();
    renderLegend();
    renderGrid();
    bindEvents();
    updateActiveLayerButtons();
    updateActiveToolButtonState();
    dom.mapBrushSizeSelect.value = String(state.mapBrushSize);
    dom.mapBarLengthInput.value = String(state.mapBarLength);
    dom.mapBarThicknessInput.value = String(state.mapBarThickness);
    updateMapUndoRedoButtons();
    syncMapInputsFromState();
    updateMapLabels();
    updateSelectedToolLabel();
    renderItemList();
    resetItemFormToDefaults();
    updateItemConditionalFields();
    initializeTextureBuilder();
    renderCustomTextureLibraryList();
    updateStatus('Ready. Click or drag on the grid to paint tiles and markers.');
  }

  function createLayerGrid(width, height, value) {
    return Array.from({ length: height }, function () {
      return Array(width).fill(value);
    });
  }

  function cloneLayer(layer) {
    return layer.map(function (row) {
      return row.slice();
    });
  }

  function getEmptyCustomTextureLibrary() {
    return {
      version: 1,
      textures: []
    };
  }

  function normalizeCustomTextureId(value) {
    const base = String(value || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_\-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    return base.indexOf('custom_texture_') === 0 ? base : 'custom_texture_' + (base || 'unnamed');
  }

  function isCustomTextureId(id) {
    return String(id || '').indexOf('custom_texture_') === 0;
  }

  function normalizeCustomTextureLibraryPayload(payload) {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.textures)) {
      return getEmptyCustomTextureLibrary();
    }
    const normalized = [];
    const seen = new Set();
    payload.textures.forEach(function (entry, index) {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const size = Number(entry.size);
      if (TEXTURE_SIZES.indexOf(size) === -1) {
        return;
      }
      const pixels = Array.isArray(entry.pixels) ? entry.pixels : null;
      if (!pixels || pixels.length !== size) {
        return;
      }
      const normalizedPixels = [];
      let valid = true;
      pixels.forEach(function (row) {
        if (!Array.isArray(row) || row.length !== size) {
          valid = false;
          return;
        }
        normalizedPixels.push(row.map(function (pixel) {
          return normalizeTexturePixel(pixel);
        }));
      });
      if (!valid) {
        return;
      }
      const id = normalizeCustomTextureId(entry.id || entry.name || ('texture_' + index));
      if (seen.has(id)) {
        return;
      }
      seen.add(id);
      normalized.push({
        id: id,
        name: String(entry.name || id),
        size: size,
        pixels: normalizedPixels,
        previewColor: buildCustomTexturePreviewData(normalizedPixels),
        createdAt: String(entry.createdAt || new Date().toISOString()),
        updatedAt: String(entry.updatedAt || new Date().toISOString())
      });
    });
    return {
      version: 1,
      textures: normalized
    };
  }

  function loadCustomTextureLibraryFromStorage() {
    try {
      const raw = window.localStorage.getItem(CUSTOM_TEXTURE_LIBRARY_STORAGE_KEY);
      if (!raw) {
        return getEmptyCustomTextureLibrary();
      }
      const parsed = JSON.parse(raw);
      return normalizeCustomTextureLibraryPayload(parsed);
    } catch (error) {
      return getEmptyCustomTextureLibrary();
    }
  }

  function saveCustomTextureLibraryToStorage(library) {
    try {
      window.localStorage.setItem(CUSTOM_TEXTURE_LIBRARY_STORAGE_KEY, JSON.stringify(library));
    } catch (error) {
      // Ignore storage failures and keep app usable.
    }
  }

  function buildCustomTexturePreviewData(pixels) {
    let totalR = 0;
    let totalG = 0;
    let totalB = 0;
    let count = 0;
    pixels.forEach(function (row) {
      row.forEach(function (pixel) {
        const normalized = normalizeTexturePixel(pixel);
        if (!normalized) {
          return;
        }
        const color = normalized.color;
        totalR += parseInt(color.slice(1, 3), 16);
        totalG += parseInt(color.slice(3, 5), 16);
        totalB += parseInt(color.slice(5, 7), 16);
        count += 1;
      });
    });
    if (!count) {
      return '#9ca3af';
    }
    const r = Math.round(totalR / count).toString(16).padStart(2, '0');
    const g = Math.round(totalG / count).toString(16).padStart(2, '0');
    const b = Math.round(totalB / count).toString(16).padStart(2, '0');
    return '#' + r + g + b;
  }

  function syncCustomTextureDefinitionsFromLibrary() {
    Object.keys(DEFS_BY_ID).forEach(function (id) {
      if (isCustomTextureId(id)) {
        delete DEFS_BY_ID[id];
      }
    });
    state.customTextureLibrary.textures.forEach(function (texture) {
      DEFS_BY_ID[texture.id] = {
        id: texture.id,
        label: 'Custom: ' + texture.name,
        layer: 'tile',
        group: 'Custom Textures',
        color: texture.previewColor || '#9ca3af',
        mapTypes: ['level', 'town']
      };
    });
  }

  function getVisiblePaletteDefinitions() {
    const base = PALETTE_DEFINITIONS.filter(function (def) {
      return def.layer === state.activeLayer && def.mapTypes.indexOf(state.mapType) !== -1;
    });
    if (state.activeLayer !== 'tile') {
      return base;
    }
    const custom = state.customTextureLibrary.textures.map(function (texture) {
      return DEFS_BY_ID[texture.id];
    }).filter(function (def) {
      return def && def.mapTypes.indexOf(state.mapType) !== -1;
    });
    return base.concat(custom);
  }

  function renderPalette() {
    const visible = getVisiblePaletteDefinitions();
    const grouped = visible.reduce(function (acc, entry) {
      if (!acc[entry.group]) {
        acc[entry.group] = [];
      }
      acc[entry.group].push(entry);
      return acc;
    }, {});

    dom.palette.innerHTML = '';

    Object.keys(grouped).forEach(function (groupName, index) {
      const section = document.createElement('details');
      section.className = 'palette-group';
      if (index === 0) {
        section.open = true;
      }

      const summary = document.createElement('summary');
      summary.textContent = groupName;
      section.appendChild(summary);

      const groupGrid = document.createElement('div');
      groupGrid.className = 'palette';

      grouped[groupName].forEach(function (entry) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tile-btn';
        btn.dataset.tileId = entry.id;

        const colorDot = document.createElement('span');
        colorDot.className = 'tile-color-dot';
        colorDot.style.background = entry.color;

        const text = document.createElement('span');
        text.textContent = entry.label;

        btn.appendChild(colorDot);
        btn.appendChild(text);
        btn.addEventListener('click', function () {
          setSelectedForActiveLayer(entry.id);
        });
        groupGrid.appendChild(btn);
      });

      section.appendChild(groupGrid);
      dom.palette.appendChild(section);
    });

    highlightActivePaletteButton();
  }

  function renderLegend() {
    dom.tileLegend.innerHTML = '';
    const entries = PALETTE_DEFINITIONS.concat(state.customTextureLibrary.textures.map(function (texture) {
      return DEFS_BY_ID[texture.id];
    }).filter(Boolean));
    entries.filter(function (entry) {
      return entry.mapTypes.indexOf(state.mapType) !== -1;
    }).forEach(function (entry) {
      const li = document.createElement('li');
      li.textContent = entry.id + ' [' + entry.layer + ']';
      dom.tileLegend.appendChild(li);
    });
  }

  function renderGrid() {
    dom.gridContainer.innerHTML = '';
    dom.gridContainer.style.setProperty('--grid-width', String(state.width));
    dom.gridContainer.style.setProperty('--grid-height', String(state.height));

    for (let row = 0; row < state.height; row += 1) {
      for (let col = 0; col < state.width; col += 1) {
        const cell = document.createElement('div');
        const marker = document.createElement('span');
        marker.className = 'cell-marker';
        cell.className = 'cell';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        applyCellVisual(cell, marker, state.tileLayer[row][col], state.objectLayer[row][col]);
        cell.appendChild(marker);
        dom.gridContainer.appendChild(cell);
      }
    }

    dom.gridSizeLabel.textContent = String(state.width);
    dom.gridSizeLabel2.textContent = String(state.height);
  }

  function applyCellVisual(cell, markerEl, tileId, objectId) {
    cell.dataset.tileId = tileId;
    cell.style.backgroundColor = getColorForId(tileId);
    markerEl.textContent = objectId !== OBJECT_IDS.none ? '●' : '';
    markerEl.style.color = objectId !== OBJECT_IDS.none ? getColorForId(objectId) : 'transparent';
    markerEl.title = objectId !== OBJECT_IDS.none ? objectId : '';
  }

  function getColorForId(id) {
    return DEFS_BY_ID[id] ? DEFS_BY_ID[id].color : '#9ca3af';
  }

  function bindEvents() {
    dom.gridContainer.addEventListener('mousedown', function (event) {
      const cell = getCellFromEventTarget(event.target);
      if (!cell) {
        return;
      }
      event.preventDefault();
      if (state.activeTool === 'paint') {
        beginMapStrokeHistoryIfNeeded();
        state.isPainting = true;
      } else {
        state.isPainting = false;
      }
      state.lastPaintedCellKey = '';
      paintCellFromElement(cell);
    });

    dom.gridContainer.addEventListener('mouseover', function (event) {
      if (!state.isPainting || state.activeTool !== 'paint') {
        return;
      }
      const cell = getCellFromEventTarget(event.target);
      if (!cell) {
        return;
      }
      paintCellFromElement(cell);
    });

    document.addEventListener('mouseup', function () {
      state.isPainting = false;
      state.lastPaintedCellKey = '';
      finalizeMapStrokeHistory();
      finalizeTextureStrokeHistory();
      state.textureBuilder.isPainting = false;
      state.textureBuilder.lastPaintedCellKey = '';
    });

    dom.gridContainer.addEventListener('click', function (event) {
      const cell = getCellFromEventTarget(event.target);
      if (!cell) {
        return;
      }
      paintCellFromElement(cell);
    });

    dom.layerTileBtn.addEventListener('click', function () {
      state.activeLayer = 'tile';
      state.activeTool = state.activeTool === 'fill' ? 'fill' : 'paint';
      state.mapShapeStart = null;
      onActiveLayerChanged();
    });

    dom.layerObjectBtn.addEventListener('click', function () {
      state.activeLayer = 'object';
      if (state.activeTool === 'fill') {
        state.activeTool = 'paint';
      }
      state.mapShapeStart = null;
      onActiveLayerChanged();
    });

    dom.eraserBtn.addEventListener('click', function () {
      setSelectedForActiveLayer(state.activeLayer === 'tile' ? TILE_IDS.empty : OBJECT_IDS.none);
      state.activeTool = 'paint';
      state.mapShapeStart = null;
      updateActiveToolButtonState();
    });

    dom.paintToolBtn.addEventListener('click', function () {
      state.activeTool = 'paint';
      state.mapShapeStart = null;
      updateActiveToolButtonState();
    });

    dom.fillToolBtn.addEventListener('click', function () {
      if (state.activeLayer === 'object') {
        updateStatus('Fill is tile-layer only. Switched to Paint for object markers.', true);
        state.activeTool = 'paint';
      } else {
        state.activeTool = 'fill';
      }
      state.mapShapeStart = null;
      updateActiveToolButtonState();
    });

    dom.mapHBarToolBtn.addEventListener('click', function () {
      state.activeTool = 'hbar';
      state.mapShapeStart = null;
      updateActiveToolButtonState();
    });

    dom.mapVBarToolBtn.addEventListener('click', function () {
      state.activeTool = 'vbar';
      state.mapShapeStart = null;
      updateActiveToolButtonState();
    });

    dom.mapLineToolBtn.addEventListener('click', function () {
      state.activeTool = 'line';
      state.mapShapeStart = null;
      updateActiveToolButtonState();
    });

    dom.mapBrushSizeSelect.addEventListener('change', function () {
      const next = Number(dom.mapBrushSizeSelect.value);
      state.mapBrushSize = Number.isInteger(next) ? Math.max(1, Math.min(5, next)) : 1;
    });

    dom.mapBarLengthInput.addEventListener('change', function () {
      state.mapBarLength = clampInteger(dom.mapBarLengthInput.value, 1, 256, 8);
      dom.mapBarLengthInput.value = String(state.mapBarLength);
    });

    dom.mapBarThicknessInput.addEventListener('change', function () {
      state.mapBarThickness = clampInteger(dom.mapBarThicknessInput.value, 1, 32, 1);
      dom.mapBarThicknessInput.value = String(state.mapBarThickness);
    });

    dom.mapUndoBtn.addEventListener('click', function () {
      undoMapAction();
    });

    dom.mapRedoBtn.addEventListener('click', function () {
      redoMapAction();
    });

    dom.applySizeBtn.addEventListener('click', applySizeFromInputs);

    dom.mapTypeSelect.addEventListener('change', function () {
      state.mapType = dom.mapTypeSelect.value;
      renderPalette();
      renderLegend();
      ensureSelectedVisible();
      updateMapLabels();
      updateStatus('Map type set to ' + state.mapType + '.');
    });

    dom.mapIdInput.addEventListener('input', function () {
      state.mapId = normalizeMapId(dom.mapIdInput.value);
      updateMapLabels();
    });

    dom.mapNameInput.addEventListener('input', function () {
      state.mapName = dom.mapNameInput.value.trim() || 'Untitled Map';
    });

    dom.exportBtn.addEventListener('click', exportRawMapToFile);
    dom.exportGameBtn.addEventListener('click', exportEngineMapToFile);

    dom.importInput.addEventListener('change', function (event) {
      if (!event.target.files || !event.target.files[0]) {
        return;
      }
      importMapFromFile(event.target.files[0]);
      event.target.value = '';
    });

    dom.clearBtn.addEventListener('click', function () {
      if (!window.confirm('Clear the entire map? This cannot be undone.')) {
        return;
      }
      pushMapUndoState();
      state.tileLayer = createLayerGrid(state.width, state.height, TILE_IDS.empty);
      state.objectLayer = createLayerGrid(state.width, state.height, OBJECT_IDS.none);
      renderGrid();
      updateStatus('Map cleared.');
    });

    dom.openViewerBtn.addEventListener('click', function () {
      const payload = serializeEngineMap();
      try {
        window.localStorage.setItem(STORAGE_PREVIEW_KEY, JSON.stringify(payload));
      } catch (storageError) {
        updateStatus('Could not save preview to localStorage: ' + storageError.message, true);
        return;
      }
      window.location.href = 'viewer.html';
    });

    dom.openViewerFromTabBtn.addEventListener('click', function () {
      dom.openViewerBtn.click();
    });

    dom.tabMapEditorBtn.addEventListener('click', function () {
      setActiveTab('mapEditor');
    });

    dom.tabViewerBtn.addEventListener('click', function () {
      setActiveTab('viewer');
    });

    dom.tabItemEditorBtn.addEventListener('click', function () {
      setActiveTab('itemEditor');
    });

    dom.tabTextureBuilderBtn.addEventListener('click', function () {
      setActiveTab('textureBuilder');
    });

    dom.itemCategorySelect.addEventListener('change', updateItemConditionalFields);
    dom.itemNewBtn.addEventListener('click', onNewItem);
    dom.itemSaveBtn.addEventListener('click', onSaveItem);
    dom.itemDeleteBtn.addEventListener('click', onDeleteItem);
    dom.itemExportBtn.addEventListener('click', exportItemsToFile);

    dom.itemImportInput.addEventListener('change', function (event) {
      if (!event.target.files || !event.target.files[0]) {
        return;
      }
      importItemsFromFile(event.target.files[0]);
      event.target.value = '';
    });

    dom.textureGridContainer.addEventListener('mousedown', function (event) {
      const cell = getTextureCellFromEventTarget(event.target);
      if (!cell) {
        return;
      }
      event.preventDefault();
      handleTexturePointerDown(cell);
    });

    dom.textureGridContainer.addEventListener('mouseover', function (event) {
      const cell = getTextureCellFromEventTarget(event.target);
      if (!cell) {
        return;
      }
      if (state.textureBuilder.isPainting && isTextureDragPaintTool(state.textureBuilder.activeTool)) {
        paintTextureCellFromElement(cell);
        return;
      }
      updateTexturePreviewForCell(cell);
    });

    dom.textureGridContainer.addEventListener('click', function (event) {
      const cell = getTextureCellFromEventTarget(event.target);
      if (!cell) {
        return;
      }
      if (!isTextureDragPaintTool(state.textureBuilder.activeTool)) {
        paintTextureCellFromElement(cell);
      }
    });

    dom.textureGridContainer.addEventListener('mouseleave', function () {
      clearTexturePreview();
    });

    dom.textureSizeSelect.addEventListener('change', function () {
      const nextSize = Number(dom.textureSizeSelect.value);
      if (TEXTURE_SIZES.indexOf(nextSize) === -1) {
        return;
      }
      pushTextureUndoState();
      state.textureBuilder.size = nextSize;
      resetTextureLayers(nextSize, false);
      if (!dom.textureFilenameInput.value.trim()) {
        dom.textureFilenameInput.value = 'texture_' + nextSize + 'x' + nextSize;
      }
      renderTextureGrid();
      renderTextureLayerList();
      updateTextureStatus('Texture grid reset to ' + nextSize + ' x ' + nextSize + '.');
    });

    dom.textureColorPicker.addEventListener('input', function () {
      state.textureBuilder.selectedColor = dom.textureColorPicker.value;
      const added = rememberTextureCustomColor(state.textureBuilder.selectedColor);
      if (added) {
        renderTexturePalette();
      }
      highlightActiveTexturePaletteButton();
      updateTextureStatus('Custom color selected: ' + dom.textureColorPicker.value);
    });

    dom.texturePaintToolBtn.addEventListener('click', function () {
      state.textureBuilder.activeTool = 'paint';
      updateTextureToolButtonState();
    });

    dom.textureFillToolBtn.addEventListener('click', function () {
      state.textureBuilder.activeTool = 'fill';
      clearTexturePreview();
      updateTextureToolButtonState();
    });

    dom.textureEraserBtn.addEventListener('click', function () {
      state.textureBuilder.activeTool = 'erase';
      clearTexturePreview();
      updateTextureToolButtonState();
      updateTextureStatus('Eraser selected.');
    });

    dom.textureHighlighterToolBtn.addEventListener('click', function () {
      state.textureBuilder.activeTool = 'highlighter';
      clearTexturePreview();
      updateTextureToolButtonState();
    });

    dom.textureEyedropperToolBtn.addEventListener('click', function () {
      state.textureBuilder.activeTool = 'eyedropper';
      clearTexturePreview();
      updateTextureToolButtonState();
    });

    dom.textureHBarToolBtn.addEventListener('click', function () {
      state.textureBuilder.activeTool = 'hbar';
      state.textureBuilder.shapeStart = null;
      updateTextureToolButtonState();
    });

    dom.textureVBarToolBtn.addEventListener('click', function () {
      state.textureBuilder.activeTool = 'vbar';
      state.textureBuilder.shapeStart = null;
      updateTextureToolButtonState();
    });

    dom.textureLineToolBtn.addEventListener('click', function () {
      state.textureBuilder.activeTool = 'line';
      state.textureBuilder.shapeStart = null;
      clearTexturePreview();
      updateTextureToolButtonState();
    });

    dom.textureBrushSizeSelect.addEventListener('change', function () {
      const next = Number(dom.textureBrushSizeSelect.value);
      state.textureBuilder.brushSize = Number.isInteger(next) ? Math.max(1, Math.min(5, next)) : 1;
    });

    dom.textureHighlighterOpacityInput.addEventListener('input', function () {
      const next = Number(dom.textureHighlighterOpacityInput.value);
      state.textureBuilder.highlighterOpacity = Number.isFinite(next) ? Math.max(0.05, Math.min(1, next)) : 0.35;
    });

    dom.textureBarLengthInput.addEventListener('change', function () {
      state.textureBuilder.barLength = clampInteger(dom.textureBarLengthInput.value, 1, 256, 8);
      dom.textureBarLengthInput.value = String(state.textureBuilder.barLength);
    });

    dom.textureBarThicknessInput.addEventListener('change', function () {
      state.textureBuilder.barThickness = clampInteger(dom.textureBarThicknessInput.value, 1, 32, 1);
      dom.textureBarThicknessInput.value = String(state.textureBuilder.barThickness);
    });

    dom.textureAddLayerBtn.addEventListener('click', function () {
      addTextureLayer();
    });

    dom.textureClearLayerBtn.addEventListener('click', function () {
      clearActiveTextureLayer();
    });

    dom.textureSaveToLibraryBtn.addEventListener('click', function () {
      saveCurrentTextureToLibrary();
    });

    dom.textureLibraryExportBtn.addEventListener('click', function () {
      exportCustomTextureLibraryToFile();
    });

    dom.textureLibraryImportInput.addEventListener('change', function (event) {
      if (!event.target.files || !event.target.files[0]) {
        return;
      }
      importCustomTextureLibraryFromFile(event.target.files[0]);
      event.target.value = '';
    });

    dom.textureLibraryList.addEventListener('click', function (event) {
      const button = event.target.closest('[data-library-action]');
      if (!button) {
        return;
      }
      const textureId = button.dataset.textureId;
      const action = button.dataset.libraryAction;
      if (action === 'delete') {
        deleteCustomTextureFromLibrary(textureId);
        return;
      }
      if (action === 'load') {
        loadCustomTextureIntoBuilder(textureId);
      }
    });

    dom.textureUndoBtn.addEventListener('click', function () {
      undoTextureAction();
    });

    dom.textureRedoBtn.addEventListener('click', function () {
      redoTextureAction();
    });

    dom.textureLayerList.addEventListener('click', onTextureLayerListClick);
    dom.textureLayerList.addEventListener('change', onTextureLayerListChange);

    document.addEventListener('keydown', function (event) {
      if (state.activeTab !== 'textureBuilder' && state.activeTab !== 'mapEditor') {
        return;
      }
      if (event.target && (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable)) {
        return;
      }
      const isMetaUndo = event.metaKey || event.ctrlKey;
      if (!isMetaUndo) {
        return;
      }
      const key = String(event.key || '').toLowerCase();
      if (key === 'z' && event.shiftKey) {
        event.preventDefault();
        if (state.activeTab === 'textureBuilder') {
          redoTextureAction();
        } else {
          redoMapAction();
        }
        return;
      }
      if (key === 'y') {
        event.preventDefault();
        if (state.activeTab === 'textureBuilder') {
          redoTextureAction();
        } else {
          redoMapAction();
        }
        return;
      }
      if (key === 'z') {
        event.preventDefault();
        if (state.activeTab === 'textureBuilder') {
          undoTextureAction();
        } else {
          undoMapAction();
        }
      }
    });

    dom.textureExportBtn.addEventListener('click', exportTextureToFile);
    dom.textureExportPngBtn.addEventListener('click', exportTexturePngToFile);
    dom.textureExportEngineEntryBtn.addEventListener('click', exportTextureEngineEntryToFile);
    dom.textureImportInput.addEventListener('change', function (event) {
      if (!event.target.files || !event.target.files[0]) {
        return;
      }
      importTextureFromFile(event.target.files[0]);
      event.target.value = '';
    });
    dom.textureFilenameInput.addEventListener('blur', function () {
      const fallback = 'texture_' + state.textureBuilder.size + 'x' + state.textureBuilder.size;
      const cleaned = sanitizeTextureFilename(dom.textureFilenameInput.value);
      dom.textureFilenameInput.value = cleaned || fallback;
    });
  }

  function initializeTextureBuilder() {
    dom.textureSizeSelect.value = String(state.textureBuilder.size);
    dom.textureColorPicker.value = state.textureBuilder.selectedColor || '#000000';
    dom.textureFilenameInput.value = 'texture_' + state.textureBuilder.size + 'x' + state.textureBuilder.size;
    dom.textureBrushSizeSelect.value = String(state.textureBuilder.brushSize);
    dom.textureHighlighterOpacityInput.value = String(state.textureBuilder.highlighterOpacity);
    dom.textureBarLengthInput.value = String(state.textureBuilder.barLength);
    dom.textureBarThicknessInput.value = String(state.textureBuilder.barThickness);
    state.textureBuilder.customColors = loadTextureCustomColorsFromStorage();
    resetTextureLayers(state.textureBuilder.size);
    renderTexturePalette();
    renderTextureGrid();
    renderTextureLayerList();
    updateTextureToolButtonState();
    updateTextureUndoRedoButtons();
    updateTextureStatus('Texture Builder ready.');
  }

  function createTextureLayer(name, size) {
    const nextId = 'layer_' + state.textureBuilder.nextLayerId;
    state.textureBuilder.nextLayerId += 1;
    return {
      id: nextId,
      name: name || ('Layer ' + state.textureBuilder.nextLayerId),
      visible: true,
      locked: false,
      opacity: 1,
      pixels: createLayerGrid(size, size, null)
    };
  }

  function resetTextureLayers(size, shouldResetHistory) {
    state.textureBuilder.layers = [createTextureLayer('Layer 1', size)];
    state.textureBuilder.activeLayerId = state.textureBuilder.layers[0].id;
    state.textureBuilder.shapeStart = null;
    clearTexturePreview();
    if (shouldResetHistory !== false) {
      state.textureBuilder.undoStack = [];
      state.textureBuilder.redoStack = [];
      state.textureBuilder.pendingStrokeSnapshot = null;
      state.textureBuilder.hasPendingStrokeChange = false;
    }
    updateTextureUndoRedoButtons();
  }

  function createTextureHistorySnapshot() {
    return {
      size: state.textureBuilder.size,
      layers: state.textureBuilder.layers.map(function (layer) {
        return {
          id: layer.id,
          name: layer.name,
          visible: layer.visible,
          locked: layer.locked,
          opacity: layer.opacity,
          pixels: cloneLayer(layer.pixels)
        };
      }),
      activeLayerId: state.textureBuilder.activeLayerId,
      nextLayerId: state.textureBuilder.nextLayerId,
      brushSize: state.textureBuilder.brushSize,
      highlighterOpacity: state.textureBuilder.highlighterOpacity,
      barLength: state.textureBuilder.barLength,
      barThickness: state.textureBuilder.barThickness
    };
  }

  function restoreTextureHistorySnapshot(snapshot) {
    state.textureBuilder.size = snapshot.size;
    dom.textureSizeSelect.value = String(snapshot.size);
    state.textureBuilder.layers = snapshot.layers.map(function (layer) {
      return {
        id: layer.id,
        name: layer.name,
        visible: layer.visible,
        locked: layer.locked,
        opacity: layer.opacity,
        pixels: cloneLayer(layer.pixels)
      };
    });
    state.textureBuilder.activeLayerId = snapshot.activeLayerId;
    state.textureBuilder.nextLayerId = snapshot.nextLayerId;
    state.textureBuilder.brushSize = snapshot.brushSize;
    state.textureBuilder.highlighterOpacity = snapshot.highlighterOpacity;
    state.textureBuilder.barLength = snapshot.barLength;
    state.textureBuilder.barThickness = snapshot.barThickness;
    dom.textureBrushSizeSelect.value = String(state.textureBuilder.brushSize);
    dom.textureHighlighterOpacityInput.value = String(state.textureBuilder.highlighterOpacity);
    dom.textureBarLengthInput.value = String(state.textureBuilder.barLength);
    dom.textureBarThicknessInput.value = String(state.textureBuilder.barThickness);
    state.textureBuilder.shapeStart = null;
    clearTexturePreview();
    renderTextureLayerList();
    renderTextureGrid();
  }

  function snapshotsEqualForTexture(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function pushTextureUndoState() {
    const snapshot = createTextureHistorySnapshot();
    const undoStack = state.textureBuilder.undoStack;
    const last = undoStack.length ? undoStack[undoStack.length - 1] : null;
    if (!last || !snapshotsEqualForTexture(last, snapshot)) {
      undoStack.push(snapshot);
      if (undoStack.length > TEXTURE_HISTORY_LIMIT) {
        undoStack.shift();
      }
    }
    state.textureBuilder.redoStack = [];
    updateTextureUndoRedoButtons();
  }

  function undoTextureAction() {
    if (!state.textureBuilder.undoStack.length) {
      return;
    }
    const current = createTextureHistorySnapshot();
    const previous = state.textureBuilder.undoStack.pop();
    state.textureBuilder.redoStack.push(current);
    if (state.textureBuilder.redoStack.length > TEXTURE_HISTORY_LIMIT) {
      state.textureBuilder.redoStack.shift();
    }
    restoreTextureHistorySnapshot(previous);
    updateTextureUndoRedoButtons();
    updateTextureStatus('Texture undo applied.');
  }

  function redoTextureAction() {
    if (!state.textureBuilder.redoStack.length) {
      return;
    }
    const current = createTextureHistorySnapshot();
    const next = state.textureBuilder.redoStack.pop();
    state.textureBuilder.undoStack.push(current);
    if (state.textureBuilder.undoStack.length > TEXTURE_HISTORY_LIMIT) {
      state.textureBuilder.undoStack.shift();
    }
    restoreTextureHistorySnapshot(next);
    updateTextureUndoRedoButtons();
    updateTextureStatus('Texture redo applied.');
  }

  function updateTextureUndoRedoButtons() {
    if (!dom.textureUndoBtn || !dom.textureRedoBtn) {
      return;
    }
    dom.textureUndoBtn.disabled = state.textureBuilder.undoStack.length === 0;
    dom.textureRedoBtn.disabled = state.textureBuilder.redoStack.length === 0;
  }

  function beginTextureStrokeHistoryIfNeeded() {
    if (state.textureBuilder.pendingStrokeSnapshot) {
      return;
    }
    state.textureBuilder.pendingStrokeSnapshot = createTextureHistorySnapshot();
    state.textureBuilder.hasPendingStrokeChange = false;
  }

  function markTextureStrokeChanged() {
    state.textureBuilder.hasPendingStrokeChange = true;
  }

  function finalizeTextureStrokeHistory() {
    if (!state.textureBuilder.pendingStrokeSnapshot) {
      return;
    }
    if (state.textureBuilder.hasPendingStrokeChange) {
      const prior = state.textureBuilder.pendingStrokeSnapshot;
      const current = createTextureHistorySnapshot();
      if (!snapshotsEqualForTexture(prior, current)) {
        state.textureBuilder.undoStack.push(prior);
        if (state.textureBuilder.undoStack.length > TEXTURE_HISTORY_LIMIT) {
          state.textureBuilder.undoStack.shift();
        }
        state.textureBuilder.redoStack = [];
      }
      updateTextureUndoRedoButtons();
    }
    state.textureBuilder.pendingStrokeSnapshot = null;
    state.textureBuilder.hasPendingStrokeChange = false;
  }

  function getActiveTextureLayer() {
    return state.textureBuilder.layers.find(function (layer) {
      return layer.id === state.textureBuilder.activeLayerId;
    }) || null;
  }

  function canEditActiveTextureLayer() {
    const layer = getActiveTextureLayer();
    if (!layer) {
      updateTextureStatus('No active texture layer selected.', true);
      return false;
    }
    if (!layer.visible) {
      updateTextureStatus('Active layer is hidden. Unhide to draw.', true);
      return false;
    }
    if (layer.locked) {
      updateTextureStatus('Active layer is locked. Unlock to draw.', true);
      return false;
    }
    return true;
  }

  function renderTexturePalette() {
    dom.texturePalette.innerHTML = '';

    TEXTURE_COLORS.forEach(function (color) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'texture-color-btn';
      button.dataset.color = color === null ? 'null' : color;
      if (color === null) {
        button.classList.add('texture-transparent');
        button.title = 'Transparent';
      } else {
        button.style.backgroundColor = color;
        button.title = color;
      }
      button.addEventListener('click', function () {
        state.textureBuilder.selectedColor = color;
        highlightActiveTexturePaletteButton();
      });
      dom.texturePalette.appendChild(button);
    });

    state.textureBuilder.customColors.forEach(function (color) {
      if (!isValidTextureHexColor(color)) {
        return;
      }
      if (TEXTURE_COLORS.indexOf(color) !== -1) {
        return;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'texture-color-btn';
      button.dataset.color = color;
      button.style.backgroundColor = color;
      button.title = color + ' (custom)';
      button.addEventListener('click', function () {
        state.textureBuilder.selectedColor = color;
        highlightActiveTexturePaletteButton();
      });
      dom.texturePalette.appendChild(button);
    });

    highlightActiveTexturePaletteButton();
  }

  function isValidTextureHexColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || ''));
  }

  function normalizeTextureCustomColor(value) {
    return String(value || '').trim().toLowerCase();
  }

  function loadTextureCustomColorsFromStorage() {
    try {
      const raw = window.localStorage.getItem(TEXTURE_CUSTOM_COLORS_STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      const seen = new Set();
      const normalized = [];
      parsed.forEach(function (entry) {
        const color = normalizeTextureCustomColor(entry);
        if (!isValidTextureHexColor(color)) {
          return;
        }
        if (seen.has(color)) {
          return;
        }
        seen.add(color);
        normalized.push(color);
      });
      return normalized.slice(0, TEXTURE_MAX_SAVED_CUSTOM_COLORS);
    } catch (error) {
      return [];
    }
  }

  function saveTextureCustomColorsToStorage(colors) {
    try {
      window.localStorage.setItem(TEXTURE_CUSTOM_COLORS_STORAGE_KEY, JSON.stringify(colors));
    } catch (error) {
      // Ignore storage failures and continue without persistence.
    }
  }

  function rememberTextureCustomColor(color) {
    const normalized = normalizeTextureCustomColor(color);
    if (!isValidTextureHexColor(normalized)) {
      return false;
    }

    const next = state.textureBuilder.customColors.filter(function (entry) {
      return entry !== normalized;
    });
    next.unshift(normalized);
    state.textureBuilder.customColors = next.slice(0, TEXTURE_MAX_SAVED_CUSTOM_COLORS);
    saveTextureCustomColorsToStorage(state.textureBuilder.customColors);
    return true;
  }

  function highlightActiveTexturePaletteButton() {
    const selected = state.textureBuilder.selectedColor;
    dom.texturePalette.querySelectorAll('.texture-color-btn').forEach(function (btn) {
      const btnColor = btn.dataset.color === 'null' ? null : btn.dataset.color;
      btn.classList.toggle('active', btnColor === selected);
    });
    if (selected !== null && dom.textureColorPicker) {
      dom.textureColorPicker.value = selected;
    }
    dom.textureSelectedColorLabel.textContent = selected === null ? 'Transparent' : selected;
  }

  function renderTextureGrid() {
    const size = state.textureBuilder.size;
    dom.textureGridContainer.innerHTML = '';
    dom.textureGridContainer.style.setProperty('--texture-grid-width', String(size));
    dom.textureGridContainer.style.setProperty('--texture-grid-height', String(size));

    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const cell = document.createElement('div');
        cell.className = 'texture-cell';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);
        applyTextureCellVisual(cell, getCompositeTexturePixel(row, col));
        dom.textureGridContainer.appendChild(cell);
      }
    }

    dom.textureSizeLabel.textContent = String(size);
    dom.textureSizeLabel2.textContent = String(size);
    applyTexturePreviewOverlay();
  }

  function applyTextureCellVisual(cell, color) {
    if (!color) {
      cell.classList.add('texture-empty');
      cell.style.backgroundColor = '';
      return;
    }
    cell.classList.remove('texture-empty');
    const alpha = Number.isFinite(color.alpha) ? color.alpha : 1;
    cell.style.backgroundColor = rgbaFromHex(color.color, alpha);
  }

  function getTextureCellFromEventTarget(target) {
    if (!target || !target.closest) {
      return null;
    }
    return target.closest('.texture-cell');
  }

  function paintTextureCellFromElement(cell) {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (!Number.isInteger(row) || !Number.isInteger(col)) {
      return;
    }

    if (state.textureBuilder.activeTool === 'eyedropper') {
      // Eyedropper samples the composited visible result across all visible layers,
      // not only the active layer, so it matches what users currently see.
      const sampled = sampleCompositeTextureColor(row, col);
      if (!sampled) {
        updateTextureStatus('Eyedropper found transparent pixel.');
        return;
      }
      state.textureBuilder.selectedColor = sampled;
      const added = rememberTextureCustomColor(sampled);
      if (added) {
        renderTexturePalette();
      }
      highlightActiveTexturePaletteButton();
      updateTextureStatus('Eyedropper selected color: ' + sampled);
      return;
    }

    if (!canEditActiveTextureLayer()) {
      return;
    }

    const activeLayer = getActiveTextureLayer();
    if (!activeLayer) {
      return;
    }

    if (state.textureBuilder.activeTool === 'fill') {
      pushTextureUndoState();
      applyTextureFillAt(activeLayer, row, col, state.textureBuilder.selectedColor);
      renderTextureGrid();
      updateTextureStatus('Texture fill applied from (' + col + ', ' + row + ').');
      return;
    }

    if (state.textureBuilder.activeTool === 'hbar' || state.textureBuilder.activeTool === 'vbar') {
      pushTextureUndoState();
      const barPoints = getBarToolPoints(row, col, state.textureBuilder.activeTool);
      applyTextureStrokeToLayer(activeLayer, barPoints, getTextureToolPixelValue(), false);
      renderTextureGrid();
      return;
    }

    if (state.textureBuilder.activeTool === 'line') {
      if (!state.textureBuilder.shapeStart) {
        state.textureBuilder.shapeStart = { row: row, col: col };
        updateTextureStatus('Line start set. Click end point to commit line.');
        return;
      }
      pushTextureUndoState();
      const linePoints = getLineToolPoints(state.textureBuilder.shapeStart.row, state.textureBuilder.shapeStart.col, row, col, state.textureBuilder.barThickness);
      applyTextureStrokeToLayer(activeLayer, linePoints, getTextureToolPixelValue(), false);
      state.textureBuilder.shapeStart = null;
      clearTexturePreview();
      renderTextureGrid();
      updateTextureStatus('Line committed.');
      return;
    }

    const currentKey = row + ',' + col;
    if (state.textureBuilder.lastPaintedCellKey === currentKey && state.textureBuilder.isPainting) {
      return;
    }
    state.textureBuilder.lastPaintedCellKey = currentKey;

    const brushPoints = getBrushPoints(row, col, state.textureBuilder.brushSize);
    applyTextureStrokeToLayer(activeLayer, brushPoints, getTextureToolPixelValue(), true);
    markTextureStrokeChanged();
    renderTextureGrid();
  }

  function getTextureToolPixelValue() {
    if (state.textureBuilder.activeTool === 'erase') {
      return null;
    }
    if (state.textureBuilder.activeTool === 'highlighter') {
      return {
        color: state.textureBuilder.selectedColor,
        alpha: state.textureBuilder.highlighterOpacity
      };
    }
    return {
      color: state.textureBuilder.selectedColor,
      alpha: 1
    };
  }

  function normalizeTexturePixel(value) {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'string') {
      return isValidTextureHexColor(value) ? { color: value, alpha: 1 } : null;
    }
    if (typeof value === 'object' && isValidTextureHexColor(value.color)) {
      const alpha = Number(value.alpha);
      return {
        color: value.color.toLowerCase(),
        alpha: Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1
      };
    }
    return null;
  }

  function applyTextureFillAt(layer, startRow, startCol, color) {
    const pixels = layer.pixels;
    const size = state.textureBuilder.size;
    const targetColor = normalizeTexturePixel(pixels[startRow][startCol]);
    const replacementColor = normalizeTexturePixel(color);
    if (texturePixelsEqual(targetColor, replacementColor)) {
      return;
    }

    const queue = [[startRow, startCol]];
    const visited = new Set();

    while (queue.length > 0) {
      const current = queue.shift();
      const row = current[0];
      const col = current[1];
      const key = row + ',' + col;

      if (visited.has(key)) {
        continue;
      }
      visited.add(key);

      if (row < 0 || row >= size || col < 0 || col >= size || !texturePixelsEqual(normalizeTexturePixel(pixels[row][col]), targetColor)) {
        continue;
      }

      pixels[row][col] = replacementColor;
      queue.push([row - 1, col]);
      queue.push([row + 1, col]);
      queue.push([row, col - 1]);
      queue.push([row, col + 1]);
    }
  }

  function updateTextureToolButtonState() {
    dom.texturePaintToolBtn.classList.toggle('active', state.textureBuilder.activeTool === 'paint');
    dom.textureFillToolBtn.classList.toggle('active', state.textureBuilder.activeTool === 'fill');
    dom.textureEraserBtn.classList.toggle('active', state.textureBuilder.activeTool === 'erase');
    dom.textureHighlighterToolBtn.classList.toggle('active', state.textureBuilder.activeTool === 'highlighter');
    dom.textureEyedropperToolBtn.classList.toggle('active', state.textureBuilder.activeTool === 'eyedropper');
    dom.textureHBarToolBtn.classList.toggle('active', state.textureBuilder.activeTool === 'hbar');
    dom.textureVBarToolBtn.classList.toggle('active', state.textureBuilder.activeTool === 'vbar');
    dom.textureLineToolBtn.classList.toggle('active', state.textureBuilder.activeTool === 'line');
    dom.textureActiveToolLabel.textContent = state.textureBuilder.activeTool;
  }

  function exportTextureToFile() {
    const payload = {
      type: 'texture_project',
      version: 2,
      size: state.textureBuilder.size,
      layers: state.textureBuilder.layers.map(function (layer) {
        return {
          id: layer.id,
          name: layer.name,
          visible: layer.visible,
          locked: layer.locked,
          opacity: layer.opacity,
          pixels: cloneLayer(layer.pixels)
        };
      }),
      activeLayerId: state.textureBuilder.activeLayerId,
      pixels: getFlattenedTextureHexGrid()
    };
    const baseFilename = getTextureExportBaseFilename();
    downloadJsonFile(payload, baseFilename + '.json');
    updateTextureStatus('Texture JSON exported.');
  }

  function sanitizeTextureFilename(inputValue) {
    return String(inputValue || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_\-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function getTextureExportBaseFilename() {
    const fallback = 'texture_' + state.textureBuilder.size + 'x' + state.textureBuilder.size;
    const cleaned = sanitizeTextureFilename(dom.textureFilenameInput.value);
    const filename = cleaned || fallback;
    dom.textureFilenameInput.value = filename;
    return filename;
  }

  function downloadBlobFile(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  }

  function exportTexturePngToFile() {
    const size = state.textureBuilder.size;
    const baseFilename = getTextureExportBaseFilename();
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      updateTextureStatus('Texture PNG export failed (canvas unavailable).', true);
      return;
    }

    ctx.clearRect(0, 0, size, size);
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const color = getCompositeTexturePixel(row, col);
        if (color === null) {
          continue;
        }
        ctx.fillStyle = rgbaFromHex(color.color, color.alpha);
        ctx.fillRect(col, row, 1, 1);
      }
    }

    canvas.toBlob(function (blob) {
      if (!blob) {
        updateTextureStatus('Texture PNG export failed (blob creation failed).', true);
        return;
      }
      downloadBlobFile(blob, baseFilename + '.png');
      updateTextureStatus('Texture PNG exported.');
    }, 'image/png');
  }

  function exportTextureEngineEntryToFile() {
    const baseFilename = getTextureExportBaseFilename();
    const payload = {
      key: baseFilename,
      path: 'assets/textures/starter/' + baseFilename + '.png'
    };
    downloadJsonFile(payload, baseFilename + '_entry.json');
    updateTextureStatus('Engine texture entry exported.');
  }

  function updateTextureStatus(text, isError) {
    dom.textureMessage.textContent = text;
    dom.textureMessage.style.color = isError ? '#b42318' : '#42556f';
  }

  function clampInteger(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, parsed));
  }

  function texturePixelsEqual(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.color === b.color && Math.abs(a.alpha - b.alpha) < 0.0001;
  }

  function rgbaFromHex(hex, alpha) {
    const value = String(hex || '#000000').replace('#', '');
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }

  function blendTexturePixels(base, top) {
    if (!top) {
      return base;
    }
    if (!base) {
      return { color: top.color, alpha: top.alpha };
    }
    const alpha = top.alpha + base.alpha * (1 - top.alpha);
    if (alpha <= 0) {
      return null;
    }
    function rgb(color) {
      return {
        r: parseInt(color.slice(1, 3), 16),
        g: parseInt(color.slice(3, 5), 16),
        b: parseInt(color.slice(5, 7), 16)
      };
    }
    const b1 = rgb(base.color);
    const t1 = rgb(top.color);
    const r = Math.round((t1.r * top.alpha + b1.r * base.alpha * (1 - top.alpha)) / alpha);
    const g = Math.round((t1.g * top.alpha + b1.g * base.alpha * (1 - top.alpha)) / alpha);
    const b = Math.round((t1.b * top.alpha + b1.b * base.alpha * (1 - top.alpha)) / alpha);
    const hex = '#' + [r, g, b].map(function (n) { return n.toString(16).padStart(2, '0'); }).join('');
    return { color: hex, alpha: alpha };
  }

  function getCompositeTexturePixel(row, col) {
    let composite = null;
    state.textureBuilder.layers.forEach(function (layer) {
      if (!layer.visible) {
        return;
      }
      const pixel = normalizeTexturePixel(layer.pixels[row][col]);
      if (!pixel) {
        return;
      }
      const withLayerOpacity = {
        color: pixel.color,
        alpha: Math.max(0, Math.min(1, pixel.alpha * layer.opacity))
      };
      composite = blendTexturePixels(composite, withLayerOpacity);
    });
    return composite;
  }

  function sampleCompositeTextureColor(row, col) {
    const pixel = getCompositeTexturePixel(row, col);
    return pixel ? pixel.color : null;
  }

  function getFlattenedTextureHexGrid() {
    const size = state.textureBuilder.size;
    const out = createLayerGrid(size, size, null);
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const composite = getCompositeTexturePixel(row, col);
        out[row][col] = composite ? composite.color : null;
      }
    }
    return out;
  }

  function getBrushPoints(centerRow, centerCol, brushSize) {
    const points = [];
    const startOffset = Math.floor(brushSize / 2);
    for (let row = centerRow - startOffset; row < centerRow - startOffset + brushSize; row += 1) {
      for (let col = centerCol - startOffset; col < centerCol - startOffset + brushSize; col += 1) {
        if (row < 0 || row >= state.textureBuilder.size || col < 0 || col >= state.textureBuilder.size) {
          continue;
        }
        points.push([row, col]);
      }
    }
    return points;
  }

  function applyTextureStrokeToLayer(layer, points, pixelValue, isBrush) {
    const normalized = normalizeTexturePixel(pixelValue);
    points.forEach(function (point) {
      const row = point[0];
      const col = point[1];
      if (pixelValue === null) {
        layer.pixels[row][col] = null;
        return;
      }
      if (state.textureBuilder.activeTool === 'highlighter' && normalized) {
        const existing = normalizeTexturePixel(layer.pixels[row][col]);
        if (existing && existing.color === normalized.color) {
          layer.pixels[row][col] = {
            color: normalized.color,
            alpha: Math.max(existing.alpha, normalized.alpha)
          };
          return;
        }
      }
      layer.pixels[row][col] = normalized;
    });
    if (!isBrush) {
      state.textureBuilder.lastPaintedCellKey = '';
    }
  }

  function getBarToolPoints(row, col, tool) {
    const length = clampInteger(state.textureBuilder.barLength, 1, 256, 8);
    const thickness = clampInteger(state.textureBuilder.barThickness, 1, 32, 1);
    const points = [];
    for (let t = 0; t < thickness; t += 1) {
      for (let i = 0; i < length; i += 1) {
        const nextRow = tool === 'hbar' ? row + t : row + i;
        const nextCol = tool === 'hbar' ? col + i : col + t;
        if (nextRow < 0 || nextRow >= state.textureBuilder.size || nextCol < 0 || nextCol >= state.textureBuilder.size) {
          continue;
        }
        points.push([nextRow, nextCol]);
      }
    }
    return points;
  }

  function getLineToolPoints(startRow, startCol, endRow, endCol, thickness) {
    const points = [];
    const dr = Math.abs(endRow - startRow);
    const dc = Math.abs(endCol - startCol);
    const stepR = startRow < endRow ? 1 : -1;
    const stepC = startCol < endCol ? 1 : -1;
    let err = dc - dr;
    let row = startRow;
    let col = startCol;
    const brushSize = Math.max(1, thickness);
    while (true) {
      getBrushPoints(row, col, brushSize).forEach(function (point) {
        points.push(point);
      });
      if (row === endRow && col === endCol) {
        break;
      }
      const e2 = err * 2;
      if (e2 > -dr) {
        err -= dr;
        col += stepC;
      }
      if (e2 < dc) {
        err += dc;
        row += stepR;
      }
    }
    return points;
  }

  function isTextureDragPaintTool(tool) {
    return tool === 'paint' || tool === 'erase' || tool === 'highlighter';
  }

  function handleTexturePointerDown(cell) {
    state.textureBuilder.lastPaintedCellKey = '';
    if (isTextureDragPaintTool(state.textureBuilder.activeTool)) {
      if (canEditActiveTextureLayer()) {
        beginTextureStrokeHistoryIfNeeded();
      }
      state.textureBuilder.isPainting = true;
    }
    paintTextureCellFromElement(cell);
  }

  function clearTexturePreview() {
    state.textureBuilder.previewCells = [];
    applyTexturePreviewOverlay();
  }

  function applyTexturePreviewOverlay() {
    const previewMap = {};
    state.textureBuilder.previewCells.forEach(function (entry) {
      previewMap[entry[0] + ',' + entry[1]] = true;
    });
    dom.textureGridContainer.querySelectorAll('.texture-cell').forEach(function (cell) {
      const key = cell.dataset.row + ',' + cell.dataset.col;
      cell.classList.toggle('texture-preview', Boolean(previewMap[key]));
    });
  }

  function updateTexturePreviewForCell(cell) {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (!Number.isInteger(row) || !Number.isInteger(col)) {
      return;
    }

    if (state.textureBuilder.activeTool === 'line' && state.textureBuilder.shapeStart) {
      state.textureBuilder.previewCells = getLineToolPoints(
        state.textureBuilder.shapeStart.row,
        state.textureBuilder.shapeStart.col,
        row,
        col,
        state.textureBuilder.barThickness
      );
      applyTexturePreviewOverlay();
      return;
    }

    if (state.textureBuilder.activeTool === 'hbar' || state.textureBuilder.activeTool === 'vbar') {
      state.textureBuilder.previewCells = getBarToolPoints(row, col, state.textureBuilder.activeTool);
      applyTexturePreviewOverlay();
      return;
    }

    if (isTextureDragPaintTool(state.textureBuilder.activeTool)) {
      state.textureBuilder.previewCells = getBrushPoints(row, col, state.textureBuilder.brushSize);
      applyTexturePreviewOverlay();
      return;
    }

    clearTexturePreview();
  }

  function renderTextureLayerList() {
    dom.textureLayerList.innerHTML = '';
    state.textureBuilder.layers.forEach(function (layer, index) {
      const row = document.createElement('div');
      row.className = 'texture-layer-row';
      row.classList.toggle('active', layer.id === state.textureBuilder.activeLayerId);
      row.dataset.layerId = layer.id;
      row.innerHTML = '<div class=\"texture-layer-top\">' +
        '<button type=\"button\" class=\"secondary-btn\" data-layer-action=\"activate\" data-layer-id=\"' + layer.id + '\">Active</button>' +
        '<input class=\"text-input\" data-layer-field=\"name\" data-layer-id=\"' + layer.id + '\" value=\"' + escapeHtml(layer.name) + '\" />' +
        '</div>' +
        '<div class=\"texture-layer-controls\">' +
        '<label><input type=\"checkbox\" data-layer-field=\"visible\" data-layer-id=\"' + layer.id + '\" ' + (layer.visible ? 'checked' : '') + ' /> Visible</label>' +
        '<label><input type=\"checkbox\" data-layer-field=\"locked\" data-layer-id=\"' + layer.id + '\" ' + (layer.locked ? 'checked' : '') + ' /> Locked</label>' +
        '<label>Opacity <input type=\"range\" min=\"0\" max=\"1\" step=\"0.05\" data-layer-field=\"opacity\" data-layer-id=\"' + layer.id + '\" value=\"' + layer.opacity + '\" /></label>' +
        '<div>' +
        '<button type=\"button\" class=\"secondary-btn\" data-layer-action=\"up\" data-layer-id=\"' + layer.id + '\" ' + (index === state.textureBuilder.layers.length - 1 ? 'disabled' : '') + '>Up</button> ' +
        '<button type=\"button\" class=\"secondary-btn\" data-layer-action=\"down\" data-layer-id=\"' + layer.id + '\" ' + (index === 0 ? 'disabled' : '') + '>Down</button> ' +
        '<button type=\"button\" class=\"danger-btn\" data-layer-action=\"delete\" data-layer-id=\"' + layer.id + '\" ' + (state.textureBuilder.layers.length <= 1 ? 'disabled' : '') + '>Delete</button>' +
        '</div>' +
        '</div>';
      dom.textureLayerList.appendChild(row);
    });
  }

  function addTextureLayer() {
    pushTextureUndoState();
    const layer = createTextureLayer('Layer ' + (state.textureBuilder.layers.length + 1), state.textureBuilder.size);
    state.textureBuilder.layers.push(layer);
    state.textureBuilder.activeLayerId = layer.id;
    renderTextureLayerList();
    renderTextureGrid();
    updateTextureStatus('Texture layer added.');
  }

  function clearActiveTextureLayer() {
    if (!canEditActiveTextureLayer()) {
      return;
    }
    const layer = getActiveTextureLayer();
    if (!layer) {
      return;
    }
    if (!window.confirm('Clear all pixels on active layer?')) {
      return;
    }
    pushTextureUndoState();
    layer.pixels = createLayerGrid(state.textureBuilder.size, state.textureBuilder.size, null);
    renderTextureGrid();
    updateTextureStatus('Active layer cleared.');
  }

  function onTextureLayerListClick(event) {
    const button = event.target.closest('[data-layer-action]');
    if (!button) {
      return;
    }
    const layerId = button.dataset.layerId;
    const action = button.dataset.layerAction;
    const index = state.textureBuilder.layers.findIndex(function (layer) {
      return layer.id === layerId;
    });
    if (index === -1) {
      return;
    }

    if (action === 'activate') {
      state.textureBuilder.activeLayerId = layerId;
    } else if (action === 'up' && index < state.textureBuilder.layers.length - 1) {
      pushTextureUndoState();
      const temp = state.textureBuilder.layers[index + 1];
      state.textureBuilder.layers[index + 1] = state.textureBuilder.layers[index];
      state.textureBuilder.layers[index] = temp;
    } else if (action === 'down' && index > 0) {
      pushTextureUndoState();
      const swap = state.textureBuilder.layers[index - 1];
      state.textureBuilder.layers[index - 1] = state.textureBuilder.layers[index];
      state.textureBuilder.layers[index] = swap;
    } else if (action === 'delete' && state.textureBuilder.layers.length > 1) {
      pushTextureUndoState();
      state.textureBuilder.layers.splice(index, 1);
      if (state.textureBuilder.activeLayerId === layerId) {
        state.textureBuilder.activeLayerId = state.textureBuilder.layers[Math.max(0, index - 1)].id;
      }
    }

    renderTextureLayerList();
    renderTextureGrid();
  }

  function onTextureLayerListChange(event) {
    const input = event.target;
    const layerId = input.dataset.layerId;
    const field = input.dataset.layerField;
    if (!layerId || !field) {
      return;
    }
    const layer = state.textureBuilder.layers.find(function (entry) {
      return entry.id === layerId;
    });
    if (!layer) {
      return;
    }

    if (field === 'name') {
      pushTextureUndoState();
      layer.name = String(input.value || '').trim() || 'Layer';
    } else if (field === 'visible') {
      pushTextureUndoState();
      layer.visible = Boolean(input.checked);
    } else if (field === 'locked') {
      pushTextureUndoState();
      layer.locked = Boolean(input.checked);
    } else if (field === 'opacity') {
      pushTextureUndoState();
      const nextOpacity = Number(input.value);
      layer.opacity = Number.isFinite(nextOpacity) ? Math.max(0, Math.min(1, nextOpacity)) : 1;
    }

    renderTextureLayerList();
    renderTextureGrid();
  }

  function importTextureFromFile(file) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const parsed = JSON.parse(String(reader.result));
        pushTextureUndoState();
        applyImportedTexturePayload(parsed);
        updateTextureStatus('Texture imported successfully.');
      } catch (error) {
        updateTextureStatus('Texture import failed: ' + error.message, true);
      }
    };
    reader.onerror = function () {
      updateTextureStatus('Texture import failed: unable to read file.', true);
    };
    reader.readAsText(file);
  }

  function applyImportedTexturePayload(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Texture JSON must be an object.');
    }
    const size = Number(payload.size);
    if (TEXTURE_SIZES.indexOf(size) === -1) {
      throw new Error('Texture size must be one of: ' + TEXTURE_SIZES.join(', '));
    }

    state.textureBuilder.size = size;
    dom.textureSizeSelect.value = String(size);

    if (Array.isArray(payload.layers)) {
      const nextLayers = payload.layers.map(function (layer, index) {
        const name = String(layer && layer.name ? layer.name : ('Layer ' + (index + 1)));
        const pixels = Array.isArray(layer && layer.pixels) ? layer.pixels : [];
        if (pixels.length !== size) {
          throw new Error('Imported layer pixel rows must match selected size.');
        }
        const normalizedPixels = pixels.map(function (row) {
          if (!Array.isArray(row) || row.length !== size) {
            throw new Error('Imported layer pixel columns must match selected size.');
          }
          return row.map(function (entry) {
            return normalizeTexturePixel(entry);
          });
        });
        const created = createTextureLayer(name, size);
        created.pixels = normalizedPixels;
        created.visible = layer.visible !== false;
        created.locked = Boolean(layer.locked);
        created.opacity = Number.isFinite(Number(layer.opacity)) ? Math.max(0, Math.min(1, Number(layer.opacity))) : 1;
        return created;
      });
      if (!nextLayers.length) {
        throw new Error('Imported texture must include at least one layer.');
      }
      state.textureBuilder.layers = nextLayers;
      state.textureBuilder.activeLayerId = nextLayers[0].id;
    } else if (Array.isArray(payload.pixels)) {
      const normalizedPixels = payload.pixels.map(function (row) {
        if (!Array.isArray(row) || row.length !== size) {
          throw new Error('Imported legacy pixels must match selected size.');
        }
        return row.map(function (entry) {
          return normalizeTexturePixel(entry);
        });
      });
      if (normalizedPixels.length !== size) {
        throw new Error('Imported legacy pixels must match selected size.');
      }
      resetTextureLayers(size, false);
      state.textureBuilder.layers[0].pixels = normalizedPixels;
    } else {
      throw new Error('Unsupported texture JSON format.');
    }

    renderTextureLayerList();
    renderTextureGrid();
  }

  function generateCustomTextureId(name) {
    const base = normalizeCustomTextureId(name || dom.textureFilenameInput.value || 'texture');
    if (!state.customTextureLibrary.textures.some(function (entry) { return entry.id === base; })) {
      return base;
    }
    let index = 2;
    let candidate = base + '_' + index;
    while (state.customTextureLibrary.textures.some(function (entry) { return entry.id === candidate; })) {
      index += 1;
      candidate = base + '_' + index;
    }
    return candidate;
  }

  function saveCurrentTextureToLibrary() {
    const baseName = dom.textureFilenameInput.value.trim() || ('texture_' + state.textureBuilder.size + 'x' + state.textureBuilder.size);
    const baseId = normalizeCustomTextureId(baseName);
    const existing = state.customTextureLibrary.textures.find(function (entry) {
      return entry.id === baseId;
    });
    let id = baseId;
    let createdAt = new Date().toISOString();

    if (existing) {
      const shouldReplace = window.confirm('A custom texture with ID "' + baseId + '" exists. Replace it?');
      if (!shouldReplace) {
        id = generateCustomTextureId(baseName);
      } else {
        createdAt = existing.createdAt;
      }
    }

    const now = new Date().toISOString();
    const flattened = getFlattenedTexturePixelGrid();
    const textureEntry = {
      id: id,
      name: baseName,
      size: state.textureBuilder.size,
      pixels: flattened,
      createdAt: createdAt,
      updatedAt: now,
      previewColor: buildCustomTexturePreviewData(flattened)
    };

    const withoutId = state.customTextureLibrary.textures.filter(function (entry) {
      return entry.id !== id;
    });
    withoutId.unshift(textureEntry);
    state.customTextureLibrary.textures = withoutId;
    saveCustomTextureLibraryToStorage(state.customTextureLibrary);
    syncCustomTextureDefinitionsFromLibrary();
    renderCustomTextureLibraryList();
    renderPalette();
    renderLegend();
    updateTextureStatus('Saved custom texture to library: ' + id);
  }

  function getFlattenedTexturePixelGrid() {
    const size = state.textureBuilder.size;
    const out = createLayerGrid(size, size, null);
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        out[row][col] = normalizeTexturePixel(getCompositeTexturePixel(row, col));
      }
    }
    return out;
  }

  function renderCustomTextureLibraryList() {
    dom.textureLibraryList.innerHTML = '';
    if (!state.customTextureLibrary.textures.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No custom textures saved yet.';
      dom.textureLibraryList.appendChild(empty);
      return;
    }

    state.customTextureLibrary.textures.forEach(function (texture) {
      const row = document.createElement('div');
      row.className = 'item-list-entry';
      row.innerHTML = '<strong>' + escapeHtml(texture.name) + '</strong>' +
        '<small>' + escapeHtml(texture.id) + ' • ' + texture.size + 'x' + texture.size + '</small>' +
        '<small><span style=\"display:inline-block;width:12px;height:12px;border:1px solid #94a3b8;vertical-align:middle;background:' + escapeHtml(texture.previewColor || '#9ca3af') + ';\"></span> Preview</small>' +
        '<div class=\"item-editor-actions\">' +
        '<button type=\"button\" class=\"secondary-btn\" data-library-action=\"load\" data-texture-id=\"' + escapeHtml(texture.id) + '\">Load into Editor</button>' +
        '<button type=\"button\" class=\"danger-btn\" data-library-action=\"delete\" data-texture-id=\"' + escapeHtml(texture.id) + '\">Delete</button>' +
        '</div>';
      dom.textureLibraryList.appendChild(row);
    });
  }

  function deleteCustomTextureFromLibrary(textureId) {
    const target = state.customTextureLibrary.textures.find(function (entry) {
      return entry.id === textureId;
    });
    if (!target) {
      return;
    }
    if (!window.confirm('Delete custom texture "' + target.name + '"?')) {
      return;
    }
    state.customTextureLibrary.textures = state.customTextureLibrary.textures.filter(function (entry) {
      return entry.id !== textureId;
    });
    saveCustomTextureLibraryToStorage(state.customTextureLibrary);
    syncCustomTextureDefinitionsFromLibrary();
    renderCustomTextureLibraryList();
    renderPalette();
    renderLegend();
    updateTextureStatus('Deleted custom texture: ' + textureId);
  }

  function loadCustomTextureIntoBuilder(textureId) {
    const texture = state.customTextureLibrary.textures.find(function (entry) {
      return entry.id === textureId;
    });
    if (!texture) {
      updateTextureStatus('Custom texture not found in library.', true);
      return;
    }
    state.textureBuilder.size = texture.size;
    dom.textureSizeSelect.value = String(texture.size);
    resetTextureLayers(texture.size, false);
    state.textureBuilder.layers[0].pixels = texture.pixels.map(function (row) {
      return row.map(function (pixel) {
        return normalizeTexturePixel(pixel);
      });
    });
    dom.textureFilenameInput.value = sanitizeTextureFilename(texture.name) || texture.id;
    renderTextureLayerList();
    renderTextureGrid();
    updateTextureStatus('Loaded custom texture into editor: ' + texture.id);
  }

  function exportCustomTextureLibraryToFile() {
    const payload = {
      version: 1,
      textures: state.customTextureLibrary.textures
    };
    downloadJsonFile(payload, 'custom_texture_library.json');
    updateTextureStatus('Custom texture library exported.');
  }

  function importCustomTextureLibraryFromFile(file) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const parsed = JSON.parse(String(reader.result));
        if (parsed && parsed.version !== undefined && parsed.version !== 1) {
          throw new Error('Unsupported custom texture library version.');
        }
        const incoming = normalizeCustomTextureLibraryPayload(parsed);
        const existingIds = new Set(state.customTextureLibrary.textures.map(function (entry) {
          return entry.id;
        }));
        const merged = state.customTextureLibrary.textures.slice();
        incoming.textures.forEach(function (entry) {
          let next = entry;
          if (existingIds.has(next.id)) {
            const renamedId = generateCustomTextureId(next.id);
            next = {
              id: renamedId,
              name: next.name + ' (Imported)',
              size: next.size,
              pixels: next.pixels,
              createdAt: next.createdAt,
              updatedAt: new Date().toISOString(),
              previewColor: next.previewColor
            };
          }
          existingIds.add(next.id);
          merged.unshift(next);
        });
        state.customTextureLibrary.textures = merged;
        saveCustomTextureLibraryToStorage(state.customTextureLibrary);
        syncCustomTextureDefinitionsFromLibrary();
        renderCustomTextureLibraryList();
        renderPalette();
        renderLegend();
        updateTextureStatus('Custom texture library imported.');
      } catch (error) {
        updateTextureStatus('Custom texture library import failed: ' + error.message, true);
      }
    };
    reader.onerror = function () {
      updateTextureStatus('Custom texture library import failed: unable to read file.', true);
    };
    reader.readAsText(file);
  }

  function createMapHistorySnapshot() {
    return {
      width: state.width,
      height: state.height,
      mapType: state.mapType,
      mapId: state.mapId,
      mapName: state.mapName,
      tileLayer: cloneLayer(state.tileLayer),
      objectLayer: cloneLayer(state.objectLayer),
      activeLayer: state.activeLayer,
      selectedByLayer: {
        tile: state.selectedByLayer.tile,
        object: state.selectedByLayer.object
      },
      activeTool: state.activeTool,
      mapBrushSize: state.mapBrushSize,
      mapBarLength: state.mapBarLength,
      mapBarThickness: state.mapBarThickness
    };
  }

  function restoreMapHistorySnapshot(snapshot) {
    state.width = snapshot.width;
    state.height = snapshot.height;
    state.mapType = snapshot.mapType;
    state.mapId = snapshot.mapId;
    state.mapName = snapshot.mapName;
    state.tileLayer = cloneLayer(snapshot.tileLayer);
    state.objectLayer = cloneLayer(snapshot.objectLayer);
    state.activeLayer = snapshot.activeLayer;
    state.selectedByLayer.tile = snapshot.selectedByLayer.tile;
    state.selectedByLayer.object = snapshot.selectedByLayer.object;
    state.activeTool = snapshot.activeTool;
    state.mapBrushSize = snapshot.mapBrushSize;
    state.mapBarLength = snapshot.mapBarLength;
    state.mapBarThickness = snapshot.mapBarThickness;
    state.mapShapeStart = null;

    dom.mapBrushSizeSelect.value = String(state.mapBrushSize);
    dom.mapBarLengthInput.value = String(state.mapBarLength);
    dom.mapBarThicknessInput.value = String(state.mapBarThickness);

    syncMapInputsFromState();
    updateMapLabels();
    renderPalette();
    renderLegend();
    ensureSelectedVisible();
    updateActiveLayerButtons();
    updateActiveToolButtonState();
    renderGrid();
  }

  function snapshotsEqualForMap(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function pushMapUndoState() {
    const snapshot = createMapHistorySnapshot();
    const undoStack = state.mapUndoStack;
    const last = undoStack.length ? undoStack[undoStack.length - 1] : null;
    if (!last || !snapshotsEqualForMap(last, snapshot)) {
      undoStack.push(snapshot);
      if (undoStack.length > MAP_HISTORY_LIMIT) {
        undoStack.shift();
      }
    }
    state.mapRedoStack = [];
    updateMapUndoRedoButtons();
  }

  function undoMapAction() {
    if (!state.mapUndoStack.length) {
      return;
    }
    const current = createMapHistorySnapshot();
    const previous = state.mapUndoStack.pop();
    state.mapRedoStack.push(current);
    if (state.mapRedoStack.length > MAP_HISTORY_LIMIT) {
      state.mapRedoStack.shift();
    }
    restoreMapHistorySnapshot(previous);
    updateMapUndoRedoButtons();
    updateStatus('Map undo applied.');
  }

  function redoMapAction() {
    if (!state.mapRedoStack.length) {
      return;
    }
    const current = createMapHistorySnapshot();
    const next = state.mapRedoStack.pop();
    state.mapUndoStack.push(current);
    if (state.mapUndoStack.length > MAP_HISTORY_LIMIT) {
      state.mapUndoStack.shift();
    }
    restoreMapHistorySnapshot(next);
    updateMapUndoRedoButtons();
    updateStatus('Map redo applied.');
  }

  function updateMapUndoRedoButtons() {
    if (!dom.mapUndoBtn || !dom.mapRedoBtn) {
      return;
    }
    dom.mapUndoBtn.disabled = state.mapUndoStack.length === 0;
    dom.mapRedoBtn.disabled = state.mapRedoStack.length === 0;
  }

  function beginMapStrokeHistoryIfNeeded() {
    if (state.mapPendingStrokeSnapshot) {
      return;
    }
    state.mapPendingStrokeSnapshot = createMapHistorySnapshot();
    state.mapHasPendingStrokeChange = false;
  }

  function markMapStrokeChanged() {
    state.mapHasPendingStrokeChange = true;
  }

  function finalizeMapStrokeHistory() {
    if (!state.mapPendingStrokeSnapshot) {
      return;
    }
    if (state.mapHasPendingStrokeChange) {
      const prior = state.mapPendingStrokeSnapshot;
      const current = createMapHistorySnapshot();
      if (!snapshotsEqualForMap(prior, current)) {
        state.mapUndoStack.push(prior);
        if (state.mapUndoStack.length > MAP_HISTORY_LIMIT) {
          state.mapUndoStack.shift();
        }
        state.mapRedoStack = [];
      }
      updateMapUndoRedoButtons();
    }
    state.mapPendingStrokeSnapshot = null;
    state.mapHasPendingStrokeChange = false;
  }

  function getMapBrushPoints(centerRow, centerCol, brushSize) {
    const points = [];
    const startOffset = Math.floor(brushSize / 2);
    for (let row = centerRow - startOffset; row < centerRow - startOffset + brushSize; row += 1) {
      for (let col = centerCol - startOffset; col < centerCol - startOffset + brushSize; col += 1) {
        if (!isInsideMap(col, row)) {
          continue;
        }
        points.push([row, col]);
      }
    }
    return points;
  }

  function getMapBarToolPoints(row, col, tool) {
    const length = clampInteger(state.mapBarLength, 1, 256, 8);
    const thickness = clampInteger(state.mapBarThickness, 1, 32, 1);
    const points = [];
    for (let t = 0; t < thickness; t += 1) {
      for (let i = 0; i < length; i += 1) {
        const nextRow = tool === 'hbar' ? row + t : row + i;
        const nextCol = tool === 'hbar' ? col + i : col + t;
        if (!isInsideMap(nextCol, nextRow)) {
          continue;
        }
        points.push([nextRow, nextCol]);
      }
    }
    return points;
  }

  function getMapLineToolPoints(startRow, startCol, endRow, endCol, thickness) {
    const points = [];
    const dr = Math.abs(endRow - startRow);
    const dc = Math.abs(endCol - startCol);
    const stepR = startRow < endRow ? 1 : -1;
    const stepC = startCol < endCol ? 1 : -1;
    let err = dc - dr;
    let row = startRow;
    let col = startCol;
    while (true) {
      getMapBrushPoints(row, col, Math.max(1, thickness)).forEach(function (point) {
        points.push(point);
      });
      if (row === endRow && col === endCol) {
        break;
      }
      const e2 = err * 2;
      if (e2 > -dr) {
        err -= dr;
        col += stepC;
      }
      if (e2 < dc) {
        err += dc;
        row += stepR;
      }
    }
    return points;
  }

  function applyMapStrokeToLayer(points) {
    // Safety: object-layer bulk drawing with unique markers can create confusing outcomes.
    // We conservatively restrict object-layer tools to single-cell placement.
    if (state.activeLayer === 'object' && points.length > 1) {
      points = [points[0]];
      updateStatus('Object layer shape/brush is limited to single-cell placement for safety.');
    }
    points.forEach(function (point) {
      applySelectedAt(point[0], point[1]);
    });
  }

  function clampInteger(value, min, max, fallback) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, parsed));
  }

  function texturePixelsEqual(a, b) {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return a.color === b.color && Math.abs(a.alpha - b.alpha) < 0.0001;
  }

  function rgbaFromHex(hex, alpha) {
    const value = String(hex || '#000000').replace('#', '');
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }

  function blendTexturePixels(base, top) {
    if (!top) {
      return base;
    }
    if (!base) {
      return { color: top.color, alpha: top.alpha };
    }
    const alpha = top.alpha + base.alpha * (1 - top.alpha);
    if (alpha <= 0) {
      return null;
    }
    function rgb(color) {
      return {
        r: parseInt(color.slice(1, 3), 16),
        g: parseInt(color.slice(3, 5), 16),
        b: parseInt(color.slice(5, 7), 16)
      };
    }
    const b1 = rgb(base.color);
    const t1 = rgb(top.color);
    const r = Math.round((t1.r * top.alpha + b1.r * base.alpha * (1 - top.alpha)) / alpha);
    const g = Math.round((t1.g * top.alpha + b1.g * base.alpha * (1 - top.alpha)) / alpha);
    const b = Math.round((t1.b * top.alpha + b1.b * base.alpha * (1 - top.alpha)) / alpha);
    const hex = '#' + [r, g, b].map(function (n) { return n.toString(16).padStart(2, '0'); }).join('');
    return { color: hex, alpha: alpha };
  }

  function getCompositeTexturePixel(row, col) {
    let composite = null;
    state.textureBuilder.layers.forEach(function (layer) {
      if (!layer.visible) {
        return;
      }
      const pixel = normalizeTexturePixel(layer.pixels[row][col]);
      if (!pixel) {
        return;
      }
      const withLayerOpacity = {
        color: pixel.color,
        alpha: Math.max(0, Math.min(1, pixel.alpha * layer.opacity))
      };
      composite = blendTexturePixels(composite, withLayerOpacity);
    });
    return composite;
  }

  function sampleCompositeTextureColor(row, col) {
    const pixel = getCompositeTexturePixel(row, col);
    return pixel ? pixel.color : null;
  }

  function getFlattenedTextureHexGrid() {
    const size = state.textureBuilder.size;
    const out = createLayerGrid(size, size, null);
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) {
        const composite = getCompositeTexturePixel(row, col);
        out[row][col] = composite ? composite.color : null;
      }
    }
    return out;
  }

  function getBrushPoints(centerRow, centerCol, brushSize) {
    const points = [];
    const startOffset = Math.floor(brushSize / 2);
    for (let row = centerRow - startOffset; row < centerRow - startOffset + brushSize; row += 1) {
      for (let col = centerCol - startOffset; col < centerCol - startOffset + brushSize; col += 1) {
        if (row < 0 || row >= state.textureBuilder.size || col < 0 || col >= state.textureBuilder.size) {
          continue;
        }
        points.push([row, col]);
      }
    }
    return points;
  }

  function applyTextureStrokeToLayer(layer, points, pixelValue, isBrush) {
    const normalized = normalizeTexturePixel(pixelValue);
    points.forEach(function (point) {
      const row = point[0];
      const col = point[1];
      if (pixelValue === null) {
        layer.pixels[row][col] = null;
        return;
      }
      if (state.textureBuilder.activeTool === 'highlighter' && normalized) {
        const existing = normalizeTexturePixel(layer.pixels[row][col]);
        if (existing && existing.color === normalized.color) {
          layer.pixels[row][col] = {
            color: normalized.color,
            alpha: Math.max(existing.alpha, normalized.alpha)
          };
          return;
        }
      }
      layer.pixels[row][col] = normalized;
    });
    if (!isBrush) {
      state.textureBuilder.lastPaintedCellKey = '';
    }
  }

  function getBarToolPoints(row, col, tool) {
    const length = clampInteger(state.textureBuilder.barLength, 1, 256, 8);
    const thickness = clampInteger(state.textureBuilder.barThickness, 1, 32, 1);
    const points = [];
    for (let t = 0; t < thickness; t += 1) {
      for (let i = 0; i < length; i += 1) {
        const nextRow = tool === 'hbar' ? row + t : row + i;
        const nextCol = tool === 'hbar' ? col + i : col + t;
        if (nextRow < 0 || nextRow >= state.textureBuilder.size || nextCol < 0 || nextCol >= state.textureBuilder.size) {
          continue;
        }
        points.push([nextRow, nextCol]);
      }
    }
    return points;
  }

  function getLineToolPoints(startRow, startCol, endRow, endCol, thickness) {
    const points = [];
    const dr = Math.abs(endRow - startRow);
    const dc = Math.abs(endCol - startCol);
    const stepR = startRow < endRow ? 1 : -1;
    const stepC = startCol < endCol ? 1 : -1;
    let err = dc - dr;
    let row = startRow;
    let col = startCol;
    const brushSize = Math.max(1, thickness);
    while (true) {
      getBrushPoints(row, col, brushSize).forEach(function (point) {
        points.push(point);
      });
      if (row === endRow && col === endCol) {
        break;
      }
      const e2 = err * 2;
      if (e2 > -dr) {
        err -= dr;
        col += stepC;
      }
      if (e2 < dc) {
        err += dc;
        row += stepR;
      }
    }
    return points;
  }

  function isTextureDragPaintTool(tool) {
    return tool === 'paint' || tool === 'erase' || tool === 'highlighter';
  }

  function handleTexturePointerDown(cell) {
    state.textureBuilder.lastPaintedCellKey = '';
    if (isTextureDragPaintTool(state.textureBuilder.activeTool)) {
      if (canEditActiveTextureLayer()) {
        beginTextureStrokeHistoryIfNeeded();
      }
      state.textureBuilder.isPainting = true;
    }
    paintTextureCellFromElement(cell);
  }

  function clearTexturePreview() {
    state.textureBuilder.previewCells = [];
    applyTexturePreviewOverlay();
  }

  function applyTexturePreviewOverlay() {
    const previewMap = {};
    state.textureBuilder.previewCells.forEach(function (entry) {
      previewMap[entry[0] + ',' + entry[1]] = true;
    });
    dom.textureGridContainer.querySelectorAll('.texture-cell').forEach(function (cell) {
      const key = cell.dataset.row + ',' + cell.dataset.col;
      cell.classList.toggle('texture-preview', Boolean(previewMap[key]));
    });
  }

  function updateTexturePreviewForCell(cell) {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (!Number.isInteger(row) || !Number.isInteger(col)) {
      return;
    }

    if (state.textureBuilder.activeTool === 'line' && state.textureBuilder.shapeStart) {
      state.textureBuilder.previewCells = getLineToolPoints(
        state.textureBuilder.shapeStart.row,
        state.textureBuilder.shapeStart.col,
        row,
        col,
        state.textureBuilder.barThickness
      );
      applyTexturePreviewOverlay();
      return;
    }

    if (state.textureBuilder.activeTool === 'hbar' || state.textureBuilder.activeTool === 'vbar') {
      state.textureBuilder.previewCells = getBarToolPoints(row, col, state.textureBuilder.activeTool);
      applyTexturePreviewOverlay();
      return;
    }

    if (isTextureDragPaintTool(state.textureBuilder.activeTool)) {
      state.textureBuilder.previewCells = getBrushPoints(row, col, state.textureBuilder.brushSize);
      applyTexturePreviewOverlay();
      return;
    }

    clearTexturePreview();
  }

  function renderTextureLayerList() {
    dom.textureLayerList.innerHTML = '';
    state.textureBuilder.layers.forEach(function (layer, index) {
      const row = document.createElement('div');
      row.className = 'texture-layer-row';
      row.classList.toggle('active', layer.id === state.textureBuilder.activeLayerId);
      row.dataset.layerId = layer.id;
      row.innerHTML = '<div class=\"texture-layer-top\">' +
        '<button type=\"button\" class=\"secondary-btn\" data-layer-action=\"activate\" data-layer-id=\"' + layer.id + '\">Active</button>' +
        '<input class=\"text-input\" data-layer-field=\"name\" data-layer-id=\"' + layer.id + '\" value=\"' + escapeHtml(layer.name) + '\" />' +
        '</div>' +
        '<div class=\"texture-layer-controls\">' +
        '<label><input type=\"checkbox\" data-layer-field=\"visible\" data-layer-id=\"' + layer.id + '\" ' + (layer.visible ? 'checked' : '') + ' /> Visible</label>' +
        '<label><input type=\"checkbox\" data-layer-field=\"locked\" data-layer-id=\"' + layer.id + '\" ' + (layer.locked ? 'checked' : '') + ' /> Locked</label>' +
        '<label>Opacity <input type=\"range\" min=\"0\" max=\"1\" step=\"0.05\" data-layer-field=\"opacity\" data-layer-id=\"' + layer.id + '\" value=\"' + layer.opacity + '\" /></label>' +
        '<div>' +
        '<button type=\"button\" class=\"secondary-btn\" data-layer-action=\"up\" data-layer-id=\"' + layer.id + '\" ' + (index === state.textureBuilder.layers.length - 1 ? 'disabled' : '') + '>Up</button> ' +
        '<button type=\"button\" class=\"secondary-btn\" data-layer-action=\"down\" data-layer-id=\"' + layer.id + '\" ' + (index === 0 ? 'disabled' : '') + '>Down</button> ' +
        '<button type=\"button\" class=\"danger-btn\" data-layer-action=\"delete\" data-layer-id=\"' + layer.id + '\" ' + (state.textureBuilder.layers.length <= 1 ? 'disabled' : '') + '>Delete</button>' +
        '</div>' +
        '</div>';
      dom.textureLayerList.appendChild(row);
    });
  }

  function addTextureLayer() {
    pushTextureUndoState();
    const layer = createTextureLayer('Layer ' + (state.textureBuilder.layers.length + 1), state.textureBuilder.size);
    state.textureBuilder.layers.push(layer);
    state.textureBuilder.activeLayerId = layer.id;
    renderTextureLayerList();
    renderTextureGrid();
    updateTextureStatus('Texture layer added.');
  }

  function clearActiveTextureLayer() {
    if (!canEditActiveTextureLayer()) {
      return;
    }
    const layer = getActiveTextureLayer();
    if (!layer) {
      return;
    }
    if (!window.confirm('Clear all pixels on active layer?')) {
      return;
    }
    pushTextureUndoState();
    layer.pixels = createLayerGrid(state.textureBuilder.size, state.textureBuilder.size, null);
    renderTextureGrid();
    updateTextureStatus('Active layer cleared.');
  }

  function onTextureLayerListClick(event) {
    const button = event.target.closest('[data-layer-action]');
    if (!button) {
      return;
    }
    const layerId = button.dataset.layerId;
    const action = button.dataset.layerAction;
    const index = state.textureBuilder.layers.findIndex(function (layer) {
      return layer.id === layerId;
    });
    if (index === -1) {
      return;
    }

    if (action === 'activate') {
      state.textureBuilder.activeLayerId = layerId;
    } else if (action === 'up' && index < state.textureBuilder.layers.length - 1) {
      pushTextureUndoState();
      const temp = state.textureBuilder.layers[index + 1];
      state.textureBuilder.layers[index + 1] = state.textureBuilder.layers[index];
      state.textureBuilder.layers[index] = temp;
    } else if (action === 'down' && index > 0) {
      pushTextureUndoState();
      const swap = state.textureBuilder.layers[index - 1];
      state.textureBuilder.layers[index - 1] = state.textureBuilder.layers[index];
      state.textureBuilder.layers[index] = swap;
    } else if (action === 'delete' && state.textureBuilder.layers.length > 1) {
      pushTextureUndoState();
      state.textureBuilder.layers.splice(index, 1);
      if (state.textureBuilder.activeLayerId === layerId) {
        state.textureBuilder.activeLayerId = state.textureBuilder.layers[Math.max(0, index - 1)].id;
      }
    }

    renderTextureLayerList();
    renderTextureGrid();
  }

  function onTextureLayerListChange(event) {
    const input = event.target;
    const layerId = input.dataset.layerId;
    const field = input.dataset.layerField;
    if (!layerId || !field) {
      return;
    }
    const layer = state.textureBuilder.layers.find(function (entry) {
      return entry.id === layerId;
    });
    if (!layer) {
      return;
    }

    if (field === 'name') {
      pushTextureUndoState();
      layer.name = String(input.value || '').trim() || 'Layer';
    } else if (field === 'visible') {
      pushTextureUndoState();
      layer.visible = Boolean(input.checked);
    } else if (field === 'locked') {
      pushTextureUndoState();
      layer.locked = Boolean(input.checked);
    } else if (field === 'opacity') {
      pushTextureUndoState();
      const nextOpacity = Number(input.value);
      layer.opacity = Number.isFinite(nextOpacity) ? Math.max(0, Math.min(1, nextOpacity)) : 1;
    }

    renderTextureLayerList();
    renderTextureGrid();
  }

  function importTextureFromFile(file) {
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const parsed = JSON.parse(String(reader.result));
        pushTextureUndoState();
        applyImportedTexturePayload(parsed);
        updateTextureStatus('Texture imported successfully.');
      } catch (error) {
        updateTextureStatus('Texture import failed: ' + error.message, true);
      }
    };
    reader.onerror = function () {
      updateTextureStatus('Texture import failed: unable to read file.', true);
    };
    reader.readAsText(file);
  }

  function applyImportedTexturePayload(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('Texture JSON must be an object.');
    }
    const size = Number(payload.size);
    if (TEXTURE_SIZES.indexOf(size) === -1) {
      throw new Error('Texture size must be one of: ' + TEXTURE_SIZES.join(', '));
    }

    state.textureBuilder.size = size;
    dom.textureSizeSelect.value = String(size);

    if (Array.isArray(payload.layers)) {
      const nextLayers = payload.layers.map(function (layer, index) {
        const name = String(layer && layer.name ? layer.name : ('Layer ' + (index + 1)));
        const pixels = Array.isArray(layer && layer.pixels) ? layer.pixels : [];
        if (pixels.length !== size) {
          throw new Error('Imported layer pixel rows must match selected size.');
        }
        const normalizedPixels = pixels.map(function (row) {
          if (!Array.isArray(row) || row.length !== size) {
            throw new Error('Imported layer pixel columns must match selected size.');
          }
          return row.map(function (entry) {
            return normalizeTexturePixel(entry);
          });
        });
        const created = createTextureLayer(name, size);
        created.pixels = normalizedPixels;
        created.visible = layer.visible !== false;
        created.locked = Boolean(layer.locked);
        created.opacity = Number.isFinite(Number(layer.opacity)) ? Math.max(0, Math.min(1, Number(layer.opacity))) : 1;
        return created;
      });
      if (!nextLayers.length) {
        throw new Error('Imported texture must include at least one layer.');
      }
      state.textureBuilder.layers = nextLayers;
      state.textureBuilder.activeLayerId = nextLayers[0].id;
    } else if (Array.isArray(payload.pixels)) {
      const normalizedPixels = payload.pixels.map(function (row) {
        if (!Array.isArray(row) || row.length !== size) {
          throw new Error('Imported legacy pixels must match selected size.');
        }
        return row.map(function (entry) {
          return normalizeTexturePixel(entry);
        });
      });
      if (normalizedPixels.length !== size) {
        throw new Error('Imported legacy pixels must match selected size.');
      }
      resetTextureLayers(size, false);
      state.textureBuilder.layers[0].pixels = normalizedPixels;
    } else {
      throw new Error('Unsupported texture JSON format.');
    }

    renderTextureLayerList();
    renderTextureGrid();
  }

  function createMapHistorySnapshot() {
    return {
      width: state.width,
      height: state.height,
      mapType: state.mapType,
      mapId: state.mapId,
      mapName: state.mapName,
      tileLayer: cloneLayer(state.tileLayer),
      objectLayer: cloneLayer(state.objectLayer),
      activeLayer: state.activeLayer,
      selectedByLayer: {
        tile: state.selectedByLayer.tile,
        object: state.selectedByLayer.object
      },
      activeTool: state.activeTool,
      mapBrushSize: state.mapBrushSize,
      mapBarLength: state.mapBarLength,
      mapBarThickness: state.mapBarThickness
    };
  }

  function restoreMapHistorySnapshot(snapshot) {
    state.width = snapshot.width;
    state.height = snapshot.height;
    state.mapType = snapshot.mapType;
    state.mapId = snapshot.mapId;
    state.mapName = snapshot.mapName;
    state.tileLayer = cloneLayer(snapshot.tileLayer);
    state.objectLayer = cloneLayer(snapshot.objectLayer);
    state.activeLayer = snapshot.activeLayer;
    state.selectedByLayer.tile = snapshot.selectedByLayer.tile;
    state.selectedByLayer.object = snapshot.selectedByLayer.object;
    state.activeTool = snapshot.activeTool;
    state.mapBrushSize = snapshot.mapBrushSize;
    state.mapBarLength = snapshot.mapBarLength;
    state.mapBarThickness = snapshot.mapBarThickness;
    state.mapShapeStart = null;

    dom.mapBrushSizeSelect.value = String(state.mapBrushSize);
    dom.mapBarLengthInput.value = String(state.mapBarLength);
    dom.mapBarThicknessInput.value = String(state.mapBarThickness);

    syncMapInputsFromState();
    updateMapLabels();
    renderPalette();
    renderLegend();
    ensureSelectedVisible();
    updateActiveLayerButtons();
    updateActiveToolButtonState();
    renderGrid();
  }

  function snapshotsEqualForMap(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function pushMapUndoState() {
    const snapshot = createMapHistorySnapshot();
    const undoStack = state.mapUndoStack;
    const last = undoStack.length ? undoStack[undoStack.length - 1] : null;
    if (!last || !snapshotsEqualForMap(last, snapshot)) {
      undoStack.push(snapshot);
      if (undoStack.length > MAP_HISTORY_LIMIT) {
        undoStack.shift();
      }
    }
    state.mapRedoStack = [];
    updateMapUndoRedoButtons();
  }

  function undoMapAction() {
    if (!state.mapUndoStack.length) {
      return;
    }
    const current = createMapHistorySnapshot();
    const previous = state.mapUndoStack.pop();
    state.mapRedoStack.push(current);
    if (state.mapRedoStack.length > MAP_HISTORY_LIMIT) {
      state.mapRedoStack.shift();
    }
    restoreMapHistorySnapshot(previous);
    updateMapUndoRedoButtons();
    updateStatus('Map undo applied.');
  }

  function redoMapAction() {
    if (!state.mapRedoStack.length) {
      return;
    }
    const current = createMapHistorySnapshot();
    const next = state.mapRedoStack.pop();
    state.mapUndoStack.push(current);
    if (state.mapUndoStack.length > MAP_HISTORY_LIMIT) {
      state.mapUndoStack.shift();
    }
    restoreMapHistorySnapshot(next);
    updateMapUndoRedoButtons();
    updateStatus('Map redo applied.');
  }

  function updateMapUndoRedoButtons() {
    if (!dom.mapUndoBtn || !dom.mapRedoBtn) {
      return;
    }
    dom.mapUndoBtn.disabled = state.mapUndoStack.length === 0;
    dom.mapRedoBtn.disabled = state.mapRedoStack.length === 0;
  }

  function beginMapStrokeHistoryIfNeeded() {
    if (state.mapPendingStrokeSnapshot) {
      return;
    }
    state.mapPendingStrokeSnapshot = createMapHistorySnapshot();
    state.mapHasPendingStrokeChange = false;
  }

  function markMapStrokeChanged() {
    state.mapHasPendingStrokeChange = true;
  }

  function finalizeMapStrokeHistory() {
    if (!state.mapPendingStrokeSnapshot) {
      return;
    }
    if (state.mapHasPendingStrokeChange) {
      const prior = state.mapPendingStrokeSnapshot;
      const current = createMapHistorySnapshot();
      if (!snapshotsEqualForMap(prior, current)) {
        state.mapUndoStack.push(prior);
        if (state.mapUndoStack.length > MAP_HISTORY_LIMIT) {
          state.mapUndoStack.shift();
        }
        state.mapRedoStack = [];
      }
      updateMapUndoRedoButtons();
    }
    state.mapPendingStrokeSnapshot = null;
    state.mapHasPendingStrokeChange = false;
  }

  function getMapBrushPoints(centerRow, centerCol, brushSize) {
    const points = [];
    const startOffset = Math.floor(brushSize / 2);
    for (let row = centerRow - startOffset; row < centerRow - startOffset + brushSize; row += 1) {
      for (let col = centerCol - startOffset; col < centerCol - startOffset + brushSize; col += 1) {
        if (!isInsideMap(col, row)) {
          continue;
        }
        points.push([row, col]);
      }
    }
    return points;
  }

  function getMapBarToolPoints(row, col, tool) {
    const length = clampInteger(state.mapBarLength, 1, 256, 8);
    const thickness = clampInteger(state.mapBarThickness, 1, 32, 1);
    const points = [];
    for (let t = 0; t < thickness; t += 1) {
      for (let i = 0; i < length; i += 1) {
        const nextRow = tool === 'hbar' ? row + t : row + i;
        const nextCol = tool === 'hbar' ? col + i : col + t;
        if (!isInsideMap(nextCol, nextRow)) {
          continue;
        }
        points.push([nextRow, nextCol]);
      }
    }
    return points;
  }

  function getMapLineToolPoints(startRow, startCol, endRow, endCol, thickness) {
    const points = [];
    const dr = Math.abs(endRow - startRow);
    const dc = Math.abs(endCol - startCol);
    const stepR = startRow < endRow ? 1 : -1;
    const stepC = startCol < endCol ? 1 : -1;
    let err = dc - dr;
    let row = startRow;
    let col = startCol;
    while (true) {
      getMapBrushPoints(row, col, Math.max(1, thickness)).forEach(function (point) {
        points.push(point);
      });
      if (row === endRow && col === endCol) {
        break;
      }
      const e2 = err * 2;
      if (e2 > -dr) {
        err -= dr;
        col += stepC;
      }
      if (e2 < dc) {
        err += dc;
        row += stepR;
      }
    }
    return points;
  }

  function applyMapStrokeToLayer(points) {
    // Safety: object-layer bulk drawing with unique markers can create confusing outcomes.
    // We conservatively restrict object-layer tools to single-cell placement.
    if (state.activeLayer === 'object' && points.length > 1) {
      points = [points[0]];
      updateStatus('Object layer shape/brush is limited to single-cell placement for safety.');
    }
    points.forEach(function (point) {
      applySelectedAt(point[0], point[1]);
    });
  }

  function onActiveLayerChanged() {
    updateActiveLayerButtons();
    if (state.activeLayer === 'object' && state.activeTool === 'fill') {
      state.activeTool = 'paint';
    }
    renderPalette();
    ensureSelectedVisible();
    updateSelectedToolLabel();
    updateActiveToolButtonState();
  }

  function updateActiveLayerButtons() {
    dom.layerTileBtn.classList.toggle('active', state.activeLayer === 'tile');
    dom.layerObjectBtn.classList.toggle('active', state.activeLayer === 'object');
    dom.activeLayerLabel.textContent = state.activeLayer === 'tile' ? 'Tile Layer' : 'Object Layer';
  }

  function updateMapLabels() {
    dom.mapTypeLabel.textContent = state.mapType;
    dom.mapIdLabel.textContent = state.mapId;
  }

  function syncMapInputsFromState() {
    dom.mapTypeSelect.value = state.mapType;
    dom.mapIdInput.value = state.mapId;
    dom.mapNameInput.value = state.mapName;
    dom.mapWidthInput.value = String(state.width);
    dom.mapHeightInput.value = String(state.height);
  }

  function normalizeMapId(inputValue) {
    const cleaned = String(inputValue || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_\-]/g, '_')
      .replace(/_+/g, '_');
    return cleaned || 'map_' + state.mapType;
  }

  function applySizeFromInputs() {
    const nextWidth = Number(dom.mapWidthInput.value);
    const nextHeight = Number(dom.mapHeightInput.value);

    if (!Number.isInteger(nextWidth) || !Number.isInteger(nextHeight) || nextWidth < 1 || nextHeight < 1) {
      updateStatus('Map width and height must be positive integers.', true);
      return;
    }

    if (nextWidth > MAX_MAP_SIDE || nextHeight > MAX_MAP_SIDE) {
      updateStatus('Map size limit is ' + MAX_MAP_SIDE + ' x ' + MAX_MAP_SIDE + '.', true);
      return;
    }

    pushMapUndoState();
    resizeMap(nextWidth, nextHeight);
  }

  function resizeMap(nextWidth, nextHeight) {
    const oldWidth = state.width;
    const oldHeight = state.height;
    const nextTileLayer = createLayerGrid(nextWidth, nextHeight, TILE_IDS.empty);
    const nextObjectLayer = createLayerGrid(nextWidth, nextHeight, OBJECT_IDS.none);

    const copyHeight = Math.min(oldHeight, nextHeight);
    const copyWidth = Math.min(oldWidth, nextWidth);
    for (let row = 0; row < copyHeight; row += 1) {
      for (let col = 0; col < copyWidth; col += 1) {
        nextTileLayer[row][col] = state.tileLayer[row][col];
        nextObjectLayer[row][col] = state.objectLayer[row][col];
      }
    }

    state.width = nextWidth;
    state.height = nextHeight;
    state.tileLayer = nextTileLayer;
    state.objectLayer = nextObjectLayer;

    renderGrid();
    syncMapInputsFromState();
    const actionText = nextWidth >= oldWidth && nextHeight >= oldHeight ? 'expanded' : 'resized';
    updateStatus('Map ' + actionText + ' to ' + nextWidth + ' x ' + nextHeight + '. Existing area preserved.');
  }

  function getCellFromEventTarget(target) {
    if (!target || !target.closest) {
      return null;
    }
    const cell = target.closest('.cell');
    return cell;
  }

  function paintCellFromElement(cell) {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (!Number.isInteger(row) || !Number.isInteger(col)) {
      return;
    }

    if (state.activeTool === 'fill') {
      pushMapUndoState();
      applyFillAt(row, col, state.selectedByLayer.tile);
      renderGrid();
      updateStatus('Fill applied from (' + col + ', ' + row + ').');
      return;
    }

    if (state.activeTool === 'hbar' || state.activeTool === 'vbar') {
      pushMapUndoState();
      const barPoints = getMapBarToolPoints(row, col, state.activeTool);
      applyMapStrokeToLayer(barPoints);
      renderGrid();
      return;
    }

    if (state.activeTool === 'line') {
      if (!state.mapShapeStart) {
        state.mapShapeStart = { row: row, col: col };
        updateStatus('Line start set. Click end point to commit line.');
        return;
      }
      pushMapUndoState();
      const linePoints = getMapLineToolPoints(state.mapShapeStart.row, state.mapShapeStart.col, row, col, state.mapBarThickness);
      applyMapStrokeToLayer(linePoints);
      state.mapShapeStart = null;
      renderGrid();
      updateStatus('Line committed.');
      return;
    }

    const currentKey = row + ',' + col;
    if (state.lastPaintedCellKey === currentKey && state.isPainting) {
      return;
    }
    state.lastPaintedCellKey = currentKey;

    let brushSize = state.mapBrushSize;
    if (state.activeLayer === 'object' && brushSize > 1) {
      brushSize = 1;
      updateStatus('Object layer brush is limited to 1px for safety.');
    }

    const points = getMapBrushPoints(row, col, brushSize);
    applyMapStrokeToLayer(points);
    markMapStrokeChanged();
    renderGrid();
  }

  function applyFillAt(startRow, startCol, tileId) {
    const targetTileId = state.tileLayer[startRow][startCol];
    if (targetTileId === tileId) {
      return;
    }

    const queue = [[startRow, startCol]];
    const visited = new Set();

    while (queue.length > 0) {
      const current = queue.shift();
      const row = current[0];
      const col = current[1];
      const key = row + ',' + col;

      if (visited.has(key)) {
        continue;
      }
      visited.add(key);

      if (!isInsideMap(col, row) || state.tileLayer[row][col] !== targetTileId) {
        continue;
      }

      state.tileLayer[row][col] = tileId;
      queue.push([row - 1, col]);
      queue.push([row + 1, col]);
      queue.push([row, col - 1]);
      queue.push([row, col + 1]);
    }
  }

  function applySelectedAt(row, col) {
    if (!isInsideMap(col, row)) {
      return;
    }

    if (state.activeLayer === 'tile') {
      state.tileLayer[row][col] = state.selectedByLayer.tile;
      return;
    }

    const objectId = state.selectedByLayer.object;
    const def = DEFS_BY_ID[objectId];
    if (def && def.unique) {
      clearExistingUniqueObject(objectId);
    }
    state.objectLayer[row][col] = objectId;
  }

  function clearExistingUniqueObject(objectId) {
    for (let row = 0; row < state.height; row += 1) {
      for (let col = 0; col < state.width; col += 1) {
        if (state.objectLayer[row][col] === objectId) {
          state.objectLayer[row][col] = OBJECT_IDS.none;
        }
      }
    }
  }

  function isInsideMap(col, row) {
    return row >= 0 && row < state.height && col >= 0 && col < state.width;
  }

  function setSelectedForActiveLayer(entryId) {
    state.selectedByLayer[state.activeLayer] = entryId;
    updateSelectedToolLabel();
    highlightActivePaletteButton();
  }

  function ensureSelectedVisible() {
    const visibleIds = getVisiblePaletteDefinitions().map(function (tile) {
      return tile.id;
    });
    const currentSelected = state.selectedByLayer[state.activeLayer];
    if (visibleIds.indexOf(currentSelected) === -1) {
      state.selectedByLayer[state.activeLayer] = state.activeLayer === 'tile' ? TILE_IDS.empty : OBJECT_IDS.none;
    }
    updateSelectedToolLabel();
    highlightActivePaletteButton();
  }

  function updateSelectedToolLabel() {
    const selectedId = state.selectedByLayer[state.activeLayer];
    const tile = DEFS_BY_ID[selectedId];
    dom.selectedToolLabel.textContent = (tile ? tile.label : 'Unknown') + ' (' + selectedId + ')';
  }

  function highlightActivePaletteButton() {
    const selectedId = state.selectedByLayer[state.activeLayer];
    dom.palette.querySelectorAll('.tile-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.tileId === selectedId);
    });
  }

  function updateActiveToolButtonState() {
    dom.paintToolBtn.classList.toggle('active', state.activeTool === 'paint');
    dom.fillToolBtn.classList.toggle('active', state.activeTool === 'fill');
    dom.mapHBarToolBtn.classList.toggle('active', state.activeTool === 'hbar');
    dom.mapVBarToolBtn.classList.toggle('active', state.activeTool === 'vbar');
    dom.mapLineToolBtn.classList.toggle('active', state.activeTool === 'line');
    dom.fillToolBtn.disabled = state.activeLayer === 'object';
    dom.activeToolLabel.textContent = state.activeTool === 'fill' ? 'Fill' :
      state.activeTool === 'hbar' ? 'Horizontal Bar' :
        state.activeTool === 'vbar' ? 'Vertical Bar' :
          state.activeTool === 'line' ? 'Angled Line' : 'Paint';
  }

  function exportRawMapToFile() {
    const rawPayload = {
      gridSize: state.width === state.height ? state.width : undefined,
      width: state.width,
      height: state.height,
      mapType: state.mapType,
      mapId: state.mapId,
      mapName: state.mapName,
      tiles: cloneLayer(state.tileLayer),
      tileLayer: cloneLayer(state.tileLayer),
      objectLayer: cloneLayer(state.objectLayer)
    };

    if (rawPayload.gridSize === undefined) {
      delete rawPayload.gridSize;
    }

    downloadJsonFile(rawPayload, state.mapId + '_raw.json');
    updateStatus('Raw map JSON exported.');
  }

  function exportEngineMapToFile() {
    const payload = serializeEngineMap();
    downloadJsonFile(payload, state.mapId + '_engine.json');
    updateStatus('Engine-ready JSON exported.');
  }

  function serializeEngineMap() {
    const mappedTiles = mapTilesToEngineIds();
    const spawn = resolveSpawnFromObjects(mappedTiles);
    const groupedObjects = collectEngineObjectsFromLayer();

    return {
      id: state.mapId,
      name: state.mapName,
      width: state.width,
      height: state.height,
      tiles: mappedTiles,
      objects: groupedObjects,
      spawn: spawn
    };
  }

  function mapTilesToEngineIds() {
    return state.tileLayer.map(function (row) {
      return row.map(function (tileId) {
        return mapTileIdToEngine(tileId);
      });
    });
  }

  function mapTileIdToEngine(tileId) {
    if (Object.prototype.hasOwnProperty.call(ENGINE_TILE_IDS, tileId)) {
      return tileId;
    }

    const tileMap = {
      empty: 'floor_grass_a',
      floor_stone: 'floor_stone_a',
      floor_wood: 'floor_wood_a',
      floor_grass: 'floor_grass_a',
      floor_sand: 'floor_sand_a',
      floor_dirt: 'floor_dirt_a',
      floor_cobble: 'floor_stone_b',
      floor_tile: 'floor_stone_b',
      floor_moss: 'floor_grass_b',
      floor_snow: 'floor_ice_a',
      floor_ash: 'floor_dirt_b',
      floor_crystal: 'floor_marble_a',
      floor_darkstone: 'floor_stone_b',
      floor_marble: 'floor_marble_a',
      floor_ruins: 'floor_stone_b',
      floor_planks: 'floor_wood_a',
      wall_stone: 'wall_rock_a',
      wall_wood: 'wall_wood_a',
      wall_brick: 'wall_brick_a',
      wall_metal: 'wall_brick_b',
      wall_ruin: 'wall_rock_b',
      cliff: 'wall_rock_a',
      tree_block: 'wall_rock_b',
      rock_block: 'wall_rock_a',
      fence: 'wall_wood_a',
      gate_closed: 'wall_wood_a',
      gate_open: 'floor_wood_a',
      breakable_wall: 'wall_brick_a',
      secret_wall: 'wall_rock_b',
      cave_wall: 'wall_rock_a',
      castle_wall: 'wall_brick_b',
      lava: 'hazard_lava',
      water: 'hazard_water',
      swamp: 'hazard_swamp',
      poison: 'hazard_poison',
      acid: 'hazard_poison',
      spikes: 'floor_stone_a',
      fire_trap: 'floor_stone_a',
      ice: 'floor_ice_a',
      mud: 'floor_dirt_b',
      quicksand: 'floor_sand_a',
      cursed_ground: 'hazard_poison',
      electric_floor: 'floor_stone_b',
      thorn_patch: 'floor_grass_b',
      healing_pool: 'hazard_water',
      slow_field: 'hazard_swamp',
      bridge: 'special_portal_pad',
      stairs_up: 'floor_stone_b',
      stairs_down: 'floor_stone_b',
      ladder: 'floor_wood_a',
      jump_pad: 'special_portal_pad',
      narrow_path: 'floor_dirt_a',
      doorway: 'floor_stone_a',
      tunnel_entry: 'floor_stone_b',
      tunnel_exit: 'floor_stone_b',
      one_way_gate: 'wall_wood_a'
    };

    return tileMap[tileId] || 'floor_grass_a';
  }

  function collectTileMetadata() {
    const metadata = [];
    for (let row = 0; row < state.height; row += 1) {
      for (let col = 0; col < state.width; col += 1) {
        const tileId = state.tileLayer[row][col];
        const def = DEFS_BY_ID[tileId];
        if (def && def.effect) {
          metadata.push({ x: col, y: row, tileId: tileId, effect: def.effect });
        }
      }
    }
    return metadata;
  }

  function collectObjectsFromLayer() {
    const objects = [];
    for (let row = 0; row < state.height; row += 1) {
      for (let col = 0; col < state.width; col += 1) {
        const objectId = state.objectLayer[row][col];
        if (objectId === OBJECT_IDS.none) {
          continue;
        }
        const def = DEFS_BY_ID[objectId];
        objects.push({
          id: objectId,
          x: col,
          y: row,
          group: def ? def.group : 'Unknown'
        });
      }
    }
    return objects;
  }

  function collectEngineObjectsFromLayer() {
    const grouped = {
      portals: [],
      shops: [],
      fountains: [],
      enemySpawns: []
    };

    for (let row = 0; row < state.height; row += 1) {
      for (let col = 0; col < state.width; col += 1) {
        const objectId = state.objectLayer[row][col];
        if (objectId === OBJECT_IDS.none || objectId === OBJECT_IDS.player_start) {
          continue;
        }

        if (isPortalObject(objectId)) {
          grouped.portals.push({
            x: col,
            y: row,
            levels: []
          });
          continue;
        }

        if (isShopObject(objectId)) {
          grouped.shops.push({
            x: col,
            y: row,
            shopId: mapShopObjectToEngineShopId(objectId)
          });
          continue;
        }

        if (objectId === OBJECT_IDS.fountain) {
          grouped.fountains.push({ x: col, y: row });
          continue;
        }

        if (isEnemySpawnObject(objectId)) {
          grouped.enemySpawns.push({
            x: col,
            y: row,
            enemyId: mapEnemyObjectToEngineEnemyId(objectId)
          });
        }
      }
    }

    return grouped;
  }

  function resolveSpawnFromObjects(mappedTiles) {
    for (let row = 0; row < state.height; row += 1) {
      for (let col = 0; col < state.width; col += 1) {
        if (state.objectLayer[row][col] === OBJECT_IDS.player_start) {
          return { x: col, y: row };
        }
      }
    }

    return findFallbackSpawn(mappedTiles);
  }

  function findFallbackSpawn(mappedTiles) {
    for (let row = 0; row < state.height; row += 1) {
      for (let col = 0; col < state.width; col += 1) {
        const tileId = mappedTiles[row][col];
        if (tileId.indexOf('wall_') !== 0) {
          return { x: col, y: row };
        }
      }
    }
    return { x: 0, y: 0 };
  }

  function isPortalObject(objectId) {
    return objectId === OBJECT_IDS.portal_level ||
      objectId === OBJECT_IDS.portal_town ||
      objectId === OBJECT_IDS.portal_world ||
      objectId === OBJECT_IDS.return_portal ||
      objectId === OBJECT_IDS.boss_exit ||
      objectId === OBJECT_IDS.locked_portal ||
      objectId === OBJECT_IDS.town_portal ||
      objectId === OBJECT_IDS.exit_marker;
  }

  function isShopObject(objectId) {
    return objectId === OBJECT_IDS.blacksmith ||
      objectId === OBJECT_IDS.armor_shop ||
      objectId === OBJECT_IDS.potion_shop ||
      objectId === OBJECT_IDS.general_shop ||
      objectId === OBJECT_IDS.special_shop;
  }

  function mapShopObjectToEngineShopId(objectId) {
    if (objectId === OBJECT_IDS.blacksmith) return 'shop_blacksmith_t1';
    if (objectId === OBJECT_IDS.special_shop) return 'shop_rare_t2';
    if (objectId === OBJECT_IDS.potion_shop) return 'shop_potion_t1';
    if (objectId === OBJECT_IDS.armor_shop) return 'shop_blacksmith_t1';
    if (objectId === OBJECT_IDS.general_shop) return 'shop_potion_t1';
    return 'shop_potion_t1';
  }

  function isEnemySpawnObject(objectId) {
    return objectId === OBJECT_IDS.enemy_spawn_basic ||
      objectId === OBJECT_IDS.enemy_spawn_ranged ||
      objectId === OBJECT_IDS.enemy_spawn_tank ||
      objectId === OBJECT_IDS.enemy_spawn_swarm ||
      objectId === OBJECT_IDS.enemy_spawn_runner ||
      objectId === OBJECT_IDS.enemy_spawn_elite ||
      objectId === OBJECT_IDS.enemy_spawn_boss ||
      objectId === OBJECT_IDS.ambush_spawn;
  }

  function mapEnemyObjectToEngineEnemyId(objectId) {
    if (objectId === OBJECT_IDS.enemy_spawn_tank || objectId === OBJECT_IDS.enemy_spawn_boss) {
      return 'guardian_golem';
    }
    if (objectId === OBJECT_IDS.enemy_spawn_ranged || objectId === OBJECT_IDS.enemy_spawn_runner || objectId === OBJECT_IDS.enemy_spawn_elite) {
      return 'wolf_runner';
    }
    return 'slime_green';
  }

  function importMapFromFile(file) {
    const reader = new FileReader();

    reader.onload = function () {
      try {
        const parsed = JSON.parse(String(reader.result));
        const normalized = normalizeImportedPayload(parsed);
        pushMapUndoState();
        applyImportedMap(normalized);
        updateStatus('Map imported successfully.');
      } catch (error) {
        updateStatus('Import failed: ' + error.message, true);
      }
    };

    reader.onerror = function () {
      updateStatus('Import failed: unable to read file.', true);
    };

    reader.readAsText(file);
  }

  function normalizeImportedPayload(data) {
    if (!data || typeof data !== 'object') {
      throw new Error('JSON root must be an object.');
    }
    if (data.map && typeof data.map === 'object') {
      return normalizeMapLikeObject(data.map);
    }
    return normalizeMapLikeObject(data);
  }

  function normalizeMapLikeObject(mapData) {
    const width = Number.isInteger(mapData.width) ? mapData.width : Number.isInteger(mapData.gridSize) ? mapData.gridSize : null;
    const height = Number.isInteger(mapData.height) ? mapData.height : Number.isInteger(mapData.gridSize) ? mapData.gridSize : null;

    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
      throw new Error('Map width and height must be positive integers.');
    }

    const tileSource = Array.isArray(mapData.tileLayer) ? mapData.tileLayer : mapData.tiles;
    if (!Array.isArray(tileSource) || tileSource.length !== height) {
      throw new Error('tileLayer/tiles array must match map height.');
    }

    const normalizedTileLayer = tileSource.map(function (row) {
      if (!Array.isArray(row) || row.length !== width) {
        throw new Error('Each tile row must match map width.');
      }
      return row.map(function (value) {
        return normalizeIdValue(value, 'tile');
      });
    });

    let normalizedObjectLayer = createLayerGrid(width, height, OBJECT_IDS.none);

    if (Array.isArray(mapData.objectLayer) && mapData.objectLayer.length === height) {
      normalizedObjectLayer = mapData.objectLayer.map(function (row) {
        if (!Array.isArray(row) || row.length !== width) {
          throw new Error('Each objectLayer row must match map width.');
        }
        return row.map(function (value) {
          return normalizeIdValue(value, 'object');
        });
      });
    } else if (Array.isArray(mapData.objects)) {
      mapData.objects.forEach(function (entry) {
        if (!entry || !Number.isInteger(entry.x) || !Number.isInteger(entry.y)) {
          return;
        }
        if (entry.y >= 0 && entry.y < height && entry.x >= 0 && entry.x < width) {
          normalizedObjectLayer[entry.y][entry.x] = normalizeIdValue(entry.id, 'object');
        }
      });
    } else {
      for (let row = 0; row < height; row += 1) {
        for (let col = 0; col < width; col += 1) {
          const sourceCell = tileSource[row][col];
          const normalized = normalizeLegacyCombinedValue(sourceCell);
          normalizedTileLayer[row][col] = normalized.tile;
          normalizedObjectLayer[row][col] = normalized.object;
        }
      }

      if (mapData.placements && typeof mapData.placements === 'object') {
        applyLegacyPlacements(mapData.placements, normalizedObjectLayer, width, height);
      }
    }

    const inferredType = typeof mapData.mapType === 'string' ? mapData.mapType : mapData.type;
    return {
      width: width,
      height: height,
      mapType: inferredType === 'town' ? 'town' : 'level',
      mapId: normalizeMapId(mapData.id || mapData.mapId || 'imported_map'),
      mapName: String(mapData.name || mapData.mapName || 'Imported Map'),
      tileLayer: normalizedTileLayer,
      objectLayer: normalizedObjectLayer
    };
  }

  function applyLegacyPlacements(placements, objectLayer, width, height) {
    if (placements.playerStart && Number.isInteger(placements.playerStart.x) && Number.isInteger(placements.playerStart.y)) {
      placeObjectIfInside(objectLayer, placements.playerStart.x, placements.playerStart.y, OBJECT_IDS.player_start, width, height);
    }
    (placements.portals || []).forEach(function (entry) {
      placeObjectIfInside(objectLayer, entry.x, entry.y, OBJECT_IDS.portal_level, width, height);
    });
    (placements.enemySpawns || []).forEach(function (entry) {
      placeObjectIfInside(objectLayer, entry.x, entry.y, OBJECT_IDS.enemy_spawn_basic, width, height);
    });
    (placements.shops || []).forEach(function (entry) {
      placeObjectIfInside(objectLayer, entry.x, entry.y, normalizeIdValue(entry.shopType ? entry.shopType + '_shop' : 'general_shop', 'object'), width, height);
    });
    (placements.fountains || []).forEach(function (entry) {
      placeObjectIfInside(objectLayer, entry.x, entry.y, OBJECT_IDS.fountain, width, height);
    });
    (placements.specials || []).forEach(function (entry) {
      const specialMap = {
        chest: OBJECT_IDS.chest_common,
        trigger: OBJECT_IDS.trigger_marker,
        boss: OBJECT_IDS.enemy_spawn_boss
      };
      placeObjectIfInside(objectLayer, entry.x, entry.y, specialMap[entry.specialType] || OBJECT_IDS.trigger_marker, width, height);
    });
    (placements.interactions || []).forEach(function (entry) {
      placeObjectIfInside(objectLayer, entry.x, entry.y, OBJECT_IDS.npc_spot, width, height);
    });
  }

  function placeObjectIfInside(layer, x, y, objectId, width, height) {
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      return;
    }
    if (x >= 0 && x < width && y >= 0 && y < height) {
      layer[y][x] = objectId;
    }
  }

  function normalizeLegacyCombinedValue(value) {
    const typeId = normalizeIdValue(value, 'any');
    const def = DEFS_BY_ID[typeId];
    if (!def) {
      return { tile: TILE_IDS.empty, object: OBJECT_IDS.none };
    }
    if (def.layer === 'object') {
      return { tile: TILE_IDS.empty, object: typeId };
    }
    return { tile: typeId, object: OBJECT_IDS.none };
  }

  function normalizeIdValue(value, expectedLayer) {
    let candidate = value;

    if (Number.isInteger(candidate)) {
      candidate = LEGACY_ID_TO_TYPE[candidate] || null;
    }

    if (typeof candidate !== 'string') {
      return expectedLayer === 'object' ? OBJECT_IDS.none : TILE_IDS.empty;
    }

    if (expectedLayer !== 'object' && isCustomTextureId(candidate)) {
      if (!DEFS_BY_ID[candidate]) {
        DEFS_BY_ID[candidate] = {
          id: candidate,
          label: 'Custom Texture',
          layer: 'tile',
          group: 'Custom Textures',
          color: '#9ca3af',
          mapTypes: ['level', 'town']
        };
      }
      return candidate;
    }

    if (expectedLayer !== 'object' && Object.prototype.hasOwnProperty.call(ENGINE_TILE_IDS, candidate)) {
      return candidate;
    }

    if (!DEFS_BY_ID[candidate]) {
      return expectedLayer === 'object' ? OBJECT_IDS.none : TILE_IDS.empty;
    }

    if (expectedLayer !== 'any' && DEFS_BY_ID[candidate].layer !== expectedLayer) {
      return expectedLayer === 'object' ? OBJECT_IDS.none : TILE_IDS.empty;
    }

    return candidate;
  }

  function applyImportedMap(normalized) {
    state.width = normalized.width;
    state.height = normalized.height;
    state.mapType = normalized.mapType;
    state.mapId = normalized.mapId;
    state.mapName = normalized.mapName;
    state.tileLayer = normalized.tileLayer;
    state.objectLayer = normalized.objectLayer;

    syncMapInputsFromState();
    updateMapLabels();
    renderPalette();
    renderLegend();
    ensureSelectedVisible();
    renderGrid();
  }

  function setActiveTab(tabName) {
    state.activeTab = tabName;
    dom.mapEditorTab.classList.toggle('active', tabName === 'mapEditor');
    dom.viewerTab.classList.toggle('active', tabName === 'viewer');
    dom.itemEditorTab.classList.toggle('active', tabName === 'itemEditor');
    dom.textureBuilderTab.classList.toggle('active', tabName === 'textureBuilder');
    dom.tabMapEditorBtn.classList.toggle('active', tabName === 'mapEditor');
    dom.tabViewerBtn.classList.toggle('active', tabName === 'viewer');
    dom.tabItemEditorBtn.classList.toggle('active', tabName === 'itemEditor');
    dom.tabTextureBuilderBtn.classList.toggle('active', tabName === 'textureBuilder');
  }

  function getDefaultItem() {
    return {
      id: '',
      name: '',
      category: 'weapon',
      baseValue: 0,
      stackable: false,
      rarity: 'common',
      equipSlot: 'weapon',
      mods: {},
      power: 0,
      attackRange: 1,
      cooldown: 1
    };
  }

  function resetItemFormToDefaults() {
    const base = getDefaultItem();
    populateItemForm(base);
    state.selectedItemIndex = -1;
    renderItemList();
    setItemEditorStatus('Creating new item draft.');
  }

  function populateItemForm(item) {
    dom.itemIdInput.value = item.id || '';
    dom.itemNameInput.value = item.name || '';
    dom.itemCategorySelect.value = sanitizeItemCategory(item.category);
    dom.itemBaseValueInput.value = item.baseValue !== undefined ? String(item.baseValue) : '0';
    dom.itemStackableInput.value = String(Boolean(item.stackable));
    dom.itemRaritySelect.value = sanitizeItemRarity(item.rarity);
    dom.itemEquipSlotInput.value = item.equipSlot || '';
    dom.itemModsInput.value = JSON.stringify(isPlainObject(item.mods) ? item.mods : {}, null, 2);
    dom.itemPowerInput.value = item.power !== undefined ? String(item.power) : '';
    dom.itemAttackRangeInput.value = item.attackRange !== undefined ? String(item.attackRange) : '';
    dom.itemCooldownInput.value = item.cooldown !== undefined ? String(item.cooldown) : '';
    dom.itemEffectTypeInput.value = item.effectType || '';
    dom.itemEffectValueInput.value = item.effectValue !== undefined ? String(item.effectValue) : '';
    dom.itemEffectDurationInput.value = item.effectDuration !== undefined ? String(item.effectDuration) : '';
    updateItemConditionalFields();
  }

  function sanitizeItemCategory(category) {
    const allowed = ['weapon', 'armor', 'accessory', 'consumable', 'material', 'key_item'];
    return allowed.indexOf(category) !== -1 ? category : 'material';
  }

  function sanitizeItemRarity(rarity) {
    const allowed = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
    return allowed.indexOf(rarity) !== -1 ? rarity : 'common';
  }

  function updateItemConditionalFields() {
    const category = sanitizeItemCategory(dom.itemCategorySelect.value);
    const showEquip = category === 'weapon' || category === 'armor' || category === 'accessory';
    const showWeapon = category === 'weapon';
    const showConsumable = category === 'consumable';

    dom.equipSlotRow.classList.toggle('hidden', !showEquip);
    dom.modsRow.classList.toggle('hidden', !(showEquip || category === 'weapon'));
    dom.weaponFields.classList.toggle('hidden', !showWeapon);
    dom.consumableFields.classList.toggle('hidden', !showConsumable);
  }

  function renderItemList() {
    dom.itemList.innerHTML = '';
    if (!state.itemDb.items.length) {
      const empty = document.createElement('p');
      empty.textContent = 'No items yet.';
      dom.itemList.appendChild(empty);
      return;
    }

    state.itemDb.items.forEach(function (item, index) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'item-list-entry';
      btn.classList.toggle('active', state.selectedItemIndex === index);
      const name = item.name || '(unnamed)';
      btn.innerHTML = '<strong>' + escapeHtml(item.id || '(no id)') + '</strong><small>' +
        escapeHtml(name) + ' • ' + escapeHtml(item.category || 'material') + ' • ' + escapeHtml(item.rarity || 'common') + '</small>';
      btn.addEventListener('click', function () {
        state.selectedItemIndex = index;
        populateItemForm(item);
        renderItemList();
        setItemEditorStatus('Loaded item ' + (item.id || '(no id)') + '.');
      });
      dom.itemList.appendChild(btn);
    });
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function onNewItem() {
    resetItemFormToDefaults();
  }

  function onSaveItem() {
    let parsedMods = {};
    try {
      parsedMods = parseModsInput(dom.itemModsInput.value);
    } catch (error) {
      setItemEditorStatus('Mods must be valid JSON object: ' + error.message, true);
      return;
    }

    const formItem = buildItemFromForm(parsedMods);
    const validationError = validateItem(formItem);
    if (validationError) {
      setItemEditorStatus(validationError, true);
      return;
    }

    if (state.selectedItemIndex >= 0) {
      const original = state.itemDb.items[state.selectedItemIndex] || {};
      const merged = mergeItemWithUnknownFields(original, formItem);
      const duplicate = findItemIndexById(formItem.id, state.selectedItemIndex);
      if (duplicate !== -1) {
        setItemEditorStatus('Item ID must be unique.', true);
        return;
      }
      state.itemDb.items[state.selectedItemIndex] = merged;
      setItemEditorStatus('Item updated: ' + formItem.id + '.');
    } else {
      const duplicate = findItemIndexById(formItem.id, -1);
      if (duplicate !== -1) {
        setItemEditorStatus('Item ID must be unique.', true);
        return;
      }
      state.itemDb.items.push(formItem);
      state.selectedItemIndex = state.itemDb.items.length - 1;
      setItemEditorStatus('Item created: ' + formItem.id + '.');
    }

    renderItemList();
  }

  function buildItemFromForm(parsedMods) {
    const category = sanitizeItemCategory(dom.itemCategorySelect.value);
    const output = {
      id: dom.itemIdInput.value.trim(),
      name: dom.itemNameInput.value.trim(),
      category: category,
      baseValue: parseRequiredNumber(dom.itemBaseValueInput.value, 0),
      stackable: dom.itemStackableInput.value === 'true',
      rarity: sanitizeItemRarity(dom.itemRaritySelect.value)
    };

    if (category === 'weapon') {
      output.equipSlot = dom.itemEquipSlotInput.value.trim();
      output.mods = parsedMods;
      output.power = parseOptionalNumber(dom.itemPowerInput.value);
      output.attackRange = parseOptionalNumber(dom.itemAttackRangeInput.value);
      output.cooldown = parseOptionalNumber(dom.itemCooldownInput.value);
    } else if (category === 'armor' || category === 'accessory') {
      output.equipSlot = dom.itemEquipSlotInput.value.trim();
      output.mods = parsedMods;
    } else if (category === 'consumable') {
      output.stackable = dom.itemStackableInput.value === 'true';
      output.effectType = dom.itemEffectTypeInput.value.trim();
      output.effectValue = parseOptionalNumber(dom.itemEffectValueInput.value);
      output.effectDuration = parseOptionalNumber(dom.itemEffectDurationInput.value);
    }

    return removeUndefinedValues(output);
  }

  function parseModsInput(raw) {
    const trimmed = String(raw || '').trim();
    if (!trimmed) {
      return {};
    }
    const parsed = JSON.parse(trimmed);
    if (!isPlainObject(parsed)) {
      throw new Error('mods must be an object.');
    }
    return parsed;
  }

  function parseRequiredNumber(raw, fallback) {
    if (raw === '' || raw === null || raw === undefined) {
      return fallback;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function parseOptionalNumber(raw) {
    if (raw === '' || raw === null || raw === undefined) {
      return undefined;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function removeUndefinedValues(obj) {
    return Object.keys(obj).reduce(function (acc, key) {
      if (obj[key] !== undefined) {
        acc[key] = obj[key];
      }
      return acc;
    }, {});
  }

  function validateItem(item) {
    if (!item.id) {
      return 'Item ID is required.';
    }

    if (!item.name) {
      return 'Item name is required.';
    }

    const numberKeys = ['baseValue', 'power', 'attackRange', 'cooldown', 'effectValue', 'effectDuration'];
    for (let i = 0; i < numberKeys.length; i += 1) {
      const key = numberKeys[i];
      if (item[key] !== undefined && !Number.isFinite(item[key])) {
        return key + ' must be a valid number.';
      }
    }

    return '';
  }

  function findItemIndexById(itemId, ignoreIndex) {
    return state.itemDb.items.findIndex(function (entry, index) {
      if (index === ignoreIndex) {
        return false;
      }
      return entry && entry.id === itemId;
    });
  }

  function mergeItemWithUnknownFields(original, updated) {
    const preserved = shallowClone(original);
    const merged = {};

    Object.keys(preserved).forEach(function (key) {
      merged[key] = preserved[key];
    });

    Object.keys(updated).forEach(function (key) {
      merged[key] = updated[key];
    });

    return merged;
  }

  function shallowClone(obj) {
    if (!obj || typeof obj !== 'object') {
      return {};
    }
    return Object.keys(obj).reduce(function (acc, key) {
      acc[key] = obj[key];
      return acc;
    }, {});
  }

  function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function onDeleteItem() {
    if (state.selectedItemIndex < 0 || state.selectedItemIndex >= state.itemDb.items.length) {
      setItemEditorStatus('Select an item to delete.', true);
      return;
    }
    const target = state.itemDb.items[state.selectedItemIndex];
    if (!window.confirm('Delete item ' + (target.id || '(no id)') + '?')) {
      return;
    }
    state.itemDb.items.splice(state.selectedItemIndex, 1);
    state.selectedItemIndex = -1;
    resetItemFormToDefaults();
    renderItemList();
    setItemEditorStatus('Item deleted.');
  }

  function exportItemsToFile() {
    downloadJsonFile({ items: state.itemDb.items }, 'items_database.json');
    setItemEditorStatus('Item database exported.');
  }

  function importItemsFromFile(file) {
    const reader = new FileReader();

    reader.onload = function () {
      try {
        const parsed = JSON.parse(String(reader.result));
        const normalized = normalizeImportedItems(parsed);
        state.itemDb = { items: normalized };
        state.selectedItemIndex = -1;
        resetItemFormToDefaults();
        renderItemList();
        setItemEditorStatus('Items imported successfully.');
      } catch (error) {
        setItemEditorStatus('Item import failed: ' + error.message, true);
      }
    };

    reader.onerror = function () {
      setItemEditorStatus('Item import failed: unable to read file.', true);
    };

    reader.readAsText(file);
  }

  function normalizeImportedItems(payload) {
    const list = Array.isArray(payload) ? payload : payload && Array.isArray(payload.items) ? payload.items : null;
    if (!list) {
      throw new Error('Expected JSON format: {"items": [...]} or an array of items.');
    }

    const normalized = list.map(function (entry) {
      if (!entry || typeof entry !== 'object') {
        throw new Error('Each item must be an object.');
      }
      const clone = shallowClone(entry);
      clone.id = String(clone.id || '').trim();
      clone.name = String(clone.name || '').trim();
      clone.category = sanitizeItemCategory(clone.category);
      clone.rarity = sanitizeItemRarity(clone.rarity);
      clone.baseValue = parseRequiredNumber(clone.baseValue, 0);
      clone.stackable = Boolean(clone.stackable);
      if (clone.mods !== undefined && !isPlainObject(clone.mods)) {
        clone.mods = {};
      }
      return clone;
    });

    const idSet = new Set();
    normalized.forEach(function (entry) {
      const error = validateItem(entry);
      if (error) {
        throw new Error('Invalid imported item ' + (entry.id || '(missing id)') + ': ' + error);
      }
      if (idSet.has(entry.id)) {
        throw new Error('Duplicate item ID found: ' + entry.id);
      }
      idSet.add(entry.id);
    });

    return normalized;
  }

  function setItemEditorStatus(text, isError) {
    dom.itemEditorMessage.textContent = text;
    dom.itemEditorMessage.style.color = isError ? '#b42318' : '#42556f';
  }

  function downloadJsonFile(payload, filename) {
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
  }

  function updateStatus(text, isError) {
    dom.message.textContent = text;
    dom.message.style.color = isError ? '#b42318' : '#42556f';
  }
})();
