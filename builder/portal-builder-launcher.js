import { WORKSPACE_DRAFT_PREFIX } from './map-bridge-model.js';
import './npc-maker-ui.js';

function installPortalBuilderButton() {
  const exportButton = document.getElementById('exportSceneBtn');
  if (!exportButton || document.getElementById('openPortalBuilderBtn')) return;
  const button = document.createElement('button');
  button.id = 'openPortalBuilderBtn';
  button.type = 'button';
  button.className = 'secondary-btn';
  button.textContent = 'Portal Builder';
  button.addEventListener('click', openPortalBuilder);
  exportButton.parentElement?.prepend(button);
}

function openPortalBuilder() {
  const projectId = document.getElementById('projectSelect')?.value || '';
  const sceneId = document.getElementById('sceneSelect')?.value || '';
  const saveButton = document.getElementById('saveDraftBtn');
  const message = document.getElementById('workspaceMessage');
  try {
    if (!projectId || !sceneId) throw new Error('Select a game project and scene first.');
    saveButton?.click();
    if (saveButton?.dataset.saveStatus === 'error') {
      throw new Error('The current workspace draft could not be saved in browser storage.');
    }
    const raw = localStorage.getItem(`${WORKSPACE_DRAFT_PREFIX}${projectId}`);
    if (!raw) throw new Error('Save the workspace draft before opening Portal Builder.');
    const draft = JSON.parse(raw);
    if (!draft?.scenes?.some((scene) => scene.id === sceneId)) {
      throw new Error('The selected scene was not found in the saved workspace draft.');
    }
    const url = new URL('portal-builder.html', window.location.href);
    url.searchParams.set('game', projectId);
    url.searchParams.set('scene', sceneId);
    window.location.href = url.href;
  } catch (error) {
    if (message) {
      message.textContent = `Unable to open Portal Builder: ${error.message}`;
      message.classList.add('error');
    }
  }
}

document.addEventListener('DOMContentLoaded', installPortalBuilderButton);
