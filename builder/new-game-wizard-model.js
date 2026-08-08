import {
  WORKSPACE_PUBLISH_BASE_BRANCH,
  WORKSPACE_PUBLISH_REPOSITORY,
  WORKSPACE_PUBLISH_SCHEMA_VERSION,
  jsonFileText,
} from './workspace-publish-model.js';

const GAME_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const TILE_SIZES = new Set([16, 24, 32, 48, 64]);
const PHYSICS_PRESETS = new Set(['top_down', 'bounds_only']);
const SAVE_SCHEMA_VERSION = 5;

function asBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function integer(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function cleanName(value) {
  return String(value || '').trim();
}

export function normalizeGameId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function gameIdFromName(value) {
  return normalizeGameId(value) || 'new-game';
}

function createMap(width, height) {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (
      x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 'wall' : 'floor'
    )),
  );
}

function appendCatalogGame(catalog, entry) {
  return {
    ...catalog,
    games: [...(Array.isArray(catalog?.games) ? catalog.games : []), entry],
  };
}

function makeFile(path, kind, content, operation = 'create', baselineContent = null) {
  return {
    path,
    kind,
    operation,
    baselineContent,
    content: jsonFileText(content),
  };
}

function createPackageFiles(config) {
  const {
    gameName,
    projectId,
    genre,
    tileSize,
    resolutionWidth,
    resolutionHeight,
    mapWidth,
    mapHeight,
    startingPlayer,
    physicsPreset,
    enableSave,
    enableInventory,
    enableDialogue,
    enableCombat,
    enableAudio,
  } = config;
  const root = `games/${projectId}`;
  const collision = physicsPreset === 'top_down';
  const runtimeSystems = {
    movement: true,
    collision,
    inventory: enableInventory,
    equipment: enableInventory,
    shops: false,
    combat: enableCombat ? 'realtime' : false,
    randomEncounters: false,
    progression: false,
  };
  const featureSettings = {
    save: enableSave,
    inventory: enableInventory,
    dialogue: enableDialogue,
    combat: enableCombat,
    audio: enableAudio,
  };

  const manifest = {
    schemaVersion: 1,
    id: projectId,
    name: gameName,
    version: '0.1.0',
    engineVersion: '0.3.0',
    description: `${genre} game package created with the Pixel Engine New Game Wizard.`,
    contentRoot: './',
    startScene: { type: 'map', id: 'start' },
    startActor: { id: 'player' },
    systems: runtimeSystems,
    data: {
      settings: 'data/config/settings.json',
      saveMetadata: 'data/config/save.json',
      dialogue: 'data/dialogue/dialogue.json',
      audio: 'data/audio/audio.json',
      tiles: 'data/tiles/tiles.json',
      tileEffects: 'data/tiles/effects.json',
      texturePack: 'data/texturepacks/default-pack.json',
      world: 'data/world/world.json',
      classes: 'data/classes/classes.json',
      actors: 'data/actors/actors.json',
      items: 'data/items/items.json',
      enemies: 'data/enemies/enemies.json',
      shops: 'data/shops/shops.json',
      progression: 'data/world/progression.json',
      encounters: 'data/encounters/encounters.json',
      encounterTables: 'data/encounters/tables.json',
      lootTables: 'data/loot/loot-tables.json',
      rewards: 'data/rewards/rewards.json',
      townsDirectory: 'data/towns',
      levelsDirectory: 'data/levels',
      buildingsDirectory: 'data/buildings',
      scenesDirectory: 'data/scenes',
    },
  };

  const settings = {
    schemaVersion: 1,
    gameId: projectId,
    genre,
    tileSize,
    defaultResolution: { width: resolutionWidth, height: resolutionHeight },
    startingMap: { id: 'start', width: mapWidth, height: mapHeight },
    startingPlayer: { id: 'player', name: startingPlayer },
    physicsPreset,
    runtimeSystems,
    features: featureSettings,
    weapons: {
      damageFormula: { characterAttackWeight: 1, weaponPowerWeight: 1, defenseWeight: 1 },
      sellPricePercent: 0.5,
      mana: { defaultMax: 20, regenPerSecond: 1, safeAreaMultiplier: 6 },
      rarities: {
        common: { label: 'Common', color: '#94a3b8', priceMultiplier: 1, statMultiplier: 1 },
        uncommon: { label: 'Uncommon', color: '#4ade80', priceMultiplier: 1.35, statMultiplier: 1.15 },
        rare: { label: 'Rare', color: '#60a5fa', priceMultiplier: 2, statMultiplier: 1.35 },
        epic: { label: 'Epic', color: '#c084fc', priceMultiplier: 3.25, statMultiplier: 1.65 },
        legendary: { label: 'Legendary', color: '#f59e0b', priceMultiplier: 5, statMultiplier: 2 },
      },
      damageTypes: ['physical', 'fire', 'ice', 'lightning', 'poison', 'magic'],
    },
  };

  const saveMetadata = {
    schemaVersion: 1,
    gameId: projectId,
    enabled: enableSave,
    engineSaveVersion: SAVE_SCHEMA_VERSION,
    defaultSlot: 1,
    slots: enableSave ? 1 : 0,
    storageKeyPattern: `pixel_engine_save_${projectId}_slot_{slot}`,
    checkpointMode: enableSave ? 'engine-checkpoint' : 'disabled',
  };

  const actor = {
    id: 'player',
    name: startingPlayer,
    components: {
      movement: { speed: 3 },
      health: { max: 10 },
      combat: enableCombat
        ? { attack: 2, defense: 1, agility: 1, growth: {}, tags: [], unarmed: { enabled: true, power: 1, range: 1.1, cooldown: 0.85 } }
        : { attack: 0, defense: 0, agility: 1, growth: {} },
      wallet: { starting: 0 },
      inventory: { slots: enableInventory ? 12 : 0, maxStack: 99, starting: [] },
      equipment: { starting: {} },
      resources: { mana: { max: 20, regenPerSecond: 1 } },
      progression: { enabled: false },
      render: { fallback: { shape: 'circle', color: '#38bdf8', size: Math.max(12, Math.round(tileSize * 0.625)) } },
    },
  };

  const scene = {
    id: 'start',
    name: 'Starting Scene',
    scene: {
      id: 'start',
      type: 'map',
      mode: 'neutral',
      systems: {
        collision,
        combat: enableCombat ? 'realtime' : false,
        shops: false,
        randomEncounters: false,
        progression: false,
      },
    },
    width: mapWidth,
    height: mapHeight,
    tiles: createMap(mapWidth, mapHeight),
    entities: enableDialogue ? [{
      id: 'welcome_marker',
      type: 'message',
      x: Math.min(2, mapWidth - 2),
      y: 1,
      components: {
        render: { shape: 'diamond', color: '#facc15', size: Math.max(10, Math.round(tileSize * 0.5)) },
        interaction: { action: 'message', message: `Welcome to ${gameName}.`, range: 1.1 },
        collision: { solid: false },
      },
    }] : [],
    objects: { portals: [], shops: [], fountains: [], enemySpawns: [], battleTriggers: [], rewardPickups: [] },
    randomEncounters: { enabled: false, minSeconds: 10, maxSeconds: 60, tableId: null },
    spawn: { x: 1, y: 1 },
  };

  return [
    makeFile(`${root}/game.json`, 'manifest', manifest),
    makeFile(`${root}/data/config/settings.json`, 'settings', settings),
    makeFile(`${root}/data/config/save.json`, 'save metadata', saveMetadata),
    makeFile(`${root}/data/world/world.json`, 'world', {
      towns: ['home'],
      levels: [],
      buildings: [],
      scenes: ['start'],
      startTown: 'home',
      start: { townId: 'home', unlockedTowns: ['home'], unlockedLevels: [], gold: 0 },
    }),
    makeFile(`${root}/data/towns/home.json`, 'safe fallback scene', {
      id: 'home',
      name: 'Safe Home',
      scene: { id: 'home', type: 'town', mode: 'safe', systems: { collision, combat: false, shops: false, randomEncounters: false, progression: false } },
      width: Math.max(5, Math.min(mapWidth, 10)),
      height: Math.max(5, Math.min(mapHeight, 8)),
      tiles: createMap(Math.max(5, Math.min(mapWidth, 10)), Math.max(5, Math.min(mapHeight, 8))),
      entities: [],
      objects: { portals: [], shops: [], fountains: [], enemySpawns: [], battleTriggers: [], rewardPickups: [] },
      randomEncounters: { enabled: false, minSeconds: 10, maxSeconds: 60, tableId: null },
      spawn: { x: 1, y: 1 },
    }),
    makeFile(`${root}/data/world/progression.json`, 'progression', { unlocks: {} }),
    makeFile(`${root}/data/actors/actors.json`, 'actors', { actors: [actor] }),
    makeFile(`${root}/data/classes/classes.json`, 'legacy compatibility', { classes: [] }),
    makeFile(`${root}/data/scenes/start.json`, 'starting scene', scene),
    makeFile(`${root}/data/tiles/tiles.json`, 'tiles', {
      tiles: [
        { id: 'floor', walkable: true, texture: 'floor', minimapColor: '#64748b' },
        { id: 'wall', walkable: false, texture: 'wall', minimapColor: '#1e293b' },
        { id: 'accent', walkable: true, texture: 'accent', minimapColor: '#c084fc' },
      ],
    }),
    makeFile(`${root}/data/tiles/effects.json`, 'tile effects', { effects: [] }),
    makeFile(`${root}/data/texturepacks/default-pack.json`, 'texture pack', {
      id: 'default-pack',
      name: `${gameName} Default Pack`,
      tileSize,
      textures: [
        { id: 'floor', color: '#64748b' },
        { id: 'wall', color: '#1e293b' },
        { id: 'accent', color: '#c084fc' },
      ],
    }),
    makeFile(`${root}/data/items/items.json`, 'items', { items: [] }),
    makeFile(`${root}/data/enemies/enemies.json`, 'enemies', { enemies: [] }),
    makeFile(`${root}/data/shops/shops.json`, 'shops', { catalogs: [], shops: [] }),
    makeFile(`${root}/data/loot/loot-tables.json`, 'equal-chance loot tables', { lootTables: [] }),
    makeFile(`${root}/data/rewards/rewards.json`, 'fixed and three-tier rewards', { rewardPackages: [], completionRewards: [] }),
    makeFile(`${root}/data/encounters/encounters.json`, 'encounters', { encounters: [] }),
    makeFile(`${root}/data/encounters/tables.json`, 'encounter tables', { tables: [] }),
    makeFile(`${root}/data/dialogue/dialogue.json`, 'dialogue', { enabled: enableDialogue, entries: [] }),
    makeFile(`${root}/data/audio/audio.json`, 'audio', { enabled: enableAudio, banks: {} }),
  ];
}

