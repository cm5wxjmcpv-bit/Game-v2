import { IncrementalGame } from './incrementalGame.js';
import { loadIncrementalDatabase } from './incrementalDataLoader.js';
import { formatCurrency, formatNumber } from './numberFormat.js';

function ensureStylesheet() {
  if (document.querySelector('link[data-incremental-runtime-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../incremental.css', import.meta.url).href;
  link.dataset.incrementalRuntimeStyle = 'true';
  document.head.appendChild(link);
}

function clearRequestedAction() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('action')) return;
  url.searchParams.delete('action');
  window.history.replaceState(null, '', url);
}

function createRuntimeRoot() {
  const app = document.getElementById('app');
  if (!app) throw new Error('The game host is missing #app.');
  const canvas = document.getElementById('game-canvas');
  const hud = document.getElementById('hud');
  if (canvas) canvas.style.display = 'none';
  if (hud) hud.style.display = 'none';
  const mapBuilderLink = document.getElementById('runtime-builder-link');
  if (mapBuilderLink) mapBuilderLink.style.display = 'none';
  document.getElementById('overlay')?.classList.add('hidden');

  let root = document.getElementById('incremental-runtime');
  if (!root) {
    root = document.createElement('main');
    root.id = 'incremental-runtime';
    app.appendChild(root);
  }
  root.hidden = false;
  root.innerHTML = `
    <div class="incremental-shell">
      <header class="incremental-topbar">
        <div class="incremental-brand">
          <span class="incremental-kicker">MINER INCREMENTAL</span>
          <h1 id="incremental-title">Loading mine…</h1>
          <p id="incremental-subtitle"></p>
        </div>
        <div class="incremental-top-stats" aria-label="Player progress">
          <div class="incremental-stat"><span>Cash</span><strong id="incremental-cash">$0</strong></div>
          <div class="incremental-stat"><span>Level</span><strong id="incremental-level">1</strong></div>
          <div class="incremental-stat incremental-xp-stat">
            <span id="incremental-xp-label">XP 0 / 100</span>
            <div class="incremental-progress" role="progressbar" aria-label="Experience" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
              <span id="incremental-xp-bar"></span>
            </div>
          </div>
          <button id="incremental-reset" class="incremental-small-button" type="button">New Game</button>
        </div>
      </header>

      <div class="incremental-status-row">
        <span id="incremental-save-status" role="status">Preparing local save…</span>
        <span id="incremental-mine-name"></span>
      </div>

      <div class="incremental-layout">
        <section class="incremental-mine-card" aria-labelledby="incremental-deposit-name">
          <div class="incremental-story-card">
            <span id="incremental-role"></span>
            <strong id="incremental-employer"></strong>
            <p id="incremental-instruction"></p>
          </div>

          <div class="incremental-mine-stage" id="incremental-mine-stage">
            <div class="incremental-cave-glow" aria-hidden="true"></div>
            <div class="incremental-miner" aria-hidden="true">
              <span class="incremental-miner-character">
                <span class="incremental-miner-head"></span>
                <span class="incremental-miner-body"></span>
              </span>
              <span class="incremental-miner-tool" id="incremental-miner-tool">
                <span class="incremental-tool-handle"></span>
                <span class="incremental-tool-head"></span>
              </span>
            </div>
            <button id="incremental-mining-target" class="incremental-deposit-target" type="button">
              <span class="incremental-deposit-shadow" aria-hidden="true"></span>
              <span class="incremental-rock" aria-hidden="true">
                <span class="incremental-rock-facet facet-one"></span>
                <span class="incremental-rock-facet facet-two"></span>
                <span class="incremental-rock-facet facet-three"></span>
                <span id="incremental-deposit-icon" class="incremental-deposit-icon"></span>
              </span>
            </button>
            <div id="incremental-float-layer" class="incremental-float-layer" aria-hidden="true"></div>
          </div>

          <div class="incremental-deposit-readout">
            <div>
              <span class="incremental-label">CURRENT DEPOSIT</span>
              <h2 id="incremental-deposit-name">Deposit</h2>
            </div>
            <strong id="incremental-deposit-hp">0 / 0 HP</strong>
          </div>
          <div id="incremental-deposit-progress" class="incremental-deposit-progress" role="progressbar" aria-label="Deposit durability" aria-valuemin="0" aria-valuemax="1" aria-valuenow="1">
            <span id="incremental-deposit-bar"></span>
          </div>
          <p id="incremental-last-result" class="incremental-last-result" aria-live="polite">Tap or press Enter on the vein to swing.</p>
        </section>

        <aside class="incremental-side-panels">
          <section class="incremental-panel">
            <div class="incremental-panel-heading">
              <div><span class="incremental-label">SHIFT OUTPUT</span><h2>Ore Ledger</h2></div>
              <span class="incremental-badge">Employer owned</span>
            </div>
            <div id="incremental-resources" class="incremental-resource-list"></div>
          </section>

          <section class="incremental-panel incremental-ledger-panel">
            <span class="incremental-label">THE SPLIT</span>
            <h2>Blackstone gets the ore.</h2>
            <div class="incremental-ledger-row"><span>Your total wages</span><strong id="incremental-wages">$0</strong></div>
            <div class="incremental-ledger-row"><span>Value Blackstone kept</span><strong id="incremental-company-value">$0</strong></div>
            <p>For now, every broken deposit belongs to the company. Your pay is only a configured fraction of its value.</p>
          </section>

          <section class="incremental-panel incremental-foundation-panel">
            <span class="incremental-label">MILESTONE 1</span>
            <h2>Runtime foundation active</h2>
            <ul>
              <li>Tap/click mining</li>
              <li>Deposit durability and replacement</li>
              <li>Resource, wage, and XP awards</li>
              <li>Package-isolated local saves</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>`;
  return root;
}

