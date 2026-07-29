import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const validModes = new Set(['safe', 'adventure', 'neutral']);
const booleanSystems = new Set([
  'movement',
  'collision',
  'inventory',
  'equipment',
  'shops',
  'randomEncounters',
  'progression',
]);
const knownSystems = new Set([...booleanSystems, 'combat']);

function fail(message) {
  failures.push(message);
}

function readJson(file, label = path.relative(repoRoot, file)) {
  if (!existsSync(file)) {
    fail(`${label}: file does not exist`);
    return {};
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${label}: invalid JSON (${error.message})`);
    return {};
  }
}

function walk(directory, predicate = () => true) {
  if (!existsSync(directory)) return [];
  const output = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) output.push(...walk(full, predicate));
    else if (predicate(full)) output.push(full);
  }
  return output;
}

function contentRoot(manifestFile, manifest) {
  return path.resolve(path.dirname(manifestFile), String(manifest.contentRoot || './'));
}

function validateSystems(systems, label) {
  if (systems === undefined) return;
  if (!systems || typeof systems !== 'object' || Array.isArray(systems)) {
    fail(`${label}: systems must be an object`);
    return;
  }

  for (const [name, value] of Object.entries(systems)) {
    if (!knownSystems.has(name)) {
      fail(`${label}: unknown system "${name}"`);
      continue;
    }
    if (booleanSystems.has(name) && typeof value !== 'boolean') {
      fail(`${label}: system "${name}" must be boolean`);
    }
    if (name === 'combat' && typeof value !== 'boolean' && typeof value !== 'string') {
      fail(`${label}: combat must be boolean or a named mode`);
    }
  }
}

function validateSceneMetadata(map, label, fallbackType) {
  if (map.scene === undefined) return;
  if (!map.scene || typeof map.scene !== 'object' || Array.isArray(map.scene)) {
    fail(`${label}: scene metadata must be an object`);
    return;
  }
  if (map.scene.id && map.scene.id !== map.id) {
    fail(`${label}: scene.id must match map id`);
  }
  if (map.scene.mode && !validModes.has(map.scene.mode)) {
    fail(`${label}: unsupported scene mode "${map.scene.mode}"`);
  }
  if (map.scene.type !== undefined && (typeof map.scene.type !== 'string' || !map.scene.type.trim())) {
    fail(`${label}: scene.type must be a non-empty string`);
  }
  validateSystems(map.scene.systems, `${label}:scene`);

  if (!map.scene.mode && fallbackType === 'map') {
    fail(`${label}: generic scenes must declare scene.mode`);
  }
}

function auditPackage(manifestFile) {
  const manifest = readJson(manifestFile);
  const gameId = manifest.id || path.basename(path.dirname(manifestFile));
  const root = contentRoot(manifestFile, manifest);
  const worldFile = path.resolve(root, String(manifest.data?.world || 'data/world/world.json'));
  const world = readJson(worldFile, `${gameId}:world`);
  validateSystems(manifest.systems, `${gameId}:manifest`);

  const groups = [
    { type: 'town', ids: world.towns || [], directory: manifest.data?.townsDirectory || 'data/towns' },
    { type: 'level', ids: world.levels || [], directory: manifest.data?.levelsDirectory || 'data/levels' },
    { type: 'map', ids: world.scenes || [], directory: manifest.data?.scenesDirectory || 'data/scenes' },
  ];

  const allIds = new Set();
  const maps = [];
  for (const group of groups) {
    if (!Array.isArray(group.ids)) {
      fail(`${gameId}: world ${group.type} list must be an array`);
      continue;
    }
    const directory = path.resolve(root, group.directory);
    for (const id of group.ids) {
      if (typeof id !== 'string' || !id.trim()) {
        fail(`${gameId}: ${group.type} id must be a non-empty string`);
        continue;
      }
      if (allIds.has(id)) fail(`${gameId}: duplicate scene id "${id}" across world groups`);
      allIds.add(id);
      const file = path.join(directory, `${id}.json`);
      const map = readJson(file, `${gameId}:${group.type}:${id}`);
      if (map.id && map.id !== id) fail(`${gameId}:${group.type}:${id}: map id does not match filename`);
      validateSceneMetadata(map, `${gameId}:${group.type}:${id}`, group.type);
      maps.push(map);
    }
  }

  const startSceneId = manifest.startScene?.id || world.start?.townId || world.startTown;
  if (!startSceneId) {
    fail(`${gameId}: no start scene is configured`);
  } else if (!allIds.has(startSceneId)) {
    fail(`${gameId}: start scene "${startSceneId}" is not listed in the world`);
  }

  for (const map of maps) {
    for (const portal of map.objects?.portals || []) {
      if (portal.targetScene && !allIds.has(portal.targetScene)) {
        fail(`${gameId}:${map.id}: portal targets missing scene "${portal.targetScene}"`);
      }
      if (portal.targetLevel && !allIds.has(portal.targetLevel)) {
        fail(`${gameId}:${map.id}: portal targets missing level scene "${portal.targetLevel}"`);
      }
    }
  }

  console.log(`Scene contract ${gameId}: ${allIds.size} registered scene(s).`);
}

const manifests = walk(path.join(repoRoot, 'games'), (file) => file.endsWith(`${path.sep}game.json`));
manifests.forEach(auditPackage);

if (failures.length) {
  console.error(`\nScene contract audit failed with ${failures.length} issue(s):`);
  failures.forEach((message, index) => console.error(`${index + 1}. ${message}`));
  process.exit(1);
}

console.log(`\nScene and system contract audit passed for ${manifests.length} game package(s).`);
