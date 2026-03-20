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
    }
  },
  slow: (game, effect) => {
    game.player.speedModifier = Math.min(game.player.speedModifier, effect.multiplier);
  },
};

export function applyTileEffect(game, tileDef) {
  game.player.speedModifier = 1;
  if (!tileDef?.effect) return;
  const effect = game.db.tileEffects[tileDef.effect];
  if (!effect) return;
  handlers[effect.type]?.(game, effect);
}
