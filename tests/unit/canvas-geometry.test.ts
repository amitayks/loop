import {
  CANVAS_W,
  CANVAS_H,
  PIP_FRACTION,
  PIP_MARGIN,
  PIP_SIZE,
  MIN_SECTION_PAN,
  MAX_SECTION_PAN,
  REEL_CANVAS_W,
  REEL_CANVAS_H,
  MIN_REEL_CROP_X,
  MAX_REEL_CROP_X,
  MIN_PIP_SCALE,
  MAX_PIP_SCALE,
  DEFAULT_PIP_SCALE,
  getContentWidth,
} from '../../src/shared/domain/canvas.js';
import * as domain from '../../src/shared/types/domain.js';

describe('canvas geometry constants', () => {
  test('canvas dimensions', () => {
    expect(CANVAS_W).toBe(1920);
    expect(CANVAS_H).toBe(1080);
  });

  test('reel canvas dimensions', () => {
    expect(REEL_CANVAS_W).toBe(Math.round((1080 * 9) / 16));
    expect(REEL_CANVAS_H).toBe(1080);
  });

  test('pip sizing', () => {
    expect(PIP_FRACTION).toBe(0.22);
    expect(PIP_MARGIN).toBe(20);
    expect(PIP_SIZE).toBe(Math.round(1920 * PIP_FRACTION));
    expect(PIP_SIZE).toBe(Math.round(1920 * 0.22));
  });

  test('section pan bounds', () => {
    expect(MIN_SECTION_PAN).toBe(-1);
    expect(MAX_SECTION_PAN).toBe(1);
  });

  test('re-exported crop/pip constants match domain.ts', () => {
    expect(MIN_REEL_CROP_X).toBe(domain.MIN_REEL_CROP_X);
    expect(MAX_REEL_CROP_X).toBe(domain.MAX_REEL_CROP_X);
    expect(MIN_PIP_SCALE).toBe(domain.MIN_PIP_SCALE);
    expect(MAX_PIP_SCALE).toBe(domain.MAX_PIP_SCALE);
    expect(DEFAULT_PIP_SCALE).toBe(domain.DEFAULT_PIP_SCALE);
  });
});

describe('getContentWidth', () => {
  test('fit mode scales source to fit canvas', () => {
    // source 3840x2160 into 1920x1080 -> scale 0.5 -> 1920
    expect(getContentWidth(3840, 2160, 'fit', 1920, 1080)).toBe(1920);
    // source 1000x2000 into 1920x1080 -> scale = min(1.92, 0.54) = 0.54 -> 540
    expect(getContentWidth(1000, 2000, 'fit', 1920, 1080)).toBe(540);
    // wider-than-canvas source 4000x1000 into 1920x1080 -> scale = min(0.48, 1.08) = 0.48 -> 1920
    expect(getContentWidth(4000, 1000, 'fit', 1920, 1080)).toBe(1920);
  });

  test('non-fit mode returns canvasW', () => {
    expect(getContentWidth(3840, 2160, 'fill', 1920, 1080)).toBe(1920);
  });

  test('falsy source dimensions return canvasW', () => {
    expect(getContentWidth(null, 1080, 'fit', 1920, 1080)).toBe(1920);
    expect(getContentWidth(1920, null, 'fit', 1920, 1080)).toBe(1920);
    expect(getContentWidth(0, 1080, 'fit', 1920, 1080)).toBe(1920);
    expect(getContentWidth(1920, 0, 'fit', 1920, 1080)).toBe(1920);
    expect(getContentWidth(null, null, 'fit', 800, 600)).toBe(800);
  });
});
