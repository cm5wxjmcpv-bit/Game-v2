export function addEffect(entity, effect) {
  entity.effects.push({ ...effect });
}

export function updateStatusEffects(entity, dt) {
  entity.effects = entity.effects.filter((fx) => {
    fx.remaining -= dt;
    if (fx.tickEvery) {
      fx._tick = (fx._tick || 0) - dt;
      if (fx._tick <= 0) {
        fx._tick = fx.tickEvery;
        if (fx.stat === 'hp') entity.stats ? (entity.stats.hp += fx.value) : (entity.hp += fx.value);
      }
    }
    return fx.remaining > 0;
  });
}
