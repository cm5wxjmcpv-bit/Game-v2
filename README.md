# L-C Forge

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
- content paths for scenes, actors, items, enemies, shops, encounters, tiles, and textures
- the content root used to resolve those paths

The current packages are:

- `sample-rpg`: the existing RPG content retained through backward-compatible paths
- `sandbox-demo`: an independent package using the legacy town schema
- `scene-demo`: a package using a neutral scene, a direct actor, and component entities

For transition safety, `sample-rpg` currently points to the existing `/data` content. This lets each generalized runtime layer be verified before moving or deleting working content.

## Generalized scenes

The loader creates one scene registry from:

- legacy towns
- legacy levels
- generic scenes listed in `world.scenes`

Legacy towns are normalized as `safe` scenes. Legacy levels are normalized as `adventure` scenes. Generic maps can explicitly use `safe`, `adventure`, or `neutral` mode through their `scene` metadata.

The runtime uses `loadScene()` internally. Existing `loadTown()` and `loadLevel()` calls remain supported as compatibility wrappers.

## Actors and entities

The application selects package actors rather than directly constructing a player from class fields.

- Existing classes automatically normalize into actors.
- A package can provide direct actor definitions with component-controlled movement, health, wallet, inventory, equipment, progression, sprites, and fallback visuals.
- Direct actors can replace converted legacy actors by using the same ID.
- Legacy saves remain supported through `classId` lookup fallback.

Scenes can also contain component entities alongside the existing object arrays. The current entity components support rendering, persistent message or scene interactions, and solid collision.

The application uses `PackageGame` and `PackageRenderer` subclasses while retaining the established `Game` and `Renderer` APIs as the compatibility layer.

See `games/README.md` for the complete package, scene, actor, entity, and system contracts.

## Runtime systems

Game manifests and individual scenes can configure movement, collision, inventory, equipment, shops, combat, random encounters, and progression. Movement, collision, shops, combat, random encounters, and progression are enforced by the runtime.

## Content layout

The current sample package resolves these existing data sources:

- `data/levels/*.json` → combat levels and enemy spawns
- `data/towns/*.json` → town layouts, shops, portals, fountains
- `data/items/items.json` → weapons, armor, consumables, materials, accessories, key items
- `data/enemies/enemies.json` → enemy stats, AI behavior, aggro/leash/patrol ranges, drop tables
- `data/shops/shops.json` → reusable catalogs, per-shop overrides, prices, stock limits, and restocking
- `data/loot/loot-tables.json` → reusable equal-chance enemy and pickup loot tables
- `data/rewards/rewards.json` → fixed packages and first/second/third-plus completion rewards
- `data/config/settings.json` → inventory, mana, rarity, pricing, damage-type, and combat defaults
- `data/classes/classes.json` → legacy actor input during the compatibility transition
- `data/tiles/tiles.json` + `data/tiles/effects.json` → tile definitions and tile effect rules
- `data/texturepacks/*.json` → texture mapping per tile texture key
- `data/world/world.json` + `data/world/progression.json` → world map list, level unlock flow, and start configuration

## Engine modules

Core engine logic is split in `/src` so each system can evolve independently:

- game package selection: `gameManifest.js`
- scene and system contracts: `sceneRuntime.js`, `systemConfig.js`
- actor and entity contracts: `actorRuntime.js`, `sceneEntityRuntime.js`
- compatibility application runtime: `packageGame.js`, `packageRenderer.js`
- loop/bootstrap: `main.js`, `game.js`, `dataLoader.js`
- render/input/state: `renderer.js`, `camera.js`, `miniMap.js`, `input.js`, `stateManager.js`
- gameplay systems: `combat.js`, `battleSystem.js`, `weaponSystem.js`, `rewardSystem.js`, `enemyAI.js`, `collision.js`, `shops.js`
- player compatibility systems: `inventory.js`, `equipment.js`, `progression.js`, `statusEffects.js`
- world systems: `portalSystem.js`, `tileEffects.js`
- support: `audio.js`, `saveSystem.js`, `debug.js`, `entityFactory.js`

## Save isolation

