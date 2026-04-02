import { distance } from './collision.js';
import { getStatBlock } from './equipment.js';

export function updateAutoAttack(game, dt) {
  const { player, currentEnemies, db } = game;
  player.cooldowns.autoAttack -= dt;
  if (player.cooldowns.autoAttack > 0) return;

  const weapon = db.itemsById[player.equipment.weapon];
  const attackRange = weapon?.attackRange ?? 1.2;
  const target = currentEnemies.find((enemy) => !enemy.dead && distance(player, enemy) <= attackRange);
  if (!target) return;

  const stats = getStatBlock(player, db.itemsById);
  const damage = Math.max(1, stats.attack + (weapon?.power || 0) - target.template.stats.defense);
  target.hp -= damage;
  game.fx.hitMarkers.push({ x: target.x, y: target.y, text: `-${damage}`, ttl: 0.45 });
  player.cooldowns.autoAttack = (weapon?.cooldown ?? 0.8);

  if (target.hp <= 0) {
    target.dead = true;
    game.onEnemyDefeated(target);
  }
}

export function enemyAttackPlayer(game, enemy, now) {
  const range = enemy.template.combat.attackRange;
  if (distance(enemy, game.player) > range) return;
  if (now - enemy.lastAttackAt < enemy.template.combat.cooldown) return;

  const damage = Math.max(1, enemy.template.combat.attack - game.player.stats.defense);
  game.player.stats.hp -= damage;
  game.fx.hitMarkers.push({ x: game.player.x, y: game.player.y, text: `-${damage}`, ttl: 0.5 });
  enemy.lastAttackAt = now;

  if (game.player.stats.hp <= 0) game.onPlayerDefeated();
}
