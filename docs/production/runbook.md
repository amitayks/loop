# Production Runbook

## Environment
- Copy `.env.example` to `.env`.
- Set `ELEVENLABS_API_KEY` for realtime transcription token generation.

## Local Verification
- `npm run build` (compiles TS, **bundles the renderer** via esbuild → `dist/renderer/app.bundle.js`, copies assets, builds styles)
- `npm run check`

> The renderer is bundled (esbuild, `scripts/bundle-renderer.mjs`) so the browser-loaded ESM entry can
> consume the CommonJS `shared/domain/*` modules. `index.html` loads `app.bundle.js`. `pretest:e2e` and
> `prepackage:smoke` run a full `build` so those gates always use a fresh bundle. See target-architecture
> "Renderer Bundle" for the browser-safe-shared invariant.

`check` runs:
- lint (`eslint`)
- static checks (`tsc --noEmit`)
- unit + integration tests (`vitest` with coverage thresholds)
- Electron smoke e2e (`tests/e2e/smoke-electron.test.ts`)
- packaging smoke (`scripts/package-smoke.mjs`)

## CI
- Workflow: `.github/workflows/ci.yml`
- Verifies style build, lint, typecheck, test suite, e2e smoke, packaging smoke.

## Renderer Health Gate (e2e smoke)

The Electron smoke (`tests/e2e/smoke-electron.test.ts`) is a renderer **health/crash gate**, not
a UI-flow suite. It spawns `electron .`, observes only stdout/stderr (it has no `webContents`
handle), and asserts a healthy boot via a stable **marker protocol**:

| Marker | Emitted by | Meaning |
| --- | --- | --- |
| `[renderer-loaded]` | `main.ts` from `onDidFinishLoad` (`webContents` `did-finish-load`) | Positive readiness — the renderer finished loading. |
| `[renderer-gone] <reason>` | `main.ts` from `onRenderProcessGone` (`webContents` `render-process-gone`) | The render process crashed or was killed. |
| `[renderer-uncaught] <message>` | `preload.ts` `window` `error` / `unhandledrejection` listeners (via `console.error`) | An uncaught renderer exception or rejection. |
| `[renderer:<level>] …` | `main.ts` `onConsoleMessage` (`webContents` `console-message`); level `3` = error | Forwarded renderer console output. |

How the smoke asserts them: it accumulates stdout+stderr into one buffer, keeps the legacy
`<3000ms` early-exit check, then polls up to ~8000ms for `[renderer-loaded]`. It **fails** if that
marker never appears, or if the buffer contains any of `[renderer:3]`, `[renderer-uncaught]`, or
`[renderer-gone]` (quoting the offending line(s)); otherwise it terminates the child via the
cross-platform `terminateChild` cleanup and passes. The markers are bracketed, specific strings
that are unlikely to collide with normal app logging.

This gate catches integration-level runtime faults that unit tests cannot — renderer console
errors, uncaught exceptions, a gone render process, and a renderer that never finishes loading —
which is the failure surface that whole-`app.ts` extraction work can introduce.

**Deferred:** a full UI-flow e2e (record → edit → render → split → overlay-trim → output-mode →
undo/redo) is intentionally **not** built here. It needs media fixtures, is slow/flaky, and adds a
heavy new dependency; the per-flow behavioral coverage it would provide is produced more granularly
and reliably as unit tests when each flow is extracted out of `app.ts`. It is recorded as an
optional future enhancement once `app.ts` is modular enough to load a project deterministically in
test.

## Packaging
- Use `npm run package:smoke` as a release gate before publishing artifacts.
