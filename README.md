# Pixel Engine (Game-v2)

A modular 2D pixel-art browser **engine** built with plain HTML, CSS, and JavaScript.

The current RPG is retained as the first engine test package, `sample-rpg`. The engine now selects a game through a manifest instead of treating the repository's RPG content as the engine itself.

## Run locally

Because the engine loads JSON via `fetch`, run from a local static server:

```bash
python -m http.server 8080
```

Then open either package:

```text
http://localhost:8080/?game=sample-rpg
http://localhost:8080/?game=sandbox-demo
```

The `game` query parameter selects `games/<game-id>/game.json`. When it is omitted or invalid, the engine loads `sample-rpg`.

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

The first package uses:

```text
games/sample-rpg/game.json
```

For transition safety, `sample-rpg` currently points to the existing `/data` content. This lets the manifest loader and game-specific save system be verified before moving or deleting working content.

A second independent package is included at `games/sandbox-demo/`. It contains its own world, map, tiles, textures, class, and item data and proves that another game can load without modifying engine code.

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
- loop/bootstrap: `main.js`, `game.js`, `dataLoader.js`
- render/input/state: `renderer.js`, `camera.js`, `miniMap.js`, `input.js`, `stateManager.js`
- gameplay systems: `combat.js`, `enemyAI.js`, `collision.js`, `drops.js`, `shops.js`
- player systems: `inventory.js`, `equipment.js`, `progression.js`, `statusEffects.js`
- world systems: `portalSystem.js`, `tileEffects.js`
- support: `audio.js`, `saveSystem.js`, `debug.js`, `entityFactory.js`

## Save isolation

Browser saves are now namespaced by game ID and slot:

```text
pixel_engine_save_<game-id>_slot_1
```

Legacy `pixel_engine_save_v1` and `pixel_engine_save_v2` saves remain readable by `sample-rpg`.

## Automated audit

Install the audit dependency and run the full data, source, and browser checks:

```bash
npm install
npm run audit
```

GitHub Actions runs the same audit for pull requests into `main`. The audit validates package manifests, JSON and map references, assets, JavaScript syntax, HTML references, both game packages, browser saves, the builder, and the standalone viewer.

## Builder

The builder remains available under `/builder/`. A later engine milestone will make the builder select and edit a specific game package instead of assuming the sample RPG paths.

## Future hooks already present

- quests, NPCs, dialogue, and cutscene placeholder paths through map objects and the player quest log
- expandable progression through XP, level hooks, and spendable-stat hooks
- cloud-save adapter stub in `saveSystem.js`
- AI behavior tags with boss-ready behavior wiring
