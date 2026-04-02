# LEVEL_BUILDER_FULL_SYSTEM_EXPLANATION

## CONFIDENCE LEGEND USED IN THIS DOCUMENT
- **Confirmed** = directly verified in repository source code.
- **Inferred** = likely true from code behavior, but not explicitly encoded as a formal contract.

---

## 1) HIGH-LEVEL PURPOSE

### What this website is for
**Confirmed:** This repo is a plain HTML/CSS/JavaScript browser toolset for building and previewing game content, with three builder systems plus a standalone viewer:
1. **Map/level editor** (tile + object marker grid editor),
2. **Item editor** (item DB CRUD + JSON import/export),
3. **Texture builder** (pixel grid + color palette + JSON/PNG/engine-entry export),
4. **Viewer** page to inspect maps.  
This is explicit in UI tabs in `index.html` and separate `viewer.html`.【F:index.html†L14-L264】【F:viewer.html†L1-L43】

### What problems it solves
**Confirmed:**
- Structured visual map authoring with resizable map dimensions and paint/fill/erase tooling.
- Object marker placement (spawn, portals, shops, enemy spawns, decor, triggers, etc.).
- Export in multiple formats, including **engine-oriented level JSON**.
- Backward-compatible import normalization for legacy map formats.
- Item database creation/editing and JSON portability.
- Texture authoring in 16/32/64 resolution with PNG export and engine texture registry entry export.

### Main workflows user can do
**Confirmed:**
- Build map -> export raw JSON and/or engine JSON.
- Import map JSON from file into map editor.
- Preview map via standalone viewer (via localStorage handoff).
- Build, edit, delete item entries -> import/export item DB JSON.
- Build textures using paint/fill/eraser and palette/custom colors -> export texture JSON/PNG/engine entry JSON.

### Is it only level builder?
**Confirmed:** No. It includes:
- Level/map builder,
- Item builder,
- Texture builder,
- Viewer/preview tools,
- Import/export tools for maps/items/textures,
- Palette-based paint/fill tools and custom color persistence for texture custom colors only.

---

## 2) REPO STRUCTURE

## Repository files (full)
- `index.html` — Main multi-tab application shell (map editor, viewer-tab launcher, item editor, texture builder).【F:index.html†L1-L264】
- `script.js` — Core application logic for all tabs in `index.html` (map editor, item editor, texture builder, tab switching, imports/exports, state).【F:script.js†L1-L2225】
- `viewer.html` — Standalone map viewer page UI shell.【F:viewer.html†L1-L43】
- `viewer.js` — Viewer logic (file/localStorage loading, normalization, rendering).【F:viewer.js†L1-L332】
- `style.css` — Shared styling for both main app and viewer, including grids, tab UI, item editor layout, texture visuals.【F:style.css†L1-L271】
- `README.md` — Overview and high-level format examples.【F:README.md†L1-L58】

## Entry points
- Main app entry: `index.html` loading `script.js`.
- Viewer entry: `viewer.html` loading `viewer.js`.

## Safe vs high-risk files

### Safer for UI-only changes
- `style.css`: colors, spacing, typography, responsive behavior (generally low-to-medium risk).
- Non-ID text labels in `index.html`/`viewer.html` (low risk if IDs unchanged).

### High-risk logic files
- `script.js` (high risk): all functional systems centralized.
- `viewer.js` (medium-high): import normalization and compatibility behavior.

## Dead/duplicate/old files
**Confirmed:** No obvious duplicate backup files in repo root listing.  
**Inferred:** There is mild duplication of normalization concepts between `script.js` and `viewer.js` (not dead, but parallel logic that can drift).

---

## 3) PAGE / APP ARCHITECTURE

### App load model
- Single HTML app (`index.html`) with multiple tab panels hidden/shown by CSS class toggling.
- `script.js` is an IIFE (`(function(){ ... })();`) that initializes state and binds events immediately after parse.

### Single-page vs multi-page
- **Main tool:** single-page multi-tab app.
- **Viewer:** separate page (`viewer.html`) navigated to by `window.location.href`.

