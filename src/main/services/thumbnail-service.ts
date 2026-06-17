import fs from 'fs';
import path from 'path';

import { buildFilterComplex, buildScreenFilter, buildOverlayFilter, resolveOutputSize, getContentWidth } from './render-filter-service.js';
import { runFfmpeg } from './ffmpeg-runner.js';
import ffmpegStatic from 'ffmpeg-static';

import type { Keyframe, OutputMode, Overlay, ScreenFitMode } from '../../shared/types/domain.js';
import type { ThumbnailCaptureOptions, ThumbnailCaptureDeps } from '../../shared/types/services.js';

const TARGET_FPS = 30;

async function captureThumbnail(
  opts: Partial<ThumbnailCaptureOptions> = {},
  deps: Partial<ThumbnailCaptureDeps> = {}
): Promise<string> {
  const takes = Array.isArray(opts.takes) ? opts.takes : [];
  const keyframes: Keyframe[] = Array.isArray(opts.keyframes) ? opts.keyframes : [];
  const overlays: Overlay[] = Array.isArray(opts.overlays)
    ? opts.overlays
        .filter(o => o && o.mediaPath && o.mediaType)
        .sort((a, b) => (a.trackIndex || 0) - (b.trackIndex || 0) || a.startTime - b.startTime)
    : [];
  const sourceTime = Number.isFinite(Number(opts.sourceTime)) ? Number(opts.sourceTime) : 0;
  const cameraSyncOffsetMs = Number.isFinite(Number(opts.cameraSyncOffsetMs)) ? Number(opts.cameraSyncOffsetMs) : 0;
  const sourceWidth = Number.isFinite(Number(opts.sourceWidth)) ? Number(opts.sourceWidth) : 1920;
  const sourceHeight = Number.isFinite(Number(opts.sourceHeight)) ? Number(opts.sourceHeight) : 1080;
  const outputMode: OutputMode = opts.outputMode === 'reel' ? 'reel' : 'landscape';
  const screenFitMode: ScreenFitMode = opts.screenFitMode === 'fit' ? 'fit' : 'fill';
  const pipSize = Number.isFinite(Number(opts.pipSize)) ? Number(opts.pipSize) : 422;
  const projectFolder = typeof opts.projectFolder === 'string' ? opts.projectFolder : '';

  const runFfmpegProcess = deps.runFfmpeg || runFfmpeg;
  const ffmpegPath = typeof deps.ffmpegPath === 'string' ? deps.ffmpegPath : (ffmpegStatic || '');
  const now = typeof deps.now === 'function' ? deps.now : Date.now;

  if (!projectFolder) throw new Error('Missing project folder');

  // Fast path: canvas data URL from the renderer
  const canvasDataUrl = typeof opts.canvasDataUrl === 'string' ? opts.canvasDataUrl : '';
  if (canvasDataUrl) {
    const outputPath = path.join(projectFolder, `thumbnail-${now()}-${outputMode}.png`);
    const base64Data = canvasDataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(outputPath, Buffer.from(base64Data, 'base64'));
    return outputPath;
  }

  if (!ffmpegPath) throw new Error('ffmpeg-static is unavailable on this platform');

  const wallpaperPath = typeof opts.wallpaperPath === 'string' && opts.wallpaperPath ? opts.wallpaperPath : null;
  const hasWindowOverlays = overlays.some(o => o.mediaType === 'window');

  // Determine mode: screen-based take OR wallpaper-base (window-only capture)
  const take = takes.find(t => t && t.screenPath);
  const useWallpaperBase = !take && hasWindowOverlays;

  if (!take && !useWallpaperBase) {
    throw new Error('No take with screen path found and no wallpaper base available');
  }

  const canvasH = 1080;

  const outputPath = path.join(projectFolder, `thumbnail-${now()}-${outputMode}.png`);

  const hasCamera = keyframes.some(kf => kf.pipVisible || kf.cameraFullscreen);
  // In wallpaper-base mode, find any take with a camera for PIP
  const takeWithCamera = take || takes.find(t => t && t.cameraPath);
  const cameraPath = hasCamera && takeWithCamera?.cameraPath ? takeWithCamera.cameraPath : null;

  const canvasW = outputMode === 'reel' ? Math.round(canvasH * 9 / 16) : 1920;

  // In reel mode WITH overlays, build the screen+camera pipeline at landscape
  // resolution (1920x1080) so overlays can be composited in full-canvas space
  // before the reel crop is applied (matching render-service behavior).
  const isReel = outputMode === 'reel';
  const buildInLandscapeForOverlays = isReel && overlays.length > 0;
  const pipelineMode: OutputMode = buildInLandscapeForOverlays ? 'landscape' : outputMode;
  const pipelineCanvasW = buildInLandscapeForOverlays ? 1920 : canvasW;

  const args: string[] = [];

  // Input 0: screen OR wallpaper base
  if (take && take.screenPath) {
    args.push('-ss', sourceTime.toFixed(3), '-i', take.screenPath);
  } else {
    // Wallpaper base: single frame synthetic input
    if (wallpaperPath && fs.existsSync(wallpaperPath)) {
      args.push('-loop', '1', '-t', '0.1', '-i', wallpaperPath);
    } else {
      args.push('-f', 'lavfi', '-t', '0.1', '-i',
        `color=c=0x1E1E1E:s=${sourceWidth}x${sourceHeight}:r=${TARGET_FPS}`);
    }
  }

  // Input 1: camera (seeked with sync offset), if needed
  if (cameraPath) {
    const cameraTime = sourceTime + (cameraSyncOffsetMs / 1000);
    args.push('-ss', Math.max(0, cameraTime).toFixed(3), '-i', cameraPath);
  }

  // Build filter graph
  const filterParts: string[] = [];

  // When building in landscape for overlays, remap PIP coordinates from reel
  // canvas space (canvasW x canvasH) to landscape canvas space (pipelineCanvasW x canvasH)
  // so the PIP lands at the correct position within the reel crop area.
  const pipelineKeyframes = buildInLandscapeForOverlays
    ? (() => {
        const reelCanvasW = canvasW;
        const cContentW = getContentWidth(sourceWidth, sourceHeight, screenFitMode, pipelineCanvasW, canvasH);
        const cContentLeft = (pipelineCanvasW - cContentW) / 2;
        const cMaxCropRange = Math.max(0, cContentW - reelCanvasW);
        return keyframes.map(kf => {
          const cropOffset = cContentLeft + (((kf.reelCropX || 0) + 1) / 2) * cMaxCropRange;
          const kfPipScale = Number.isFinite(Number(kf.pipScale)) ? Number(kf.pipScale) : 0.22;
          return { ...kf, pipX: (kf.pipX || 0) + cropOffset, pipScale: kfPipScale * reelCanvasW / pipelineCanvasW };
        });
      })()
    : keyframes;

  if (cameraPath) {
    let complexFilter = buildFilterComplex(
      pipelineKeyframes, pipSize, screenFitMode, sourceWidth, sourceHeight,
      pipelineCanvasW, canvasH, true, TARGET_FPS, pipelineMode
    );

    if (overlays.length > 0) {
      complexFilter = complexFilter.replace(
        /\[screen\]\[cam\]overlay/,
        '[screen_ovl][cam]overlay'
      );
    }
    // In reel mode with overlays, the camera output needs to be [pre_reel_crop]
    // instead of [out] so the reel crop can be applied after everything.
    if (buildInLandscapeForOverlays) {
      complexFilter = complexFilter.replace(/\[out\]$/, '[pre_reel_crop]');
    }
    filterParts.push(complexFilter);
  } else {
    const baseOutputLabel = overlays.length > 0 ? '[screen]' : '[out]';
    filterParts.push(
      buildScreenFilter(
        pipelineKeyframes, screenFitMode, sourceWidth, sourceHeight,
        pipelineCanvasW, canvasH, baseOutputLabel, true, TARGET_FPS, pipelineMode
      )
    );
  }

  if (overlays.length > 0) {
    // Overlays are composited in the pipeline frame. In reel mode we build in
    // landscape, so overlays use landscape canvas/output dimensions and the
    // reel crop is applied afterwards.
    const { outW: finalOutW, outH: finalOutH } = resolveOutputSize(sourceWidth, sourceHeight, outputMode);
    const { outW: landOutW, outH: landOutH } = resolveOutputSize(sourceWidth, sourceHeight, 'landscape');
    const overlayCanvasW = buildInLandscapeForOverlays ? 1920 : canvasW;
    const overlayCanvasH = buildInLandscapeForOverlays ? 1080 : canvasH;
    const overlayOutW = buildInLandscapeForOverlays ? landOutW : finalOutW;
    const overlayOutH = buildInLandscapeForOverlays ? landOutH : finalOutH;

    let overlayInputOffset = 0;
    for (const a of args) { if (a === '-i') overlayInputOffset += 1; }

    const overlayResult = buildOverlayFilter(
      overlays, overlayCanvasW, overlayCanvasH, overlayOutW, overlayOutH,
      overlayInputOffset, 'screen', outputMode, 0.1
    );

    for (let i = 0; i < overlayResult.inputs.length; i++) {
      const inputArgs = overlayResult.inputs[i]!;
      const overlay = overlays[i]!;
      const rawPath = overlay.mediaPath;
      const mediaAbsPath = path.isAbsolute(rawPath) ? rawPath : path.join(projectFolder, rawPath);
      args.push(...inputArgs, mediaAbsPath);
    }

    for (const part of overlayResult.filterParts) {
      filterParts.push(part);
    }

    // Rename final overlay label:
    // - hasCamera: [screen_ovl] (feeds into camera overlay)
    // - no camera + reel overlays: [pre_reel_crop] (feeds into reel crop step)
    // - no camera + landscape: [out] (final output)
    const finalLabel = cameraPath ? '[screen_ovl]' : (buildInLandscapeForOverlays ? '[pre_reel_crop]' : '[out]');
    const lastIdx = filterParts.length - 1;
    if (lastIdx >= 0) {
      filterParts[lastIdx] = filterParts[lastIdx]!.replace(/\[ovl_\d+\]$/, finalLabel);
    }
  }

  // In reel mode with overlays, apply the reel crop AFTER overlay+PIP compositing.
  if (buildInLandscapeForOverlays) {
    const { outW: landW, outH: landH } = resolveOutputSize(sourceWidth, sourceHeight, 'landscape');
    let reelH = landH;
    if (reelH % 2 !== 0) reelH -= 1;
    let reelW = Math.round((reelH * 9) / 16);
    if (reelW % 2 !== 0) reelW -= 1;
    const landscapeContentW = getContentWidth(sourceWidth, sourceHeight, screenFitMode, landW, landH);
    const contentLeft = Math.round((landW - landscapeContentW) / 2);
    const maxCropRange = Math.max(0, Math.round(landscapeContentW) - reelW);
    const cropXVal = keyframes.length > 0 && Number.isFinite(keyframes[0]!.reelCropX) ? keyframes[0]!.reelCropX : 0;
    const cropX = Math.max(0, Math.min(landW - reelW, contentLeft + Math.round(((cropXVal || 0) + 1) / 2 * maxCropRange)));
    filterParts.push(`[pre_reel_crop]crop=${reelW}:${reelH}:${cropX}:0,setsar=1[out]`);
  }

  args.push('-filter_complex', filterParts.join(';'));
  args.push('-map', '[out]');
  args.push('-frames:v', '1', '-update', '1');
  args.push(outputPath);

  console.log('[thumbnail-capture] ffmpeg args:', args.join(' '));

  try {
    await runFfmpegProcess({ ffmpegPath, args });
    return outputPath;
  } catch (error) {
    console.error('[thumbnail-capture] ffmpeg error:', (error as Error)?.message || error);
    throw error;
  }
}

export { captureThumbnail };
