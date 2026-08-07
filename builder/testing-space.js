import {
  TESTING_LEVEL_LIBRARY_KEY,
  createTestingLevelEntry,
  deleteTestingLevel,
  findTestingLevel,
  normalizeTestingLibrary,
  normalizeTestingMap,
  upsertTestingLevel,
} from './testing-library-model.js';

const dom = {
  summary: document.getElementById('testingSummary'),
  list: document.getElementById('testingLevelList'),
  message: document.getElementById('testingMessage'),
  importInput: document.getElementById('testingImportInput'),
};

let library = readLibrary();
render();

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
    setMessage('That testing level is no longer available.', true);
    render();
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
    if (!window.confirm(`Delete testing level “${entry.name}”?`)) return;
    const next = deleteTestingLevel(library, libraryId);
    try {
      persistLibrary(next);
      library = next;
      setMessage(`Deleted “${entry.name}”.`);
      render();
    } catch (error) {
      setMessage(`Level was not deleted because browser storage failed: ${error.message}`, true);
    }
  }
});

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
    ? `${library.levels.length} saved testing level${library.levels.length === 1 ? '' : 's'}. These levels are not attached to a game.`
    : 'No testing levels saved yet. Start a new level or import a JSON map.';
  dom.list.replaceChildren();

  if (!library.levels.length) {
    const empty = document.createElement('div');
    empty.className = 'testing-empty';
    empty.innerHTML = '<strong>No saved testing levels.</strong><br>Use Build New Level to create one without changing any game package.';
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
  kind.textContent = entry.map.mapType === 'town' ? 'Town map' : 'Level map';
  const textures = document.createElement('span');
  textures.textContent = `${entry.textures.length} saved custom texture${entry.textures.length === 1 ? '' : 's'}`;
  const updated = document.createElement('span');
  updated.textContent = `Updated ${formatDate(entry.updatedAt)}`;
  meta.append(size, kind, textures, updated);

  const actions = document.createElement('div');
  actions.className = 'testing-card-actions';
  actions.append(
    actionButton('Edit in Builder', 'edit', entry.libraryId),
    actionButton('Test Level', 'test', entry.libraryId, 'secondary-btn'),
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
