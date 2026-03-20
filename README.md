# Pixel Engine (Game-v2)

A modular 2D pixel-art browser **engine** (not a full game) built with plain HTML/CSS/JavaScript.

## Run locally

Because the engine loads JSON via `fetch`, run from a local static server:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## Content layout (data-driven)

- `data/levels/*.json` → combat levels and enemy spawns.
- `data/towns/*.json` → town layouts, shops, portals, fountains.
- `data/items/items.json` → weapons, armor, consumables, materials, accessories, key items.
- `data/enemies/enemies.json` → enemy stats, AI behavior, aggro/leash/patrol ranges, drop tables.
- `data/shops/shops.json` → explicit stock, buy/sell prices, stock limits, shop type.
- `data/classes/classes.json` → class stats, starting gear, growth, movement, bag slots.
- `data/tiles/tiles.json` + `data/tiles/effects.json` → tile definitions + tile effect rules.
- `data/texturepacks/*.json` → texture mapping per tile texture key.
- `data/world/world.json` + `data/world/progression.json` → world map list + level unlock flow.

## Engine modules

Core engine logic is split in `/src` so each system can evolve independently:

- loop/bootstrap: `main.js`, `game.js`
- render/input/state: `renderer.js`, `miniMap.js`, `input.js`, `stateManager.js`
- gameplay systems: `combat.js`, `enemyAI.js`, `collision.js`, `drops.js`, `shops.js`
- player systems: `inventory.js`, `equipment.js`, `progression.js`, `statusEffects.js`
- world systems: `portalSystem.js`, `tileEffects.js`
- support: `audio.js`, `saveSystem.js`, `debug.js`, `entityFactory.js`

## Future hooks already present

- quests/NPCs/dialogue/cutscene placeholder path through map objects and player `questLog`.
- expandable progression (`gainXp`, level hooks, spendable stat hook).
- cloud-save adapter stub in `saveSystem.js` for future Google Sheets integration.
- AI behavior tags include boss-ready behavior wiring.
