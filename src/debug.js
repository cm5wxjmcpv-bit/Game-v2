export class DebugSystem {
  constructor() {
    this.enabled = false;
  }

  toggle() {
    this.enabled = !this.enabled;
  }
}

export function debugText(game) {
  return [
    `state=${game.state.current}`,
    `map=${game.currentMap?.id ?? 'none'}`,
    `player=(${game.player.x.toFixed(2)},${game.player.y.toFixed(2)}) hp=${game.player.stats.hp}/${game.player.stats.maxHp}`,
    `enemies=${game.currentEnemies.filter((e) => !e.dead).length}`,
  ];
}
