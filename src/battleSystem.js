import { getEquippedWeapon } from './combat.js';
import { getStatBlock } from './equipment.js';
import {
  calculateWeaponDamage,
  canPayAttackCost,
  getWeaponAttack,
  payAttackCost,
} from './weaponSystem.js';
import { mergeRewardPackages, rollEnemyReward } from './rewardSystem.js';
import { GAME_STATES } from './stateManager.js';

function cloneEncounterEnemies(encounter, enemiesById) {
  const battleEnemies = [];
  for (const enemyId of encounter.enemies || []) {
    const template = enemiesById[enemyId];
    if (!template) {
      console.warn(`[BattleSystem] Encounter "${encounter.id}" references missing enemy "${enemyId}".`);
      continue;
    }
    battleEnemies.push({
      id: `${template.id}_battle_${(globalThis.crypto?.randomUUID?.() || Math.random().toString(36)).slice(0, 6)}`,
      template,
      hp: template.stats.maxHp,
      dead: false,
      effects: [],
      rewardRolled: false,
    });
  }
  return battleEnemies;
}

function actionLabel(weapon, attackType) {
  if (attackType === 'special') {
    const special = getWeaponAttack(weapon, 'special');
    return special ? `Special: ${special.preset}` : 'Special unavailable';
  }
  return `${weapon?.name || 'Unarmed'} attack`;
}

function battleTargets(enemies, attack) {
  const alive = enemies.filter((enemy) => !enemy.dead);
  if (attack.targeting === 'self') return [];
  if (attack.targeting === 'area') return alive;
  if (attack.targeting === 'multi') return alive.slice(0, attack.maxTargets || 3);
  return alive.slice(0, 1);
}

function addBattleStatus(target, attack) {
  const status = attack.status || {};
  target.effects.push({
    type: status.type || 'burn',
    value: Number(status.value) || -1,
    turns: Math.max(1, Math.ceil(Number(status.duration) || 2)),
    control: ['freeze', 'stun'].includes(status.type) ? status.type : null,
  });
}

