async function loadJSON(path, fallback = null) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Failed to load ${path} (${res.status})`);
    return await res.json();
  } catch (error) {
    console.warn(`[DataLoader] ${error.message}`);
    if (fallback !== null) return fallback;
    throw error;
  }
}

function mapById(list, label) {
  const entries = (list || []).filter((entry) => entry?.id);
  if (entries.length !== (list || []).length) {
    console.warn(`[DataLoader] Some ${label} entries are missing an id.`);
  }
  return Object.fromEntries(entries.map((entry) => [entry.id, entry]));
}

function withWorldDefaults(world) {
  const start = world.start || {};
  return {
    ...world,
    towns: world.towns || [],
    levels: world.levels || [],
    startTown: world.startTown || start.townId || world.towns?.[0] || null,
    start: {
      townId: start.townId || world.startTown || world.towns?.[0] || null,
      unlockedTowns: start.unlockedTowns || [world.startTown || world.towns?.[0]].filter(Boolean),
      unlockedLevels: start.unlockedLevels || [world.levels?.[0]].filter(Boolean),
      gold: start.gold ?? 100,
    },
  };
}

export async function loadDatabase() {
  const [tiles, tileEffects, texturePack, rawWorld, classes, items, enemies, shops, progression] = await Promise.all([
    loadJSON('./data/tiles/tiles.json', { tiles: [] }),
    loadJSON('./data/tiles/effects.json', { effects: [] }),
    loadJSON('./data/texturepacks/default-pack.json', { textures: [] }),
    loadJSON('./data/world/world.json', {}),
    loadJSON('./data/classes/classes.json', { classes: [] }),
    loadJSON('./data/items/items.json', { items: [] }),
    loadJSON('./data/enemies/enemies.json', { enemies: [] }),
    loadJSON('./data/shops/shops.json', { shops: [] }),
    loadJSON('./data/world/progression.json', { unlocks: {} }),
  ]);

  const world = withWorldDefaults(rawWorld);
  const townMaps = await Promise.all(world.towns.map((id) => loadJSON(`./data/towns/${id}.json`)));
  const levelMaps = await Promise.all(world.levels.map((id) => loadJSON(`./data/levels/${id}.json`)));

  return {
    tileDefs: mapById(tiles.tiles, 'tile'),
    tileEffects: mapById(tileEffects.effects, 'tile effect'),
    texturePack: mapById(texturePack.textures, 'texture'),
    classesById: mapById(classes.classes, 'class'),
    classes: classes.classes || [],
    itemsById: mapById(items.items, 'item'),
    enemiesById: mapById(enemies.enemies, 'enemy'),
    shopsById: mapById(shops.shops, 'shop'),
    townsById: Object.fromEntries(townMaps.filter((m) => m?.id).map((m) => [m.id, m])),
    levelsById: Object.fromEntries(levelMaps.filter((m) => m?.id).map((m) => [m.id, m])),
    progression,
    world,
  };
}
