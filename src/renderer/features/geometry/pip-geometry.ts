import { PIP_MARGIN, PIP_SIZE, CANVAS_W, CANVAS_H } from '../../../shared/domain/canvas.js';

export function getSnapPointPosition(
  snapPoint: string,
  w: number,
  h: number,
  ps: number,
): { x: number; y: number } {
  const midX = Math.round((w - ps) / 2);
  const midY = Math.round((h - ps) / 2);
  switch (snapPoint) {
    case 'tl':
      return { x: PIP_MARGIN, y: PIP_MARGIN };
    case 'tc':
      return { x: midX, y: PIP_MARGIN };
    case 'tr':
      return { x: w - ps - PIP_MARGIN, y: PIP_MARGIN };
    case 'ml':
      return { x: PIP_MARGIN, y: midY };
    case 'center':
      return { x: midX, y: midY };
    case 'mr':
      return { x: w - ps - PIP_MARGIN, y: midY };
    case 'bl':
      return { x: PIP_MARGIN, y: h - ps - PIP_MARGIN };
    case 'bc':
      return { x: midX, y: h - ps - PIP_MARGIN };
    case 'br':
    default:
      return { x: w - ps - PIP_MARGIN, y: h - ps - PIP_MARGIN };
  }
}

export function snapToNearest(
  cursorX: number,
  cursorY: number,
  effectiveW: number,
  effectiveH: number,
  pipSize: number,
): { x: number; y: number; snapPoint: string } {
  const w = effectiveW || CANVAS_W;
  const h = effectiveH || CANVAS_H;
  const ps = pipSize || PIP_SIZE;
  const points = ['tl', 'tc', 'tr', 'ml', 'center', 'mr', 'bl', 'bc', 'br'];
  let bestDist = Infinity;
  let bestSnap = 'br';
  for (const sp of points) {
    const pos = getSnapPointPosition(sp, w, h, ps);
    const dx = cursorX - pos.x;
    const dy = cursorY - pos.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      bestSnap = sp;
    }
  }
  const pos = getSnapPointPosition(bestSnap, w, h, ps);
  return { x: pos.x, y: pos.y, snapPoint: bestSnap };
}

export function computePipSize(pipScale: number, effectiveW: number): number {
  return Math.round(effectiveW * pipScale);
}
