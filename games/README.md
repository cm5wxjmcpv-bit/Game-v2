# Game Packages

Pixel Engine loads game-specific configuration from `games/<game-id>/game.json`.

Launch a package with:

```text
index.html?game=<game-id>
```

A package manifest identifies the game's data files, enabled systems, version, and starting scene. Paths are resolved from `contentRoot`, which is relative to the manifest file.

The current `sample-rpg` package points to the existing `/data` directory for backward compatibility. A later migration can move that content inside `games/sample-rpg/` without changing the engine loader; only the manifest paths need to change.

`sandbox-demo` is a self-contained legacy-town test package. `scene-demo` starts in a generic neutral scene and verifies the generalized scene loader and runtime system switches.

## Scene registry

A world can continue using the legacy lists:

```json
{
  "towns": ["town_hub"],
  "levels": ["level_fields"]
}
```

It can also register generic scenes:

```json
{
  "towns": ["fallback_room"],
  "levels": [],
  "scenes": ["scene_lab"]
}
```

Generic scene files load from `manifest.data.scenesDirectory`. Existing towns and levels are automatically normalized into the same scene registry.

Scene modes control the compatibility runtime state:

- `safe` uses the existing town state and becomes a return checkpoint.
- `adventure` uses the existing level state and can run combat and encounters.
- `neutral` uses the generic scene state without town or level assumptions.

A generic scene declares its metadata inside the map:

```json
{
  "id": "scene_lab",
  "scene": {
    "id": "scene_lab",
    "type": "map",
    "mode": "neutral",
    "systems": {
      "collision": false,
      "combat": false
    }
  }
}
```

Portals can target any registered scene with `targetScene`. The existing `targetTown`, `targetLevel`, and level-list formats remain supported.

## Runtime systems

The manifest can configure these systems:

- `movement`
- `collision`
- `inventory`
- `equipment`
- `shops`
- `combat` (`false`, `true`, or a named mode such as `turn_based`)
- `randomEncounters`
- `progression`

A scene can override the manifest settings through `scene.systems`. Movement, collision, shops, combat, random encounters, and progression are enforced by the current runtime. Inventory and equipment are retained in the normalized configuration but still require further player/entity generalization before they can be completely removed from every game type.

## Minimum manifest

```json
{
  "schemaVersion": 1,
  "id": "my-game",
  "name": "My Game",
  "version": "0.1.0",
  "engineVersion": "0.2.0",
  "contentRoot": "./",
  "startScene": {
    "type": "map",
    "id": "scene_lab"
  },
  "systems": {
    "movement": true,
    "collision": true,
    "inventory": true,
    "equipment": true,
    "shops": true,
    "combat": "turn_based",
    "randomEncounters": true,
    "progression": true
  },
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
    "levelsDirectory": "levels",
    "scenesDirectory": "scenes"
  }
}
```