export function buildNewGamePlan(input = {}) {
  const catalog = input.catalog && typeof input.catalog === 'object' ? input.catalog : { games: [] };
  const catalogBaselineContent = String(input.catalogBaselineContent || jsonFileText(catalog));
  const gameName = cleanName(input.gameName);
  const projectId = normalizeGameId(input.internalId);
  const genre = cleanName(input.genre) || 'Adventure';
  const tileSize = integer(input.tileSize, 32);
  const resolutionWidth = integer(input.resolutionWidth, 1280);
  const resolutionHeight = integer(input.resolutionHeight, 720);
  const mapWidth = integer(input.mapWidth, 20);
  const mapHeight = integer(input.mapHeight, 15);
  const startingPlayer = cleanName(input.startingPlayer);
  const physicsPreset = PHYSICS_PRESETS.has(input.physicsPreset) ? input.physicsPreset : 'top_down';
  const enableSave = asBoolean(input.enableSave, true);
  const enableInventory = asBoolean(input.enableInventory, true);
  const enableDialogue = asBoolean(input.enableDialogue, true);
  const enableCombat = asBoolean(input.enableCombat, false);
  const enableAudio = asBoolean(input.enableAudio, true);
  const errors = [];
  const warnings = [];

  if (!gameName) errors.push('Game Name is required.');
  if (!projectId || !GAME_ID_PATTERN.test(projectId)) errors.push('Internal ID must use lowercase letters, numbers, hyphens, or underscores.');
  if ((catalog.games || []).some((game) => normalizeGameId(game?.id) === projectId)) errors.push(`A catalog package already uses “${projectId}”.`);
  if (!startingPlayer) errors.push('Starting Player is required.');
  if (!TILE_SIZES.has(tileSize)) errors.push('Tile Size must be 16, 24, 32, 48, or 64.');
  if (resolutionWidth < 320 || resolutionWidth > 7680 || resolutionHeight < 240 || resolutionHeight > 4320) {
    errors.push('Default Resolution is outside the supported preview range.');
  }
  if (mapWidth < 5 || mapWidth > 100 || mapHeight < 5 || mapHeight > 100) {
    errors.push('Starting Map Size must be between 5 and 100 tiles in each direction.');
  }
  if (!enableSave) warnings.push('Save metadata will be generated with saving disabled.');
  if (!enableDialogue) warnings.push('The starting scene will not include a welcome interaction.');

  const files = [];
  if (!errors.length) {
    const catalogEntry = {
      id: projectId,
      name: gameName,
      description: `${genre} package created by the New Game Wizard`,
    };
    files.push(makeFile(
      'games/catalog.json',
      'catalog',
      appendCatalogGame(catalog, catalogEntry),
      'update',
      catalogBaselineContent,
    ));
    files.push(...createPackageFiles({
      gameName,
      projectId,
      genre,
      tileSize,
      resolutionWidth,
      resolutionHeight,
      mapWidth,
      mapHeight,
      startingPlayer,
      physicsPreset,
      enableSave,
      enableInventory,
      enableDialogue,
      enableCombat,
      enableAudio,
    }));
  }

  return {
    schemaVersion: WORKSPACE_PUBLISH_SCHEMA_VERSION,
    kind: 'new-game',
    repository: WORKSPACE_PUBLISH_REPOSITORY,
    baseBranch: WORKSPACE_PUBLISH_BASE_BRANCH,
    projectId,
    createdAt: new Date().toISOString(),
    files,
    errors,
    warnings,
    summary: {
      gameName,
      genre,
      tileSize,
      defaultResolution: { width: resolutionWidth, height: resolutionHeight },
      startingMap: { width: mapWidth, height: mapHeight },
      startingPlayer,
      physicsPreset,
    },
  };
}