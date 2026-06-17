## Why

The decomposition keystone is in place: `state.ts` (renderer state store) and `features/dom/elements.ts` (DOM bindings) are modules. Feature logic in `app.ts` now references state via live bindings/setters and DOM via `elements.ts`, so a cohesive cluster can be moved out by simply adding the imports it already uses. This change extracts the first feature domain — the **capture source** cluster (source-picker UI + capture-stream management) — proving the now-clean extraction pattern end to end.

## What Changes

- Add `src/renderer/features/capture/source-picker.ts` and move the cohesive capture cluster from `app.ts` (~lines 3267–3628): `updatePickerButtonText`, `renderPickerPanel`, `createPickerRadioRow`, `createPickerCheckboxRow`, `applyPickerSelection`, `populatePickerSources`, `enumerateDevices`, `updateScreenStream`, `updateCameraStream`, `updateAudioStream`, `updateWindowStreams`, `cleanupWindowStreams`.
- The module imports state (bindings + setters) from `../../state.js`, DOM from `../dom/elements.js`, and uses `window.electronAPI` / `navigator.mediaDevices` as before. Inter-cluster calls stay internal.
- `app.ts`: delete the moved definitions; import the entry points it still calls (picker handlers, recording-start stream calls, cleanup). Usages unchanged.

Behavior-preserving — function bodies unchanged; only their location and explicit imports change. Background-image functions stay in `app.ts` (separate concern, later change).

## Capabilities

### New Capabilities
- `renderer-capture-source-module`: The source-picker UI and capture-stream management live in `src/renderer/features/capture/source-picker.ts`, consuming `state.js` (live bindings + setters) and `elements.js`; `app.ts` imports the entry points. Behavior-preserving; validated by the renderer-health e2e gate.

### Modified Capabilities
<!-- None at the spec/requirement level. Mechanical relocation; no product behavior change. -->

## Impact

- **New file**: `src/renderer/features/capture/source-picker.ts` (12 functions + its state/element/IPC imports).
- **Renderer**: `app.ts` loses ~360 lines of function bodies, gains a named import of the entry points; usages unchanged.
- **Build/boundaries**: bundled by esbuild; module consumes `state.js`/`elements.js` (esbuild resolves the app.ts↔module references in-bundle).
- **Tests**: no new logic → no required unit test; `tsc` proves import completeness, the renderer-health e2e gate proves the app boots with the module loaded, full `npm run check` is the release gate.
- **Docs**: `docs/production/target-architecture.md` adds the module.
- **Deferred (later changes)**: overlays, audio-overlays, recording lifecycle, render/export, drawing/compositing, editor transport, background-image.
- **Risk**: low. Mechanical relocation behind the proven keystone; typecheck-guided import reconciliation; the gate is the behavioral proof.
