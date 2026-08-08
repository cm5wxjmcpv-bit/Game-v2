import { activateWorkspaceTab } from './workspace-tabs.js';
import {
  applyWeaponAvailability,
  cloneWeaponDefinition,
  createWeaponDefinition,
  exportWeaponPack,
  importWeaponPack,
  scanWeaponReferences,
  validateWeaponDefinition,
  weaponItems,
  weaponSubtypeOptions,
} from './weapon-workspace-model.js';
import { SPECIAL_ATTACK_PRESETS, WEAPON_RARITIES, defaultAnimationTemplate } from '../src/weaponSystem.js';

const root = document.getElementById('weaponMakerRoot');
const tab = document.getElementById('workspaceWeaponTab');
const tabButton = document.getElementById('workspaceWeaponTabBtn');
let workspace = null;
let current = null;
let selectedId = '';
let activeArtRole = 'equipped';
let reuseArtwork = true;
let autosaveTimer = null;
let autoTestTimer = null;
let arena = null;

tabButton.addEventListener('click', () => {
  activateWorkspaceTab(tab, tabButton);
  connectWorkspace();
});
window.addEventListener('pixel-engine-workspace-loaded', connectWorkspace);
window.addEventListener('pixel-engine-workspace-content-changed', () => {
  workspace = window.pixelEngineWorkspace?.getState?.() || workspace;
});

connectWorkspace();

