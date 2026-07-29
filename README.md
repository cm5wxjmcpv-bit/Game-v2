# Pixel Engine (Game-v2)

A modular 2D pixel-art browser **engine** built with plain HTML, CSS, and JavaScript.

The current RPG is retained as the first engine test package, `sample-rpg`. The engine selects a game through a manifest instead of treating the repository's RPG content as the engine itself.

## Run locally

Because the engine loads JSON via `fetch`, run from a local static server:

```bash
python -m http.server 8080
```

Then open a package:

```text
http://localhost:8080/?game=sample-rpg
http://localhost:8080/?game=sandbox-demo
http://localhost:8080/?game=scene-demo
```

The `game` query parameter selects `games/<game-id>/game.json`. When it is omitted or unsafe, the engine loads `sample-rpg`.

## Game packages

Each game begins with a manifest:

```text
games/<game-id>/game.json
```

The manifest provides:

- game identity and versions
- starting scene metadata
- enabled or configured systems
- paths to world, map, item, enemy, shop, encounter, tile, and texture data
- the content root used to resolve those paths

The current packages are:

- `sample-rpg`: the existing RPG content retained through backward-compatible paths
- `sandbox-demo`: an independent package using the legacy town schema
- `scene-demo`: a package that starts in a generalized neutral scene

For transition safety, `sample-rpg` currently points to the existing `/data` content. This lets the generalized runtime be verified before moving or deleting working content.

## Generalized scenes

The loader creates one scene registry from:

- legacy towns
- legacy levels
- generic scenes listed in `world.scenes`

Legacy towns are normalized as `safe` scenes. Legacy levels are normalized as `adventure` scenes. Generic maps can explicitly use `safe`, `adventure`, or `neutral` mode through their `scene` metadata.

The runtime uses `loadScene()` internally. Existing `loadTown()` and `loadLevel()` calls remain supported as compatibility wrappers.

Game manifests and individual scenes can configure movement, collision, inventory, equipment, shops, combat, random encounters, and progression. Movement, collision, shops, combat, random encounters, and progression are currently enforced by the runtime. Player/entity generalization is still required before inventory and equipment assumptions can be fully removed.

See `games/README.md` for the complete package, scene, and system contracts.

## Content layout

The current sample package resolves these existing data sources:

- `data/levels/*.json` → combat levels and enemy spawns
- `data/towns/*.json` → town layouts, shops, portals, fountains
- `data/items/items.json` → weapons, armor, consumables, materials, accessories, key items
- `data/enemies/enemies.json` → enemy stats, AI behavior, aggro/leash/patrol ranges, drop tables
- `data/shops/shops.json` → explicit stock, buy/sell prices, stock limits, shop type
- `data/classes/classes.json` → class stats, starting gear, growth, movement, bag slots
- `data/tiles/tiles.json` + `data/tiles/effects.json` → tile definitions and tile effect rules
- `data/texturepacks/*.json` → texture mapping per tile texture key
- `data/world/world.json` + `data/world/progression.json` → world map list, level unlock flow, and start configuration

## Engine modules

Core engine logic is split in `/src` so each system can evolve independently:

- game package selection: `gameManifest.js`
- scene and system contracts: `sceneRuntime.js`, `systemConfig.js`
- loop/bootstrap: `main.js`, `game.js`, `dataLoader.js`
- render/input/state: `renderer.js`, `camera.js`, `miniMap.js`, `input.js`, `stateManager.js`
- gameplay systems: `combat.js`, `enemyAI.js`, `collision.js`, `drops.js`, `shops.js`
- player systems: `inventory.js`, `equipment.js`, `progression.js`, `statusEffects.js`
- world systems: `portalSystem.js`, `tileEffects.js`
- support: `audio.js`, `saveSystem.js`, `debug.js`, `entityFactory.js`

## Save isolation

Browser saves are namespaced by game ID and slot:

```text
pixel_engine_save_<game-id>_slot_1
```

Scene-aware saves include the current scene and last safe scene while retaining the legacy `currentTownId` field. Legacy `pixel_engine_save_v1` and `pixel_engine_save_v2` saves remain readable by `sample-rpg`.

## Automated audit

Install the audit dependency and run the full data, contract, unit, and browser checks:

```bash
npm install
npm run audit
```

GitHub Actions runs the same audit for pull requests into `main`. It validates package manifests, scene contracts, JSON and map references, assets, JavaScript syntax, HTML references, browser saves, all test packages, the builder, and the standalone viewer.

## Builder

The builder remains available under `/builder/`. A later milestone will make the builder select and edit a specific game package and scene instead of assuming the sample RPG paths.

## Remaining generalization work

- component-based entities and interactions
- generic player definitions and package-controlled sprites
- complete inventory and equipment removal for games that disable those systems
- builder game-project and scene selection
- moving the original RPG content fully under `games/sample-rpg/`
- formal save migration functions for future schema changes
