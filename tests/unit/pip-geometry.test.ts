import {
  getSnapPointPosition,
  snapToNearest,
  computePipSize,
} from '../../src/renderer/features/geometry/pip-geometry.js';
import {
  PIP_MARGIN,
  PIP_SIZE,
  CANVAS_W,
  CANVAS_H,
} from '../../src/shared/domain/canvas.js';

describe('computePipSize', () => {
  test('rounds effectiveW * pipScale', () => {
    expect(computePipSize(0.22, 1920)).toBe(Math.round(1920 * 0.22));
    expect(computePipSize(0.22, 1920)).toBe(422);
  });

  test('applies rounding for non-integer products', () => {
    expect(computePipSize(0.15, 607)).toBe(Math.round(607 * 0.15)); // 91.05 -> 91
    expect(computePipSize(0.5, 100)).toBe(50);
    expect(computePipSize(0.333, 100)).toBe(33);
  });

  test('handles zero scale', () => {
    expect(computePipSize(0, 1920)).toBe(0);
  });
});

describe('getSnapPointPosition', () => {
  // Standard landscape canvas with default pip size.
  const w = 1920;
  const h = 1080;
  const ps = 422;
  const midX = Math.round((w - ps) / 2); // 749
  const midY = Math.round((h - ps) / 2); // 329
  const rightX = w - ps - PIP_MARGIN; // 1478
  const bottomY = h - ps - PIP_MARGIN; // 638

  test('top-left corner', () => {
    expect(getSnapPointPosition('tl', w, h, ps)).toEqual({ x: PIP_MARGIN, y: PIP_MARGIN });
  });

  test('top-center', () => {
    expect(getSnapPointPosition('tc', w, h, ps)).toEqual({ x: midX, y: PIP_MARGIN });
  });

  test('top-right corner', () => {
    expect(getSnapPointPosition('tr', w, h, ps)).toEqual({ x: rightX, y: PIP_MARGIN });
  });

  test('middle-left', () => {
    expect(getSnapPointPosition('ml', w, h, ps)).toEqual({ x: PIP_MARGIN, y: midY });
  });

  test('center', () => {
    expect(getSnapPointPosition('center', w, h, ps)).toEqual({ x: midX, y: midY });
  });

  test('middle-right', () => {
    expect(getSnapPointPosition('mr', w, h, ps)).toEqual({ x: rightX, y: midY });
  });

  test('bottom-left corner', () => {
    expect(getSnapPointPosition('bl', w, h, ps)).toEqual({ x: PIP_MARGIN, y: bottomY });
  });

  test('bottom-center', () => {
    expect(getSnapPointPosition('bc', w, h, ps)).toEqual({ x: midX, y: bottomY });
  });

  test('bottom-right corner', () => {
    expect(getSnapPointPosition('br', w, h, ps)).toEqual({ x: rightX, y: bottomY });
  });

  test('unknown snap point falls back to bottom-right', () => {
    expect(getSnapPointPosition('???', w, h, ps)).toEqual({ x: rightX, y: bottomY });
  });

  test('uses the provided dimensions and pip size, not module constants', () => {
    // Reel-style dimensions to confirm parameterization.
    expect(getSnapPointPosition('tr', 608, 1080, 200)).toEqual({
      x: 608 - 200 - PIP_MARGIN,
      y: PIP_MARGIN,
    });
  });
});

describe('snapToNearest', () => {
  const w = 1920;
  const h = 1080;
  const ps = 422;

  test('returns the nearest snap point and its position for a top-left cursor', () => {
    const result = snapToNearest(0, 0, w, h, ps);
    expect(result.snapPoint).toBe('tl');
    expect(result).toEqual({ ...getSnapPointPosition('tl', w, h, ps), snapPoint: 'tl' });
  });

  test('snaps an exactly-centered cursor to center', () => {
    const center = getSnapPointPosition('center', w, h, ps);
    const result = snapToNearest(center.x, center.y, w, h, ps);
    expect(result.snapPoint).toBe('center');
    expect(result).toEqual({ x: center.x, y: center.y, snapPoint: 'center' });
  });

  test('snaps a bottom-right cursor to br', () => {
    const result = snapToNearest(w, h, w, h, ps);
    expect(result.snapPoint).toBe('br');
    expect(result).toEqual({ ...getSnapPointPosition('br', w, h, ps), snapPoint: 'br' });
  });

  test('snaps a top-right cursor to tr', () => {
    const result = snapToNearest(w, 0, w, h, ps);
    expect(result.snapPoint).toBe('tr');
  });

  test('snaps a bottom-left cursor to bl', () => {
    const result = snapToNearest(0, h, w, h, ps);
    expect(result.snapPoint).toBe('bl');
  });

  test('falls back to module constants when dimensions/pipSize are falsy', () => {
    // 0/0/0 -> uses CANVAS_W, CANVAS_H, PIP_SIZE internally.
    const result = snapToNearest(0, 0, 0, 0, 0);
    expect(result).toEqual({
      ...getSnapPointPosition('tl', CANVAS_W, CANVAS_H, PIP_SIZE),
      snapPoint: 'tl',
    });
  });

  test('returns a position that matches getSnapPointPosition for the chosen point', () => {
    const result = snapToNearest(500, 500, w, h, ps);
    const expected = getSnapPointPosition(result.snapPoint, w, h, ps);
    expect({ x: result.x, y: result.y }).toEqual(expected);
  });
});
