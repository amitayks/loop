## 1. Main-process load/crash event wiring

- [x] 1.1 Add `tests/unit/create-window.test.ts`: inject a fake `BrowserWindow` whose `webContents.on(event, handler)` records handlers and a `setContentProtection`/`loadFile` no-op; call `createWindow({ BrowserWindow, onConsoleMessage, onDidFinishLoad, onRenderProcessGone })`; invoke the recorded `console-message`, `did-finish-load`, and `render-process-gone` handlers and assert each injected callback fires with forwarded args (crash reason for render-process-gone). (Failing first.)
- [x] 1.2 `src/main/app/create-window.ts`: extend `CreateWindowOptions` with optional `onDidFinishLoad?: () => void` and `onRenderProcessGone?: (details: { reason?: string }) => void`; wire `win.webContents.on('did-finish-load', …)` and `win.webContents.on('render-process-gone', (e, details) => …)`. Keep existing `console-message` wiring + DI shape. Make 1.1 pass via `npx vitest run tests/unit/create-window.test.ts`.
- [x] 1.3 `src/main.ts` `createMainWindow`: pass `onDidFinishLoad: () => console.log('[renderer-loaded]')` and `onRenderProcessGone: (d) => console.log('[renderer-gone] ' + (d?.reason ?? 'unknown'))`; keep the existing `onConsoleMessage` logging `[renderer:${level}] …`.

## 2. Preload uncaught-error forwarding

- [x] 2.1 Add `tests/unit/preload-error-forwarding.test.ts` with `// @vitest-environment jsdom` at the top; spy on `console.error`; load/trigger the preload's forwarders; dispatch a `window` `error` event and an `unhandledrejection` and assert `console.error` was called with a string starting `[renderer-uncaught] `. (Factor the forwarder so it is testable without the full contextBridge — e.g. an exported `installRendererErrorForwarding()` the preload calls, or dispatch against the listeners the preload registers.)
- [x] 2.2 `src/preload.ts`: register `window.addEventListener('error', e => console.error('[renderer-uncaught] ' + (e?.message ?? e)))` and `window.addEventListener('unhandledrejection', e => console.error('[renderer-uncaught] ' + (e?.reason)))`. Keep it tiny (narrow bridge). Make 2.1 pass.

## 3. Rewrite the e2e smoke into a health gate

- [x] 3.1 `tests/e2e/smoke-electron.test.ts`: capture BOTH stdout and stderr into one accumulated buffer; keep the cross-platform spawn spec (incl. CI `--no-sandbox`) and the `terminateChild` cleanup and the <3000ms early-exit check. Then: poll the buffer for up to ~8000ms for `[renderer-loaded]`; FAIL (with message) if it never appears; FAIL if the buffer contains `[renderer:3]`, `[renderer-uncaught]`, or `[renderer-gone]`, including the offending line(s) in the error; otherwise succeed. Ensure the child is always terminated.

## 4. Verification & docs

- [x] 4.1 `npm run typecheck` and `npm run lint` (`--max-warnings=0`) — green.
- [x] 4.2 `npm run test` — new unit suites (`create-window`, `preload-error-forwarding`) pass; all existing suites stay green.
- [x] 4.3 `npm run test:e2e` — the rewritten smoke passes on a healthy build (observes `[renderer-loaded]`, no error markers). Run it a second time to sanity-check non-flakiness.
- [x] 4.4 Full `npm run check` (lint → typecheck → test → e2e smoke → package smoke) — green.
- [x] 4.5 Update `docs/production/runbook.md` and `docs/production/target-architecture.md`: document the marker protocol (`[renderer-loaded]`, `[renderer-gone]`, `[renderer-uncaught]`, `[renderer:<level>]`), how the smoke asserts them, and the explicit decision to defer full UI-flow e2e.

## 5. Hand-off

- [x] 5.1 Summarize what the gate now catches (renderer console errors, uncaught exceptions, gone process, missing load signal) vs before (only main early-exit), tests added, commands run, residual risk (post-window errors), and the deferred full-UI-e2e item.
