import { CANVAS_W, CANVAS_H } from '../../../shared/domain/canvas.js';
import { generateOverlayId } from '../../../shared/domain/project-fields.js';
import type { Overlay } from '../../../shared/types/domain.js';

export function createOverlaysFromWindowPaths(
  windowPaths: Array<{ name: string; path: string; width?: number; height?: number; proxyPath?: string | null }>,
  duration: number
): Overlay[] {
  return windowPaths.slice(0, 2).map((wp, idx) => {
    const srcW = wp.width || CANVAS_W;
    const srcH = wp.height || CANVAS_H;

    // Landscape positioning — matches recording preview (drawComposite)
    let lw: number, lh: number, lx: number, ly: number;
    if (windowPaths.length === 1) {
      // Single window: fit to full canvas (same as drawFitRounded(0,0,CANVAS_W,CANVAS_H))
      const scale = Math.min(CANVAS_W / srcW, CANVAS_H / srcH);
      lw = srcW * scale;
      lh = srcH * scale;
      lx = (CANVAS_W - lw) / 2;
      ly = (CANVAS_H - lh) / 2;
    } else {
      // Two windows: side by side with gap (same as drawComposite's 2-window layout)
      const gap = 16;
      const halfW = (CANVAS_W - gap) / 2;
      const scale = Math.min(halfW / srcW, CANVAS_H / srcH);
      lw = srcW * scale;
      lh = srcH * scale;
      lx = idx === 0
        ? (halfW - lw) / 2
        : halfW + gap + (halfW - lw) / 2;
      ly = (CANVAS_H - lh) / 2;
    }

    // Reel starts identical to landscape — user can adjust per mode later
    const landscapePos = { x: Math.round(lx), y: Math.round(ly), width: Math.round(lw), height: Math.round(lh) };

    return {
      id: generateOverlayId(),
      trackIndex: idx,
      mediaPath: wp.path,
      mediaType: 'window' as const,
      startTime: 0,
      endTime: duration,
      sourceStart: 0,
      sourceEnd: duration,
      landscape: landscapePos,
      reel: { ...landscapePos },
      saved: false,
      sourceName: wp.name,
      sourceWidth: srcW,
      sourceHeight: srcH,
      ...(wp.proxyPath ? { proxyPath: wp.proxyPath } : {})
    };
  });
}
