import type { ScreenFitMode } from '../types/domain.js';
import {
  MIN_REEL_CROP_X,
  MAX_REEL_CROP_X,
  MIN_PIP_SCALE,
  MAX_PIP_SCALE,
  DEFAULT_PIP_SCALE,
} from '../types/domain.js';

// Re-export the canonical crop/pip constants so geometry consumers have a
// single import surface (canvas.js) without disturbing domain.ts's exporters.
export { MIN_REEL_CROP_X, MAX_REEL_CROP_X, MIN_PIP_SCALE, MAX_PIP_SCALE, DEFAULT_PIP_SCALE };

export const CANVAS_W = 1920;
export const CANVAS_H = 1080;
export const PIP_FRACTION = 0.22;
export const PIP_MARGIN = 20;
export const PIP_SIZE = Math.round(CANVAS_W * PIP_FRACTION);
export const MIN_SECTION_PAN = -1;
export const MAX_SECTION_PAN = 1;
export const REEL_CANVAS_W = Math.round((CANVAS_H * 9) / 16);
export const REEL_CANVAS_H = CANVAS_H;

export function getContentWidth(
  sourceW: number | null,
  sourceH: number | null,
  fitMode: ScreenFitMode,
  canvasW: number,
  canvasH: number,
): number {
  if (fitMode !== 'fit' || !sourceW || !sourceH) return canvasW;
  const scale = Math.min(canvasW / sourceW, canvasH / sourceH);
  return sourceW * scale;
}
