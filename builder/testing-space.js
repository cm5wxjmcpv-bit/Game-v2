import {
  TESTING_LEVEL_LIBRARY_KEY,
  createTestingLevelEntry,
  deleteTestingLevel,
  findTestingLevel,
  normalizeTestingLibrary,
  normalizeTestingMap,
  upsertTestingLevel,
} from './testing-library-model.js';
import {
  TESTING_ADD_TO_GAME_PENDING_KEY,
  createTestingAddToGameRequest,
} from './testing-add-to-game-model.js';

const CATALOG_URL = new URL('../games/catalog.json', window.location.href);
const dom = {
  summary: document.getElementById('testingSummary'),
  list: document.getElementById('testingLevelList'),
  message: document.getElementById('testingMessage'),
  importInput: document.getElementById('testingImportInput'),
  addDialog: document.getElementById('testingAddDialog'),
  addForm: document.getElementById('testingAddForm'),
  addLevelLabel: document.getElementById('testingAddLevelLabel'),
  addGameSelect: document.getElementById('testingAddGameSelect'),
  addStatus: document.getElementById('testingAddStatus'),
  addCancel: document.getElementById('testingAddCancelBtn'),
  addConfirm: document.getElementById('testingAddConfirmBtn'),
};

let library = readLibrary();
let catalog = [];
let pendingAddLibraryId = '';
render();
loadGameCatalog();

dom.importInput.addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    const map = normalizeTestingMap(parsed);
    const entry = createTestingLevelEntry({ map });
    const next = upsertTestingLevel(library, entry);
    persistLibrary(next);
    library = next;
    setMessage(`Imported “${entry.name}” into the Testing Space.`);
    render();
  } catch (error) {
    setMessage(`Import failed: ${error.message}`, true);
  }
});

dom.list.addEventListener('click', (event) => {
  const button = event.target.closest('[data-testing-action]');
  if (!button) return;
  const libraryId = button.dataset.libraryId || '';
  const action = button.dataset.testingAction;
  const entry = findTestingLevel(library, libraryId);
  if (!entry) {
    setMessage('That testing map is no longer available.', true);
    render();
    return;
  }

  if (action === 'add') {
    openAddToGameDialog(entry);
    return;
  }

  if (action === 'edit') {
    window.location.href = `testing-editor.html?testing=${encodeURIComponent(entry.libraryId)}`;
    return;
  }

  if (action === 'test') {
    window.location.href = `testing-viewer.html?testing=${encodeURIComponent(entry.libraryId)}`;
    return;
  }

  if (action === 'export') {
    downloadJson(entry.map, `${entry.map.mapId}_testing.json`);
    setMessage(`Exported “${entry.name}”.`);
    return;
  }

  if (action === 'duplicate') {
    const duplicateMap = structuredClone(entry.map);
    duplicateMap.mapId = `${entry.map.mapId}_copy`;
    duplicateMap.mapName = `${entry.name} Copy`;
    const duplicate = createTestingLevelEntry({ map: duplicateMap, textures: entry.textures });
    const next = upsertTestingLevel(library, duplicate);
    try {
      persistLibrary(next);
      library = next;
      setMessage(`Duplicated “${entry.name}”.`);
      render();
    } catch (error) {
      setMessage(`Duplicate was not saved: ${error.message}`, true);
    }
    return;
  }

  if (action === 'delete') {
    if (!window.confirm(`Delete testing map “${entry.name}”?`)) return;
    const next = deleteTestingLevel(library, libraryId);
    try {
      persistLibrary(next);
      library = next;
      setMessage(`Deleted “${entry.name}”.`);
      render();
    } catch (error) {
      setMessage(`Map was not deleted because browser storage failed: ${error.message}`, true);
    }
  }
});

dom.addCancel.addEventListener('click', closeAddToGameDialog);
dom.addForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const entry = findTestingLevel(library, pendingAddLibraryId);
  if (!entry) {
    setAddStatus('That testing map is no longer available.', true);
    return;
  }
  const projectId = dom.addGameSelect.value;
  if (!catalog.some((game) => game.id === projectId)) {
    setAddStatus('Choose a registered game project.', true);
    return;
  }
  try {
    const request = createTestingAddToGameRequest({ entry, projectId });
    localStorage.setItem(TESTING_ADD_TO_GAME_PENDING_KEY, JSON.stringify(request));
    dom.addConfirm.disabled = true;
    setAddStatus(`Opening ${gameName(projectId)} and staging an independent copy…`);
    const url = new URL('workspace.html', window.location.href);
    url.searchParams.set('game', projectId);
    url.searchParams.set('testingImport', '1');
    window.location.href = url.href;
  } catch (error) {
    setAddStatus(`Add to Game could not start: ${error.message}`, true);
  }
});

