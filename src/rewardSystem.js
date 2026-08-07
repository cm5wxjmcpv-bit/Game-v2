import { addItemToBagDetailed } from './inventory.js';

function finite(value, fallback = 0, minimum = null) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return minimum === null ? number : Math.max(minimum, number);
}

function cleanString(value, fallback = '') {
  const cleaned = String(value ?? '').trim();
  return cleaned || fallback;
}

export function normalizeReward(reward = {}) {
  const type = reward.type === 'currency' || reward.type === 'gold' ? 'currency' : 'item';
  if (type === 'currency') {
    return { type, currency: cleanString(reward.currency, 'gold'), amount: Math.floor(finite(reward.amount, 0, 0)) };
  }
  return {
    type,
    itemId: cleanString(reward.itemId),
    count: Math.max(1, Math.floor(finite(reward.count, 1, 1))),
  };
}

export function normalizeRewardPackage(rewardPackage = {}, fallbackId = 'reward') {
  return {
    ...rewardPackage,
    id: cleanString(rewardPackage.id, fallbackId),
    name: cleanString(rewardPackage.name, rewardPackage.id || fallbackId),
    rewards: Array.isArray(rewardPackage.rewards)
      ? rewardPackage.rewards.map(normalizeReward).filter((reward) => reward.type === 'currency' || reward.itemId)
      : [],
  };
}

export function normalizeLootTable(table = {}) {
  return {
    ...table,
    id: cleanString(table.id),
    name: cleanString(table.name, table.id),
    entries: Array.isArray(table.entries)
      ? table.entries.map((entry, index) => normalizeRewardPackage(entry, `${table.id || 'loot'}_${index + 1}`))
      : [],
  };
}

export function rollLootTable(table, random = Math.random) {
  const normalized = normalizeLootTable(table);
  if (!normalized.entries.length) return normalizeRewardPackage({ id: `${normalized.id}_empty`, name: 'No Reward', rewards: [] });
  const index = Math.min(normalized.entries.length - 1, Math.floor(Math.max(0, random()) * normalized.entries.length));
  return structuredClone(normalized.entries[index]);
}

function randomGold([minimum = 0, maximum = minimum] = [], random = Math.random) {
  const min = Math.floor(finite(minimum, 0, 0));
  const max = Math.max(min, Math.floor(finite(maximum, min, 0)));
  return min + Math.floor(Math.max(0, random()) * (max - min + 1));
}

export function legacyEnemyReward(enemyTemplate, random = Math.random) {
  const table = enemyTemplate?.dropTable || {};
  const rewards = [];
  const gold = randomGold(table.goldRange, random);
  if (gold) rewards.push({ type: 'currency', currency: 'gold', amount: gold });
  for (const entry of table.guaranteed || []) {
    if (entry?.itemId) rewards.push({ type: 'item', itemId: entry.itemId, count: entry.count || 1 });
  }
  for (const entry of table.rare || []) {
    if (entry?.itemId && random() <= finite(entry.chance, 0, 0)) {
      rewards.push({ type: 'item', itemId: entry.itemId, count: entry.count || 1 });
    }
  }
  return normalizeRewardPackage({
    id: `${enemyTemplate?.id || 'enemy'}_legacy_drop`,
    name: `${enemyTemplate?.name || 'Enemy'} Rewards`,
    rewards,
  });
}

export function rollEnemyReward(enemyTemplate, lootTablesById = {}, random = Math.random) {
  const table = lootTablesById[enemyTemplate?.lootTableId];
  return table ? rollLootTable(table, random) : legacyEnemyReward(enemyTemplate, random);
}

export function rewardPackageLabels(rewardPackage, itemsById = {}) {
  const normalized = normalizeRewardPackage(rewardPackage);
  if (!normalized.rewards.length) return ['No reward'];
  return normalized.rewards.map((reward) => {
    if (reward.type === 'currency') return `${reward.amount} ${reward.currency}`;
    return `${reward.count}× ${itemsById[reward.itemId]?.name || reward.itemId}`;
  });
}

export function grantRewardPackage(player, rewardPackage, itemsById = {}) {
  const normalized = normalizeRewardPackage(rewardPackage);
  const applied = [];
  const overflow = [];
  for (const reward of normalized.rewards) {
    if (reward.type === 'currency') {
      if (reward.currency === 'gold') player.gold += reward.amount;
      else {
        player.currencies = { ...(player.currencies || {}) };
        player.currencies[reward.currency] = finite(player.currencies[reward.currency], 0) + reward.amount;
      }
      applied.push(reward);
      continue;
    }
    const result = addItemToBagDetailed(player, reward.itemId, reward.count, itemsById);
    if (result.added > 0) applied.push({ ...reward, count: result.added });
    if (result.remaining > 0) overflow.push({ ...reward, count: result.remaining });
  }
  return { ok: overflow.length === 0, applied, overflow, package: normalized };
}

export function canFitRewardPackage(player, rewardPackage, itemsById = {}) {
  const clone = structuredClone(player);
  return grantRewardPackage(clone, rewardPackage, itemsById).ok;
}

export function mergeRewardPackages(packages = [], id = 'combined_rewards', name = 'Rewards') {
  return normalizeRewardPackage({
    id,
    name,
    rewards: packages.flatMap((entry) => normalizeRewardPackage(entry).rewards),
  });
}

export function completionRewardKey(type, id) {
  return `${cleanString(type, 'level')}:${cleanString(id)}`;
}

export function normalizeCompletionReward(schedule = {}) {
  const source = schedule.source && typeof schedule.source === 'object' ? schedule.source : {};
  const tiers = Array.isArray(schedule.tiers) ? schedule.tiers.slice(0, 3) : [];
  while (tiers.length < 3) tiers.push({ id: `${schedule.id || 'completion'}_tier_${tiers.length + 1}`, rewards: [] });
  return {
    ...schedule,
    id: cleanString(schedule.id, completionRewardKey(source.type, source.id)),
    name: cleanString(schedule.name, source.id || 'Completion Reward'),
    source: { type: cleanString(source.type, 'level'), id: cleanString(source.id) },
    reveal: schedule.reveal !== false,
    tiers: tiers.map((tier, index) => normalizeRewardPackage(tier, `${schedule.id || 'completion'}_tier_${index + 1}`)),
  };
}

export function selectCompletionReward(schedule, completedCount = 0) {
  const normalized = normalizeCompletionReward(schedule);
  const tierIndex = Math.min(2, Math.max(0, Math.floor(finite(completedCount, 0, 0))));
  return { tier: tierIndex + 1, package: structuredClone(normalized.tiers[tierIndex]), schedule: normalized };
}
