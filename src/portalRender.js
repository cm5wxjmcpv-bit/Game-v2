import { Renderer } from './renderer.js';
import { TILE_SIZE } from './camera.js';

const originalDrawObjects = Renderer.prototype.drawObjects;

function clampSize(value) {
  const number = Number(value);
  return Math.max(8, Math.min(32, Number.isFinite(number) ? number : 24));
}

function validColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : '#8d7bff';
}

export function resolvePortalAppearance(game, portal) {
  const source = portal?.appearance && typeof portal.appearance === 'object' ? portal.appearance : {};
  const mode = ['style', 'texture', 'image'].includes(source.mode) ? source.mode : 'style';
  const shape = ['square', 'circle', 'diamond', 'ring'].includes(source.shape) ? source.shape : 'square';
  const texture = mode === 'texture' ? game.db?.texturePack?.[source.textureId] : null;
  return {
    mode,
    shape,
    color: validColor(texture?.color || source.color),
    size: clampSize(source.size),
    imagePath: mode === 'image' ? String(source.imagePath || '') : mode === 'texture' ? String(texture?.image || '') : '',
  };
}

function drawPortal(renderer, game, portal) {
  const { ctx } = renderer;
  const appearance = resolvePortalAppearance(game, portal);
  const pos = game.camera.worldToScreen(portal.x, portal.y);
  const size = appearance.size;
  const x = pos.x + (TILE_SIZE - size) / 2;
  const y = pos.y + (TILE_SIZE - size) / 2;
  const image = renderer.getTextureImage(appearance.imagePath);
  if (image) {
    ctx.drawImage(image, x, y, size, size);
    return;
  }

  ctx.save();
  ctx.fillStyle = appearance.color;
  ctx.strokeStyle = appearance.color;
  ctx.lineWidth = Math.max(2, Math.round(size / 7));
  if (appearance.shape === 'circle' || appearance.shape === 'ring') {
    ctx.beginPath();
    ctx.arc(pos.x + TILE_SIZE / 2, pos.y + TILE_SIZE / 2, size / 2, 0, Math.PI * 2);
    if (appearance.shape === 'ring') ctx.stroke();
    else ctx.fill();
  } else if (appearance.shape === 'diamond') {
    ctx.translate(pos.x + TILE_SIZE / 2, pos.y + TILE_SIZE / 2);
    ctx.rotate(Math.PI / 4);
    const side = size / Math.sqrt(2);
    ctx.fillRect(-side / 2, -side / 2, side, side);
  } else {
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

if (!originalDrawObjects.__portalAppearanceWrapped) {
  const wrapped = function drawObjectsWithPortalAppearance(game) {
    const currentMap = game.currentMap;
    const originalObjects = currentMap?.objects;
    const portals = [...(originalObjects?.portals || [])];
    if (originalObjects) currentMap.objects = { ...originalObjects, portals: [] };
    try {
      originalDrawObjects.call(this, game);
    } finally {
      if (originalObjects) currentMap.objects = originalObjects;
    }
    for (const portal of portals) drawPortal(this, game, portal);
  };
  wrapped.__portalAppearanceWrapped = true;
  Renderer.prototype.drawObjects = wrapped;
}
