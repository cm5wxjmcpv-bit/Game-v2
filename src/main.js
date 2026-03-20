import { Renderer } from './renderer.js';
import { InputManager } from './input.js';
import { DebugSystem } from './debug.js';
import { AudioSystem } from './audio.js';
import { Game } from './game.js';
import { expandBag } from './inventory.js';

const canvas = document.getElementById('game-canvas');
const overlay = document.getElementById('overlay');
const playerPanel = document.getElementById('player-panel');
const contextPanel = document.getElementById('context-panel');

const ui = {
  hideOverlay() {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
  },
  showMainMenu(onStart, onLoad) {
    overlay.classList.remove('hidden');
    overlay.innerHTML = `<div class="modal"><h2>Pixel Engine</h2><p>Reusable 2D engine shell.</p>
      <div class="row"><button id="new-game">New Game</button><button id="load-game">Load Save</button></div></div>`;
    document.getElementById('new-game').onclick = () => ui.showClassSelect(onStart);
    document.getElementById('load-game').onclick = () => onLoad();
  },
  showClassSelect(onStart) {
    fetch('./data/classes/classes.json').then((r) => r.json()).then((data) => {
      overlay.classList.remove('hidden');
      overlay.innerHTML = `<div class="modal"><h2>Choose Class</h2><div id="class-opts" class="row"></div></div>`;
      const host = document.getElementById('class-opts');
      data.classes.forEach((c) => {
        const btn = document.createElement('button');
        btn.textContent = `${c.name} (HP ${c.stats.maxHp}, ATK ${c.stats.attack})`;
        btn.onclick = () => onStart(c.id);
        host.appendChild(btn);
      });
    });
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
      overlay.innerHTML = `<div class="modal"><h2>${shop.name}</h2><p class="small">Type: ${shop.type} | Gold: ${player.gold}</p>
        <h3>Buy</h3><div id="buy-list" class="row"></div>
        <h3>Sell (from bag)</h3><div id="sell-list" class="row"></div>
        <div class="row"><button id="bag-plus">Buy +5 bag slots (${shop.bagUpgradeCost}g)</button><button id="close-shop">Exit Shop</button></div>
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
    overlay.innerHTML = `<div class="modal"><h2>Game Over</h2><button id="revive">Return to Town</button></div>`;
    document.getElementById('revive').onclick = () => {
      onRevive();
      ui.hideOverlay();
    };
  },
  renderHud(game) {
    const p = game.player;
    if (!p) return;
    playerPanel.innerHTML = `<h3>Player</h3>
      <p>HP: ${Math.max(0, Math.floor(p.stats.hp))}/${p.stats.maxHp}</p>
      <p>Gold: ${p.gold}</p><p>Class: ${p.classId}</p>
      <p>Bag: ${p.bag.items.length}/${p.bag.slots}</p>`;
    contextPanel.innerHTML = `<h3>Context</h3>
      <p>State: ${game.state.current}</p>
      <p>Town: ${game.currentTownId}</p>
      <p class="small">Move: WASD / Arrow | Interact: E | Pause: Esc | Debug: \\`</p>`;
  },
  flash(text) {
    contextPanel.innerHTML += `<p class="small">${text}</p>`;
  },
};

const renderer = new Renderer(canvas);
const input = new InputManager();
const debug = new DebugSystem();
const audio = new AudioSystem();
audio.register('heal', './assets/audio/heal.wav');

const game = new Game({ renderer, input, debug, audio, ui });
await game.init();

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  game.update(dt, now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
