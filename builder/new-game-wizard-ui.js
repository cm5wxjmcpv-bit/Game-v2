import { buildNewGamePlan, gameIdFromName } from './new-game-wizard-model.js';
import { publishWorkspacePlan } from './workspace-publisher.js';

const CATALOG_URL = new URL('../games/catalog.json', window.location.href);
const dom = Object.fromEntries([
  'workspaceSceneTabBtn', 'workspaceActorTabBtn', 'workspaceNewGameTabBtn', 'workspacePublishTabBtn',
  'workspaceSceneTab', 'workspaceActorTab', 'workspaceNewGameTab', 'workspacePublishTab',
  'newGameForm', 'newGameNameInput', 'newGameIdInput', 'newGameGenreInput', 'newGameTileSizeInput',
  'newGameResolutionWidthInput', 'newGameResolutionHeightInput', 'newGameMapWidthInput',
  'newGameMapHeightInput', 'newGamePlayerInput', 'newGamePhysicsInput', 'newGameSaveInput',
  'newGameInventoryInput', 'newGameDialogueInput', 'newGameCombatInput', 'newGameAudioInput',
  'newGameRefreshBtn', 'newGamePlanSummary', 'newGameFileTree', 'newGameFilePreviewPath',
  'newGameFilePreview', 'newGamePublishTitleInput', 'newGameCommitInput', 'newGameTokenInput',
  'newGameConfirmInput', 'newGamePublishBtn', 'newGameForgetTokenBtn', 'newGameStatus',
  'newGamePrLink',
].map((id) => [id, document.getElementById(id)]));

const state = {
  catalog: null,
  catalogBaselineContent: '',
  plan: null,
  idWasEdited: false,
  loading: false,
  publishing: false,
  selectedPath: '',
};

bindEvents();
loadCatalog().catch((error) => setStatus(`New Game Wizard could not load: ${error.message}`, true));

function bindEvents() {
  dom.workspaceNewGameTabBtn.addEventListener('click', openWizard);
  for (const button of [dom.workspaceSceneTabBtn, dom.workspaceActorTabBtn, dom.workspacePublishTabBtn]) {
    button.addEventListener('click', closeWizard);
  }
  dom.newGameNameInput.addEventListener('input', () => {
    if (!state.idWasEdited) dom.newGameIdInput.value = gameIdFromName(dom.newGameNameInput.value);
    rebuildPlan();
  });
  dom.newGameIdInput.addEventListener('input', () => {
    state.idWasEdited = true;
    rebuildPlan();
  });
  dom.newGameForm.addEventListener('input', (event) => {
    const target = event.target;
    if (target === dom.newGameNameInput || target === dom.newGameIdInput) return;
    if (target.matches('select, input[type="checkbox"]')) return;
    rebuildPlan();
  });
  dom.newGameForm.addEventListener('change', (event) => {
    if (event.target.matches('select, input[type="checkbox"]')) rebuildPlan();
  });
  dom.newGameRefreshBtn.addEventListener('click', rebuildPlan);
  dom.newGamePublishBtn.addEventListener('click', publishNewGame);
  dom.newGameTokenInput.addEventListener('input', updatePublishButton);
  dom.newGameConfirmInput.addEventListener('change', updatePublishButton);
  dom.newGameForgetTokenBtn.addEventListener('click', () => {
    dom.newGameTokenInput.value = '';
    updatePublishButton();
    setStatus('GitHub token cleared from this page.');
  });
}

