import { activateWorkspaceTab } from './workspace-tabs.js';
import {
  mergeWorkspaceAssetDraft,
  readWorkspaceAssetDraft,
  writeWorkspaceAssetDraft,
} from './workspace-asset-model.js';
import { repoPathFromUrl } from './workspace-publish-model.js';
import {
  formatPatrolPoints,
  nextNpcPlacementId,
  npcPlacements,
  normalizeNpcForMaker,
  parsePatrolPoints,
  placeNpc,
  removeNpcPlacement,
  removeNpcPlacementsFromScenes,
  removeNpcTemplate,
  renameNpcPlacements,
  upsertNpcTemplate,
  validateNpcTemplate,
} from './npc-maker-model.js';

const REPOSITORY_ROOT_URL = new URL('../', window.location.href);
const state = {
  projectId: '',
  sourcePath: '',
  baselinePayload: { npcs: [] },
  npcs: [],
  selectedNpcId: '',
  selectedSceneId: '',
  selectedPlacementId: '',
  textures: new Map(),
  loadingToken: 0,
};

let dom = null;

installStyles();
document.addEventListener('DOMContentLoaded', installNpcMaker);
window.addEventListener('pixel-engine-workspace-loaded', (event) => loadNpcProject(event.detail?.projectId));

function installStyles() {
  if (document.querySelector('link[data-npc-maker-styles]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'npc-maker.css';
  link.dataset.npcMakerStyles = 'true';
  document.head.appendChild(link);
}

function installNpcMaker() {
  if (document.getElementById('workspaceNpcTabBtn')) return;
  const weaponButton = document.getElementById('workspaceWeaponTabBtn');
  const weaponPanel = document.getElementById('workspaceWeaponTab');
  if (!weaponButton || !weaponPanel) return;

  const button = document.createElement('button');
  button.id = 'workspaceNpcTabBtn';
  button.type = 'button';
  button.className = 'tab-btn';
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', 'false');
  button.setAttribute('aria-controls', 'workspaceNpcTab');
  button.tabIndex = -1;
  button.textContent = 'NPCs';
  weaponButton.before(button);

  const panel = document.createElement('section');
  panel.id = 'workspaceNpcTab';
  panel.className = 'workspace-tab npc-maker-panel';
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', 'workspaceNpcTabBtn');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = npcMakerMarkup();
  weaponPanel.before(panel);

  dom = Object.fromEntries([
    'workspaceNpcTabBtn', 'workspaceNpcTab', 'npcMakerStatus', 'npcProjectLabel', 'npcList', 'newNpcBtn',
    'duplicateNpcBtn', 'deleteNpcBtn', 'exportNpcsBtn', 'npcForm', 'npcIdInput', 'npcNameInput', 'npcRoleSelect',
    'npcFactionSelect', 'npcBehaviorSelect', 'npcBehaviorSpeedInput', 'npcBehaviorRadiusInput', 'npcBehaviorPauseInput',
    'npcPatrolInput', 'npcDialogueInput', 'npcShopSelect', 'npcInteractionRangeInput', 'npcHealthInput', 'npcAttackInput',
    'npcDefenseInput', 'npcAgilityInput', 'npcCombatInput', 'npcWeaponSelect', 'npcAppearanceModeSelect', 'npcShapeSelect',
    'npcColorInput', 'npcSizeInput', 'npcTextureSelect', 'npcImagePathInput', 'npcFrameWidthInput', 'npcFrameHeightInput',
    'npcSolidInput', 'npcCollisionRadiusInput', 'npcTagsInput', 'npcPreviewVisual', 'npcPreviewText', 'npcSceneSelect',
    'npcPlacementList', 'npcPlacementXInput', 'npcPlacementYInput', 'npcPlaceBtn', 'npcRemovePlacementBtn', 'npcMap',
    'npcMapDimensions', 'npcPatrolFields', 'npcTextureFields', 'npcImageFields',
  ].map((id) => [id, document.getElementById(id)]));

  bindNpcEvents();
  const workspace = window.pixelEngineWorkspace;
  if (workspace?.getState()?.projectId) loadNpcProject(workspace.getState().projectId);
}

function npcMakerMarkup() {
  return `<div class="npc-maker-shell">
    <div class="npc-maker-column">
      <section class="panel">
        <div class="npc-maker-heading"><div><h2>NPC Library</h2><p id="npcProjectLabel" class="small">Load a game project to edit NPCs.</p></div></div>
        <div class="workspace-inline-actions">
          <button id="newNpcBtn" type="button">New NPC</button>
          <button id="duplicateNpcBtn" type="button" class="secondary-btn">Duplicate</button>
          <button id="deleteNpcBtn" type="button" class="danger-btn">Delete</button>
        </div>
        <button id="exportNpcsBtn" type="button" class="secondary-btn">Export NPC JSON</button>
        <div id="npcList" class="npc-list"></div>
      </section>
      <section class="panel">
        <h3>Appearance Preview</h3>
        <div class="npc-preview-card"><div id="npcPreviewVisual" class="npc-preview-visual"></div><div id="npcPreviewText" class="small"></div></div>
      </section>
    </div>

    <div class="npc-maker-column">
      <section class="panel">
        <h2>NPC Editor</h2>
        <form id="npcForm" class="item-form npc-maker-form" novalidate>
          <div class="npc-form-grid">
            <div><label class="field-label" for="npcIdInput">NPC ID</label><input id="npcIdInput" class="text-input" required></div>
            <div><label class="field-label" for="npcNameInput">Name</label><input id="npcNameInput" class="text-input" required></div>
          </div>
          <div class="npc-form-grid">
            <div><label class="field-label" for="npcRoleSelect">Role</label><select id="npcRoleSelect" class="text-input"><option value="citizen">Citizen</option><option value="shopkeeper">Shopkeeper</option><option value="quest_giver">Quest Giver</option><option value="guard">Guard</option><option value="enemy">Enemy / Hostile Character</option><option value="custom">Custom</option></select></div>
            <div><label class="field-label" for="npcFactionSelect">Faction</label><select id="npcFactionSelect" class="text-input"><option value="friendly">Friendly</option><option value="neutral">Neutral</option><option value="hostile">Hostile</option></select></div>
          </div>

          <h3>Behavior</h3>
          <div class="npc-form-grid three">
            <div><label class="field-label" for="npcBehaviorSelect">Movement</label><select id="npcBehaviorSelect" class="text-input"><option value="stationary">Stationary</option><option value="wander">Wander</option><option value="patrol">Patrol</option></select></div>
            <div><label class="field-label" for="npcBehaviorSpeedInput">Speed</label><input id="npcBehaviorSpeedInput" class="text-input" type="number" min="0" step="0.1"></div>
            <div><label class="field-label" for="npcBehaviorRadiusInput">Wander Radius</label><input id="npcBehaviorRadiusInput" class="text-input" type="number" min="0" step="0.5"></div>
          </div>
          <label class="field-label" for="npcBehaviorPauseInput">Pause Between Moves (seconds)</label><input id="npcBehaviorPauseInput" class="text-input" type="number" min="0" step="0.1">
          <div id="npcPatrolFields"><label class="field-label" for="npcPatrolInput">Patrol Points (X,Y — one per line)</label><textarea id="npcPatrolInput" class="text-input" rows="3" placeholder="2, 2&#10;6, 2&#10;6, 5"></textarea><p class="npc-section-note">Patrol points are stored with the reusable NPC template.</p></div>

          <h3>Interaction</h3>
          <label class="field-label" for="npcDialogueInput">Dialogue (one line per interaction)</label><textarea id="npcDialogueInput" class="text-input" rows="4" placeholder="Hello traveler.&#10;Good luck out there."></textarea>
          <div class="npc-form-grid">
            <div><label class="field-label" for="npcShopSelect">Assigned Shop</label><select id="npcShopSelect" class="text-input"><option value="">No shop</option></select></div>
            <div><label class="field-label" for="npcInteractionRangeInput">Interaction Range</label><input id="npcInteractionRangeInput" class="text-input" type="number" min="0.1" step="0.1"></div>
          </div>

          <h3>Stats & Combat</h3>
          <div class="npc-form-grid three">
            <div><label class="field-label" for="npcHealthInput">Health</label><input id="npcHealthInput" class="text-input" type="number" min="1"></div>
            <div><label class="field-label" for="npcAttackInput">Attack</label><input id="npcAttackInput" class="text-input" type="number" min="0"></div>
            <div><label class="field-label" for="npcDefenseInput">Defense</label><input id="npcDefenseInput" class="text-input" type="number" min="0"></div>
          </div>
          <div class="npc-form-grid">
            <div><label class="field-label" for="npcAgilityInput">Agility</label><input id="npcAgilityInput" class="text-input" type="number" min="0"></div>
            <div><label class="field-label" for="npcWeaponSelect">Assigned Weapon</label><select id="npcWeaponSelect" class="text-input"><option value="">None / Unarmed</option></select></div>
          </div>
          <label class="checkbox-row"><input id="npcCombatInput" type="checkbox"> Combat-enabled NPC metadata</label>
          <p class="npc-section-note">Faction, stats and weapon assignment are saved now; specialized hostile combat AI can build on this data without changing the NPC definition.</p>

          <h3>Appearance</h3>
          <label class="field-label" for="npcAppearanceModeSelect">Appearance Source</label>
          <select id="npcAppearanceModeSelect" class="text-input"><option value="style">Shape / Color</option><option value="texture">Game or Custom Texture</option><option value="image">Image / Sprite Path</option></select>
          <div class="npc-form-grid three">
            <div><label class="field-label" for="npcShapeSelect">Fallback Shape</label><select id="npcShapeSelect" class="text-input"><option value="circle">Circle</option><option value="square">Square</option><option value="diamond">Diamond</option></select></div>
            <div><label class="field-label" for="npcColorInput">Fallback Color</label><input id="npcColorInput" class="text-input" type="color"></div>
            <div><label class="field-label" for="npcSizeInput">Size</label><input id="npcSizeInput" class="text-input" type="number" min="4" max="64"></div>
          </div>
          <div id="npcTextureFields"><label class="field-label" for="npcTextureSelect">Texture</label><select id="npcTextureSelect" class="text-input"><option value="">Choose texture…</option></select></div>
          <div id="npcImageFields"><label class="field-label" for="npcImagePathInput">Image / Sprite Path</label><input id="npcImagePathInput" class="text-input" placeholder="assets/characters/npc.png"><div class="npc-form-grid"><div><label class="field-label" for="npcFrameWidthInput">Frame Width</label><input id="npcFrameWidthInput" class="text-input" type="number" min="1"></div><div><label class="field-label" for="npcFrameHeightInput">Frame Height</label><input id="npcFrameHeightInput" class="text-input" type="number" min="1"></div></div></div>

          <h3>Collision</h3>
          <div class="npc-form-grid"><label class="checkbox-row"><input id="npcSolidInput" type="checkbox"> Solid NPC</label><div><label class="field-label" for="npcCollisionRadiusInput">Collision Radius</label><input id="npcCollisionRadiusInput" class="text-input" type="number" min="0.05" step="0.01"></div></div>
          <label class="field-label" for="npcTagsInput">Tags (comma separated)</label><input id="npcTagsInput" class="text-input" placeholder="blacksmith, town, story">
          <button type="submit">Save NPC Template</button>
        </form>
      </section>
    </div>

    <div class="npc-maker-column">
      <section class="panel">
        <h2>Place NPC</h2>
        <p class="small">Place the selected reusable NPC into any Town, Level, Building, or generic scene. The map stores only the NPC ID and position.</p>
        <label class="field-label" for="npcSceneSelect">Destination Map</label><select id="npcSceneSelect" class="text-input"></select>
        <div class="npc-form-grid"><div><label class="field-label" for="npcPlacementXInput">X</label><input id="npcPlacementXInput" class="text-input" type="number" min="0"></div><div><label class="field-label" for="npcPlacementYInput">Y</label><input id="npcPlacementYInput" class="text-input" type="number" min="0"></div></div>
        <div class="workspace-inline-actions"><button id="npcPlaceBtn" type="button">Place / Update NPC</button><button id="npcRemovePlacementBtn" type="button" class="danger-btn">Remove Placement</button></div>
        <div class="npc-maker-heading"><h3>Map</h3><span id="npcMapDimensions" class="workspace-chip"></span></div>
        <div id="npcMap" class="npc-map" aria-label="NPC placement map"></div>
      </section>
      <section class="panel"><h3>NPC Placements on This Map</h3><div id="npcPlacementList" class="npc-placement-list"></div></section>
      <section class="panel"><h3>Status</h3><div id="npcMakerStatus" class="npc-maker-status small" role="status" aria-live="polite">NPC Maker ready.</div></section>
    </div>
  </div>`;
}

function bindNpcEvents() {
  dom.workspaceNpcTabBtn.addEventListener('click', () => {
    activateWorkspaceTab(dom.workspaceNpcTab, dom.workspaceNpcTabBtn);
    renderAll();
  });
  dom.newNpcBtn.addEventListener('click', () => newNpc(true));
  dom.duplicateNpcBtn.addEventListener('click', duplicateNpc);
  dom.deleteNpcBtn.addEventListener('click', deleteNpc);
  dom.exportNpcsBtn.addEventListener('click', exportNpcs);
  dom.npcForm.addEventListener('submit', saveNpc);
  dom.npcList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-npc-id]');
    if (button) selectNpc(button.dataset.npcId);
  });
  dom.npcSceneSelect.addEventListener('change', () => {
    state.selectedSceneId = dom.npcSceneSelect.value;
    state.selectedPlacementId = '';
    resetPlacementToSpawn();
    renderPlacementArea();
  });
  dom.npcPlacementList.addEventListener('click', (event) => {
    const button = event.target.closest('[data-placement-id]');
    if (button) selectPlacement(button.dataset.placementId);
  });
  dom.npcMap.addEventListener('click', (event) => {
    const cell = event.target.closest('[data-npc-map-x]');
    if (!cell) return;
    dom.npcPlacementXInput.value = cell.dataset.npcMapX;
    dom.npcPlacementYInput.value = cell.dataset.npcMapY;
    renderMap();
  });
  dom.npcPlaceBtn.addEventListener('click', savePlacement);
  dom.npcRemovePlacementBtn.addEventListener('click', deletePlacement);
  dom.npcBehaviorSelect.addEventListener('change', updateConditionalFields);
  dom.npcAppearanceModeSelect.addEventListener('change', updateConditionalFields);
  [dom.npcShapeSelect, dom.npcColorInput, dom.npcSizeInput, dom.npcTextureSelect, dom.npcImagePathInput].forEach((element) => {
    element.addEventListener('input', renderAppearancePreview);
    element.addEventListener('change', renderAppearancePreview);
  });
}

