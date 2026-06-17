import assert from 'node:assert/strict';
import { spawn, spawnSync, ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '../..');

const electronBin =
  process.platform === 'win32'
    ? path.join(projectRoot, 'node_modules', '.bin', 'electron.cmd')
    : path.join(projectRoot, 'node_modules', '.bin', 'electron');

interface SpawnSpec {
  command: string;
  args: string[];
  shell: boolean;
}

function getElectronSpawnSpec(): SpawnSpec {
  const args = getElectronArgs();
  if (process.platform === 'win32') {
    return {
      command: electronBin,
      args,
      shell: true
    };
  }

  return {
    command: electronBin,
    args,
    shell: false
  };
}

function getElectronArgs(): string[] {
  const args = ['.'];
  const isCiLinux = process.platform === 'linux' && process.env.CI;
  if (isCiLinux) {
    args.push('--no-sandbox', '--disable-setuid-sandbox');
  }
  return args;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function terminateChild(child: ChildProcessWithoutNullStreams | null): Promise<void> {
  if (!child || child.exitCode !== null) return;

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore'
    });
    return;
  }

  child.kill('SIGTERM');
  await wait(500);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
  }
}

interface EarlyExit {
  code: number | null;
  signal: NodeJS.Signals | null;
  elapsed: number;
}

const LOADED_MARKER = '[renderer-loaded]';
const ERROR_MARKERS = ['[renderer:3]', '[renderer-uncaught]', '[renderer-gone]'];
const LOAD_TIMEOUT_MS = 8000;
const POLL_INTERVAL_MS = 100;

function findErrorMarkerLines(buffer: string): string[] {
  return buffer
    .split('\n')
    .filter((line) => ERROR_MARKERS.some((marker) => line.includes(marker)));
}

async function runSmoke(): Promise<void> {
  const spawnSpec = getElectronSpawnSpec();
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
  child.stdout.on('data', (chunk: Buffer) => {
    output += String(chunk || '');
  });
  child.stderr.on('data', (chunk: Buffer) => {
    output += String(chunk || '');
  });

  const startedAt = Date.now();
  let earlyExit: EarlyExit | null = null;
  child.on('exit', (code, signal) => {
    const elapsed = Date.now() - startedAt;
    if (elapsed < 3000) {
      earlyExit = { code, signal, elapsed };
    }
  });

  try {
    // Poll for the positive readiness marker (or an early exit) up to the timeout.
    while (Date.now() - startedAt < LOAD_TIMEOUT_MS) {
      if (earlyExit) break;
      if (output.includes(LOADED_MARKER)) break;
      await wait(POLL_INTERVAL_MS);
    }

    if (earlyExit) {
      const ee = earlyExit as EarlyExit;
      throw new Error(
        `Electron exited too early (${ee.elapsed}ms, code=${ee.code}, signal=${ee.signal}).\n${output}`
      );
    }

    if (child.exitCode !== null) {
      throw new Error(`Electron exited unexpectedly with code ${child.exitCode}.\n${output}`);
    }

    const errorLines = findErrorMarkerLines(output);
    if (errorLines.length > 0) {
      throw new Error(`Renderer reported errors:\n${errorLines.join('\n')}\n\nFull output:\n${output}`);
    }

    if (!output.includes(LOADED_MARKER)) {
      throw new Error(`Renderer never finished loading (no ${LOADED_MARKER}).\n${output}`);
    }
  } finally {
    await terminateChild(child);
  }
}

runSmoke()
  .then(() => {
    assert.ok(true);
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
