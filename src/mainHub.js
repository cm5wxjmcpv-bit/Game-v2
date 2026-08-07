const CATALOG_URL = new URL('../games/catalog.json', import.meta.url);
const GAME_ID_PATTERN = /^[a-z0-9][a-z0-9_-]*$/i;
const DEFAULT_GAME_ID = 'sample-rpg';

const body = document.body;
const hub = document.getElementById('main-hub');
const app = document.getElementById('app');
const gameList = document.getElementById('hub-game-list');
const status = document.getElementById('hub-status');
const runtimeBuilderLink = document.getElementById('runtime-builder-link');

function requestedGameId() {
  const value = String(new URL(window.location.href).searchParams.get('game') || '').trim();
  if (!value) return '';
  return GAME_ID_PATTERN.test(value) ? value.toLowerCase() : DEFAULT_GAME_ID;
}

function savePayloadIsValid(snapshot) {
  const player = snapshot?.player;
  const sceneId = typeof snapshot?.currentSceneId === 'string' && snapshot.currentSceneId.trim()
    ? snapshot.currentSceneId
    : typeof snapshot?.currentTownId === 'string' && snapshot.currentTownId.trim()
      ? snapshot.currentTownId
      : '';
  if (!player || typeof player !== 'object' || !sceneId) return false;
  if (!Number.isFinite(player.speed) || !Number.isFinite(player.gold)) return false;
  if (!player.stats || !Number.isFinite(player.stats.hp) || !Number.isFinite(player.stats.maxHp)) return false;
  if (!player.bag || !Array.isArray(player.bag.items) || !Number.isInteger(player.bag.slots) || player.bag.slots < 0) return false;
  if (!player.unlocks || !Array.isArray(player.unlocks.towns) || !Array.isArray(player.unlocks.levels)) return false;
  if (!Array.isArray(player.completedLevels) || !Array.isArray(player.effects)) return false;
  if (!player.equipment || typeof player.equipment !== 'object') return false;
  return true;
}

function rawSaveIsValid(raw) {
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    const payload = parsed?.payload ? parsed.payload : parsed;
    return savePayloadIsValid(payload);
  } catch {
    return false;
  }
}

function hasValidSave(gameId) {
  const keys = [`pixel_engine_save_${gameId}_slot_1`];
  if (gameId === DEFAULT_GAME_ID) keys.push('pixel_engine_save_v2', 'pixel_engine_save_v1');
  return keys.some((key) => rawSaveIsValid(localStorage.getItem(key)));
}

function makeRuntimeUrl(gameId, action = '') {
  const url = new URL('../', import.meta.url);
  url.searchParams.set('game', gameId);
  if (action) url.searchParams.set('action', action);
  return url.href;
}

function makeBuilderUrl(gameId) {
  const url = new URL('../builder/workspace.html', import.meta.url);
  url.searchParams.set('game', gameId);
  return url.href;
}

function gameBadge(name, id) {
  const words = String(name || id).trim().split(/\s+/).filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase() || '').join('');
  return initials || String(id || '?').slice(0, 2).toUpperCase();
}

function createGameCard(game) {
  const id = String(game?.id || '').trim().toLowerCase();
  if (!GAME_ID_PATTERN.test(id)) return null;

  const name = String(game?.name || id);
  const description = String(game?.description || 'Game package');
  const canContinue = hasValidSave(id);

  const article = document.createElement('article');
  article.className = 'hub-game-card';
  article.dataset.gameId = id;

  const art = document.createElement('div');
  art.className = 'hub-game-art';
  art.setAttribute('aria-hidden', 'true');
  art.textContent = gameBadge(name, id);

  const content = document.createElement('div');
  content.className = 'hub-game-content';

  const heading = document.createElement('h3');
  heading.textContent = name;

  const summary = document.createElement('p');
  summary.textContent = description;

  const saveState = document.createElement('p');
  saveState.className = `hub-save-state ${canContinue ? 'has-save' : ''}`;
  saveState.textContent = canContinue ? 'Save available' : 'No saved game';

  const actions = document.createElement('div');
  actions.className = 'hub-game-actions';

  const play = document.createElement('a');
  play.className = 'hub-action hub-action-primary';
  play.href = makeRuntimeUrl(id);
  play.textContent = 'Play';

  const newGame = document.createElement('a');
  newGame.className = 'hub-action';
  newGame.href = makeRuntimeUrl(id, 'new');
  newGame.textContent = 'New Game';

  const continueGame = document.createElement('a');
  continueGame.className = `hub-action ${canContinue ? '' : 'is-disabled'}`;
  continueGame.textContent = 'Continue';
  if (canContinue) {
    continueGame.href = makeRuntimeUrl(id, 'continue');
  } else {
    continueGame.setAttribute('aria-disabled', 'true');
    continueGame.tabIndex = -1;
  }

  const build = document.createElement('a');
  build.className = 'hub-action hub-action-secondary';
  build.href = makeBuilderUrl(id);
  build.textContent = 'Open Builder';

  actions.append(play, newGame, continueGame, build);
  content.append(heading, summary, saveState, actions);
  article.append(art, content);
  return article;
}

async function showHub() {
  body.classList.remove('booting');
  body.classList.add('hub-mode');
  app.hidden = true;
  hub.hidden = false;

  try {
    const response = await fetch(CATALOG_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Unable to load games/catalog.json (${response.status}).`);
    const catalog = await response.json();
    const games = Array.isArray(catalog?.games) ? catalog.games : [];

    gameList.replaceChildren();
    games.forEach((game) => {
      const card = createGameCard(game);
      if (card) gameList.appendChild(card);
    });

    if (!gameList.childElementCount) {
      status.textContent = 'No game packages are registered yet. Open Builder to create one.';
      return;
    }
    status.textContent = `${gameList.childElementCount} game package${gameList.childElementCount === 1 ? '' : 's'} available.`;
  } catch (error) {
    status.textContent = error?.message || 'Unable to load the game catalog.';
    status.classList.add('bad');
  }
}

function runRequestedAction() {
  const params = new URL(window.location.href).searchParams;
  const action = params.get('action');
  if (action !== 'new' && action !== 'continue') return;

  const id = action === 'new' ? 'new-game' : 'load-game';
  const button = document.getElementById(id);
  if (!button || button.hidden || button.disabled) return;

  params.delete('action');
  const cleanUrl = new URL(window.location.href);
  cleanUrl.search = params.toString();
  window.history.replaceState(null, '', cleanUrl);
  button.click();
}

async function showRuntime(gameId) {
  body.classList.remove('booting');
  body.classList.add('runtime-mode');
  hub.hidden = true;
  app.hidden = false;
  runtimeBuilderLink.href = makeBuilderUrl(gameId || DEFAULT_GAME_ID);

  await import('./save-menu-guard.js');
  await import('./main.js');
  queueMicrotask(runRequestedAction);
}

const gameId = requestedGameId();
if (gameId) {
  await showRuntime(gameId);
} else {
  await showHub();
}
