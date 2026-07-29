const handlers = {
  instantKill: (game) => {
    game.player.stats.hp = 0;
    game.onPlayerDefeated();
  },
  damageOverTime: (game, effect) => {
    game._dotTimer = (game._dotTimer || 0) + game.dt;
    if (game._dotTimer >= (effect.interval ?? 1)) {
      game.player.stats.hp -= effect.amount;
      game._dotTimer = 0;
      if (game.player.stats.hp <= 0) {
        game.player.stats.hp = 0;
        game.onPlayerDefeated();
      }
    }
  },
  slow: (game, effect) => {
    game.player.speedModifier = Math.min(game.player.speedModifier, effect.multiplier);
  },
};

export function applyTileEffect(game, tileDef) {
  game.player.speedModifier = 1;
  if (!tileDef?.effect) {
    game._dotTimer = 0;
    return;
  }
  const effect = game.db.tileEffects[tileDef.effect];
  if (!effect) {
    game._dotTimer = 0;
    return;
  }
  if (effect.type !== 'damageOverTime') game._dotTimer = 0;
  handlers[effect.type]?.(game, effect);
}
