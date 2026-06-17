## Why

`src/renderer/app.ts` (~7,551 lines) holds ~91 module-level mutable state globals (`editorState`, `recording`, `screenStream`, drag/picker/overlay flags, caches/pools, …). They are the shared mutable substrate every feature touches. To extract feature logic out of the god-file, those globals must live in one module that both `app.ts` and future feature modules can read and mutate. With the renderer now esbuild-bundled, a shared `state.ts` resolves cleanly (including circular imports). This is the second half of the decomposition keystone (the DOM-elements module already shipped).

## What Changes

- Add `src/renderer/state.ts` as the renderer state store:
  - **Stable-binding state** (never reassigned — arrays, Maps, caches/pools; ~21 of them) → `export const foo = …`. Imported by name; **zero usage churn** (mutated in place via `.push`/`.set`).
  - **Reassignable state** (~69: `editorState`, `recording`, streams, drag/picker flags, timers, …) → `export let foo = …` plus `export function setFoo(v)`. **Reads stay byte-identical** via ESM live bindings; only **reassignments** become setter calls.
- `app.ts`: delete the global declarations; add named imports from `./state.js`; convert only reassignment sites (`foo = x` → `setFoo(x)`, compounds/increments handled). All reads and all property mutations (`editorState.currentTime = x`, `recorders.push(…)`) stay unchanged.

This is the low-churn, low-risk migration: edit count ≈ number of reassignment sites (e.g. `editorState` has 2, `recording` has 3), not the thousands of read sites. Strictly behavior-preserving.

## Capabilities

### New Capabilities
- `renderer-state-module`: All module-level mutable renderer state lives in `src/renderer/state.ts` — stable bindings as `export const`, reassignable state as `export let` + setters. `app.ts` reads via live bindings (unchanged) and writes via setters; future feature modules share state through this module. Behavior-preserving; validated by the renderer-health e2e gate + typecheck.

### Modified Capabilities
<!-- None at the spec/requirement level. Mechanical relocation; no product behavior change. -->

## Impact

- **New file**: `src/renderer/state.ts` (~91 bindings; consts for stable state, `let` + setters for reassignable state; plus any state-only type definitions it needs).
- **Renderer**: `app.ts` loses the global declarations, gains state imports; reassignment sites become setter calls (small count); reads/property-mutations unchanged. Function-local variables untouched.
- **Types**: small local interfaces used by the globals (e.g. `TrimDragState`, `ProxyEntry`, `TakeVideos`, `PickerMode`) may move to / be shared with `state.ts`; domain types continue to come from `shared/types`.
- **Build/boundaries**: bundled by esbuild; live-binding semantics preserved (proven at runtime by the e2e gate).
- **Tests**: no new logic → no required unit test; `tsc` (strict) proves completeness (every moved global is imported or set), the renderer-health e2e gate proves the app still boots and behaves, and full `npm run check` is the release gate.
- **Docs**: `docs/production/target-architecture.md` records the state store.
- **Deferred (next changes)**: extracting feature modules (picker, overlays, audio-overlays, recording, render, drawing, transport) that consume `state.ts` + `elements.ts`.
- **Risk**: medium, well-bounded. Live bindings keep reads identical (no string/property-key corruption); the typecheck-guided method guarantees completeness; the e2e gate catches any runtime regression. Main watch items: init-expression dependencies, compound assignments, and confirming each "stable" binding is truly never reassigned.
