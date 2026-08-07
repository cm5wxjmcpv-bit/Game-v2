import { InputManager } from './input.js';
import { DebugSystem } from './debug.js';
import { AudioSystem } from './audio.js';
import { expandBag } from './inventory.js';
import { getStatBlock } from './equipment.js';
import { getWeaponRaritySettings, isWeaponItem } from './weaponSystem.js';
import { rewardPackageLabels } from './rewardSystem.js';
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

function itemArtwork(item) {
  return item?.weapon?.art?.icon?.src || item?.image || '';
}

function itemCard(item, extra = '') {
  const art = itemArtwork(item);
  const rarity = String(item?.rarity || 'common').toLowerCase();
  return `<span class="item-card rarity-${escapeHtml(rarity)}">
    ${art ? `<img src="${escapeHtml(art)}" alt="" class="item-icon">` : '<span class="item-icon item-icon-fallback">◆</span>'}
    <span><strong>${escapeHtml(item?.name || item?.id || 'Unknown item')}</strong>${extra}</span>
  </span>`;
}

function weaponSummary(item) {
  if (!isWeaponItem(item)) return '';
  const normal = item.weapon?.normalAttack || {};
  const special = item.weapon?.specialAttack || {};
  return `<span class="small">${escapeHtml(item.weapon?.family)} / ${escapeHtml(item.weapon?.subtype)} · Power ${escapeHtml(normal.power ?? item.power ?? 0)} · Range ${escapeHtml(normal.range ?? item.attackRange ?? 1)}${special.enabled ? ` · Special: ${escapeHtml(special.preset)}` : ''}</span>`;
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
      const offers = handlers.getInventory ? handlers.getInventory() : shop.stock || [];
      overlay.innerHTML = `<div class="modal"><h2>${escapeHtml(shop.name)}</h2><p class="small">Type: ${escapeHtml(shop.type)} | Gold: ${escapeHtml(player.gold)}</p>
        <h3>Buy</h3><div id="buy-list" class="inventory-list"></div>
        <h3>Sell from inventory</h3><div id="sell-list" class="inventory-list"></div>
        <div class="row">${Number.isFinite(Number(shop.bagUpgradeCost)) ? `<button id="bag-plus">Buy +5 bag slots (${escapeHtml(shop.bagUpgradeCost)}g)</button>` : ''}<button id="close-shop">Exit Shop</button></div>
      </div>`;
      const buy = document.getElementById('buy-list');
      offers.forEach((offer) => {
        const item = db.itemsById[offer.itemId];
        const row = document.createElement('div');
        row.className = 'inventory-row';
        row.innerHTML = itemCard(item, `<br>${weaponSummary(item)}<br><span class="small">${escapeHtml(offer.buyPrice)} gold · Stock ${offer.availableStock ?? 'Unlimited'}</span>`);
        const btn = document.createElement('button');
        btn.textContent = 'Buy';
        btn.disabled = offer.availableStock === 0;
        btn.onclick = () => {
          const result = handlers.onBuy(offer);
          if (!result.ok) ui.flash(result.reason);
          render();
        };
        row.appendChild(btn);
        buy.appendChild(row);
      });

      const sell = document.getElementById('sell-list');
      player.bag.items.forEach((slot, index) => {
        const item = db.itemsById[slot.itemId];
        const row = document.createElement('div');
        row.className = 'inventory-row';
        row.innerHTML = itemCard(item, `<br><span class="small">Count ${escapeHtml(slot.count)}${slot.favorite ? ' · ★ Favorite' : ''}</span>`);
        const btn = document.createElement('button');
        btn.textContent = 'Sell';
        btn.onclick = () => {
          let result = handlers.onSell(slot.itemId, slot.instanceId, false);
          if (result.requiresConfirmation && window.confirm(result.reason)) {
            result = handlers.onSell(slot.itemId, slot.instanceId, true);
          }
          if (!result.ok && !result.requiresConfirmation) ui.flash(result.reason);
          render();
        };
        row.dataset.slotIndex = String(index);
        row.appendChild(btn);
        sell.appendChild(row);
      });

      const bagButton = document.getElementById('bag-plus');
      if (bagButton) bagButton.onclick = () => {
          const ok = expandBag(player, 5, Number(shop.bagUpgradeCost));
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
  showInventory(player, db, handlers) {
    overlay.classList.remove('hidden');
    const render = () => {
      const equipped = db.itemsById[player.equipment.weapon];
      const stats = getStatBlock(player, db.itemsById);
      overlay.innerHTML = `<div class="modal modal-wide">
        <div class="modal-title-row"><div><h2>Inventory & Equipment</h2><p class="small">${player.bag.items.length}/${player.bag.slots} slots used · Equip weapons any time outside active combat.</p></div><button id="close-inventory">Back to Game</button></div>
        <section class="equipment-summary"><h3>Equipped Weapon</h3>${equipped ? itemCard(equipped, `<br>${weaponSummary(equipped)}`) : '<p>None equipped</p>'}
          <p class="small">Total ATK ${escapeHtml(stats.attack)} · DEF ${escapeHtml(stats.defense)} · AGI ${escapeHtml(stats.agility)}</p></section>
        <div id="inventory-list" class="inventory-list"></div>
      </div>`;
      const host = document.getElementById('inventory-list');
      player.bag.items.forEach((slot, index) => {
        const item = db.itemsById[slot.itemId];
        const equippedHere = slot.instanceId
          ? player.equipmentInstances?.[item?.equipSlot] === slot.instanceId
          : player.equipment?.[item?.equipSlot] === slot.itemId;
        const row = document.createElement('div');
        row.className = `inventory-row${equippedHere ? ' equipped-row' : ''}`;
        row.innerHTML = itemCard(item, `<br>${weaponSummary(item)}<br><span class="small">${equippedHere ? 'Equipped · ' : ''}${slot.favorite ? '★ Favorite · ' : ''}Count ${escapeHtml(slot.count)}</span>`);
        const actions = document.createElement('div');
        actions.className = 'row inventory-actions';
        if (item?.equipSlot) {
          const equip = document.createElement('button');
          equip.textContent = equippedHere ? 'Equipped' : 'Equip';
          equip.disabled = equippedHere || !handlers.canEquip();
          equip.onclick = () => {
            const result = handlers.onEquip(index);
            if (!result.ok) ui.flash(result.reason);
            render();
          };
          actions.appendChild(equip);
        }
        if (slot.instanceId) {
          const favorite = document.createElement('button');
          favorite.textContent = slot.favorite ? 'Unfavorite' : 'Favorite';
          favorite.onclick = () => {
            const result = handlers.onFavorite(index);
            if (!result.ok) ui.flash(result.reason);
            render();
          };
          actions.appendChild(favorite);
        }
        const drop = document.createElement('button');
        drop.textContent = 'Drop';
        drop.onclick = () => {
          let result = handlers.onDrop(index, false);
          if (result.requiresConfirmation && window.confirm(result.reason)) result = handlers.onDrop(index, true);
          if (!result.ok && !result.requiresConfirmation) ui.flash(result.reason);
          render();
        };
        actions.appendChild(drop);
        row.appendChild(actions);
        host.appendChild(row);
      });
      document.getElementById('close-inventory').onclick = handlers.onClose;
    };
    render();
  },
  showRewardPackage(title, rewardPackage, db, handlers) {
    overlay.classList.remove('hidden');
    const labels = rewardPackageLabels(rewardPackage, db.itemsById);
    overlay.innerHTML = `<div class="modal"><h2>${escapeHtml(title)}</h2><p>Reward package:</p>
      <ul>${labels.map((label) => `<li>${escapeHtml(label)}</li>`).join('')}</ul>
      <div class="row"><button id="claim-reward">Add to Inventory</button>${handlers.allowLeave ? '<button id="leave-reward">Leave Reward</button>' : ''}</div></div>`;
    document.getElementById('claim-reward').onclick = handlers.onClaim;
    const leave = document.getElementById('leave-reward');
    if (leave) leave.onclick = handlers.onLeave;
  },
  showRewardOverflow(title, rewardPackage, player, db, handlers) {
    overlay.classList.remove('hidden');
    overlay.innerHTML = `<div class="modal"><h2>${escapeHtml(title)}</h2>
      <p class="bad">Inventory is full. Drop an inventory slot to collect this reward, or leave it behind.</p>
      <p>${rewardPackageLabels(rewardPackage, db.itemsById).map(escapeHtml).join(' · ')}</p>
      <div id="overflow-bag" class="inventory-list"></div><button id="leave-overflow">Leave Reward</button></div>`;
    const host = document.getElementById('overflow-bag');
    player.bag.items.forEach((slot, index) => {
      const item = db.itemsById[slot.itemId];
      const row = document.createElement('div');
      row.className = 'inventory-row';
      row.innerHTML = itemCard(item, `<br><span class="small">Count ${escapeHtml(slot.count)}${slot.favorite ? ' · ★ Favorite' : ''}</span>`);
      const button = document.createElement('button');
      button.textContent = 'Drop & Collect';
      button.onclick = () => {
        let result = handlers.onDrop(index, false);
        if (result.requiresConfirmation && window.confirm(result.reason)) result = handlers.onDrop(index, true);
        if (!result.ok && !result.requiresConfirmation) ui.flash(result.reason);
      };
      row.appendChild(button);
      host.appendChild(row);
    });
    document.getElementById('leave-overflow').onclick = handlers.onLeave;
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
    const weapon = game.db.itemsById[p.equipment.weapon];
    const normalAttack = weapon?.weapon?.normalAttack;
    const specialAttack = weapon?.weapon?.specialAttack;
    const ammoCount = normalAttack?.resource?.type === 'ammo'
      ? p.bag.items.filter((slot) => slot.itemId === normalAttack.resource.itemId).reduce((sum, slot) => sum + slot.count, 0)
      : null;
    const mana = p.resources?.mana;
    const rarity = getWeaponRaritySettings(game.db.settings)[weapon?.rarity || 'common'];
    if (!playerPanel.querySelector('#hud-inventory')) {
      playerPanel.innerHTML = `<h3 id="hud-player-name"></h3><p id="hud-health"></p><p id="hud-mana"></p><p id="hud-gold"></p><p id="hud-identity"></p><p id="hud-bag"></p><hr><p>Weapon: <span id="hud-weapon"></span></p><p id="hud-ammo"></p><p id="hud-reload" class="bad"></p><p id="hud-special-status"></p><div class="row"><button id="hud-inventory">Inventory (I)</button><button id="hud-special">Special (Q)</button></div>`;
      playerPanel.querySelector('#hud-inventory').onclick = () => game.openInventory();
      playerPanel.querySelector('#hud-special').onclick = () => game.activateSpecialAttack();
    }
    const set = (id, value) => { const node = playerPanel.querySelector(`#${id}`); if (node) node.textContent = value; };
    set('hud-player-name', p.actorName || 'Player');
    set('hud-health', `HP: ${Math.max(0, Math.floor(p.stats.hp))}/${p.stats.maxHp}`);
    set('hud-mana', mana ? `Mana: ${Math.floor(mana.current)}/${mana.max}` : '');
    set('hud-gold', `Gold: ${p.gold}`);
    set('hud-identity', p.classId ? `Class: ${p.classId}` : `Actor: ${p.actorName || p.actorId}`);
    set('hud-bag', `Bag: ${p.bag.items.length}/${p.bag.slots}`);
    set('hud-weapon', weapon?.name || 'Unarmed');
    playerPanel.querySelector('#hud-weapon').style.color = rarity?.color || '#fff';
    set('hud-ammo', ammoCount !== null ? `Ammo: ${ammoCount} ${normalAttack.resource.itemId}` : '');
    set('hud-reload', p.cooldowns?.reload > 0 ? `Reloading: ${p.cooldowns.reload.toFixed(1)}s` : '');
    set('hud-special-status', specialAttack?.enabled ? `Special: ${p.cooldowns.specialAttack > 0 ? `${p.cooldowns.specialAttack.toFixed(1)}s` : 'Ready'}` : '');
    const specialButton = playerPanel.querySelector('#hud-special');
    specialButton.hidden = !specialAttack?.enabled;
    specialButton.disabled = game.state.current === 'battle';

    if (!contextPanel.querySelector('#hud-state')) {
      contextPanel.innerHTML = `<h3>Context</h3><p>State: <span id="hud-state"></span></p><p>Scene: <span id="hud-scene"></span></p><p>Town: <span id="hud-town"></span></p><p class="small">Move: WASD / Arrow | Interact: E | Inventory: I | Special: Q | Pause: Esc | Debug: \`</p><p id="hud-flash" class="small"></p>`;
    }
    contextPanel.querySelector('#hud-state').textContent = game.state.current;
    contextPanel.querySelector('#hud-scene').textContent = game.currentSceneId || '';
    contextPanel.querySelector('#hud-town').textContent = game.currentTownId || '';
    contextPanel.querySelector('#hud-flash').textContent = flashMessage && performance.now() < flashUntil ? flashMessage : '';
  },
  flash(text) {
    flashMessage = String(text || '');
    flashUntil = performance.now() + 3000;
    const flash = contextPanel.querySelector('#hud-flash');
    if (flash) flash.textContent = flashMessage;
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
