// ── Interaction-level renderer-health gate (record → take → timeline) ──
//
// Spec: renderer-health-gate "E2E coverage exercises the record-to-timeline
// interaction flow" (design D6). The idle-boot smoke (smoke-electron.test.ts)
// only proves `did-finish-load`; it never records. This test drives the *real*
// flow over the Chrome DevTools Protocol — open a disposable project, enter the
// recording view, select a window source, record ~1s, stop — and asserts:
//   (a) a take with `windowPaths` is created and persisted, and
//   (b) a sampled window-capture frame is non-black.
//
// The CDP-over-`ws` approach (launch Electron with --remote-debugging-port,
// connect to the page target, drive the renderer via Runtime.evaluate) is the
// approach proven for this flow this session; Playwright `_electron` is not a
// dependency. The spawn/markers/cleanup pattern and the cross-platform
// spawn/terminate mirror smoke-electron.test.ts.
//
// Capture needs real desktop capture + Screen Recording permission, which is
// unavailable on headless CI. When sources/permission are missing the test
// self-skips with an explicit `skipped: no capture` stdout signal and exits 0,
// so capture-incapable runners never red-fail (per the renderer-health-gate
// spec, "Capture unavailable on the runner" scenario).

import assert from 'node:assert/strict';
import { spawn, spawnSync, ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';

// `ws` is a transitively-bundled dependency; CDP rides on it. It ships no
// bundled types and `@types/ws` is intentionally not a dependency, so we load
// it via require() and describe only the minimal surface this test uses. This
// keeps the gate self-contained (no new dependency) and type-clean. We resolve
// from this file (CommonJS under tsx, matching smoke-electron.test.ts's
// `__dirname` usage) rather than import.meta, which is unavailable in CJS.
const requireFromHere = createRequire(__filename);

interface MinimalWebSocket {
  on(event: 'message', listener: (data: unknown) => void): void;
  once(event: 'open' | 'error', listener: (err?: Error) => void): void;
  removeListener(event: 'open' | 'error', listener: (...args: unknown[]) => void): void;
  send(data: string, cb?: (err?: Error) => void): void;
  close(): void;
}
interface WebSocketCtor {
  new (url: string, options?: Record<string, unknown>): MinimalWebSocket;
}
const WebSocketImpl = requireFromHere('ws') as WebSocketCtor;

const projectRoot = path.resolve(__dirname, '../..');

const electronBin =
  process.platform === 'win32'
    ? path.join(projectRoot, 'node_modules', '.bin', 'electron.cmd')
    : path.join(projectRoot, 'node_modules', '.bin', 'electron');

const SKIP_SIGNAL = 'skipped: no capture';
const LOADED_MARKER = '[renderer-loaded]';
const ERROR_MARKERS = ['[renderer:3]', '[renderer-uncaught]', '[renderer-gone]'];
const LOAD_TIMEOUT_MS = 15000;
const CDP_TIMEOUT_MS = 15000;
const POLL_INTERVAL_MS = 100;
const RECORD_MS = 1200;

// ── Cross-platform spawn (mirrors smoke-electron.test.ts) ────────────

interface SpawnSpec {
  command: string;
  args: string[];
  shell: boolean;
}

function getElectronSpawnSpec(debugPort: number): SpawnSpec {
  const args = getElectronArgs(debugPort);
  if (process.platform === 'win32') {
    return { command: electronBin, args, shell: true };
  }
  return { command: electronBin, args, shell: false };
}

function getElectronArgs(debugPort: number): string[] {
  // `--remote-debugging-port` is forwarded by Electron to Chromium, which then
  // serves the CDP target list at http://localhost:<port>/json.
  const args = ['.', `--remote-debugging-port=${debugPort}`];
  const isCiLinux = process.platform === 'linux' && process.env.CI;
  if (isCiLinux) {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
  }
  return args;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function terminateChild(child: ChildProcess | null): Promise<void> {
  if (!child || child.exitCode !== null) return;

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    return;
  }

  child.kill('SIGTERM');
  await wait(500);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
  }
}

function findErrorMarkerLines(buffer: string): string[] {
  return buffer.split('\n').filter((line) => ERROR_MARKERS.some((marker) => line.includes(marker)));
}

// ── Free TCP port for the remote-debugging endpoint ──────────────────

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const { port } = address;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Failed to acquire a free port')));
      }
    });
  });
}

// ── Minimal CDP client over `ws` ─────────────────────────────────────
//
// We use exactly one CDP domain: Runtime.evaluate (with awaitPromise) to run
// async snippets in the page and read JSON-serialisable results back. That is
// all the interaction flow needs; no Page/DOM domains required.

