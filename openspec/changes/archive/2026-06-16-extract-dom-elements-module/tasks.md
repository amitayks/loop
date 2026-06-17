## 1. Create the elements module

- [x] 1.1 Identify every MODULE-LEVEL DOM element binding in `app.ts`: `const … = document.getElementById(...)` / `querySelector(...)` / canvas `.getContext('2d')` / module-init `document.createElement('canvas')` helper buffers. The bulk is lines ~251–350; also the scattered module-scope ones (`editorAudioTrack0` ~2695, `editorBgZoomScrub`/`editorPipSizeScrub` ~6814–6815). Confirm each is module-scope (NOT inside a function) before including it. Exclude function-local creation (e.g. `createElement('video')` inside `getOrCreateTakeVideos`).
- [x] 1.2 Create `src/renderer/features/dom/elements.ts`: move each identified binding here as `export const …`, preserving exact id, type cast (`as HTMLInputElement` etc.), and `!`. Group with comments by view (project-home / recording / processing / editor). Include the associated module-init dimension setup (canvas `width`/`height`; eager zoom-buffer canvases), importing `CANVAS_W`, `CANVAS_H` (and any other needed geometry constants) from `../../shared/domain/canvas.js`. No business logic.

## 2. Rewire app.ts

- [x] 2.1 In `app.ts`: delete the moved element declarations and their module-init dimension setup. Add a named `import { … } from './features/dom/elements.js';` listing every moved element that `app.ts` still references. Keep `let editorRenderTimeout` and all other globals; keep function-local element creation. Do NOT change any element usage.
- [x] 2.2 Reconcile imports: ensure every element referenced in `app.ts` is imported (typecheck will flag undefined names) and no imported element is unused (lint `--max-warnings=0` will flag unused). Remove from the import list any element that, after moving, is no longer used in `app.ts` (it lives in `elements.ts` and may be consumed by future modules — but `app.ts` should only import what it uses).

## 3. Verification & docs

- [x] 3.1 `npm run build` — completes; `dist/renderer/app.bundle.js` rebuilt (esbuild inlines `elements.ts`).
- [x] 3.2 `npm run typecheck` and `npm run lint` (`--max-warnings=0`) — green (proves all elements imported, none unused).
- [x] 3.3 `npm run test:e2e` — renderer-health smoke PASSES (`[renderer-loaded]`, no error markers): every element still resolves at boot. Run twice for non-flakiness.
- [x] 3.4 Full `npm run check` — green end to end (lint → typecheck → test → e2e smoke → package smoke).
- [x] 3.5 Update `docs/production/target-architecture.md`: record `src/renderer/features/dom/elements.ts` as the DOM-bindings module imported by `app.ts` (and future feature modules).

## 4. Hand-off

- [x] 4.1 Summarize: behavior unchanged (named imports, usages identical); element count moved; what stayed in `app.ts` (stray `let`, function-local creation, state globals); commands run; gate green; next change = state container.
