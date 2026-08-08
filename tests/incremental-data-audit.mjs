import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { normalizeIncrementalConfig } from '../src/incrementalContent.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalog = JSON.parse(readFileSync(path.join(repoRoot, 'games/catalog.json'), 'utf8'));
const failures = [];
let audited = 0;

function fail(message) {
  failures.push(message);
}

function readJson(file, label) {
  if (!existsSync(file)) {
    fail(`${label}: file does not exist`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    fail(`${label}: invalid JSON (${error.message})`);
    return null;
  }
}

for (const entry of catalog.games || []) {
  if (entry?.gameType !== 'incremental') continue;
  audited += 1;
  const gameId = String(entry.id || '');
  const manifestFile = path.join(repoRoot, 'games', gameId, 'game.json');
  const manifest = readJson(manifestFile, `${gameId}:manifest`);
  if (!manifest) continue;
  if (manifest.gameType !== 'incremental') {
    fail(`${gameId}: manifest gameType must be incremental`);
    continue;
  }

  const contentRoot = path.resolve(path.dirname(manifestFile), String(manifest.contentRoot || './'));
  const relativeRoot = path.relative(repoRoot, contentRoot);
  if (relativeRoot.startsWith('..') || path.isAbsolute(relativeRoot)) {
    fail(`${gameId}: contentRoot resolves outside the repository`);
    continue;
  }

  const incrementalPath = manifest.data?.incremental;
  if (typeof incrementalPath !== 'string' || !incrementalPath.trim()) {
    fail(`${gameId}: manifest.data.incremental is missing`);
    continue;
  }
  const contentFile = path.resolve(contentRoot, incrementalPath);
  const relativeContent = path.relative(contentRoot, contentFile);
  if (relativeContent.startsWith('..') || path.isAbsolute(relativeContent)) {
    fail(`${gameId}: incremental data resolves outside its content root`);
    continue;
  }

  const payload = readJson(contentFile, `${gameId}:incremental`);
  if (!payload) continue;
  try {
    const normalized = normalizeIncrementalConfig(payload, { gameId });
    console.log(`Incremental contract ${gameId}: ${normalized.resources.length} resource(s), ${normalized.deposits.length} deposit(s), ${normalized.mines.length} mine(s), ${normalized.rareFinds.finds.length} rare find(s), ${normalized.miningEvents.events.length} mining event(s), ${normalized.equipment.items.length} equipment item(s), ${normalized.lottery.scratchTickets.length} scratch ticket(s), ${normalized.generators.length} generator(s), ${normalized.businessUpgrades.length} business upgrade(s), ${normalized.offlineProgress.capSeconds}s offline cap.`);
  } catch (error) {
    fail(`${gameId}: ${error.message}`);
  }
}

if (!audited) fail('No incremental package is registered in games/catalog.json.');

if (failures.length) {
  console.error(`\nIncremental data audit failed with ${failures.length} issue(s):`);
  failures.forEach((message, index) => console.error(`${index + 1}. ${message}`));
  process.exit(1);
}

console.log(`\nIncremental data audit passed for ${audited} package(s).`);
