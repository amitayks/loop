## 1. Classify the globals

- [x] 1.1 Enumerate all ~91 module-level mutable globals in `app.ts` (`grep -nE '^    (let|const) '` plus the scattered ones). For EACH, grep `app.ts` for a binding reassignment (`^\s*<name>\s*(=|\+=|-=|\*=|\?\?=)` and `<name>\+\+`/`<name>--`, excluding `.<name>` property and `<name>:` key). Classify: Category A (zero reassignments → `const`) vs Category B (≥1 reassignment → `let` + setter). Record the reassignment site line numbers per Category-B global.
- [x] 1.2 Identify the type definitions the globals use that are declared locally in `app.ts` (e.g. `TrimDragState`, `BackgroundDragState`, `CropDragState`, `OverlayTrimDragState`, `ProxyEntry`, `TakeVideos`, `AppMediaRecorder`, `PickerMode`, `SpeechSegment`, `EditorState`, …). Decide which move into `state.ts` (state-only) vs stay/import from `shared/types`.

## 2. Create the state module

- [x] 2.1 Create `src/renderer/state.ts`. Move/declare the needed types. For Category A: `export const foo = <exact init>;`. For Category B: `export let foo = <exact init>;` and `export function setFoo(v: <T>): void { foo = v; }`. Preserve exact initial values and types. Order declarations so any init that references another state binding comes after it. Import domain types from `shared/types` and geometry/constants from `shared/domain/*` as needed (browser-safe only).

## 3. Rewire app.ts (typecheck-guided, string-safe)

- [x] 3.1 Delete the moved global declarations from `app.ts`. Add named imports from `./state.js` for the bindings `app.ts` reads, plus the setters it needs.
- [x] 3.2 Run `npm run typecheck`. It reports every now-undefined bare reference. Resolve reads by ensuring the binding is imported; resolve each reassignment by converting to a setter call (`foo = x` → `setFoo(x)`; `foo += x` → `setFoo(foo + x)`; `foo++` → `setFoo(foo + 1)`; promise-chain reassignments likewise). Do NOT alter property mutations (`editorState.currentTime = x`) or any string/property-key. Iterate typecheck until clean. NEVER blind-sed a name across the file.
- [x] 3.3 Run `npm run lint` (`--max-warnings=0`); remove any unused imports (a moved global app.ts no longer references) and fix any leftover `prefer-const`/no-undef. Keep function-local variables untouched.

## 4. Verification & docs

- [x] 4.1 `npm run build` — completes; `dist/renderer/app.bundle.js` rebuilt (esbuild inlines `state.ts`).
- [x] 4.2 `npm run typecheck` + `npm run lint` — green (proves completeness + string-safety).
- [x] 4.3 `npm run test:e2e` — renderer-health smoke PASSES (`[renderer-loaded]`, no error markers): state initializes and updates through live bindings + setters at runtime. Run twice for non-flakiness.
- [x] 4.4 Full `npm run check` — green end to end (lint → typecheck → test → e2e smoke → package smoke).
- [x] 4.5 Update `docs/production/target-architecture.md`: record `src/renderer/state.ts` as the renderer state store (const stable bindings + `let`/setters for reassignable state; live-binding reads), imported by `app.ts` and future feature modules.

## 5. Hand-off

- [x] 5.1 Summarize: Category A/B counts; total reassignment sites converted (should be small, e.g. `editorState` = 2); confirmation reads are unchanged; commands run; gate green; what remains in `app.ts` (function-local vars); next phase = feature-module extraction consuming `state.ts` + `elements.ts`.