async function loadGameCatalog() {
  try {
    const response = await fetch(CATALOG_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Unable to load games/catalog.json (${response.status}).`);
    const payload = await response.json();
    catalog = (Array.isArray(payload?.games) ? payload.games : [])
      .map((game) => ({
        id: String(game?.id || '').trim().toLowerCase(),
        name: String(game?.name || game?.id || 'Game'),
        description: String(game?.description || ''),
      }))
      .filter((game) => /^[a-z0-9][a-z0-9_-]*$/.test(game.id));
    renderGameOptions();
  } catch (error) {
    catalog = [];
    renderGameOptions();
    setMessage(`Game list could not be loaded: ${error.message}`, true);
  }
}

function renderGameOptions() {
  dom.addGameSelect.replaceChildren();
  if (!catalog.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No registered games available';
    dom.addGameSelect.appendChild(option);
    dom.addConfirm.disabled = true;
    return;
  }
  for (const game of catalog) {
    const option = document.createElement('option');
    option.value = game.id;
    option.textContent = game.name;
    dom.addGameSelect.appendChild(option);
  }
  dom.addConfirm.disabled = false;
}

function openAddToGameDialog(entry) {
  pendingAddLibraryId = entry.libraryId;
  dom.addLevelLabel.textContent = `${entry.name} • ${entry.map.mapId} • ${entry.map.width} × ${entry.map.height}`;
  setAddStatus(catalog.length
    ? 'Choose the game that should receive the independent copy.'
    : 'Loading registered games…');
  dom.addConfirm.disabled = !catalog.length;
  if (typeof dom.addDialog.showModal === 'function') dom.addDialog.showModal();
  else dom.addDialog.setAttribute('open', '');
}

function closeAddToGameDialog() {
  pendingAddLibraryId = '';
  if (typeof dom.addDialog.close === 'function') dom.addDialog.close();
  else dom.addDialog.removeAttribute('open');
}

function gameName(projectId) {
  return catalog.find((game) => game.id === projectId)?.name || projectId;
}

function readLibrary() {
  try {
    const raw = localStorage.getItem(TESTING_LEVEL_LIBRARY_KEY);
    return normalizeTestingLibrary(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeTestingLibrary(null);
  }
}

function persistLibrary(nextLibrary) {
  localStorage.setItem(TESTING_LEVEL_LIBRARY_KEY, JSON.stringify(nextLibrary));
}

function render() {
  library = normalizeTestingLibrary(library);
  dom.summary.textContent = library.levels.length
    ? `${library.levels.length} saved testing map${library.levels.length === 1 ? '' : 's'}. These maps are not attached to a game until you use Add to Game.`
    : 'No testing maps saved yet. Start a new map or import a JSON map.';
  dom.list.replaceChildren();

  if (!library.levels.length) {
    const empty = document.createElement('div');
    empty.className = 'testing-empty';
    empty.innerHTML = '<strong>No saved testing maps.</strong><br>Use Build New Map to create one without changing any game package.';
    dom.list.appendChild(empty);
    return;
  }

  for (const entry of library.levels) {
    dom.list.appendChild(createCard(entry));
  }
}

function createCard(entry) {
  const card = document.createElement('article');
  card.className = 'testing-level-card';
  card.dataset.testingLevelId = entry.libraryId;

  const heading = document.createElement('h3');
  heading.textContent = entry.name;

  const idLine = document.createElement('p');
  idLine.className = 'small';
  idLine.textContent = entry.map.mapId;

  const meta = document.createElement('div');
  meta.className = 'testing-level-meta';
  const size = document.createElement('span');
  size.textContent = `${entry.map.width} × ${entry.map.height}`;
  const kind = document.createElement('span');
  kind.textContent = entry.map.mapType === 'building'
    ? 'Building map'
    : entry.map.mapType === 'town'
      ? 'Town map'
      : 'Level map';
  const textures = document.createElement('span');
  textures.textContent = `${entry.textures.length} saved custom texture${entry.textures.length === 1 ? '' : 's'}`;
  const updated = document.createElement('span');
  updated.textContent = `Updated ${formatDate(entry.updatedAt)}`;
  meta.append(size, kind, textures, updated);

  const actions = document.createElement('div');
  actions.className = 'testing-card-actions';
  actions.append(
    actionButton('Add to Game', 'add', entry.libraryId),
    actionButton('Edit in Builder', 'edit', entry.libraryId, 'secondary-btn'),
    actionButton('Test Map', 'test', entry.libraryId, 'secondary-btn'),
    actionButton('Duplicate', 'duplicate', entry.libraryId, 'secondary-btn'),
    actionButton('Export JSON', 'export', entry.libraryId, 'secondary-btn'),
    actionButton('Delete', 'delete', entry.libraryId, 'danger-btn'),
  );

  card.append(heading, idLine, meta, actions);
  return card;
}

function actionButton(label, action, libraryId, className = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.dataset.testingAction = action;
  button.dataset.libraryId = libraryId;
  if (className) button.className = className;
  return button;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(date);
}

function setMessage(text, isError = false) {
  dom.message.textContent = text;
  dom.message.classList.toggle('error', isError);
}

function setAddStatus(text, isError = false) {
  dom.addStatus.textContent = text;
  dom.addStatus.classList.toggle('error', isError);
}

function downloadJson(payload, filename) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
