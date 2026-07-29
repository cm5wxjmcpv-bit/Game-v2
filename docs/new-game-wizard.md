# New Game Wizard

The New Game Wizard is available in the package workspace at:

```text
/builder/workspace.html
```

Open **New Game** to create a reviewable package scaffold without manually adding repository folders.

## Generated package

The wizard creates a catalog entry and a package under `games/<internal-id>/` with:

- `game.json` package manifest
- package settings and save metadata
- a direct player actor
- a generic starting scene
- a safe fallback town for legacy recovery and game-over behavior
- floor, wall, and accent tiles with a default color texture pack
- world and progression files
- empty compatibility files for classes, items, enemies, shops, encounters, dialogue, and audio

Git tracks files rather than empty folders, so every default folder contains a valid JSON file.

## Wizard settings

The form controls:

- game name and safe internal ID
- genre metadata
- tile size metadata
- default resolution metadata
- starting map dimensions
- starting player name
- top-down collision or bounds-only movement
- save, inventory, dialogue, combat, and audio feature defaults

Inventory and combat configure current runtime systems in the generated manifest. Save, dialogue, audio, tile size, and resolution are also written to the package settings so later runtime modules can consume them without changing the scaffold format.

## File review

The preview lists every repository path and marks it as either:

- `update`: the existing `games/catalog.json`
- `create`: a new file inside `games/<internal-id>/`

Selecting a path shows the complete JSON that will be committed.

## Controlled publishing

Publishing uses the same controlled GitHub publisher as the existing workspace:

1. Reload and compare `games/catalog.json` with the current `main` version.
2. Confirm every requested new package path does not exist at the exact base commit.
3. Create one commit on a new `workspace/...` branch.
4. Open one draft pull request.
5. Never write to or merge `main`.

The fine-grained GitHub token remains only in page memory and is cleared after a successful draft pull request.
