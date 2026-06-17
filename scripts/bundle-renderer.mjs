import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// The renderer is loaded by the browser as native ESM (<script type="module">)
// with no other bundler. It statically imports src/shared/domain/* modules,
// which compile to CommonJS (package.json is CJS; tsconfig.shared is NodeNext).
// Chromium's ESM loader cannot bind named exports from a CJS module, so we bundle
// the renderer entry into a single self-contained ESM file, inlining the CJS
// shared modules via esbuild's CJS<->ESM interop. The main process is unaffected
// (it consumes shared as CJS via require()).
//
// We bundle the tsc OUTPUT (dist/renderer/app.js), not the TS source, so the
// `.js` import specifiers resolve unambiguously to real files in dist.
async function run() {
  const entry = path.join(projectRoot, 'dist', 'renderer', 'app.js');
  const outfile = path.join(projectRoot, 'dist', 'renderer', 'app.bundle.js');

  await esbuild.build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    sourcemap: true,
    logLevel: 'info'
    // No `external`: the renderer has no bare imports. The audio worklet is loaded
    // by URL (audioWorklet.addModule('audio-processor.js')), not statically
    // imported, so it is not pulled into this bundle and stays a separate file.
  });

  console.log('Renderer bundle written to dist/renderer/app.bundle.js');
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
