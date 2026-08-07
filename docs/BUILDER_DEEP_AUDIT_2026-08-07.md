# Game Builder Deep Audit — 2026-08-07

## Outcome

The builder, project workspace, map handoff, package runtime, save system, and publish workflow were audited as one connected product flow. The audit found and corrected functional, data-integrity, security, accessibility, responsive-layout, and race-condition defects. No known critical or high-severity functional defect remains in the tested workflow.

The primary workflow now has automated coverage for:

1. Creating or importing a custom texture.
2. Saving it into the browser-backed texture library.
3. Making it available in the Level Builder palette without manual ID mapping.
4. Painting, validating, and returning the level plus its used custom textures to the Game Workspace.
5. Preserving the returned level and textures in the local project draft.
6. Building a publish plan and creating only one draft pull request per submission.
7. Starting the game and validating package-specific runtime and save behavior.

## Confirmed findings and resolutions

### Security and input trust

| Finding | Impact | Resolution |
| --- | --- | --- |
| Runtime actor names and interaction messages were inserted as HTML. | Package data could execute markup in the game UI. | Escaped all package-controlled text rendered through dynamic HTML and added an execution-prevention regression test. |
| The map bridge trusted its stored return URL. | A modified local-storage handoff could redirect away from the workspace origin. | Restricted returns to the same-origin `builder/workspace.html` route and added a tampering test. |
| Mixed-case game IDs passed validation but failed on case-sensitive package paths. | A valid-looking URL could produce a package load failure or inconsistent save key. | Canonicalized accepted game and preview IDs to lowercase. |

### Data integrity and persistence

| Finding | Impact | Resolution |
| --- | --- | --- |
| Structurally incomplete save payloads were treated as loadable. | The menu offered saves that could fail after loading. | Added validation for the required scene and player state before exposing a save. |
| Runtime checkpoint writes did not report storage failure. | Players could believe progress was saved when quota/security rules rejected it. | `saveGame` now returns success/failure and the runtime displays a readable failure message. |
| Wizard-generated “saving disabled” metadata was not honored by the runtime. | A game configured without saves still displayed load behavior and wrote checkpoints. | Loaded package settings/save metadata, hid Load Save, and skipped checkpoint writes when disabled. |
| Custom texture save mutated in-memory state before browser storage succeeded. | A texture could appear ready for use even though it would disappear on refresh. | Made texture save/delete/import storage-first and surfaced failures without claiming success. |
| Imported maps bypassed the manual 200×200 size limit. | Oversized JSON could create excessive DOM/memory work. | Enforced the same maximum dimensions on imported maps. |
| Workspace normalization discarded unknown actor, entity, spawn, object, and component fields. | Editing a supported field could silently remove engine extensions or future schema data. | Preserved unknown top-level and nested metadata during normalize/edit/export operations. |
| Item recategorization retained stale weapon-only fields. | A consumable export could still contain weapon configuration. | Preserved genuine extensions while removing editor-owned fields that do not belong to the new category. |
| Actor/entity ID collisions overwrote existing entries. | A rename or new record could silently replace project data. | Rejected duplicate IDs with a clear validation message. |
| Workspace draft failures could be followed by map launch, export, or publish using stale data. | The wrong project state could be sent to the next workflow step. | Propagated explicit save status and blocked downstream actions after a failed write. |
| Tile permissions and Scene Object edits could claim success after a follow-up storage failure. | The UI and persisted draft could disagree. | Added transactional rollback and failure messages for those editor extensions. |

### Workflow correctness and race conditions

