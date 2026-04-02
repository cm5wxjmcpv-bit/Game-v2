const TILE_SIZE = 32;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export class Camera {
  constructor(viewportWidth, viewportHeight) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
    this.x = 0;
    this.y = 0;
    this.bounds = { width: viewportWidth, height: viewportHeight };
  }

  setViewport(width, height) {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  update(targetX, targetY, mapWidth, mapHeight) {
    const mapPixelsWidth = mapWidth * TILE_SIZE;
    const mapPixelsHeight = mapHeight * TILE_SIZE;
    this.bounds.width = mapPixelsWidth;
    this.bounds.height = mapPixelsHeight;

    const desiredX = targetX * TILE_SIZE - this.viewportWidth / 2;
    const desiredY = targetY * TILE_SIZE - this.viewportHeight / 2;

    const maxX = Math.max(0, mapPixelsWidth - this.viewportWidth);
    const maxY = Math.max(0, mapPixelsHeight - this.viewportHeight);

    this.x = clamp(desiredX, 0, maxX);
    this.y = clamp(desiredY, 0, maxY);
  }

  worldToScreen(tileX, tileY) {
    return {
      x: tileX * TILE_SIZE - this.x,
      y: tileY * TILE_SIZE - this.y,
    };
  }

  isVisible(tileX, tileY, padding = TILE_SIZE) {
    const pos = this.worldToScreen(tileX, tileY);
    return (
      pos.x + padding >= 0 &&
      pos.y + padding >= 0 &&
      pos.x - padding <= this.viewportWidth &&
      pos.y - padding <= this.viewportHeight
    );
  }
}

export { TILE_SIZE };
