# Google Apps Script Dry-Run Setup (Builder Game Sync)

This is a **dry-run only** backend setup.
It validates incoming `game_sync_package` payloads and returns what *would* be written.
It does **not** write to GitHub or modify game files.

## 1) Create Apps Script project
1. Open [script.google.com](https://script.google.com).
2. Create a new project.
3. Replace default code with the contents of:
   - `docs/backend-example/google-apps-script-dry-run.gs`

## 2) Deploy as Web App
1. Click **Deploy** → **New deployment**.
2. Select type **Web app**.
3. Recommended settings for this dry-run step:
   - **Execute as**: `Me`
   - **Who has access**: `Anyone` (or your allowed audience if using Workspace and CORS-compatible setup)
4. Click **Deploy** and copy the Web App URL.

## 3) Configure the builder
1. Open the builder.
2. In **Game Sync Preview**, paste the Web App URL into:
   - **Backend Dry Run URL**
3. Run:
   - **Run Game Sync Preflight**
   - **Prepare Game Sync Package**
   - **Send Package to Backend (Dry Run)**

## 4) Request contract (sent by builder)
```json
{
  "type": "game_sync_package",
  "version": 1,
  "levelFile": {
    "filename": "level_001.json",
    "targetPath": "data/levels/level_001.json",
    "payload": {}
  },
  "textures": [
    {
      "id": "custom_texture_x",
      "pngFilename": "custom_texture_x.png",
      "targetPath": "assets/textures/starter/custom_texture_x.png",
      "localTextureAvailable": true,
      "entryPatch": {
        "id": "custom_texture_x",
        "image": "assets/textures/starter/custom_texture_x.png"
      },
      "preflightStatus": "safe_new_entry"
    }
  ],
  "texturePackPatchTarget": "data/texturepacks/default-pack.json",
  "texturePackAdditions": [],
  "manifest": {},
  "preflight": {}
}
```

## 5) Response contract
### Success
```json
{
  "ok": true,
  "mode": "dry_run",
  "validated": true,
  "errors": [],
  "warnings": [],
  "wouldWrite": {
    "levelFile": {
      "filename": "level_001.json",
      "targetPath": "data/levels/level_001.json"
    },
    "textures": [
      {
        "id": "custom_texture_x",
        "pngFilename": "custom_texture_x.png",
        "targetPath": "assets/textures/starter/custom_texture_x.png"
      }
    ],
    "texturePackPatch": [
      {
        "id": "custom_texture_x",
        "image": "assets/textures/starter/custom_texture_x.png"
      }
    ]
  }
}
```

### Failure
```json
{
  "ok": false,
  "mode": "dry_run",
  "validated": false,
  "errors": ["..."],
  "warnings": [],
  "wouldWrite": {
    "levelFile": null,
    "textures": [],
    "texturePackPatch": []
  }
}
```

## 6) Safety notes
- No GitHub token required in frontend.
- No secret values are stored in builder code.
- No automatic/background sending.
- No repo writes in this step.