function buildUi(root, database) {
  const config = database.config;
  const nodes = Object.fromEntries([
    'incremental-title', 'incremental-subtitle', 'incremental-cash', 'incremental-level',
    'incremental-xp-label', 'incremental-xp-bar', 'incremental-save-status',
    'incremental-mine-name', 'incremental-role', 'incremental-employer',
    'incremental-instruction', 'incremental-mining-target', 'incremental-deposit-icon',
    'incremental-float-layer', 'incremental-miner-tool', 'incremental-deposit-name',
    'incremental-deposit-hp', 'incremental-deposit-progress', 'incremental-deposit-bar',
    'incremental-last-result', 'incremental-resources', 'incremental-wages',
    'incremental-company-value', 'incremental-reset', 'incremental-mine-stage',
  ].map((id) => [id.replace('incremental-', '').replaceAll('-', '_'), root.querySelector(`#${id}`)]));

  nodes.title.textContent = config.ui.title || database.game.name;
  nodes.subtitle.textContent = config.ui.subtitle;
  nodes.role.textContent = config.employment.role;
  nodes.employer.textContent = config.employment.companyName;
  nodes.instruction.textContent = config.ui.instruction;

  function setSaveStatus(message, failed = false) {
    nodes.save_status.textContent = message;
    nodes.save_status.classList.toggle('is-error', failed);
  }

  function render(game) {
    const state = game.state;
    if (!state) return;
    const mine = config.minesById[state.currentMine];
    const deposit = config.depositsById[state.currentDeposit.id];
    const xpNeeded = game.getXpRequired();
    const xpProgress = Math.max(0, Math.min(1, state.character.xp / xpNeeded));
    const hpProgress = Math.max(0, Math.min(1, state.currentDeposit.hp / state.currentDeposit.maxHp));

    nodes.cash.textContent = formatCurrency(state.cash);
    nodes.level.textContent = formatNumber(state.character.level);
    nodes.xp_label.textContent = `XP ${formatNumber(state.character.xp)} / ${formatNumber(xpNeeded)}`;
    nodes.xp_bar.style.width = `${xpProgress * 100}%`;
    nodes.xp_bar.parentElement.setAttribute('aria-valuemax', String(xpNeeded));
    nodes.xp_bar.parentElement.setAttribute('aria-valuenow', String(Math.min(state.character.xp, xpNeeded)));
    nodes.mine_name.textContent = mine.name;
    nodes.deposit_name.textContent = deposit.name;
    nodes.deposit_hp.textContent = `${formatNumber(state.currentDeposit.hp)} / ${formatNumber(state.currentDeposit.maxHp)} HP`;
    nodes.deposit_bar.style.width = `${hpProgress * 100}%`;
    nodes.deposit_progress.setAttribute('aria-valuemax', String(state.currentDeposit.maxHp));
    nodes.deposit_progress.setAttribute('aria-valuenow', String(state.currentDeposit.hp));
    nodes.mining_target.setAttribute('aria-label', `Mine ${deposit.name}. ${state.currentDeposit.hp} of ${state.currentDeposit.maxHp} durability remaining.`);
    nodes.deposit_icon.textContent = deposit.visual.icon;
    nodes.mining_target.style.setProperty('--deposit-color', deposit.visual.color);
    nodes.mining_target.style.setProperty('--deposit-accent', deposit.visual.accent);
    nodes.wages.textContent = formatCurrency(state.employment.totalWages);
    nodes.company_value.textContent = formatCurrency(state.employment.companyValue);

    nodes.resources.replaceChildren();
    config.resources.forEach((resource) => {
      const quantity = state.statistics.resourceTotals[resource.id];
      const row = document.createElement('div');
      row.className = 'incremental-resource-row';
      const icon = document.createElement('span');
      icon.className = 'incremental-resource-icon';
      icon.style.setProperty('--resource-color', resource.color);
      icon.textContent = resource.icon;
      const label = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = resource.name;
      const details = document.createElement('small');
      details.textContent = `${formatNumber(quantity)} mined · ${formatCurrency(quantity * resource.value)} gross value`;
      label.append(name, details);
      const count = document.createElement('strong');
      count.textContent = formatNumber(quantity);
      row.append(icon, label, count);
      nodes.resources.appendChild(row);
    });
  }

  function spawnFloat(message, kind = 'damage') {
    const node = document.createElement('span');
    node.className = `incremental-float incremental-float-${kind}`;
    node.textContent = message;
    node.style.setProperty('--float-offset', `${(nodes.float_layer.childElementCount % 5) * 11 - 22}px`);
    nodes.float_layer.appendChild(node);
    node.addEventListener('animationend', () => node.remove(), { once: true });
    window.setTimeout(() => node.remove(), 1400);
  }

  function showImpact(result) {
    nodes.mining_target.classList.remove('is-hit', 'is-broken');
    nodes.miner_tool.classList.remove('is-swinging');
    void nodes.mining_target.offsetWidth;
    nodes.mining_target.classList.add(result.type === 'break' ? 'is-broken' : 'is-hit');
    nodes.miner_tool.classList.add('is-swinging');
    spawnFloat(`-${formatNumber(result.damage)}`, 'damage');

    if (result.type === 'break') {
      const resource = config.resourcesById[result.resourceId];
      spawnFloat(`+${formatNumber(result.quantity)} ${resource.name}`, 'ore');
      spawnFloat(`+${formatCurrency(result.wage)} wage`, 'cash');
      nodes.last_result.textContent = `${resource.name} delivered to ${config.employment.companyName}. You earned ${formatCurrency(result.wage)} and ${formatNumber(result.xp)} XP.`;
    } else {
      nodes.last_result.textContent = `Your pickaxe dealt ${formatNumber(result.damage)} mining damage.`;
    }
  }

  return { nodes, render, setSaveStatus, showImpact };
}