| Finding | Impact | Resolution |
| --- | --- | --- |
| Map and texture non-drag tools ran on both pointer-down and click. | Line tools consumed the same cell twice and fill operations created extra undo states. | Limited drag tools to pointer-down and discrete tools to click/keyboard activation. |
| A correctable map-return validation error disabled Return permanently. | Users had to abandon and restart the handoff. | Kept Return available after recoverable capture/validation errors. |
| A failed older project request could surface after a newer project finished loading. | Rapid switching could show a stale error or state. | Added request identity checks around both successful and failed loads. |
| Project switching and browser navigation could discard unsaved edits without warning. | Workspace changes could be lost accidentally. | Added project-switch confirmation and dirty-state `beforeunload` protection; intentional map returns bypass the warning. |
| Two rapid Publish submissions could create two pull requests. | Duplicate branches/PRs could be created from one user action. | Added a synchronous submission lock before any asynchronous plan refresh. |
| A failed current draft save could still publish an older stored draft. | The published changes could differ from the visible editor. | Publish planning now stops immediately when current state cannot be persisted. |

### Usability, accessibility, and responsive behavior

| Finding | Impact | Resolution |
| --- | --- | --- |
| Builder/workspace tabs did not keep tab roles, selected state, hidden panels, or focus in sync. | Keyboard and assistive-technology navigation was incomplete. | Added synchronized ARIA tab semantics, roving focus, arrow keys, Home, and End. |
| Map and texture grids were pointer-only. | Keyboard users could not navigate or paint cells. | Added grid/gridcell semantics, roving cell focus, arrow navigation, and Enter/Space activation with visible focus. |
| Re-rendering a grid discarded keyboard focus. | A keyboard edit could unexpectedly return focus to the document. | Restored focus to the corresponding bounded cell after render/resize. |
| The active Scene Objects layout kept its three desktop minimum columns on mobile. | The 390 px workflow expanded to roughly 969 px and required horizontal page scrolling. | Corrected the responsive selector so the active panel collapses to one column below 1100 px. |
| Storage and validation failures were sometimes shown as success or left controls unusable. | Recovery steps were unclear. | Standardized readable error states and kept safe retry actions available. |

## Test coverage added or expanded

- End-to-end texture creation, image import, automatic palette mapping, level use, bridge return, workspace staging, and publish-plan behavior.
- Stored-markup execution prevention for actor and interaction text.
- Invalid/corrupt save recovery, package save-disable metadata, and checkpoint storage failure.
- Oversized map imports and a maximum-size 200×200 resize/fill stress case.
- Unknown metadata round trips across actors, entities, spawns, and object collections.
- Map and texture line endpoints, single-step fill undo, keyboard navigation, and keyboard painting.
- Stale project failures, rapid project switching, unsaved-edit confirmation, and unload warnings.
- Retryable bridge failures and modified return URLs.
- Workspace, tile, object, texture, and publish storage failures with rollback/stale-data prevention.
- Duplicate actor/entity/item IDs, item recategorization, and extension-field preservation.
- Accessible tab state and horizontal containment across every builder/workspace workflow panel on desktop and mobile.
- Rapid Publish double-submission prevention.

## Verification evidence

Local verification completed on 2026-08-07:

- Data/contract audit: all three packaged games passed all data, scene, actor/entity, and builder-catalog checks.
- Unit suite: 57 passed.
- Chromium desktop browser suite: 65 passed, including the maximum-size stress test.
- Chromium mobile hardening suite: 15 passed.
- Source syntax checks and `git diff --check`: passed.

Firefox desktop and WebKit mobile remain part of the checked-in GitHub Actions matrix. Local Firefox startup did not complete reliably in this execution environment, and the WebKit browser download was blocked by upstream certificate/gateway failures; CI is therefore the authoritative cross-browser result for those engines.

## Residual risk and maintenance notes

- Browser storage remains finite by design. The workflow now fails visibly and avoids false success, but large texture libraries/projects may still require users to remove old local drafts or textures.
- Publish behavior is tested with mocked GitHub responses locally; the draft pull request and its CI run provide the live integration check.
- `builder/script.js` contains a pre-existing duplicated block of texture/map helper declarations. Later declarations currently win consistently and the browser regression suite passes, but consolidating that block in a separate cleanup would reduce maintenance risk without mixing a large mechanical refactor into this defect-focused patch.
