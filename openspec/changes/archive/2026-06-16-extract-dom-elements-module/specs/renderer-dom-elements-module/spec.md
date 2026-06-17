## ADDED Requirements

### Requirement: DOM element bindings live in a dedicated module

All module-level DOM element bindings the renderer uses (those currently declared as `const … = document.getElementById(...)` / `querySelector` / canvas `getContext` / module-init helper `createElement` canvases in `app.ts`) SHALL be defined in `src/renderer/features/dom/elements.ts` as individual named `export const` bindings, preserving each element's id, type cast, and non-null assertion. The module-init dimension setup associated with those elements (canvas `width`/`height`, helper zoom-buffer canvases) SHALL live in this module, importing geometry constants from `shared/domain/canvas.js`. `app.ts` SHALL import these bindings by name and SHALL NOT redeclare them.

#### Scenario: Elements resolved once in the module
- **WHEN** the renderer bundle loads (after the DOM is parsed)
- **THEN** `elements.ts` resolves each element via `getElementById`/`querySelector` and exports it, and `app.ts` uses the imported bindings with identical references

#### Scenario: No duplicate declarations in app.ts
- **WHEN** the renderer needs a DOM element binding that was moved
- **THEN** it is imported from `./features/dom/elements.js` and `app.ts` contains no local `const … = document.getElementById(...)` for it

### Requirement: Relocation is behavior-preserving

Moving the DOM bindings SHALL NOT change any usage or runtime behavior. Element usages in `app.ts` SHALL remain identical (named imports), function-local element creation SHALL remain in `app.ts`, and mutable state globals (e.g. `editorRenderTimeout`) SHALL remain in `app.ts`.

#### Scenario: App boots cleanly after relocation
- **WHEN** the renderer-health e2e smoke runs against the build
- **THEN** it observes `[renderer-loaded]` with no `[renderer:3]` / `[renderer-uncaught]` / `[renderer-gone]` markers (every element still resolves)

#### Scenario: Type system proves completeness
- **WHEN** `npm run typecheck` (`tsc --build`, strict) runs
- **THEN** it succeeds, proving every element referenced in `app.ts` is imported from the elements module (no undefined names) and no import is unused