### Tab system
- Tab buttons: `tabMapEditorBtn`, `tabViewerBtn`, `tabItemEditorBtn`, `tabTextureBuilderBtn`.
- `setActiveTab(tabName)` toggles `.active` on both panel nodes and tab buttons.
- No route/hash-based routing; purely in-memory class toggling.

### State flow
- Central mutable `state` object in `script.js` holds map/item/texture/tab/tool state.
- UI rendering functions regenerate DOM for grid/palette/list and reflect state to labels.
- Actions mutate `state` first, then re-render relevant portions.

---

## 4) FULL UI MAP

## Map Editor Tab (`#mapEditorTab`)

### Map Setup section
- `#mapTypeSelect`: chooses map type (`level` or `town`), filters palette/legend.
- `#mapIdInput`: normalized via `normalizeMapId` on input.
- `#mapNameInput`: trimmed name fallback to `Untitled Map` on input.
- Width/height number inputs + `#applySizeBtn`: validated then `resizeMap` with preserve overlap.

### Tiles & Tools section
- Layer switches:
  - `#layerTileBtn` -> tile layer.
  - `#layerObjectBtn` -> object layer and forces paint if fill selected.
- Dynamic grouped palette container `#palette` populated from `PALETTE_DEFINITIONS` filtered by active layer + map type.
- Tool buttons:
  - `#paintToolBtn` sets paint.
  - `#fillToolBtn` sets fill only for tile layer.
  - `#eraserBtn` selects `empty` (tile) or `none` (object).

### Map Actions section
- `#exportBtn`: raw map export.
- `#exportGameBtn`: engine map export.
- `#importInput`: map import via FileReader.
- `#clearBtn`: confirm + clear both layers.
- `#openViewerBtn`: serializes engine map to localStorage key and navigates viewer page.

### Status box + legend
- Labels reflect map metadata/tool/layer/selection/grid size.
- `#message` is map status output.
- `#tileLegend` is full ID listing filtered by map type.

### Editor Grid
- `#gridContainer`: generated as `width x height` cells (`.cell`) each with marker span (`.cell-marker`).
- Cell background = tile color; dot marker color = object color.

## Viewer Tab inside main app (`#viewerTab`)
- Simplified panel with button `#openViewerFromTabBtn` that delegates to map tab open-viewer behavior.

## Item Editor Tab (`#itemEditorTab`)

### Top actions
- `#itemNewBtn`: reset form to defaults.
- `#itemSaveBtn`: parse + validate + create/update item.
- `#itemDeleteBtn`: confirm + delete selected.
- `#itemExportBtn`: export `{ items: [...] }`.
- `#itemImportInput`: import and normalize.

### Item list panel
- `#itemList` dynamically renders buttons per item.
- Click list entry loads item into form and sets selection index.

### Item form
Fields:
- Core: ID, Name, Category, Base Value, Stackable, Rarity.
- Conditional equip/mod rows.
- Weapon fields: power, attack range, cooldown.
- Consumable fields: effect type/value/duration.

Conditional visibility controlled by `updateItemConditionalFields`.

## Texture Builder Tab (`#textureBuilderTab`)

### Texture Setup
- `#textureSizeSelect` (16/32/64) resets pixel grid.

### Colors & Tools
- `#textureColorPicker` custom hex color picker; remembered in localStorage-backed recent list.
- `#texturePalette` dynamically generated default colors + transparent + custom colors.
- Tool buttons: paint/fill/eraser.

### Texture Actions
- Filename input `#textureFilenameInput` sanitized on blur/export.
- `#textureExportBtn`: texture JSON export.
- `#textureExportPngBtn`: PNG export via temporary canvas.
- `#textureExportEngineEntryBtn`: `{ key, path }` JSON export.

### Texture Grid
- `#textureGridContainer` generated `size x size` `.texture-cell` elements.
- Transparent cells show checkerboard class.

## Standalone Viewer (`viewer.html`)
- File import (`#viewerImportInput`) and “Load Preview from Builder” (`#loadPreviewBtn`) using localStorage key.
- Back button to builder.
- Render-only grid + basic legend message.

