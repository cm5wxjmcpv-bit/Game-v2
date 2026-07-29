import {
  editorTileSelection,
  fetchPackageTileLibrary,
  packageTileRows,
  setEditorTileSelection,
  usedSceneTileIds,
} from './package-tile-model.js';
import { WORKSPACE_DRAFT_PREFIX } from './map-bridge-model.js';

const styles = document.createElement('link');
styles.rel = 'stylesheet';
styles.href = 'workspace-tiles.css';
document.head.appendChild(styles);

const state = {
  projectId: '',
  sceneId: '',
  tiles: [],
  selections: new Map(),
  filter: '',
  loadToken: 0,
};

let dom = null;
install();

function install() {
  const sceneSelect = document.getElementById('sceneSelect');
  const saveDraftButton = document.getElementById('saveDraftBtn');
  const projectSelect = document.getElementById('projectSelect');
  const loadProjectButton = document.getElementById('loadProjectBtn');
  if (!sceneSelect || !saveDraftButton || !projectSelect) return;

  injectPanel(sceneSelect);
  sceneSelect.addEventListener('change', () => {
    state.sceneId = sceneSelect.value;
    hydrateSelectionsFromDraft();
    render();
  });
  projectSelect.addEventListener('change', queueProjectRefresh);
  loadProjectButton?.addEventListener('click', queueProjectRefresh);
  saveDraftButton.addEventListener('click', mergeSelectionsIntoDraft);
  queueProjectRefresh();
}

function injectPanel(sceneSelect) {
  const panel = document.createElement('section');
  panel.className = 'workspace-tile-library';
  panel.innerHTML = `
    <div class="workspace-tile-library-heading">
      <div>
        <h3>Map Editor Tiles</h3>
        <p class="small">Used tiles are always available. Enable unused package tiles before opening the visual map editor.</p>
      </div>
    </div>
    <div class="workspace-tile-library-actions">
      <button id="enableAllPackageTilesBtn" type="button" class="secondary-btn">Enable All</button>
      <button id="resetPackageTilesBtn" type="button" class="secondary-btn">Used Only</button>
    </div>
    <input id="packageTileSearchInput" class="text-input workspace-tile-search" type="search" placeholder="Filter package tiles" />
    <div id="packageTileList" class="workspace-tile-list" aria-label="Package tile library"></div>
    <p id="packageTileSummary" class="small workspace-tile-summary">Loading package tile library…</p>
  `;
  const anchor = sceneSelect.parentElement?.querySelector('.workspace-inline-actions') || sceneSelect;
  anchor.insertAdjacentElement('afterend', panel);
  dom = {
    panel,
    list: panel.querySelector('#packageTileList'),
    summary: panel.querySelector('#packageTileSummary'),
    search: panel.querySelector('#packageTileSearchInput'),
    enableAll: panel.querySelector('#enableAllPackageTilesBtn'),
    reset: panel.querySelector('#resetPackageTilesBtn'),
  };
  dom.search.addEventListener('input', () => {
    state.filter = dom.search.value.trim().toLowerCase();
    render();
  });
  dom.enableAll.addEventListener('click', () => updateSelection(state.tiles.map((tile) => tile.id)));
  dom.reset.addEventListener('click', () => updateSelection(currentUsedIds()));
  dom.list.addEventListener('change', (event) => {
    const input = event.target.closest('[data-package-tile-id]');
    if (!input || input.disabled) return;
    const selected = new Set(currentSelection());
    if (input.checked) selected.add(input.dataset.packageTileId);
    else selected.delete(input.dataset.packageTileId);
    updateSelection([...selected]);
  });
}

function queueProjectRefresh() {
  const token = ++state.loadToken;
  window.setTimeout(() => refreshProject(token), 0);
}

async function refreshProject(token) {
  const projectSelect = document.getElementById('projectSelect');
  const sceneSelect = document.getElementById('sceneSelect');
  const summary = document.getElementById('projectSummary');
  const expectedName = projectSelect?.selectedOptions?.[0]?.textContent?.trim() || '';
  let attempts = 0;
  while (token === state.loadToken && attempts < 160) {
    attempts += 1;
    const summaryText = summary?.textContent || '';
    const ready = projectSelect?.value
      && sceneSelect?.options?.length
      && expectedName
      && summaryText.includes(expectedName)
      && !/loading/i.test(summaryText);
    if (ready) break;
    await new Promise((resolve) => window.setTimeout(resolve, 50));
  }
  if (token !== state.loadToken) return;
  const projectId = projectSelect?.value || '';
  if (!projectId) return;
  try {
    state.projectId = projectId;
    state.sceneId = sceneSelect?.value || '';
    state.tiles = await fetchPackageTileLibrary(projectId, window.location.href);
    if (token !== state.loadToken) return;
    state.selections.clear();
    hydrateSelectionsFromDraft();
    render();
  } catch (error) {
    if (dom?.summary) dom.summary.textContent = `Tile library could not load: ${error.message}`;
  }
}

