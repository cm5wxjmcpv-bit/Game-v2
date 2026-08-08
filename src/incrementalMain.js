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
        <button id="incremental-tab-store" type="button" role="tab" aria-controls="incremental-store-view" aria-selected="false" tabindex="-1">General Store</button>
        <button id="incremental-tab-equipment" type="button" role="tab" aria-controls="incremental-equipment-view" aria-selected="false" tabindex="-1">Equipment</button>
        <button id="incremental-tab-mines" type="button" role="tab" aria-controls="incremental-mines-view" aria-selected="false" tabindex="-1">Mines</button>
        <button id="incremental-tab-company" type="button" role="tab" aria-controls="incremental-company-view" aria-selected="false" tabindex="-1">Company</button>
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

            <div id="incremental-event-banner" class="incremental-event-banner" hidden>
              <span id="incremental-event-icon" aria-hidden="true">!</span>
              <div>
                <small>ACTIVE MINING EVENT</small>
                <strong id="incremental-event-name">Rich Seam</strong>
                <p id="incremental-event-description"></p>
              </div>
              <strong id="incremental-event-time">0s</strong>
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
              <div class="incremental-ledger-row"><span>Rare find chance</span><strong id="incremental-rare-find-chance">0%</strong></div>
              <div class="incremental-ledger-row"><span>Automated power</span><strong id="incremental-automation-power">0/sec</strong></div>
              <button id="incremental-open-skills" class="incremental-secondary-button" type="button">Spend Skill Points</button>
              <button id="incremental-open-mines" class="incremental-secondary-button" type="button">Explore Mines</button>
              <button id="incremental-open-company" class="incremental-secondary-button" type="button">Manage Company</button>
            </section>
          </aside>
        </div>
      </section>

      <section id="incremental-store-view" class="incremental-view incremental-section-view" role="tabpanel" aria-labelledby="incremental-tab-store" hidden>
        <div class="incremental-store-header incremental-panel">
          <div>
            <span class="incremental-label">SUPPLIES & FIXED-ODDS FUN</span>
            <h2 id="incremental-store-name">General Store</h2>
            <p id="incremental-store-description"></p>
          </div>
          <div class="incremental-store-cash">
            <span>Cash on hand</span>
            <strong id="incremental-store-cash">$0</strong>
          </div>
        </div>
        <p id="incremental-store-status" class="incremental-section-status" role="status">Miller keeps the counter open from your first shift onward.</p>
        <div id="incremental-store-categories" class="incremental-store-categories"></div>
      </section>

      <section id="incremental-equipment-view" class="incremental-view incremental-section-view" role="tabpanel" aria-labelledby="incremental-tab-equipment" hidden>
        <div class="incremental-equipment-header incremental-panel">
          <div>
            <span class="incremental-label">PERSONAL LOADOUT</span>
            <h2>Miner Equipment</h2>
            <p>Personal gear changes manual mining stats. Company workers and machinery are managed separately.</p>
          </div>
          <div class="incremental-equipment-power">
            <span>Equipped manual power</span>
            <strong id="incremental-equipment-power">2</strong>
          </div>
        </div>
        <p id="incremental-equipment-status" class="incremental-section-status" role="status">Purchase equipment at Miller's, then switch owned gear here.</p>
        <div id="incremental-equipment-slots" class="incremental-equipment-slots"></div>
        <div class="incremental-owned-heading">
          <div><span class="incremental-label">OWNED GEAR</span><h2>Your Equipment</h2></div>
          <button id="incremental-open-store" class="incremental-secondary-button" type="button">Visit Miller's General Store</button>
        </div>
        <div id="incremental-owned-equipment" class="incremental-equipment-grid"></div>
      </section>

      <section id="incremental-mines-view" class="incremental-view incremental-section-view" role="tabpanel" aria-labelledby="incremental-tab-mines" hidden>
        <div class="incremental-mines-header incremental-panel">
          <div>
            <span class="incremental-label">MINE PROGRESSION</span>
            <h2>Claims & Shafts</h2>
            <p>Break deposits, improve your miner, and grow the company to reach more valuable ground. Unlock costs are paid once.</p>
          </div>
          <div class="incremental-mines-summary">
            <span>Current operation</span>
            <strong id="incremental-mines-current">Starting Mine</strong>
            <small id="incremental-mines-unlocked">1 / 1 unlocked</small>
          </div>
        </div>
        <p id="incremental-mines-status" class="incremental-section-status" role="status">Your current shaft remains active until you enter another unlocked mine.</p>
        <div id="incremental-mines-grid" class="incremental-mines-grid"></div>
      </section>

      <section id="incremental-company-view" class="incremental-view incremental-section-view" role="tabpanel" aria-labelledby="incremental-tab-company" hidden>
        <div class="incremental-company-header incremental-panel">
          <div>
            <span class="incremental-label">BUSINESS PROGRESSION</span>
            <h2 id="incremental-company-heading">Start a Mining Company</h2>
            <p id="incremental-company-intro">Independence comes first. Then you can register an operation, hire workers, and invest in machinery.</p>
          </div>
          <div class="incremental-company-summary">
            <span>Automated mining power</span>
            <strong id="incremental-company-production">0/sec</strong>
            <small id="incremental-company-level-summary">Company not formed</small>
          </div>
        </div>
        <p id="incremental-company-status" class="incremental-section-status" role="status">Build your own operation after leaving Blackstone.</p>

        <section id="incremental-company-setup" class="incremental-company-setup incremental-panel">
          <div>
            <span class="incremental-label">FORMAL REGISTRATION</span>
            <h2>Name Your Company</h2>
            <p>Registration unlocks hired miners and business upgrades. Your personal swings remain the only source of character XP.</p>
          </div>
          <div id="incremental-company-requirements" class="incremental-company-requirements"></div>
          <form id="incremental-company-form" class="incremental-company-form">
            <label for="incremental-company-name">Company name</label>
            <div>
              <input id="incremental-company-name" name="companyName" type="text" autocomplete="organization" placeholder="Your Mining Company" required>
              <button id="incremental-create-company" class="incremental-primary-button" type="submit">Register Company</button>
            </div>
          </form>
        </section>

        <div id="incremental-company-dashboard" class="incremental-company-dashboard" hidden>
          <section class="incremental-company-progress incremental-panel">
            <div class="incremental-panel-heading">
              <div><span class="incremental-label">COMPANY LEVEL</span><h2 id="incremental-company-tier">Prospecting Outfit</h2></div>
              <strong id="incremental-company-level">Level 1</strong>
            </div>
            <div class="incremental-company-investment-copy"><span>Lifetime business investment</span><strong id="incremental-company-investment">$0</strong></div>
            <div class="incremental-progress" role="progressbar" aria-label="Company level progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
              <span id="incremental-company-level-bar"></span>
            </div>
            <small id="incremental-company-next-level">Invest in workers and upgrades to grow the company.</small>
          </section>

          <section class="incremental-company-section">
            <div class="incremental-category-heading">
              <h2>Automation</h2>
              <p>Every generator applies mining damage to the same active deposit. Automated breaks award ore, but personal XP still comes from manual mining.</p>
            </div>
            <div id="incremental-generator-grid" class="incremental-company-grid"></div>
          </section>

          <section class="incremental-company-section">
            <div class="incremental-category-heading">
              <h2>Business Upgrades</h2>
              <p>Company investments improve automated production without changing your personal equipment.</p>
            </div>
            <div id="incremental-business-upgrade-grid" class="incremental-company-grid"></div>
          </section>
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
    </div>

    <div id="incremental-offline-overlay" class="incremental-story-overlay incremental-offline-overlay" hidden>
      <section class="incremental-story-dialog incremental-offline-dialog" role="dialog" aria-modal="true" aria-labelledby="incremental-offline-title">
        <span class="incremental-label">WHILE YOU WERE AWAY</span>
        <h2 id="incremental-offline-title">Your Operation Kept Working</h2>
        <div class="incremental-offline-time-grid">
          <div><span>Time away</span><strong id="incremental-offline-time-away">0s</strong></div>
          <div><span>Production credited</span><strong id="incremental-offline-time-credited">0s</strong></div>
        </div>
        <div class="incremental-offline-production-row">
          <span>Operation output</span>
          <strong id="incremental-offline-production">0 deposits</strong>
        </div>
        <div id="incremental-offline-resources" class="incremental-offline-resources"></div>
        <div class="incremental-offline-value-row">
          <span>Estimated sale value</span>
          <strong id="incremental-offline-value">$0</strong>
        </div>
        <p id="incremental-offline-note" class="incremental-offline-note"></p>
        <button id="incremental-offline-continue" class="incremental-primary-button" type="button">Continue Mining</button>
      </section>
    </div>`;
  return root;
}

function percent(value) {
  return `${formatNumber(Number(value) * 100, { decimals: 1 })}%`;
}

function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${remainder}s`;
  return `${remainder}s`;
}

