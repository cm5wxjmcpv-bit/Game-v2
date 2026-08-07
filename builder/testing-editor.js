import {
  CUSTOM_TEXTURE_LIBRARY_KEY,
  TESTING_LEVEL_LIBRARY_KEY,
  collectUsedCustomTextures,
  createTestingLevelEntry,
  findTestingLevel,
  normalizeTestingLibrary,
  normalizeTestingMap,
  upsertTestingLevel,
} from './testing-library-model.js';

const frame = document.getElementById('testingBuilderFrame');
const title = document.getElementById('testingEditorTitle');
const status = document.getElementById('testingEditorStatus');
const saveButton = document.getElementById('testingSaveBtn');
const saveTestButton = document.getElementById('testingSaveTestBtn');
const params = new URL(window.location.href).searchParams;

let library = readLibrary();
let activeLibraryId = params.get('testing') && params.get('testing') !== 'new' ? params.get('testing') : '';
let activeEntry = activeLibraryId ? findTestingLevel(library, activeLibraryId) : null;

if (activeLibraryId && !activeEntry) {
  setStatus('Requested testing level was not found. A new map will be opened instead.', true);
  activeLibraryId = '';
}

if (activeEntry) {
  title.textContent = `Testing Level: ${activeEntry.name}`;
  try {
    restoreBundledTextures(activeEntry);
  } catch (error) {
    setStatus(`Custom textures could not be restored: ${error.message}. The map will still open with fallback colors.`, true);
  }
} else {
  title.textContent = 'New Testing Level';
}

frame.addEventListener('load', () => {
  try {
    if (activeEntry) importMapIntoBuilder(activeEntry.map);
    saveButton.disabled = false;
    saveTestButton.disabled = false;
    if (activeEntry) {
      window.setTimeout(() => setStatus(`“${activeEntry.name}” loaded. Changes remain in the Testing Space until saved.`), 60);
    } else {
      setStatus('New testing map ready. Build freely, then save it to the Testing Space.');
    }
  } catch (error) {
    setStatus(`Builder handoff failed: ${error.message}`, true);
  }
});

saveButton.addEventListener('click', () => saveCurrentLevel(false));
saveTestButton.addEventListener('click', () => saveCurrentLevel(true));

frame.src = 'index.html';

function importMapIntoBuilder(map) {
  const doc = frame.contentDocument;
  const input = doc?.getElementById('importInput');
  if (!input) throw new Error('Builder import control is unavailable.');
  const file = new File([JSON.stringify(map)], `${map.mapId}.json`, { type: 'application/json' });
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function saveCurrentLevel(openTest) {
  try {
    const map = captureBuilderMap();
    library = readLibrary();
    const existing = activeLibraryId ? findTestingLevel(library, activeLibraryId) : null;
    const textures = collectUsedCustomTextures(map, readTextureLibrary());
    const entry = createTestingLevelEntry({ map, textures, existing });
    const nextLibrary = upsertTestingLevel(library, entry);
    localStorage.setItem(TESTING_LEVEL_LIBRARY_KEY, JSON.stringify(nextLibrary));

    library = nextLibrary;
    activeLibraryId = entry.libraryId;
    activeEntry = entry;
    title.textContent = `Testing Level: ${entry.name}`;

    const url = new URL(window.location.href);
    url.searchParams.set('testing', activeLibraryId);
    window.history.replaceState(null, '', url);

    setStatus(`Saved “${entry.name}”${textures.length ? ` with ${textures.length} used custom texture${textures.length === 1 ? '' : 's'}` : ''}.`);

    if (openTest) {
      window.location.href = `testing-viewer.html?testing=${encodeURIComponent(activeLibraryId)}`;
    }
  } catch (error) {
    setStatus(`Level was not saved: ${error.message}`, true);
  }
}

function captureBuilderMap() {
  const doc = frame.contentDocument;
  if (!doc) throw new Error('Builder is not available.');

  const width = Number(doc.getElementById('mapWidthInput')?.value);
  const height = Number(doc.getElementById('mapHeightInput')?.value);
  const mapType = doc.getElementById('mapTypeSelect')?.value || 'level';
  const mapId = doc.getElementById('mapIdInput')?.value || 'testing_level';
  const mapName = doc.getElementById('mapNameInput')?.value || 'Testing Level';

  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('Builder map size is invalid.');
  }

  const tileLayer = Array.from({ length: height }, () => Array(width).fill('empty'));
  const objectLayer = Array.from({ length: height }, () => Array(width).fill('none'));
  const cells = doc.querySelectorAll('#gridContainer .cell[data-row][data-col]');
  if (cells.length !== width * height) {
    throw new Error('Builder grid is not fully rendered yet.');
  }

  cells.forEach((cell) => {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= height || col < 0 || col >= width) return;
    tileLayer[row][col] = cell.dataset.tileId || 'empty';
    objectLayer[row][col] = cell.querySelector('.cell-marker')?.title || 'none';
  });

  return normalizeTestingMap({ width, height, mapType, mapId, mapName, tileLayer, objectLayer });
}

function readLibrary() {
  try {
    const raw = localStorage.getItem(TESTING_LEVEL_LIBRARY_KEY);
    return normalizeTestingLibrary(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeTestingLibrary(null);
  }
}

function readTextureLibrary() {
  try {
    const raw = localStorage.getItem(CUSTOM_TEXTURE_LIBRARY_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && Array.isArray(parsed.textures) ? parsed : { version: 1, textures: [] };
  } catch {
    return { version: 1, textures: [] };
  }
}

function restoreBundledTextures(entry) {
  if (!entry.textures?.length) return;
  const current = readTextureLibrary();
  const ids = new Set(current.textures.map((texture) => texture?.id).filter(Boolean));
  const missing = entry.textures.filter((texture) => texture?.id && !ids.has(texture.id));
  if (!missing.length) return;
  localStorage.setItem(CUSTOM_TEXTURE_LIBRARY_KEY, JSON.stringify({
    version: 1,
    textures: [...missing, ...current.textures],
  }));
}

function setStatus(text, isError = false) {
  status.textContent = text;
  status.classList.toggle('error', isError);
}