---

## 5) LEVEL BUILDER SYSTEM

### Creation + size model
- Initial map is 30x30 (`DEFAULT_WIDTH/HEIGHT`).
- Resizing uses `resizeMap(nextWidth,nextHeight)` with copy of overlapping area, new cells default to `empty` and `none`.
- Hard cap side length: `MAX_MAP_SIDE = 200`.

### Tile placement logic
- On mousedown/click in grid: `paintCellFromElement`.
- Paint mode writes selected tile ID to `state.tileLayer[row][col]`.
- Fill mode runs flood-fill `applyFillAt` over contiguous matching tile values.

### Object placement logic
- Active layer `object` writes selected object ID to `state.objectLayer[row][col]`.
- Unique object rule: entries with `def.unique` (currently player_start) clear previous placements via `clearExistingUniqueObject`.

### Spawn markers / player start
- Player start stored as object ID `player_start` in object layer.
- Engine export spawn resolution:
  1. locate `player_start` object,
  2. else first non-wall tile in mapped engine tile layer,
  3. else `{x:0,y:0}`.

### Portals/shops/fountains/enemy groups
- Engine export groups objects into:
  - `portals` (with `{x,y,levels:[]}`),
  - `shops` (with mapped `shopId`),
  - `fountains`,
  - `enemySpawns` (with mapped `enemyId`).

### Erasing
- Eraser button switches selection to `empty` (tile) or `none` (object), keeps paint tool.

### Selection
- Selection tracked per layer in `state.selectedByLayer.tile` and `.object`.
- Palette filters by map type and layer. `ensureSelectedVisible` resets invalid hidden selection.

### Coordinates + dimensions
- Coordinates: `x=col`, `y=row`, zero-indexed.
- Dimensions: `state.width`, `state.height`.
- Grid stored row-major arrays `[row][col]`.

### In-memory map structure
- `state.tileLayer`: 2D array of tile IDs.
- `state.objectLayer`: 2D array of object IDs.
- Map metadata: `mapType`, `mapId`, `mapName`, `width`, `height`.

### Export formats
1. **Raw export** (`exportRawMapToFile`): includes `width/height`, map metadata, `tiles`, `tileLayer`, `objectLayer`, and optional `gridSize` if square.
2. **Engine export** (`serializeEngineMap`): `{id,name,width,height,tiles,objects,spawn}` where `tiles` are engine IDs and objects grouped.

### Import + validation
- `importMapFromFile` -> parse JSON -> `normalizeImportedPayload`.
- Accepts both root object and wrapped `{ map: ... }`.
- Supports:
  - explicit `tileLayer`/`objectLayer`,
  - `tiles` + objects array,
  - legacy combined numeric/string cell values + `placements` object.
- Validation ensures positive integer dimensions and row width/height consistency.

### Final level JSON format
**Engine export exactly matches keys:** `id`, `name`, `width`, `height`, `tiles`, `objects`, `spawn`.

---

## 6) ITEM BUILDER SYSTEM

**Confirmed present in this repo.**

### Item data structure
- Default object includes id/name/category/baseValue/stackable/rarity/equipSlot/mods/power/attackRange/cooldown.
- Saved output varies by category (undefined keys removed).

### Fields + category behavior
- Categories: weapon, armor, accessory, consumable, material, key_item.
- Weapon includes combat fields and mods.
- Armor/accessory include equipSlot + mods.
- Consumable includes effect fields.

### Preview
- No rich visual preview canvas; list preview is textual in item list entries.

### Export/import
- Export: `downloadJsonFile({ items: state.itemDb.items }, 'items_database.json')`.
- Import accepts either raw array or `{ items: [...] }`, normalizes and validates each item, enforces unique IDs.

### Engine compatibility rules
- Category and rarity sanitized to allowed enums.
- Numeric fields validated finite.
- Unknown fields are preserved on update via `mergeItemWithUnknownFields` (important for forward compatibility).

---

## 7) TEXTURE BUILDER SYSTEM

### How it works
- Pixel editor uses div grid, not `<canvas>` for editing.
- State keeps `size`, `pixels` 2D array of hex colors or `null` (transparent).

