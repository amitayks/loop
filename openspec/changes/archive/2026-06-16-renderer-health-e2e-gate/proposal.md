## Why

The upcoming `app.ts` decomposition (Change 4: state container; Change 5+: feature extraction) risks renderer-side **runtime** errors — temporal-dead-zone, import order, undefined-after-refactor — that `tsc`/lint cannot catch. The current e2e net does not catch them: `tests/e2e/smoke-electron.test.ts` spawns Electron, waits 4s, and only asserts the **main** process didn't exit early. It captures renderer stderr but never asserts on it, so if the renderer throws on load the window stays open, main keeps running, and the smoke **passes**. We need a real renderer-health gate before doing the risky work — cheap, deterministic, and able to catch the integration-level crashes that unit tests can't.

## What Changes

- `src/main/app/create-window.ts`: add optional injected callbacks `onDidFinishLoad` and `onRenderProcessGone`; wire `webContents.on('did-finish-load')` and `webContents.on('render-process-gone')`. Keep the existing `console-message` wiring and dependency-injected shape (so it stays unit-testable).
- `src/main.ts`: in `createMainWindow`, emit stable stdout markers — `[renderer-loaded]` on did-finish-load, `[renderer-gone] <reason>` on render-process-gone — alongside the existing `[renderer:<level>]` console forwarding.
- `src/preload.ts`: add a tiny diagnostic — forward `window` `error` and `unhandledrejection` to `console.error('[renderer-uncaught] …')` so uncaught renderer exceptions surface with a stable marker. Preload stays a narrow bridge (diagnostics only, no business logic).
- `tests/e2e/smoke-electron.test.ts`: rewrite to capture **stdout+stderr**, keep the early-exit check, then **require** `[renderer-loaded]` within a generous timeout (proves the renderer actually loaded) and **fail** on any `[renderer:3]` (error-level console), `[renderer-uncaught]`, or `[renderer-gone]` marker, quoting the offending lines.
- New unit tests: `create-window.test.ts` (DI mock asserts the three webContents events wire to their callbacks) and `preload-error-forwarding.test.ts` (jsdom: dispatching `error`/`unhandledrejection` calls `console.error` with the marker).

Explicitly **not** built here: a full Playwright/Electron UI-driving suite for the editor flows (see design.md for the rationale and the alternative).

## Capabilities

### New Capabilities
- `renderer-health-gate`: The e2e smoke proves the renderer loaded and ran without errors — it requires a positive `[renderer-loaded]` signal and fails on renderer console errors, uncaught exceptions, or a gone render process. The main-process window factory surfaces `did-finish-load` and `render-process-gone` via injected callbacks, and the preload forwards uncaught renderer errors/rejections with a stable marker.

### Modified Capabilities
<!-- None. The placeholder smoke had no spec capability; this introduces the gate as a new capability. No product behavior changes. -->

## Impact

- **Main**: `src/main/app/create-window.ts` (new callbacks + event wiring), `src/main.ts` (marker emission).
- **Preload**: `src/preload.ts` (additive uncaught-error forwarder).
- **Tests**: rewritten `tests/e2e/smoke-electron.test.ts`; new `tests/unit/create-window.test.ts`, `tests/unit/preload-error-forwarding.test.ts` (jsdom env).
- **No renderer change**: `src/renderer/app.ts` is untouched (deliberately — this is test-infra + diagnostics).
- **Runtime/startup + release integrity**: this touches startup diagnostics and the smoke itself, so the **full `npm run check`** (lint, typecheck, test, e2e smoke, packaging smoke) must pass; CI already runs these.
- **Docs**: `docs/production/runbook.md` and `docs/production/target-architecture.md` document the marker protocol and the deferred full-UI-e2e decision.
- **Deferred (out of scope, noted for later)**: full UI-driven flow e2e (record→edit→render, split/delete, overlay trim, output-mode switch, undo/redo) with media fixtures. Per-flow behavioral safety is instead delivered via test-first unit extraction during Change 4/5.
- **Risk**: low. Additive diagnostics; no product behavior change. Main risk is smoke flakiness — mitigated by generous timeouts, explicit positive/negative markers, and reused child-cleanup.