interface CdpTarget {
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

function httpGetJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error('CDP /json request timed out')));
  });
}

async function findPageTarget(debugPort: number, deadline: number): Promise<CdpTarget> {
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const targets = (await httpGetJson(`http://localhost:${debugPort}/json`)) as CdpTarget[];
      const page = Array.isArray(targets)
        ? targets.find(
            (t) =>
              t.type === 'page' &&
              typeof t.webSocketDebuggerUrl === 'string' &&
              (t.url.includes('index.html') || t.url.startsWith('file://'))
          )
        : undefined;
      if (page?.webSocketDebuggerUrl) return page;
    } catch (err) {
      lastError = err;
    }
    await wait(POLL_INTERVAL_MS);
  }
  throw new Error(
    `Could not find a CDP page target on port ${debugPort}` +
      (lastError ? `: ${lastError instanceof Error ? lastError.message : String(lastError)}` : '')
  );
}

class CdpSession {
  private ws: MinimalWebSocket;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (reason: unknown) => void }
  >();

  private constructor(ws: MinimalWebSocket) {
    this.ws = ws;
    this.ws.on('message', (raw: unknown) => {
      let msg: { id?: number; result?: unknown; error?: { message?: string } };
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (typeof msg.id !== 'number') return;
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      if (msg.error) entry.reject(new Error(msg.error.message || 'CDP error'));
      else entry.resolve(msg.result);
    });
  }

  static connect(wsUrl: string): Promise<CdpSession> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocketImpl(wsUrl, {
        perMessageDeflate: false,
        maxPayload: 256 * 1024 * 1024
      });
      const onError = (err?: Error) => reject(err || new Error('CDP socket error'));
      socket.once('error', onError);
      socket.once('open', () => {
        socket.removeListener('open', onError as (...args: unknown[]) => void);
        resolve(new CdpSession(socket));
      });
    });
  }

  private send(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }), (err) => {
        if (err) {
          this.pending.delete(id);
          reject(err);
        }
      });
    });
  }

  // Evaluate an async expression in the page and return its (serialised) value.
  async evaluate<T = unknown>(expression: string): Promise<T> {
    const result = (await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true
    })) as {
      result?: { value?: T };
      exceptionDetails?: { exception?: { description?: string }; text?: string };
    };
    if (result.exceptionDetails) {
      const ex = result.exceptionDetails;
      throw new Error(
        `Renderer evaluate threw: ${ex.exception?.description || ex.text || 'unknown error'}`
      );
    }
    return result.result?.value as T;
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

// ── Page-side snippets (run via Runtime.evaluate) ────────────────────
//
// Snippets are authored as IIFEs returning JSON-serialisable values. They lean
// only on the public `window.electronAPI` preload surface and on driving the
// real DOM (the same elements/handlers the user clicks), since the renderer's
// ES-module exports are not attached to `window`.

// An async-IIFE expression (not a bare statement) so Runtime.evaluate can
// await it. ARG_MS is substituted by the caller.
const sleepSnippet = `(async () => { await new Promise((r) => setTimeout(r, ARG_MS)); return true; })()`;

// Probe whether real desktop window-capture is available on this machine.
// Returns the first window source id, or null when capture/permission is absent.
function probeCaptureSnippet(): string {
  return `(async () => {
    try {
      const sources = await window.electronAPI.getSources();
      const win = (sources || []).find((s) => typeof s.id === 'string' && s.id.startsWith('window:'));
      if (!win) return { ok: false, reason: 'no-window-source' };
      // Confirm desktop capture actually yields a stream (permission granted).
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: win.id, maxFrameRate: 5 } }
        });
      } catch (e) {
        return { ok: false, reason: 'getUserMedia-failed: ' + (e && e.message ? e.message : String(e)) };
      }
      stream.getTracks().forEach((t) => t.stop());
      return { ok: true, sourceId: win.id, name: win.name };
    } catch (e) {
      return { ok: false, reason: 'probe-error: ' + (e && e.message ? e.message : String(e)) };
    }
  })()`;
}

