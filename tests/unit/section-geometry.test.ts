import {
  clampSectionPan,
  clampReelCropX,
  reelCropXToPixelOffset,
} from '../../src/renderer/features/geometry/section-geometry.js';
import {
  MIN_SECTION_PAN,
  MAX_SECTION_PAN,
  MIN_REEL_CROP_X,
  MAX_REEL_CROP_X,
  CANVAS_W,
  REEL_CANVAS_W,
} from '../../src/shared/domain/canvas.js';

describe('clampSectionPan', () => {
  test('returns value within bounds unchanged', () => {
    expect(clampSectionPan(0)).toBe(0);
    expect(clampSectionPan(0.5)).toBe(0.5);
    expect(clampSectionPan(-0.25)).toBe(-0.25);
  });

  test('clamps below lower bound', () => {
    expect(clampSectionPan(-5)).toBe(MIN_SECTION_PAN);
    expect(clampSectionPan(MIN_SECTION_PAN - 0.0001)).toBe(MIN_SECTION_PAN);
  });

  test('clamps above upper bound', () => {
    expect(clampSectionPan(5)).toBe(MAX_SECTION_PAN);
    expect(clampSectionPan(MAX_SECTION_PAN + 0.0001)).toBe(MAX_SECTION_PAN);
  });

  test('returns exact bound values at the edges', () => {
    expect(clampSectionPan(MIN_SECTION_PAN)).toBe(MIN_SECTION_PAN);
    expect(clampSectionPan(MAX_SECTION_PAN)).toBe(MAX_SECTION_PAN);
  });

  test('coerces numeric strings like the original Number() path', () => {
    expect(clampSectionPan('0.5')).toBe(0.5);
    expect(clampSectionPan('5')).toBe(MAX_SECTION_PAN);
  });

  test('returns 0 for non-finite / invalid input', () => {
    expect(clampSectionPan(NaN)).toBe(0);
    expect(clampSectionPan(Infinity)).toBe(0);
    expect(clampSectionPan(-Infinity)).toBe(0);
    expect(clampSectionPan(null)).toBe(0); // Number(null) === 0, finite -> 0 anyway
    expect(clampSectionPan(undefined)).toBe(0); // Number(undefined) === NaN
    expect(clampSectionPan('not-a-number')).toBe(0);
    expect(clampSectionPan({})).toBe(0);
  });
});

describe('clampReelCropX', () => {
  test('returns value within bounds unchanged', () => {
    expect(clampReelCropX(0)).toBe(0);
    expect(clampReelCropX(0.5)).toBe(0.5);
    expect(clampReelCropX(-0.5)).toBe(-0.5);
  });

  test('clamps below lower bound', () => {
    expect(clampReelCropX(-9)).toBe(MIN_REEL_CROP_X);
    expect(clampReelCropX(MIN_REEL_CROP_X - 1)).toBe(MIN_REEL_CROP_X);
  });

  test('clamps above upper bound', () => {
    expect(clampReelCropX(9)).toBe(MAX_REEL_CROP_X);
    expect(clampReelCropX(MAX_REEL_CROP_X + 1)).toBe(MAX_REEL_CROP_X);
  });

  test('returns exact bound values at the edges', () => {
    expect(clampReelCropX(MIN_REEL_CROP_X)).toBe(MIN_REEL_CROP_X);
    expect(clampReelCropX(MAX_REEL_CROP_X)).toBe(MAX_REEL_CROP_X);
  });

  test('coerces numeric strings like the original Number() path', () => {
    expect(clampReelCropX('0.25')).toBe(0.25);
    expect(clampReelCropX('-3')).toBe(MIN_REEL_CROP_X);
  });

  test('returns 0 for non-finite / invalid input', () => {
    expect(clampReelCropX(NaN)).toBe(0);
    expect(clampReelCropX(Infinity)).toBe(0);
    expect(clampReelCropX(-Infinity)).toBe(0);
    expect(clampReelCropX(undefined)).toBe(0);
    expect(clampReelCropX('xyz')).toBe(0);
    expect(clampReelCropX({})).toBe(0);
  });
});

