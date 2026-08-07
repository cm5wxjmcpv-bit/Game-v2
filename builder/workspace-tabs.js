function workspaceTabs() {
  return Array.from(document.querySelectorAll('.workspace-tab'));
}

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
