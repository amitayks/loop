import {
  CANVAS_W,
  CANVAS_H,
  REEL_CANVAS_W,
  REEL_CANVAS_H,
  DEFAULT_PIP_SCALE,
  PIP_MARGIN,
} from '../../../shared/domain/canvas.js';
import type { Keyframe, OutputMode, SavedKeyframeState } from '../../../shared/types/domain.js';
import { computePipSize } from '../geometry/pip-geometry.js';

export const MODE_SPECIFIC_PROPS: (keyof SavedKeyframeState)[] = [
  'backgroundZoom', 'backgroundPanX', 'backgroundPanY',
  'pipX', 'pipY', 'pipScale', 'pipVisible', 'cameraFullscreen', 'reelCropX', 'pipSnapPoint',
  'autoTrack', 'autoTrackSmoothing'
];

export function saveModeState(kf: Keyframe, mode: OutputMode): void {
  const slot: SavedKeyframeState = {};
  for (const prop of MODE_SPECIFIC_PROPS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic property copy between compatible shapes
    (slot as any)[prop] = (kf as any)[prop];
  }
  if (mode === 'reel') {
    kf.savedReel = slot;
  } else {
    kf.savedLandscape = slot;
  }
}

export function restoreModeState(kf: Keyframe, mode: OutputMode, defaults: SavedKeyframeState): void {
  const slotKey = mode === 'reel' ? 'savedReel' : 'savedLandscape';
  const saved = kf[slotKey];
  if (saved) {
    for (const prop of MODE_SPECIFIC_PROPS) {
      if (prop in saved) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic property copy between compatible shapes
        (kf as any)[prop] = (saved as any)[prop];
      }
    }
  } else {
    for (const prop of MODE_SPECIFIC_PROPS) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic property copy between compatible shapes
      (kf as any)[prop] = (defaults as any)[prop];
    }
  }
}

export function getDefaultModeState(mode: OutputMode): SavedKeyframeState {
  const w = mode === 'reel' ? REEL_CANVAS_W : CANVAS_W;
  const h = mode === 'reel' ? REEL_CANVAS_H : CANVAS_H;
  const ps = DEFAULT_PIP_SCALE;
  const pipSize = computePipSize(ps, w);
  return {
    backgroundZoom: 1,
    backgroundPanX: 0,
    backgroundPanY: 0,
    pipX: w - pipSize - PIP_MARGIN,
    pipY: h - pipSize - PIP_MARGIN,
    pipScale: ps,
    pipVisible: true,
    cameraFullscreen: false,
    reelCropX: 0,
    pipSnapPoint: 'br',
    autoTrack: false,
    autoTrackSmoothing: 0.15
  };
}
