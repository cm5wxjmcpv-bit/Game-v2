import { getActiveGameId } from './gameManifest.js';

const SAVE_VERSION = 4;
const DEFAULT_SLOT = 1;
const LEGACY_SAVE_KEYS = ['pixel_engine_save_v2', 'pixel_engine_save_v1'];

export function getSaveStorageKey(slot = DEFAULT_SLOT) {
  const safeSlot = Number.isInteger(slot) && slot > 0 ? slot : DEFAULT_SLOT;
  return `pixel_engine_save_${getActiveGameId()}_slot_${safeSlot}`;
}

export function saveGame(snapshot, slot = DEFAULT_SLOT) {
  localStorage.setItem(getSaveStorageKey(slot), JSON.stringify(withSaveMetadata(snapshot, slot)));
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
  if (!snapshot?.player) return false;
  return typeof snapshot.currentSceneId === 'string' || typeof snapshot.currentTownId === 'string';
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