function readDraft() {
  if (!state.projectId) return null;
  const raw = localStorage.getItem(`${WORKSPACE_DRAFT_PREFIX}${state.projectId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function previewScene() {
  const width = Number(document.getElementById('sceneDimensions')?.textContent?.split('×')[0]?.trim()) || 1;
  const tileIds = [];
  document.querySelectorAll('#scenePreview [data-scene-x][title]').forEach((cell) => {
    const match = String(cell.title || '').match(/•\s*(.+)$/);
    if (match) tileIds.push(match[1].trim());
  });
  return {
    id: state.sceneId,
    width,
    height: Math.max(1, Math.ceil(tileIds.length / width)),
    tiles: Array.from({ length: Math.max(1, Math.ceil(tileIds.length / width)) }, (_, row) => tileIds.slice(row * width, (row + 1) * width)),
  };
}

function currentScene() {
  const draftScene = readDraft()?.scenes?.find((scene) => scene.id === state.sceneId);
  return draftScene || previewScene();
}

function hydrateSelectionsFromDraft() {
  const draft = readDraft();
  for (const scene of draft?.scenes || []) {
    if (!Array.isArray(scene._workspaceEditorTileIds)) continue;
    state.selections.set(scene.id, editorTileSelection(scene, state.tiles));
  }
  if (!state.selections.has(state.sceneId)) {
    const scene = currentScene();
    state.selections.set(state.sceneId, editorTileSelection(scene, state.tiles));
  }
}

function currentUsedIds() {
  return usedSceneTileIds(currentScene());
}

function currentSelection() {
  const selected = state.selections.get(state.sceneId);
  return selected ? [...selected] : editorTileSelection(currentScene(), state.tiles);
}

function updateSelection(tileIds) {
  if (!state.sceneId) return;
  const scene = setEditorTileSelection(currentScene(), tileIds, state.tiles);
  state.selections.set(state.sceneId, scene._workspaceEditorTileIds || []);
  document.getElementById('saveDraftBtn')?.click();
  render();
  const message = document.getElementById('workspaceMessage');
  if (message) {
    message.textContent = 'Map editor tile permissions saved in this browser. Scene JSON changes only after a tile is painted.';
    message.classList.remove('error');
  }
}

function mergeSelectionsIntoDraft() {
  const key = `${WORKSPACE_DRAFT_PREFIX}${state.projectId}`;
  const draft = readDraft();
  if (!draft?.scenes) return;
  draft.scenes = draft.scenes.map((scene) => {
    const selected = state.selections.get(scene.id);
    return selected ? setEditorTileSelection(scene, selected, state.tiles) : scene;
  });
  localStorage.setItem(key, JSON.stringify(draft));
}

function render() {
  if (!dom) return;
  const scene = currentScene();
  const selectedScene = setEditorTileSelection(scene, currentSelection(), state.tiles);
  const rows = packageTileRows(selectedScene, state.tiles);
  const filter = state.filter;
  dom.list.innerHTML = '';
  for (const tile of rows.filter((entry) => !filter || `${entry.name} ${entry.id}`.toLowerCase().includes(filter))) {
    const label = document.createElement('label');
    label.className = `workspace-tile-row${tile.used ? ' is-used' : ''}`;
    label.innerHTML = `
      <input type="checkbox" data-package-tile-id="${escapeHtml(tile.id)}" ${tile.enabled ? 'checked' : ''} ${tile.used ? 'disabled' : ''} />
      <span class="workspace-tile-swatch" style="background:${escapeHtml(tile.color)}"></span>
      <span class="workspace-tile-copy"><strong>${escapeHtml(tile.name)}</strong><small>${escapeHtml(tile.id)} • ${tile.walkable ? 'walkable' : 'blocked'}</small></span>
      <span class="workspace-tile-badge">${tile.used ? 'used' : tile.enabled ? 'enabled' : 'unused'}</span>
    `;
    dom.list.appendChild(label);
  }
  const enabled = rows.filter((tile) => tile.enabled).length;
  const used = rows.filter((tile) => tile.used).length;
  dom.summary.textContent = `${enabled} of ${rows.length} registered tile(s) enabled for this scene; ${used} currently used in its grid.`;
  dom.enableAll.disabled = !rows.length || enabled === rows.length;
  dom.reset.disabled = enabled === used;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
