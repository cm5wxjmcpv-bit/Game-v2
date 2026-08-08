# L-C Forge Supabase cloud architecture

## Goal

L-C Forge remains local-first. Builder work is written to browser storage immediately, synchronized to the signed-in creator's Supabase records, and retained locally whenever the network or cloud session is unavailable. GitHub remains the published, version-controlled game source.

```text
Builder edit
  -> immediate local autosave
  -> debounced authenticated cloud sync
  -> explicit cloud state: Saving / Saved / Offline / Conflict / Failed

Publish & Play
  -> isolated current-browser build
  -> opens the selected scene immediately without a token

Advanced public publish
  -> existing GitHub branch + draft pull request workflow
  -> never triggered by an ordinary cloud save
```

## Storage audit

| Existing key or pattern | Category | Current decision |
|---|---|---|
| `pixel_engine_builder_map_bridge_handoff_v1` | A — temporary handoff | Remains local. It is transactional map-editor transfer data, not a project record. |
| `pixel_engine_builder_map_bridge_result_v1` | A — temporary handoff | Remains local until the workspace commits the return transaction. |
| `pixel_engine_builder_map_bridge_notice_v1` | A — temporary notice | Remains session/local fallback data. |
| `levelBuilderPreviewMap` | A — preview handoff | Remains local and replaceable. |
| `pixel_engine_testing_add_to_game_pending_v1` | A — temporary handoff | Remains local until Add to Game completes. |
| `pixel_engine_workspace_active_tab` | A — session preference | Remains in `sessionStorage`. |
| `pixel_engine_builder_workspace_<game-id>` | B/C — local autosave and project data | Remains the immediate local copy and syncs to `workspace_drafts` as `workspace`. |
| `pixel_engine_builder_assets_<game-id>` | B/C — staged project assets | Remains local and syncs to `workspace_drafts` as `workspace-assets`. Existing texture payloads are preserved. |
| `pixel_engine_weapon_maker_draft_<game-id>` | B/C — tool autosave | Remains local and syncs to `workspace_drafts` as `weapon-autosave`. |
| `pixel_engine_testing_level_library_v1` | C/E — reusable Testing Space data | Remains a local library and synchronizes individual records to `testing_levels`. |
| `pixel_engine_local_publish_<game-id>` | E — isolated playable build | Remains local. It is the no-token Publish & Play snapshot for this browser, not editable cloud project data or a runtime player save. |
| `levelBuilderCustomTextureLibrary` | C — unassigned creator data | Preserved locally for now. Project-assigned textures already travel in staged assets; future larger uploads use Storage. It is not blindly assigned to a project during migration. |
| `levelBuilderTextureCustomColors` | B — device preference | Remains local. |
| `pixel_engine_save_<game-id>_slot_<slot>` | D — runtime player save | Intentionally remains separate from builder cloud records. |
| `pixel_engine_save_v1`, `pixel_engine_save_v2` | D — legacy runtime player saves | Remain local and readable by the compatibility layer. |
| `lc_forge_supabase_session_v1` | B — authenticated browser session | Local authentication cache; never treated as project content or exported. |
| `lc_forge_cloud_sync_v1_*`, `lc_forge_testing_sync_v1_*` | B — sync metadata | Local revision/hash metadata used to detect conflicts and prevent stale overwrites. |

## Cloud model

- `profiles`: one creator profile per Supabase Auth user.
- `projects`: one cloud builder project per owner and GitHub game package ID.
- `project_members`: ownership/editor/viewer foundation for future collaboration; no team UI yet.
- `workspace_drafts`: flexible, revisioned JSONB payloads for workspace, staged asset, and tool drafts.
- `testing_levels`: reusable Testing Space maps, independent from a game until Add to Game is used.
- `project_assets`: metadata for private Storage objects with stable UUID identity.
- `character_art`: prepared still-image and sprite-sheet metadata, including frames, rows, columns, directions, idle/walk frames, and animation speed.

Large or evolving engine payloads use JSONB, while ownership, project identity, asset identity, revisions, timestamps, and Character Art frame metadata remain relational and queryable. Published game packages are not duplicated into Supabase.

## Authentication and authorization

Builder cloud access uses Supabase email/password authentication. Published game play does not require a builder account.

Every user-data table has Row Level Security enabled. Policies use `auth.uid()` and project ownership/membership helpers. Private builder records have no `USING (true)` policies. The `builder-assets` bucket is private and restricts object paths to the authenticated user's first path segment.

The browser receives only:

- Supabase project URL
- Supabase Publishable key
- the signed-in user's short-lived access/refresh session

Database passwords, `DIRECT_URL`, Secret keys, and `service_role` credentials never belong in browser JavaScript or repository configuration.

## Local-first synchronization

Workspace edits autosave locally after a short delay. Cloud writes are separately debounced and use stable payload hashes plus database revisions.

- If only local data exists, it uploads.
- If only cloud data exists, it restores locally and the workspace reloads that safe local copy.
- If local and cloud match, the UI reports Cloud: Saved.
- If one side still matches the last synchronized hash, the newer side is applied.
- If both changed, neither is overwritten. The UI reports a conflict and asks whether to keep local or use cloud.
- If the network fails, the UI reports Offline — saved locally and retries when connectivity returns.
- Clearing a local draft does not silently delete its cloud copy. The cloud copy is retained and can be restored.

The `save_workspace_draft` database function performs an optimistic revision check under a row lock. A stale expected revision raises `cloud_revision_conflict` instead of overwriting newer work.

## Local-data migration

After sign-in, existing migratable data is detected and offered for explicit import. Nothing uploads until the creator chooses Import Local Data to Cloud.

- Originals remain in browser storage.
- Matching cloud records count as duplicates and are not duplicated.
- Divergent workspace records are stored under a separate local-import backup ID.
- Divergent Testing Space records are stored as a separate local import copy.
- Partial failures are reported and remain eligible for retry.
- Player saves, preview data, and transactional handoffs are never imported.

## Asset and Character Art readiness

The reusable asset client uploads supported files to the private `builder-assets` bucket using paths shaped as:

```text
<user-id>/<project-id>/textures/<asset-uuid>.png
<user-id>/<project-id>/characters/<asset-uuid>.webp
<user-id>/<project-id>/sprites/<asset-uuid>.png
```

The file is uploaded first and its relational metadata is inserted second. A metadata failure attempts to remove the just-uploaded object. Existing pixel definitions, data URLs, and custom textures are not converted or broken.

The next Character Art feature can attach a `project_assets` record to `character_art` and store still/sprite-sheet type, frame size, sheet rows/columns, directional mapping, idle frames, walk frames, and animation speed without redesigning the backend.

## Publishing boundary

Cloud Save, Publish & Play, and public publishing are intentionally different actions:

- Cloud Save protects editable builder work and supports moving between devices.
- Publish & Play stores an isolated current-browser build and immediately opens the chosen scene with separate player-save keys.
- Advanced public publishing creates reviewable, version-controlled game content through the existing GitHub draft pull request workflow.

Ordinary cloud synchronization never creates a branch, commit, pull request, merge, or public game update.