async function loadCatalog() {
  state.loading = true;
  updatePublishButton();
  const response = await fetch(CATALOG_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load games/catalog.json (${response.status}).`);
  state.catalogBaselineContent = await response.text();
  state.catalog = JSON.parse(state.catalogBaselineContent);
  state.loading = false;
  rebuildPlan();
}

function openWizard() {
  for (const tab of [dom.workspaceSceneTab, dom.workspaceActorTab, dom.workspacePublishTab]) tab.classList.remove('active');
  for (const button of [dom.workspaceSceneTabBtn, dom.workspaceActorTabBtn, dom.workspacePublishTabBtn]) button.classList.remove('active');
  dom.workspaceNewGameTab.classList.add('active');
  dom.workspaceNewGameTabBtn.classList.add('active');
  rebuildPlan();
}

function closeWizard() {
  dom.workspaceNewGameTab.classList.remove('active');
  dom.workspaceNewGameTabBtn.classList.remove('active');
}

function readForm() {
  return {
    catalog: state.catalog,
    catalogBaselineContent: state.catalogBaselineContent,
    gameName: dom.newGameNameInput.value,
    internalId: dom.newGameIdInput.value,
    genre: dom.newGameGenreInput.value,
    tileSize: dom.newGameTileSizeInput.value,
    resolutionWidth: dom.newGameResolutionWidthInput.value,
    resolutionHeight: dom.newGameResolutionHeightInput.value,
    mapWidth: dom.newGameMapWidthInput.value,
    mapHeight: dom.newGameMapHeightInput.value,
    startingPlayer: dom.newGamePlayerInput.value,
    physicsPreset: dom.newGamePhysicsInput.value,
    enableSave: dom.newGameSaveInput.checked,
    enableInventory: dom.newGameInventoryInput.checked,
    enableDialogue: dom.newGameDialogueInput.checked,
    enableCombat: dom.newGameCombatInput.checked,
    enableAudio: dom.newGameAudioInput.checked,
  };
}

function rebuildPlan() {
  if (!state.catalog || state.publishing) return;
  state.plan = buildNewGamePlan(readForm());
  if (!state.selectedPath || !state.plan.files.some((file) => file.path === state.selectedPath)) {
    state.selectedPath = state.plan.files[0]?.path || '';
  }
  const name = state.plan.summary.gameName || 'New game';
  dom.newGamePublishTitleInput.value = `Create ${name} game package`;
  dom.newGameCommitInput.value = `Create ${state.plan.projectId || 'new'} game package`;
  renderPlan();
}

function renderPlan() {
  dom.newGameFileTree.innerHTML = '';
  if (!state.plan) {
    dom.newGamePlanSummary.textContent = 'Loading the package catalog…';
    renderSelectedFile();
    updatePublishButton();
    return;
  }
  if (state.plan.errors.length) {
    dom.newGamePlanSummary.textContent = state.plan.errors.join(' ');
    dom.newGamePlanSummary.classList.add('workspace-publish-error');
  } else {
    const summary = state.plan.summary;
    dom.newGamePlanSummary.textContent = `${summary.gameName} • ${summary.genre} • ${summary.startingMap.width} × ${summary.startingMap.height} map • ${state.plan.files.length} reviewed JSON files • new branch and draft pull request`;
    dom.newGamePlanSummary.classList.remove('workspace-publish-error');
  }
  for (const file of state.plan.files) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'new-game-tree-file';
    button.classList.toggle('active', file.path === state.selectedPath);
    button.dataset.wizardPath = file.path;
    button.innerHTML = `<code>${escapeHtml(file.path)}</code><span>${escapeHtml(file.operation || 'update')}</span>`;
    button.addEventListener('click', () => selectFile(file.path));
    dom.newGameFileTree.appendChild(button);
  }
  renderSelectedFile();
  updatePublishButton();
}

function selectFile(path) {
  state.selectedPath = path;
  renderPlan();
}

function renderSelectedFile() {
  const file = state.plan?.files.find((entry) => entry.path === state.selectedPath);
  dom.newGameFilePreviewPath.textContent = file?.path || 'Select a generated file';
  dom.newGameFilePreview.textContent = file?.content || '';
}

function updatePublishButton() {
  const validPlan = state.plan && !state.plan.errors.length && state.plan.files.length > 0;
  dom.newGamePublishBtn.disabled = Boolean(
    state.loading || state.publishing || !validPlan ||
    !dom.newGameConfirmInput.checked || !dom.newGameTokenInput.value.trim(),
  );
}

async function publishNewGame(event) {
  event.preventDefault();
  if (state.publishing) return;
  rebuildPlan();
  if (!state.plan || state.plan.errors.length || !state.plan.files.length) return;
  const token = dom.newGameTokenInput.value.trim();
  if (!token) return setStatus('A fine-grained GitHub token is required.', true);
  if (!dom.newGameConfirmInput.checked) return setStatus('Review and confirm the generated file tree first.', true);

  state.publishing = true;
  dom.newGamePrLink.hidden = true;
  updatePublishButton();
  setStatus('Verifying the catalog and new package paths against current main…');
  try {
    const result = await publishWorkspacePlan({
      token,
      plan: state.plan,
      title: dom.newGamePublishTitleInput.value,
      commitMessage: dom.newGameCommitInput.value,
    });
    dom.newGameTokenInput.value = '';
    dom.newGameConfirmInput.checked = false;
    dom.newGamePrLink.href = result.pullRequestUrl;
    dom.newGamePrLink.textContent = `Open Draft Pull Request #${result.pullRequestNumber}`;
    dom.newGamePrLink.hidden = false;
    setStatus(`Draft pull request #${result.pullRequestNumber} created on branch ${result.branch}. The token was cleared.`);
  } catch (error) {
    setStatus(`New game publish failed: ${error.message}`, true);
  } finally {
    state.publishing = false;
    updatePublishButton();
  }
}

function setStatus(message, isError = false) {
  dom.newGameStatus.textContent = message;
  dom.newGameStatus.classList.toggle('error', isError);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
