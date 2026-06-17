## ADDED Requirements

### Requirement: Main process surfaces renderer load and crash events

`src/main/app/create-window.ts` SHALL accept optional injected callbacks `onDidFinishLoad` and `onRenderProcessGone` (in addition to the existing `onConsoleMessage`) and SHALL wire them to the window's `webContents` `did-finish-load` and `render-process-gone` events. `src/main.ts` SHALL provide handlers that emit the stable stdout markers `[renderer-loaded]` and `[renderer-gone] <reason>` respectively, while continuing to forward console messages as `[renderer:<level>] …`. The factory SHALL remain dependency-injected so the wiring is unit-testable without launching Electron.

#### Scenario: Load and crash events are wired
- **WHEN** `createWindow` is called with `onDidFinishLoad`/`onRenderProcessGone` and the injected `webContents` emits `did-finish-load` / `render-process-gone`
- **THEN** the corresponding callback is invoked (with the crash reason for `render-process-gone`)

#### Scenario: Console errors still forwarded
- **WHEN** the renderer emits an error-level `console-message`
- **THEN** `onConsoleMessage` receives it and `main.ts` logs it as `[renderer:3] …`

### Requirement: Preload forwards uncaught renderer errors

`src/preload.ts` SHALL register `window` listeners for `error` and `unhandledrejection` that forward to `console.error` with the stable marker `[renderer-uncaught] <message>`. This SHALL be a minimal diagnostic only (the preload remains a narrow bridge with no business logic).

#### Scenario: Uncaught error is forwarded
- **WHEN** a `window` `error` event (or `unhandledrejection`) fires in the renderer
- **THEN** `console.error` is called with a string beginning `[renderer-uncaught] `

### Requirement: E2E smoke proves a healthy renderer boot

`tests/e2e/smoke-electron.test.ts` SHALL capture both stdout and stderr from the spawned Electron process and SHALL fail unless the renderer booted healthily: it MUST observe `[renderer-loaded]` within a generous timeout, and it MUST fail if any of `[renderer:3]`, `[renderer-uncaught]`, or `[renderer-gone]` appears (quoting the offending output). The existing early-exit detection and cross-platform spawn/cleanup behavior SHALL be preserved.

#### Scenario: Healthy boot passes
- **WHEN** the app starts, the renderer finishes loading, and no error markers are emitted
- **THEN** the smoke observes `[renderer-loaded]` and exits successfully

#### Scenario: Renderer error fails the smoke
- **WHEN** the renderer logs an error / throws an uncaught exception / its process goes away during the smoke window
- **THEN** the smoke fails and the failure message includes the offending `[renderer:3]` / `[renderer-uncaught]` / `[renderer-gone]` line

#### Scenario: Missing load signal fails the smoke
- **WHEN** the renderer never emits `[renderer-loaded]` within the timeout
- **THEN** the smoke fails indicating the renderer did not finish loading