function businessRequirementTextForResult(result, config) {
  if (result.reason === 'company-required') return 'Register your company before making that purchase.';
  if (result.reason === 'company-level') return `Reach company level ${result.requiredCompanyLevel} first.`;
  if (result.reason === 'generator-required') {
    const generator = config.generatorsById[result.requiredGeneratorId];
    return `Own ${result.requiredGeneratorOwned} ${generator?.name || 'required generator'}${result.requiredGeneratorOwned === 1 ? '' : 's'} first.`;
  }
  return 'That company purchase is not available yet.';
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
    mine_stage: byId('incremental-mine-stage'),
    event_banner: byId('incremental-event-banner'),
    event_icon: byId('incremental-event-icon'),
    event_name: byId('incremental-event-name'),
    event_description: byId('incremental-event-description'),
    event_time: byId('incremental-event-time'),
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
    rare_find_chance: byId('incremental-rare-find-chance'),
    automation_power: byId('incremental-automation-power'),
    open_skills: byId('incremental-open-skills'),
    open_mines: byId('incremental-open-mines'),
    open_company: byId('incremental-open-company'),
    reset: byId('incremental-reset'),
    tab_mine: byId('incremental-tab-mine'),
    tab_store: byId('incremental-tab-store'),
    tab_equipment: byId('incremental-tab-equipment'),
    tab_mines: byId('incremental-tab-mines'),
    tab_company: byId('incremental-tab-company'),
    tab_skills: byId('incremental-tab-skills'),
    mine_view: byId('incremental-mine-view'),
    store_view: byId('incremental-store-view'),
    equipment_view: byId('incremental-equipment-view'),
    mines_view: byId('incremental-mines-view'),
    company_view: byId('incremental-company-view'),
    skills_view: byId('incremental-skills-view'),
    store_name: byId('incremental-store-name'),
    store_description: byId('incremental-store-description'),
    store_cash: byId('incremental-store-cash'),
    store_status: byId('incremental-store-status'),
    store_categories: byId('incremental-store-categories'),
    equipment_power: byId('incremental-equipment-power'),
    equipment_status: byId('incremental-equipment-status'),
    equipment_slots: byId('incremental-equipment-slots'),
    owned_equipment: byId('incremental-owned-equipment'),
    open_store: byId('incremental-open-store'),
    mines_current: byId('incremental-mines-current'),
    mines_unlocked: byId('incremental-mines-unlocked'),
    mines_status: byId('incremental-mines-status'),
    mines_grid: byId('incremental-mines-grid'),
    skills_available: byId('incremental-skills-available'),
    skills_grid: byId('incremental-skills-grid'),
    skill_status: byId('incremental-skill-status'),
    reset_skills: byId('incremental-reset-skills'),
    reset_cost: byId('incremental-reset-cost'),
    company_heading: byId('incremental-company-heading'),
    company_intro: byId('incremental-company-intro'),
    company_production: byId('incremental-company-production'),
    company_level_summary: byId('incremental-company-level-summary'),
    company_status: byId('incremental-company-status'),
    company_setup: byId('incremental-company-setup'),
    company_requirements: byId('incremental-company-requirements'),
    company_form: byId('incremental-company-form'),
    company_name: byId('incremental-company-name'),
    create_company: byId('incremental-create-company'),
    company_dashboard: byId('incremental-company-dashboard'),
    company_tier: byId('incremental-company-tier'),
    company_level: byId('incremental-company-level'),
    company_investment: byId('incremental-company-investment'),
    company_level_bar: byId('incremental-company-level-bar'),
    company_next_level: byId('incremental-company-next-level'),
    generator_grid: byId('incremental-generator-grid'),
    business_upgrade_grid: byId('incremental-business-upgrade-grid'),
    story_overlay: byId('incremental-story-overlay'),
    story_speaker: byId('incremental-story-speaker'),
    story_title: byId('incremental-story-title'),
    story_text: byId('incremental-story-text'),
    story_continue: byId('incremental-story-continue'),
    offline_overlay: byId('incremental-offline-overlay'),
    offline_time_away: byId('incremental-offline-time-away'),
    offline_time_credited: byId('incremental-offline-time-credited'),
    offline_production: byId('incremental-offline-production'),
    offline_resources: byId('incremental-offline-resources'),
    offline_value: byId('incremental-offline-value'),
    offline_note: byId('incremental-offline-note'),
    offline_continue: byId('incremental-offline-continue'),
  };
  const storyQueue = [];
  let activeStory = null;
  let storyPausedForOffline = false;
  let lastLotteryResult = null;

  nodes.title.textContent = config.ui.title || database.game.name;
  nodes.subtitle.textContent = config.ui.subtitle;
  nodes.store_name.textContent = config.store.name;
  nodes.store_description.textContent = `${config.store.description} ${config.lottery.disclaimer}`.trim();
  nodes.company_name.minLength = config.company.creation.minimumNameLength;
  nodes.company_name.maxLength = config.company.creation.maximumNameLength;

  function setSaveStatus(message, failed = false) {
    nodes.save_status.textContent = message;
    nodes.save_status.classList.toggle('is-error', failed);
  }

  function setView(view) {
    const sections = {
      mine: [nodes.tab_mine, nodes.mine_view],
      store: [nodes.tab_store, nodes.store_view],
      equipment: [nodes.tab_equipment, nodes.equipment_view],
      mines: [nodes.tab_mines, nodes.mines_view],
      company: [nodes.tab_company, nodes.company_view],
      skills: [nodes.tab_skills, nodes.skills_view],
    };
    const activeView = sections[view] ? view : 'mine';
    Object.entries(sections).forEach(([name, [tab, panel]]) => {
      const active = name === activeView;
      panel.hidden = !active;
      panel.setAttribute('aria-hidden', String(!active));
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
  }

  function renderResources(state, employeeStage) {
    const source = employeeStage ? state.employment.companyResources : state.materials;
    nodes.resource_kicker.textContent = employeeStage ? 'SHIFT OUTPUT' : 'PERSONAL STOCKPILE';
    nodes.resource_title.textContent = employeeStage ? 'Blackstone Ore Ledger' : 'Your Ore Ledger';
    nodes.resource_badge.textContent = employeeStage ? 'Employer owned' : 'Player owned';
    nodes.resource_badge.classList.toggle('is-player-owned', !employeeStage);
    nodes.resources.replaceChildren();

    const currentMine = config.minesById[state.currentMine];
    const currentResourceIds = new Set(currentMine.depositIds.map((depositId) => (
      config.depositsById[depositId].resourceId
    )));
    config.resources.filter((resource) => (
      currentResourceIds.has(resource.id) || source[resource.id] > 0
    )).forEach((resource) => {
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
      if (!employeeStage) {
        row.classList.add('has-sale-actions');
        const actions = document.createElement('div');
        actions.className = 'incremental-sale-actions';
        [1, 10, 'all'].forEach((amount) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'incremental-sale-button';
          button.dataset.sellResourceId = resource.id;
          button.dataset.sellQuantity = String(amount);
          button.textContent = amount === 'all' ? 'Sell All' : `Sell ${amount}`;
          button.disabled = quantity < (amount === 'all' ? 1 : amount);
          actions.appendChild(button);
        });
        row.appendChild(actions);
      }
      nodes.resources.appendChild(row);
    });
  }

  function mineDisplayName(state, mine) {
    return !state.employment.active && mine.id === config.start.mineId
      ? config.independence.locationName
      : mine.name;
  }

  function renderMiningEvent(game) {
    const activeEvent = game.getActiveMiningEvent();
    nodes.event_banner.hidden = !activeEvent;
    if (!activeEvent) return;
    nodes.event_icon.textContent = activeEvent.icon;
    nodes.event_name.textContent = activeEvent.name;
    nodes.event_description.textContent = activeEvent.description;
    nodes.event_time.textContent = `${Math.ceil(activeEvent.remainingSeconds)}s`;
  }

  function makeMineRequirement(label, value, met) {
    const row = document.createElement('div');
    row.className = 'incremental-mine-requirement';
    row.classList.toggle('is-met', met);
    const name = document.createElement('span');
    name.textContent = label;
    const status = document.createElement('strong');
    status.textContent = value;
    row.append(name, status);
    return row;
  }

  function makeMineCard(game, mine) {
    const state = game.state;
    const status = game.getMineUnlockStatus(mine.id);
    const progress = game.getMineProgress(mine.id);
    const active = state.currentMine === mine.id;
    const card = document.createElement('article');
    card.className = 'incremental-mine-option incremental-panel';
    card.classList.toggle('is-active', active);
    card.classList.toggle('is-locked', !status.unlocked);
    card.style.setProperty('--mine-card-accent', mine.visual.accent);

    const header = document.createElement('div');
    header.className = 'incremental-mine-option-header';
    const titleWrap = document.createElement('div');
    const kicker = document.createElement('span');
    kicker.className = 'incremental-label';
    kicker.textContent = `MINE ${mine.order}`;
    const title = document.createElement('h3');
    title.textContent = mineDisplayName(state, mine);
    titleWrap.append(kicker, title);
    const badge = document.createElement('strong');
    badge.textContent = active ? 'ACTIVE' : status.unlocked ? 'UNLOCKED' : 'LOCKED';
    header.append(titleWrap, badge);

    const description = document.createElement('p');
    description.textContent = mine.description;
    const resources = document.createElement('div');
    resources.className = 'incremental-mine-resources';
    mine.depositIds.forEach((depositId) => {
      const resource = config.resourcesById[config.depositsById[depositId].resourceId];
      const chip = document.createElement('span');
      chip.style.setProperty('--resource-color', resource.color);
      chip.textContent = `${resource.icon} ${resource.name}`;
      resources.appendChild(chip);
    });
    const progressRow = document.createElement('div');
    progressRow.className = 'incremental-mine-progress-copy';
    const progressLabel = document.createElement('span');
    progressLabel.textContent = 'Mine progress';
    const progressValue = document.createElement('strong');
    progressValue.textContent = `${formatNumber(progress.depositsBroken)} deposits · ${formatNumber(progress.oreMined)} resources`;
    progressRow.append(progressLabel, progressValue);
    card.append(header, description, resources, progressRow);

    if (!status.unlocked) {
      const requirements = document.createElement('div');
      requirements.className = 'incremental-mine-requirements';
      const requirementState = status.requirements;
      if (requirementState.independence.required) {
        requirements.appendChild(makeMineRequirement(
          'Independence',
          requirementState.independence.met ? 'Contract paid' : 'Buyout required',
          requirementState.independence.met,
        ));
      }
      requirements.appendChild(makeMineRequirement(
        'Character level',
        `${formatNumber(requirementState.characterLevel.current)} / ${formatNumber(requirementState.characterLevel.required)}`,
        requirementState.characterLevel.met,
      ));
      if (requirementState.companyLevel.required > 0) {
        requirements.appendChild(makeMineRequirement(
          'Company level',
          `${formatNumber(requirementState.companyLevel.current)} / ${formatNumber(requirementState.companyLevel.required)}`,
          requirementState.companyLevel.met,
        ));
      }
      if (requirementState.previousMine.mineId) {
        const previousMine = config.minesById[requirementState.previousMine.mineId];
        requirements.appendChild(makeMineRequirement(
          `${previousMine.name} deposits`,
          `${formatNumber(requirementState.previousMine.current)} / ${formatNumber(requirementState.previousMine.required)}`,
          requirementState.previousMine.met,
        ));
      }
      if (requirementState.cash.required > 0) {
        requirements.appendChild(makeMineRequirement(
          'Unlock cost',
          `${formatCurrency(requirementState.cash.current)} / ${formatCurrency(requirementState.cash.required)}`,
          requirementState.cash.met,
        ));
      }
      card.appendChild(requirements);
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = active ? 'incremental-secondary-button' : 'incremental-primary-button';
    if (active) {
      button.textContent = 'Current Mine';
      button.disabled = true;
    } else if (status.unlocked) {
      button.dataset.selectMineId = mine.id;
      button.textContent = 'Enter Mine';
    } else {
      button.dataset.unlockMineId = mine.id;
      button.textContent = status.canUnlock
        ? `Unlock · ${formatCurrency(status.cost)}`
        : 'Requirements Not Met';
      button.disabled = !status.canUnlock;
    }
    card.appendChild(button);
    return card;
  }

  function renderMines(game) {
    const currentMine = config.minesById[game.state.currentMine];
    nodes.mines_current.textContent = mineDisplayName(game.state, currentMine);
    nodes.mines_unlocked.textContent = `${formatNumber(game.state.unlockedMines.length)} / ${formatNumber(config.mines.length)} unlocked`;
    nodes.mines_grid.replaceChildren();
    config.mines.forEach((mine) => nodes.mines_grid.appendChild(makeMineCard(game, mine)));
  }

  function equipmentBonusSummary(item) {
    return item.bonuses.map((bonus) => bonus.label).filter(Boolean).join(' · ') || 'No stat bonus';
  }

  function makeEquipmentCard(game, item, context = 'store') {
    const owned = game.state.ownedEquipment.includes(item.id);
    const equipped = game.state.equipment[item.slotId] === item.id;
    const prerequisite = item.requiresItemId ? config.equipment.itemsById[item.requiresItemId] : null;
    const prerequisiteMet = !prerequisite || game.state.ownedEquipment.includes(prerequisite.id);
    const card = document.createElement('article');
    card.className = 'incremental-equipment-card';
    card.classList.toggle('is-equipped', equipped);

    const header = document.createElement('div');
    header.className = 'incremental-equipment-card-header';
    const icon = document.createElement('span');
    icon.className = 'incremental-equipment-icon';
    icon.textContent = item.icon;
    const titleWrap = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = item.name;
    const slot = document.createElement('small');
    slot.textContent = config.equipment.slotsById[item.slotId]?.name || item.slotId;
    titleWrap.append(title, slot);
    const price = document.createElement('strong');
    price.textContent = item.cost > 0 ? formatCurrency(item.cost) : 'Issued';
    header.append(icon, titleWrap, price);

    const description = document.createElement('p');
    description.textContent = item.description;
    const bonus = document.createElement('span');
    bonus.className = 'incremental-equipment-bonus';
    bonus.textContent = equipmentBonusSummary(item);
    card.append(header, description, bonus);

    if (prerequisite) {
      const requirement = document.createElement('small');
      requirement.className = 'incremental-equipment-requirement';
      requirement.textContent = prerequisiteMet
        ? `Progression requirement met: ${prerequisite.name}`
        : `Requires ownership of ${prerequisite.name}`;
      card.appendChild(requirement);
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'incremental-secondary-button';
    if (context === 'store') {
      button.dataset.buyEquipmentId = item.id;
      button.textContent = equipped
        ? 'Equipped'
        : owned
          ? 'Owned'
          : !prerequisiteMet
            ? `Requires ${prerequisite.name}`
            : `Buy & Equip · ${formatCurrency(item.cost)}`;
      button.disabled = owned || !prerequisiteMet || game.state.cash < item.cost;
    } else {
      button.dataset.equipItemId = item.id;
      button.textContent = equipped ? 'Currently Equipped' : 'Equip';
      button.disabled = equipped;
    }
    card.appendChild(button);
    return card;
  }

  function makeLotteryCard(game, ticket) {
    const pending = game.state.lotteryState.scratchTickets.filter((id) => id === ticket.id).length;
    const card = document.createElement('article');
    card.className = 'incremental-lottery-card';
    const header = document.createElement('div');
    header.className = 'incremental-lottery-header';
    const icon = document.createElement('span');
    icon.textContent = ticket.icon;
    const heading = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = ticket.name;
    const description = document.createElement('p');
    description.textContent = ticket.description;
    heading.append(title, description);
    const cost = document.createElement('strong');
    cost.textContent = formatCurrency(ticket.cost);
    header.append(icon, heading, cost);
    card.appendChild(header);

    const oddsHeading = document.createElement('strong');
    oddsHeading.className = 'incremental-lottery-odds-heading';
    oddsHeading.textContent = 'Published prize odds';
    const odds = document.createElement('ul');
    odds.className = 'incremental-lottery-odds';
    ticket.prizes.forEach((prize) => {
      const row = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = prize.label;
      const chance = document.createElement('strong');
      chance.textContent = percent(prize.probability);
      row.append(label, chance);
      odds.appendChild(row);
    });
    const returnNote = document.createElement('small');
    returnNote.className = 'incremental-lottery-return';
    returnNote.textContent = `Prize chances total 100%. Expected prize value: ${formatCurrency(ticket.expectedPayout)} per ${formatCurrency(ticket.cost)} ticket.`;
    card.append(oddsHeading, odds, returnNote);

    const actions = document.createElement('div');
    actions.className = 'incremental-lottery-actions';
    const buy = document.createElement('button');
    buy.type = 'button';
    buy.className = 'incremental-primary-button';
    buy.dataset.buyTicketId = ticket.id;
    buy.textContent = `Buy Ticket · ${formatCurrency(ticket.cost)}`;
    buy.disabled = game.state.cash < ticket.cost;
    actions.appendChild(buy);
    if (pending > 0) {
      const scratch = document.createElement('button');
      scratch.type = 'button';
      scratch.className = 'incremental-scratch-card';
      scratch.dataset.scratchTicketId = ticket.id;
      scratch.setAttribute('aria-label', `Scratch ${ticket.name}. ${pending} ticket${pending === 1 ? '' : 's'} ready.`);
      const dust = document.createElement('span');
      dust.textContent = 'TAP OR CLICK TO SCRATCH';
      const count = document.createElement('small');
      count.textContent = `${pending} ready`;
      scratch.append(dust, count);
      actions.appendChild(scratch);
    }
    card.appendChild(actions);

    if (lastLotteryResult?.ticketId === ticket.id) {
      const reveal = document.createElement('div');
      reveal.className = 'incremental-lottery-reveal';
      const revealLabel = document.createElement('span');
      revealLabel.textContent = 'REVEALED PRIZE';
      const revealPrize = document.createElement('strong');
      revealPrize.textContent = lastLotteryResult.label;
      reveal.append(revealLabel, revealPrize);
      card.appendChild(reveal);
    }
    return card;
  }

  function renderStore(game) {
    nodes.store_cash.textContent = formatCurrency(game.state.cash);
    nodes.store_categories.replaceChildren();
    config.store.categories.forEach((category) => {
      const section = document.createElement('section');
      section.className = 'incremental-store-category incremental-panel';
      const heading = document.createElement('div');
      heading.className = 'incremental-category-heading';
      const title = document.createElement('h2');
      title.textContent = category.name;
      const description = document.createElement('p');
      description.textContent = category.description;
      heading.append(title, description);
      const grid = document.createElement('div');
      grid.className = 'incremental-store-grid';
      category.equipmentIds.forEach((itemId) => {
        grid.appendChild(makeEquipmentCard(game, config.equipment.itemsById[itemId], 'store'));
      });
      category.scratchTicketIds.forEach((ticketId) => {
        grid.appendChild(makeLotteryCard(game, config.lottery.scratchTicketsById[ticketId]));
      });
      section.append(heading, grid);
      nodes.store_categories.appendChild(section);
    });
  }

  function renderEquipment(game) {
    nodes.equipment_power.textContent = formatNumber(game.getManualPower());
    nodes.equipment_slots.replaceChildren();
    config.equipment.slots.forEach((slot) => {
      const item = game.getEquippedItem(slot.id);
      const card = document.createElement('article');
      card.className = 'incremental-slot-card incremental-panel';
      const label = document.createElement('span');
      label.className = 'incremental-label';
      label.textContent = slot.name;
      const title = document.createElement('h3');
      title.textContent = item?.name || 'Empty Slot';
      const description = document.createElement('p');
      description.textContent = item ? equipmentBonusSummary(item) : slot.description;
      card.append(label, title, description);
      nodes.equipment_slots.appendChild(card);
    });

    nodes.owned_equipment.replaceChildren();
    const ownedItems = game.state.ownedEquipment
      .map((itemId) => config.equipment.itemsById[itemId])
      .filter(Boolean);
    ownedItems.forEach((item) => nodes.owned_equipment.appendChild(makeEquipmentCard(game, item, 'equipment')));
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

  function businessRequirementText(unlock) {
    if (unlock.reason === 'company-required') return 'Register your company first';
    if (unlock.reason === 'company-level') return `Requires company level ${unlock.requiredCompanyLevel}`;
    if (unlock.reason === 'generator-required') {
      const generator = config.generatorsById[unlock.requiredGeneratorId];
      return `Requires ${unlock.requiredGeneratorOwned} ${generator?.name || 'generator'}${unlock.requiredGeneratorOwned === 1 ? '' : 's'}`;
    }
    return 'Available';
  }

  function makeCompanyRequirement(label, value, met) {
    const row = document.createElement('div');
    row.className = 'incremental-company-requirement';
    row.classList.toggle('is-met', met);
    const name = document.createElement('span');
    name.textContent = label;
    const status = document.createElement('strong');
    status.textContent = value;
    row.append(name, status);
    return row;
  }

  function makeGeneratorCard(game, generator, automation) {
    const owned = game.getGeneratorOwned(generator.id);
    const cost = game.getGeneratorCost(generator.id);
    const unlock = game.getGeneratorUnlockStatus(generator.id);
    const production = automation.generators.find((entry) => entry.id === generator.id);
    const effectivePower = (production?.power || 0) * automation.globalMultiplier;
    const card = document.createElement('article');
    card.className = 'incremental-business-card incremental-panel';
    card.classList.toggle('is-locked', !unlock.unlocked);

    const header = document.createElement('div');
    header.className = 'incremental-business-card-header';
    const icon = document.createElement('span');
    icon.textContent = generator.icon;
    const heading = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = generator.name;
    const count = document.createElement('small');
    count.textContent = `Owned ${formatNumber(owned)}`;
    heading.append(title, count);
    const price = document.createElement('strong');
    price.textContent = formatCurrency(cost);
    header.append(icon, heading, price);

    const description = document.createElement('p');
    description.textContent = generator.description;
    const stats = document.createElement('div');
    stats.className = 'incremental-business-stats';
    const perUnit = document.createElement('span');
    perUnit.textContent = `${formatNumber(generator.powerPerSecond)} damage/sec each`;
    const total = document.createElement('strong');
    total.textContent = `${formatNumber(effectivePower)} damage/sec total`;
    stats.append(perUnit, total);
    const requirement = document.createElement('small');
    requirement.className = 'incremental-business-requirement';
    requirement.textContent = businessRequirementText(unlock);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'incremental-secondary-button';
    button.dataset.buyGeneratorId = generator.id;
    button.textContent = unlock.unlocked ? `Buy for ${formatCurrency(cost)}` : 'Locked';
    button.disabled = !unlock.unlocked || game.state.cash < cost;
    card.append(header, description, stats, requirement, button);
    return card;
  }

  function makeBusinessUpgradeCard(game, upgrade) {
    const rank = game.getBusinessUpgradeRank(upgrade.id);
    const cost = game.getBusinessUpgradeCost(upgrade.id);
    const unlock = game.getBusinessUpgradeUnlockStatus(upgrade.id);
    const maxed = rank >= upgrade.maxRank;
    const card = document.createElement('article');
    card.className = 'incremental-business-card incremental-panel';
    card.classList.toggle('is-locked', !unlock.unlocked);

    const header = document.createElement('div');
    header.className = 'incremental-business-card-header';
    const heading = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = upgrade.name;
    const rankLabel = document.createElement('small');
    rankLabel.textContent = `Rank ${rank} / ${upgrade.maxRank}`;
    heading.append(title, rankLabel);
    const price = document.createElement('strong');
    price.textContent = maxed ? 'MAX' : formatCurrency(cost);
    header.append(heading, price);

    const description = document.createElement('p');
    description.textContent = upgrade.description;
    const effect = document.createElement('strong');
    effect.className = 'incremental-business-effect';
    effect.textContent = upgrade.effect.label;
    const requirement = document.createElement('small');
    requirement.className = 'incremental-business-requirement';
    requirement.textContent = businessRequirementText(unlock);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'incremental-secondary-button';
    button.dataset.buyBusinessUpgradeId = upgrade.id;
    button.textContent = maxed ? 'Max Rank' : unlock.unlocked ? `Upgrade for ${formatCurrency(cost)}` : 'Locked';
    button.disabled = maxed || !unlock.unlocked || game.state.cash < cost;
    card.append(header, description, effect, requirement, button);
    return card;
  }

  function renderCompany(game) {
    const state = game.state;
    const created = state.company.created;
    const creation = config.company.creation;
    const automation = game.getAutomationStats();
    nodes.company_production.textContent = `${formatNumber(automation.totalPower)}/sec`;
    nodes.company_setup.hidden = created;
    nodes.company_dashboard.hidden = !created;

    if (!created) {
      const independent = !state.employment.active && state.storyStage === 'independent';
      nodes.company_heading.textContent = independent ? 'Start a Mining Company' : 'Company Locked';
      nodes.company_intro.textContent = independent
        ? 'Register an operation, hire workers, and begin building production beyond your own swings.'
        : 'Buy out your Blackstone contract before forming a competing operation.';
      nodes.company_level_summary.textContent = 'Company not formed';
      nodes.company_requirements.replaceChildren(
        makeCompanyRequirement('Employment contract', independent ? 'Paid' : 'Buyout required', independent),
        makeCompanyRequirement(
          'Character level',
          `${formatNumber(state.character.level)} / ${formatNumber(creation.requiredCharacterLevel)}`,
          state.character.level >= creation.requiredCharacterLevel,
        ),
        makeCompanyRequirement(
          'Registration cash',
          `${formatCurrency(state.cash)} / ${formatCurrency(creation.cost)}`,
          state.cash >= creation.cost,
        ),
      );
      const status = game.getCompanyCreationStatus(nodes.company_name.value);
      nodes.company_name.disabled = !independent;
      nodes.create_company.disabled = !status.ok;
      return;
    }

    const levelDefinition = game.getCompanyLevelDefinition();
    const nextLevel = game.getNextCompanyLevel();
    nodes.company_heading.textContent = state.company.name;
    nodes.company_intro.textContent = 'Your workers damage the active deposit while your personal miner supplies XP, critical hits, and bonus ore.';
    if (nodes.company_status.textContent === 'Build your own operation after leaving Blackstone.') {
      nodes.company_status.textContent = `${state.company.name} is operating locally; purchases and production save to this game package only.`;
    }
    nodes.company_level_summary.textContent = `Company level ${formatNumber(state.company.level)} · ${levelDefinition.name}`;
    nodes.company_tier.textContent = levelDefinition.name;
    nodes.company_level.textContent = `Level ${formatNumber(state.company.level)}`;
    nodes.company_investment.textContent = formatCurrency(state.company.lifetimeInvestment);
    const currentRequirement = levelDefinition.requiredInvestment;
    const progress = nextLevel
      ? Math.max(0, Math.min(1, (state.company.lifetimeInvestment - currentRequirement)
        / (nextLevel.requiredInvestment - currentRequirement)))
      : 1;
    nodes.company_level_bar.style.width = `${progress * 100}%`;
    nodes.company_level_bar.parentElement.setAttribute('aria-valuenow', String(Math.floor(progress * 100)));
    nodes.company_next_level.textContent = nextLevel
      ? `${formatCurrency(Math.max(0, nextLevel.requiredInvestment - state.company.lifetimeInvestment))} more investment to reach level ${nextLevel.level}: ${nextLevel.name}.`
      : 'Maximum company level for this build reached; additional progression can be added later.';

    nodes.generator_grid.replaceChildren();
    config.generators.forEach((generator) => {
      nodes.generator_grid.appendChild(makeGeneratorCard(game, generator, automation));
    });
    nodes.business_upgrade_grid.replaceChildren();
    config.businessUpgrades.forEach((upgrade) => {
      nodes.business_upgrade_grid.appendChild(makeBusinessUpgradeCard(game, upgrade));
    });
  }

  function renderTick(game) {
    if (!game.state) return;
    const hpProgress = Math.max(0, Math.min(1, game.state.currentDeposit.hp / game.state.currentDeposit.maxHp));
    nodes.deposit_hp.textContent = `${formatNumber(game.state.currentDeposit.hp)} / ${formatNumber(game.state.currentDeposit.maxHp)} HP`;
    nodes.deposit_bar.style.width = `${hpProgress * 100}%`;
    nodes.deposit_progress.setAttribute('aria-valuenow', String(game.state.currentDeposit.hp));
    nodes.mining_target.setAttribute('aria-label', `Mine ${config.depositsById[game.state.currentDeposit.id].name}. ${game.state.currentDeposit.hp} of ${game.state.currentDeposit.maxHp} durability remaining.`);
    renderMiningEvent(game);
  }

  function render(game) {
    const state = game.state;
    if (!state) return;
    const mine = config.minesById[state.currentMine];
    const deposit = config.depositsById[state.currentDeposit.id];
    const miningStats = game.getMiningStats();
    const automation = game.getAutomationStats();
    const employeeStage = state.storyStage === 'employee' && state.employment.active;
    const companyOwner = state.company.created && state.storyStage === 'company-owner';
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
    nodes.mine_name.textContent = mineDisplayName(state, mine);
    nodes.role.textContent = employeeStage
      ? config.employment.role
      : companyOwner
        ? config.company.ownerRole
        : config.independence.role;
    nodes.employer.textContent = employeeStage
      ? config.employment.companyName
      : companyOwner
        ? state.company.name
        : config.independence.operationName;
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
    nodes.mine_stage.style.setProperty('--mine-background', mine.visual.background);
    nodes.mine_stage.style.setProperty('--mine-accent', mine.visual.accent);
    nodes.wages.textContent = formatCurrency(state.employment.totalWages);
    nodes.company_value.textContent = formatCurrency(state.employment.companyValue);
    nodes.manual_power.textContent = formatNumber(miningStats.manualPower);
    nodes.critical_chance.textContent = percent(miningStats.criticalChance);
    nodes.critical_damage.textContent = `${formatNumber(miningStats.criticalDamage, { decimals: 1 })}x`;
    nodes.ore_yield.textContent = percent(miningStats.oreYieldChance);
    nodes.rare_find_chance.textContent = percent(miningStats.rareFindChance);
    nodes.automation_power.textContent = `${formatNumber(automation.totalPower)}/sec`;

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
      : `You paid ${formatCurrency(state.employment.contractBuyoutPaid)} for your freedom. New ore enters your stockpile and can be sold directly at the listed value.`;

    renderResources(state, employeeStage);
    renderStore(game);
    renderEquipment(game);
    renderMiningEvent(game);
    renderMines(game);
    renderCompany(game);
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
      if (result.rareFind) spawnFloat(`RARE: ${result.rareFind.name}`, 'rare');
      if (result.eventStarted) spawnFloat(result.eventStarted.name.toUpperCase(), 'event');
      const destination = result.destination === 'employer'
        ? `${resource.name} delivered to ${config.employment.companyName}. You earned ${formatCurrency(result.wage)}`
        : `${resource.name} added to your personal stockpile`;
      const levelText = result.levelsGained > 0
        ? ` Reached level ${formatNumber(result.level)}; ${formatNumber(result.skillPointsGained)} skill point${result.skillPointsGained === 1 ? '' : 's'} awarded.`
        : '';
      let rareText = '';
      if (result.rareFind?.reward.type === 'cash') {
        rareText = ` Rare find: ${result.rareFind.name}, worth ${formatCurrency(result.rareFind.value)}.`;
      } else if (result.rareFind?.reward.type === 'xp') {
        rareText = ` Rare find: ${result.rareFind.name}, granting ${formatNumber(result.rareFind.xp)} bonus XP.`;
      } else if (result.rareFind?.reward.type === 'resource') {
        const rareResource = config.resourcesById[result.rareFind.resourceId];
        rareText = result.rareFind.destination === 'employer'
          ? ` Rare find: ${result.rareFind.name}, delivering ${formatNumber(result.rareFind.quantity)} ${rareResource.name} to ${config.employment.companyName}.`
          : ` Rare find: ${result.rareFind.name}, adding ${formatNumber(result.rareFind.quantity)} ${rareResource.name} to your stockpile.`;
      }
      const eventText = result.eventStarted
        ? ` ${result.eventStarted.name} has begun for ${formatNumber(result.eventStarted.durationSeconds)} seconds.`
        : '';
      nodes.last_result.textContent = `${destination} and ${formatNumber(result.xp)} XP.${levelText}${rareText}${eventText}`;
    } else {
      nodes.last_result.textContent = result.critical
        ? `Critical strike for ${formatNumber(result.damage)} mining damage.`
        : `Your pickaxe dealt ${formatNumber(result.damage)} mining damage.`;
    }
  }

  function showAutomation(result) {
    if (!(result.depositsBroken > 0)) return;
    const rewards = Object.entries(result.resources)
      .map(([resourceId, quantity]) => `${formatNumber(quantity)} ${config.resourcesById[resourceId]?.name || resourceId}`)
      .join(', ');
    spawnFloat(`AUTO +${formatNumber(Object.values(result.resources).reduce((sum, value) => sum + value, 0))}`, 'ore');
    const eventStarted = result.breaks.find((entry) => entry.eventStarted)?.eventStarted;
    if (eventStarted) spawnFloat(eventStarted.name.toUpperCase(), 'event');
    nodes.last_result.textContent = `Your operation broke ${formatNumber(result.depositsBroken)} deposit${result.depositsBroken === 1 ? '' : 's'} and recovered ${rewards}. Manual mining remains the source of character XP.${eventStarted ? ` ${eventStarted.name} has begun.` : ''}`;
  }

  function advanceStory() {
    if (activeStory || storyQueue.length < 1) return;
    activeStory = storyQueue.shift();
    nodes.story_speaker.textContent = activeStory.speaker;
    nodes.story_title.textContent = activeStory.title;
    nodes.story_text.textContent = activeStory.text;
    storyPausedForOffline = !nodes.offline_overlay.hidden;
    nodes.story_overlay.hidden = storyPausedForOffline;
    if (!storyPausedForOffline) nodes.story_continue.focus();
  }

  function showMilestone(milestone) {
    storyQueue.push(milestone);
    advanceStory();
  }

  function showLotteryResult(result) {
    lastLotteryResult = result;
    nodes.store_status.textContent = result.value > 0
      ? `${result.label} revealed. Prize value: ${formatCurrency(result.value)}.`
      : `${result.label} revealed. Mining remains the reliable way forward.`;
  }

  function showOfflineProgress(result) {
    if (!result?.showSummary) return false;
    storyPausedForOffline = Boolean(activeStory);
    if (storyPausedForOffline) nodes.story_overlay.hidden = true;
    nodes.offline_time_away.textContent = formatDuration(result.timeAwaySeconds);
    nodes.offline_time_credited.textContent = formatDuration(result.creditedSeconds);
    nodes.offline_production.textContent = `${formatNumber(result.depositsBroken)} deposit${result.depositsBroken === 1 ? '' : 's'} · ${formatNumber(result.damage)} mining damage`;
    nodes.offline_resources.replaceChildren();
    const produced = Object.entries(result.resources).filter(([, quantity]) => quantity > 0);
    if (produced.length) {
      produced.forEach(([resourceId, quantity]) => {
        const resource = config.resourcesById[resourceId];
        const row = document.createElement('div');
        const label = document.createElement('span');
        label.textContent = resource?.name || resourceId;
        const amount = document.createElement('strong');
        amount.textContent = `+${formatNumber(quantity)}`;
        row.append(label, amount);
        nodes.offline_resources.appendChild(row);
      });
    } else {
      const empty = document.createElement('p');
      empty.textContent = 'Your crew weakened the current deposit but did not finish one yet.';
      nodes.offline_resources.appendChild(empty);
    }
    nodes.offline_value.textContent = formatCurrency(result.estimatedValue);
    const notes = ['Offline automation uses the same active mine and deposit rewards as live company production. Timed mining events do not boost offline rewards.'];
    if (result.capped) {
      notes.push(`This return was capped at ${formatDuration(result.capSeconds)} of production.`);
    }
    if (result.limited) {
      notes.push('The package simulation safety limit was reached; only completed simulation time was credited.');
    }
    if (result.eventExpired) {
      notes.push(`${result.eventExpired.name} expired while you were away and did not boost offline rewards.`);
    }
    nodes.offline_note.textContent = notes.join(' ');
    nodes.offline_overlay.hidden = false;
    nodes.offline_continue.focus();
    return true;
  }

  function dismissOfflineProgress() {
    nodes.offline_overlay.hidden = true;
    if (storyPausedForOffline && activeStory) {
      nodes.story_overlay.hidden = false;
      nodes.story_continue.focus();
    } else {
      nodes.mining_target.focus();
    }
    storyPausedForOffline = false;
  }

  function dismissStory() {
    activeStory = null;
    storyPausedForOffline = false;
    nodes.story_overlay.hidden = true;
    advanceStory();
  }

  function resetStoryQueue() {
    storyQueue.length = 0;
    activeStory = null;
    storyPausedForOffline = false;
    nodes.story_overlay.hidden = true;
    nodes.offline_overlay.hidden = true;
    lastLotteryResult = null;
    nodes.company_name.value = '';
    nodes.store_status.textContent = 'Miller keeps the counter open from your first shift onward.';
    nodes.equipment_status.textContent = 'Purchase equipment at Miller\'s, then switch owned gear here.';
    nodes.mines_status.textContent = 'Your current shaft remains active until you enter another unlocked mine.';
    nodes.company_status.textContent = 'Build your own operation after leaving Blackstone.';
  }

  return {
    nodes,
    render,
    renderCompany,
    renderTick,
    setSaveStatus,
    setView,
    showImpact,
    showAutomation,
    showMilestone,
    showLotteryResult,
    showOfflineProgress,
    dismissOfflineProgress,
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
    if (event.type === 'automation') ui.showAutomation(event.detail);
    if (event.type === 'milestone') ui.showMilestone(event.detail);
    if (event.type === 'lottery') ui.showLotteryResult(event.detail);
    if (event.type === 'offline-progress') ui.showOfflineProgress(event.detail);
    if (event.type === 'save') {
      ui.setSaveStatus(event.detail.saved ? 'Saved locally' : 'Local save failed', !event.detail.saved);
    }
    ui.render(game);
  });

  const action = new URL(window.location.href).searchParams.get('action');
  const startResult = game.start({ forceNew: action === 'new' });
  clearRequestedAction();
  ui.setSaveStatus(startResult.source === 'save' ? 'Local save loaded' : 'New local save created');
  ui.setView('mine');
  ui.render(game);
  ui.showOfflineProgress(startResult.offlineProgress);

  ui.nodes.mining_target.addEventListener('click', () => game.mine());
  const tabDefinitions = [
    [ui.nodes.tab_mine, 'mine'],
    [ui.nodes.tab_store, 'store'],
    [ui.nodes.tab_equipment, 'equipment'],
    [ui.nodes.tab_mines, 'mines'],
    [ui.nodes.tab_company, 'company'],
    [ui.nodes.tab_skills, 'skills'],
  ];
  tabDefinitions.forEach(([tab, view]) => tab.addEventListener('click', () => ui.setView(view)));
  tabDefinitions.forEach(([tab], index) => {
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabDefinitions.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabDefinitions.length) % tabDefinitions.length;
      ui.setView(tabDefinitions[nextIndex][1]);
      tabDefinitions[nextIndex][0].focus();
    });
  });
  ui.nodes.open_skills.addEventListener('click', () => ui.setView('skills'));
  ui.nodes.open_mines.addEventListener('click', () => ui.setView('mines'));
  ui.nodes.open_store.addEventListener('click', () => ui.setView('store'));
  ui.nodes.open_company.addEventListener('click', () => ui.setView('company'));
  ui.nodes.story_continue.addEventListener('click', () => ui.dismissStory());
  ui.nodes.story_overlay.addEventListener('click', (event) => {
    if (event.target === ui.nodes.story_overlay) ui.dismissStory();
  });
  ui.nodes.offline_continue.addEventListener('click', () => ui.dismissOfflineProgress());
  ui.nodes.offline_overlay.addEventListener('click', (event) => {
    if (event.target === ui.nodes.offline_overlay) ui.dismissOfflineProgress();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !ui.nodes.offline_overlay.hidden) {
      ui.dismissOfflineProgress();
      return;
    }
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

  ui.nodes.resources.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-sell-resource-id]');
    if (!button) return;
    const quantity = button.dataset.sellQuantity === 'all'
      ? 'all'
      : Number(button.dataset.sellQuantity);
    const result = game.sellResource(button.dataset.sellResourceId, quantity);
    ui.nodes.last_result.textContent = result.ok
      ? `Sold ${formatNumber(result.quantity)} ${database.config.resourcesById[result.resourceId].name} for ${formatCurrency(result.proceeds)}.`
      : 'That ore sale could not be completed.';
    ui.render(game);
  });

  ui.nodes.store_categories.addEventListener('click', (event) => {
    const equipmentButton = event.target.closest('button[data-buy-equipment-id]');
    if (equipmentButton) {
      const result = game.purchaseEquipment(equipmentButton.dataset.buyEquipmentId);
      const item = database.config.equipment.itemsById[equipmentButton.dataset.buyEquipmentId];
      ui.nodes.store_status.textContent = result.ok
        ? `${item.name} purchased and equipped for ${formatCurrency(result.cost)}.`
        : result.reason === 'insufficient-cash'
          ? `You need ${formatCurrency(result.cost)} to buy ${item.name}.`
          : result.reason === 'missing-prerequisite'
            ? `Buy ${database.config.equipment.itemsById[result.requiredItemId].name} first.`
            : `${item.name} is already owned.`;
      ui.render(game);
      return;
    }

    const buyTicketButton = event.target.closest('button[data-buy-ticket-id]');
    if (buyTicketButton) {
      const result = game.buyScratchTicket(buyTicketButton.dataset.buyTicketId);
      const ticket = database.config.lottery.scratchTicketsById[buyTicketButton.dataset.buyTicketId];
      ui.nodes.store_status.textContent = result.ok
        ? `${ticket.name} purchased. Scratch the covered ticket to reveal its prize.`
        : `You need ${formatCurrency(result.cost)} to buy that ticket.`;
      ui.render(game);
      return;
    }

    const scratchButton = event.target.closest('button[data-scratch-ticket-id]');
    if (!scratchButton) return;
    game.scratchTicket(scratchButton.dataset.scratchTicketId);
    ui.render(game);
  });

  ui.nodes.owned_equipment.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-equip-item-id]');
    if (!button) return;
    const result = game.equipItem(button.dataset.equipItemId);
    const item = database.config.equipment.itemsById[button.dataset.equipItemId];
    ui.nodes.equipment_status.textContent = result.ok
      ? `${item.name} equipped in the ${database.config.equipment.slotsById[result.slotId].name} slot.`
      : `${item.name} is already equipped.`;
    ui.render(game);
  });

  ui.nodes.mines_grid.addEventListener('click', (event) => {
    const unlockButton = event.target.closest('button[data-unlock-mine-id]');
    if (unlockButton) {
      const result = game.unlockMine(unlockButton.dataset.unlockMineId);
      const mine = database.config.minesById[unlockButton.dataset.unlockMineId];
      ui.nodes.mines_status.textContent = result.ok && result.unlocked
        ? `${mine.name} unlocked for ${formatCurrency(result.cost)}. Enter it when you are ready to replace the active deposit.`
        : 'That mine still has unmet progression requirements.';
      ui.render(game);
      return;
    }
    const selectButton = event.target.closest('button[data-select-mine-id]');
    if (!selectButton) return;
    const result = game.selectMine(selectButton.dataset.selectMineId);
    const mine = database.config.minesById[selectButton.dataset.selectMineId];
    ui.nodes.mines_status.textContent = result.ok
      ? `${mine.name} is now active.${result.eventEnded ? ' The previous mine event ended when you changed locations.' : ''}`
      : 'That mine must be unlocked before you can enter it.';
    if (result.ok) ui.setView('mine');
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

  ui.nodes.company_name.addEventListener('input', () => ui.renderCompany(game));
  ui.nodes.company_form.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = game.createCompany(ui.nodes.company_name.value);
    ui.nodes.company_status.textContent = result.ok
      ? `${result.name} registered for ${formatCurrency(result.cost)}. Company automation is now available.`
      : result.reason === 'invalid-name'
        ? `Use a company name between ${result.minimumNameLength} and ${result.maximumNameLength} characters.`
        : result.reason === 'level-required'
          ? `Reach character level ${result.requiredLevel} before registering a company.`
          : result.reason === 'insufficient-cash'
            ? `You need ${formatCurrency(result.cost)} to register the company.`
            : 'Buy out your employment contract before registering a company.';
    ui.render(game);
  });

  ui.nodes.generator_grid.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-buy-generator-id]');
    if (!button) return;
    const result = game.purchaseGenerator(button.dataset.buyGeneratorId);
    const generator = database.config.generatorsById[button.dataset.buyGeneratorId];
    ui.nodes.company_status.textContent = result.ok
      ? `${generator.name} purchased for ${formatCurrency(result.cost)}. Total automated power: ${formatNumber(result.automation.totalPower)}/sec.`
      : result.reason === 'insufficient-cash'
        ? `You need ${formatCurrency(result.cost)} to purchase ${generator.name}.`
        : businessRequirementTextForResult(result, database.config);
    ui.render(game);
  });

  ui.nodes.business_upgrade_grid.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-buy-business-upgrade-id]');
    if (!button) return;
    const result = game.purchaseBusinessUpgrade(button.dataset.buyBusinessUpgradeId);
    const upgrade = database.config.businessUpgradesById[button.dataset.buyBusinessUpgradeId];
    ui.nodes.company_status.textContent = result.ok
      ? `${upgrade.name} advanced to rank ${result.rank}. Automated power is now ${formatNumber(result.automation.totalPower)}/sec.`
      : result.reason === 'insufficient-cash'
        ? `You need ${formatCurrency(result.cost)} to upgrade ${upgrade.name}.`
        : result.reason === 'max-rank'
          ? `${upgrade.name} is already at maximum rank.`
          : businessRequirementTextForResult(result, database.config);
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
  let lastAutomationRender = 0;
  function loop(now) {
    if (document.visibilityState === 'hidden') {
      lastFrame = now;
      window.requestAnimationFrame(loop);
      return;
    }
    const result = game.update(Math.min(1, (now - lastFrame) / 1000));
    if ((result?.automation?.damage > 0 || game.state.activeMiningEvent) && now - lastAutomationRender >= 100) {
      ui.renderTick(game);
      lastAutomationRender = now;
    }
    lastFrame = now;
    window.requestAnimationFrame(loop);
  }
  window.requestAnimationFrame(loop);

  window.addEventListener('pagehide', () => game.saveCheckpoint('pagehide'));
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    lastFrame = performance.now();
    game.processOfflineProgress();
    ui.render(game);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      game.saveCheckpoint('visibility');
      return;
    }
    lastFrame = performance.now();
    game.processOfflineProgress();
    ui.render(game);
  });
}

await bootstrap();
