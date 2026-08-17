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
    console.log(`Skipped ${gameId}: map NPC templates do not apply to the incremental runtime.`);
    continue;
  }
  const contentRoot = path.resolve(path.dirname(manifestFile), String(manifest.contentRoot || './'));
  const npcPath = manifest.data?.npcs;
  if (typeof npcPath !== 'string' || !npcPath.trim()) {
    fail(`${gameId}: manifest.data.npcs is missing`);
    continue;
  }
  const npcFile = path.resolve(contentRoot, npcPath);
  const relativeNpcFile = path.relative(contentRoot, npcFile);
  if (relativeNpcFile.startsWith('..') || path.isAbsolute(relativeNpcFile)) {
    fail(`${gameId}: manifest.data.npcs resolves outside the package content root`);
    continue;
  }
  const payload = readJson(npcFile, `${gameId}:npcs`);
  if (!Array.isArray(payload.npcs)) {
    fail(`${gameId}: NPC payload must contain an npcs array`);
    continue;
  }
  const ids = new Set();
  for (const npc of payload.npcs) {
    const id = String(npc?.id || '');
    if (!id) fail(`${gameId}: NPC entry is missing id`);
    if (ids.has(id)) fail(`${gameId}: duplicate NPC ID “${id}”`);
    ids.add(id);
  }
  console.log(`Audited ${gameId}: ${payload.npcs.length} NPC template(s) in ${npcPath}.`);
}

if (failures.length) {
  console.error('\nNPC data audit failed:');
  failures.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}

console.log('\nNPC data audit passed.');
