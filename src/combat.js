import { distance } from './collision.js';
import { getStatBlock } from './equipment.js';
import { addEffect } from './statusEffects.js';
import {
  calculateWeaponDamage,
  canPayAttackCost,
  ensurePlayerWeaponState,
  getWeaponAttack,
  isWeaponItem,
  normalizeWeaponDefinition,
  payAttackCost,
} from './weaponSystem.js';

const FACING_VECTORS = Object.freeze({
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
});

function unarmedWeapon(player) {
  const configured = player.components?.combat?.unarmed || {};
  if (configured.enabled === false) return null;
  return normalizeWeaponDefinition({
    id: 'unarmed',
    name: configured.name || 'Unarmed',
    category: 'weapons',
    equipSlot: 'weapon',
    power: Number(configured.power) || 0,
    attackRange: Number(configured.range) || 1.1,
    cooldown: Number(configured.cooldown) || 0.85,
    weapon: {
      family: 'melee',
      subtype: 'sword',
      animationTemplate: configured.animationTemplate || 'unarmed-strike',
      damageType: configured.damageType || 'physical',
      normalAttack: {
        power: Number(configured.power) || 0,
        range: Number(configured.range) || 1.1,
        cooldown: Number(configured.cooldown) || 0.85,
        resource: { type: 'none', cost: 0 },
      },
      specialAttack: { enabled: false },
    },
  });
}

export function getEquippedWeapon(game) {
  const equipped = game.db.itemsById[game.player.equipment.weapon];
  return isWeaponItem(equipped) ? normalizeWeaponDefinition(equipped) : unarmedWeapon(game.player);
}

export function isInFacingDirection(player, target) {
  const facing = FACING_VECTORS[player.animation?.facing || player.facing] || FACING_VECTORS.down;
  const dx = target.x - player.x;
  const dy = target.y - player.y;
  const length = Math.hypot(dx, dy) || 1;
  return (dx / length) * facing.x + (dy / length) * facing.y >= -0.05;
}

export function findFacingTargets(player, enemies, range) {
  return (enemies || [])
    .filter((enemy) => !enemy.dead && distance(player, enemy) <= range && isInFacingDirection(player, enemy))
    .sort((a, b) => distance(player, a) - distance(player, b));
}

function selectedTargets(player, enemies, primaryTarget, attack) {
  if (attack.targeting === 'self') return [];
  const facing = findFacingTargets(player, enemies, attack.range);
  if (attack.targeting === 'multi') return facing.slice(0, attack.maxTargets || 3);
  if (attack.targeting === 'area') {
    return (enemies || []).filter((enemy) => !enemy.dead && distance(primaryTarget, enemy) <= (attack.radius || 1.5));
  }
  return primaryTarget ? [primaryTarget] : [];
}

