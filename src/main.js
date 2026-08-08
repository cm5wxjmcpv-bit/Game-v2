import { loadActiveGamePackage } from './gameManifest.js';
import { GAME_TYPES, runtimeModuleForGameType } from './runtimeTypes.js';

function showRuntimeLoadError(error) {
  const overlay = document.getElementById('overlay');
  if (!overlay) return;

  overlay.classList.remove('hidden');
  overlay.replaceChildren();

  const modal = document.createElement('div');
  modal.className = 'modal';
  const heading = document.createElement('h2');
  heading.textContent = 'Unable to Load Game';
  const message = document.createElement('p');
  message.textContent = error?.message || 'The selected game package could not be loaded.';
  const recovery = document.createElement('button');
  recovery.id = 'load-default-game';
  recovery.type = 'button';
  recovery.textContent = 'Load Default Game';
  recovery.onclick = () => window.location.assign(`${window.location.pathname}?game=sample-rpg`);
  modal.append(heading, message, recovery);
  overlay.appendChild(modal);
}

try {
  const gamePackage = await loadActiveGamePackage();
  document.body.dataset.gameType = gamePackage.manifest.gameType;

  if (gamePackage.manifest.gameType === GAME_TYPES.ADVENTURE) {
    await import('./save-menu-guard.js');
  }
  await import(runtimeModuleForGameType(gamePackage.manifest.gameType));
} catch (error) {
  console.error('[L-C Forge] Runtime initialization failed.', error);
  showRuntimeLoadError(error);
}
