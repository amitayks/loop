import {
  MIN_SECTION_PAN,
  MAX_SECTION_PAN,
  MIN_REEL_CROP_X,
  MAX_REEL_CROP_X,
  CANVAS_W,
  REEL_CANVAS_W,
} from '../../../shared/domain/canvas.js';

export function clampSectionPan(value: unknown): number {
  const pan = Number(value);
  if (!Number.isFinite(pan)) return 0;
  return Math.max(MIN_SECTION_PAN, Math.min(MAX_SECTION_PAN, pan));
}

export function clampReelCropX(value: unknown): number {
  const v = Number(value);
  if (!Number.isFinite(v)) return 0;
  return Math.max(MIN_REEL_CROP_X, Math.min(MAX_REEL_CROP_X, v));
}

export function reelCropXToPixelOffset(reelCropX: unknown, zoom: unknown, contentW?: number): number {
  const cw = contentW || CANVAS_W;
  const z = Math.min(1, Math.max(0, zoom != null ? Number(zoom) : 1));
  const contentLeft = (CANVAS_W - cw) / 2;
  const scaledW = cw * z;
  const scaledLeft = contentLeft + (cw - scaledW) / 2;
  const maxCropRange = Math.max(0, scaledW - REEL_CANVAS_W);
  return scaledLeft + ((clampReelCropX(reelCropX) + 1) / 2) * maxCropRange;
}