function addWeaponFx(game, weapon, attack, attackType, target) {
  game.fx.weaponAttacks ||= [];
  game.fx.weaponAttacks.push({
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random()}`,
    fromX: game.player.x,
    fromY: game.player.y,
    toX: target?.x ?? game.player.x,
    toY: target?.y ?? game.player.y,
    weaponId: weapon.id,
    family: weapon.weapon.family,
    subtype: weapon.weapon.subtype,
    template: weapon.weapon.animationTemplate,
    art: weapon.weapon.art,
    attackType,
    duration: attack.projectileSpeed > 0 ? Math.max(0.15, distance(game.player, target || game.player) / attack.projectileSpeed) : 0.28,
    elapsed: 0,
  });
}

function applyStatusAttack(target, attack) {
  const status = attack.status || {};
  if (['burn', 'poison'].includes(status.type)) {
    addEffect(target, {
      type: status.type,
      stat: 'hp',
      value: Number(status.value) || -1,
      remaining: Number(status.duration) || 3,
      tickEvery: Math.max(0.1, Number(status.tickEvery) || 1),
    });
    return;
  }
  addEffect(target, {
    type: status.type,
    remaining: Number(status.duration) || 2,
    control: ['freeze', 'stun'].includes(status.type) ? status.type : null,
  });
}

function performSupportAttack(game, attack) {
  const support = attack.support || {};
  if (support.type === 'heal') {
    game.player.stats.hp = Math.min(game.player.stats.maxHp, game.player.stats.hp + Math.max(0, Number(support.value) || 0));
    game.fx.hitMarkers.push({ x: game.player.x, y: game.player.y, text: `+${Math.max(0, Number(support.value) || 0)}`, ttl: 0.7 });
    return;
  }
  addEffect(game.player, {
    type: support.type,
    stat: support.type === 'shield' ? 'defense' : support.type,
    value: Number(support.value) || 0,
    remaining: Math.max(0.1, Number(support.duration) || 3),
  });
}

function showResourceWarning(game, reason) {
  const now = game.timeSeconds || 0;
  if (game.lastWeaponWarning?.reason === reason && now - game.lastWeaponWarning.at < 1) return;
  game.lastWeaponWarning = { reason, at: now };
  game.ui.flash(reason);
}

export function damageEnemyWithWeapon(game, enemy, weapon, attack, hitCount = 1) {
  let total = 0;
  const stats = getStatBlock(game.player, game.db.itemsById);
  const damagePlayer = { ...game.player, stats: { ...game.player.stats, ...stats } };
  for (let hit = 0; hit < hitCount && !enemy.dead; hit += 1) {
    const damage = calculateWeaponDamage({
      player: damagePlayer,
      item: weapon,
      attack,
      target: enemy,
      settings: game.db.settings,
    });
    enemy.hp -= damage;
    total += damage;
    game.fx.hitMarkers.push({ x: enemy.x, y: enemy.y, text: `-${damage}`, ttl: 0.45 });
  }
  if (enemy.hp <= 0 && !enemy.dead) {
    enemy.hp = 0;
    enemy.dead = true;
    game.onEnemyDefeated(enemy);
  }
  return total;
}

export function tryUseWeaponAttack(game, attackType = 'normal') {
  const { player, currentEnemies } = game;
  ensurePlayerWeaponState(player, game.db.settings);
  const weapon = getEquippedWeapon(game);
  if (!weapon) {
    showResourceWarning(game, 'No weapon is equipped and unarmed attacks are disabled.');
    return false;
  }
  const attack = getWeaponAttack(weapon, attackType);
  if (!attack) {
    if (attackType === 'special') showResourceWarning(game, 'This weapon has no special attack.');
    return false;
  }
  if (attackType === 'normal' && (player.cooldowns.autoAttack > 0 || player.cooldowns.reload > 0)) return false;
  if (attackType === 'special' && player.cooldowns.specialAttack > 0) {
    showResourceWarning(game, `Special attack ready in ${player.cooldowns.specialAttack.toFixed(1)}s.`);
    return false;
  }

  const primaryTarget = attack.targeting === 'self'
    ? null
    : findFacingTargets(player, currentEnemies, attack.range)[0];
  if (!primaryTarget && attack.targeting !== 'self') {
    if (attackType === 'special') showResourceWarning(game, 'No enemy is in range in the facing direction.');
    return false;
  }
  const affordable = canPayAttackCost(player, attack);
  if (!affordable.ok) {
    showResourceWarning(game, affordable.reason);
    return false;
  }
  payAttackCost(player, attack);

  if (attack.targeting === 'self') performSupportAttack(game, attack);
  else {
    const targets = selectedTargets(player, currentEnemies, primaryTarget, attack);
    for (const target of targets) {
      damageEnemyWithWeapon(game, target, weapon, attack, attack.hitCount || 1);
      if (attackType === 'special' && attack.preset === 'status' && !target.dead) applyStatusAttack(target, attack);
    }
  }

  addWeaponFx(game, weapon, attack, attackType, primaryTarget);
  if (attackType === 'normal') {
    player.cooldowns.autoAttack = attack.cooldown;
    if (attack.requiresReload) player.cooldowns.reload = attack.reloadTime;
  } else {
    player.cooldowns.specialAttack = attack.cooldown;
  }
  game.markCombatActive?.();
  return true;
}

export function updateAutoAttack(game) {
  return tryUseWeaponAttack(game, 'normal');
}

export function tryUseSpecialAttack(game) {
  return tryUseWeaponAttack(game, 'special');
}

export function enemyAttackPlayer(game, enemy, now) {
  const range = enemy.template.combat.attackRange;
  if (distance(enemy, game.player) > range) return;
  if (now - enemy.lastAttackAt < enemy.template.combat.cooldown) return;
  if ((enemy.effects || []).some((effect) => effect.control === 'freeze' || effect.control === 'stun')) return;

  const stats = getStatBlock(game.player, game.db.itemsById);
  const temporaryDefense = (game.player.effects || [])
    .filter((effect) => effect.stat === 'defense')
    .reduce((sum, effect) => sum + (Number(effect.value) || 0), 0);
  const damage = Math.max(1, enemy.template.combat.attack - stats.defense - temporaryDefense);
  game.player.stats.hp -= damage;
  game.fx.hitMarkers.push({ x: game.player.x, y: game.player.y, text: `-${damage}`, ttl: 0.5 });
  enemy.lastAttackAt = now;
  game.markCombatActive?.();

  if (game.player.stats.hp <= 0) game.onPlayerDefeated();
}
