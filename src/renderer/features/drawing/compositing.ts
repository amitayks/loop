// ── Drawing / compositing cluster ────────────────────────────────────
//
// Canvas drawing/compositing functions extracted verbatim from app.ts.
// Bodies are unchanged; only their location and explicit imports differ.
// State is read via live bindings from state.ts; canvas contexts/DOM from
// elements.ts; geometry constants from shared/domain/canvas.ts. Zoom/crop
// helpers (clampSectionZoom, resolveZoomCrop, panToFocusCoord) are imported
// from the editor/zoom-crop module; esbuild resolves the resulting circular
// import.

import {
  editorState,
  backgroundImage,
  screenStream,
  cameraStream,
  windowStreams,
  windowVideos,
  saveFolder,
  drawRAF,
  setDrawRAF
} from '../../state.js';
import {
  noPreview,
  recordBtn,
  ctx,
  screenVideo,
  cameraVideo,
  screenFitSelect,
  editorZoomBuffer,
  editorZoomBufferCtx
} from '../dom/elements.js';
import {
  CANVAS_W,
  CANVAS_H,
  REEL_CANVAS_W,
  REEL_CANVAS_H,
  PIP_SIZE,
  PIP_MARGIN
} from '../../../shared/domain/canvas.js';
import { clampSectionZoom, resolveZoomCrop, panToFocusCoord } from '../editor/zoom-crop.js';

export function getEffectiveCanvasDimensions(): { w: number; h: number } {
  if (!editorState || editorState.outputMode !== 'reel') return { w: CANVAS_W, h: CANVAS_H };
  return { w: REEL_CANVAS_W, h: REEL_CANVAS_H };
}

// ===== Shared drawPip function =====
export function drawPip(
  targetCtx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  pipX: number,
  pipY: number,
  pipW: number,
  pipH: number
): void {
  const r = 12;
  targetCtx.save();
  targetCtx.beginPath();
  targetCtx.moveTo(pipX + r, pipY);
  targetCtx.lineTo(pipX + pipW - r, pipY);
  targetCtx.quadraticCurveTo(pipX + pipW, pipY, pipX + pipW, pipY + r);
  targetCtx.lineTo(pipX + pipW, pipY + pipH - r);
  targetCtx.quadraticCurveTo(pipX + pipW, pipY + pipH, pipX + pipW - r, pipY + pipH);
  targetCtx.lineTo(pipX + r, pipY + pipH);
  targetCtx.quadraticCurveTo(pipX, pipY + pipH, pipX, pipY + pipH - r);
  targetCtx.lineTo(pipX, pipY + r);
  targetCtx.quadraticCurveTo(pipX, pipY, pipX + r, pipY);
  targetCtx.closePath();
  targetCtx.clip();
  const camW = video.videoWidth;
  const camH = video.videoHeight;
  const cropSize = Math.min(camW, camH);
  const sx = (camW - cropSize) / 2;
  const sy = (camH - cropSize) / 2;
  targetCtx.drawImage(video, sx, sy, cropSize, cropSize, pipX, pipY, pipW, pipH);
  targetCtx.restore();
}

export function drawCameraRect(
  targetCtx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  targetCtx.save();
  targetCtx.beginPath();
  if (r > 0.5) {
    targetCtx.moveTo(x + r, y);
    targetCtx.lineTo(x + w - r, y);
    targetCtx.quadraticCurveTo(x + w, y, x + w, y + r);
    targetCtx.lineTo(x + w, y + h - r);
    targetCtx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    targetCtx.lineTo(x + r, y + h);
    targetCtx.quadraticCurveTo(x, y + h, x, y + h - r);
    targetCtx.lineTo(x, y + r);
    targetCtx.quadraticCurveTo(x, y, x + r, y);
  } else {
    targetCtx.rect(x, y, w, h);
  }
  targetCtx.closePath();
  targetCtx.clip();
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  targetCtx.drawImage(video, dx, dy, dw, dh);
  targetCtx.restore();
}

export function drawBackground(targetCtx: CanvasRenderingContext2D, w: number, h: number): void {
  if (backgroundImage) {
    // Cover: fill entire canvas without stretching, crop overflow
    const scale = Math.max(w / backgroundImage.naturalWidth, h / backgroundImage.naturalHeight);
    const dw = backgroundImage.naturalWidth * scale;
    const dh = backgroundImage.naturalHeight * scale;
    const dx = (w - dw) / 2;
    const dy = (h - dh) / 2;
    targetCtx.drawImage(backgroundImage, dx, dy, dw, dh);
  } else {
    targetCtx.fillStyle = '#1E1E1E';
    targetCtx.fillRect(0, 0, w, h);
  }
}

export function updatePreview(): void {
  const hasAny = screenStream || cameraStream || windowStreams.length > 0;
  noPreview.classList.toggle('hidden', !!hasAny);
  recordBtn.disabled = !hasAny || !saveFolder;

  if (drawRAF) cancelAnimationFrame(drawRAF);
  if (hasAny) drawComposite();
}

