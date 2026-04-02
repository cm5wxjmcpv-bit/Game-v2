import { addItemToBag } from './inventory.js';

export function rollDrops(enemyTemplate, player, itemsById) {
  const [minGold, maxGold] = enemyTemplate.dropTable.goldRange;
  const gold = Math.floor(Math.random() * (maxGold - minGold + 1)) + minGold;
  player.gold += gold;

  const drops = [];
  for (const guaranteed of enemyTemplate.dropTable.guaranteed) {
    addItemToBag(player, guaranteed.itemId, guaranteed.count, itemsById);
    drops.push(`${guaranteed.count}x ${guaranteed.itemId}`);
  }

  for (const rare of enemyTemplate.dropTable.rare) {
    if (Math.random() <= rare.chance) {
      addItemToBag(player, rare.itemId, rare.count, itemsById);
      drops.push(`${rare.count}x ${rare.itemId}`);
    }
  }

  return { gold, drops };
}
