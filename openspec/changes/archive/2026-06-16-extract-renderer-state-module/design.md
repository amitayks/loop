## Context

`app.ts` declares ~91 module-level mutable globals (confirmed `grep` count). Scout classification: ~21 are stable-binding (arrays/Maps/caches, never reassigned, only mutated in place); ~69 are reassignable primitives/objects. The highest-frequency global, `editorState` (~394 references), is reassigned only twice. The renderer is esbuild-bundled, so a `state.ts` module is linked into the same bundle; ESM live-binding semantics are preserved by esbuild. The renderer-health e2e gate exists to prove boot/behavior.

## Goals / Non-Goals

**Goals:**
- One module owns mutable renderer state; `app.ts` and future feature modules share it.
- Minimal churn and zero risk of silent corruption.
- Strictly behavior-preserving; gate stays green.

**Non-Goals:**
- No feature-module extraction (next changes).
- No moving of function-local variables.
- No behavior/semantic changes to any state transition.

## Decisions

### D1 — Live bindings + setters, NOT a `state.foo` object rewrite
A single `state` object would force rewriting **every read** (`foo` → `state.foo`) across ~thousands of sites. A blind textual `\bfoo\b` → `state.foo` would also silently corrupt **string literals** (`'recording'`) and **property keys** (`{ recording: … }`) — defects `tsc` cannot catch.

**Decision:** export each global from `state.ts`; `app.ts` keeps reading `foo` unchanged (ESM live binding reflects the current value across modules) and only rewrites **reassignments** to setter calls. This cuts the edit count to ≈ the number of reassignment sites and touches nothing but real assignments — no strings, no property keys.

- **Category A (never reassigned):** `export const foo = <init>` (arrays/Maps/caches). Imported by name; mutated in place; zero churn. Each must be verified truly never-reassigned (only `.push`/`.set`/index-assignment) before being treated as `const`.
- **Category B (reassigned):** `export let foo = <init>` + `export function setFoo(v: T): void { foo = v; }`. Reads unchanged; `foo = x` → `setFoo(x)`; `foo += x` → `setFoo(foo + x)`; `foo++` → `setFoo(foo + 1)`; `persistQueue = persistQueue.then(…)` → `setPersistQueue(persistQueue.then(…))`.

*Trade-off:* read/write asymmetry (read `foo`, write `setFoo`) and ~69 small setters (boilerplate). Accepted for the large safety/churn win. Feature modules later import `{ foo, setFoo }` as needed.

### D2 — Typecheck-guided, string-safe migration
After deleting the declarations from `app.ts`, `tsc --build` reports every now-undefined **bare variable** reference at exact locations. Adding the named import resolves the reads; each reassignment location is converted to a setter. Because `tsc` flags only undefined *variables* (never strings or property keys), this method is inherently string-safe and complete: iterate until typecheck is clean. **No blind `sed` across a name.**

### D3 — Types travel with the state
The globals use types declared as local interfaces in `app.ts` (`TrimDragState`, `BackgroundDragState`, `CropDragState`, `OverlayTrimDragState`, `ProxyEntry`, `TakeVideos`, `AppMediaRecorder`, `PickerMode`, `SpeechSegment`, …) plus domain types from `shared/types`. `state.ts` needs these. Decision: move the small state-only local interfaces into `state.ts` (and import them back into `app.ts` if it still references them), and keep importing domain types from `shared/types`. Keep declarations identical — just relocated.

### D4 — esbuild preserves live bindings; the gate proves it
ESM live bindings across modules are standard and bundler-supported; esbuild implements them. There is no TDZ risk because `app.ts` imports `state.ts`, so `state.ts` initializes first in the bundle. The runtime proof is the renderer-health e2e gate: if a live binding or setter were wrong, the app would misbehave/throw on boot and the gate would fail.

### D5 — Verification by gate + typecheck, not new unit tests
Mechanical relocation, no new logic. `tsc` proves completeness; the e2e health gate proves runtime behavior; full `npm run check` (incl. packaging smoke) is the release gate. No bespoke unit test would add signal beyond these.

## Risks / Trade-offs

- **[A "stable" binding is actually reassigned somewhere]** → it would need a setter; treating it as `const` then reassigning is a `tsc` error (assign to const) → caught immediately. Verify each Category-A by grepping for `name =` (non-property) before choosing `const`.
- **[Init-expression depends on another global/DOM/local]** → most inits are `null`/`[]`/`0`/`false`/`new Map()`. Any cross-dependent init is ordered within `state.ts`; an init referencing a DOM element or app.ts-local must be handled (move the dep or keep that init in app.ts). Typecheck/gate catch breakage.
- **[Missed a reassignment → still reads as undefined]** → typecheck flags it (undefined name) before runtime.
- **[Hot-path setter overhead]** (e.g. `setEditorDrawRAF` per frame) → a function call per frame is negligible; no measurable perf impact.
- **[Compound/`++` assignments mishandled]** → enumerate and convert each explicitly; typecheck catches a leftover bare reassignment to an imported `let` (not allowed) as an error.

## Migration Plan

Behavior-preserving; no data migration, no flag. Single implementer creates `state.ts`, deletes app.ts declarations, adds imports, converts reassignments (typecheck-guided), then full `npm run build` + `npm run check` (e2e gate is the key proof). Rollback = revert the commit.

## Open Questions

- None blocking. Feature-module extraction that consumes `state.ts` + `elements.ts` is the next phase and is intentionally out of scope here.