### Canvas/pixel size
- Supported sizes: 16, 32, 64.
- Each UI cell renders at 12x12 CSS pixels in editor.

### Paint/fill logic
- Paint writes selected color (or null for eraser).
- Fill uses flood-fill over contiguous same-color cells.

### Palette and color picker
- Base palette from `TEXTURE_COLORS` includes fixed colors + transparent (`null`).
- Color picker input adds selected custom colors via `rememberTextureCustomColor`.
- Active color highlights corresponding palette button.

### Sliders
- No sliders present in texture builder.

### Custom color persistence
- Stored in `localStorage` key `levelBuilderTextureCustomColors`.
- Validates hex format, deduplicates, keeps most recent first, max 16 entries.

### Exports
- **Texture JSON:** `{ type:'texture', size, pixels }`.
- **PNG:** draw 1 pixel per cell onto temporary canvas then blob download.
- **Engine texture entry:** `{ key: <filename>, path: 'assets/textures/starter/<filename>.png' }`.

### Filename handling
- Sanitized to lowercase alnum/underscore/hyphen, collapse underscores, trim underscores.
- Fallback `texture_<size>x<size>`.

### Texture ID mapping to engine
- Engine entry uses sanitized filename as `key`; path conventions hardcoded to starter texture folder.

### Resolution/downscaling/high-res blending
- No multi-resolution painting in same texture.
- No antialias/downscale/brush blending features; strictly per-cell flat color.

### Texture preview
- Editor grid itself is the preview. No separate scaled preview panel.

---

## 8) DATA MODELS

## App-level state (`script.js`)
- `width`, `height`, `mapType`, `mapId`, `mapName`
- `tileLayer`, `objectLayer`
- `selectedByLayer` (`tile`, `object`)
- `activeLayer`, `activeTool`
- painting flags (`isPainting`, `lastPaintedCellKey`)
- tab state `activeTab`
- item state: `itemDb`, `selectedItemIndex`
- texture builder nested object with size/pixels/colors/tool flags

## Level-related schemas
- Raw export schema (builder-oriented): includes both `tiles` and `tileLayer` + `objectLayer`.
- Engine export schema (engine-oriented):
  ```json
  {
    "id": "...",
    "name": "...",
    "width": 30,
    "height": 30,
    "tiles": [["floor_stone_a"]],
    "objects": {
      "portals": [],
      "shops": [],
      "fountains": [],
      "enemySpawns": []
    },
    "spawn": {"x":0,"y":0}
  }
  ```

## Item schemas
- In-memory DB: `{ items: Item[] }`.
- Item output is category-dependent and stripped of undefined keys.

## Texture schemas
- In-memory: `pixels[row][col] => '#rrggbb' | null`.
- JSON export: `{ type:'texture', size:number, pixels:2DArray }`.
- Engine entry export: `{ key:string, path:string }`.

## Palette data
- `PALETTE_DEFINITIONS` includes `id,label,layer,group,color,mapTypes` and optional `effect`,`unique`.

## Undo/redo
- **Confirmed absent** in repo.

---

## 9) EVENT FLOW / LOGIC FLOW

### App startup
1. IIFE executes.
2. Build constant tables + dom refs + initial state.
3. `initialize()` called.
4. Renders palette/legend/grid.
5. Binds all event listeners.
6. Syncs labels and forms.
7. Initializes item editor and texture builder.

### Switching tabs
- Button click -> `setActiveTab(tabName)` -> toggles `.active` classes on tab buttons and tab panels.

### Creating new level (practical path)
- User edits map metadata/size -> `applySizeFromInputs`/input handlers.
- Tool/layer selections choose what painting writes.
- No dedicated “new map” button; clear + metadata reset manually.

### Painting a tile
- Grid mousedown/click triggers `paintCellFromElement`.
- If fill tool on tile layer -> flood fill.
- Else write selected tile ID into `tileLayer` and update cell visual.

### Placing an object
- Switch to object layer.
- Paint writes selected object ID into `objectLayer`.
- Unique object types clear prior instance first.

