## Why

`src/renderer/app.ts` (~7,560 lines) opens with ~97 module-level DOM element bindings (`const x = document.getElementById('…')`, `getContext`, helper `createElement` canvases) plus their dimension setup. These bindings are the shared substrate every feature touches; they must live in one importable module before feature logic can be pulled out of the god-file. With the renderer now bundled by esbuild, a shared `elements.ts` imported by `app.ts` (and future feature modules) resolves cleanly. This is the safe first half of the decomposition "keystone" — the mutable state container is the next change.

## What Changes

- Add `src/renderer/features/dom/elements.ts` exporting every module-level DOM element binding currently declared in `app.ts` (preserving exact ids, type casts, and `!` assertions), grouped by view (project-home, recording, processing, editor). Include the module-init **dimension setup** that belongs with them (canvas `width`/`height` assignments, the helper zoom-buffer canvases), importing `CANVAS_W`/`CANVAS_H` from `shared/domain/canvas.js`.
- `app.ts`: delete those declarations and their init side-effects; add `import { … } from './features/dom/elements.js';` (named imports). **Every existing usage stays identical** — only the declaration block moves.

What stays in `app.ts`: the stray mutable global `let editorRenderTimeout`, all other mutable state globals (next change), and function-local element creation (e.g. the per-take `createElement('video')` inside `getOrCreateTakeVideos`).

Strictly behavior-preserving. Named exports → zero usage churn.

## Capabilities

### New Capabilities
- `renderer-dom-elements-module`: All module-level DOM element bindings (and their dimension setup) live in `src/renderer/features/dom/elements.ts` and are imported by name into `app.ts`; future feature modules import their DOM dependencies from here. Behavior-preserving; validated by the renderer-health e2e gate.

### Modified Capabilities
<!-- None at the spec/requirement level. Mechanical relocation; no product behavior change. -->

## Impact

- **New file**: `src/renderer/features/dom/elements.ts` (~100 `export const` element bindings + dimension setup).
- **Renderer**: `app.ts` loses the ~97 element declarations + their init side-effects, gains a named import block; ~1000+ usages unchanged. `let editorRenderTimeout` and other globals remain.
- **Build/boundaries**: `elements.ts` imports geometry constants from `shared/domain/canvas.js` (browser-safe); bundled by esbuild like the rest of the renderer.
- **Tests**: no new logic, so no required unit test; the renderer-health e2e gate (`[renderer-loaded]`, fails on renderer errors) and `tsc` (catches any element used-but-not-imported) are the gates. Full `npm run check` must pass.
- **Docs**: `docs/production/target-architecture.md` records the DOM-bindings module.
- **Deferred (next change)**: the mutable state container (`state.ts`) for the ~91 globals.
- **Risk**: low. Mechanical relocation; named imports keep usages identical; timing is safe (bundle runs after DOM parse). The gate proves the app still boots and resolves all elements.