// Open the disposable project through the real resume-last UI path, which runs
// the renderer's openProjectByPath → activateProject (sets activeProjectPath,
// initialises media, routes to the recording view).
function openProjectSnippet(projectPath: string): string {
  const escaped = JSON.stringify(projectPath);
  return `(async () => {
    const resumeBtn = document.getElementById('resumeLastBtn');
    if (!resumeBtn) return { ok: false, reason: 'no-resume-button' };
    resumeBtn.dataset.projectPath = ${escaped};
    resumeBtn.click();
    // Wait until the recording view is active and the record button is enabled.
    const deadline = Date.now() + 8000;
    const recordBtn = document.getElementById('recordBtn');
    const recordingView = document.getElementById('recordingView');
    while (Date.now() < deadline) {
      const inRecording = recordingView && !recordingView.classList.contains('hidden');
      if (inRecording && recordBtn && !recordBtn.disabled) {
        return { ok: true };
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return {
      ok: false,
      reason: 'recording-view-not-ready',
      recordBtnDisabled: recordBtn ? recordBtn.disabled : 'no-btn',
      viewHidden: recordingView ? recordingView.classList.contains('hidden') : 'no-view'
    };
  })()`;
}

// Select a window source through the real picker UI: open the panel, then click
// the checkbox row for the target window. This runs applyPickerSelection →
// updateWindowStreams (the path under test).
function selectWindowSnippet(): string {
  return `(async () => {
    const pickerBtn = document.getElementById('screenPickerBtn');
    const panel = document.getElementById('screenPickerPanel');
    const zone = document.getElementById('screenPickerWindowZone');
    if (!pickerBtn || !panel || !zone) return { ok: false, reason: 'no-picker-dom' };

    // Open the picker (populates sources, then renders rows).
    pickerBtn.click();
    const openDeadline = Date.now() + 6000;
    while (Date.now() < openDeadline) {
      const visible = !panel.classList.contains('hidden');
      const rows = zone.querySelectorAll('div');
      if (visible && rows.length > 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const rows = zone.querySelectorAll('div');
    if (!rows.length) return { ok: false, reason: 'no-window-rows' };

    // Click the first window checkbox row → selects it (pickerMode='windows').
    rows[0].click();

    // Wait for the window stream to be acquired (preview shows window mode:
    // the record button stays enabled and the no-preview overlay is hidden).
    const noPreview = document.getElementById('noPreview');
    const recordBtn = document.getElementById('recordBtn');
    const streamDeadline = Date.now() + 8000;
    while (Date.now() < streamDeadline) {
      const ready = recordBtn && !recordBtn.disabled && noPreview && noPreview.classList.contains('hidden');
      if (ready) {
        // Close the panel the way an outside click would.
        panel.classList.add('hidden');
        return { ok: true, label: pickerBtn.textContent };
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return { ok: false, reason: 'window-stream-not-ready' };
  })()`;
}

// Start recording via the real record button (toggleRecording → startRecording).
function startRecordingSnippet(): string {
  return `(async () => {
    const recordBtn = document.getElementById('recordBtn');
    if (!recordBtn || recordBtn.disabled) return { ok: false, reason: 'record-btn-unavailable' };
    recordBtn.click();
    // recordBtn label flips to "Stop" once startRecording() commits.
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      if ((recordBtn.textContent || '').trim() === 'Stop') return { ok: true };
      await new Promise((r) => setTimeout(r, 50));
    }
    return { ok: false, reason: 'recording-did-not-start', label: recordBtn.textContent };
  })()`;
}

// Sample a window-capture frame while recording is live. We capture the selected
// window independently into an in-DOM <video>, await readiness, draw a downscaled
// frame to a scratch canvas and read pixels. Returns whether the frame is
// non-black (some pixel meaningfully above zero). This isolates "the window can
// produce real, non-black pixels" — the exact black-frame regression — rather
// than sampling the composite (which always shows the non-black wallpaper).
function sampleWindowFrameSnippet(sourceId: string): string {
  const escaped = JSON.stringify(sourceId);
  return `(async () => {
    let stream = null;
    let video = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { mandatory: { chromeMediaSource: 'desktop', chromeMediaSourceId: ${escaped}, maxFrameRate: 30 } }
      });
      video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      // In-DOM (hidden) so Chromium reliably decodes frames — the same
      // readiness guarantee the fix gives the picker's window videos.
      video.style.position = 'fixed';
      video.style.left = '-10000px';
      video.style.width = '2px';
      video.style.height = '2px';
      document.body.appendChild(video);
      video.srcObject = stream;
      try { await video.play(); } catch (_) { /* autoplay may already be running */ }

      // Await a decoded frame (non-zero dimensions), bounded.
      const readyDeadline = Date.now() + 6000;
      while (Date.now() < readyDeadline && !(video.videoWidth > 0 && video.videoHeight > 0)) {
        await new Promise((r) => setTimeout(r, 50));
      }
      if (!(video.videoWidth > 0 && video.videoHeight > 0)) {
        return { ok: false, reason: 'video-never-decoded', videoWidth: video.videoWidth };
      }

      // Give the stream a moment to deliver real content past the first frame.
      await new Promise((r) => setTimeout(r, 300));

      const SW = 32, SH = 32;
      const canvas = document.createElement('canvas');
      canvas.width = SW;
      canvas.height = SH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, SW, SH);
      const data = ctx.getImageData(0, 0, SW, SH).data;

      let maxLuma = 0;
      let nonBlackPixels = 0;
      const total = SW * SH;
      for (let i = 0; i < data.length; i += 4) {
        const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        if (luma > maxLuma) maxLuma = luma;
        if (luma > 8) nonBlackPixels++;
      }
      const nonBlackRatio = nonBlackPixels / total;
      // Non-black if a clear signal exists: a bright-ish peak AND a non-trivial
      // fraction of lit pixels (guards against a single stray hot pixel).
      const nonBlack = maxLuma > 16 && nonBlackRatio > 0.02;
      return {
        ok: true,
        nonBlack,
        maxLuma: Math.round(maxLuma),
        nonBlackRatio: Number(nonBlackRatio.toFixed(3)),
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight
      };
    } catch (e) {
      return { ok: false, reason: 'sample-error: ' + (e && e.message ? e.message : String(e)) };
    } finally {
      try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
      try { if (video && video.parentNode) video.parentNode.removeChild(video); } catch (_) {}
    }
  })()`;
}