### Exporting a level
- Raw: `exportRawMapToFile` -> `downloadJsonFile`.
- Engine: `serializeEngineMap` (tile mapping + spawn resolution + object grouping) -> `downloadJsonFile`.

### Importing a level
- File input -> FileReader parse -> normalization -> `applyImportedMap` -> full UI rerender.

### Creating texture
- Select size/color/tool; paint on `textureGridContainer`.
- Updates `state.textureBuilder.pixels`.

### Export texture PNG
- `exportTexturePngToFile`: temporary canvas draw pixels -> `canvas.toBlob` -> download.

### Export texture JSON
- `exportTextureToFile` clones pixels + size/type -> download JSON.

### Export engine texture entry
- `exportTextureEngineEntryToFile` uses sanitized filename key/path -> download JSON.

### Changing colors/custom colors
- Color picker input updates selected color and remembers it in capped localStorage list.
- Palette rerenders to include custom colors.

### Temporary state persistence
- Preview map saved to localStorage before navigating viewer.
- Texture custom colors persist in localStorage.
- Map/item/texture current working data does not auto-persist across refresh.

---

## 10) DOM + JS BINDINGS (RISK MAP)

| HTML ID/Class | JS binding/function | Purpose | Risk if edited |
|---|---|---|---|
| `#gridContainer` | `dom.gridContainer`, `renderGrid`, paint handlers | Main map canvas | **High** |
| `.cell` / `.cell-marker` | `applyCellVisual`, event targeting | Tile/object visuals | **High** |
| `#palette` / `.tile-btn` | `renderPalette`, `setSelectedForActiveLayer` | Tile/object selection | **High** |
| `#mapTypeSelect` | change listener | filters palette/legend | Medium |
| `#mapWidthInput/#mapHeightInput` | `applySizeFromInputs` | map resize | High |
| `#exportBtn/#exportGameBtn` | export funcs | data contract output | **High** |
| `#importInput` | `importMapFromFile` | compatibility path | **High** |
| `#itemForm` field IDs | item parse/build funcs | item schema integrity | High |
| `#itemList` | `renderItemList` | item selection/edit flow | Medium |
| `#textureGridContainer` / `.texture-cell` | texture paint/fill funcs | texture editor core | **High** |
| `#textureColorPicker` | custom color memory | persisted palette behavior | Medium |
| `#textureExportPngBtn` | canvas export | PNG generation | Medium-High |
| `#tab*Btn` + `.tab-panel` | `setActiveTab` | navigation | Medium |
| Viewer `#viewerImportInput` | `importMapFromFile` in viewer.js | viewer compatibility | Medium-High |

---

## 11) FUNCTION INVENTORY (IMPORTANT FUNCTIONS)

> Note: `script.js` centralizes many functions. Inventory below covers major behavioral surface.

### Core initialization/render
- `initialize` — bootstraps app rendering/listeners.
- `createLayerGrid` — generic 2D array constructor.
- `cloneLayer` — shallow clone row arrays.
- `renderPalette`, `renderLegend`, `renderGrid` — primary map UI rendering.
- `applyCellVisual`, `getColorForId` — map cell styling.

### Event wiring + tool state
- `bindEvents` — all listeners for tabs/map/item/texture.
- `onActiveLayerChanged`, `updateActiveLayerButtons`, `updateActiveToolButtonState`, `setActiveTab`.
- `setSelectedForActiveLayer`, `ensureSelectedVisible`, `highlightActivePaletteButton`.

### Map edit mechanics
- `paintCellFromElement`, `applyFillAt`, `applySelectedAt`, `clearExistingUniqueObject`, `isInsideMap`.
- `applySizeFromInputs`, `resizeMap`.

### Map import/export and engine conversion
- `exportRawMapToFile`, `exportEngineMapToFile`, `serializeEngineMap`.
- `mapTilesToEngineIds`, `mapTileIdToEngine`.
- `collectEngineObjectsFromLayer`, `resolveSpawnFromObjects`, `findFallbackSpawn`.
- `isPortalObject`, `isShopObject`, `mapShopObjectToEngineShopId`, `isEnemySpawnObject`, `mapEnemyObjectToEngineEnemyId`.
- `importMapFromFile`, `normalizeImportedPayload`, `normalizeMapLikeObject`, `normalizeIdValue`, `normalizeLegacyCombinedValue`, `applyLegacyPlacements`, `applyImportedMap`.

