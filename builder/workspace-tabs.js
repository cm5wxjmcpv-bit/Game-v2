const ACTIVE_TAB_KEY = 'pixel_engine_workspace_active_tab';
const TAB_QUERY_BUTTONS = Object.freeze({
  scene: 'workspaceSceneTabBtn',
  actors: 'workspaceActorTabBtn',
  actor: 'workspaceActorTabBtn',
  npcs: 'workspaceNpcTabBtn',
  npc: 'workspaceNpcTabBtn',
  weapons: 'workspaceWeaponTabBtn',
  weapon: 'workspaceWeaponTabBtn',
  objects: 'workspaceObjectsTabBtn',
  'scene-objects': 'workspaceObjectsTabBtn',
  'new-game': 'workspaceNewGameTabBtn',
  publish: 'workspacePublishTabBtn',
});

function workspaceTabs() {
  return Array.from(document.querySelectorAll('.workspace-tab'));
}

function rememberActiveTab(button) {
  if (!button?.id) return;
  try {
    sessionStorage.setItem(ACTIVE_TAB_KEY, button.id);
  } catch {
    // Tab memory is optional when browser storage is unavailable.
  }
}

function requestedTabButtonId() {
  const requested = new URL(window.location.href).searchParams.get('tab');
  if (requested && TAB_QUERY_BUTTONS[requested.toLowerCase()]) return TAB_QUERY_BUTTONS[requested.toLowerCase()];
  try {
    return sessionStorage.getItem(ACTIVE_TAB_KEY) || '';
  } catch {
    return '';
  }
}

function restoreRequestedTab() {
  const buttonId = requestedTabButtonId();
  if (!buttonId) return true;
  const button = document.getElementById(buttonId);
  const panel = button?.getAttribute('aria-controls')
    ? document.getElementById(button.getAttribute('aria-controls'))
    : null;
  if (!button || !panel) return false;
  if (!button.classList.contains('active') || !panel.classList.contains('active')) button.click();
  return true;
}

window.addEventListener('pixel-engine-workspace-loaded', () => {
  window.setTimeout(restoreRequestedTab, 0);
});

document.addEventListener('DOMContentLoaded', () => {
  const observer = new MutationObserver(() => {
    if (restoreRequestedTab()) observer.disconnect();
  });
  const tabBar = document.querySelector('.workspace-tabs');
  if (tabBar && !restoreRequestedTab()) observer.observe(tabBar, { childList: true });
});

function workspaceTabButtons() {
  return Array.from(document.querySelectorAll('.workspace-tabs .tab-btn'));
}

document.addEventListener('keydown', (event) => {
  const current = event.target?.closest?.('.workspace-tabs [role="tab"]');
  if (!current) return;
  const buttons = workspaceTabButtons();
  const index = buttons.indexOf(current);
  if (index < 0) return;
  let nextIndex = index;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % buttons.length;
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + buttons.length) % buttons.length;
  else if (event.key === 'Home') nextIndex = 0;
  else if (event.key === 'End') nextIndex = buttons.length - 1;
  else return;
  event.preventDefault();
  buttons[nextIndex].click();
  buttons[nextIndex].focus();
});

export function activateWorkspaceTab(tab, button) {
  const targetTab = typeof tab === 'string' ? document.getElementById(tab) : tab;
  const targetButton = typeof button === 'string' ? document.getElementById(button) : button;

  workspaceTabs().forEach((entry) => {
    entry.classList.remove('active');
    entry.setAttribute('aria-hidden', 'true');
  });
  workspaceTabButtons().forEach((entry) => {
    entry.classList.remove('active');
    entry.setAttribute('aria-selected', 'false');
    entry.tabIndex = -1;
  });

  targetTab?.classList.add('active');
  targetTab?.setAttribute('aria-hidden', 'false');
  targetButton?.classList.add('active');
  targetButton?.setAttribute('aria-selected', 'true');
  if (targetButton) targetButton.tabIndex = 0;
  rememberActiveTab(targetButton);
}

export function deactivateWorkspaceTab(tab, button) {
  const targetTab = typeof tab === 'string' ? document.getElementById(tab) : tab;
  const targetButton = typeof button === 'string' ? document.getElementById(button) : button;
  targetTab?.classList.remove('active');
  targetTab?.setAttribute('aria-hidden', 'true');
  targetButton?.classList.remove('active');
  targetButton?.setAttribute('aria-selected', 'false');
  if (targetButton) targetButton.tabIndex = -1;
}
