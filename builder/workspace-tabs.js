function workspaceTabs() {
  return Array.from(document.querySelectorAll('.workspace-tab'));
}

function workspaceTabButtons() {
  return Array.from(document.querySelectorAll('.workspace-tabs .tab-btn'));
}

export function activateWorkspaceTab(tab, button) {
  const targetTab = typeof tab === 'string' ? document.getElementById(tab) : tab;
  const targetButton = typeof button === 'string' ? document.getElementById(button) : button;

  workspaceTabs().forEach((entry) => entry.classList.remove('active'));
  workspaceTabButtons().forEach((entry) => {
    entry.classList.remove('active');
    entry.setAttribute('aria-selected', 'false');
  });

  targetTab?.classList.add('active');
  targetButton?.classList.add('active');
  targetButton?.setAttribute('aria-selected', 'true');
}

export function deactivateWorkspaceTab(tab, button) {
  const targetTab = typeof tab === 'string' ? document.getElementById(tab) : tab;
  const targetButton = typeof button === 'string' ? document.getElementById(button) : button;
  targetTab?.classList.remove('active');
  targetButton?.classList.remove('active');
  targetButton?.setAttribute('aria-selected', 'false');
}
