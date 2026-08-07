import {
  CUSTOM_TEXTURE_LIBRARY_KEY,
  TESTING_LEVEL_LIBRARY_KEY,
  TESTING_LEVEL_PREVIEW_KEY,
  collectUsedCustomTextures,
  createTestingLevelEntry,
  findTestingLevel,
  normalizeTestingLibrary,
  normalizeTestingMap,
  upsertTestingLevel,
} from './testing-library-model.js';

const params = new URL(window.location.href).searchParams;
let activeLibraryId = params.get('testing') && params.get('testing') !== 'new'
  ? params.get('testing')
  : '';

installHeaderLinks();
installTestingButtons();
loadRequestedTestingLevel();

function installHeaderLinks() {
  const header = document.querySelector('.site-header');
  if (!header || document.getElementById('testingSpaceHeaderLink')) return;

  const mainHub = document.createElement('a');
  mainHub.id = 'mainHubHeaderLink';
  mainHub.className = 'file-label';
  mainHub.href = '../';
  mainHub.textContent = 'Main Hub';
  mainHub.style.cssText = 'display:inline-block;margin-top:.75rem;margin-right:.5rem;text-decoration:none;';

  const testingSpace = document.createElement('a');
  testingSpace.id = 'testingSpaceHeaderLink';
  testingSpace.className = 'file-label';
  testingSpace.href = 'testing-space.html';
  testingSpace.textContent = 'Testing Space';
  testingSpace.style.cssText = 'display:inline-block;margin-top:.75rem;text-decoration:none;';

  header.append(mainHub, testingSpace);
}

function installTestingButtons() {
  const exportButton = document.getElementById('exportGameBtn');
  const actions = exportButton?.parentElement;
  if (!actions || document.getElementById('saveTestingLevelBtn')) return;

  const save = document.createElement('button');
  save.id = 'saveTestingLevelBtn';
  save.type = 'button';
  save.className = 'secondary-btn';
  save.textContent = 'Save to Testing Space';
  save.addEventListener('click', () => saveCurrentTestingLevel(false));

  const saveAndTest = document.createElement('button');
  saveAndTest.id = 'saveAndTestLevelBtn';
  saveAndTest.type = 'button';
  saveAndTest.className = 'secondary-btn';
  saveAndTest.textContent = 'Save & Test';
  saveAndTest.addEventListener('click', () => saveCurrentTestingLevel(true));

  const manage = document.createElement('a');
  manage.id = 'manageTestingLevelsLink';
  manage.className = 'file-label';
  manage.href = 'testing-space.html';
  manage.textContent = 'Manage Testing Levels';

  actions.insertBefore(save, document.getElementById('clearBtn'));
  actions.insertBefore(saveAndTest, document.getElementById('clearBtn'));
  actions.insertBefore(manage, document.getElementById('clearBtn'));
}

