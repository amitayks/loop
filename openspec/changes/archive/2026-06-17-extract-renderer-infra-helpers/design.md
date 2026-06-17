## Context

After 16 extractions, `app.ts` is down to 15 functions: 13 infrastructure helpers plus the `enterEditor` and `appendTakeToTimeline` orchestrators. The helpers reference state via `state.ts`, DOM via `elements.ts`, and `window.electronAPI`. The renderer is esbuild-bundled; the renderer-health e2e gate exists.

## Goals / Non-Goals

**Goals:** organize the last 13 helpers into three focused modules; reduce `app.ts` to a thin orchestrator.

**Non-Goals:** no behavior change; no body edits; leave `enterEditor` + `appendTakeToTimeline` (the orchestrators).

## Decisions

### D1 — Three focused modules by responsibility
- `features/media/take-media.ts`: take video pool, mouse-trail lookups, media init, content protection, `pathToFileUrl`, `resolveTimeToSource` — the take/media infrastructure used across modules.
- `features/workspace/workspace.ts`: workspace view routing (toggle button state, header, `setWorkspaceView`).
- `features/background/background-image.ts`: background image pick/load.

### D2 — Consume state, elements, shared, siblings
Imports: state from `../../state.js`; DOM from `../dom/elements.js`; mouse-trail lookups from `features/timeline/mouse-trail.js` / `shared/domain/mouse-trail.js`; siblings (`compositing` `updatePreview`, `transport` draw scheduling). `window.electronAPI` ambient. `setWorkspaceView` may call `enterEditor` (still in app.ts) → import from `../../app.js`.

### D3 — Final back-import repoints; circular-safe; typecheck-guided
Grep `features/` for the moved helper names imported from `app.js` and repoint to the correct new module. Cycles are esbuild-safe. Iterate `tsc --build` to 0 errors, then `lint --max-warnings=0`. The gate proves runtime.

### D4 — What remains in app.ts
`enterEditor` (editor bootstrap), `appendTakeToTimeline` (recording→editor transition), and the top-level bootstrap (event-listener wiring, IPC registration, initial render). This is a legitimate thin entry-point/orchestrator.

## Risks / Trade-offs

- **[setWorkspaceView ↔ enterEditor cycle]** → esbuild-safe; import `enterEditor` from `app.js`.
- **[Final back-imports]** → resolved by the repoint; after this only the orchestrators' internal calls remain in app.ts.

## Migration Plan

Behavior-preserving; single implementer creates the three modules, moves the clusters, repoints siblings, reconciles imports, rewires `app.ts`; full `npm run build` + `npm run check`. Rollback = revert.

## Open Questions

- None blocking. An optional final cleanup could extract `enterEditor`/`appendTakeToTimeline` to leave `app.ts` as pure bootstrap.
