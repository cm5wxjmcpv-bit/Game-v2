import { loadGame } from './saveSystem.js';

const overlay = document.getElementById('overlay');

function syncLoadButton() {
  const button = document.getElementById('load-game');
  if (!button) return;
  const hasValidSave = Boolean(loadGame());
  button.hidden = !hasValidSave;
  button.disabled = !hasValidSave;
  button.setAttribute('aria-hidden', String(!hasValidSave));
}

if (overlay) {
  new MutationObserver(syncLoadButton).observe(overlay, { childList: true, subtree: true });
  syncLoadButton();
}
