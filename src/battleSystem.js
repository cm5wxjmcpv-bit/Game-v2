import { rollDrops } from './drops.js';
import { GAME_STATES } from './stateManager.js';

const ATTACK_OPTIONS = [
  { id: 'light', label: '1 Light', accuracy: 1, power: 0.85, bonus: 0 },
  { id: 'heavy', label: '2 Heavy', accuracy: 0.7, power: 1.45, bonus: 0 },
  { id: 'magic', label: '3 Magic', accuracy: 0.9, power: 1.15, bonus: 4 },
];

function cloneEncounterEnemies(encounter, enemiesById) {
  const battleEnemies = [];
  for (const enemyId of encounter.enemies || []) {
    const template = enemiesById[enemyId];
    if (!template) {
      console.warn(`[BattleSystem] Encounter "${encounter.id}" references missing enemy "${enemyId}".`);
      continue;
    }
    battleEnemies.push({
      id: `${template.id}_battle_${crypto.randomUUID().slice(0, 6)}`,
      template,
      hp: template.stats.maxHp,
      dead: false,
    });
  }
  return battleEnemies;
}

export class BattleSystem {
  constructor(game) {
    this.game = game;
    this.activeBattle = null;
  }

  startFromTrigger(trigger) {
    return this.startEncounter(trigger.encounterId, {
      triggerId: trigger.id,
      triggerOnce: Boolean(trigger.once),
      mapId: this.game.currentMap.id,
      sourceType: 'manual',
    });
  }

  startRandomEncounter(encounterId) {
    return this.startEncounter(encounterId, {
      triggerId: null,
      triggerOnce: false,
      mapId: this.game.currentMap.id,
      sourceType: 'random',
    });
  }

  startEncounter(encounterId, context) {
    const encounter = this.game.db.encountersById[encounterId];
    if (!encounter) {
      this.game.ui.flash(`Encounter not found: ${encounterId}`);
      return false;
    }

    const enemies = cloneEncounterEnemies(encounter, this.game.db.enemiesById);
    if (!enemies.length) {
      this.game.ui.flash(`Encounter has no valid enemies: ${encounter.id}`);
      return false;
    }

    this.activeBattle = {
      encounterId: encounter.id,
      triggerId: context.triggerId,
      triggerOnce: context.triggerOnce,
      mapId: context.mapId,
      sourceType: context.sourceType,
      background: encounter.background || 'default',
      state: 'player_turn',
      turnMessage: 'Your turn. Choose attack (1/2/3), then press E.',
      enemies,
      selectedActionIndex: 0,
      rewardGold: 0,
      rewardDrops: [],
      enemyTurnIndex: 0,
      enemyTurnTimer: 0.2,
    };

    return true;
  }

  update() {
    const battle = this.activeBattle;
    if (!battle) return;

    if (battle.state === 'player_turn') {
      this.handlePlayerTurnInput(battle);
      return;
    }

    if (battle.state === 'enemy_turn') {
      this.runEnemyTurnStep();
    }
  }

  handlePlayerTurnInput(battle) {
    if (this.game.input.justPressed.has('Digit1')) battle.selectedActionIndex = 0;
    if (this.game.input.justPressed.has('Digit2')) battle.selectedActionIndex = 1;
    if (this.game.input.justPressed.has('Digit3')) battle.selectedActionIndex = 2;

    if (!this.game.input.wasActionPressed('interact')) return;

    const action = ATTACK_OPTIONS[battle.selectedActionIndex] || ATTACK_OPTIONS[0];
    const target = battle.enemies.find((enemy) => !enemy.dead);
    if (!target) {
      this.finishBattle('victory');
      return;
    }

    if (Math.random() > action.accuracy) {
      battle.turnMessage = `${action.label} missed ${target.template.name}.`;
    } else {
      const baseAttack = this.game.player.stats.attack;
      const scaled = Math.floor(baseAttack * action.power) + action.bonus;
      const damage = Math.max(1, scaled - target.template.stats.defense);
      target.hp -= damage;
      battle.turnMessage = `${action.label} hit ${target.template.name} for ${damage}.`;

      if (target.hp <= 0) {
        target.dead = true;
        const reward = rollDrops(target.template, this.game.player, this.game.db.itemsById);
        battle.rewardGold += reward.gold;
        if (reward.drops.length) battle.rewardDrops.push(...reward.drops);
        battle.turnMessage = `${target.template.name} is defeated by ${action.label}.`;
      }
    }

    if (battle.enemies.every((enemy) => enemy.dead)) {
      this.finishBattle('victory');
      return;
    }

    battle.state = 'enemy_turn';
    battle.enemyTurnIndex = 0;
    battle.enemyTurnTimer = 0.2;
    battle.turnMessage += ' Enemy turn...';
  }

  runEnemyTurnStep() {
    const battle = this.activeBattle;
    if (!battle) return;

    battle.enemyTurnTimer -= this.game.dt;
    if (battle.enemyTurnTimer > 0) return;

    while (battle.enemyTurnIndex < battle.enemies.length && battle.enemies[battle.enemyTurnIndex].dead) {
      battle.enemyTurnIndex += 1;
    }

    if (battle.enemyTurnIndex >= battle.enemies.length) {
      battle.state = 'player_turn';
      battle.turnMessage = 'Your turn. Choose attack (1/2/3), then press E.';
      return;
    }

    const enemy = battle.enemies[battle.enemyTurnIndex];
    const damage = Math.max(1, enemy.template.combat.attack - this.game.player.stats.defense);
    this.game.player.stats.hp -= damage;
    battle.turnMessage = `${enemy.template.name} hits you for ${damage}.`;
    battle.enemyTurnIndex += 1;
    battle.enemyTurnTimer = 0.35;

    if (this.game.player.stats.hp <= 0) {
      this.game.player.stats.hp = 0;
      this.finishBattle('defeat');
      return;
    }
  }

  finishBattle(result) {
    const battle = this.activeBattle;
    if (!battle) return;

    if (result === 'victory') {
      if (battle.triggerOnce && battle.triggerId) {
        const key = `${battle.mapId}:${battle.triggerId}`;
        if (!this.game.player.completedBattleTriggers.includes(key)) {
          this.game.player.completedBattleTriggers.push(key);
        }
      }

      const dropsText = battle.rewardDrops.length ? `, Drops: ${battle.rewardDrops.join(', ')}` : '';
      this.game.ui.flash(`Battle won! +${battle.rewardGold} gold${dropsText}`);
      this.game.saveCheckpoint();
      this.game.state.set(GAME_STATES.LEVEL);
    } else {
      this.game.onPlayerDefeated();
    }

    this.game.onBattleEnded(result, battle.sourceType);
    this.activeBattle = null;
  }
}