Browser saves are namespaced by game ID and slot:

```text
pixel_engine_save_<game-id>_slot_1
```

Scene-aware saves include the current scene and last safe scene while retaining the legacy `currentTownId` field. Legacy `pixel_engine_save_v1` and `pixel_engine_save_v2` saves remain readable by `sample-rpg`.

## Gameplay messages

Gameplay messages now persist across HUD redraws for a short display period. This applies to component interactions and existing notices such as shops, fountains, combat results, and validation errors.

## Automated audit

Install the audit dependency and run the full data, contract, unit, and browser checks:

```bash
npm install
npm run audit
```

GitHub Actions runs the same audit for pull requests into `main`. It validates package manifests, scenes, actors, component entities, package tile-library editing, legacy scene-object editing, the builder package catalog, workspace/map-editor bridge and controlled-publishing contracts, JSON and map references, assets, JavaScript syntax, HTML references, browser saves, all test packages, both builder surfaces, the focused map bridge, the mocked draft-PR workflow, and the standalone viewer.

## Builder

The established map, item, texture, sync, and viewer tools remain available under:

```text
/builder/
```

The package-aware actor and entity workspace is available under:

```text
/builder/workspace.html
/builder/workspace.html?game=scene-demo
```

The workspace reads `games/catalog.json`, resolves each package manifest and content root, displays all registered scenes and package tiles, converts legacy classes into editable actors, loads direct actors, and provides visual component-entity placement. Browser drafts are stored separately for each game package. Actor JSON, scene JSON, and full workspace bundles can still be exported without GitHub authentication.

### Supabase cloud builder storage

The Workspace and Testing Space include an optional authenticated Supabase layer while preserving the established local-first system. Workspace drafts, staged project assets, Weapon Maker autosaves, and reusable Testing Space maps remain in browser storage for immediate recovery and synchronize to the signed-in creator's cloud records after the initial setup. Player game saves, preview payloads, and map handoffs remain separate and local.

Run the migration and configure the browser-safe Publishable key using [`supabase/README.md`](supabase/README.md). The storage classification, conflict rules, offline behavior, migration behavior, RLS model, and Character Art-ready asset design are documented in [`docs/SUPABASE_CLOUD_ARCHITECTURE.md`](docs/SUPABASE_CLOUD_ARCHITECTURE.md).

### Weapon Maker

Open the workspace and choose **Weapons** to create a weapon from a blank form, a melee/ranged/magic family preset, or a clone. The guided steps cover identity and rarity, normal and special attacks, costs and cooldowns, artwork, and game availability. Optional **Advanced** panels provide equip restrictions, custom animation sheets, damage types, and precise artwork transforms.

The Weapon Maker supports:

- swords, axes, spears, bows, firearms, staffs, and wands with shared subtype attack templates
- separate normal and special cooldown/resource rules, including ammunition categories, mana, cooldown-only attacks, and optional reload times
- built-in support, status, rapid-hit, piercing, area, and heavy special presets
- one reusable image or separate inventory, equipped, attack, and projectile artwork with crop, scale, rotate, and flip controls
- a live character preview and a test arena that switches between real-time and turn-based combat
- automatic assignment to starting equipment, shop catalogs, enemy loot tables, completion rewards, and timed map pickups
- autosaved drafts, **Save**, **Save & Test**, safe deletion checks, and complete weapon-pack import/export

Runtime controls use `Q` for a ready real-time special attack and `I` for inventory/equipment. Normal real-time attacks automatically target the nearest enemy in the character's facing direction. Turn-based battles show **Standard Attack** and an available **Special Attack**. Equipment changes are blocked during active combat.

### Package tile library

The **Map Editor Tiles** panel lists every tile registered by the selected package, including its color, walkability, and whether it is already used in the selected scene.

- Tiles already present in the scene grid are always enabled.
- An unused registered tile can be enabled individually or through **Enable All**.
- **Used Only** removes unused editor permissions.
- Tile permissions remain local workspace metadata and do not alter scene JSON by themselves.
- A tile becomes part of the scene only after it is painted in the visual map editor.

