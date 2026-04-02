export function createPlayer(classData, itemsById, startConfig = {}) {
  const weaponId = classData.startingGear.weapon;
  return {
    id: 'player',
    classId: classData.id,
    type: 'player',
    x: 0,
    y: 0,
    speed: classData.movement.base,
    facing: 'down',
    gold: startConfig.gold ?? 100,
    stats: {
      ...classData.stats,
      hp: classData.stats.maxHp,
      xp: 0,
      level: 1,
    },
    growth: classData.growth,
    bag: {
      slots: classData.bagSlots,
      maxStack: 99,
      items: [],
    },
    equipment: {
      weapon: weaponId,
      helmet: null,
      armor: classData.startingGear.armor ?? null,
      accessory1: null,
      accessory2: null,
    },
    effects: [],
    unlocks: {
      towns: [...(startConfig.unlockedTowns || [])],
      levels: [...(startConfig.unlockedLevels || [])],
    },
    completedLevels: [],
    cooldowns: { autoAttack: 0 },
    baseWeapon: itemsById[weaponId],
    questLog: [],
    animation: {
      facing: 'down',
      state: 'idle',
      frameIndex: 0,
      frameTimer: 0,
      frameDuration: 0.16,
      sprite: {
        imagePath: 'assets/characters/Warrior_Blue.png',
       frameWidth: 192,
frameHeight: 192,
idleFrames: [0, 1, 2],
walkFrames: [0, 1, 2],
        rowByFacing: {
          down: { idle: 0, walk: 1 },
          left: { idle: 2, walk: 3 },
          right: { idle: 4, walk: 5 },
          up: { idle: 6, walk: 7 },
        },
      },
    },
  };
}

export function createEnemy(template, spawn) {
  return {
    id: `${template.id}_${crypto.randomUUID().slice(0, 6)}`,
    templateId: template.id,
    type: 'enemy',
    x: spawn.x,
    y: spawn.y,
    spawnX: spawn.x,
    spawnY: spawn.y,
    hp: template.stats.maxHp,
    dead: false,
    aggroTarget: null,
    aiState: 'idle',
    lastAttackAt: 0,
    template,
    effects: [],
  };
}
