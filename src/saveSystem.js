const SAVE_KEY = 'pixel_engine_save_v2';

export function saveGame(snapshot) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(withSaveMetadata(snapshot)));
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY) || localStorage.getItem('pixel_engine_save_v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const payload = parsed.payload ? parsed.payload : parsed;
    return validateSnapshot(payload) ? payload : null;
  } catch {
    return null;
  }
}

function validateSnapshot(snapshot) {
  return Boolean(snapshot?.player && typeof snapshot.currentTownId === 'string');
}

function withSaveMetadata(payload) {
  return {
    version: 2,
    checkpointAt: new Date().toISOString(),
    payload,
  };
}

export function exportSaveAdapter(snapshot) {
  // Future cloud hook (Google Sheets / API).
  return withSaveMetadata(snapshot);
}
