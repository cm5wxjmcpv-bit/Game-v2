import { mergeSystemConfig } from './systemConfig.js';

export const SCENE_MODES = Object.freeze({
  SAFE: 'safe',
  ADVENTURE: 'adventure',
  NEUTRAL: 'neutral',
});

function inferMode(type) {
  if (type === 'town') return SCENE_MODES.SAFE;
  if (type === 'level') return SCENE_MODES.ADVENTURE;
  return SCENE_MODES.NEUTRAL;
}

export function normalizeSceneMap(map, legacyType = 'map') {
  if (!map || typeof map !== 'object') return map;

  const existing = map.scene && typeof map.scene === 'object' ? map.scene : {};
  const type = typeof existing.type === 'string' && existing.type.trim()
    ? existing.type.trim()
    : legacyType;
  const mode = Object.values(SCENE_MODES).includes(existing.mode)
    ? existing.mode
    : inferMode(type);

  map.scene = {
    id: map.id,
    type,
    mode,
    systems: existing.systems && typeof existing.systems === 'object'
      ? { ...existing.systems }
      : {},
  };

  return map;
}

export function buildSceneRegistry(...sceneGroups) {
  const scenesById = {};

  for (const group of sceneGroups) {
    for (const scene of group || []) {
      if (!scene?.id) continue;
      if (scenesById[scene.id]) {
        console.warn(`[SceneRuntime] Duplicate scene id "${scene.id}"; the later scene replaces the earlier one.`);
      }
      scenesById[scene.id] = scene;
    }
  }

  return scenesById;
}

export function getSceneMode(scene) {
  return scene?.scene?.mode || inferMode(scene?.scene?.type);
}

export function isSafeScene(scene) {
  return getSceneMode(scene) === SCENE_MODES.SAFE;
}

export function isAdventureScene(scene) {
  return getSceneMode(scene) === SCENE_MODES.ADVENTURE;
}

export function getSceneSystems(gameSystems, scene) {
  return mergeSystemConfig(gameSystems, scene?.scene?.systems || {});
}
