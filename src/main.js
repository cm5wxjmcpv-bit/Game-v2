import { InputManager } from './input.js';
import { DebugSystem } from './debug.js';
import { AudioSystem } from './audio.js';
import { expandBag } from './inventory.js';
import { PackageGame } from './packageGame.js';
import { PackageRenderer } from './packageRenderer.js';

const canvas = document.getElementById('game-canvas');
const overlay = document.getElementById('overlay');
const playerPanel = document.getElementById('player-panel');
const contextPanel = document.getElementById('context-panel');
let flashMessage = '';
let flashUntil = 0;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function resizeCanvasToViewport() {
  const width = Math.floor(window.innerWidth);
  const height = Math.floor(window.innerHeight);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

resizeCanvasToViewport();
window.addEventListener('resize', resizeCanvasToViewport);

const ui = {
  hideOverlay() {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  },
  isOverlayOpen() {
    return !overlay.classList.contains('hidden');
  },
  showMainMenu(onStart, onLoad, actors = [], options = {}) {
    overlay.classList.remove('hidden');
    overlay.innerHTML = `<div class="modal"><h2>Pixel Engine</h2><p>Reusable 2D engine shell.</p>
      <div class="row"><button id="new-game">New Game</button><button id="load-game">Load Save</button></div></div>`;
    document.getElementById('new-game').onclick = () => ui.showActorSelect(onStart, actors);
    const loadButton = document.getElementById('load-game');
    loadButton.dataset.saveEnabled = String(options.saveEnabled !== false);
    if (options.saveEnabled === false) {
      loadButton.hidden = true;
      loadButton.disabled = true;
      loadButton.setAttribute('aria-hidden', 'true');
    }
    loadButton.onclick = () => onLoad();
  },
  showActorSelect(onStart, actors = []) {
    overlay.classList.remove('hidden');
    overlay.innerHTML = `<div class="modal"><h2>Choose Actor</h2><div id="class-opts" class="row"></div></div>`;
    const host = document.getElementById('class-opts');
    actors.forEach((actor) => {
      const health = actor.components?.health?.max ?? actor.stats?.maxHp ?? 10;
      const attack = actor.components?.combat?.attack ?? actor.stats?.attack ?? 0;
      const btn = document.createElement('button');
      btn.textContent = `${actor.name} (HP ${health}, ATK ${attack})`;
      btn.dataset.actorId = actor.id;
      btn.onclick = () => onStart(actor.id);
      host.appendChild(btn);
    });
  },
  showClassSelect(onStart, actors = []) {
    ui.showActorSelect(onStart, actors);
  },
  showLevelSelect(levelIds, completed, onPick) {
    overlay.classList.remove('hidden');
    overlay.innerHTML = `<div class="modal"><h2>Portal - Level Select</h2><div id="level-list" class="row"></div><button id="close-ol">Close</button></div>`;
    const host = document.getElementById('level-list');
    levelIds.forEach((id) => {
      const b = document.createElement('button');
      b.textContent = completed.includes(id) ? `${id} ✅` : id;
      b.onclick = () => {
        onPick(id);
        ui.hideOverlay();
      };
      host.appendChild(b);
    });
    document.getElementById('close-ol').onclick = () => ui.hideOverlay();
  },
  showShop(shop, player, db, handlers) {
    overlay.classList.remove('hidden');
    const render = () => {
      overlay.innerHTML = `<div class="modal"><h2>${escapeHtml(shop.name)}</h2><p class="small">Type: ${escapeHtml(shop.type)} | Gold: ${escapeHtml(player.gold)}</p>
        <h3>Buy</h3><div id="buy-list" class="row"></div>
        <h3>Sell (from bag)</h3><div id="sell-list" class="row"></div>
        <div class="row"><button id="bag-plus">Buy +5 bag slots (${escapeHtml(shop.bagUpgradeCost)}g)</button><button id="close-shop">Exit Shop</button></div>
      </div>`;
      const buy = document.getElementById('buy-list');
      shop.stock.forEach((offer) => {
        const btn = document.createElement('button');
        btn.textContent = `${offer.itemId} ${offer.buyPrice}g (${offer.stock ?? '∞'})`;
        btn.onclick = () => {
          const result = handlers.onBuy(offer);
          if (!result.ok) ui.flash(result.reason);
          render();
        };
        buy.appendChild(btn);
      });

      const sell = document.getElementById('sell-list');
      player.bag.items.forEach((slot) => {
        const btn = document.createElement('button');
        btn.textContent = `${slot.itemId} x${slot.count}`;
        btn.onclick = () => {
          const result = handlers.onSell(slot.itemId);
          if (!result.ok) ui.flash(result.reason);
          render();
        };
        sell.appendChild(btn);
      });

      document.getElementById('bag-plus').onclick = () => {
        const ok = expandBag(player, 5, shop.bagUpgradeCost);
        if (!ok) ui.flash('Not enough gold for bag upgrade.');
        render();
      };
      document.getElementById('close-shop').onclick = () => {
        ui.hideOverlay();
        handlers.onClose();
      };
    };
    render();
  },
  showGameOver(onRevive) {
    overlay.classList.remove('hidden');
    overlay.innerHTML = `<div class="modal"><h2>Game Over</h2><button id="revive">Return to Safe Scene</button></div>`;
    document.getElementById('revive').onclick = () => {
      onRevive();
      ui.hideOverlay();
    };
  },
  showFatalError(error) {
    overlay.classList.remove('hidden');
    overlay.innerHTML = '';

    const modal = document.createElement('div');
    modal.className = 'modal';
    const heading = document.createElement('h2');
    heading.textContent = 'Unable to Load Game';
    const message = document.createElement('p');
    message.textContent = error?.message || 'The selected game package could not be loaded.';
    const recovery = document.createElement('button');
    recovery.id = 'load-default-game';
    recovery.textContent = 'Load Default Game';
    recovery.onclick = () => window.location.assign(`${window.location.pathname}?game=sample-rpg`);

    modal.append(heading, message, recovery);
    overlay.appendChild(modal);
  },
  renderHud(game) {
    const p = game.player;
    if (!p) return;
    const identity = p.classId
      ? `<p>Class: ${escapeHtml(p.classId)}</p>`
      : `<p>Actor: ${escapeHtml(p.actorName || p.actorId)}</p>`;
    const activeFlash = flashMessage && performance.now() < flashUntil
      ? `<p class="small">${escapeHtml(flashMessage)}</p>`
      : '';
    playerPanel.innerHTML = `<h3>${escapeHtml(p.actorName || 'Player')}</h3>
      <p>HP: ${Math.max(0, Math.floor(p.stats.hp))}/${p.stats.maxHp}</p>
      <p>Gold: ${escapeHtml(p.gold)}</p>${identity}
      <p>Bag: ${p.bag.items.length}/${p.bag.slots}</p>`;
    contextPanel.innerHTML = `<h3>Context</h3>
      <p>State: ${escapeHtml(game.state.current)}</p>
      <p>Scene: ${escapeHtml(game.currentSceneId)}</p>
      <p>Town: ${escapeHtml(game.currentTownId)}</p>
      <p class="small">Move: WASD / Arrow | Interact: E | Pause: Esc | Debug: \`</p>
      ${activeFlash}`;
  },
  flash(text) {
    flashMessage = String(text || '');
    flashUntil = performance.now() + 3000;
    contextPanel.innerHTML += `<p class="small">${escapeHtml(flashMessage)}</p>`;
  },
};

const renderer = new PackageRenderer(canvas);
const input = new InputManager();
const debug = new DebugSystem();
const audio = new AudioSystem();
const game = new PackageGame({ renderer, input, debug, audio, ui });

try {
  await game.init();

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    game.update(dt, now);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
} catch (error) {
  console.error('[PixelEngine] Initialization failed.', error);
  ui.showFatalError(error);
}
