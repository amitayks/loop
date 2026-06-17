## Context

After the keystone changes, `app.ts` functions reference renderer state through `state.ts` (live bindings + setters) and DOM through `features/dom/elements.ts`. The capture cluster (~lines 3267–3628) is contiguous and cohesive: the picker UI builds the source panel and, on selection, drives the capture streams; `populatePickerSources` calls `enumerateDevices`; `renderPickerPanel`/`applyPickerSelection` drive `updateScreenStream`/`updateWindowStreams`. The renderer is esbuild-bundled and the renderer-health e2e gate exists.

## Goals / Non-Goals

**Goals:**
- Move the capture cluster into one module that consumes `state.js`/`elements.js`.
- Prove the post-keystone extraction pattern is clean and behavior-preserving.

**Non-Goals:**
- No behavior change; no function-body edits.
- No extraction of background-image, recording lifecycle, overlays, etc. (later changes).

## Decisions

### D1 — Move the whole cluster (picker UI + streams) together
The picker UI and the capture streams are mutually dependent (selection → stream updates), so extracting them together keeps inter-calls internal to the module and avoids a circular `module ↔ app.ts` export dance. `app.ts` imports only the entry points it still calls.

### D2 — Consume state via live bindings + setters
The functions read state bindings (`pickerMode`, `pickerAllSources`, `screenStream`, `windowStreams`, …) — imported from `../../state.js` as live bindings — and write via setters (`setScreenStream`, `setWindowStreams`, …). DOM comes from `../dom/elements.js`. `window.electronAPI` and `navigator.mediaDevices` are ambient globals, used as-is. This is exactly the access pattern `app.ts` used; only the import surface becomes explicit.

### D3 — Typecheck-guided import reconciliation
After moving the functions, `tsc --build` lists every symbol the module references but hasn't imported (state binding, setter, DOM element, type, or sibling function) and every entry point `app.ts` now calls but hasn't imported. Add imports until typecheck is clean; then `lint --max-warnings=0` prunes any now-unused imports in both files. This guarantees completeness without guesswork.

### D4 — Gate + typecheck as proof
The picker/stream code runs on user interaction (not at boot), so the e2e health gate primarily proves the module loads and the app boots cleanly with it; combined with `tsc` (import completeness) and the full `npm run check`, this is sufficient for a mechanical relocation. The pure row-builders (`createPickerRadioRow`/`createPickerCheckboxRow`) could get a small jsdom test later but are not required here.

## Risks / Trade-offs

- **[A moved function references a symbol still defined in app.ts]** (e.g. a helper not in the cluster) → typecheck flags the undefined reference; either import it (export from app.ts) or move it too. Keep such exports minimal; prefer moving small helpers with the cluster.
- **[An entry point is called from many app.ts sites]** → all call sites resolve via the single named import; usages unchanged.
- **[Background-image functions adjacent in the file]** → explicitly left in `app.ts`; only the 12 listed functions move.
- **[Runtime-only path not covered by the boot gate]** → acceptable for a behavior-preserving move; the bodies are unchanged, so behavior is preserved by construction; the gate confirms load/boot health.

## Migration Plan

Behavior-preserving; no data migration, no flag. Single implementer creates the module, moves the 12 functions, reconciles imports (typecheck-guided), rewires `app.ts`; then full `npm run build` + `npm run check`. Rollback = revert the commit.

## Open Questions

- None blocking. Subsequent feature domains follow the same pattern and are tracked for later changes.