export function drawComposite(): void {
  // Window capture mode: wallpaper + windows + camera PIP
  if (windowStreams.length > 0) {
    // Wallpaper/background fills the canvas first, so a window that is not yet
    // drawable shows the background (never a black fill). Each window is drawn
    // on top only once its <video> reports a non-zero videoWidth/videoHeight,
    // and begins drawing automatically on the first ready frame.
    drawBackground(ctx, CANVAS_W, CANVAS_H);

    if (windowStreams.length === 1 && windowVideos[0]) {
      const vid = windowVideos[0]!;
      if (vid.videoWidth && vid.videoHeight) {
        drawFitRounded(ctx, vid, 0, 0, CANVAS_W, CANVAS_H);
      }
    } else if (windowStreams.length >= 2) {
      const halfW = (CANVAS_W - 16) / 2;
      for (let i = 0; i < 2; i++) {
        const vid = windowVideos[i];
        if (vid && vid.videoWidth && vid.videoHeight) {
          const x = i === 0 ? 0 : halfW + 16;
          drawFitRounded(ctx, vid, x, 0, halfW, CANVAS_H);
        }
      }
    }

    // Camera PIP on top
    const hasCamera = cameraStream && cameraVideo.videoWidth;
    if (hasCamera) {
      const pipW = PIP_SIZE;
      const pipH = pipW;
      const pipX = CANVAS_W - pipW - PIP_MARGIN;
      const pipY = CANVAS_H - pipH - PIP_MARGIN;
      drawPip(ctx, cameraVideo, pipX, pipY, pipW, pipH);
    }

    setDrawRAF(requestAnimationFrame(drawComposite));
    return;
  }

  // Original single-source mode
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const hasScreen = screenStream && screenVideo.videoWidth;
  const hasCamera = cameraStream && cameraVideo.videoWidth;

  const drawScreen = screenFitSelect.value === 'fill' ? drawFill : drawFit;

  if (hasScreen && hasCamera) {
    drawScreen(ctx, screenVideo, 0, 0, CANVAS_W, CANVAS_H);
    const pipW = PIP_SIZE;
    const pipH = pipW;
    const pipX = CANVAS_W - pipW - PIP_MARGIN;
    const pipY = CANVAS_H - pipH - PIP_MARGIN;
    drawPip(ctx, cameraVideo, pipX, pipY, pipW, pipH);
  } else if (hasScreen) {
    drawScreen(ctx, screenVideo, 0, 0, CANVAS_W, CANVAS_H);
  } else if (hasCamera) {
    drawFit(ctx, cameraVideo, 0, 0, CANVAS_W, CANVAS_H);
  }

  setDrawRAF(requestAnimationFrame(drawComposite));
}

export function drawFit(
  targetCtx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.min(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  targetCtx.drawImage(video, dx, dy, dw, dh);
}

export function drawFitRounded(
  targetCtx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.min(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  const radius = Math.max(0, Math.round(18 * scale));
  if (dw <= 0 || dh <= 0) return;
  targetCtx.save();
  targetCtx.beginPath();
  targetCtx.roundRect(dx, dy, dw, dh, radius);
  targetCtx.clip();
  targetCtx.drawImage(video, dx, dy, dw, dh);
  targetCtx.restore();
}

export function drawFill(
  targetCtx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return;
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  targetCtx.save();
  targetCtx.beginPath();
  targetCtx.rect(x, y, w, h);
  targetCtx.clip();
  targetCtx.drawImage(video, dx, dy, dw, dh);
  targetCtx.restore();
}

export function drawEditorScreenWithZoom(
  targetCtx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  fitMode: string,
  backgroundZoom: unknown,
  backgroundPanX = 0,
  backgroundPanY = 0,
  backgroundFocusX: number | null = null,
  backgroundFocusY: number | null = null
): void {
  if (!editorZoomBufferCtx) return;
  const zoom = clampSectionZoom(backgroundZoom);
  const drawBase = fitMode === 'fill' ? drawFill : drawFit;

  if (zoom <= 1.0001 && zoom >= 0.9999) {
    drawBase(targetCtx, video, 0, 0, CANVAS_W, CANVAS_H);
    return;
  }

  if (zoom < 0.9999) {
    editorZoomBufferCtx.fillStyle = '#000';
    editorZoomBufferCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    drawBase(editorZoomBufferCtx, video, 0, 0, CANVAS_W, CANVAS_H);

    targetCtx.fillStyle = '#000';
    targetCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    targetCtx.save();
    targetCtx.globalAlpha = 0.2;
    targetCtx.drawImage(editorZoomBuffer, 0, 0, CANVAS_W, CANVAS_H);
    targetCtx.restore();

    const scaledW = Math.round(CANVAS_W * zoom);
    const scaledH = Math.round(CANVAS_H * zoom);
    const offsetX = Math.round((CANVAS_W - scaledW) / 2);
    const offsetY = Math.round((CANVAS_H - scaledH) / 2);
    targetCtx.drawImage(
      editorZoomBuffer,
      0,
      0,
      CANVAS_W,
      CANVAS_H,
      offsetX,
      offsetY,
      scaledW,
      scaledH
    );
    return;
  }

  editorZoomBufferCtx.fillStyle = '#000';
  editorZoomBufferCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  drawBase(editorZoomBufferCtx, video, 0, 0, CANVAS_W, CANVAS_H);

  const { sourceW, sourceH } = resolveZoomCrop(zoom, backgroundPanX, backgroundPanY);
  const focusX = backgroundFocusX ?? panToFocusCoord(zoom, backgroundPanX, 0.5);
  const focusY = backgroundFocusY ?? panToFocusCoord(zoom, backgroundPanY, 0.5);
  const sourceX = Math.max(0, Math.min(CANVAS_W - sourceW, focusX * CANVAS_W - sourceW / 2));
  const sourceY = Math.max(0, Math.min(CANVAS_H - sourceH, focusY * CANVAS_H - sourceH / 2));
  targetCtx.drawImage(
    editorZoomBuffer,
    sourceX,
    sourceY,
    sourceW,
    sourceH,
    0,
    0,
    CANVAS_W,
    CANVAS_H
  );
}