### Item editor
- `getDefaultItem`, `resetItemFormToDefaults`, `populateItemForm`, `updateItemConditionalFields`.
- `onSaveItem`, `buildItemFromForm`, `validateItem`, `findItemIndexById`, `mergeItemWithUnknownFields`.
- `onDeleteItem`, `renderItemList`.
- `exportItemsToFile`, `importItemsFromFile`, `normalizeImportedItems`.

### Texture builder
- `initializeTextureBuilder`, `renderTexturePalette`, `renderTextureGrid`.
- `paintTextureCellFromElement`, `applyTextureFillAt`, `applyTextureCellVisual`.
- `rememberTextureCustomColor`, `loadTextureCustomColorsFromStorage`, `saveTextureCustomColorsToStorage`.
- `exportTextureToFile`, `exportTexturePngToFile`, `exportTextureEngineEntryToFile`.
- `sanitizeTextureFilename`, `getTextureExportBaseFilename`.

### Shared utils/status
- `downloadJsonFile`, `downloadBlobFile`, `updateStatus`, `setItemEditorStatus`, `updateTextureStatus`.

### Viewer (`viewer.js`) major functions
- `initialize`, `bindEvents`, `renderGrid`.
- `importMapFromFile`, `normalizeImportedPayload`, `normalizeMapLikeObject`.
- `normalizeTile`, `normalizeObject`, `normalizeLegacyCombined`.
- `applyImportedPayload`, `updateMapLabels`, `updateStatus`.

**Risk note:** Any edit to conversion/normalization/export functions is high risk because it changes interop behavior.

---

## 12) DEPENDENCIES / LIBRARIES

- **No external framework/library detected.**
- No npm/package config in repo root.
- No CDN script tags in HTML.
- App is plain vanilla HTML/CSS/JS.
- Offline behavior: fully local except browser feature dependencies (FileReader, Blob, localStorage, canvas).

---

## 13) LOCAL STORAGE / SAVING

### Uses found
1. `levelBuilderPreviewMap`:
   - Written in builder when opening viewer preview.
   - Read in viewer via “Load Preview from Builder”.
   - Stores serialized engine map JSON.
2. `levelBuilderTextureCustomColors`:
   - Stores array of recent custom hex colors for texture builder.
   - Loaded at texture builder init.

### Not used
- No `sessionStorage`, `indexedDB`, URL query/hash state persistence for editor data.

### Persisted across refresh
- Preview payload (until overwritten/cleared).
- Texture custom colors list.

### Not persisted
- Active map work buffer, item DB, texture pixel grid, selected tab/tool unless manually exported.

---

## 14) EXPORT / IMPORT COMPATIBILITY WITH 2D ENGINE

### Does engine export match expected top-level schema?
**Confirmed:** Yes, engine export contains exactly:
- `id`
- `name`
- `width`
- `height`
- `tiles`
- `objects`
- `spawn`

### Raw vs engine format
- Raw export = builder-centric, richer internal layers.
- Engine export = mapped and grouped schema intended for game consumption.

### Nesting/needs conversion
- `objects` are grouped into category arrays (`portals`, `shops`, `fountains`, `enemySpawns`) rather than a flat `objects[]` list.  
**Inferred compatibility caution:** If engine expects flat objects list, conversion needed.

### Tile ID mapping rules
- Non-engine tile IDs mapped through `mapTileIdToEngine` table.
- Already-engine tile IDs pass through.
- Unknown IDs fallback to `floor_grass_a`.

### Object type mapping rules
- Only subset exported into grouped engine object payload:
  - portals, shops, fountain, enemy spawn types.
- Many object markers (decor/triggers/chests/etc.) are currently omitted from engine objects output.