// Stop recording via the real record button (toggleRecording → stopRecording).
// stopRecording persists the take and routes to the timeline; we wait until the
// button reads "Record" again, then return the active project path so the take
// can be verified from project.json on disk.
function stopRecordingSnippet(): string {
  return `(async () => {
    const recordBtn = document.getElementById('recordBtn');
    if (!recordBtn) return { ok: false, reason: 'no-record-btn' };
    recordBtn.click();
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      if ((recordBtn.textContent || '').trim() === 'Record') return { ok: true };
      await new Promise((r) => setTimeout(r, 100));
    }
    return { ok: false, reason: 'recording-did-not-stop', label: recordBtn.textContent };
  })()`;
}

// Read the persisted take back through the app's own IPC (project.json on disk).
function readTakesSnippet(projectPath: string): string {
  const escaped = JSON.stringify(projectPath);
  return `(async () => {
    try {
      const opened = await window.electronAPI.projectOpen(${escaped});
      const takes = (opened && opened.project && Array.isArray(opened.project.takes))
        ? opened.project.takes
        : [];
      return {
        ok: true,
        takeCount: takes.length,
        takes: takes.map((t) => ({
          id: t.id,
          hasWindowPaths: Array.isArray(t.windowPaths) && t.windowPaths.length > 0,
          windowPaths: Array.isArray(t.windowPaths)
            ? t.windowPaths.map((w) => ({ name: w.name, path: w.path }))
            : null
        }))
      };
    } catch (e) {
      return { ok: false, reason: 'read-error: ' + (e && e.message ? e.message : String(e)) };
    }
  })()`;
}

// ── Disposable fixture project helper ────────────────────────────────

interface Fixture {
  rootDir: string;
  projectPath: string;
  cleanup: () => void;
}

