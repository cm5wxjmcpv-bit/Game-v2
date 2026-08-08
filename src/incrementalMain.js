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
          <div class="incremental-stat"><span>Skill Points</span><strong id="incremental-skill-points">0</strong></div>
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

      <nav class="incremental-nav" role="tablist" aria-label="Mining game sections">
        <button id="incremental-tab-mine" class="is-active" type="button" role="tab" aria-controls="incremental-mine-view" aria-selected="true">Mine</button>
        <button id="incremental-tab-skills" type="button" role="tab" aria-controls="incremental-skills-view" aria-selected="false" tabindex="-1">Skills <span id="incremental-nav-skill-points">0</span></button>
      </nav>

      <section id="incremental-mine-view" class="incremental-view" role="tabpanel" aria-labelledby="incremental-tab-mine">
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
                <div><span id="incremental-resource-kicker" class="incremental-label">SHIFT OUTPUT</span><h2 id="incremental-resource-title">Ore Ledger</h2></div>
                <span id="incremental-resource-badge" class="incremental-badge">Employer owned</span>
              </div>
              <div id="incremental-resources" class="incremental-resource-list"></div>
            </section>

            <section class="incremental-panel incremental-ledger-panel">
              <span id="incremental-contract-kicker" class="incremental-label">FIRST MAJOR GOAL</span>
              <h2 id="incremental-contract-title">Buy Out Employment Contract</h2>
              <div class="incremental-ledger-row"><span>Your total wages</span><strong id="incremental-wages">$0</strong></div>
              <div class="incremental-ledger-row"><span>Value Blackstone kept</span><strong id="incremental-company-value">$0</strong></div>
              <div id="incremental-contract-progress-wrap" class="incremental-contract-progress-wrap">
                <div class="incremental-contract-progress-copy"><span id="incremental-contract-progress-label">$0 / $0</span><strong id="incremental-contract-percent">0%</strong></div>
                <div class="incremental-progress" role="progressbar" aria-label="Employment contract buyout" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                  <span id="incremental-contract-bar"></span>
                </div>
              </div>
              <button id="incremental-buyout" class="incremental-primary-button" type="button">Buy Out Contract</button>
              <p id="incremental-contract-copy">Blackstone owns every resource you recover and pays only a fraction of its value.</p>
            </section>

            <section class="incremental-panel incremental-character-panel">
              <span class="incremental-label">THE MINER</span>
              <h2>Character Progression</h2>
              <div class="incremental-ledger-row"><span>Manual power</span><strong id="incremental-manual-power">2</strong></div>
              <div class="incremental-ledger-row"><span>Critical chance</span><strong id="incremental-critical-chance">0%</strong></div>
              <div class="incremental-ledger-row"><span>Critical damage</span><strong id="incremental-critical-damage">2x</strong></div>
              <div class="incremental-ledger-row"><span>Bonus ore chance</span><strong id="incremental-ore-yield">0%</strong></div>
              <button id="incremental-open-skills" class="incremental-secondary-button" type="button">Spend Skill Points</button>
            </section>
          </aside>
        </div>
      </section>

      <section id="incremental-skills-view" class="incremental-view" role="tabpanel" aria-labelledby="incremental-tab-skills" hidden>
        <div class="incremental-skills-header incremental-panel">
          <div>
            <span class="incremental-label">CHARACTER PROGRESSION</span>
            <h2>Miner Skills</h2>
            <p>Level up by breaking deposits, then spend points on your personal mining strengths.</p>
          </div>
          <div class="incremental-skill-actions">
            <strong><span id="incremental-skills-available">0</span> points available</strong>
            <button id="incremental-reset-skills" class="incremental-secondary-button" type="button">Reset Skills</button>
            <small id="incremental-reset-cost">No points allocated</small>
          </div>
        </div>
        <p id="incremental-skill-status" class="incremental-skill-status" role="status">Choose an available skill when you earn a point.</p>
        <div id="incremental-skills-grid" class="incremental-skills-grid"></div>
      </section>
    </div>

    <div id="incremental-story-overlay" class="incremental-story-overlay" hidden>
      <section class="incremental-story-dialog" role="dialog" aria-modal="true" aria-labelledby="incremental-story-title">
        <span id="incremental-story-speaker" class="incremental-label"></span>
        <h2 id="incremental-story-title">Milestone</h2>
        <p id="incremental-story-text"></p>
        <button id="incremental-story-continue" class="incremental-primary-button" type="button">Continue</button>
      </section>
    </div>`;
  return root;
}

function percent(value) {
  return `${formatNumber(Number(value) * 100, { decimals: 1 })}%`;
}

function buildUi(root, database) {
  const config = database.config;
  const byId = (id) => root.querySelector(`#${id}`);
  const nodes = {
    title: byId('incremental-title'),
    subtitle: byId('incremental-subtitle'),
    cash: byId('incremental-cash'),
    level: byId('incremental-level'),
    skill_points: byId('incremental-skill-points'),
    nav_skill_points: byId('incremental-nav-skill-points'),
    xp_label: byId('incremental-xp-label'),
    xp_bar: byId('incremental-xp-bar'),
    save_status: byId('incremental-save-status'),
    mine_name: byId('incremental-mine-name'),
    role: byId('incremental-role'),
    employer: byId('incremental-employer'),
    instruction: byId('incremental-instruction'),
    mining_target: byId('incremental-mining-target'),
    deposit_icon: byId('incremental-deposit-icon'),
    float_layer: byId('incremental-float-layer'),
    miner_tool: byId('incremental-miner-tool'),
    deposit_name: byId('incremental-deposit-name'),
    deposit_hp: byId('incremental-deposit-hp'),
    deposit_progress: byId('incremental-deposit-progress'),
    deposit_bar: byId('incremental-deposit-bar'),
    last_result: byId('incremental-last-result'),
    resources: byId('incremental-resources'),
    resource_kicker: byId('incremental-resource-kicker'),
    resource_title: byId('incremental-resource-title'),
    resource_badge: byId('incremental-resource-badge'),
    wages: byId('incremental-wages'),
    company_value: byId('incremental-company-value'),
    contract_kicker: byId('incremental-contract-kicker'),
    contract_title: byId('incremental-contract-title'),
    contract_progress_wrap: byId('incremental-contract-progress-wrap'),
    contract_progress_label: byId('incremental-contract-progress-label'),
    contract_percent: byId('incremental-contract-percent'),
    contract_bar: byId('incremental-contract-bar'),
    contract_copy: byId('incremental-contract-copy'),
    buyout: byId('incremental-buyout'),
    manual_power: byId('incremental-manual-power'),
    critical_chance: byId('incremental-critical-chance'),
    critical_damage: byId('incremental-critical-damage'),
    ore_yield: byId('incremental-ore-yield'),
    open_skills: byId('incremental-open-skills'),
    reset: byId('incremental-reset'),
    tab_mine: byId('incremental-tab-mine'),
    tab_skills: byId('incremental-tab-skills'),
    mine_view: byId('incremental-mine-view'),
    skills_view: byId('incremental-skills-view'),
    skills_available: byId('incremental-skills-available'),
    skills_grid: byId('incremental-skills-grid'),
    skill_status: byId('incremental-skill-status'),
    reset_skills: byId('incremental-reset-skills'),
    reset_cost: byId('incremental-reset-cost'),
    story_overlay: byId('incremental-story-overlay'),
    story_speaker: byId('incremental-story-speaker'),
    story_title: byId('incremental-story-title'),
    story_text: byId('incremental-story-text'),
    story_continue: byId('incremental-story-continue'),
  };
  const storyQueue = [];
  let activeStory = null;

  nodes.title.textContent = config.ui.title || database.game.name;
  nodes.subtitle.textContent = config.ui.subtitle;

  function setSaveStatus(message, failed = false) {
    nodes.save_status.textContent = message;
    nodes.save_status.classList.toggle('is-error', failed);
  }

  function setView(view) {
    const skillsActive = view === 'skills';
    nodes.mine_view.hidden = skillsActive;
    nodes.skills_view.hidden = !skillsActive;
    nodes.tab_mine.classList.toggle('is-active', !skillsActive);
    nodes.tab_skills.classList.toggle('is-active', skillsActive);
    nodes.tab_mine.setAttribute('aria-selected', String(!skillsActive));
    nodes.tab_skills.setAttribute('aria-selected', String(skillsActive));
    nodes.tab_mine.tabIndex = skillsActive ? -1 : 0;
    nodes.tab_skills.tabIndex = skillsActive ? 0 : -1;
  }

  function renderResources(state, employeeStage) {
    const source = employeeStage ? state.employment.companyResources : state.materials;
    nodes.resource_kicker.textContent = employeeStage ? 'SHIFT OUTPUT' : 'PERSONAL STOCKPILE';
    nodes.resource_title.textContent = employeeStage ? 'Blackstone Ore Ledger' : 'Your Ore Ledger';
    nodes.resource_badge.textContent = employeeStage ? 'Employer owned' : 'Player owned';
    nodes.resource_badge.classList.toggle('is-player-owned', !employeeStage);
    nodes.resources.replaceChildren();

    config.resources.forEach((resource) => {
      const quantity = source[resource.id];
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
      details.textContent = employeeStage
        ? `${formatNumber(quantity)} company-owned · ${formatCurrency(quantity * resource.value)} gross value`
        : `${formatNumber(quantity)} owned · ${formatCurrency(quantity * resource.value)} estimated value`;
      label.append(name, details);
      const count = document.createElement('strong');
      count.textContent = formatNumber(quantity);
      row.append(icon, label, count);
      nodes.resources.appendChild(row);
    });
  }

  function renderSkills(game) {
    const state = game.state;
    const available = state.character.skillPoints;
    const spent = game.getSpentSkillPoints();
    const resetCost = game.getSkillResetCost();
    nodes.skills_available.textContent = formatNumber(available);
    nodes.reset_cost.textContent = spent > 0
      ? `${formatCurrency(resetCost)} to refund ${formatNumber(spent)} point${spent === 1 ? '' : 's'}`
      : 'No points allocated';
    nodes.reset_skills.disabled = spent < 1;
    nodes.skills_grid.replaceChildren();

    config.skills.forEach((skill) => {
      const rank = game.getSkillRank(skill.id);
      const card = document.createElement('article');
      card.className = 'incremental-skill-card';
      card.classList.toggle('is-locked', !skill.enabled);
      const header = document.createElement('div');
      header.className = 'incremental-skill-card-header';
      const title = document.createElement('h3');
      title.textContent = skill.name;
      const rankLabel = document.createElement('strong');
      rankLabel.textContent = `Rank ${rank} / ${skill.maxRank}`;
      header.append(title, rankLabel);
      const description = document.createElement('p');
      description.textContent = skill.description;
      const effect = document.createElement('small');
      effect.textContent = skill.effect.label;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'incremental-secondary-button';
      button.dataset.skillId = skill.id;
      button.textContent = !skill.enabled
        ? 'Reserved'
        : rank >= skill.maxRank
          ? 'Max Rank'
          : 'Spend 1 Point';
      button.disabled = !skill.enabled || rank >= skill.maxRank || available < 1;
      card.append(header, description, effect);
      if (!skill.enabled && skill.unlockNote) {
        const note = document.createElement('span');
        note.className = 'incremental-skill-lock-note';
        note.textContent = skill.unlockNote;
        card.appendChild(note);
      }
      card.appendChild(button);
      nodes.skills_grid.appendChild(card);
    });
  }

  function render(game) {
    const state = game.state;
    if (!state) return;
    const mine = config.minesById[state.currentMine];
    const deposit = config.depositsById[state.currentDeposit.id];
    const miningStats = game.getMiningStats();
    const employeeStage = state.storyStage === 'employee' && state.employment.active;
    const xpNeeded = game.getXpRequired();
    const xpProgress = Math.max(0, Math.min(1, state.character.xp / xpNeeded));
    const hpProgress = Math.max(0, Math.min(1, state.currentDeposit.hp / state.currentDeposit.maxHp));
    const contractCost = config.employment.contractBuyoutCost;
    const contractProgress = contractCost <= 0 ? 1 : Math.max(0, Math.min(1, state.cash / contractCost));

    nodes.cash.textContent = formatCurrency(state.cash);
    nodes.level.textContent = formatNumber(state.character.level);
    nodes.skill_points.textContent = formatNumber(state.character.skillPoints);
    nodes.nav_skill_points.textContent = formatNumber(state.character.skillPoints);
    nodes.nav_skill_points.classList.toggle('has-points', state.character.skillPoints > 0);
    nodes.xp_label.textContent = `XP ${formatNumber(state.character.xp)} / ${formatNumber(xpNeeded)}`;
    nodes.xp_bar.style.width = `${xpProgress * 100}%`;
    nodes.xp_bar.parentElement.setAttribute('aria-valuemax', String(xpNeeded));
    nodes.xp_bar.parentElement.setAttribute('aria-valuenow', String(Math.min(state.character.xp, xpNeeded)));
    nodes.subtitle.textContent = employeeStage ? config.ui.subtitle : config.independence.subtitle;
    nodes.mine_name.textContent = !employeeStage && state.currentMine === config.start.mineId
      ? config.independence.locationName
      : mine.name;
    nodes.role.textContent = employeeStage ? config.employment.role : config.independence.role;
    nodes.employer.textContent = employeeStage ? config.employment.companyName : config.independence.operationName;
    nodes.instruction.textContent = employeeStage ? config.ui.instruction : config.independence.instruction;
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
    nodes.manual_power.textContent = formatNumber(miningStats.manualPower);
    nodes.critical_chance.textContent = percent(miningStats.criticalChance);
    nodes.critical_damage.textContent = `${formatNumber(miningStats.criticalDamage, { decimals: 1 })}x`;
    nodes.ore_yield.textContent = percent(miningStats.oreYieldChance);

    nodes.contract_progress_label.textContent = `${formatCurrency(Math.min(state.cash, contractCost))} / ${formatCurrency(contractCost)}`;
    nodes.contract_percent.textContent = `${Math.floor(contractProgress * 100)}%`;
    nodes.contract_bar.style.width = `${contractProgress * 100}%`;
    nodes.contract_bar.parentElement.setAttribute('aria-valuenow', String(Math.floor(contractProgress * 100)));
    nodes.buyout.disabled = state.cash < contractCost;
    nodes.buyout.hidden = !employeeStage;
    nodes.contract_progress_wrap.hidden = !employeeStage;
    nodes.contract_kicker.textContent = employeeStage ? 'FIRST MAJOR GOAL' : 'CONTRACT PAID';
    nodes.contract_title.textContent = employeeStage ? 'Buy Out Employment Contract' : 'You Work for Yourself Now';
    nodes.contract_copy.textContent = employeeStage
      ? `Pay ${formatCurrency(contractCost)} to leave Blackstone. Until then, the company owns every resource you recover.`
      : `You paid ${formatCurrency(state.employment.contractBuyoutPaid)} for your freedom. New ore now enters your personal stockpile; direct sales arrive in Milestone 3.`;

    renderResources(state, employeeStage);
    renderSkills(game);
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
    if (result.critical) spawnFloat('CRITICAL!', 'critical');

    if (result.type === 'break') {
      const resource = config.resourcesById[result.resourceId];
      spawnFloat(`+${formatNumber(result.quantity)} ${resource.name}`, 'ore');
      if (result.wage > 0) spawnFloat(`+${formatCurrency(result.wage)} wage`, 'cash');
      const destination = result.destination === 'employer'
        ? `${resource.name} delivered to ${config.employment.companyName}. You earned ${formatCurrency(result.wage)}`
        : `${resource.name} added to your personal stockpile`;
      const levelText = result.levelsGained > 0
        ? ` Reached level ${formatNumber(result.level)}; ${formatNumber(result.skillPointsGained)} skill point${result.skillPointsGained === 1 ? '' : 's'} awarded.`
        : '';
      nodes.last_result.textContent = `${destination} and ${formatNumber(result.xp)} XP.${levelText}`;
    } else {
      nodes.last_result.textContent = result.critical
        ? `Critical strike for ${formatNumber(result.damage)} mining damage.`
        : `Your pickaxe dealt ${formatNumber(result.damage)} mining damage.`;
    }
  }

  function advanceStory() {
    if (activeStory || storyQueue.length < 1) return;
    activeStory = storyQueue.shift();
    nodes.story_speaker.textContent = activeStory.speaker;
    nodes.story_title.textContent = activeStory.title;
    nodes.story_text.textContent = activeStory.text;
    nodes.story_overlay.hidden = false;
    nodes.story_continue.focus();
  }

  function showMilestone(milestone) {
    storyQueue.push(milestone);
    advanceStory();
  }

  function dismissStory() {
    activeStory = null;
    nodes.story_overlay.hidden = true;
    advanceStory();
  }

  function resetStoryQueue() {
    storyQueue.length = 0;
    activeStory = null;
    nodes.story_overlay.hidden = true;
  }

  return {
    nodes,
    render,
    setSaveStatus,
    setView,
    showImpact,
    showMilestone,
    dismissStory,
    resetStoryQueue,
  };
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
    if (event.type === 'milestone') ui.showMilestone(event.detail);
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
  ui.nodes.tab_mine.addEventListener('click', () => ui.setView('mine'));
  ui.nodes.tab_skills.addEventListener('click', () => ui.setView('skills'));
  const tabs = [ui.nodes.tab_mine, ui.nodes.tab_skills];
  tabs.forEach((tab, index) => {
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      ui.setView(nextIndex === 0 ? 'mine' : 'skills');
      tabs[nextIndex].focus();
    });
  });
  ui.nodes.open_skills.addEventListener('click', () => ui.setView('skills'));
  ui.nodes.story_continue.addEventListener('click', () => ui.dismissStory());
  ui.nodes.story_overlay.addEventListener('click', (event) => {
    if (event.target === ui.nodes.story_overlay) ui.dismissStory();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !ui.nodes.story_overlay.hidden) ui.dismissStory();
  });

  ui.nodes.skills_grid.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-skill-id]');
    if (!button) return;
    const result = game.allocateSkill(button.dataset.skillId);
    ui.nodes.skill_status.textContent = result.ok
      ? `${database.config.skillsById[result.skillId].name} advanced to rank ${result.rank}.`
      : 'That skill cannot be advanced right now.';
    ui.render(game);
  });

  ui.nodes.reset_skills.addEventListener('click', () => {
    const cost = game.getSkillResetCost();
    if (!window.confirm(`Reset all allocated skills for ${formatCurrency(cost)}?`)) return;
    const result = game.resetSkills();
    ui.nodes.skill_status.textContent = result.ok
      ? `${formatNumber(result.refundedPoints)} skill point${result.refundedPoints === 1 ? '' : 's'} refunded.`
      : result.reason === 'insufficient-cash'
        ? `You need ${formatCurrency(result.cost)} to reset your skills.`
        : 'There are no allocated skills to reset.';
    ui.render(game);
  });

  ui.nodes.buyout.addEventListener('click', () => {
    const cost = database.config.employment.contractBuyoutCost;
    if (!window.confirm(`Pay ${formatCurrency(cost)} to buy out your Blackstone employment contract?`)) return;
    const result = game.buyOutContract();
    ui.nodes.last_result.textContent = result.ok
      ? `Contract paid. You are now an independent miner, and all newly mined ore belongs to you.`
      : `You still need ${formatCurrency(Math.max(0, result.cost - result.cash))} to buy out the contract.`;
    ui.render(game);
  });

  ui.nodes.reset.addEventListener('click', () => {
    if (!window.confirm('Start a new mining game and replace this local save?')) return;
    ui.resetStoryQueue();
    game.startNew();
    ui.nodes.last_result.textContent = 'A new shift has started.';
    ui.setSaveStatus('New local save created');
    ui.setView('mine');
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