async function bootstrap() {
  ensureStylesheet();
  document.body.classList.add('incremental-game-mode');
  const root = createRuntimeRoot();
  const database = await loadIncrementalDatabase();
  const ui = buildUi(root, database);
  const game = new IncrementalGame({
    config: database.config,
    gameVersion: database.game.version,
  });

  game.subscribe((event) => {
    if (event.type === 'mine') ui.showImpact(event.detail);
    if (event.type === 'save') {
      ui.setSaveStatus(event.detail.saved ? 'Saved locally' : 'Local save failed', !event.detail.saved);
    }
    ui.render(game);
  });

  const action = new URL(window.location.href).searchParams.get('action');
  const startResult = game.start({ forceNew: action === 'new' });
  clearRequestedAction();
  ui.setSaveStatus(startResult.source === 'save' ? 'Local save loaded' : 'New local save created');
  ui.render(game);

  ui.nodes.mining_target.addEventListener('click', () => game.mine());
  ui.nodes.reset.addEventListener('click', () => {
    if (!window.confirm('Start a new mining game and replace this local save?')) return;
    game.startNew();
    ui.nodes.last_result.textContent = 'A new shift has started.';
    ui.setSaveStatus('New local save created');
    ui.render(game);
  });

  let lastFrame = performance.now();
  function loop(now) {
    game.update(Math.min(1, (now - lastFrame) / 1000));
    lastFrame = now;
    window.requestAnimationFrame(loop);
  }
  window.requestAnimationFrame(loop);

  window.addEventListener('pagehide', () => game.saveCheckpoint('pagehide'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') game.saveCheckpoint('visibility');
  });
}

await bootstrap();
