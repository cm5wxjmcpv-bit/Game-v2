import { getActiveGameId } from './gameManifest.js';

const SAVE_VERSION = 4;
const DEFAULT_SLOT = 1;
const LEGACY_SAVE_KEYS = ['pixel_engine_save_v2', 'pixel_engine_save_v1'];

export function getSaveStorageKey(slot = DEFAULT_SLOT) {
  const safeSlot = Number.isInteger(slot) && slot > 0 ? slot : DEFAULT_SLOT;
  return `pixel_engine_save_${getActiveGameId()}_slot_${safeSlot}`;
}

export function saveGame(snapshot, slot = DEFAULT_SLOT) {
  try {
    localStorage.setItem(getSaveStorageKey(slot), JSON.stringify(withSaveMetadata(snapshot, slot)));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(slot = DEFAULT_SLOT) {
  try {
    const gameId = getActiveGameId();
    let raw = localStorage.getItem(getSaveStorageKey(slot));

    // Preserve saves created before game packages existed for the original sample game.
    if (!raw && gameId === 'sample-rpg') {
      raw = LEGACY_SAVE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean) || null;
    }

    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const payload = parsed.payload ? parsed.payload : parsed;
    return validateSnapshot(payload) ? payload : null;
  } catch {
    return null;
  }
}

function validateSnapshot(snapshot) {
  const player = snapshot?.player;
  const sceneId = typeof snapshot?.currentSceneId === 'string' && snapshot.currentSceneId.trim()
    ? snapshot.currentSceneId
    : typeof snapshot?.currentTownId === 'string' && snapshot.currentTownId.trim()
      ? snapshot.currentTownId
      : '';
  if (!player || typeof player !== 'object' || !sceneId) return false;
  if (!Number.isFinite(player.speed) || !Number.isFinite(player.gold)) return false;
  if (!player.stats || !Number.isFinite(player.stats.hp) || !Number.isFinite(player.stats.maxHp)) return false;
  if (!player.bag || !Array.isArray(player.bag.items) || !Number.isInteger(player.bag.slots) || player.bag.slots < 0) return false;
  if (!player.unlocks || !Array.isArray(player.unlocks.towns) || !Array.isArray(player.unlocks.levels)) return false;
  if (!Array.isArray(player.completedLevels) || !Array.isArray(player.effects)) return false;
  if (!player.equipment || typeof player.equipment !== 'object') return false;
  return true;
}

function withSaveMetadata(payload, slot) {
  return {
    version: SAVE_VERSION,
    gameId: getActiveGameId(),
    slot,
    checkpointAt: new Date().toISOString(),
    payload,
  };
}

export function exportSaveAdapter(snapshot, slot = DEFAULT_SLOT) {
  // Future cloud hook (Google Sheets / API).
  return withSaveMetadata(snapshot, slot);
}