function workspaceApi() {
  return window.pixelEngineWorkspace || null;
}

function workspaceState() {
  return workspaceApi()?.getState?.() || null;
}

async function fetchJson(url, fallback = null) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${response.status}`);
    return await response.json();
  } catch (error) {
    if (fallback !== null) return fallback;
    throw error;
  }
}

async function loadNpcProject(projectId) {
  if (!dom) return;
  const token = ++state.loadingToken;
  const workspace = workspaceState();
  if (!workspace || workspace.projectId !== projectId) return;
  setStatus(`Loading NPC library for ${projectId}…`);
  try {
    const data = workspace.manifest?.data || {};
    if (!data.npcs) throw new Error('This game package does not declare manifest.data.npcs.');
    const sourceUrl = new URL(data.npcs, workspace.contentRootUrl);
    const sourcePath = repoPathFromUrl(sourceUrl, REPOSITORY_ROOT_URL);
    const baseline = await fetchJson(sourceUrl, { npcs: [] });
    const texturePayload = data.texturePack
      ? await fetchJson(new URL(data.texturePack, workspace.contentRootUrl), { textures: [] })
      : { textures: [] };
    if (token !== state.loadingToken) return;

    state.projectId = projectId;
    state.sourcePath = sourcePath;
    const assetDraft = readWorkspaceAssetDraft(projectId);
    const staged = assetDraft.files.find((file) => file.path === sourcePath);
    state.baselinePayload = staged?.baselinePayload || baseline;
    const currentPayload = staged?.currentPayload || baseline;
    state.npcs = (currentPayload.npcs || []).map(normalizeNpcForMaker);
    state.selectedNpcId = state.npcs[0]?.id || '';
    state.selectedSceneId = workspace.selectedSceneId && workspace.scenes.some((scene) => scene.id === workspace.selectedSceneId)
      ? workspace.selectedSceneId
      : workspace.scenes[0]?.id || '';
    state.selectedPlacementId = '';
    state.textures = new Map((texturePayload.textures || []).filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
    for (const texture of assetDraft.textures || []) {
      state.textures.set(texture.id, {
        id: texture.id,
        name: `${texture.name || texture.id} (staged custom)`,
        color: texture.previewColor,
        image: texture.image,
      });
    }
    renderAll();
    if (!state.npcs.length) newNpc(false);
    setStatus(`NPC Maker loaded for ${workspace.projectMeta?.name || projectId}.`);
  } catch (error) {
    state.projectId = projectId;
    state.sourcePath = '';
    state.npcs = [];
    renderAll();
    setStatus(`NPC Maker could not load: ${error.message}`, true);
  }
}

function selectedNpc() {
  return state.npcs.find((npc) => npc.id === state.selectedNpcId) || null;
}

function selectedScene() {
  return workspaceState()?.scenes?.find((scene) => scene.id === state.selectedSceneId) || null;
}

function selectedPlacement() {
  return npcPlacements(selectedScene()).find((entry) => entry.id === state.selectedPlacementId) || null;
}

function renderAll() {
  if (!dom) return;
  const workspace = workspaceState();
  dom.npcProjectLabel.textContent = state.projectId
    ? `${workspace?.projectMeta?.name || state.projectId} • ${state.npcs.length} reusable NPC template(s)`
    : 'Load a game project to edit NPCs.';
  renderNpcList();
  renderReferenceOptions();
  renderNpcForm();
  renderSceneOptions();
  renderPlacementArea();
}

function renderNpcList() {
  dom.npcList.innerHTML = '';
  if (!state.npcs.length) {
    dom.npcList.innerHTML = '<p class="small">No NPC templates yet. Create one to begin.</p>';
    return;
  }
  for (const npc of state.npcs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `secondary-btn npc-list-button${npc.id === state.selectedNpcId ? ' active' : ''}`;
    button.dataset.npcId = npc.id;
    const left = document.createElement('span');
    left.innerHTML = `<strong>${escapeHtml(npc.name)}</strong><br><small>${escapeHtml(npc.id)}</small>`;
    const badge = document.createElement('span');
    badge.className = 'npc-badge';
    badge.textContent = `${npc.faction} • ${npc.role.replace('_', ' ')}`;
    button.append(left, badge);
    dom.npcList.appendChild(button);
  }
}

function renderReferenceOptions() {
  const workspace = workspaceState();
  const currentShop = dom.npcShopSelect.value;
  dom.npcShopSelect.innerHTML = '<option value="">No shop</option>';
  for (const shop of workspace?.shopPayload?.shops || []) {
    const option = document.createElement('option');
    option.value = shop.id;
    option.textContent = shop.name || shop.id;
    dom.npcShopSelect.appendChild(option);
  }
  if ([...dom.npcShopSelect.options].some((option) => option.value === currentShop)) dom.npcShopSelect.value = currentShop;

  const currentWeapon = dom.npcWeaponSelect.value;
  dom.npcWeaponSelect.innerHTML = '<option value="">None / Unarmed</option>';
  for (const item of workspace?.items || []) {
    if (!(item.category === 'weapons' || item.equipSlot === 'weapon' || item.weapon)) continue;
    const option = document.createElement('option');
    option.value = item.id;
    option.textContent = item.name || item.id;
    dom.npcWeaponSelect.appendChild(option);
  }
  if ([...dom.npcWeaponSelect.options].some((option) => option.value === currentWeapon)) dom.npcWeaponSelect.value = currentWeapon;

  const currentTexture = dom.npcTextureSelect.value;
  dom.npcTextureSelect.innerHTML = '<option value="">Choose texture…</option>';
  for (const texture of [...state.textures.values()].sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id)))) {
    const option = document.createElement('option');
    option.value = texture.id;
    option.textContent = `${texture.name || texture.id} (${texture.id})`;
    dom.npcTextureSelect.appendChild(option);
  }
  if ([...dom.npcTextureSelect.options].some((option) => option.value === currentTexture)) dom.npcTextureSelect.value = currentTexture;
}

function selectNpc(id) {
  if (!state.npcs.some((npc) => npc.id === id)) return;
  state.selectedNpcId = id;
  state.selectedPlacementId = '';
  renderNpcList();
  renderNpcForm();
  renderPlacementArea();
}

function defaultNpc() {
  let index = 1;
  const ids = new Set(state.npcs.map((entry) => entry.id));
  while (ids.has(`npc_${index}`)) index += 1;
  return normalizeNpcForMaker({
    id: `npc_${index}`,
    name: 'New NPC',
    role: 'citizen',
    faction: 'neutral',
    behavior: { mode: 'stationary', speed: 0, radius: 3, pauseSeconds: 1, patrol: [] },
    interaction: { dialogue: ['Hello.'], shopId: '', range: 1.1 },
    stats: { maxHp: 10, attack: 0, defense: 0, agility: 1 },
    combat: { enabled: false, weaponId: '' },
    render: { mode: 'style', textureId: '', imagePath: '', fallback: { shape: 'circle', color: '#60a5fa', size: 20 } },
    collision: { solid: true, radius: 0.42 },
    tags: [],
  });
}

function newNpc(announce = true) {
  state.selectedNpcId = '';
  populateNpcForm(defaultNpc());
  renderNpcList();
  renderPlacementArea();
  if (announce) setStatus('New NPC ready. Configure it, then save the reusable template.');
}

function duplicateNpc() {
  const source = selectedNpc();
  if (!source) return setStatus('Select a saved NPC to duplicate.', true);
  const copy = defaultNpc();
  populateNpcForm(normalizeNpcForMaker({ ...source, id: copy.id, name: `${source.name} Copy` }));
  state.selectedNpcId = '';
  renderNpcList();
  setStatus('NPC duplicated into a new unsaved template.');
}

function renderNpcForm() {
  const npc = selectedNpc();
  if (!npc) {
    if (!dom.npcIdInput.value) populateNpcForm(defaultNpc());
    renderAppearancePreview();
    return;
  }
  populateNpcForm(npc);
}

function populateNpcForm(npcValue) {
  const npc = normalizeNpcForMaker(npcValue);
  dom.npcIdInput.value = npc.id;
  dom.npcNameInput.value = npc.name;
  dom.npcRoleSelect.value = npc.role;
  dom.npcFactionSelect.value = npc.faction;
  dom.npcBehaviorSelect.value = npc.behavior.mode;
  dom.npcBehaviorSpeedInput.value = npc.behavior.speed;
  dom.npcBehaviorRadiusInput.value = npc.behavior.radius;
  dom.npcBehaviorPauseInput.value = npc.behavior.pauseSeconds;
  dom.npcPatrolInput.value = formatPatrolPoints(npc.behavior.patrol);
  dom.npcDialogueInput.value = npc.interaction.dialogue.join('\n');
  dom.npcShopSelect.value = npc.interaction.shopId;
  dom.npcInteractionRangeInput.value = npc.interaction.range;
  dom.npcHealthInput.value = npc.stats.maxHp;
  dom.npcAttackInput.value = npc.stats.attack;
  dom.npcDefenseInput.value = npc.stats.defense;
  dom.npcAgilityInput.value = npc.stats.agility;
  dom.npcCombatInput.checked = npc.combat.enabled;
  dom.npcWeaponSelect.value = npc.combat.weaponId;
  dom.npcAppearanceModeSelect.value = npc.render.mode;
  dom.npcShapeSelect.value = npc.render.fallback.shape;
  dom.npcColorInput.value = npc.render.fallback.color;
  dom.npcSizeInput.value = npc.render.fallback.size;
  dom.npcTextureSelect.value = state.textures.has(npc.render.textureId) ? npc.render.textureId : '';
  dom.npcImagePathInput.value = npc.render.imagePath || npc.render.sprite?.imagePath || '';
  dom.npcFrameWidthInput.value = npc.render.sprite?.frameWidth || 32;
  dom.npcFrameHeightInput.value = npc.render.sprite?.frameHeight || 32;
  dom.npcSolidInput.checked = npc.collision.solid;
  dom.npcCollisionRadiusInput.value = npc.collision.radius;
  dom.npcTagsInput.value = npc.tags.join(', ');
  updateConditionalFields();
  renderAppearancePreview();
}

function npcFromForm() {
  const imagePath = dom.npcImagePathInput.value.trim();
  return normalizeNpcForMaker({
    id: dom.npcIdInput.value,
    name: dom.npcNameInput.value,
    role: dom.npcRoleSelect.value,
    faction: dom.npcFactionSelect.value,
    behavior: {
      mode: dom.npcBehaviorSelect.value,
      speed: Number(dom.npcBehaviorSpeedInput.value),
      radius: Number(dom.npcBehaviorRadiusInput.value),
      pauseSeconds: Number(dom.npcBehaviorPauseInput.value),
      patrol: parsePatrolPoints(dom.npcPatrolInput.value),
    },
    interaction: {
      dialogue: dom.npcDialogueInput.value.split(/\r?\n/),
      shopId: dom.npcShopSelect.value,
      range: Number(dom.npcInteractionRangeInput.value),
    },
    stats: {
      maxHp: Number(dom.npcHealthInput.value),
      attack: Number(dom.npcAttackInput.value),
      defense: Number(dom.npcDefenseInput.value),
      agility: Number(dom.npcAgilityInput.value),
    },
    combat: { enabled: dom.npcCombatInput.checked, weaponId: dom.npcWeaponSelect.value },
    render: {
      mode: dom.npcAppearanceModeSelect.value,
      textureId: dom.npcTextureSelect.value,
      imagePath,
      sprite: imagePath ? {
        imagePath,
        frameWidth: Number(dom.npcFrameWidthInput.value) || 32,
        frameHeight: Number(dom.npcFrameHeightInput.value) || 32,
        idleFrames: [0],
        walkFrames: [0],
      } : null,
      fallback: {
        shape: dom.npcShapeSelect.value,
        color: dom.npcColorInput.value,
        size: Number(dom.npcSizeInput.value),
      },
    },
    collision: { solid: dom.npcSolidInput.checked, radius: Number(dom.npcCollisionRadiusInput.value) },
    tags: dom.npcTagsInput.value.split(',').map((tag) => tag.trim()).filter(Boolean),
  });
}

function saveNpc(event) {
  event.preventDefault();
  if (!state.sourcePath) return setStatus('This game package has no NPC data file configured.', true);
  const npc = npcFromForm();
  const workspace = workspaceState();
  const errors = validateNpcTemplate(npc, {
    shopIds: (workspace?.shopPayload?.shops || []).map((shop) => shop.id),
    weaponIds: (workspace?.items || []).map((item) => item.id),
  });
  if (errors.length) return setStatus(errors.join(' '), true);
  const previousId = state.selectedNpcId;
  if (state.npcs.some((entry) => entry.id === npc.id && entry.id !== previousId)) {
    return setStatus(`NPC ID “${npc.id}” already exists.`, true);
  }
  if (previousId && previousId !== npc.id) workspace.scenes = renameNpcPlacements(workspace.scenes, previousId, npc.id);
  state.npcs = upsertNpcTemplate(state.npcs, npc, previousId);
  state.selectedNpcId = npc.id;
  stageNpcFile();
  workspaceApi()?.markDirty?.(`NPC “${npc.name}” saved to the reusable NPC library.`);
  renderAll();
  setStatus(`NPC “${npc.name}” saved. Existing placements use this template automatically.`);
}

function deleteNpc() {
  const npc = selectedNpc();
  if (!npc) return setStatus('Select a saved NPC to delete.', true);
  const workspace = workspaceState();
  const count = (workspace?.scenes || []).reduce((sum, scene) => sum + npcPlacements(scene, npc.id).length, 0);
  const detail = count ? ` This will also remove ${count} placement(s) that reference it.` : '';
  if (!window.confirm(`Delete NPC “${npc.name}”?${detail}`)) return;
  state.npcs = removeNpcTemplate(state.npcs, npc.id);
  if (workspace) workspace.scenes = removeNpcPlacementsFromScenes(workspace.scenes, npc.id);
  state.selectedNpcId = state.npcs[0]?.id || '';
  state.selectedPlacementId = '';
  stageNpcFile();
  workspaceApi()?.markDirty?.(`NPC “${npc.name}” and its map placements were deleted.`);
  renderAll();
  if (!state.npcs.length) newNpc(false);
  setStatus(`NPC “${npc.name}” deleted.`);
}

function stageNpcFile() {
  if (!state.projectId || !state.sourcePath) return;
  const currentDraft = readWorkspaceAssetDraft(state.projectId);
  const currentPayload = { ...state.baselinePayload, npcs: state.npcs };
  const merged = mergeWorkspaceAssetDraft(state.projectId, currentDraft, [], [{
    path: state.sourcePath,
    kind: 'NPC templates',
    baselinePayload: state.baselinePayload,
    currentPayload,
  }]);
  writeWorkspaceAssetDraft(state.projectId, merged);
}

function updateConditionalFields() {
  dom.npcPatrolFields.classList.toggle('npc-hidden', dom.npcBehaviorSelect.value !== 'patrol');
  dom.npcTextureFields.classList.toggle('npc-hidden', dom.npcAppearanceModeSelect.value !== 'texture');
  dom.npcImageFields.classList.toggle('npc-hidden', dom.npcAppearanceModeSelect.value !== 'image');
  dom.npcBehaviorRadiusInput.disabled = dom.npcBehaviorSelect.value !== 'wander';
}

function renderAppearancePreview() {
  const appearance = {
    mode: dom.npcAppearanceModeSelect.value,
    shape: dom.npcShapeSelect.value,
    color: dom.npcColorInput.value || '#60a5fa',
    size: Number(dom.npcSizeInput.value) || 20,
    textureId: dom.npcTextureSelect.value,
    imagePath: dom.npcImagePathInput.value.trim(),
  };
  const visual = dom.npcPreviewVisual;
  visual.className = `npc-preview-visual ${appearance.shape}`;
  visual.style.backgroundImage = '';
  visual.style.backgroundColor = appearance.color;
  let image = '';
  if (appearance.mode === 'texture') {
    const texture = state.textures.get(appearance.textureId);
    image = texture?.image || '';
    if (texture?.color) visual.style.backgroundColor = texture.color;
  } else if (appearance.mode === 'image') image = appearance.imagePath;
  if (image) {
    visual.style.backgroundImage = `url("${previewImageUrl(image).replace(/"/g, '%22')}")`;
    visual.style.backgroundColor = 'transparent';
  }
  dom.npcPreviewText.textContent = `${dom.npcNameInput.value || 'NPC'} • ${dom.npcFactionSelect.value} • ${dom.npcBehaviorSelect.value}`;
}

