import {
  MODE_SPECIFIC_PROPS,
  saveModeState,
  restoreModeState,
  getDefaultModeState,
} from '../../src/renderer/features/keyframe/mode-state.js';
import {
  CANVAS_W,
  CANVAS_H,
  REEL_CANVAS_W,
  REEL_CANVAS_H,
  DEFAULT_PIP_SCALE,
  PIP_MARGIN,
} from '../../src/shared/domain/canvas.js';
import { computePipSize } from '../../src/renderer/features/geometry/pip-geometry.js';
import type { Keyframe } from '../../src/shared/types/domain.js';

function makeKeyframe(overrides: Partial<Keyframe> = {}): Keyframe {
  return {
    time: 0,
    pipX: 100,
    pipY: 200,
    pipVisible: true,
    cameraFullscreen: false,
    backgroundZoom: 1,
    backgroundPanX: 0,
    backgroundPanY: 0,
    reelCropX: 0,
    pipScale: 0.22,
    pipSnapPoint: 'br',
    autoTrack: false,
    autoTrackSmoothing: 0.15,
    sectionId: null,
    autoSection: false,
    savedLandscape: null,
    savedReel: null,
    ...overrides,
  };
}

describe('MODE_SPECIFIC_PROPS', () => {
  test('lists the mode-specific keyframe props', () => {
    expect(MODE_SPECIFIC_PROPS).toEqual([
      'backgroundZoom', 'backgroundPanX', 'backgroundPanY',
      'pipX', 'pipY', 'pipScale', 'pipVisible', 'cameraFullscreen', 'reelCropX', 'pipSnapPoint',
      'autoTrack', 'autoTrackSmoothing',
    ]);
  });
});

describe('saveModeState', () => {
  test('captures mode-specific props into savedReel for reel mode', () => {
    const kf = makeKeyframe({ pipX: 11, pipY: 22, pipScale: 0.3, reelCropX: -0.5 });
    saveModeState(kf, 'reel');
    expect(kf.savedReel).toEqual({
      backgroundZoom: 1,
      backgroundPanX: 0,
      backgroundPanY: 0,
      pipX: 11,
      pipY: 22,
      pipScale: 0.3,
      pipVisible: true,
      cameraFullscreen: false,
      reelCropX: -0.5,
      pipSnapPoint: 'br',
      autoTrack: false,
      autoTrackSmoothing: 0.15,
    });
    expect(kf.savedLandscape).toBeNull();
  });

  test('captures mode-specific props into savedLandscape for landscape mode', () => {
    const kf = makeKeyframe({ pipX: 5, pipVisible: false });
    saveModeState(kf, 'landscape');
    expect(kf.savedLandscape?.pipX).toBe(5);
    expect(kf.savedLandscape?.pipVisible).toBe(false);
    expect(kf.savedReel).toBeNull();
  });
});

describe('saveModeState then restoreModeState', () => {
  test('round-trips per-mode props on a keyframe (reel)', () => {
    const kf = makeKeyframe({ pipX: 33, pipY: 44, pipScale: 0.4, backgroundZoom: 2, reelCropX: 0.7 });
    saveModeState(kf, 'reel');

    // Mutate live props away from the saved values.
    kf.pipX = -1;
    kf.pipY = -1;
    kf.pipScale = 0.99;
    kf.backgroundZoom = 9;
    kf.reelCropX = -0.9;

    // Restore should overwrite the passed keyframe back to saved values.
    restoreModeState(kf, 'reel', getDefaultModeState('reel'));
    expect(kf.pipX).toBe(33);
    expect(kf.pipY).toBe(44);
    expect(kf.pipScale).toBe(0.4);
    expect(kf.backgroundZoom).toBe(2);
    expect(kf.reelCropX).toBe(0.7);
  });

  test('round-trips per-mode props on a keyframe (landscape)', () => {
    const kf = makeKeyframe({ pipX: 7, pipY: 8, pipVisible: false, cameraFullscreen: true });
    saveModeState(kf, 'landscape');
    kf.pipX = 0;
    kf.pipY = 0;
    kf.pipVisible = true;
    kf.cameraFullscreen = false;
    restoreModeState(kf, 'landscape', getDefaultModeState('landscape'));
    expect(kf.pipX).toBe(7);
    expect(kf.pipY).toBe(8);
    expect(kf.pipVisible).toBe(false);
    expect(kf.cameraFullscreen).toBe(true);
  });

  test('restoreModeState mutates the passed keyframe (does not return a new object)', () => {
    const kf = makeKeyframe();
    const result = restoreModeState(kf, 'reel', getDefaultModeState('reel'));
    expect(result).toBeUndefined();
  });

  test('restoreModeState falls back to defaults when no saved slot exists', () => {
    const kf = makeKeyframe({ pipX: 1, pipY: 2, autoTrackSmoothing: 0.99 });
    const defaults = getDefaultModeState('reel');
    restoreModeState(kf, 'reel', defaults);
    expect(kf.pipX).toBe(defaults.pipX);
    expect(kf.pipY).toBe(defaults.pipY);
    expect(kf.autoTrackSmoothing).toBe(defaults.autoTrackSmoothing);
  });
});

describe('getDefaultModeState', () => {
  test("returns expected defaults for 'landscape'", () => {
    const pipSize = computePipSize(DEFAULT_PIP_SCALE, CANVAS_W);
    expect(getDefaultModeState('landscape')).toEqual({
      backgroundZoom: 1,
      backgroundPanX: 0,
      backgroundPanY: 0,
      pipX: CANVAS_W - pipSize - PIP_MARGIN,
      pipY: CANVAS_H - pipSize - PIP_MARGIN,
      pipScale: DEFAULT_PIP_SCALE,
      pipVisible: true,
      cameraFullscreen: false,
      reelCropX: 0,
      pipSnapPoint: 'br',
      autoTrack: false,
      autoTrackSmoothing: 0.15,
    });
  });

  test("returns expected defaults for 'reel'", () => {
    const pipSize = computePipSize(DEFAULT_PIP_SCALE, REEL_CANVAS_W);
    expect(getDefaultModeState('reel')).toEqual({
      backgroundZoom: 1,
      backgroundPanX: 0,
      backgroundPanY: 0,
      pipX: REEL_CANVAS_W - pipSize - PIP_MARGIN,
      pipY: REEL_CANVAS_H - pipSize - PIP_MARGIN,
      pipScale: DEFAULT_PIP_SCALE,
      pipVisible: true,
      cameraFullscreen: false,
      reelCropX: 0,
      pipSnapPoint: 'br',
      autoTrack: false,
      autoTrackSmoothing: 0.15,
    });
  });
});
