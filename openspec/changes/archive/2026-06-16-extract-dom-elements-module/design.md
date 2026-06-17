## Context

`app.ts` declares ~97 DOM element bindings at module scope (first at line 251 `projectHomeView`, last scattered at line 6815 `editorPipSizeScrub`; the bulk is lines 251–350). They are write-once `const`s — only their properties mutate. The file also performs module-init dimension setup on some canvases (`canvas.width = CANVAS_W`, the zoom-buffer canvases). The renderer is bundled by esbuild, so a separate `elements.ts` module imported by `app.ts` is linked into the same bundle and runs at load. The renderer-health e2e gate now exists to catch any boot-time breakage.

## Goals / Non-Goals

**Goals:**
- One module owns DOM element resolution; `app.ts` imports bindings by name.
- Zero usage churn (named imports keep every reference identical).
- Strictly behavior-preserving; the gate stays green.

**Non-Goals:**
- No mutable state container (next change).
- No moving of function-local element creation.
- No rewriting of usages to a namespace (`DOM.x`).
- No new feature extraction.

## Decisions

### D1 — Named exports, not a namespace object
`elements.ts` exports each binding individually (`export const projectHomeView = …`), and `app.ts` imports them by name. This keeps all ~1000 existing usages byte-identical; the diff is "declarations move out, one import block moves in." A namespace (`import * as DOM`) would force rewriting every usage to `DOM.x` — needless churn and risk. Rejected.

### D2 — Dimension setup moves with the elements
The module-init side-effects that configure element dimensions (canvas `width`/`height`, helper zoom-buffer canvases created via `createElement` and sized to `CANVAS_W`/`CANVAS_H`) are part of "preparing the DOM bindings," so they live in `elements.ts`, which imports the geometry constants from `shared/domain/canvas.js`. This keeps the element + its initial size together and removes the setup from `app.ts`. The zoom buffers are created eagerly (as they are today) — no behavior change.

### D3 — What stays in app.ts
- The stray `let editorRenderTimeout` (~line 349) — a mutable global, not an element.
- All other mutable state globals — deferred to the state-container change.
- Function-local element creation (e.g. `document.createElement('video')` inside `getOrCreateTakeVideos`) — not module-level; leave it.
- Scattered module-scope element consts (`editorAudioTrack0` ~2695, `editorBgZoomScrub`/`editorPipSizeScrub` ~6814–6815) MOVE to `elements.ts` if they are at module scope; if any sits inside a function body, it stays.

### D4 — Timing/bundling safety
The renderer `<script type="module" src="app.bundle.js">` is at the end of `<body>`, so the bundle (and thus `elements.ts`'s module-init `getElementById`) runs after the DOM is parsed. Moving the bindings into an imported module preserves this ordering (the module initializes when first imported during bundle execution). Any element id typo or missing element surfaces as a renderer error → the health gate fails. This is the behavioral proof.

### D5 — Verification by gate + typecheck, not new unit tests
This is mechanical relocation with no new logic. `tsc` (strict) catches any element referenced in `app.ts` but not imported; the renderer-health e2e gate catches any unresolved element at boot; full `npm run check` (incl. packaging smoke) is the release gate. A dedicated unit test would only re-assert what the gate already proves, so none is required.

## Risks / Trade-offs

- **[An element used in app.ts isn't imported]** → `tsc --build` fails (undefined name). Caught before runtime.
- **[A moved init side-effect changes ordering]** → keep the relative order of element resolution + dimension setup; the gate boots the app and confirms. Canvas dimension setup is idempotent and order-independent across distinct canvases.
- **[A scattered const was actually function-local]** → moving it would break scope; the implementer must verify module-scope vs function-scope before moving (typecheck catches an out-of-scope move).
- **[Large import block]** → ~97-name import is verbose but mechanical and lint-clean (all are used; unused ones would fail `--max-warnings=0`, flagging anything app.ts no longer needs).

## Migration Plan

Behavior-preserving; no data migration, no flag. Single implementer moves the declarations + setup into `elements.ts` and rewires `app.ts` imports; then full `npm run build` + `npm run check` (the e2e gate is the key proof). Rollback = revert the commit.

## Open Questions

- None blocking. The state container (`state.ts`) for the mutable globals is the next change and is intentionally out of scope here.