function loadRequestedTestingLevel() {
  if (!activeLibraryId) {
    if (params.get('testing') === 'new') {
      setBuilderMessage('New testing level. Build freely, then use Save to Testing Space.');
    }
    return;
  }

  const library = readLibrary();
  const entry = findTestingLevel(library, activeLibraryId);
  if (!entry) {
    setBuilderMessage('The requested testing level was not found. A new unsaved map is open instead.', true);
    activeLibraryId = '';
    return;
  }

  try {
    if (restoreBundledTextures(entry)) {
      const reloadUrl = new URL(window.location.href);
      reloadUrl.searchParams.set('testingTextures', 'restored');
      window.location.replace(reloadUrl.href);
      return;
    }
  } catch (error) {
    setBuilderMessage(`Saved custom textures could not be restored: ${error.message}. The map will still open with fallback colors.`, true);
  }

  const importInput = document.getElementById('importInput');
  if (!importInput) {
    setBuilderMessage('Testing level could not open because the builder import control is unavailable.', true);
    return;
  }

  try {
    const file = new File([JSON.stringify(entry.map)], `${entry.map.mapId}.json`, { type: 'application/json' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    importInput.files = transfer.files;
    importInput.dispatchEvent(new Event('change', { bubbles: true }));
    setTimeout(() => setBuilderMessage(`Testing level “${entry.name}” loaded. Save updates back to the Testing Space.`), 0);
  } catch (error) {
    setBuilderMessage(`Testing level could not be handed to the builder: ${error.message}`, true);
  }
}

function restoreBundledTextures(entry) {
  if (!entry.textures?.length) return false;
  const raw = localStorage.getItem(CUSTOM_TEXTURE_LIBRARY_KEY);
  let library = { version: 1, textures: [] };
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && Array.isArray(parsed.textures)) library = parsed;
  } catch {
    library = { version: 1, textures: [] };
  }

  const existingIds = new Set(library.textures.map((texture) => texture?.id).filter(Boolean));
  const missing = entry.textures.filter((texture) => texture?.id && !existingIds.has(texture.id));
  if (!missing.length) return false;
  localStorage.setItem(CUSTOM_TEXTURE_LIBRARY_KEY, JSON.stringify({
    version: 1,
    textures: [...missing, ...library.textures],
  }));
  return true;
}

function saveCurrentTestingLevel(openPreview) {
  try {
    const map = captureCurrentMap();
    const library = readLibrary();
    const existing = activeLibraryId ? findTestingLevel(library, activeLibraryId) : null;
    const textureLibrary = readTextureLibrary();
    const textures = collectUsedCustomTextures(map, textureLibrary);
    const entry = createTestingLevelEntry({ map, textures, existing });
    const next = upsertTestingLevel(library, entry);
    localStorage.setItem(TESTING_LEVEL_LIBRARY_KEY, JSON.stringify(next));
    activeLibraryId = entry.libraryId;

    const url = new URL(window.location.href);
    url.searchParams.set('testing', entry.libraryId);
    url.searchParams.delete('testingTextures');
    window.history.replaceState(null, '', url);

    setBuilderMessage(`Saved “${entry.name}” to the Testing Space${textures.length ? ` with ${textures.length} used custom texture${textures.length === 1 ? '' : 's'}` : ''}.`);

    if (openPreview) {
      localStorage.setItem(TESTING_LEVEL_PREVIEW_KEY, JSON.stringify(entry.map));
      window.location.href = `viewer.html?autoload=1&from=testing&testing=${encodeURIComponent(entry.libraryId)}`;
    }
  } catch (error) {
    setBuilderMessage(`Testing level was not saved: ${error.message}`, true);
  }
}

function captureCurrentMap() {
  const width = Number(document.getElementById('mapWidthInput')?.value);
  const height = Number(document.getElementById('mapHeightInput')?.value);
  const mapType = document.getElementById('mapTypeSelect')?.value || 'level';
  const mapId = document.getElementById('mapIdInput')?.value || 'testing_level';
  const mapName = document.getElementById('mapNameInput')?.value || 'Testing Level';

  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('Map size is invalid.');
  }

  const tileLayer = Array.from({ length: height }, () => Array(width).fill('empty'));
  const objectLayer = Array.from({ length: height }, () => Array(width).fill('none'));
  const cells = document.querySelectorAll('#gridContainer .cell[data-row][data-col]');
  if (cells.length !== width * height) {
    throw new Error('Builder grid is not fully rendered yet.');
  }

  cells.forEach((cell) => {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= height || col < 0 || col >= width) return;
    tileLayer[row][col] = cell.dataset.tileId || 'empty';
    const marker = cell.querySelector('.cell-marker');
    objectLayer[row][col] = marker?.title || 'none';
  });

  return normalizeTestingMap({
    width,
    height,
    mapType,
    mapId,
    mapName,
    tileLayer,
    objectLayer,
  });
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

function setBuilderMessage(text, isError = false) {
  const message = document.getElementById('message');
  if (!message) return;
  message.textContent = text;
  message.style.color = isError ? '#b42318' : '#42556f';
}
