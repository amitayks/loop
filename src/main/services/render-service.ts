import path from 'path';

import { fs, ensureDirectory } from '../infra/file-system.js';
import {
  normalizeBackgroundZoom,
  normalizeBackgroundPan,
  normalizeExportAudioPreset,
  normalizeCameraSyncOffsetMs,
  normalizeReelCropX,
  normalizeOutputMode,
  normalizePipScale,
  normalizeAudioVolume,
  normalizeAudioOverlays,
  EXPORT_AUDIO_PRESET_COMPRESSED,
  EXPORT_AUDIO_PRESET_OFF
} from '../../shared/domain/project.js';
import { chooseRenderFps, probeVideoFpsWithFfmpeg } from './fps-service.js';
import { runFfmpeg } from './ffmpeg-runner.js';
import { buildFilterComplex, buildScreenFilter, buildOverlayFilter, buildAudioOverlayFilter, resolveOutputSize, buildNumericExpr, getContentWidth } from './render-filter-service.js';
import { readJsonFile } from '../infra/file-system.js';
import { subsampleTrail } from '../../shared/domain/mouse-trail.js';
import ffmpegStatic from 'ffmpeg-static';

import type { Keyframe, OutputMode } from '../../shared/types/domain.js';
import type {
  RenderOptions,
  RenderDeps,
  RenderProgress,
  FfmpegProgress,
  RenderSectionInput
} from '../../shared/types/services.js';
import type { MouseTrailData } from '../../shared/types/mouse-trail.js';

// ── Internal types ──────────────────────────────────────────────────

interface TakeEntry {
  screenPath: string | null | undefined;
  cameraPath: string | null | undefined;
  mousePath: string | null;
}

interface InputPlan {
  screenIdx: number;
  cameraIdx: number;
  audioOnlyIdx: number;
}

