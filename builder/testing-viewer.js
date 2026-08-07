import {
  TESTING_LEVEL_LIBRARY_KEY,
  TESTING_LEVEL_PREVIEW_KEY,
  findTestingLevel,
  normalizeTestingLibrary,
} from './testing-library-model.js';

const frame = document.getElementById('testingBuilderFrame');
const title = document.getElementById('testingViewerTitle');
const status = document.getElementById('testingViewerStatus');
const editLink = document.getElementById('testingViewerEditLink');
const params = new URL(window.location.href).searchParams;
const libraryId = params.get('testing') || '';
const entry = findTestingLevel(readLibrary(), libraryId);

if (!entry) {
  status.textContent = 'Testing level was not found.';
  status.classList.add('error');
  editLink.hidden = true;
} else {
  title.textContent = `Preview: ${entry.name}`;
  editLink.href = `testing-editor.html?testing=${encodeURIComponent(entry.libraryId)}`;
  try {
    localStorage.setItem(TESTING_LEVEL_PREVIEW_KEY, JSON.stringify(entry.map));
    frame.addEventListener('load', () => {
      const loadButton = frame.contentDocument?.getElementById('loadPreviewBtn');
      if (loadButton) {
        loadButton.click();
        status.textContent = `Previewing “${entry.name}”.`;
      } else {
        status.textContent = 'Viewer loaded, but preview controls were unavailable.';
        status.classList.add('error');
      }
    });
    frame.src = 'viewer.html';
  } catch (error) {
    status.textContent = `Preview could not be prepared: ${error.message}`;
    status.classList.add('error');
  }
}

function readLibrary() {
  try {
    const raw = localStorage.getItem(TESTING_LEVEL_LIBRARY_KEY);
    return normalizeTestingLibrary(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeTestingLibrary(null);
  }
}
