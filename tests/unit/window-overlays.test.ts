import { createOverlaysFromWindowPaths } from '../../src/renderer/features/overlay/window-overlays.js';
import { CANVAS_W, CANVAS_H } from '../../src/shared/domain/canvas.js';

describe('createOverlaysFromWindowPaths', () => {
  test('produces one Overlay per input path (capped at 2)', () => {
    const paths = [
      { name: 'A', path: '/a.mp4' },
      { name: 'B', path: '/b.mp4' }
    ];
    const overlays = createOverlaysFromWindowPaths(paths, 5);
    expect(overlays).toHaveLength(2);
  });

  test('caps output at the first 2 input paths', () => {
    const paths = [
      { name: 'A', path: '/a.mp4' },
      { name: 'B', path: '/b.mp4' },
      { name: 'C', path: '/c.mp4' }
    ];
    const overlays = createOverlaysFromWindowPaths(paths, 5);
    expect(overlays).toHaveLength(2);
    expect(overlays.map((o) => o.mediaPath)).toEqual(['/a.mp4', '/b.mp4']);
  });

  test('each overlay has an id matching /^overlay-/', () => {
    const overlays = createOverlaysFromWindowPaths(
      [{ name: 'A', path: '/a.mp4' }, { name: 'B', path: '/b.mp4' }],
      3
    );
    for (const o of overlays) {
      expect(o.id).toMatch(/^overlay-/);
    }
  });

  test('applies the passed duration to endTime and sourceEnd', () => {
    const duration = 12.5;
    const overlays = createOverlaysFromWindowPaths([{ name: 'A', path: '/a.mp4' }], duration);
    const [o] = overlays;
    expect(o.startTime).toBe(0);
    expect(o.sourceStart).toBe(0);
    expect(o.endTime).toBe(duration);
    expect(o.sourceEnd).toBe(duration);
  });

  test('single window: mediaType window, trackIndex 0, source dims default to canvas, fits full canvas', () => {
    const overlays = createOverlaysFromWindowPaths([{ name: 'Win', path: '/w.mp4' }], 4);
    expect(overlays).toHaveLength(1);
    const [o] = overlays;
    expect(o.mediaType).toBe('window');
    expect(o.trackIndex).toBe(0);
    expect(o.saved).toBe(false);
    expect(o.sourceName).toBe('Win');
    // width/height default to CANVAS_W/CANVAS_H when not provided
    expect(o.sourceWidth).toBe(CANVAS_W);
    expect(o.sourceHeight).toBe(CANVAS_H);
    // Single window fitted to full canvas: scale = min(W/W, H/H) = 1 → exact canvas-sized, centered at origin
    expect(o.landscape).toEqual({ x: 0, y: 0, width: CANVAS_W, height: CANVAS_H });
    // reel is a distinct copy of landscape
    expect(o.reel).toEqual(o.landscape);
    expect(o.reel).not.toBe(o.landscape);
  });

  test('uses provided source width/height and positions from canvas constants (single window)', () => {
    const srcW = 1280;
    const srcH = 720;
    const overlays = createOverlaysFromWindowPaths(
      [{ name: 'HD', path: '/hd.mp4', width: srcW, height: srcH }],
      6
    );
    const [o] = overlays;
    expect(o.sourceWidth).toBe(srcW);
    expect(o.sourceHeight).toBe(srcH);
    const scale = Math.min(CANVAS_W / srcW, CANVAS_H / srcH);
    const lw = srcW * scale;
    const lh = srcH * scale;
    expect(o.landscape).toEqual({
      x: Math.round((CANVAS_W - lw) / 2),
      y: Math.round((CANVAS_H - lh) / 2),
      width: Math.round(lw),
      height: Math.round(lh)
    });
  });

  test('two windows: positioned side-by-side using canvas constants', () => {
    const srcW = 1920;
    const srcH = 1080;
    const overlays = createOverlaysFromWindowPaths(
      [
        { name: 'L', path: '/l.mp4', width: srcW, height: srcH },
        { name: 'R', path: '/r.mp4', width: srcW, height: srcH }
      ],
      8
    );
    const gap = 16;
    const halfW = (CANVAS_W - gap) / 2;
    const scale = Math.min(halfW / srcW, CANVAS_H / srcH);
    const lw = srcW * scale;
    const lh = srcH * scale;
    expect(overlays[0].trackIndex).toBe(0);
    expect(overlays[1].trackIndex).toBe(1);
    expect(overlays[0].landscape).toEqual({
      x: Math.round((halfW - lw) / 2),
      y: Math.round((CANVAS_H - lh) / 2),
      width: Math.round(lw),
      height: Math.round(lh)
    });
    expect(overlays[1].landscape).toEqual({
      x: Math.round(halfW + gap + (halfW - lw) / 2),
      y: Math.round((CANVAS_H - lh) / 2),
      width: Math.round(lw),
      height: Math.round(lh)
    });
  });

  test('includes proxyPath only when provided', () => {
    const overlays = createOverlaysFromWindowPaths(
      [
        { name: 'A', path: '/a.mp4', proxyPath: '/a-proxy.mp4' },
        { name: 'B', path: '/b.mp4', proxyPath: null }
      ],
      2
    );
    expect(overlays[0].proxyPath).toBe('/a-proxy.mp4');
    expect(overlays[1].proxyPath).toBeUndefined();
    expect('proxyPath' in overlays[1]).toBe(false);
  });

  test('empty input yields empty array', () => {
    expect(createOverlaysFromWindowPaths([], 5)).toEqual([]);
  });
});