### Conversion logic locations
- Map export conversion: `serializeEngineMap`, `mapTileIdToEngine`, `collectEngineObjectsFromLayer`, spawn functions.
- Import conversion/normalization: `normalizeMapLikeObject`, legacy helpers.

### Likely compatibility concerns
- Omitted object categories may lose authored data in engine export.
- Shop mapping collapses multiple shop object types to limited IDs.
- Enemy mapping compresses many types into 3 enemy IDs.
- Portal payload has empty `levels: []` (no destination metadata pipeline).

---

## 15) RISK AREAS / FRAGILE AREAS

1. **Monolithic `script.js`**: UI/event/conversion/persistence all mixed; high coupling.
2. **Dual normalization logic (`script.js` vs `viewer.js`)** may drift over time.
3. **Engine export object filtering** silently drops many object IDs.
4. **Fallback behaviors** (unknown tile -> `floor_grass_a`) can hide import data issues.
5. **No undo/redo** increases user error impact.
6. **No autosave for map/items/texture pixels** can lose work on refresh.
7. **String-based IDs across many tables** easy to mismatch during edits.
8. **Map/object schema tolerant import** may accept malformed-but-usable data, masking upstream errors.
9. **`collectTileMetadata` and `collectObjectsFromLayer` currently unused** (possible stale/partial features).
10. **UI+logic coupling via strict element IDs**: renaming IDs breaks functionality immediately.

---

## 16) SAFE_CHANGE_GUIDE

## SAFE_CHANGE_GUIDE

### Safest files for styling-only edits
- `style.css` (avoid renaming class names tied to JS selection logic like `.cell`, `.texture-cell`, `.tile-btn`).

### Safest files for labels/text only
- Visible text content in `index.html` and `viewer.html` while preserving IDs and control types.

### Safest places to add new buttons
- Add new button markup in relevant panel (`index.html`) and wire in `bindEvents` with isolated new handler.
- Prefer non-destructive actions first (e.g., copy-to-clipboard export variants).

### Safest places to add export options
- Reuse `downloadJsonFile` utility and keep new export function independent of existing ones.
- Add alongside existing export handlers in map/item/texture sections.

### Safest places to add palette/color behavior
- Texture custom color enhancements near `renderTexturePalette`, `rememberTextureCustomColor`, storage helpers.
- Keep `TEXTURE_COLORS` semantics and `null` transparent handling intact.

### Dangerous places to avoid unless necessary
- `normalizeMapLikeObject`, `normalizeIdValue`, `mapTileIdToEngine`, `collectEngineObjectsFromLayer`, `bindEvents`, `setActiveTab`.

### Best strategy for safe changes
1. Make tiny scoped change.
2. Manually run key workflows (paint/fill/import/export/viewer/item CRUD/texture export).
3. Compare output JSON before/after for unchanged workflows.
4. Keep schema-affecting edits isolated and explicitly version-noted.

---

## 17) KNOWN PROBLEMS OR SUSPICIOUS ISSUES

### Confirmed or strongly indicated by code
1. **Engine export omits many object types** (decor, triggers, chests, etc.) from `objects` payload.
2. **`collectTileMetadata` and `collectObjectsFromLayer` are not used** (possible unfinished or abandoned export paths).
3. **`modsRow` visibility condition includes redundant `|| category === 'weapon'` since weapon already included in showEquip; harmless but noisy.
4. **Texture JSON filename ignores custom filename input** (`exportTextureToFile` always `texture_<size>x<size>.json`) unlike PNG/engine-entry which use sanitized input.
5. **Viewer color map (`ID_COLORS`) incomplete relative to builder IDs**, causing fallback colors for many IDs (visual-only inconsistency).
6. **No explicit empty checks for required DOM elements**; missing IDs would cause runtime errors during init.

### Inferred concerns
- Import normalization between builder and viewer can diverge with future edits because they are separate codepaths.
- `mapShopObjectToEngineShopId` maps armor/general to broad defaults that may not match future engine taxonomy.

---

## 18) CHATGPT_HANDOFF_SUMMARY

## CHATGPT_HANDOFF_SUMMARY

