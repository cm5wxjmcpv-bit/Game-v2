export function gainXp(player, amount) {
  player.stats.xp += amount;
  // Hook for future full level-up trees/skill points.
}

export function applyGrowthOnLevel(player) {
  player.stats.level += 1;
  player.stats.maxHp += player.growth.maxHp;
  player.stats.attack += player.growth.attack;
  player.stats.defense += player.growth.defense;
  player.stats.agility += player.growth.agility;
  player.stats.hp = player.stats.maxHp;
}

export function spendableStatHook(_player, _allocation) {
  // Reserved for player-selected stat spending.
}