interface InputPlanResult {
  args: string[];
  fpsProbePaths: Set<string>;
  sectionInputs: InputPlan[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawSectionRecord = Record<string, any>;

// ── normalizeSectionInput ───────────────────────────────────────────

function normalizeSectionInput(rawSections: unknown): RenderSectionInput[] {
  const sections: RawSectionRecord[] = Array.isArray(rawSections) ? rawSections as RawSectionRecord[] : [];
  return sections
    .map((section) => {
      const sourceStart = Number(section.sourceStart);
      const sourceEnd = Number(section.sourceEnd);
      if (!Number.isFinite(sourceStart) || !Number.isFinite(sourceEnd) || sourceEnd <= sourceStart) return null;
      return {
        takeId: section.takeId as string,
        sourceStart,
        sourceEnd,
        backgroundZoom: normalizeBackgroundZoom(section.backgroundZoom),
        backgroundPanX: normalizeBackgroundPan(section.backgroundPanX),
        backgroundPanY: normalizeBackgroundPan(section.backgroundPanY),
        reelCropX: normalizeReelCropX(section.reelCropX),
        pipScale: normalizePipScale(section.pipScale),
        volume: normalizeAudioVolume(section.volume)
      };
    })
    .filter((s): s is RenderSectionInput => s !== null);
}

// ── assertFilePath ──────────────────────────────────────────────────

function assertFilePath(filePath: unknown, label: string): asserts filePath is string {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error(`Missing ${label} path`);
  }
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} file not found: ${filePath}`);
  }
}

// ── buildExportAudioLabel ───────────────────────────────────────────

function buildExportAudioLabel(exportAudioPreset: string): string {
  if (exportAudioPreset !== EXPORT_AUDIO_PRESET_COMPRESSED) {
    return 'audio_out';
  }

  // Keep the first preset conservative so dialog remains natural while peaks get leveled.
  return 'audio_final';
}

// ── buildCameraTrimFilter ───────────────────────────────────────────

function buildCameraTrimFilter(
  cameraIdx: number,
  section: RenderSectionInput,
  targetFps: number,
  index: number,
  cameraSyncOffsetMs: number
): string {
  const start = Number(section.sourceStart);
  const end = Number(section.sourceEnd);
  const duration = end - start;
  const offsetSec = normalizeCameraSyncOffsetMs(cameraSyncOffsetMs) / 1000;
  const label = `[cv${index}]`;

  if (!Number.isFinite(offsetSec) || Math.abs(offsetSec) < 0.0005) {
    return `[${cameraIdx}:v]trim=start=${start.toFixed(3)}:end=${end.toFixed(3)},setpts=PTS-STARTPTS,fps=fps=${targetFps}${label}`;
  }

  const sampleStart = Math.max(0, start + offsetSec);
  const unclampedSampleEnd = Math.max(0, end + offsetSec);
  const sampleEnd = Math.max(sampleStart + 0.001, unclampedSampleEnd);
  const startPad = Math.max(0, -offsetSec);
  const stopPad = Math.max(0, offsetSec);

  return `[${cameraIdx}:v]trim=start=${sampleStart.toFixed(3)}:end=${sampleEnd.toFixed(3)},setpts=PTS-STARTPTS,tpad=start_mode=clone:start_duration=${startPad.toFixed(3)}:stop_mode=clone:stop_duration=${stopPad.toFixed(3)},trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS,fps=fps=${targetFps}${label}`;
}

// ── buildInputPlan ──────────────────────────────────────────────────

function buildInputPlan(
  sections: RenderSectionInput[],
  takeMap: Map<string, TakeEntry>,
  hasCamera: boolean
): InputPlanResult {
  const fpsProbePaths = new Set<string>();
  const sectionInputs: InputPlan[] = [];
  const args: string[] = ['-progress', 'pipe:1', '-nostats'];
  const takeInputs = new Map<string, InputPlan>();
  let inputIndex = 0;

  for (const section of sections) {
    const take = takeMap.get(section.takeId);
    if (!take) throw new Error(`Take ${section.takeId} not found`);

    let inputPlan = takeInputs.get(section.takeId);
    if (!inputPlan) {
      let screenIdx = -1;
      if (take.screenPath && typeof take.screenPath === 'string' && take.screenPath.trim()) {
        assertFilePath(take.screenPath, 'Screen');
        args.push('-i', take.screenPath);
        fpsProbePaths.add(take.screenPath);
        screenIdx = inputIndex++;
      }

      let cameraIdx = -1;
      if (hasCamera && take.cameraPath) {
        assertFilePath(take.cameraPath, 'Camera');
        args.push('-i', take.cameraPath);
        fpsProbePaths.add(take.cameraPath);
        cameraIdx = inputIndex++;
      }

      // When no screen recording exists, find an audio source from the take
      let audioOnlyIdx = -1;
      if (screenIdx < 0) {
        if (cameraIdx >= 0) {
          // Camera was already added — reuse it for audio
          audioOnlyIdx = cameraIdx;
        } else if (take.cameraPath && typeof take.cameraPath === 'string' && take.cameraPath.trim()) {
          // Camera exists but wasn't added (hasCamera=false) — add as audio source
          try {
            assertFilePath(take.cameraPath, 'Camera (audio-only)');
            args.push('-i', take.cameraPath);
            audioOnlyIdx = inputIndex++;
          } catch {
            // Camera file not found — audioOnlyIdx stays -1
          }
        }
      }

      inputPlan = { screenIdx, cameraIdx, audioOnlyIdx };
      takeInputs.set(section.takeId, inputPlan);
    }

    sectionInputs.push(inputPlan);
  }

  return {
    args,
    fpsProbePaths,
    sectionInputs
  };
}

// ── buildOutputArgs ─────────────────────────────────────────────────

function buildOutputArgs(targetFps: number, outputPath: string): string[] {
  return [
    '-r',
    String(targetFps),
    '-fps_mode',
    'cfr',
    '-c:v',
    'libx264',
    '-crf',
    '12',
    '-preset',
    'slow',
    '-profile:v',
    'high',
    '-pix_fmt',
    'yuv420p',
    '-g',
    String(targetFps * 2),
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-y',
    outputPath
  ];
}

// ── getTotalDurationSec ─────────────────────────────────────────────

function getTotalDurationSec(sections: RenderSectionInput[]): number {
  return sections.reduce((total, section) => total + Math.max(0, section.sourceEnd - section.sourceStart), 0);
}

// ── buildRenderProgressUpdate ───────────────────────────────────────

function buildRenderProgressUpdate(
  progress: FfmpegProgress | null,
  totalDurationSec: number
): RenderProgress | null {
  if (!progress || typeof progress !== 'object') return null;

  const outTimeSec = Number(progress.outTimeSec);
  const hasOutTime = Number.isFinite(outTimeSec) && outTimeSec >= 0;
  const clampedPercent = hasOutTime && totalDurationSec > 0
    ? Math.max(0, Math.min(1, outTimeSec / totalDurationSec))
    : null;

  if (progress.status === 'end') {
    return {
      phase: 'finalizing',
      percent: 1,
      status: 'Finalizing export...',
      outTimeSec: hasOutTime ? outTimeSec : totalDurationSec,
      durationSec: totalDurationSec,
      frame: progress.frame ?? null,
      speed: progress.speed ?? null
    };
  }

  return {
    phase: 'rendering',
    percent: clampedPercent,
    status: clampedPercent === null ? 'Rendering...' : `Rendering ${Math.round(clampedPercent * 100)}%`,
    outTimeSec: hasOutTime ? outTimeSec : null,
    durationSec: totalDurationSec,
    frame: progress.frame ?? null,
    speed: progress.speed ?? null
  };
}

// ── expandAutoTrackKeyframes ────────────────────────────────────────

function expandAutoTrackKeyframes(
  keyframes: Keyframe[],
  sections: RenderSectionInput[],
  takeMap: Map<string, TakeEntry>,
  _deps: Partial<RenderDeps>
): Keyframe[] {
  const hasAutoTrack = keyframes.some(kf => kf.autoTrack && (kf.backgroundZoom || 1) > 1.0001);
  if (!hasAutoTrack) return keyframes;

  // Load mouse trails for takes that have auto-track sections
  const trailCache = new Map<string, MouseTrailData>();
  for (const section of sections) {
    const take = takeMap.get(section.takeId);
    if (!take) continue;
    // Find the take's mousePath from the raw take data
    const mousePath = take.mousePath || null;
    if (!mousePath || trailCache.has(section.takeId)) continue;
    try {
      const data = readJsonFile<MouseTrailData>(mousePath);
      if (data && Array.isArray(data.trail)) {
        trailCache.set(section.takeId, data);
      }
    } catch (_) { /* no trail available */ }
  }

  if (trailCache.size === 0) return keyframes;

  // Build expanded keyframe array with mouse trail keypoints
  const expanded: Keyframe[] = [];
  let timelineTime = 0;

  for (const section of sections) {
    const sectionDuration = section.sourceEnd - section.sourceStart;
    const sectionStart = timelineTime;
    const sectionEnd = timelineTime + sectionDuration;

    // Find the anchor keyframe for this section
    const anchor = keyframes.find(kf => Math.abs(kf.time - sectionStart) < 0.01);
    const isAutoTrack = anchor && anchor.autoTrack && (anchor.backgroundZoom || 1) > 1.0001;

    if (isAutoTrack) {
      const trailData = trailCache.get(section.takeId);
      if (trailData && trailData.trail.length > 0) {
        const smoothing = anchor.autoTrackSmoothing || 0.15;
        const kps = subsampleTrail(
          trailData.trail, smoothing,
          trailData.captureWidth, trailData.captureHeight,
          section.sourceStart, section.sourceEnd, 2
        );
        // Convert subsampled keypoints to timeline keyframes
        for (const kp of kps) {
          const t = sectionStart + (kp.time - section.sourceStart);
          expanded.push({
            ...anchor,
            time: t,
            backgroundFocusX: kp.focusX,
            backgroundFocusY: kp.focusY
          });
        }
      } else {
        expanded.push(anchor);
      }
    } else if (anchor) {
      expanded.push(anchor);
    }

    // Include any manual keyframes within this section's time range
    for (const kf of keyframes) {
      if (kf === anchor) continue;
      if (kf.time > sectionStart + 0.01 && kf.time < sectionEnd - 0.01) {
        expanded.push(kf);
      }
    }

    timelineTime = sectionEnd;
  }

  // Include keyframes at time 0 if not already covered
  const hasTimeZero = expanded.some(kf => kf.time < 0.01);
  if (!hasTimeZero && keyframes.length > 0) {
    expanded.unshift(keyframes[0]!);
  }

  return expanded.sort((a, b) => a.time - b.time);
}

// ── renderComposite ─────────────────────────────────────────────────

async function renderComposite(
  opts: Partial<RenderOptions> = {},
  deps: Partial<RenderDeps> = {}
): Promise<string> {
  const takes = Array.isArray(opts.takes) ? opts.takes : [];
  const sections = normalizeSectionInput(opts.sections);
  const keyframes: Keyframe[] = Array.isArray(opts.keyframes) ? opts.keyframes : [];
  const rawOverlays = Array.isArray(opts.overlays)
    ? opts.overlays.filter(o => o && o.mediaPath && o.mediaType).sort((a, b) => (a.trackIndex || 0) - (b.trackIndex || 0) || a.startTime - b.startTime)
    : [];
  const audioOverlays = normalizeAudioOverlays(opts.audioOverlays);
  const wallpaperPath = typeof opts.wallpaperPath === 'string' && opts.wallpaperPath ? opts.wallpaperPath : null;
  const hasWindowOverlays = rawOverlays.some(o => o.mediaType === 'window');
  const pipSize = Number.isFinite(Number(opts.pipSize)) ? Number(opts.pipSize) : 422;
  const screenFitMode = opts.screenFitMode === 'fit' ? 'fit' as const : 'fill' as const;
  const exportAudioPreset = normalizeExportAudioPreset(opts.exportAudioPreset);
  const cameraSyncOffsetMs = normalizeCameraSyncOffsetMs(opts.cameraSyncOffsetMs);
  const sourceWidth = Number.isFinite(Number(opts.sourceWidth)) ? Number(opts.sourceWidth) : 1920;
  const sourceHeight = Number.isFinite(Number(opts.sourceHeight)) ? Number(opts.sourceHeight) : 1080;
  const outputMode: OutputMode = normalizeOutputMode(opts.outputMode);
  const outputFolder = typeof opts.outputFolder === 'string' ? opts.outputFolder : '';

  const probeFps = deps.probeVideoFpsWithFfmpeg || probeVideoFpsWithFfmpeg;
  const runFfmpegProcess = deps.runFfmpeg || runFfmpeg;
  const ffmpegPath = deps.ffmpegPath || ffmpegStatic;
  const now = typeof deps.now === 'function' ? deps.now : Date.now;
  const onProgress = typeof deps.onProgress === 'function' ? deps.onProgress : null;

  if (!outputFolder) throw new Error('Missing output folder');
  if (sections.length === 0) throw new Error('No sections to render');

  ensureDirectory(outputFolder);

  if (!ffmpegPath) throw new Error('ffmpeg-static is unavailable on this platform');

  const outputPath = path.join(outputFolder, `recording-${now()}-edited.mp4`);
  const canvasH = 1080;
  const canvasW = outputMode === 'reel' ? Math.round(canvasH * 9 / 16) : 1920;

  const takeMap = new Map<string, TakeEntry>();
  for (const take of takes) {
    if (!take || typeof take.id !== 'string' || !take.id) continue;
    takeMap.set(take.id, { screenPath: take.screenPath, cameraPath: take.cameraPath, mousePath: take.mousePath || null });
  }

  const hasCamera = keyframes.some((keyframe) => keyframe.pipVisible || keyframe.cameraFullscreen);
  const { args, fpsProbePaths, sectionInputs } = buildInputPlan(sections, takeMap, hasCamera);
  const totalDurationSec = getTotalDurationSec(sections);

  // Clamp overlays to the timeline duration so they don't extend the output
  const overlays = rawOverlays
    .filter(o => o.startTime < totalDurationSec)
    .map(o => {
      if (o.endTime <= totalDurationSec) return o;
      const clampedEnd = totalDurationSec;
      const origDuration = Math.max(0.001, o.endTime - o.startTime);
      const clampedDuration = clampedEnd - o.startTime;
      const sourceDuration = o.sourceEnd - o.sourceStart;
      const clampedSourceEnd = o.sourceStart + sourceDuration * (clampedDuration / origDuration);
      return { ...o, endTime: clampedEnd, sourceEnd: clampedSourceEnd };
    });

  // When window overlays are present and some sections lack a screen recording,
  // inject a wallpaper image or solid-color base as a synthetic screen input.
  let wallpaperIdx = -1;
  const needsWallpaperBase = hasWindowOverlays && sectionInputs.some(si => si.screenIdx < 0);
  if (needsWallpaperBase) {
    let currentInputCount = 0;
    for (const a of args) { if (a === '-i') currentInputCount += 1; }
    wallpaperIdx = currentInputCount;
    if (wallpaperPath && fs.existsSync(wallpaperPath)) {
      args.push('-loop', '1', '-t', totalDurationSec.toFixed(3), '-i', wallpaperPath);
    } else {
      args.push('-f', 'lavfi', '-t', totalDurationSec.toFixed(3), '-i',
        `color=c=0x1E1E1E:s=${sourceWidth}x${sourceHeight}:r=30`);
    }
  }

  const fpsProbeResults = await Promise.all(
    Array.from(fpsProbePaths).map(async (filePath) => ({
      filePath,
      fps: await probeFps(ffmpegPath, filePath)
    }))
  );

  const targetFps = chooseRenderFps(
    fpsProbeResults.map((result) => result.fps),
    hasCamera
  );

  console.log(
    '[render-composite] FPS selection:',
    fpsProbeResults.map((result) => ({
      file: path.basename(result.filePath),
      fps: result.fps ? Number(result.fps.toFixed(3)) : null
    })),
    'targetFps=',
    targetFps
  );

  const filterParts: string[] = [];

  for (let i = 0; i < sections.length; i += 1) {
    const section = sections[i]!;
    const inputs = sectionInputs[i]!;
    const start = section.sourceStart.toFixed(3);
    const end = section.sourceEnd.toFixed(3);
    const duration = (section.sourceEnd - section.sourceStart).toFixed(3);
    const sectionVolume = section.volume;
    const volumeFilter = (audioOverlays.length > 0 && exportAudioPreset === EXPORT_AUDIO_PRESET_OFF)
      ? ',volume=0'
      : (Math.abs(sectionVolume - 1.0) > 0.0001 ? `,volume=${sectionVolume.toFixed(3)}` : '');

    const screenIdx = inputs.screenIdx;

    if (screenIdx >= 0) {
      filterParts.push(
        `[${screenIdx}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,fps=fps=${targetFps},setsar=1[sv${i}]`
      );
      filterParts.push(`[${screenIdx}:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS${volumeFilter}[sa${i}]`);
    } else if (wallpaperIdx >= 0) {
      // Wallpaper/color base: generate video from the wallpaper input
      filterParts.push(
        `[${wallpaperIdx}:v]trim=duration=${duration},setpts=PTS-STARTPTS,fps=fps=${targetFps},scale=${sourceWidth}:${sourceHeight},setsar=1[sv${i}]`
      );
      // Extract audio from the take's available audio source, or generate silence
      if (inputs.audioOnlyIdx >= 0) {
        filterParts.push(`[${inputs.audioOnlyIdx}:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS${volumeFilter}[sa${i}]`);
      } else {
        filterParts.push(
          `anullsrc=r=48000:cl=stereo,atrim=duration=${duration}${volumeFilter}[sa${i}]`
        );
      }
    } else {
      // No screen recording and no wallpaper — generate blank video + silence
      console.warn(`[render-composite] Section ${i} has no screen (idx=${screenIdx}) and no wallpaper — generating blank frame + silence`);
      filterParts.push(
        `color=c=0x1E1E1E:s=${sourceWidth}x${sourceHeight}:r=${targetFps}:d=${duration},setsar=1[sv${i}]`
      );
      filterParts.push(
        `anullsrc=r=48000:cl=stereo,atrim=duration=${duration}${volumeFilter}[sa${i}]`
      );
    }
  }

  const screenLabels = sections.map((_, index) => `[sv${index}][sa${index}]`).join('');
  const hasAudioOverlays = audioOverlays.length > 0;
  const screenAudioLabel = hasAudioOverlays ? 'screen_audio' : 'audio_out';
  filterParts.push(`${screenLabels}concat=n=${sections.length}:v=1:a=1[screen_raw][${screenAudioLabel}]`);

  // Determine final audio label based on audio overlays and export preset
  let exportAudioLabel: string;
  if (hasAudioOverlays) {
    // Audio overlays will be mixed in later; exportAudioLabel will be set after mixing
    exportAudioLabel = 'mixed_audio';
  } else if (exportAudioPreset === EXPORT_AUDIO_PRESET_OFF) {
    exportAudioLabel = 'audio_out';
  } else {
    exportAudioLabel = buildExportAudioLabel(exportAudioPreset);
    if (exportAudioLabel === 'audio_final') {
      filterParts.push(
        '[audio_out]acompressor=threshold=0.125:ratio=3:attack=20:release=250:makeup=1.5[audio_final]'
      );
    }
  }

  // When overlays exist in reel mode, build the screen+camera pipeline at landscape
  // resolution (1920x1080) so overlays can be composited in full-canvas space before
  // the reel crop is applied. Without overlays, use the normal reel pipeline.
  const isReel = outputMode === 'reel';
  const buildInLandscapeForOverlays = isReel && overlays.length > 0;
  const pipelineMode = buildInLandscapeForOverlays ? 'landscape' as const : outputMode;
  const pipelineCanvasW = buildInLandscapeForOverlays ? 1920 : canvasW;

  if (hasCamera) {
    for (let i = 0; i < sections.length; i += 1) {
      const section = sections[i]!;
      const { cameraIdx } = sectionInputs[i]!;
      const duration = (section.sourceEnd - section.sourceStart).toFixed(3);
      if (cameraIdx >= 0) {
        filterParts.push(buildCameraTrimFilter(cameraIdx, section, targetFps, i, cameraSyncOffsetMs));
      } else {
        const fallbackW = pipelineMode === 'reel' ? Math.round((sourceHeight * 9) / 16) : 1920;
        const fallbackH = pipelineMode === 'reel' ? sourceHeight : 1080;
        filterParts.push(`color=black:s=${fallbackW}x${fallbackH}:d=${duration}[cv${i}]`);
      }
    }

    const cameraLabels = sections.map((_, index) => `[cv${index}]`).join('');
    filterParts.push(`${cameraLabels}concat=n=${sections.length}:v=1:a=0[camera_raw]`);

    // Expand keyframes with auto-track mouse trail data
    const renderKeyframes = expandAutoTrackKeyframes(keyframes, sections, takeMap, deps);

    // When building in landscape for overlays, remap PIP coordinates from reel
    // canvas space (canvasW x canvasH) to landscape canvas space (pipelineCanvasW x canvasH)
    // so the PIP lands at the correct position within the reel crop area.
    const pipelineKeyframes = buildInLandscapeForOverlays
      ? (() => {
          const reelCanvasW = canvasW;
          const cContentW = getContentWidth(sourceWidth, sourceHeight, screenFitMode, pipelineCanvasW, canvasH);
          const cContentLeft = (pipelineCanvasW - cContentW) / 2;
          const cMaxCropRange = Math.max(0, cContentW - reelCanvasW);
          return renderKeyframes.map(kf => {
            const cropOffset = cContentLeft + (((kf.reelCropX || 0) + 1) / 2) * cMaxCropRange;
            const kfPipScale = Number.isFinite(Number(kf.pipScale)) ? Number(kf.pipScale) : 0.22;
            return { ...kf, pipX: (kf.pipX || 0) + cropOffset, pipScale: kfPipScale * reelCanvasW / pipelineCanvasW };
          });
        })()
      : renderKeyframes;

    const overlayFilter = buildFilterComplex(
      pipelineKeyframes,
      pipSize,
      screenFitMode,
      sourceWidth,
      sourceHeight,
      pipelineCanvasW,
      canvasH,
      true,
      targetFps,
      pipelineMode
    );
    let adaptedOverlay = overlayFilter
      .replace(/\[0:v\]/g, '[screen_raw]')
      .replace(/\[1:v\]/g, '[camera_raw]');
    if (overlays.length > 0) {
      // Insert overlay media BETWEEN screen and PIP:
      // Replace [screen] -> [screen_pre_ovl] in the PIP overlay line,
      // so overlay media can chain [screen_pre_ovl] -> [screen] before PIP composites.
      adaptedOverlay = adaptedOverlay.replace(
        /\[screen\]\[cam\]overlay/,
        '[screen_ovl][cam]overlay'
      );
    }
    // In reel mode with overlays, the camera output needs to be [pre_reel_crop]
    // instead of [out] so the reel crop can be applied after everything.
    if (buildInLandscapeForOverlays) {
      adaptedOverlay = adaptedOverlay.replace(/\[out\]$/, '[pre_reel_crop]');
    }
    filterParts.push(adaptedOverlay);
  } else {
    const outputLabel = overlays.length > 0 ? '[screen]' : '[out]';
    const renderKeyframesNoCamera = expandAutoTrackKeyframes(keyframes, sections, takeMap, deps);
    const screenOnlyFilter = buildScreenFilter(
      renderKeyframesNoCamera,
      screenFitMode,
      sourceWidth,
      sourceHeight,
      pipelineCanvasW,
      canvasH,
      outputLabel,
      true,
      targetFps,
      pipelineMode
    ).replace(/\[0:v\]/g, '[screen_raw]');
    filterParts.push(screenOnlyFilter);
  }

  // Overlay media filters (between screen/PIP and final output)
  // Overlays are always positioned in the full 1920x1080 canvas space (landscape),
  // independent of reel crop. In reel mode, overlays use landscape positions and the
  // output is the full landscape resolution — the reel crop is applied afterwards.
  if (overlays.length > 0) {
    const landscapeW = 1920;
    const landscapeH = 1080;
    const { outW: finalOutW, outH: finalOutH } = resolveOutputSize(sourceWidth, sourceHeight, outputMode);
    const { outW: landOutW, outH: landOutH } = resolveOutputSize(sourceWidth, sourceHeight, 'landscape');
    // Canvas is always 1920x1080; output dimensions match the pipeline frame
    const overlayCanvasW = landscapeW;
    const overlayCanvasH = landscapeH;
    const overlayOutW = outputMode === 'reel' ? landOutW : finalOutW;
    const overlayOutH = outputMode === 'reel' ? landOutH : finalOutH;
    // Count existing -i flags in args to determine input index offset
    let overlayInputOffset = 0;
    for (const a of args) { if (a === '-i') overlayInputOffset += 1; }
    const overlayResult = buildOverlayFilter(
      overlays, overlayCanvasW, overlayCanvasH, overlayOutW, overlayOutH,
      overlayInputOffset, 'screen', outputMode, totalDurationSec, targetFps
    );
    // Add overlay media inputs to args
    for (let i = 0; i < overlayResult.inputs.length; i++) {
      const inputArgs = overlayResult.inputs[i]!;
      const overlay = overlays[i]!;
      // Use the original media for the final render (proxy is for preview only)
      const rawPath = overlay.mediaPath;
      const mediaAbsPath = path.isAbsolute(rawPath) ? rawPath : path.join(outputFolder, rawPath);
      args.push(...inputArgs, mediaAbsPath);
    }
    // Append overlay filter parts
    for (const part of overlayResult.filterParts) {
      filterParts.push(part);
    }
    // Rename final overlay label:
    // - hasCamera: [screen_ovl] (feeds into camera overlay)
    // - no camera + reel overlays: [pre_reel_crop] (feeds into reel crop step)
    // - no camera + landscape: [out] (final output)
    const finalOvlLabel = hasCamera ? '[screen_ovl]' : (buildInLandscapeForOverlays ? '[pre_reel_crop]' : '[out]');
    const lastIdx = filterParts.length - 1;
    if (lastIdx >= 0) {
      filterParts[lastIdx] = filterParts[lastIdx]!.replace(/\[ovl_\d+\]$/, finalOvlLabel);
    }

  }

  // In reel mode with overlays, apply the reel crop AFTER overlay+PIP compositing.
  // The pipeline frame is at landscape resolution (resolveOutputSize in 'landscape' mode),
  // so the reel crop dimensions must fit within that frame — not the raw source dimensions.
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
    const hasAnimatedCrop = keyframes.length > 1 && keyframes.some((kf, i) => {
      if (i === 0) return false;
      return Math.abs((kf.reelCropX || 0) - (keyframes[i - 1]!.reelCropX || 0)) > 0.0001;
    });
    if (hasAnimatedCrop) {
      const cropXExpr = buildNumericExpr(keyframes.map(kf => ({ ...kf, reelCropX: kf.reelCropX || 0 })), 'reelCropX', 3, 0, 't');
      filterParts.push(`[pre_reel_crop]crop=${reelW}:${reelH}:'max(0,min(${landW - reelW},${contentLeft}+(${cropXExpr}+1)/2*${maxCropRange}))':0,setsar=1[out]`);
    } else {
      const cropX = Math.max(0, Math.min(landW - reelW, contentLeft + Math.round(((cropXVal || 0) + 1) / 2 * maxCropRange)));
      filterParts.push(`[pre_reel_crop]crop=${reelW}:${reelH}:${cropX}:0,setsar=1[out]`);
    }
  }

  // Audio overlay filters (mix external audio with screen audio)
  if (hasAudioOverlays) {
    let audioInputOffset = 0;
    for (const a of args) { if (a === '-i') audioInputOffset += 1; }
    const audioResult = buildAudioOverlayFilter(audioOverlays, audioInputOffset, totalDurationSec);
    // Add audio overlay file inputs
    for (let i = 0; i < audioResult.inputs.length; i++) {
      const inputArgs = audioResult.inputs[i]!;
      const ao = audioOverlays[i]!;
      const mediaAbsPath = path.join(outputFolder, ao.mediaPath);
      args.push(...inputArgs, mediaAbsPath);
    }
    // Append audio overlay filter parts
    for (const part of audioResult.filterParts) {
      filterParts.push(part);
    }
    // amix: combine screen audio with all audio overlay streams
    const amixInputs = [`[${screenAudioLabel}]`, ...audioResult.labels.map(l => `[${l}]`)].join('');
    const amixCount = 1 + audioResult.labels.length;
    filterParts.push(`${amixInputs}amix=inputs=${amixCount}:duration=first:normalize=0[mixed_audio]`);

    // Apply compression after mix if needed
    if (exportAudioPreset === EXPORT_AUDIO_PRESET_COMPRESSED) {
      filterParts.push(
        '[mixed_audio]acompressor=threshold=0.125:ratio=3:attack=20:release=250:makeup=1.5[audio_final]'
      );
      exportAudioLabel = 'audio_final';
    }
  }

  args.push('-filter_complex', filterParts.join(';'), '-map', '[out]', '-map', `[${exportAudioLabel}]`);
  args.push(...buildOutputArgs(targetFps, outputPath));

  console.log('ffmpeg args:', args.join(' '));

  if (onProgress) {
    onProgress({
      phase: 'starting',
      percent: 0,
      status: 'Preparing render...',
      durationSec: totalDurationSec
    });
  }

  try {
    await runFfmpegProcess({
      ffmpegPath,
      args,
      onProgress: (progress: FfmpegProgress) => {
        if (!onProgress) return;
        const update = buildRenderProgressUpdate(progress, totalDurationSec);
        if (update) onProgress(update);
      }
    });
    return outputPath;
  } catch (error) {
    console.error('ffmpeg stderr:', (error as Error)?.message || error);
    throw error;
  }
}

export {
  renderComposite,
  normalizeSectionInput,
  assertFilePath,
  buildCameraTrimFilter
};
