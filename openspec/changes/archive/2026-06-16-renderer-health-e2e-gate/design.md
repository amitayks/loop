## Context

`tests/e2e/smoke-electron.test.ts` spawns `electron .` as a child process, waits 4000ms, and fails only if the process exits before 3000ms or has a non-null exit code. It buffers stderr but never asserts on it. Renderer JS errors do not crash the main process, so they pass undetected. Meanwhile `src/main/app/create-window.ts` already forwards `webContents` `console-message` to an injected `onConsoleMessage` callback (and `src/main.ts` logs it as `[renderer:<level>] …`), so renderer error output already reaches stdout — the test simply ignores it. Available tooling: electron ^35, jsdom ^28, tsx ^4, vitest ^4. No Playwright/Spectron.

Change 4 (state container) and Change 5+ (feature extraction) will move large amounts of `app.ts` and can introduce runtime-only faults. We want a gate that catches those before they ship.

## Goals / Non-Goals

**Goals:**
- The smoke fails when the renderer logs an error, throws an uncaught exception, or its process is gone.
- The smoke requires positive proof the renderer loaded (`did-finish-load`), not just "main didn't exit."
- Keep it deterministic and cross-platform; reuse existing spawn/cleanup logic.
- Keep the new main-process wiring unit-testable (DI).

**Non-Goals:**
- No full UI-driving e2e of editor flows (see D1).
- No remote-debugging / CDP plumbing to `executeJavaScript` against the child process.
- No `src/renderer/app.ts` change.

## Decisions

### D1 — Build a health/crash gate, not a full UI-flow suite
A Playwright/Electron suite that drives record→edit→render→split→overlay-trim→output-mode→undo/redo would be the textbook "characterization" net, but here it is the wrong investment now:
- It needs media fixtures (real recordings) and is inherently flaky and slow; it adds a heavy new dependency (none present).
- `app.ts`'s flows are not importable or drivable in isolation **until they are extracted** — the very work Change 4/5 performs. So behavioral characterization of a flow is naturally produced as a **unit test when that flow's logic is extracted** (the pattern that worked cleanly in Change 1 and 2).

**Decision:** the pre-extraction net is (a) this renderer-health gate — cheap, robust, catches integration-level runtime crashes that unit tests can't — plus (b) per-flow unit coverage added during extraction. Full UI-flow e2e is recorded as a deferred optional enhancement.

*Alternative considered:* add Playwright now. Rejected — high cost/flake/dependency for coverage that the extraction work will produce more granularly and reliably as unit tests.

### D2 — Marker protocol over stdout
The smoke observes the child only through stdout/stderr (it spawns a process; it has no `webContents` handle). So health signals are stable text markers on stdout:
- `[renderer-loaded]` — emitted from `onDidFinishLoad` (positive readiness).
- `[renderer-gone] <reason>` — emitted from `onRenderProcessGone` (crash/kill of the render process).
- `[renderer-uncaught] <message>` — emitted by the preload's `error`/`unhandledrejection` forwarder via `console.error`.
- `[renderer:3] …` — existing console forwarding; level 3 = error.

The smoke: capture stdout+stderr; keep the <3000ms early-exit check; wait up to ~8000ms for `[renderer-loaded]` (fail if absent); fail if any of `[renderer:3]`, `[renderer-uncaught]`, `[renderer-gone]` appear, quoting the offending lines; then terminate the child with the existing `terminateChild` logic.

*Alternative considered:* drive `webContents.executeJavaScript` for a positive DOM assertion. Rejected — requires running the test inside the main process or CDP over a debug port; markers are simpler and sufficient.

### D3 — Keep create-window dependency-injected and unit-test it
`createWindow` already receives `BrowserWindow` and an `onConsoleMessage` callback. Add two more optional callbacks (`onDidFinishLoad`, `onRenderProcessGone`) and wire the corresponding `webContents` events. The unit test injects a fake `BrowserWindow` whose `webContents.on(event, handler)` records handlers, then invokes them and asserts the callbacks fire with forwarded args. No real Electron needed for the unit test.

### D4 — Preload forwarder stays a narrow diagnostic
Add only `window.addEventListener('error', …)` and `window.addEventListener('unhandledrejection', …)` that call `console.error('[renderer-uncaught] …')`. No business logic; consistent with the "preload is a narrow bridge" rule. Unit-tested under jsdom by dispatching the events and asserting `console.error` received the marker. The jsdom file declares its own environment via `// @vitest-environment jsdom` (global vitest env is node).

## Risks / Trade-offs

- **[Smoke flakiness from timing]** → Use a generous (~8s) wait for `[renderer-loaded]`, assert on accumulated output rather than instantaneous state, and reuse the proven cross-platform spawn + `terminateChild` cleanup.
- **[An uncaught error doesn't surface as `console-message`]** → Belt-and-suspenders: the preload's explicit `[renderer-uncaught]` forwarder covers `window.onerror`/`unhandledrejection` regardless of Chromium's console behavior; `render-process-gone` covers hard crashes.
- **[False negative — error logged after the wait window]** → Acceptable for a boot gate; the window is generous and load-time faults dominate the risk we're guarding. Noted as a known limit.
- **[Marker collides with real app output]** → Markers are bracketed, specific strings unlikely to appear in normal logs; documented in the runbook.
- **[CI environment differences]** → Preserve existing `--no-sandbox`/`--disable-setuid-sandbox` on CI Linux and Windows `taskkill` cleanup.

## Migration Plan

Additive; no data migration, no flag. Implement main/preload markers + tests, rewrite the smoke, then run full `npm run check` (which executes the new smoke + packaging smoke). Rollback = revert the commit. The new smoke must be green in CI before relying on it as a gate for Change 4.

## Open Questions

- None blocking. Whether to later add a single fixture-backed "enter editor" UI assertion is left to a future change once `app.ts` is modular enough to load a project deterministically in test.
