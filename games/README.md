# Game Packages

Pixel Engine loads game-specific configuration from `games/<game-id>/game.json`.

Launch a package with:

```text
index.html?game=<game-id>
```

A package manifest identifies the game's data files, enabled systems, version, and starting scene. Paths are resolved from `contentRoot`, which is relative to the manifest file.

The current `sample-rpg` package points to the existing `/data` directory for backward compatibility. A later migration can move that content inside `games/sample-rpg/` without changing the engine loader; only the manifest paths need to change.

`scene-demo` verifies generic scenes, direct actors, component entities, and runtime system switches.

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

## Package actors

The runtime selects actors rather than reading class fields directly.

Existing class entries are automatically converted into actors, so the sample RPG and older packages do not need immediate data migrations. A package can also provide `manifest.data.actors`. A direct actor with the same ID replaces the converted legacy actor.

```json
{
  "actors": [
    {
      "id": "explorer",
      "name": "Explorer",
      "components": {
        "movement": { "speed": 3 },
        "health": { "max": 12 },
        "combat": {
          "attack": 0,
          "defense": 0,
          "agility": 1,
          "growth": {}
        },
        "wallet": { "starting": 0 },
        "inventory": { "slots": 0, "maxStack": 99 },
        "equipment": { "starting": {} },
        "progression": { "enabled": false },
        "render": {
          "fallback": {
            "shape": "circle",
            "color": "#38bdf8",
            "size": 20
          }
        }
      }
    }
  ]
}
```

Actor components currently normalize into the compatibility player object used by combat, inventory, shops, saves, and the HUD. This allows non-RPG packages to omit class identity and use package-controlled movement, health, currency, inventory size, equipment, progression, sprites, and fallback shapes.

A sprite can be supplied under `components.render.sprite`:

```json
{
  "imagePath": "assets/characters/Explorer.png",
  "frameWidth": 64,
  "frameHeight": 64,
  "idleFrames": [0],
  "walkFrames": [0, 1, 2],
  "rowByFacing": {
    "down": { "idle": 0, "walk": 1 },
    "left": { "idle": 2, "walk": 3 },
    "right": { "idle": 4, "walk": 5 },
    "up": { "idle": 6, "walk": 7 }
  }
}
```

## Component scene entities

A scene can include an `entities` array alongside the existing `objects` structure. Legacy portals, shops, fountains, enemies, and battle triggers remain supported.

```json
{
  "entities": [
    {
      "id": "welcome_beacon",
      "type": "beacon",
      "x": 4,
      "y": 3,
      "components": {
        "render": {
          "shape": "circle",
          "color": "#facc15",
          "size": 16
        },
        "interaction": {
          "action": "message",
          "message": "The beacon is active.",
          "range": 1.1
        },
        "collision": {
          "solid": false,
          "radius": 0.42
        }
      }
    }
  ]
}
```

Supported entity components in this milestone:

- `render`: fallback shape, color, size, or an image path
- `interaction`: a persistent message or direct scene transition
- `collision`: solid/non-solid state and collision radius

Entity collision is enforced only when the scene's `collision` system is enabled. Entity IDs must be unique within a scene.

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

A scene can override the manifest settings through `scene.systems`. Movement, collision, shops, combat, random encounters, and progression are enforced by the current runtime.

## Minimum manifest

```json
{
  "schemaVersion": 1,
  "id": "my-game",
  "name": "My Game",
  "version": "0.1.0",
  "engineVersion": "0.3.0",
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
    "actors": "actors/actors.json",
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

`actors` is additive during the compatibility transition. Packages using only legacy classes can omit it.