Unknown selections are discarded. Workspace-only tile permissions are preserved in the browser draft but removed from scene exports, workspace bundles, and controlled Publish payloads.

### Visual scene-layout bridge

From the workspace, select a scene and choose **Build Level & Textures**. A focused wrapper opens the established map-grid and texture editor and supports:

- changing the scene name and dimensions
- painting used tiles and unused package tiles enabled from **Map Editor Tiles**
- creating a custom texture and choosing **Save & Use in Map Editor** to select it immediately
- importing a PNG, JPG, or WebP with crop, fit, or stretch placement; the imported image is resized, saved, registered, and selected automatically
- moving the single Player Start marker
- returning the edited layout and every used custom texture to the package-specific local workspace draft

Package-specific tile IDs are represented by temporary reversible aliases inside the map editor and restored before the scene returns. Used custom textures are registered automatically as matching package tiles and texture entries, so no manual ID or file mapping is required. The returned map is rejected if it contains a tile tool that was not enabled for the scene. Existing portals, shops, fountains, enemy spawns, battle triggers, component entities, scene systems, unknown metadata, and local tile permissions are preserved. A resize is rejected when preserved content would fall outside the new bounds.

### Visual legacy scene objects

The workspace **Scene Objects** tab edits the object arrays retained for backward compatibility:

- portals
- shops
- fountains
- enemy spawns
- battle triggers
- reward pickups with either a fixed package or reusable loot table and an optional respawn timer

Select a scene and object type, choose an existing object or create a new one, then click the scene preview to place it. Typed fields cover the known runtime properties, while **Additional JSON** preserves package-specific fields not represented by the form. The editor validates coordinates, required IDs or destinations, and battle-trigger bounds. It does not add synthetic IDs to existing object arrays.

Object changes are merged into the same package-specific browser draft used by component entities and actors. Scene exports, workspace bundles, map-editor handoffs, and Publish plans therefore receive the current object arrays without replacing unknown object groups or metadata.

### One-click Publish & Play

The workspace **Publish & Play** button saves the current browser draft as an isolated playable build and immediately opens the selected scene. It includes all changed manifest-resolved JSON—levels, portals, actors, objects, tiles, textures, weapons, shops, loot, rewards, and settings—without asking for a GitHub token or a second testing step.

This browser build is intentionally separate from regular game saves, editable cloud records, and the public GitHub version. Supabase Cloud Save lets signed-in creators recover and continue builder work across devices; it does not silently publish or merge a public game update.

### Advanced draft-PR publishing

The optional advanced section of the workspace **Publish** tab can send reviewed level, actor, object, tile, texture, weapon, shop, loot, reward, and settings changes to GitHub without writing directly to `main`.

1. Make and save workspace changes.
2. Open **Publish** and review the exact manifest-resolved JSON file list.
3. Use a fine-grained token scoped only to `cm5wxjmcpv-bit/L-C-Forge` with **Contents: write** and **Pull requests: write**.
4. Confirm the file plan and choose **Publish Draft PR**.

The token is kept only in the page's memory and cleared after success. Before creating anything, the workspace compares each target file with the current `main` version. Any stale file stops the whole operation. A successful publish creates one `workspace/...` branch, one commit, and one draft pull request. The workspace never merges the pull request. After publishing, **Test Draft in Game** loads the selected scene and all manifest-resolved JSON from that exact draft commit. Preview saves use a commit-specific key and do not overwrite published-game saves.

Current publishing limits:

- only existing manifest-resolved JSON files plus supported package content files created by the Weapon Maker
- no actor publishing for packages without a direct `data.actors` file
- no new scene files until package scaffolding is implemented
- maximum 50 files per publish
- fixed repository `cm5wxjmcpv-bit/L-C-Forge` and base branch `main`

## Remaining generalization work

- automatic creation of new game package directory structures
- conversion of legacy portals, shops, fountains, and enemy spawns into optional generic components
- removal of compatibility RPG fields from actors that do not use combat, inventory, or equipment
- moving the original RPG content fully under `games/sample-rpg/`
- formal save migration functions for future schema changes