function createFixtureProject(): Fixture {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loop-e2e-record-'));
  const projectPath = path.join(rootDir, 'Interaction Take');
  const cleanup = () => {
    try {
      fs.rmSync(rootDir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  };
  return { rootDir, projectPath, cleanup };
}

// ── Test driver ──────────────────────────────────────────────────────

async function runInteraction(): Promise<void> {
  const debugPort = await getFreePort();
  const spawnSpec = getElectronSpawnSpec(debugPort);
  const fixture = createFixtureProject();

  const child = spawn(spawnSpec.command, spawnSpec.args, {
    cwd: projectRoot,
    shell: spawnSpec.shell,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true'
    }
  });

  let output = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    output += String(chunk || '');
  });
  child.stderr?.on('data', (chunk: Buffer) => {
    output += String(chunk || '');
  });

  const startedAt = Date.now();
  let exited = false;
  child.on('exit', () => {
    exited = true;
  });

  let session: CdpSession | null = null;
  try {
    // 1) Wait for the renderer to finish loading (or bail on early exit).
    while (Date.now() - startedAt < LOAD_TIMEOUT_MS) {
      if (exited) break;
      if (output.includes(LOADED_MARKER)) break;
      await wait(POLL_INTERVAL_MS);
    }
    if (exited && child.exitCode !== 0) {
      throw new Error(`Electron exited before load (code=${child.exitCode}).\n${output}`);
    }
    if (!output.includes(LOADED_MARKER)) {
      throw new Error(`Renderer never finished loading (no ${LOADED_MARKER}).\n${output}`);
    }

    // 2) Connect to the page target over CDP.
    const target = await findPageTarget(debugPort, Date.now() + CDP_TIMEOUT_MS);
    session = await CdpSession.connect(target.webSocketDebuggerUrl!);

    // 3) Capability probe — self-skip cleanly when capture is unavailable.
    const probe = await session.evaluate<{ ok: boolean; sourceId?: string; reason?: string }>(
      probeCaptureSnippet()
    );
    if (!probe?.ok || !probe.sourceId) {
      console.log(`${SKIP_SIGNAL} (${probe?.reason || 'capture probe failed'})`);
      return;
    }
    const sourceId = probe.sourceId;

    // 4) Create the disposable project on disk via the app's own IPC.
    const created = await session.evaluate<{ projectPath?: string }>(
      `(async () => {
        const r = await window.electronAPI.projectCreate(${JSON.stringify({
          projectPath: fixture.projectPath,
          name: 'Interaction Take'
        })});
        await window.electronAPI.projectSetLast(r.projectPath);
        return { projectPath: r.projectPath };
      })()`
    );
    const projectPath = created?.projectPath || fixture.projectPath;

    // 5) Open it through the real resume-last UI path → recording view.
    const opened = await session.evaluate<{ ok: boolean; reason?: string }>(
      openProjectSnippet(projectPath)
    );
    assert.ok(opened?.ok, `Failed to open project into recording view: ${JSON.stringify(opened)}`);

    // 6) Select a window source through the real picker UI.
    const selected = await session.evaluate<{ ok: boolean; reason?: string; label?: string }>(
      selectWindowSnippet()
    );
    assert.ok(selected?.ok, `Failed to select a window source: ${JSON.stringify(selected)}`);

    // 7) Start recording.
    const started = await session.evaluate<{ ok: boolean; reason?: string }>(
      startRecordingSnippet()
    );
    assert.ok(started?.ok, `Recording did not start: ${JSON.stringify(started)}`);

    // 8) While recording, sample a window-capture frame and assert non-black (b).
    const sample = await session.evaluate<{
      ok: boolean;
      nonBlack?: boolean;
      maxLuma?: number;
      nonBlackRatio?: number;
      reason?: string;
    }>(sampleWindowFrameSnippet(sourceId));
    assert.ok(sample?.ok, `Window frame sampling failed: ${JSON.stringify(sample)}`);

    // Let the recorders accumulate a little footage before stopping.
    await session.evaluate(sleepSnippet.replace('ARG_MS', String(RECORD_MS)));

    // 9) Stop recording — persists the take and routes to the timeline.
    const stopped = await session.evaluate<{ ok: boolean; reason?: string }>(
      stopRecordingSnippet()
    );
    assert.ok(stopped?.ok, `Recording did not stop cleanly: ${JSON.stringify(stopped)}`);

    // 10) Assert a take with windowPaths was created and persisted (a).
    const persisted = await session.evaluate<{
      ok: boolean;
      takeCount?: number;
      takes?: Array<{ id: string; hasWindowPaths: boolean }>;
      reason?: string;
    }>(readTakesSnippet(projectPath));
    assert.ok(persisted?.ok, `Failed to read persisted takes: ${JSON.stringify(persisted)}`);
    assert.ok(
      (persisted.takeCount || 0) > 0,
      `No take was created (silent-discard regression). Takes: ${JSON.stringify(persisted)}`
    );
    const takeWithWindows = (persisted.takes || []).find((t) => t.hasWindowPaths);
    assert.ok(
      takeWithWindows,
      `Created take has no windowPaths (missing-take regression). Takes: ${JSON.stringify(persisted)}`
    );

    // Assert (b): the sampled window capture was non-black.
    assert.ok(
      sample.nonBlack,
      `Window capture frame was all-black (black-frame regression). ` +
        `maxLuma=${sample.maxLuma} nonBlackRatio=${sample.nonBlackRatio}`
    );

    // The renderer must not have surfaced any error markers during the flow.
    const errorLines = findErrorMarkerLines(output);
    if (errorLines.length > 0) {
      throw new Error(`Renderer reported errors during interaction:\n${errorLines.join('\n')}`);
    }

    console.log('record-interaction: PASS (take with windowPaths created, frame non-black)');
  } finally {
    if (session) session.close();
    await terminateChild(child);
    fixture.cleanup();
  }
}

runInteraction()
  .then(() => {
    assert.ok(true);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
