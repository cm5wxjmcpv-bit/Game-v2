import test from 'node:test';
import assert from 'node:assert/strict';

import { Game } from '../../src/game.js';
import { PackageGame } from '../../src/packageGame.js';

test('PackageGame forwards exact portal arrival options to the base scene loader', () => {
  const original = Game.prototype.loadScene;
  let captured = null;
  Game.prototype.loadScene = function patchedLoadScene(sceneId, options) {
    captured = { sceneId, options };
    this.currentMap = { entities: [] };
    return true;
  };

  try {
    const fakeGame = { currentMap: null, currentEntities: [] };
    const loaded = PackageGame.prototype.loadScene.call(fakeGame, 'destination_scene', { arrival: { x: 4, y: 2 } });
    assert.equal(loaded, true);
    assert.deepEqual(captured, {
      sceneId: 'destination_scene',
      options: { arrival: { x: 4, y: 2 } },
    });
    assert.deepEqual(fakeGame.currentEntities, []);
  } finally {
    Game.prototype.loadScene = original;
  }
});