function previewImageUrl(path) {
  if (/^data:image\//i.test(path) || /^https?:\/\//i.test(path)) return path;
  try {
    return new URL(path, workspaceState()?.contentRootUrl || window.location.href).href;
  } catch {
    return path;
  }
}

function renderSceneOptions() {
  const workspace = workspaceState();
  dom.npcSceneSelect.innerHTML = '';
  for (const scene of workspace?.scenes || []) {
    const option = document.createElement('option');
    option.value = scene.id;
    option.textContent = `${scene.name || scene.id} [${scene._workspaceKind || scene.mapType || 'scene'}]`;
    dom.npcSceneSelect.appendChild(option);
  }
  if (!(workspace?.scenes || []).some((scene) => scene.id === state.selectedSceneId)) state.selectedSceneId = workspace?.scenes?.[0]?.id || '';
  dom.npcSceneSelect.value = state.selectedSceneId;
}

function resetPlacementToSpawn() {
  const scene = selectedScene();
  dom.npcPlacementXInput.value = Math.floor(Number(scene?.spawn?.x) || 0);
  dom.npcPlacementYInput.value = Math.floor(Number(scene?.spawn?.y) || 0);
}

function renderPlacementArea() {
  const scene = selectedScene();
  const placement = selectedPlacement();
  if (placement) {
    dom.npcPlacementXInput.value = placement.x;
    dom.npcPlacementYInput.value = placement.y;
  } else if (scene && !dom.npcPlacementXInput.value && !dom.npcPlacementYInput.value) resetPlacementToSpawn();
  renderPlacementList();
  renderMap();
}

function renderPlacementList() {
  dom.npcPlacementList.innerHTML = '';
  const placements = npcPlacements(selectedScene());
  if (!placements.length) {
    dom.npcPlacementList.innerHTML = '<p class="small">No NPCs placed on this map.</p>';
    return;
  }
  for (const placement of placements) {
    const npc = state.npcs.find((entry) => entry.id === placement.npcId);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `secondary-btn npc-placement-button${placement.id === state.selectedPlacementId ? ' active' : ''}`;
    button.dataset.placementId = placement.id;
    button.innerHTML = `<span>${escapeHtml(npc?.name || placement.npcId || 'Missing NPC')}<br><small>${escapeHtml(placement.id)}</small></span><span>${Math.floor(placement.x)}, ${Math.floor(placement.y)}</span>`;
    dom.npcPlacementList.appendChild(button);
  }
}

function selectPlacement(id) {
  state.selectedPlacementId = id;
  const placement = selectedPlacement();
  if (placement) {
    dom.npcPlacementXInput.value = placement.x;
    dom.npcPlacementYInput.value = placement.y;
    if (state.npcs.some((npc) => npc.id === placement.npcId)) state.selectedNpcId = placement.npcId;
  }
  renderNpcList();
  renderNpcForm();
  renderPlacementArea();
}

function savePlacement() {
  const npc = selectedNpc();
  const scene = selectedScene();
  const workspace = workspaceState();
  if (!npc) return setStatus('Save or select an NPC template before placing it.', true);
  if (!scene || !workspace) return setStatus('Choose a destination map.', true);
  try {
    const placementId = state.selectedPlacementId || nextNpcPlacementId(scene, npc.id);
    const next = placeNpc(scene, npc.id, dom.npcPlacementXInput.value, dom.npcPlacementYInput.value, placementId);
    const index = workspace.scenes.findIndex((entry) => entry.id === scene.id);
    workspace.scenes[index] = { ...next, _workspaceKind: scene._workspaceKind, _workspacePath: scene._workspacePath };
    state.selectedPlacementId = placementId;
    workspaceApi()?.markDirty?.(`NPC “${npc.name}” placed in ${scene.name || scene.id}.`);
    renderPlacementArea();
    setStatus(`Placed “${npc.name}” at ${dom.npcPlacementXInput.value}, ${dom.npcPlacementYInput.value} in ${scene.name || scene.id}.`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function deletePlacement() {
  const placement = selectedPlacement();
  const scene = selectedScene();
  const workspace = workspaceState();
  if (!placement || !scene || !workspace) return setStatus('Select an NPC placement to remove.', true);
  const next = removeNpcPlacement(scene, placement.id);
  const index = workspace.scenes.findIndex((entry) => entry.id === scene.id);
  workspace.scenes[index] = { ...next, _workspaceKind: scene._workspaceKind, _workspacePath: scene._workspacePath };
  state.selectedPlacementId = '';
  workspaceApi()?.markDirty?.(`NPC placement “${placement.id}” removed from ${scene.name || scene.id}.`);
  renderPlacementArea();
  setStatus(`NPC placement “${placement.id}” removed.`);
}

function renderMap() {
  const scene = selectedScene();
  dom.npcMap.innerHTML = '';
  if (!scene) {
    dom.npcMapDimensions.textContent = '';
    return;
  }
  dom.npcMapDimensions.textContent = `${scene.width} × ${scene.height}`;
  dom.npcMap.style.setProperty('--npc-map-width', String(scene.width));
  const placements = npcPlacements(scene);
  const selectedX = Math.floor(Number(dom.npcPlacementXInput.value));
  const selectedY = Math.floor(Number(dom.npcPlacementYInput.value));
  for (let y = 0; y < scene.height; y += 1) {
    for (let x = 0; x < scene.width; x += 1) {
      const cell = document.createElement('div');
      cell.className = `npc-map-cell${x === selectedX && y === selectedY ? ' selected' : ''}`;
      cell.dataset.npcMapX = String(x);
      cell.dataset.npcMapY = String(y);
      const tileId = scene.tiles?.[y]?.[x] || 'empty';
      cell.style.background = workspaceState()?.tileColors?.[tileId] || hashColor(tileId);
      cell.title = `${x}, ${y} • ${tileId}`;
      for (const placement of placements.filter((entry) => Math.floor(entry.x) === x && Math.floor(entry.y) === y)) {
        const marker = document.createElement('span');
        marker.className = `npc-map-marker${placement.id === state.selectedPlacementId ? ' active' : ''}`;
        const npc = state.npcs.find((entry) => entry.id === placement.npcId);
        applyMarkerAppearance(marker, npc);
        marker.title = `${npc?.name || placement.npcId} (${placement.id})`;
        cell.appendChild(marker);
      }
      dom.npcMap.appendChild(cell);
    }
  }
}

function applyMarkerAppearance(marker, npc) {
  const render = npc?.render || {};
  marker.style.backgroundColor = render.fallback?.color || '#ef4444';
  marker.style.backgroundImage = '';
  let image = '';
  if (render.mode === 'texture') {
    const texture = state.textures.get(render.textureId);
    image = texture?.image || '';
    if (texture?.color) marker.style.backgroundColor = texture.color;
  } else if (render.mode === 'image') image = render.imagePath || render.sprite?.imagePath || '';
  if (image) {
    marker.style.backgroundImage = `url("${previewImageUrl(image).replace(/"/g, '%22')}")`;
    marker.style.backgroundColor = 'transparent';
  }
}

function exportNpcs() {
  const blob = new Blob([JSON.stringify({ ...state.baselinePayload, npcs: state.npcs }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${state.projectId || 'game'}-npcs.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  setStatus('NPC template JSON exported.');
}

function setStatus(message, isError = false) {
  if (!dom) return;
  dom.npcMakerStatus.textContent = message;
  dom.npcMakerStatus.classList.toggle('error', isError);
}

function hashColor(value) {
  let hash = 0;
  for (const char of String(value || 'tile')) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return `hsl(${Math.abs(hash) % 360} 28% 48%)`;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
