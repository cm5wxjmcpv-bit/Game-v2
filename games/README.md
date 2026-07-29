# Game Packages

Pixel Engine loads game-specific configuration from `games/<game-id>/game.json`.

Launch a package with:

```text
index.html?game=<game-id>
```

A package manifest identifies the game's data files, enabled systems, version, and starting scene. Paths are resolved from `contentRoot`, which is relative to the manifest file.

The current `sample-rpg` package points to the existing `/data` directory for backward compatibility. A later migration can move that content inside `games/sample-rpg/` without changing the engine loader; only the manifest paths need to change.

## Minimum manifest

```json
{
  "schemaVersion": 1,
  "id": "my-game",
  "name": "My Game",
  "version": "0.1.0",
  "engineVersion": "0.1.0",
  "contentRoot": "./",
  "data": {
    "world": "world/world.json",
    "tiles": "tiles/tiles.json",
    "tileEffects": "tiles/effects.json",
    "texturePack": "textures/default-pack.json",
    "classes": "classes/classes.json",
    "items": "items/items.json",
    "enemies": "enemies/enemies.json",
    "shops": "shops/shops.json",
    "progression": "world/progression.json",
    "encounters": "encounters/encounters.json",
    "encounterTables": "encounters/tables.json",
    "townsDirectory": "towns",
    "levelsDirectory": "levels"
  }
}
```
