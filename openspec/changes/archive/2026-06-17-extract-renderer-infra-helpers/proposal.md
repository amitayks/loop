## Why

Final feature-module extraction. The last infrastructure helpers in `app.ts` — take/media (video pool, mouse-trail, media init, content protection), workspace view routing, and background-image loading — are extracted into three focused modules, reducing `app.ts` to a thin orchestrator (bootstrap + `enterEditor` + `appendTakeToTimeline`). This also resolves the final back-imports (`pathToFileUrl`, `getOrCreateTakeVideos`, `resolveTimeToSource`, `getMouseTrailForTake`, `setWorkspaceView`, `ensureMediaInitialized`, `syncContentProtection`).

## What Changes

- Add `src/renderer/features/media/take-media.ts` and move: `getOrCreateTakeVideos`, `cleanupVideoPool`, `resolveTimeToSource`, `pathToFileUrl`, `loadMouseTrail`, `getMouseTrailForTake`, `ensureMediaInitialized`, `syncContentProtection`.
- Add `src/renderer/features/workspace/workspace.ts` and move: `setToggleButtonState`, `updateWorkspaceHeader`, `setWorkspaceView`.
- Add `src/renderer/features/background/background-image.ts` and move: `pickAndLoadBackground`, `loadBackgroundFromPath`.
- `app.ts`: delete the moved definitions; import the entry points it calls. Sibling modules repoint their back-imports of these helpers to the new modules. `enterEditor` and `appendTakeToTimeline` stay in `app.ts`.

Behavior-preserving — bodies unchanged.

## Capabilities

### New Capabilities
- `renderer-infra-helpers-modules`: The remaining renderer infrastructure helpers are organized into focused modules — take/media in `features/media/take-media.ts`, workspace view routing in `features/workspace/workspace.ts`, background-image loading in `features/background/background-image.ts`. `app.ts` and sibling modules import their entry points; `app.ts` is reduced to bootstrap + the `enterEditor`/`appendTakeToTimeline` orchestrators. Behavior-preserving; validated by the renderer-health e2e gate.

### Modified Capabilities
<!-- None at the spec/requirement level. Mechanical relocation; no product behavior change. -->

## Impact

- **New files**: `src/renderer/features/media/take-media.ts`, `src/renderer/features/workspace/workspace.ts`, `src/renderer/features/background/background-image.ts`.
- **Renderer**: `app.ts` loses 13 helper bodies, gains named imports; sibling modules repoint their back-imports of these helpers to the new modules. `app.ts` ≈ bootstrap + 2 orchestrators afterward.
- **Build/boundaries**: bundled by esbuild; circular imports resolved in-bundle.
- **Tests**: no new logic → no required unit test; `tsc` proves import completeness, the renderer-health e2e gate proves boot, full `npm run check` is the release gate.
- **Docs**: `docs/production/target-architecture.md` adds the three modules.
- **Deferred (optional final cleanup)**: extracting `enterEditor` + `appendTakeToTimeline` to leave `app.ts` as pure bootstrap.
- **Risk**: low. Mechanical relocation behind the proven keystone; typecheck-guided reconciliation; the gate is the behavioral proof.
