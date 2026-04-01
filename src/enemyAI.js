import { distance } from './collision.js';
import { enemyAttackPlayer } from './combat.js';

function moveTowards(entity, target, speed, dt) {
  const dx = target.x - entity.x;
  const dy = target.y - entity.y;
  const len = Math.hypot(dx, dy) || 1;
  entity.x += (dx / len) * speed * dt;
  entity.y += (dy / len) * speed * dt;
}

export function updateEnemies(game, dt, now) {
  for (const enemy of game.currentEnemies) {
    if (enemy.dead) continue;
    const d = distance(enemy, game.player);
    const ai = enemy.template.ai;

    if (d <= ai.aggroRange) enemy.aggroTarget = game.player;
    if (distance(enemy, { x: enemy.spawnX, y: enemy.spawnY }) > ai.leashRange) enemy.aggroTarget = null;

    switch (ai.behavior) {
      case 'charger':
      case 'guard':
      case 'tank':
        if (enemy.aggroTarget) moveTowards(enemy, game.player, ai.speed, dt);
        break;
      case 'runner':
        if (enemy.aggroTarget && d < 2.2) moveTowards(enemy, { x: enemy.spawnX, y: enemy.spawnY }, ai.speed, dt);
        else if (enemy.aggroTarget) moveTowards(enemy, game.player, ai.speed, dt);
        break;
      case 'wanderer':
      case 'swarm':
      case 'ranged':
      default: {
        const angle = now + enemy.spawnX * 5;
        enemy.x = enemy.spawnX + Math.cos(angle) * Math.min(ai.patrolRange, 0.6);
        enemy.y = enemy.spawnY + Math.sin(angle) * Math.min(ai.patrolRange, 0.6);
        if (enemy.aggroTarget && d > 1.8) moveTowards(enemy, game.player, ai.speed, dt);
      }
    }

    enemyAttackPlayer(game, enemy, now);
  }
}
