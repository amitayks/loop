## ADDED Requirements

### Requirement: Mutable renderer state lives in a state module

All module-level mutable renderer state currently declared in `app.ts` SHALL be defined in `src/renderer/state.ts`. State whose binding is never reassigned (arrays, Maps, caches/pools) SHALL be exported as `export const`. State whose binding is reassigned SHALL be exported as `export let` together with an `export function setX(value)` setter. `app.ts` SHALL import these from `./state.js` and SHALL NOT redeclare them. Any state-only type definitions the module needs SHALL travel with it.

#### Scenario: Stable state exported as const
- **WHEN** a global is only mutated in place (e.g. `recorders.push(...)`, `cache.set(...)`)
- **THEN** it is `export const` in `state.ts`, imported by name, and used unchanged

#### Scenario: Reassignable state exported with a setter
- **WHEN** a global is reassigned (e.g. `editorState = …`, `recording = true`)
- **THEN** `state.ts` exports it as `export let` plus `setX`, and `app.ts` performs the reassignment via `setX(...)`

### Requirement: Reads are unchanged; only reassignments are rewritten

Relocating state SHALL be behavior-preserving. Reads of a state binding in `app.ts` SHALL remain byte-identical (ESM live bindings), and property mutations (e.g. `editorState.currentTime = x`) SHALL remain unchanged. Only binding reassignments SHALL become setter calls. Function-local variables SHALL NOT be moved or rewritten.

#### Scenario: Live-binding reads reflect current value
- **WHEN** `state.ts` updates a reassignable binding via its setter
- **THEN** `app.ts` (and any other importer) reading that binding observes the new value, with no read-site changes

#### Scenario: App boots and behaves after relocation
- **WHEN** the renderer-health e2e smoke runs against the build
- **THEN** it observes `[renderer-loaded]` with no `[renderer:3]` / `[renderer-uncaught]` / `[renderer-gone]` markers (state initializes and updates correctly through live bindings + setters)

#### Scenario: Type system proves completeness and string-safety
- **WHEN** `npm run typecheck` (`tsc --build`, strict) runs
- **THEN** it succeeds — every moved global is either imported (reads) or reassigned via a setter (writes), with no undefined names — and because only undefined variables are flagged, no string literal or property key was altered
