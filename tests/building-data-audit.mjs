import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(path.join(repoRoot, 'games/catalog.json'), 'utf8'));
const failures = [];

function fail(message) {
  failures.push(message);
}

function readJson(file, label) {
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

for (const game of catalog.games || []) {
  const gameId = String(game?.id || '');
  const manifestFile = path.join(repoRoot, 'games', gameId, 'game.json');
  const manifest = readJson(manifestFile, `${gameId}:manifest`);
  if (manifest.gameType === 'incremental') {
    console.log(`Skipped ${gameId}: Building maps do not apply to the incremental runtime.`);
    continue;
  }
  const contentRoot = path.resolve(path.dirname(manifestFile), String(manifest.contentRoot || './'));
  const buildingsDirectory = manifest.data?.buildingsDirectory;
  if (typeof buildingsDirectory !== 'string' || !buildingsDirectory.trim()) {
    fail(`${gameId}: manifest.data.buildingsDirectory is missing`);
    continue;
  }

  const buildingRoot = path.resolve(contentRoot, buildingsDirectory);
  const relativeBuildingRoot = path.relative(contentRoot, buildingRoot);
  if (relativeBuildingRoot.startsWith('..') || path.isAbsolute(relativeBuildingRoot)) {
    fail(`${gameId}: buildingsDirectory resolves outside the package content root`);
    continue;
  }

  const worldPath = manifest.data?.world;
  if (!worldPath) {
    fail(`${gameId}: manifest.data.world is missing`);
    continue;
  }
  const world = readJson(path.resolve(contentRoot, worldPath), `${gameId}:world`);
  const buildingIds = world.buildings === undefined ? [] : world.buildings;
  if (!Array.isArray(buildingIds)) {
    fail(`${gameId}: world.buildings must be an array when present`);
    continue;
  }

  const seen = new Set();
  for (const idValue of buildingIds) {
    const id = String(idValue || '');
    if (!id) {
      fail(`${gameId}: world.buildings contains an empty ID`);
      continue;
    }
    if (seen.has(id)) fail(`${gameId}: duplicate Building ID “${id}”`);
    seen.add(id);
    const file = path.join(buildingRoot, `${id}.json`);
    const map = readJson(file, `${gameId}:building:${id}`);
    if (map.id && map.id !== id) fail(`${gameId}: building file ${id}.json contains id “${map.id}”`);
    if (!Number.isInteger(map.width) || map.width <= 0) fail(`${gameId}:building:${id}: invalid width`);
    if (!Number.isInteger(map.height) || map.height <= 0) fail(`${gameId}:building:${id}: invalid height`);
    if (!Array.isArray(map.tiles) || map.tiles.length !== map.height) {
      fail(`${gameId}:building:${id}: tile rows do not match height`);
    } else if (map.tiles.some((row) => !Array.isArray(row) || row.length !== map.width)) {
      fail(`${gameId}:building:${id}: tile columns do not match width`);
    }
    if (!map.spawn || !Number.isFinite(map.spawn.x) || !Number.isFinite(map.spawn.y)) {
      fail(`${gameId}:building:${id}: invalid spawn`);
    }
    if (map.scene?.type && map.scene.type !== 'building') {
      fail(`${gameId}:building:${id}: scene.type must be “building” when declared`);
    }
  }

  console.log(`Audited ${gameId}: Building directory ${buildingsDirectory}, ${buildingIds.length} registered Building(s).`);
}

if (failures.length) {
  console.error('\nBuilding data audit failed:');
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('\nBuilding data audit passed.');