describe('reelCropXToPixelOffset', () => {
  // With CANVAS_W=1920, REEL_CANVAS_W=608: cw default 1920, zoom 1 ->
  // contentLeft=0, scaledW=1920, scaledLeft=0, maxCropRange=1312.
  const FULL_RANGE = CANVAS_W - REEL_CANVAS_W; // 1312

  test('center crop (reelCropX=0) at full zoom returns half the crop range', () => {
    expect(reelCropXToPixelOffset(0, 1)).toBeCloseTo(FULL_RANGE / 2, 6); // 656
  });

  test('right-most crop (reelCropX=1) at full zoom returns full crop range', () => {
    expect(reelCropXToPixelOffset(1, 1, CANVAS_W)).toBeCloseTo(FULL_RANGE, 6); // 1312
  });

  test('left-most crop (reelCropX=-1) at full zoom returns 0', () => {
    expect(reelCropXToPixelOffset(-1, 1, CANVAS_W)).toBeCloseTo(0, 6);
  });

  test('out-of-range reelCropX is clamped before offset is computed', () => {
    expect(reelCropXToPixelOffset(99, 1, CANVAS_W)).toBeCloseTo(FULL_RANGE, 6);
    expect(reelCropXToPixelOffset(-99, 1, CANVAS_W)).toBeCloseTo(0, 6);
  });

  test('non-finite reelCropX is treated as 0 (clampReelCropX path)', () => {
    expect(reelCropXToPixelOffset(NaN, 1, CANVAS_W)).toBeCloseTo(FULL_RANGE / 2, 6);
  });

  test('zoom of 0 collapses content and centers the offset', () => {
    // scaledW=0, scaledLeft=(CANVAS_W)/2=960, maxCropRange=0 -> always 960.
    expect(reelCropXToPixelOffset(0, 0, CANVAS_W)).toBeCloseTo(CANVAS_W / 2, 6);
    expect(reelCropXToPixelOffset(1, 0, CANVAS_W)).toBeCloseTo(CANVAS_W / 2, 6);
  });

  test('zoom is clamped into [0,1]', () => {
    // zoom > 1 clamps to 1 -> same as full zoom.
    expect(reelCropXToPixelOffset(0, 5, CANVAS_W)).toBeCloseTo(FULL_RANGE / 2, 6);
    // negative zoom clamps to 0 -> centered.
    expect(reelCropXToPixelOffset(0, -5, CANVAS_W)).toBeCloseTo(CANVAS_W / 2, 6);
  });

  test('null zoom defaults to 1 (zoom != null branch)', () => {
    expect(reelCropXToPixelOffset(0, null, CANVAS_W)).toBeCloseTo(FULL_RANGE / 2, 6);
  });

  test('falsy contentW (0 / undefined) falls back to CANVAS_W', () => {
    expect(reelCropXToPixelOffset(0, 1, 0)).toBeCloseTo(FULL_RANGE / 2, 6);
    expect(reelCropXToPixelOffset(0, 1, undefined)).toBeCloseTo(FULL_RANGE / 2, 6);
  });

  test('narrower contentW shifts the content and scales the crop range', () => {
    const cw = 1000;
    const z = 0.5;
    const contentLeft = (CANVAS_W - cw) / 2; // 460
    const scaledW = cw * z; // 500
    const scaledLeft = contentLeft + (cw - scaledW) / 2; // 460 + 250 = 710
    const maxCropRange = Math.max(0, scaledW - REEL_CANVAS_W); // max(0, 500-608)=0
    const expected = scaledLeft + ((0 + 1) / 2) * maxCropRange; // 710
    expect(reelCropXToPixelOffset(0, z, cw)).toBeCloseTo(expected, 6);
  });
});
