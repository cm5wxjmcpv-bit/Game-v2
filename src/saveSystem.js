const SAVE_KEY = 'pixel_engine_save_v1';

export function saveGame(snapshot) {
  localStorage.setItem(SAVE_KEY, JSON.stringify(snapshot));
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function exportSaveAdapter(snapshot) {
  // Future cloud hook (Google Sheets / API).
  return {
    version: 1,
    checkpointAt: new Date().toISOString(),
    payload: snapshot,
  };
}