function applyBattleSupport(player, attack) {
  const support = attack.support || {};
  if (support.type === 'heal') {
    const amount = Math.max(0, Number(support.value) || 0);
    player.stats.hp = Math.min(player.stats.maxHp, player.stats.hp + amount);
    return `Restored ${amount} HP.`;
  }
  player.effects.push({
    type: support.type,
    stat: support.type === 'shield' ? 'defense' : support.type,
    value: Number(support.value) || 0,
    remaining: Math.max(1, Number(support.duration) || 3),
  });
  return `${support.type || 'Stat'} boost applied.`;
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

    const weapon = getEquippedWeapon(this.game);
    this.activeBattle = {
      encounterId: encounter.id,
      triggerId: context.triggerId,
      triggerOnce: context.triggerOnce,
      mapId: context.mapId,
      sourceType: context.sourceType,
      background: encounter.background || 'default',
      state: 'player_turn',
      turnMessage: 'Your turn. Choose Standard or Special, then press E.',
      enemies,
      selectedActionIndex: 0,
      actionLabels: [actionLabel(weapon, 'normal'), actionLabel(weapon, 'special')],
      rewardPackages: [],
      enemyTurnIndex: 0,
      enemyTurnTimer: 0.2,
      turnCooldowns: { special: 0, reload: 0 },
      turnNumber: 1,
      resolving: false,
    };
    this.game.markCombatActive();
    return true;
  }

  update() {
    const battle = this.activeBattle;
    if (!battle || battle.resolving) return;

    if (battle.state === 'player_turn') {
      this.handlePlayerTurnInput(battle);
      return;
    }
    if (battle.state === 'enemy_turn') this.runEnemyTurnStep();
  }

  handlePlayerTurnInput(battle) {
    if (this.game.input.justPressed.has('Digit1')) battle.selectedActionIndex = 0;
    if (this.game.input.justPressed.has('Digit2')) battle.selectedActionIndex = 1;
    if (!this.game.input.wasActionPressed('interact')) return;

    const attackType = battle.selectedActionIndex === 1 ? 'special' : 'normal';
    const weapon = getEquippedWeapon(this.game);
    const attack = weapon ? getWeaponAttack(weapon, attackType) : null;
    if (!attack) {
      battle.turnMessage = attackType === 'special'
        ? 'This weapon does not have a special attack.'
        : 'No standard attack is available.';
      return;
    }
    if (attackType === 'special' && battle.turnCooldowns.special > 0) {
      battle.turnMessage = `Special attack is ready in ${battle.turnCooldowns.special} turn(s).`;
      return;
    }
    if (attackType === 'normal' && battle.turnCooldowns.reload > 0) {
      battle.turnMessage = `Reloading: ${battle.turnCooldowns.reload} turn(s) remaining.`;
      return;
    }
    const affordable = canPayAttackCost(this.game.player, attack);
    if (!affordable.ok) {
      battle.turnMessage = affordable.reason;
      return;
    }
    payAttackCost(this.game.player, attack);

    const messages = [];
    if (attack.targeting === 'self') {
      messages.push(applyBattleSupport(this.game.player, attack));
    } else {
      const targets = battleTargets(battle.enemies, attack);
      if (!targets.length) {
        this.finishBattle('victory');
        return;
      }
      for (const target of targets) {
        let totalDamage = 0;
        for (let hit = 0; hit < (attack.hitCount || 1) && !target.dead; hit += 1) {
          const stats = getStatBlock(this.game.player, this.game.db.itemsById);
          const damage = calculateWeaponDamage({
            player: { ...this.game.player, stats: { ...this.game.player.stats, ...stats } },
            item: weapon,
            attack,
            target,
            settings: this.game.db.settings,
          });
          target.hp -= damage;
          totalDamage += damage;
          if (target.hp <= 0) this.defeatEnemy(target, battle);
        }
        if (attackType === 'special' && attack.preset === 'status' && !target.dead) addBattleStatus(target, attack);
        messages.push(`${target.template.name}: ${totalDamage} damage${target.dead ? ' (defeated)' : ''}.`);
      }
    }

    if (attackType === 'special') {
      battle.turnCooldowns.special = Math.max(0, Math.ceil(attack.cooldown));
    } else if (attack.requiresReload) {
      battle.turnCooldowns.reload = Math.max(1, Math.ceil(attack.reloadTime));
    }
    battle.turnMessage = messages.join(' ');
    this.game.markCombatActive();

    if (battle.enemies.every((enemy) => enemy.dead)) {
      this.finishBattle('victory');
      return;
    }
    battle.state = 'enemy_turn';
    battle.enemyTurnIndex = 0;
    battle.enemyTurnTimer = 0.2;
    battle.turnMessage += ' Enemy turn...';
  }

  defeatEnemy(enemy, battle) {
    if (enemy.dead) return;
    enemy.hp = 0;
    enemy.dead = true;
    if (!enemy.rewardRolled) {
      battle.rewardPackages.push(rollEnemyReward(enemy.template, this.game.db.lootTablesById));
      enemy.rewardRolled = true;
    }
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
      this.beginPlayerTurn(battle);
      return;
    }

    const enemy = battle.enemies[battle.enemyTurnIndex];
    const controlled = enemy.effects.some((effect) => effect.control && effect.turns > 0);
    if (controlled) {
      battle.turnMessage = `${enemy.template.name} is ${enemy.effects.find((effect) => effect.control)?.type} and loses its turn.`;
    } else {
      const stats = getStatBlock(this.game.player, this.game.db.itemsById);
      const temporaryDefense = (this.game.player.effects || [])
        .filter((effect) => effect.stat === 'defense')
        .reduce((sum, effect) => sum + (Number(effect.value) || 0), 0);
      const damage = Math.max(1, enemy.template.combat.attack - stats.defense - temporaryDefense);
      this.game.player.stats.hp -= damage;
      battle.turnMessage = `${enemy.template.name} hits you for ${damage}.`;
    }
    battle.enemyTurnIndex += 1;
    battle.enemyTurnTimer = 0.35;
    this.game.markCombatActive();

    if (this.game.player.stats.hp <= 0) {
      this.game.player.stats.hp = 0;
      this.finishBattle('defeat');
    }
  }

  beginPlayerTurn(battle) {
    battle.turnNumber += 1;
    battle.turnCooldowns.special = Math.max(0, battle.turnCooldowns.special - 1);
    battle.turnCooldowns.reload = Math.max(0, battle.turnCooldowns.reload - 1);

    for (const enemy of battle.enemies) {
      if (enemy.dead) continue;
      for (const effect of enemy.effects) {
        if (['burn', 'poison'].includes(effect.type)) enemy.hp += Number(effect.value) || -1;
        effect.turns -= 1;
      }
      enemy.effects = enemy.effects.filter((effect) => effect.turns > 0);
      if (enemy.hp <= 0) this.defeatEnemy(enemy, battle);
    }
    if (battle.enemies.every((enemy) => enemy.dead)) {
      this.finishBattle('victory');
      return;
    }

    battle.state = 'player_turn';
    battle.turnMessage = 'Your turn. Choose Standard or Special, then press E.';
  }

  finishBattle(result) {
    const battle = this.activeBattle;
    if (!battle || battle.resolving) return;
    battle.resolving = true;

    if (result !== 'victory') {
      this.activeBattle = null;
      this.game.onBattleEnded(result, battle.sourceType);
      this.game.onPlayerDefeated();
      return;
    }

    if (battle.triggerOnce && battle.triggerId) {
      const key = `${battle.mapId}:${battle.triggerId}`;
      if (!this.game.player.completedBattleTriggers.includes(key)) {
        this.game.player.completedBattleTriggers.push(key);
      }
    }

    const rewards = mergeRewardPackages(
      battle.rewardPackages,
      `${battle.encounterId}_rewards`,
      `${battle.encounterId} Rewards`,
    );
    battle.state = 'rewards';
    battle.turnMessage = 'Battle won. Review the rewards.';
    this.game.presentBattleRewards(rewards, () => this.finalizeVictory(battle));
  }

  finalizeVictory(battle) {
    if (this.activeBattle !== battle) return;
    this.activeBattle = null;
    this.game.state.set(this.game.getCurrentSceneState());
    this.game.onBattleEnded('victory', battle.sourceType);
    this.game.saveCheckpoint();

    if (battle.sourceType === 'manual' && this.game.isAdventureScene()) {
      const required = (this.game.currentMap.objects.battleTriggers || []).filter((trigger) => trigger.once);
      const allComplete = required.length > 0 && required.every((trigger) =>
        this.game.hasCompletedBattleTrigger(this.game.currentMap.id, trigger.id)
      );
      if (allComplete) this.game.completeCurrentScene();
    }
  }
}
