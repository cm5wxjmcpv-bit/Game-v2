export const PORTAL_TRIGGER_MODES = Object.freeze(['interact', 'touch']);
export const PORTAL_SHAPES = Object.freeze(['square', 'circle', 'diamond', 'ring']);
export const PORTAL_APPEARANCE_MODES = Object.freeze(['style', 'texture', 'image']);
export const PORTAL_REQUIREMENT_TYPES = Object.freeze(['none', 'level_unlocked', 'town_unlocked', 'level_completed']);

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

export function safePortalId(value, fallback = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positive(value, fallback, min, max) {
  return Math.max(min, Math.min(max, finite(value, fallback)));
}

function validColor(value, fallback = '#8d7bff') {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
}

function normalizePoint(value) {
  if (!value || typeof value !== 'object') return null;
  const x = Number(value.x);
  const y = Number(value.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

export function normalizePortalAppearance(value = {}) {
  const mode = PORTAL_APPEARANCE_MODES.includes(value.mode) ? value.mode : 'style';
  const shape = PORTAL_SHAPES.includes(value.shape) ? value.shape : 'square';
  return {
    mode,
    shape,
    color: validColor(value.color),
    size: positive(value.size, 24, 8, 32),
    textureId: safePortalId(value.textureId),
    imagePath: String(value.imagePath || '').trim(),
  };
}

export function normalizePortalRequirement(value = {}) {
  const type = PORTAL_REQUIREMENT_TYPES.includes(value.type) ? value.type : 'none';
  return {
    type,
    id: type === 'none' ? '' : safePortalId(value.id),
    message: String(value.message || 'This portal is locked.').trim() || 'This portal is locked.',
  };
}

export function portalTargetSceneId(portal = {}) {
  return safePortalId(portal.targetScene || portal.targetTown || portal.targetLevel || '');
}

export function normalizePortal(value = {}, index = 0) {
  const targetScene = portalTargetSceneId(value);
  const arrival = normalizePoint(value.arrival || value.targetArrival || value.destinationSpawn);
  const trigger = PORTAL_TRIGGER_MODES.includes(value.trigger) ? value.trigger : 'interact';
  const id = safePortalId(value.id, `portal_${index + 1}`);
  return {
    ...clone(value),
    id,
    x: finite(value.x, 0),
    y: finite(value.y, 0),
    targetScene,
    targetKind: ['town', 'level', 'building', 'scene'].includes(value.targetKind) ? value.targetKind : 'scene',
    arrival,
    trigger,
    range: positive(value.range, trigger === 'touch' ? 0.55 : 1.1, 0.2, 3),
    appearance: normalizePortalAppearance(value.appearance),
    requirement: normalizePortalRequirement(value.requirement),
    linkMode: value.linkMode === 'two-way' || value.linkMode === 'return' ? value.linkMode : 'one-way',
    pairedPortalId: safePortalId(value.pairedPortalId),
  };
}

export function cleanPortalForScene(value = {}) {
  const portal = normalizePortal(value);
  delete portal.targetTown;
  delete portal.targetLevel;
  if (portal.targetScene) delete portal.levels;
  if (!portal.arrival) delete portal.arrival;
  if (!portal.pairedPortalId) delete portal.pairedPortalId;
  return portal;
}

function insideScene(scene, point) {
  return point &&
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= 0 && point.y >= 0 &&
    point.x < Number(scene?.width || 0) && point.y < Number(scene?.height || 0);
}

export function validatePortal(value, sourceScene, scenes = []) {
  const portal = normalizePortal(value);
  const errors = [];
  if (!safePortalId(portal.id)) errors.push('Portal ID is required.');
  if (!sourceScene) errors.push('Source scene is required.');
  else if (!insideScene(sourceScene, portal)) errors.push('Portal position must be inside the source scene.');
  if (!portal.targetScene) errors.push('Destination scene is required.');
  const destination = (scenes || []).find((scene) => safePortalId(scene?.id) === portal.targetScene);
  if (portal.targetScene && !destination) errors.push(`Destination scene “${portal.targetScene}” does not exist in this game draft.`);
  if (destination && portal.arrival && !insideScene(destination, portal.arrival)) {
    errors.push('Arrival position must be inside the destination scene.');
  }
  if (portal.appearance.mode === 'texture' && !portal.appearance.textureId) errors.push('Texture appearance requires a texture ID.');
  if (portal.appearance.mode === 'image' && !portal.appearance.imagePath) errors.push('Image appearance requires an image path.');
  if (portal.requirement.type !== 'none' && !portal.requirement.id) errors.push('The selected lock rule requires an ID.');
  return errors;
}

export function nextPortalId(scene, prefix = 'portal') {
  const used = new Set((scene?.objects?.portals || []).map((portal, index) => normalizePortal(portal, index).id));
  let index = 1;
  while (used.has(`${prefix}_${index}`)) index += 1;
  return `${prefix}_${index}`;
}

function ensurePortalArray(scene) {
  scene.objects = scene.objects && typeof scene.objects === 'object' ? scene.objects : {};
  scene.objects.portals = Array.isArray(scene.objects.portals) ? scene.objects.portals : [];
  return scene.objects.portals;
}

function removePairedPortal(scenes, pairedId, sourcePortalId) {
  if (!pairedId) return;
  for (const scene of scenes) {
    const portals = ensurePortalArray(scene);
    scene.objects.portals = portals.filter((entry, index) => {
      const portal = normalizePortal(entry, index);
      return !(portal.id === pairedId && portal.pairedPortalId === sourcePortalId);
    });
  }
}

function upsertPortal(scene, portal, previousId = '') {
  const portals = ensurePortalArray(scene);
  const filtered = previousId && previousId !== portal.id
    ? portals.filter((entry, index) => normalizePortal(entry, index).id !== previousId)
    : [...portals];
  const index = filtered.findIndex((entry, itemIndex) => normalizePortal(entry, itemIndex).id === portal.id);
  if (index >= 0) filtered[index] = cleanPortalForScene(portal);
  else filtered.push(cleanPortalForScene(portal));
  scene.objects.portals = filtered;
}

export function applyPortalLink({ scenes: sourceScenes, sourceSceneId, portal: rawPortal, previousPortalId = '', twoWay = false }) {
  const scenes = clone(sourceScenes || []);
  const sourceScene = scenes.find((scene) => safePortalId(scene?.id) === safePortalId(sourceSceneId));
  if (!sourceScene) throw new Error('The source scene is no longer available.');

  const oldPortal = (sourceScene.objects?.portals || [])
    .map((entry, index) => normalizePortal(entry, index))
    .find((entry) => entry.id === safePortalId(previousPortalId || rawPortal?.id));
  const portal = normalizePortal(rawPortal);
  const errors = validatePortal(portal, sourceScene, scenes);
  if (errors.length) throw new Error(errors.join(' '));

  if (oldPortal?.pairedPortalId) {
    removePairedPortal(scenes, oldPortal.pairedPortalId, oldPortal.id);
  }

  const destination = scenes.find((scene) => safePortalId(scene?.id) === portal.targetScene);
  if (!destination) throw new Error('The destination scene is no longer available.');
  portal.targetKind = destination._workspaceKind || destination.mapType || destination.scene?.type || 'scene';

  if (!twoWay) {
    portal.linkMode = 'one-way';
    portal.pairedPortalId = '';
    upsertPortal(sourceScene, portal, previousPortalId);
    return { scenes, portal: cleanPortalForScene(portal), returnPortal: null };
  }

  const destinationPortals = ensurePortalArray(destination).map((entry, index) => normalizePortal(entry, index));
  let returnId = oldPortal?.pairedPortalId || `${portal.id}_return`;
  if (destinationPortals.some((entry) => entry.id === returnId && entry.pairedPortalId !== portal.id)) {
    let suffix = 2;
    while (destinationPortals.some((entry) => entry.id === `${returnId}_${suffix}`)) suffix += 1;
    returnId = `${returnId}_${suffix}`;
  }

  portal.linkMode = 'two-way';
  portal.pairedPortalId = returnId;
  const destinationPoint = portal.arrival || normalizePoint(destination.spawn) || { x: 0, y: 0 };
  const returnPortal = normalizePortal({
    id: returnId,
    x: destinationPoint.x,
    y: destinationPoint.y,
    targetScene: sourceScene.id,
    targetKind: sourceScene._workspaceKind || sourceScene.mapType || sourceScene.scene?.type || 'scene',
    arrival: { x: portal.x, y: portal.y },
    trigger: portal.trigger,
    range: portal.range,
    appearance: portal.appearance,
    requirement: { type: 'none', id: '', message: 'This portal is locked.' },
    linkMode: 'return',
    pairedPortalId: portal.id,
  });

  upsertPortal(sourceScene, portal, previousPortalId);
  upsertPortal(destination, returnPortal, returnId);
  return {
    scenes,
    portal: cleanPortalForScene(portal),
    returnPortal: cleanPortalForScene(returnPortal),
  };
}

export function deletePortalLink({ scenes: sourceScenes, sourceSceneId, portalId }) {
  const scenes = clone(sourceScenes || []);
  const sourceScene = scenes.find((scene) => safePortalId(scene?.id) === safePortalId(sourceSceneId));
  if (!sourceScene) throw new Error('The source scene is no longer available.');
  const existing = (sourceScene.objects?.portals || [])
    .map((entry, index) => normalizePortal(entry, index))
    .find((entry) => entry.id === safePortalId(portalId));
  if (!existing) return scenes;
  sourceScene.objects.portals = ensurePortalArray(sourceScene)
    .filter((entry, index) => normalizePortal(entry, index).id !== existing.id);
  if (existing.pairedPortalId) removePairedPortal(scenes, existing.pairedPortalId, existing.id);
  return scenes;
}