This project is a **vanilla HTML/CSS/JS game-content builder** with one main tabbed app (`index.html` + `script.js`) and one standalone viewer (`viewer.html` + `viewer.js`). The main systems are:
1. **Level builder** with tile and object layers, paint/fill/eraser, map resize, import/export (raw + engine JSON), and preview handoff to viewer via localStorage.
2. **Item builder** with item list + conditional form fields by category, CRUD, validation, and item DB JSON import/export.
3. **Texture builder** with 16/32/64 pixel grid editing, fixed + custom palette colors, custom color localStorage persistence, and texture JSON/PNG/engine-entry exports.

Most critical logic is centralized in `script.js`, especially these functions: `bindEvents`, `normalizeMapLikeObject`, `serializeEngineMap`, `mapTileIdToEngine`, `collectEngineObjectsFromLayer`, `onSaveItem`, and texture export functions. Changes to these are high risk.

Main fragility points:
- Monolithic script and tight DOM ID coupling,
- Separate importer logic in builder vs viewer,
- Engine export currently only includes selected object categories,
- No undo/autosave.

Do not casually rename IDs/classes used in JS, and do not change export/import mapping logic without regression-testing all workflows.

---

## 19) CHANGE STRATEGY RECOMMENDATIONS

### Best safe order for future improvements
1. **Low risk first:** visual polish in CSS and label clarity in HTML.
2. **Medium risk next:** add non-breaking UX helpers (status details, confirmation prompts, optional warnings).
3. **Then data safety:** add autosave/local draft for map/item/texture.
4. **Then compatibility hardening:** unify normalization code shared by builder and viewer.
5. **Then feature expansion:** enrich engine export object mapping + metadata.

### Quick wins
- Add explicit unsaved-changes warnings.
- Add JSON schema preview panels for exports.
- Add a “duplicate item” action.

### Medium-risk improvements
- Add undo/redo stacks for map + texture edits.
- Add per-object metadata editor (portal destination, enemy type, shop inventory set).

### High-risk improvements
- Refactor `script.js` into modules.
- Modify engine export schema shape.
- Change normalization fallback semantics.

### Suggested test cadence after each change
- Smoke test startup and all tab switches.
- Map: paint, fill, object place, clear, resize, raw export, engine export, import.
- Viewer: load exported file and preview localStorage path.
- Items: new/save/edit/delete/import/export with invalid and valid JSON.
- Texture: paint/fill/erase, size change, custom color persistence, JSON/PNG/engine-entry exports.

---

## 20) FINAL RULES COMPLIANCE NOTES
- This document is based on full repo file inventory present in root and all source files were read.
- Confirmed vs inferred statements are explicitly marked.
- No code behavior assumptions are made without a code anchor; inferred items are labeled.

---

## A) TOP 10 FILES TO UNDERSTAND FIRST
1. `script.js`
2. `index.html`
3. `viewer.js`
4. `style.css`
5. `viewer.html`
6. `README.md`
7. `script.js` sections: map export/import normalization
8. `script.js` sections: item save/import normalization
9. `script.js` sections: texture export/persistence
10. `script.js` sections: event binding + tab management

## B) TOP 10 HIGH-RISK AREAS
1. `serializeEngineMap` object/tile/spawn output contract
2. `mapTileIdToEngine` mapping table
3. `collectEngineObjectsFromLayer` data loss risk for unsupported object categories
4. `normalizeMapLikeObject` import compatibility
5. `normalizeIdValue` legacy and cross-layer coercion
6. `bindEvents` central listener wiring
7. `setActiveTab` panel activation integrity
8. Item `onSaveItem` + validation/merge behavior
9. Texture filename sanitization/export behavior
10. Divergent normalization between builder and viewer

## C) TOP 10 SAFEST IMPROVEMENTS
1. CSS polish and spacing
2. Better empty-state messages
3. Tooltip/help text additions
4. Add read-only export preview text area
5. Add “copy JSON to clipboard” helpers
6. Add map stats panel (tile/object counts)
7. Add texture color swatch labels
8. Add filename hint text for exports
9. Add legend filtering UI
10. Add non-invasive form placeholders