function connectWorkspace() {
  const api = window.pixelEngineWorkspace;
  if (!api) return;
  workspace = api.getState();
  const weapons = weaponItems(workspace.items);
  if (!current || !weapons.some((weapon) => weapon.id === selectedId)) {
    selectedId = weapons[0]?.id || '';
    current = selectedId ? structuredClone(weapons[0]) : restoreAutosave() || createWeaponDefinition();
  }
  render();
}

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function option(value, label, selected) {
  return `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function currentArt() {
  current.weapon.art ||= {};
  current.weapon.art[activeArtRole] ||= { src: '', scale: 1, rotation: 0, flipX: false, crop: { top: 0, right: 0, bottom: 0, left: 0 } };
  return current.weapon.art[activeArtRole];
}

function render(options = {}) {
  if (!workspace || !current) return;
  const preserveViewport = options.preserveViewport !== false && tab.classList.contains('active');
  const viewport = preserveViewport ? { x: window.scrollX, y: window.scrollY } : null;
  clearAutoTest();
  const weapons = weaponItems(workspace.items);
  const validation = validateWeaponDefinition(current);
  current = validation.weapon;
  const normal = current.weapon.normalAttack;
  const special = current.weapon.specialAttack;
  const art = currentArt();
  const crop = art.crop || {};
  const refs = selectedId ? scanWeaponReferences(selectedId, workspace) : [];
  const availability = detectAvailability(selectedId || current.id);
  const ammoItems = (workspace.items || []).filter((item) => item.category === 'ammo' || item.tags?.includes?.('ammo'));

  root.innerHTML = `
    <div class="weapon-maker-heading">
      <div><h2>Weapon Maker</h2><p>Build the weapon once, test it, and assign it to actors, shops, enemy loot, map pickups, or three-tier rewards without hand-editing IDs.</p></div>
      <div class="workspace-inline-actions"><button id="wm-import-pack" type="button" class="secondary-btn">Import Weapon Pack</button><input id="wm-import-file" type="file" accept="application/json,.json" hidden></div>
    </div>
    <div class="weapon-maker-layout">
      <aside class="weapon-library">
        <h3>Project Weapons</h3>
        <div class="weapon-library-actions">
          <button id="wm-new" type="button">Start Blank</button>
          <div class="workspace-two-column"><select id="wm-preset-family" class="text-input"><option value="melee">Melee preset</option><option value="ranged">Ranged preset</option><option value="magic">Magic preset</option></select><button id="wm-use-preset" type="button">Use Preset</button></div>
          <button id="wm-clone" type="button" class="secondary-btn"${selectedId ? '' : ' disabled'}>Clone Selected</button>
          <button id="wm-export-pack" type="button" class="secondary-btn">Export Complete Pack</button>
          <button id="wm-delete" type="button" class="danger-btn"${selectedId ? '' : ' disabled'}>Delete Selected</button>
        </div>
        <div class="weapon-library-list">${weapons.map((weapon) => `<button type="button" class="secondary-btn weapon-library-button${weapon.id === selectedId ? ' active' : ''}" data-weapon-id="${esc(weapon.id)}"><span>${esc(weapon.name)}<br><small>${esc(weapon.id)}</small></span><span class="workspace-source-tag">${esc(weapon.rarity)}</span></button>`).join('') || '<p class="small">No weapons saved yet.</p>'}</div>
        <h3>Current Uses</h3>
        ${refs.length ? `<ul class="weapon-reference-list">${refs.map((ref) => `<li>${esc(ref.kind)}: ${esc(ref.label)}</li>`).join('')}</ul>` : '<p class="small">No saved references yet.</p>'}
      </aside>
      <section class="weapon-editor">
        <form id="wm-form" novalidate>
          <section class="weapon-step"><h3><span class="weapon-step-number">1</span> Identity & Family</h3>
            <div class="weapon-form-grid">
              <div><label class="field-label" for="wm-id">Weapon ID</label><input id="wm-id" class="text-input" value="${esc(current.id)}" required></div>
              <div><label class="field-label" for="wm-name">Name</label><input id="wm-name" class="text-input" value="${esc(current.name)}" required></div>
              <div><label class="field-label" for="wm-rarity">Rarity</label><select id="wm-rarity" class="text-input">${WEAPON_RARITIES.map((rarity) => option(rarity, rarity[0].toUpperCase() + rarity.slice(1), current.rarity)).join('')}</select></div>
              <div><label class="field-label" for="wm-family">Family</label><select id="wm-family" class="text-input">${['melee', 'ranged', 'magic'].map((family) => option(family, family[0].toUpperCase() + family.slice(1), current.weapon.family)).join('')}</select></div>
              <div><label class="field-label" for="wm-subtype">Subtype</label><select id="wm-subtype" class="text-input">${weaponSubtypeOptions(current.weapon.family).map((subtype) => option(subtype, subtype, current.weapon.subtype)).join('')}</select></div>
              <div><label class="field-label" for="wm-value">Base Shop Value</label><input id="wm-value" class="text-input" type="number" min="0" value="${esc(current.baseValue ?? 0)}"></div>
              <div class="span-all"><label class="field-label" for="wm-description">Description</label><textarea id="wm-description" class="text-input" rows="2">${esc(current.description || '')}</textarea></div>
            </div>
          </section>

          <section class="weapon-step"><h3><span class="weapon-step-number">2</span> Standard & Special Attacks</h3>
            <h4>Standard attack — automatic in real-time combat</h4>
            <div class="weapon-form-grid">
              <div><label class="field-label" for="wm-normal-power">Weapon Power</label><input id="wm-normal-power" class="text-input" type="number" min="0" step="0.1" value="${normal.power}"></div>
              <div><label class="field-label" for="wm-normal-range">Range</label><input id="wm-normal-range" class="text-input" type="number" min="0.1" step="0.1" value="${normal.range}"></div>
              <div><label class="field-label" for="wm-normal-cooldown">Cooldown (seconds)</label><input id="wm-normal-cooldown" class="text-input" type="number" min="0" step="0.05" value="${normal.cooldown}"></div>
              <div><label class="field-label" for="wm-damage-type">Damage Type</label><input id="wm-damage-type" class="text-input" list="wm-damage-types" value="${esc(current.weapon.damageType)}"><datalist id="wm-damage-types"><option>physical</option><option>fire</option><option>ice</option><option>lightning</option><option>poison</option><option>magic</option></datalist></div>
              <div><label class="field-label" for="wm-normal-resource">Cost Type</label><select id="wm-normal-resource" class="text-input">${['none', 'ammo', 'mana'].map((type) => option(type, type === 'none' ? 'No cost / cooldown only' : type, normal.resource.type)).join('')}</select></div>
              <div><label class="field-label" for="wm-normal-cost">Cost Per Attack</label><input id="wm-normal-cost" class="text-input" type="number" min="0" value="${normal.resource.cost}"></div>
              <div><label class="field-label" for="wm-ammo-id">Ammo Category / Item</label><input id="wm-ammo-id" class="text-input" list="wm-ammo-items" value="${esc(normal.resource.itemId || '')}" ${normal.resource.type === 'ammo' ? '' : 'disabled'}><datalist id="wm-ammo-items">${ammoItems.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}<option value="ammo_arrows">Arrows</option><option value="ammo_bolts">Bolts</option><option value="ammo_bullets">Bullets</option></datalist></div>
              <label class="checkbox-row"><input id="wm-reload-enabled" type="checkbox"${normal.requiresReload ? ' checked' : ''}> Requires reload</label>
              <div><label class="field-label" for="wm-reload-time">Reload Time (seconds)</label><input id="wm-reload-time" class="text-input" type="number" min="0" step="0.1" value="${normal.reloadTime}"${normal.requiresReload ? '' : ' disabled'}></div>
            </div>
            <hr><label class="checkbox-row"><input id="wm-special-enabled" type="checkbox"${special.enabled ? ' checked' : ''}> Include an optional Special attack</label>
            <div class="weapon-form-grid${special.enabled ? '' : ' is-disabled'}">
              <div><label class="field-label" for="wm-special-preset">Preset</label><select id="wm-special-preset" class="text-input"${special.enabled ? '' : ' disabled'}>${Object.entries(SPECIAL_ATTACK_PRESETS).map(([id, preset]) => option(id, preset.label, special.preset)).join('')}</select></div>
              <div><label class="field-label" for="wm-special-power">Power</label><input id="wm-special-power" class="text-input" type="number" min="0" step="0.1" value="${special.power}"${special.enabled ? '' : ' disabled'}></div>
              <div><label class="field-label" for="wm-special-multiplier">Multiplier</label><input id="wm-special-multiplier" class="text-input" type="number" min="0" step="0.05" value="${special.multiplier}"${special.enabled ? '' : ' disabled'}></div>
              <div><label class="field-label" for="wm-special-range">Range</label><input id="wm-special-range" class="text-input" type="number" min="0.1" step="0.1" value="${special.range}"${special.enabled ? '' : ' disabled'}></div>
              <div><label class="field-label" for="wm-special-cooldown">Cooldown</label><input id="wm-special-cooldown" class="text-input" type="number" min="0" step="0.1" value="${special.cooldown}"${special.enabled ? '' : ' disabled'}></div>
              <div><label class="field-label" for="wm-special-resource">Cost Type</label><select id="wm-special-resource" class="text-input"${special.enabled ? '' : ' disabled'}>${['none', 'ammo', 'mana'].map((type) => option(type, type, special.resource.type)).join('')}</select></div>
              <div><label class="field-label" for="wm-special-cost">Resource Cost</label><input id="wm-special-cost" class="text-input" type="number" min="0" value="${special.resource.cost}"${special.enabled ? '' : ' disabled'}></div>
              <div><label class="field-label" for="wm-special-ammo">Special Ammo Item</label><input id="wm-special-ammo" class="text-input" value="${esc(special.resource.itemId || '')}"${special.enabled && special.resource.type === 'ammo' ? '' : ' disabled'}></div>
            </div>
          </section>

          <section class="weapon-step"><h3><span class="weapon-step-number">3</span> Artwork & Shared Animation</h3>
            <label class="checkbox-row"><input id="wm-reuse-art" type="checkbox"${reuseArtwork ? ' checked' : ''}> Reuse one image for inventory, equipped weapon, and projectile</label>
            <div class="weapon-art-layout">
              <div class="weapon-preview"><div class="weapon-preview-character"></div>${art.src ? `<img id="wm-preview-image" class="weapon-preview-image" src="${esc(art.src)}" alt="Weapon preview">` : '<div id="wm-preview-image" class="weapon-preview-image"></div>'}<span class="weapon-preview-label">Live fixed-hand-anchor preview · ${esc(activeArtRole)}</span></div>
              <div class="weapon-art-controls">
                <div class="weapon-art-role-tabs">${['icon', 'equipped', 'projectile'].map((role) => `<button type="button" data-art-role="${role}" class="secondary-btn${role === activeArtRole ? ' active' : ''}">${role}</button>`).join('')}</div>
                <label class="field-label" for="wm-art-file">Upload ${esc(activeArtRole)} image</label><input id="wm-art-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif">
                <label class="field-label" for="wm-art-scale">Scale: <span id="wm-art-scale-value">${art.scale}</span></label><input id="wm-art-scale" type="range" min="0.1" max="4" step="0.05" value="${art.scale}">
                <label class="field-label" for="wm-art-rotation">Rotation</label><input id="wm-art-rotation" class="text-input" type="number" step="1" value="${art.rotation}">
                <label class="checkbox-row"><input id="wm-art-flip" type="checkbox"${art.flipX ? ' checked' : ''}> Flip horizontally</label>
                <div class="weapon-form-grid two"><div><label class="field-label" for="wm-crop-top">Crop Top</label><input id="wm-crop-top" class="text-input" type="number" min="0" value="${crop.top || 0}"></div><div><label class="field-label" for="wm-crop-right">Crop Right</label><input id="wm-crop-right" class="text-input" type="number" min="0" value="${crop.right || 0}"></div><div><label class="field-label" for="wm-crop-bottom">Crop Bottom</label><input id="wm-crop-bottom" class="text-input" type="number" min="0" value="${crop.bottom || 0}"></div><div><label class="field-label" for="wm-crop-left">Crop Left</label><input id="wm-crop-left" class="text-input" type="number" min="0" value="${crop.left || 0}"></div></div>
              </div>
            </div>
            <p class="small">Default animation: <strong>${esc(current.weapon.animationTemplate)}</strong>. All ${esc(current.weapon.subtype)} weapons can share this animation even when their artwork differs.</p>
            <details class="weapon-advanced"><summary>Advanced animation override</summary><div class="weapon-form-grid two"><div><label class="field-label" for="wm-animation-template">Shared Template</label><input id="wm-animation-template" class="text-input" value="${esc(current.weapon.animationTemplate)}"></div><div><label class="field-label" for="wm-custom-sheet">Custom Sprite Sheet</label><input id="wm-custom-sheet" type="file" accept="image/png,image/webp,image/gif"></div><div><label class="field-label" for="wm-custom-frame-width">Frame Width</label><input id="wm-custom-frame-width" class="text-input" type="number" min="1" value="${current.weapon.customAnimation?.frameWidth || 64}"></div><div><label class="field-label" for="wm-custom-frame-height">Frame Height</label><input id="wm-custom-frame-height" class="text-input" type="number" min="1" value="${current.weapon.customAnimation?.frameHeight || 64}"></div></div>${current.weapon.customAnimation?.src ? '<p class="good">Custom animation sheet attached. Remove it by starting from the shared template.</p>' : ''}</details>
          </section>

          <section class="weapon-step"><h3><span class="weapon-step-number">4</span> Who Can Equip It & Where Players Get It</h3>
            <p class="small">Selections below are saved into the reusable project files automatically. Leave any route blank if this weapon should not use it.</p>
            <div class="weapon-form-grid">
              <div><label class="field-label" for="wm-restriction-mode">Equip Restriction</label><select id="wm-restriction-mode" class="text-input">${[['none', 'No restriction'], ['tags', 'Required actor tags'], ['characters', 'Named characters']].map(([id, label]) => option(id, label, current.weapon.restrictions.mode)).join('')}</select></div>
              <div><label class="field-label" for="wm-restriction-tags">Required Tags</label><input id="wm-restriction-tags" class="text-input" value="${esc(current.weapon.restrictions.tags.join(', '))}" placeholder="archer, warrior"></div>
              <div><label class="field-label" for="wm-restriction-actors">Allowed Actor IDs</label><input id="wm-restriction-actors" class="text-input" value="${esc(current.weapon.restrictions.actorIds.join(', '))}" placeholder="hero, mage"></div>
              <div><label class="field-label" for="wm-starting-actor">Starting Equipment</label><select id="wm-starting-actor" class="text-input"><option value="">Do not auto-assign</option>${(workspace.actors || []).map((actor) => option(actor.id, actor.name || actor.id, availability.actorId)).join('')}</select></div>
              <div><label class="field-label" for="wm-shop-catalog">Shop Catalog</label><select id="wm-shop-catalog" class="text-input"><option value="">Not sold automatically</option>${(workspace.shopPayload?.catalogs || []).map((catalog) => option(catalog.id, catalog.name || catalog.id, availability.catalogId)).join('')}</select></div>
              <div><label class="field-label" for="wm-loot-table">Enemy Loot Table</label><select id="wm-loot-table" class="text-input"><option value="">No automatic drop entry</option>${(workspace.lootTables || []).map((table) => option(table.id, table.name || table.id, availability.lootTableId)).join('')}</select></div>
              <div><label class="field-label" for="wm-completion-reward">Level / Quest Reward</label><select id="wm-completion-reward" class="text-input"><option value="">No completion reward</option>${(workspace.completionRewards || []).map((entry) => option(entry.id, entry.name || entry.id, availability.completionRewardId)).join('')}</select></div>
              <div><label class="field-label" for="wm-completion-tier">Reward Tier</label><select id="wm-completion-tier" class="text-input">${[1, 2, 3].map((tier) => option(String(tier), tier === 3 ? 'Third completion and later' : `Completion ${tier}`, String(availability.completionTier || 1))).join('')}</select></div>
              <div><label class="field-label" for="wm-pickup-scene">Chest / Map Pickup Scene</label><select id="wm-pickup-scene" class="text-input"><option value="">No map pickup</option>${(workspace.scenes || []).map((scene) => option(scene.id, scene.name || scene.id, availability.pickupSceneId)).join('')}</select></div>
              <div><label class="field-label" for="wm-pickup-respawn">Pickup Respawn (seconds)</label><input id="wm-pickup-respawn" class="text-input" type="number" min="0" value="${availability.pickupRespawn || 0}"></div>
            </div>
            <div class="workspace-inline-actions"><button id="wm-create-catalog" type="button" class="secondary-btn">New Shop Catalog</button><button id="wm-create-loot" type="button" class="secondary-btn">New Equal-Chance Loot Table</button><button id="wm-create-completion" type="button" class="secondary-btn">New 3-Tier Level Reward</button></div>
          </section>

          <section class="weapon-step" id="wm-test-section"><h3><span class="weapon-step-number">5</span> Validate, Save & Test</h3>
            <div id="wm-validation" class="weapon-validation">${validationHtml(validation)}</div>
            ${validation.warnings.length ? '<label class="checkbox-row"><input id="wm-warning-override" type="checkbox"> I reviewed the unusual values and want to save them.</label>' : ''}
            <div class="weapon-test-arena">
              <div><div class="workspace-inline-actions"><select id="wm-test-mode" class="text-input"><option value="realtime">Real-time auto attack</option><option value="turn">Turn-based Standard / Special</option></select><button id="wm-reset-test" type="button" class="secondary-btn">Reset</button></div><div id="wm-test-stage" class="weapon-test-stage"><span class="weapon-test-player"></span><span class="weapon-test-target"></span><span class="weapon-test-projectile"></span></div></div>
              <div><p id="wm-test-stats" class="small"></p><div class="workspace-inline-actions"><button id="wm-test-normal" type="button">Standard Attack</button><button id="wm-test-special" type="button"${special.enabled ? '' : ' disabled'}>Special Attack</button><button id="wm-test-auto" type="button" class="secondary-btn">Start Auto Demo</button></div><div id="wm-test-log" class="weapon-test-log"></div></div>
            </div>
            <details class="weapon-advanced"><summary>Advanced values</summary><div class="weapon-form-grid"><div><label class="field-label" for="wm-sell-override">Sell Price Override</label><input id="wm-sell-override" class="text-input" type="number" min="0" value="${esc(current.sellPriceOverride ?? '')}" placeholder="Use game-wide percentage"></div><div><label class="field-label" for="wm-attack-mod">Equipped Attack Bonus</label><input id="wm-attack-mod" class="text-input" type="number" value="${esc(current.mods?.attack ?? 0)}"></div><div><label class="field-label">Future Progression</label><input class="text-input" value="Reserved for weapon levels and trees" disabled></div></div></details>
          </section>
          <div class="weapon-maker-footer"><span id="wm-save-status" class="small">Draft autosaves while you edit.</span><div class="workspace-inline-actions"><button id="wm-save" type="submit">Save Weapon</button><button id="wm-save-test" type="button">Save & Test</button></div></div>
        </form>
      </section>
    </div>`;
  bindRenderedEvents();
  resetArena(false);
  updateArtworkPreview();
  if (viewport || options.afterRestore) {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (viewport) window.scrollTo(viewport.x, viewport.y);
      options.afterRestore?.();
    }));
  }
}

function validationHtml(validation) {
  if (!validation.errors.length && !validation.warnings.length) return '<span class="good">Ready to save and test.</span>';
  return `${validation.errors.length ? `<div class="error"><strong>Fix before saving:</strong><ul>${validation.errors.map((entry) => `<li>${esc(entry)}</li>`).join('')}</ul></div>` : ''}${validation.warnings.length ? `<div class="warning"><strong>Review:</strong><ul>${validation.warnings.map((entry) => `<li>${esc(entry)}</li>`).join('')}</ul></div>` : ''}`;
}

function bindRenderedEvents() {
  root.querySelectorAll('[data-weapon-id]').forEach((button) => button.addEventListener('click', () => selectWeapon(button.dataset.weaponId)));
  root.querySelectorAll('[data-art-role]').forEach((button) => button.addEventListener('click', () => {
    current = readForm();
    activeArtRole = button.dataset.artRole;
    render();
  }));
  document.getElementById('wm-new').onclick = () => startNew('melee');
  document.getElementById('wm-use-preset').onclick = () => startNew(document.getElementById('wm-preset-family').value);
  document.getElementById('wm-clone').onclick = cloneSelected;
  document.getElementById('wm-delete').onclick = deleteSelected;
  document.getElementById('wm-export-pack').onclick = exportPack;
  document.getElementById('wm-import-pack').onclick = () => document.getElementById('wm-import-file').click();
  document.getElementById('wm-import-file').onchange = importPackFile;
  document.getElementById('wm-form').addEventListener('submit', (event) => saveWeapon(event, false));
  document.getElementById('wm-save-test').onclick = (event) => saveWeapon(event, true);
  document.getElementById('wm-family').onchange = () => {
    current = readForm();
    current.weapon.subtype = weaponSubtypeOptions(current.weapon.family)[0];
    current.weapon.animationTemplate = defaultAnimationTemplate(current.weapon.subtype);
    render();
  };
  for (const id of ['wm-subtype', 'wm-normal-resource', 'wm-special-enabled', 'wm-special-resource', 'wm-reload-enabled', 'wm-reuse-art']) {
    document.getElementById(id)?.addEventListener('change', () => {
      current = readForm();
      if (id === 'wm-subtype') current.weapon.animationTemplate = defaultAnimationTemplate(current.weapon.subtype);
      if (id === 'wm-reuse-art') reuseArtwork = document.getElementById(id).checked;
      render();
    });
  }
  document.getElementById('wm-special-preset')?.addEventListener('change', () => {
    current = readForm();
    const preset = SPECIAL_ATTACK_PRESETS[current.weapon.specialAttack.preset];
    current.weapon.specialAttack = { ...current.weapon.specialAttack, ...preset, preset: current.weapon.specialAttack.preset, enabled: true };
    render();
  });
  document.getElementById('wm-form').addEventListener('input', (event) => {
    if (event.target.type === 'file') return;
    current = readForm();
    scheduleAutosave();
    updateArtworkPreview();
    updateValidation();
  });
  document.getElementById('wm-art-file').onchange = uploadArtwork;
  document.getElementById('wm-custom-sheet').onchange = uploadCustomAnimation;
  document.getElementById('wm-create-catalog').onclick = createCatalog;
  document.getElementById('wm-create-loot').onclick = createLootTable;
  document.getElementById('wm-create-completion').onclick = createCompletionSchedule;
  document.getElementById('wm-reset-test').onclick = () => resetArena(true);
  document.getElementById('wm-test-normal').onclick = () => testAttack('normal');
  document.getElementById('wm-test-special').onclick = () => testAttack('special');
  document.getElementById('wm-test-auto').onclick = toggleAutoTest;
}

function readForm() {
  const source = structuredClone(current);
  const val = (id, fallback = '') => document.getElementById(id)?.value ?? fallback;
  const checked = (id) => Boolean(document.getElementById(id)?.checked);
  source.id = val('wm-id', source.id).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_');
  source.name = val('wm-name', source.name).trim();
  source.description = val('wm-description');
  source.rarity = val('wm-rarity', 'common');
  source.baseValue = number(val('wm-value'), 0);
  source.sellPriceOverride = val('wm-sell-override') === '' ? undefined : number(val('wm-sell-override'), 0);
  source.mods = { ...(source.mods || {}), attack: number(val('wm-attack-mod'), 0) };
  source.weapon.family = val('wm-family', source.weapon.family);
  source.weapon.subtype = val('wm-subtype', source.weapon.subtype);
  source.weapon.damageType = val('wm-damage-type', 'physical').trim() || 'physical';
  source.weapon.animationTemplate = val('wm-animation-template', source.weapon.animationTemplate).trim() || defaultAnimationTemplate(source.weapon.subtype);
  source.weapon.normalAttack = {
    ...source.weapon.normalAttack,
    power: number(val('wm-normal-power'), 0), range: number(val('wm-normal-range'), 1), cooldown: number(val('wm-normal-cooldown'), 0),
    requiresReload: checked('wm-reload-enabled'), reloadTime: number(val('wm-reload-time'), 0),
    resource: { type: val('wm-normal-resource', 'none'), itemId: val('wm-ammo-id').trim(), cost: number(val('wm-normal-cost'), 0) },
  };
  source.weapon.specialAttack = {
    ...source.weapon.specialAttack,
    enabled: checked('wm-special-enabled'), preset: val('wm-special-preset', 'heavy'), power: number(val('wm-special-power'), 0),
    multiplier: number(val('wm-special-multiplier'), 1), range: number(val('wm-special-range'), 1), cooldown: number(val('wm-special-cooldown'), 0),
    resource: { type: val('wm-special-resource', 'none'), itemId: val('wm-special-ammo').trim(), cost: number(val('wm-special-cost'), 0) },
  };
  source.weapon.restrictions = {
    mode: val('wm-restriction-mode', 'none'),
    tags: val('wm-restriction-tags').split(',').map((entry) => entry.trim()).filter(Boolean),
    actorIds: val('wm-restriction-actors').split(',').map((entry) => entry.trim()).filter(Boolean),
  };
  const roleArt = source.weapon.art[activeArtRole];
  if (roleArt) {
    roleArt.scale = number(val('wm-art-scale'), 1);
    roleArt.rotation = number(val('wm-art-rotation'), 0);
    roleArt.flipX = checked('wm-art-flip');
    roleArt.crop = { top: number(val('wm-crop-top'), 0), right: number(val('wm-crop-right'), 0), bottom: number(val('wm-crop-bottom'), 0), left: number(val('wm-crop-left'), 0) };
    if (reuseArtwork) {
      for (const role of ['icon', 'equipped', 'projectile']) source.weapon.art[role] = structuredClone(roleArt);
    }
  }
  if (source.weapon.customAnimation) {
    source.weapon.customAnimation.frameWidth = number(val('wm-custom-frame-width'), 64);
    source.weapon.customAnimation.frameHeight = number(val('wm-custom-frame-height'), 64);
  }
  return validateWeaponDefinition(source).weapon;
}

function selectWeapon(id) {
  const weapon = weaponItems(workspace.items).find((entry) => entry.id === id);
  if (!weapon) return;
  selectedId = id;
  current = structuredClone(weapon);
  reuseArtwork = ['icon', 'equipped', 'projectile'].every((role) => current.weapon.art[role].src === current.weapon.art.icon.src);
  render();
}

function startNew(family) {
  selectedId = '';
  current = createWeaponDefinition({ family, id: nextWeaponId(family), name: `New ${family[0].toUpperCase() + family.slice(1)} Weapon` });
  reuseArtwork = true;
  activeArtRole = 'equipped';
  render();
}

function nextWeaponId(family) {
  const ids = new Set((workspace.items || []).map((item) => item.id));
  let index = 1;
  let id = `${family}_weapon_${index}`;
  while (ids.has(id)) id = `${family}_weapon_${++index}`;
  return id;
}

function cloneSelected() {
  if (!selectedId) return;
  current = cloneWeaponDefinition(current, (workspace.items || []).map((item) => item.id));
  selectedId = '';
  render();
}

function deleteSelected() {
  if (!selectedId) return;
  const refs = scanWeaponReferences(selectedId, workspace);
  if (refs.length) {
    window.alert(`This weapon cannot be deleted yet. Replace or remove these links first:\n\n${refs.map((ref) => `• ${ref.kind}: ${ref.label}`).join('\n')}`);
    return;
  }
  if (!window.confirm(`Delete “${current.name}” from this project?`)) return;
  workspace.items = workspace.items.filter((item) => item.id !== selectedId);
  selectedId = '';
  current = weaponItems(workspace.items)[0] || createWeaponDefinition();
  window.pixelEngineWorkspace.markDirty('Weapon deleted from the project.');
  window.pixelEngineWorkspace.saveDraft();
  render();
}

function saveWeapon(event, openTest) {
  event?.preventDefault?.();
  current = readForm();
  const validation = validateWeaponDefinition(current);
  if (validation.errors.length) {
    updateValidation();
    document.getElementById('wm-validation')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return setStatus('Fix the required values before saving.', true);
  }
  if (validation.warnings.length && !document.getElementById('wm-warning-override')?.checked) {
    return setStatus('Review the warnings and check the override before saving.', true);
  }
  const duplicate = workspace.items.some((item) => item.id === current.id && item.id !== selectedId);
  if (duplicate) return setStatus(`Weapon ID “${current.id}” already exists.`, true);
  if (selectedId && selectedId !== current.id) replaceWeaponId(selectedId, current.id);
  const oldIndex = workspace.items.findIndex((item) => item.id === selectedId || item.id === current.id);
  if (oldIndex >= 0) workspace.items[oldIndex] = validation.weapon;
  else workspace.items.push(validation.weapon);
  const choices = {
    actorId: document.getElementById('wm-starting-actor').value,
    catalogId: document.getElementById('wm-shop-catalog').value,
    lootTableId: document.getElementById('wm-loot-table').value,
    completionRewardId: document.getElementById('wm-completion-reward').value,
    completionTier: document.getElementById('wm-completion-tier').value,
  };
  applyWeaponAvailability(workspace, current.id, choices);
  applyMapPickup(current.id, document.getElementById('wm-pickup-scene').value, number(document.getElementById('wm-pickup-respawn').value, 0));
  selectedId = current.id;
  localStorage.removeItem(autosaveKey());
  window.pixelEngineWorkspace.markDirty(`Weapon “${current.name}” saved and mapped to the selected game systems.`);
  window.pixelEngineWorkspace.saveDraft();
  render({
    afterRestore: openTest ? () => {
      document.getElementById('wm-test-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => testAttack('normal'), 250);
    } : null,
  });
  setStatus('Saved to the project draft. Publish when you are ready to test the full game.');
}

function replaceWeaponId(oldId, newId) {
  const replaceReward = (reward) => { if (reward.itemId === oldId) reward.itemId = newId; };
  for (const actor of workspace.actors || []) {
    if (actor.components?.equipment?.starting?.weapon === oldId) actor.components.equipment.starting.weapon = newId;
    (actor.components?.inventory?.starting || []).forEach((entry) => replaceReward(entry));
  }
  for (const catalog of workspace.shopPayload?.catalogs || []) (catalog.stock || []).forEach(replaceReward);
  for (const shop of workspace.shopPayload?.shops || []) [...(shop.stock || []), ...(shop.overrides || [])].forEach(replaceReward);
  for (const table of workspace.lootTables || []) for (const entry of table.entries || []) (entry.rewards || []).forEach(replaceReward);
  for (const entry of workspace.rewardPackages || []) (entry.rewards || []).forEach(replaceReward);
  for (const schedule of workspace.completionRewards || []) for (const tier of schedule.tiers || []) (tier.rewards || []).forEach(replaceReward);
}

function detectAvailability(weaponId) {
  const actor = (workspace.actors || []).find((entry) => entry.components?.equipment?.starting?.weapon === weaponId);
  const catalog = (workspace.shopPayload?.catalogs || []).find((entry) => (entry.stock || []).some((offer) => offer.itemId === weaponId));
  const table = (workspace.lootTables || []).find((entry) => (entry.entries || []).some((pack) => (pack.rewards || []).some((reward) => reward.itemId === weaponId)));
  let completionRewardId = '';
  let completionTier = 1;
  for (const schedule of workspace.completionRewards || []) {
    const index = (schedule.tiers || []).findIndex((tier) => (tier.rewards || []).some((reward) => reward.itemId === weaponId));
    if (index >= 0) { completionRewardId = schedule.id; completionTier = index + 1; break; }
  }
  let pickupSceneId = '';
  let pickupRespawn = 0;
  for (const scene of workspace.scenes || []) {
    const pickup = (scene.objects?.rewardPickups || []).find((entry) => entry._weaponMaker === weaponId);
    if (pickup) { pickupSceneId = scene.id; pickupRespawn = pickup.respawnSeconds || 0; break; }
  }
  return { actorId: actor?.id || '', catalogId: catalog?.id || '', lootTableId: table?.id || '', completionRewardId, completionTier, pickupSceneId, pickupRespawn };
}

function applyMapPickup(weaponId, sceneId, respawnSeconds) {
  const packageId = `${weaponId}_map_pickup_reward`;
  for (const scene of workspace.scenes || []) {
    if (Array.isArray(scene.objects?.rewardPickups)) {
      scene.objects.rewardPickups = scene.objects.rewardPickups.filter((entry) => entry._weaponMaker !== weaponId);
    }
  }
  workspace.rewardPackages = (workspace.rewardPackages || []).filter((entry) => entry._weaponMaker !== weaponId);
  if (!sceneId) return;
  workspace.rewardPackages.push({ id: packageId, name: `${current.name} Map Pickup`, rewards: [{ type: 'item', itemId: weaponId, count: 1 }], _weaponMaker: weaponId });
  const scene = workspace.scenes.find((entry) => entry.id === sceneId);
  if (!scene) return;
  scene.objects ||= {};
  scene.objects.rewardPickups ||= [];
  scene.objects.rewardPickups.push({ id: `${weaponId}_pickup`, name: current.name, x: Math.min(scene.width - 1, (scene.spawn?.x || 0) + 1), y: scene.spawn?.y || 0, rewardPackageId: packageId, lootTableId: null, respawnSeconds: Math.max(0, respawnSeconds), _weaponMaker: weaponId });
}

function createCatalog() {
  const id = uniqueContentId('weapon_catalog', workspace.shopPayload.catalogs || []);
  workspace.shopPayload.catalogs ||= [];
  workspace.shopPayload.catalogs.push({ id, name: 'Weapon Catalog', stock: [] });
  window.pixelEngineWorkspace.markDirty('Reusable weapon shop catalog created.');
  current = readForm();
  render();
  document.getElementById('wm-shop-catalog').value = id;
}

function createLootTable() {
  const id = uniqueContentId('weapon_loot', workspace.lootTables || []);
  workspace.lootTables.push({ id, name: 'Weapon Loot Table', entries: [{ id: `${id}_no_reward`, name: 'No Reward', rewards: [] }] });
  window.pixelEngineWorkspace.markDirty('Equal-chance loot table created with a No Reward entry.');
  current = readForm();
  render();
  document.getElementById('wm-loot-table').value = id;
}

function createCompletionSchedule() {
  const scene = workspace.scenes.find((entry) => entry.scene?.mode === 'adventure') || workspace.scenes[0];
  if (!scene) return setStatus('Create a scene before adding a completion reward.', true);
  const id = uniqueContentId(`${scene.id}_completion`, workspace.completionRewards || []);
  workspace.completionRewards.push({
    id, name: `${scene.name || scene.id} Rewards`, source: { type: 'level', id: scene.id }, reveal: true,
    tiers: [1, 2, 3].map((tier) => ({ id: `${id}_tier_${tier}`, name: tier === 3 ? 'Third and Later' : `Completion ${tier}`, rewards: [] })),
  });
  window.pixelEngineWorkspace.markDirty('Three-tier level reward schedule created.');
  current = readForm();
  render();
  document.getElementById('wm-completion-reward').value = id;
}

function uniqueContentId(base, list) {
  const used = new Set(list.map((entry) => entry.id));
  let id = base;
  let index = 2;
  while (used.has(id)) id = `${base}_${index++}`;
  return id;
}

function uploadArtwork(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    current = readForm();
    current.weapon.art[activeArtRole].src = String(reader.result);
    if (reuseArtwork) for (const role of ['icon', 'equipped', 'projectile']) current.weapon.art[role] = structuredClone(current.weapon.art[activeArtRole]);
    scheduleAutosave();
    render();
  };
  reader.onerror = () => setStatus('The artwork file could not be read.', true);
  reader.readAsDataURL(file);
}

function uploadCustomAnimation(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    current = readForm();
    current.weapon.customAnimation = { src: String(reader.result), frameWidth: number(document.getElementById('wm-custom-frame-width')?.value, 64), frameHeight: number(document.getElementById('wm-custom-frame-height')?.value, 64), frameDuration: 0.1 };
    scheduleAutosave();
    render();
  };
  reader.readAsDataURL(file);
}

function updateArtworkPreview() {
  const image = document.getElementById('wm-preview-image');
  if (!image) return;
  const art = currentArt();
  if (image.tagName === 'IMG') image.src = art.src;
  image.style.transform = `translate(-50%, -50%) scale(${art.flipX ? -art.scale : art.scale}, ${art.scale}) rotate(${art.rotation}deg)`;
  const scaleLabel = document.getElementById('wm-art-scale-value');
  if (scaleLabel) scaleLabel.textContent = String(art.scale);
}

function updateValidation() {
  const host = document.getElementById('wm-validation');
  if (host) host.innerHTML = validationHtml(validateWeaponDefinition(current));
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  const status = document.getElementById('wm-save-status');
  if (status) status.textContent = 'Autosaving draft…';
  autosaveTimer = setTimeout(() => {
    try {
      localStorage.setItem(autosaveKey(), JSON.stringify({ projectId: workspace.projectId, weapon: current, savedAt: new Date().toISOString() }));
      if (status) status.textContent = 'Draft autosaved in this browser.';
    } catch {
      if (status) status.textContent = 'Draft autosave failed. Large artwork may exceed browser storage.';
    }
  }, 350);
}

function autosaveKey() {
  return `pixel_engine_weapon_maker_draft_${workspace?.projectId || 'unknown'}`;
}

function restoreAutosave() {
  if (!workspace) return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(autosaveKey()));
    return parsed.projectId === workspace.projectId ? validateWeaponDefinition(parsed.weapon).weapon : null;
  } catch {
    return null;
  }
}

function exportPack() {
  current = readForm();
  try {
    downloadJson(`${current.id}-weapon-pack.json`, exportWeaponPack(current, workspace));
    setStatus('Complete weapon pack exported with artwork, settings, and linked content.');
  } catch (error) {
    setStatus(error.message, true);
  }
}

function importPackFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = importWeaponPack(JSON.parse(String(reader.result)));
      current = imported.weapon;
      const existingIds = new Set((workspace.items || []).map((item) => item.id));
      if (existingIds.has(current.id)) current = cloneWeaponDefinition(current, existingIds);
      selectedId = '';
      reuseArtwork = false;
      render();
      setStatus('Weapon pack imported as an unsaved weapon. Review it, then choose Save Weapon.');
    } catch (error) {
      setStatus(error.message, true);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function resetArena(renderLog = true) {
  arena = { targetHp: 100, playerHp: 100, mana: 30, ammo: 12, cooldown: 0, log: [] };
  clearAutoTest();
  if (renderLog) logTest('Test arena reset.');
  renderArena();
}

function testAttack(type) {
  current = readForm();
  const attack = type === 'special' ? current.weapon.specialAttack : current.weapon.normalAttack;
  if (type === 'special' && !attack.enabled) return logTest('This weapon has no Special attack.');
  if (attack.resource.type === 'mana' && arena.mana < attack.resource.cost) return logTest('Not Enough Mana — attack stopped.');
  if (attack.resource.type === 'ammo' && arena.ammo < attack.resource.cost) return logTest('Out of Ammo — attack stopped.');
  if (attack.resource.type === 'mana') arena.mana -= attack.resource.cost;
  if (attack.resource.type === 'ammo') arena.ammo -= attack.resource.cost;
  let damage = Math.max(1, Math.floor((10 + attack.power) * (attack.multiplier || 1) - 2));
  if (type === 'special' && attack.preset === 'support') {
    arena.playerHp = Math.min(100, arena.playerHp + Math.max(1, attack.support?.value || 5));
    logTest(`Special support used. Player HP is ${arena.playerHp}.`);
  } else {
    damage *= attack.hitCount || 1;
    arena.targetHp = Math.max(0, arena.targetHp - damage);
    logTest(`${type === 'special' ? 'Special' : 'Standard'} ${current.weapon.animationTemplate} dealt ${damage}. Target HP ${arena.targetHp}.`);
  }
  const stage = document.getElementById('wm-test-stage');
  stage?.classList.remove('attacking');
  requestAnimationFrame(() => stage?.classList.add('attacking'));
  if (arena.targetHp <= 0) logTest('Target defeated. In the game, its reusable loot table rolls once.');
  renderArena();
}

function toggleAutoTest() {
  const button = document.getElementById('wm-test-auto');
  if (autoTestTimer) {
    clearAutoTest();
    if (button) button.textContent = 'Start Auto Demo';
    return;
  }
  document.getElementById('wm-test-mode').value = 'realtime';
  button.textContent = 'Stop Auto Demo';
  autoTestTimer = setInterval(() => {
    if (arena.targetHp <= 0) resetArena(false);
    testAttack('normal');
  }, Math.max(250, current.weapon.normalAttack.cooldown * 1000));
}

function clearAutoTest() {
  if (autoTestTimer) clearInterval(autoTestTimer);
  autoTestTimer = null;
}

function logTest(message) {
  arena.log.unshift(message);
  arena.log = arena.log.slice(0, 12);
  renderArena();
}

function renderArena() {
  const stats = document.getElementById('wm-test-stats');
  const log = document.getElementById('wm-test-log');
  if (stats) stats.textContent = `Player HP ${arena.playerHp}/100 · Mana ${arena.mana}/30 · Ammo ${arena.ammo} · Target HP ${arena.targetHp}/100`;
  if (log) log.innerHTML = arena.log.map((entry) => `<div>${esc(entry)}</div>`).join('') || '<div>Choose Standard, Special, or Start Auto Demo.</div>';
  const target = document.querySelector('.weapon-test-target');
  if (target) target.style.opacity = arena.targetHp <= 0 ? '.25' : '1';
}

function setStatus(message, error = false) {
  const status = document.getElementById('wm-save-status');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('error', error);
}
