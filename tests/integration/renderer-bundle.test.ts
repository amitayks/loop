import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(__dirname, '..', '..');
const distEntry = path.join(projectRoot, 'dist', 'renderer', 'app.js');
const bundlePath = path.join(projectRoot, 'dist', 'renderer', 'app.bundle.js');
const indexPath = path.join(projectRoot, 'dist', 'index.html');

function sh(cmd: string): void {
  execSync(cmd, { cwd: projectRoot, stdio: 'pipe' });
}

// Ensure the renderer bundle + copied index.html exist for the assertions below.
// build:bundle is a fast esbuild pass; build:ts only runs if the tsc entry is missing.
beforeAll(() => {
  if (!fs.existsSync(distEntry)) sh('npm run build:ts');
  sh('npm run build:bundle');
  sh('npm run build:copy');
}, 180_000);

describe('renderer bundle', () => {
  test('produces a single bundled ESM file', () => {
    expect(fs.existsSync(bundlePath)).toBe(true);
    const code = fs.readFileSync(bundlePath, 'utf8');
    expect(code.length).toBeGreaterThan(1000);
  });

  test('inlines the CJS shared modules (no unresolved relative imports remain)', () => {
    const code = fs.readFileSync(bundlePath, 'utf8');
    // Everything the renderer statically imports is bundled, so no relative
    // import/export specifiers should survive in the output.
    expect(code).not.toMatch(/from\s+['"]\.\.?\//);
    expect(code).not.toMatch(/import\s+['"]\.\.?\//);
    // Evidence that CJS shared domain logic was pulled in and inlined.
    expect(code).toMatch(/buildMergedSegments|easeInOut|generateOverlayId/);
  });

  test('index.html loads the bundle entry', () => {
    const html = fs.readFileSync(indexPath, 'utf8');
    expect(html).toMatch(/src=["']\.\/renderer\/app\.bundle\.js["']/);
    expect(html).not.toMatch(/src=["']\.\/renderer\/app\.js["']/);
  });
});
