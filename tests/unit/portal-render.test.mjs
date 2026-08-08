import test from 'node:test';
import assert from 'node:assert/strict';

import { resolvePortalAppearance } from '../../src/portalRender.js';

const game = {
  db: {
    texturePack: {
      custom_texture_blue_gate: {
        color: '#1234ab',
        image: 'data:image/png;base64,bluegate',
      },
    },
  },
};

test('legacy portals resolve to the original violet square appearance', () => {
  assert.deepEqual(resolvePortalAppearance(game, {}), {
    mode: 'style',
    shape: 'square',
    color: '#8d7bff',
    size: 24,
    imagePath: '',
  });
});

test('texture appearance resolves the selected game or custom texture image and color', () => {
  assert.deepEqual(resolvePortalAppearance(game, {
    appearance: {
      mode: 'texture',
      textureId: 'custom_texture_blue_gate',
      shape: 'ring',
      size: 30,
      color: '#ffffff',
    },
  }), {
    mode: 'texture',
    shape: 'ring',
    color: '#1234ab',
    size: 30,
    imagePath: 'data:image/png;base64,bluegate',
  });
});

test('direct image appearance preserves its image path and clamps visual size', () => {
  assert.deepEqual(resolvePortalAppearance(game, {
    appearance: {
      mode: 'image',
      imagePath: 'assets/portals/gold-door.png',
      shape: 'circle',
      size: 80,
      color: '#ffcc00',
    },
  }), {
    mode: 'image',
    shape: 'circle',
    color: '#ffcc00',
    size: 32,
    imagePath: 'assets/portals/gold-door.png',
  });
});
