## Context

Post-keystone, `app.ts` functions reference state via `state.ts` (live bindings + setters) and DOM via `elements.ts`. The recording cluster is scattered across `app.ts` (audio meter ~3917–3940, recorder/lifecycle ~3953–4316, `stopRecording` ~4942, `updateTimer` ~5168, `ensureMediaInitialized` ~1680) but is one cohesive domain: acquire streams (via the capture module) → record → meter audio → stream transcript → stop → process. The renderer is esbuild-bundled and the renderer-health e2e gate exists. `extract-capture-source-module` already moved stream management into `features/capture/source-picker.ts`, which currently back-imports `startAudioMeter`/`stopAudioMeter` from `app.js`.

## Goals / Non-Goals

**Goals:**
- Move the recording cluster into one module consuming `state.js`/`elements.js`/`pcm-utils.js`/capture.
- Resolve the capture module's audio-meter back-import to `recording.js`.

**Non-Goals:**
- No behavior change; no function-body edits.
- No extraction of drawing/compositing, overlays, transport, etc. (later changes).

## Decisions

### D1 — Gather the scattered recording functions into one module
Despite being non-contiguous, the functions form one domain. Collect them into `features/recording/recording.ts`. Inter-cluster calls (e.g. `startRecording` → `createRecorder`/`addAudioToStream`/`startAudioMeter`) resolve internally.

### D2 — Consume capture, state, elements, pcm-utils
`recording.ts` imports: capture functions (`updateScreenStream`/…/`cleanupWindowStreams`) from `../capture/source-picker.js`; state bindings+setters from `../../state.js`; DOM from `../dom/elements.js`; `mergeInt16Arrays` from `./pcm-utils.js`. Web Audio / MediaRecorder / `window.electronAPI` stay ambient. Helpers still in `app.ts` that recording calls (e.g. `updatePreview`, persistence/section helpers) are imported from `../../app.js` (circular, esbuild-handled) and shrink as those domains extract.

### D3 — Repoint the capture back-import
`source-picker.ts` currently imports `startAudioMeter`/`stopAudioMeter` from `../../app.js`. After this change they live in `recording.ts`, so repoint that import to `../recording/recording.js`. Net: capture no longer back-imports those from `app.ts`.

### D4 — ensureMediaInitialized by coupling
`ensureMediaInitialized` (~1680) is included only if it is recording-specific; if shared by non-recording flows it stays in `app.ts` and `recording.ts` imports it. The implementer decides from its call sites (typecheck keeps it honest either way).

### D5 — Typecheck-guided reconciliation; gate + typecheck as proof
After moving, iterate `tsc --build` to 0 errors (every referenced state binding/setter/element/sibling/import resolved; every entry point `app.ts` calls imported), then `lint --max-warnings=0` prunes unused imports across the three touched files. Recording runs on user interaction; the e2e gate proves the app boots cleanly with the module loaded, and `tsc` proves import completeness — sufficient for a behavior-preserving move.

## Risks / Trade-offs

- **[A moved function references many not-yet-extracted helpers]** → import them from `app.js` (circular, fine in-bundle); keep the count minimal; they resolve as later domains extract.
- **[Audio-meter / recorder timing]** → bodies are unchanged, so timing/behavior is preserved by construction; the gate confirms boot health.
- **[`updateMeter` is a nested function]** → it moves inside `startAudioMeter` (its enclosing function), unchanged.
- **[Circular import recording ↔ capture]** → esbuild resolves; the gate proves runtime correctness.

## Migration Plan

Behavior-preserving; no data migration, no flag. Single implementer creates the module, moves the cluster, reconciles imports (typecheck-guided), repoints capture's back-import, rewires `app.ts`; then full `npm run build` + `npm run check`. Rollback = revert the commit.

## Open Questions

- None blocking. Subsequent domains follow the same pattern.
