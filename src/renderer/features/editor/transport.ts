import {
  CAMERA_DRIFT_HARD_THRESHOLD,
  CAMERA_DRIFT_LOG_INTERVAL_MS,
  CAMERA_DRIFT_LOG_THRESHOLD,
  CAMERA_DRIFT_SOFT_THRESHOLD,
  CAMERA_RESYNC_COOLDOWN_MS,
  DEFAULT_SECTION_ZOOM,
  TRANSITION_DURATION,
  activePlaybackSection,
  activeTakeId,
  activeWorkspaceView,
  cameraResyncCooldownUntil,
  editorDrawRAF,
  editorPausedDrawTimer,
  editorState,
  editorVideoFrameCallbackId,
  editorVideoFrameHost,
  editorVideoFrameSafetyTimer,
  lastCameraDriftLogAt,
  overlayVideoEls,
  takeVideoPool,
  setActivePlaybackSection,
  setActiveTakeId,
  setCameraResyncCooldownUntil,
  setEditorDrawRAF,
  setEditorPausedDrawTimer,
  setEditorVideoFrameCallbackId,
  setEditorVideoFrameHost,
  setEditorVideoFrameSafetyTimer,
  setLastCameraDriftLogAt
} from '../../state.js';
import type { TakeVideos } from '../../state.js';
import {
  editorCtx,
  editorPlayBtn,
  editorScrubber,
  editorTimeEl
} from '../dom/elements.js';
import {
  drawBackground,
  drawCameraRect,
  drawEditorScreenWithZoom,
  drawPip
} from '../drawing/compositing.js';
import { getOverlayStateAtTime as _getOverlayStateAtTime } from '../timeline/overlay-utils.js';
import type { OverlayState } from '../timeline/overlay-utils.js';
import {
  computeCameraPlaybackDrift,
  resolveCameraPlaybackTargetTime
} from '../timeline/camera-sync.js';
import { lookupSmoothedMouseAt } from '../timeline/mouse-trail.js';
import {
  clampReelCropX,
  clampSectionPan,
  reelCropXToPixelOffset
} from '../geometry/section-geometry.js';
import { computePipSize } from '../geometry/pip-geometry.js';
import { getContentWidth } from '../../../shared/domain/canvas.js';
import {
  CANVAS_W,
  CANVAS_H,
  REEL_CANVAS_W,
  REEL_CANVAS_H,
  DEFAULT_PIP_SCALE
} from '../../../shared/domain/canvas.js';
import { normalizePipScale } from '../../../shared/domain/project-fields.js';
import { easeInOut } from '../../../shared/domain/easing.js';
import { formatTime } from '../format/format-utils.js';
import type { Section, Keyframe, PipSnapPoint } from '../../../shared/types/domain.js';
import { findSectionForTime, getSelectedSection } from '../section/section-editing.js';
import {
  getMouseTrailForTake,
  getOrCreateTakeVideos,
  resolveTimeToSource
} from '../media/take-media.js';
import { scrollTimelineToPlayhead } from './interactions.js';
import { clampSectionZoom, focusToPanCoord, panToFocusCoord } from './zoom-crop.js';
import { getOverlayImageElement, getOverlayVideoElement } from '../overlay/overlay.js';
import {
  startAudioOverlayPlayback,
  stopAudioOverlayPlayback
} from '../audio-overlay/audio-overlay.js';

export interface VisualState {
  pipX: number;
  pipY: number;
  pipVisible: boolean;
  opacity: number;
  cameraFullscreen: boolean;
  camTransition: number;
  backgroundZoom: number;
  backgroundPanX: number;
  backgroundPanY: number;
  backgroundFocusX: number;
  backgroundFocusY: number;
  reelCropX: number;
  pipScale: number;
  pipSnapPoint: PipSnapPoint;
  autoTrack: boolean;
  autoTrackSmoothing: number;
}

export function hasPendingEditorDraw(): boolean {
  return !!editorDrawRAF || !!editorPausedDrawTimer || editorVideoFrameCallbackId !== null;
}

export function cancelEditorDrawLoop(): void {
  if (editorDrawRAF) {
    cancelAnimationFrame(editorDrawRAF);
    setEditorDrawRAF(null);
  }
  if (editorPausedDrawTimer) {
    clearTimeout(editorPausedDrawTimer);
    setEditorPausedDrawTimer(null);
  }
  if (
    editorVideoFrameHost &&
    editorVideoFrameCallbackId !== null &&
    typeof editorVideoFrameHost.cancelVideoFrameCallback === 'function'
  ) {
    try {
      editorVideoFrameHost.cancelVideoFrameCallback(editorVideoFrameCallbackId);
    } catch (_error) {
      // Ignore cancellation races while switching active takes.
    }
  }
  setEditorVideoFrameCallbackId(null);
  setEditorVideoFrameHost(null);
  if (editorVideoFrameSafetyTimer) {
    clearTimeout(editorVideoFrameSafetyTimer);
    setEditorVideoFrameSafetyTimer(null);
  }
}

export function scheduleEditorDrawLoop(): void {
  if (!editorState || activeWorkspaceView !== 'timeline') return;

  if (editorState.playing && activeTakeId) {
    const videos = getOrCreateTakeVideos(activeTakeId);
    const screen = videos?.screen;
    if (screen && typeof screen.requestVideoFrameCallback === 'function') {
      setEditorVideoFrameHost(screen);
      setEditorVideoFrameCallbackId(
        screen.requestVideoFrameCallback(() => {
          if (editorVideoFrameSafetyTimer) {
            clearTimeout(editorVideoFrameSafetyTimer);
            setEditorVideoFrameSafetyTimer(null);
          }
          setEditorVideoFrameCallbackId(null);
          setEditorVideoFrameHost(null);
          editorDrawLoop();
        })
      );
      setEditorVideoFrameSafetyTimer(
        setTimeout(() => {
          setEditorVideoFrameSafetyTimer(null);
          if (editorVideoFrameCallbackId !== null && editorState?.playing) {
            cancelEditorDrawLoop();
            setEditorDrawRAF(
              requestAnimationFrame(() => {
                setEditorDrawRAF(null);
                editorDrawLoop();
              })
            );
          }
        }, 200)
      );
      return;
    }
  }

  if (editorState.playing) {
    setEditorDrawRAF(
      requestAnimationFrame(() => {
        setEditorDrawRAF(null);
        editorDrawLoop();
      })
    );
    return;
  }

  setEditorPausedDrawTimer(
    setTimeout(
      () => {
        setEditorPausedDrawTimer(null);
        setEditorDrawRAF(
          requestAnimationFrame(() => {
            setEditorDrawRAF(null);
            editorDrawLoop();
          })
        );
      },
      Math.round(1000 / 24)
    )
  );
}

export function getStateAtTime(time: number): VisualState {
  const defaultKf = {
    time: 0,
    pipX: editorState!.defaultPipX,
    pipY: editorState!.defaultPipY,
    pipVisible: true,
    cameraFullscreen: false,
    backgroundZoom: DEFAULT_SECTION_ZOOM,
    backgroundPanX: 0,
    backgroundPanY: 0,
    reelCropX: 0,
    pipScale: editorState!.pipScale || DEFAULT_PIP_SCALE,
    pipSnapPoint: 'br' as PipSnapPoint,
    autoTrack: false,
    autoTrackSmoothing: 0.15
  };
  const userKfs = editorState!.keyframes;
  const kfs =
    userKfs.length > 0 && userKfs[0]!.time === 0 ? userKfs : [defaultKf as Keyframe, ...userKfs];

  let activeIdx = 0;
  for (let i = 1; i < kfs.length; i++) {
    if (kfs[i]!.time <= time) activeIdx = i;
    else break;
  }

  const active = kfs[activeIdx]!;
  const next = activeIdx < kfs.length - 1 ? kfs[activeIdx + 1]! : null;

  let pipX = active.pipX;
  let pipY = active.pipY;
  let opacity = active.pipVisible ? 1 : 0;
  let cameraFullscreen = active.cameraFullscreen || false;
  let camTransition = cameraFullscreen ? 1 : 0;
  let backgroundZoom = clampSectionZoom(active.backgroundZoom);
  let backgroundPanX = clampSectionPan(active.backgroundPanX);
  let backgroundPanY = clampSectionPan(active.backgroundPanY);
  let backgroundFocusX = panToFocusCoord(backgroundZoom, backgroundPanX, 0.5);
  let backgroundFocusY = panToFocusCoord(backgroundZoom, backgroundPanY, 0.5);
  let reelCropX = clampReelCropX(active.reelCropX);
  let pipScale = normalizePipScale(active.pipScale);

  if (next) {
    const remaining = next.time - time;
    if (remaining > 0 && remaining < TRANSITION_DURATION) {
      const t = 1 - remaining / TRANSITION_DURATION;
      const nextVisible = next.pipVisible !== undefined ? next.pipVisible : true;
      const nextFullscreen = next.cameraFullscreen || false;

      if (active.pipVisible !== nextVisible) {
        if (nextVisible) {
          opacity = t;
          pipX = next.pipX;
          pipY = next.pipY;
          cameraFullscreen = nextFullscreen;
          camTransition = nextFullscreen ? 1 : 0;
        } else {
          opacity = 1 - t;
          camTransition = cameraFullscreen ? 1 : 0;
        }
      } else {
        if (cameraFullscreen !== nextFullscreen) {
          camTransition = nextFullscreen ? t : 1 - t;
          if (!nextFullscreen) {
            pipX = next.pipX;
            pipY = next.pipY;
          }
        }

        if (
          !cameraFullscreen &&
          !nextFullscreen &&
          (active.pipX !== next.pipX || active.pipY !== next.pipY)
        ) {
          pipX = active.pipX + (next.pipX - active.pipX) * t;
          pipY = active.pipY + (next.pipY - active.pipY) * t;
        }
      }

      if (Math.abs(backgroundZoom - clampSectionZoom(next.backgroundZoom)) > 0.0001) {
        backgroundZoom =
          backgroundZoom + (clampSectionZoom(next.backgroundZoom) - backgroundZoom) * t;
      }
      const nextFocusX = panToFocusCoord(next.backgroundZoom, next.backgroundPanX, 0.5);
      const nextFocusY = panToFocusCoord(next.backgroundZoom, next.backgroundPanY, 0.5);
      backgroundFocusX = backgroundFocusX + (nextFocusX - backgroundFocusX) * t;
      backgroundFocusY = backgroundFocusY + (nextFocusY - backgroundFocusY) * t;
      backgroundPanX = focusToPanCoord(backgroundZoom, backgroundFocusX, backgroundPanX);
      backgroundPanY = focusToPanCoord(backgroundZoom, backgroundFocusY, backgroundPanY);

      const nextReelCropX = clampReelCropX(next.reelCropX);
      if (Math.abs(reelCropX - nextReelCropX) > 0.0001) {
        reelCropX = reelCropX + (nextReelCropX - reelCropX) * t;
      }

      const nextPipScale = normalizePipScale(next.pipScale);
      if (Math.abs(pipScale - nextPipScale) > 0.0001) {
        pipScale = pipScale + (nextPipScale - pipScale) * t;
      }
    }
  }

  if (active.autoTrack && backgroundZoom > 1.0001) {
    const activeSection = findSectionForTime(time);
    if (activeSection) {
      const trailData = getMouseTrailForTake(activeSection.takeId!);
      if (trailData && trailData.trail && trailData.trail.length > 0) {
        const sourceTime = activeSection.sourceStart + (time - activeSection.start);
        const smoothed = lookupSmoothedMouseAt(
          trailData.trail,
          sourceTime,
          active.autoTrackSmoothing || 0.15,
          trailData.captureWidth,
          trailData.captureHeight
        );
        backgroundFocusX = smoothed.focusX;
        backgroundFocusY = smoothed.focusY;
      }
    }
  }

  return {
    pipX,
    pipY,
    pipVisible: opacity > 0,
    opacity,
    cameraFullscreen,
    camTransition,
    backgroundZoom,
    backgroundPanX,
    backgroundPanY,
    backgroundFocusX,
    backgroundFocusY,
    reelCropX,
    pipScale,
    pipSnapPoint: (active.pipSnapPoint || 'br') as PipSnapPoint,
    autoTrack: !!active.autoTrack,
    autoTrackSmoothing: active.autoTrackSmoothing || 0.15
  };
}

export function getOverlayStateAtTime(time: number, trackIndex?: number): OverlayState {
  if (!editorState || !Array.isArray(editorState.overlays) || editorState.overlays.length === 0) {
    return { active: false };
  }
  const dur = editorState.duration || 0;
  if (trackIndex !== undefined) {
    const trackOverlays = editorState.overlays.filter((o) => (o.trackIndex || 0) === trackIndex);
    return _getOverlayStateAtTime(time, trackOverlays, editorState.outputMode, dur);
  }
  return _getOverlayStateAtTime(time, editorState.overlays, editorState.outputMode, dur);
}

export function getTimelineBoundaries(): number[] {
  const times = new Set<number>();
  if (editorState!.sections) {
    for (const s of editorState!.sections) {
      times.add(s.start);
      times.add(s.end);
    }
  }
  if (editorState!.overlays) {
    for (const o of editorState!.overlays) {
      times.add(o.startTime);
      times.add(o.endTime);
    }
  }
  return [...times].sort((a, b) => a - b);
}

export function updateEditorTimeDisplay(): void {
  if (!editorState) return;
  const selectedSection = getSelectedSection();
  const sectionText = selectedSection ? ` | ${selectedSection.label}` : '';
  const speedText = editorState.playbackSpeed !== 1 ? ` [${editorState.playbackSpeed}x]` : '';
  editorTimeEl.textContent = `${formatTime(editorState.currentTime)} / ${formatTime(editorState.duration)}${speedText}${sectionText}`;
}

export function switchPlaybackSection(
  nextSection: Section,
  opts: {
    sourceTime?: number;
    resumePlayback?: boolean;
    logSwitch?: boolean;
    reason?: string;
    fromSectionId?: string | null;
  } = {}
): boolean {
  if (!editorState || !nextSection) return false;
  const previousTakeId = activeTakeId;
  const sameTake = previousTakeId === nextSection.takeId;
  const nextVideos = getOrCreateTakeVideos(nextSection.takeId!);
  if (!nextVideos) return false;

  const targetSourceTime = Number.isFinite(Number(opts.sourceTime))
    ? Number(opts.sourceTime)
    : nextSection.sourceStart;
  const targetCameraTime = resolveCameraPlaybackTargetTime(
    targetSourceTime,
    editorState.cameraSyncOffsetMs
  );
  const currentSourceTime = Number(nextVideos.screen.currentTime);
  const needsSeek =
    !Number.isFinite(currentSourceTime) || Math.abs(currentSourceTime - targetSourceTime) > 0.01;

  if (!sameTake && previousTakeId) {
    const previousVideos = getOrCreateTakeVideos(previousTakeId);
    if (previousVideos) {
      previousVideos.screen.pause();
      if (previousVideos.camera) {
        previousVideos.camera.pause();
        previousVideos.camera.playbackRate = 1;
      }
    }
  }

  if (needsSeek) {
    nextVideos.screen.currentTime = targetSourceTime;
    if (nextVideos.camera) nextVideos.camera.currentTime = targetCameraTime;
  }

  setActiveTakeId(nextSection.takeId);
  setActivePlaybackSection(nextSection);

  if (opts.logSwitch) {
    console.debug('[Editor] Section switch', {
      from: opts.fromSectionId || null,
      to: nextSection.id,
      sameTake,
      seek: needsSeek,
      reason: opts.reason || 'unknown'
    });
  }

  if (opts.resumePlayback) {
    const speed = editorState.playbackSpeed || 1;
    nextVideos.screen.playbackRate = speed;
    if (nextVideos.screen.paused) nextVideos.screen.play().catch(() => {});
    if (editorState.hasCamera && nextVideos.camera && nextVideos.camera.paused) {
      nextVideos.camera.playbackRate = speed;
      nextVideos.camera.play().catch(() => {});
    }
  }

  return true;
}

export function syncCameraPlayback(videos: TakeVideos): void {
  if (!editorState?.hasCamera || !videos?.camera) return;

  const baseRate = editorState.playbackSpeed || 1;
  const drift = computeCameraPlaybackDrift(
    videos.screen.currentTime,
    videos.camera.currentTime,
    editorState.cameraSyncOffsetMs
  );
  const absDrift = Math.abs(drift);
  const now = performance.now();

  if (absDrift >= CAMERA_DRIFT_HARD_THRESHOLD && now >= cameraResyncCooldownUntil) {
    videos.camera.currentTime = resolveCameraPlaybackTargetTime(
      videos.screen.currentTime,
      editorState.cameraSyncOffsetMs
    );
    videos.camera.playbackRate = baseRate;
    setCameraResyncCooldownUntil(now + CAMERA_RESYNC_COOLDOWN_MS);
    console.debug('[Editor] Camera hard resync', {
      drift: Number(drift.toFixed(3)),
      threshold: CAMERA_DRIFT_HARD_THRESHOLD
    });
    return;
  }

  if (absDrift >= CAMERA_DRIFT_SOFT_THRESHOLD) {
    const correction = Math.min(0.06, absDrift * 0.5);
    const targetRate = drift > 0 ? baseRate + correction : baseRate - correction;
    const clampedRate = Math.max(baseRate - 0.08, Math.min(baseRate + 0.08, targetRate));
    if (Math.abs(videos.camera.playbackRate - clampedRate) > 0.004) {
      videos.camera.playbackRate = clampedRate;
    }
    if (
      absDrift >= CAMERA_DRIFT_LOG_THRESHOLD &&
      now - lastCameraDriftLogAt >= CAMERA_DRIFT_LOG_INTERVAL_MS
    ) {
      console.debug('[Editor] Camera drift', {
        drift: Number(drift.toFixed(3)),
        playbackRate: Number(clampedRate.toFixed(3))
      });
      setLastCameraDriftLogAt(now);
    }
  } else if (Math.abs(videos.camera.playbackRate - baseRate) > 0.001) {
    videos.camera.playbackRate = baseRate;
  }
}

export function editorPlay(): void {
  if (!editorState || editorState.rendering) return;
  editorState.playing = true;
  const speed = editorState.playbackSpeed || 1;
  if (activeTakeId) {
    const videos = getOrCreateTakeVideos(activeTakeId);
    if (videos) {
      videos.screen.playbackRate = speed;
      videos.screen.play().catch(() => {});
      if (editorState.hasCamera && videos.camera) {
        videos.camera.playbackRate = speed;
        videos.camera.play().catch(() => {});
      }
    }
  }
  startAudioOverlayPlayback();
  editorPlayBtn.textContent = 'Pause';
}

export function editorPause(): void {
  if (!editorState) return;
  editorState.playing = false;
  for (const [, videos] of takeVideoPool) {
    videos.screen.pause();
    videos.screen.playbackRate = 1;
    if (videos.camera) {
      videos.camera.pause();
      videos.camera.playbackRate = 1;
    }
  }
  for (const vel of overlayVideoEls) {
    if (vel && !vel.paused) vel.pause();
  }
  stopAudioOverlayPlayback();
  editorPlayBtn.textContent = 'Play';
  if (editorVideoFrameCallbackId !== null && editorVideoFrameHost) {
    editorVideoFrameHost.cancelVideoFrameCallback(editorVideoFrameCallbackId);
    setEditorVideoFrameCallbackId(null);
    setEditorVideoFrameHost(null);
  }
  if (!hasPendingEditorDraw()) {
    scheduleEditorDrawLoop();
  }
}

export function editorTogglePlay(): void {
  if (!editorState) return;
  if (editorState.playing) {
    editorPause();
  } else {
    if (editorState.currentTime >= editorState.duration - 0.05) {
      editorSeek(0);
    }
    editorPlay();
  }
}

export function cyclePlaybackSpeed(): void {
  if (!editorState) return;
  const speeds = [1, 1.5, 2];
  const idx = speeds.indexOf(editorState.playbackSpeed);
  editorState.playbackSpeed = speeds[(idx + 1) % speeds.length]!;
  if (editorState.playing && activeTakeId) {
    const videos = getOrCreateTakeVideos(activeTakeId);
    if (videos) {
      videos.screen.playbackRate = editorState.playbackSpeed;
      if (editorState.hasCamera && videos.camera) {
        videos.camera.playbackRate = editorState.playbackSpeed;
      }
    }
  }
  updateEditorTimeDisplay();
}

export function editorSeek(time: number): void {
  if (!editorState) return;
  time = Math.max(0, Math.min(time, editorState.duration));
  editorState.currentTime = time;

  const resolved = resolveTimeToSource(time);
  if (resolved) {
    switchPlaybackSection(resolved.section, {
      sourceTime: resolved.sourceTime,
      resumePlayback: editorState.playing,
      reason: 'seek',
      fromSectionId: activePlaybackSection?.id
    });
  }
  syncOverlayVideo(time);
  // Restart audio overlay playback at new position if playing
  if (editorState.playing) {
    startAudioOverlayPlayback();
  }
  // Apply section volume to screen video
  if (resolved && activeTakeId) {
    const videos = getOrCreateTakeVideos(activeTakeId);
    if (videos) {
      videos.screen.volume = resolved.section.volume ?? 1.0;
    }
  }
  updateEditorTimeDisplay();
  updateScrubberPosition();
}

export function syncOverlayVideo(time: number): void {
  for (let trackIdx = 0; trackIdx < 4; trackIdx++) {
    const overlayState = getOverlayStateAtTime(time, trackIdx);
    if (
      overlayState.active &&
      (overlayState.mediaType === 'video' || overlayState.mediaType === 'window')
    ) {
      // Prefer proxyPath for window overlays when available
      const syncOverlayObj = editorState?.overlays.find((o) => o.id === overlayState.overlayId);
      const syncVideoPath = syncOverlayObj?.proxyPath || overlayState.mediaPath;
      const vid = getOverlayVideoElement(syncVideoPath, trackIdx);
      if (vid && Math.abs(vid.currentTime - overlayState.sourceTime) > 0.15) {
        vid.currentTime = overlayState.sourceTime;
      }
      if (editorState?.playing && vid && vid.paused) {
        vid.play().catch(() => {});
      }
    } else if (overlayVideoEls[trackIdx] && !overlayVideoEls[trackIdx]!.paused) {
      overlayVideoEls[trackIdx]!.pause();
    }
  }
}

export function updateScrubberPosition(): void {
  if (!editorState || editorState.duration <= 0) return;
  const pct = (editorState.currentTime / editorState.duration) * 100;
  editorScrubber.style.left = pct + '%';
  if (editorState.playing) scrollTimelineToPlayhead();
}

export function editorDrawLoop(): void {
  if (!editorState) return;
  try {
    if (editorState.playing && activeTakeId && activePlaybackSection) {
      const videos = getOrCreateTakeVideos(activeTakeId);
      if (videos) {
        const sourceTime = videos.screen.currentTime;
        const timelineTime =
          activePlaybackSection.start + (sourceTime - activePlaybackSection.sourceStart);
        editorState.currentTime = timelineTime;

        if (sourceTime >= activePlaybackSection.sourceEnd - 0.01) {
          const currentIdx = editorState.sections.indexOf(activePlaybackSection);
          const nextSection = editorState.sections[currentIdx + 1];

          if (nextSection) {
            const fromSectionId = activePlaybackSection?.id;
            const sameTake = activeTakeId === nextSection.takeId;
            const contiguousSource =
              sameTake && Math.abs(sourceTime - nextSection.sourceStart) <= 0.05;
            switchPlaybackSection(nextSection, {
              sourceTime: contiguousSource ? sourceTime : nextSection.sourceStart,
              resumePlayback: true,
              logSwitch: true,
              reason: 'boundary',
              fromSectionId
            });
          } else {
            editorSeek(0);
            editorPlay();
          }
        }

        syncCameraPlayback(videos);
        syncOverlayVideo(editorState.currentTime);
      }

      updateEditorTimeDisplay();
      updateScrubberPosition();
    }

    editorCtx.fillStyle = '#000';
    editorCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const activeVideos = activeTakeId ? getOrCreateTakeVideos(activeTakeId) : null;
    const hasScreen = activeVideos && activeVideos.screen.videoWidth > 0;
    const hasCamera =
      editorState.hasCamera && activeVideos?.camera && activeVideos.camera.videoWidth > 0;
    const state = getStateAtTime(editorState.currentTime);

    // Wallpaper base detection — draw wallpaper if any window overlays exist
    const hasWindowOverlaysInEditor = (editorState.overlays || []).some(
      (o) => o.mediaType === 'window'
    );
    if (hasWindowOverlaysInEditor) {
      // Window overlay mode: wallpaper is the base, windows render as overlays
      drawBackground(editorCtx, CANVAS_W, CANVAS_H);
    } else if (hasScreen) {
      // Standard screen recording mode
      drawEditorScreenWithZoom(
        editorCtx,
        activeVideos!.screen,
        editorState.screenFitMode,
        state.backgroundZoom,
        state.backgroundPanX,
        state.backgroundPanY,
        state.backgroundFocusX,
        state.backgroundFocusY
      );
    }

    const isReel = editorState.outputMode === 'reel';
    const editorContentW = isReel
      ? getContentWidth(
          editorState.sourceWidth,
          editorState.sourceHeight,
          editorState.screenFitMode as 'fit' | 'fill',
          CANVAS_W,
          CANVAS_H
        )
      : CANVAS_W;
    const cropPixelX = isReel
      ? reelCropXToPixelOffset(state.reelCropX, state.backgroundZoom, editorContentW)
      : 0;
    const effectiveW = isReel ? REEL_CANVAS_W : CANVAS_W;
    const currentPipSize = computePipSize(state.pipScale, effectiveW);

    // GROUP 4.3 + 5.3 + 5.4: Iterate all 4 overlay tracks with rounded-corner clipping
    for (let trackIdx = 0; trackIdx < 4; trackIdx++) {
      const overlayState = getOverlayStateAtTime(editorState.currentTime, trackIdx);
      if (!overlayState.active) continue;
      const oX = overlayState.x;
      const oY = overlayState.y;
      const oW = overlayState.width;
      const oH = overlayState.height;
      if (oW <= 0 || oH <= 0) continue;
      const cornerRadius = Math.max(0, Math.min(oW, oH) * 0.03);
      // For window overlays, prefer proxyPath over mediaPath for playback
      const overlayObj = editorState.overlays.find((o) => o.id === overlayState.overlayId);
      const videoPath = overlayObj?.proxyPath || overlayState.mediaPath;
      const mediaEl =
        overlayState.mediaType === 'image'
          ? getOverlayImageElement(overlayState.mediaPath)
          : getOverlayVideoElement(videoPath, trackIdx);
      if (mediaEl && (mediaEl.tagName !== 'IMG' || (mediaEl as HTMLImageElement).complete)) {
        const inLeft = Math.max(0, oX);
        const inTop = Math.max(0, oY);
        const inRight = Math.min(CANVAS_W, oX + oW);
        const inBottom = Math.min(CANVAS_H, oY + oH);
        if (oX < 0 || oY < 0 || oX + oW > CANVAS_W || oY + oH > CANVAS_H) {
          // Overflow: draw at 0.3 alpha first (out-of-bounds ghost)
          editorCtx.save();
          editorCtx.globalAlpha = overlayState.opacity * 0.3;
          editorCtx.beginPath();
          editorCtx.roundRect(oX, oY, oW, oH, cornerRadius);
          editorCtx.clip();
          editorCtx.drawImage(mediaEl as CanvasImageSource, oX, oY, oW, oH);
          editorCtx.restore();
          // Then draw the in-bounds portion at full alpha with rounded corners
          if (inRight > inLeft && inBottom > inTop) {
            editorCtx.save();
            editorCtx.globalAlpha = overlayState.opacity;
            editorCtx.beginPath();
            editorCtx.rect(inLeft, inTop, inRight - inLeft, inBottom - inTop);
            editorCtx.clip();
            editorCtx.beginPath();
            editorCtx.roundRect(oX, oY, oW, oH, cornerRadius);
            editorCtx.clip();
            editorCtx.drawImage(mediaEl as CanvasImageSource, oX, oY, oW, oH);
            editorCtx.restore();
          }
        } else {
          // Fully in bounds: draw with rounded-corner clipping
          editorCtx.save();
          editorCtx.globalAlpha = overlayState.opacity;
          editorCtx.beginPath();
          editorCtx.roundRect(oX, oY, oW, oH, cornerRadius);
          editorCtx.clip();
          editorCtx.drawImage(mediaEl as CanvasImageSource, oX, oY, oW, oH);
          editorCtx.restore();
        }
      }
      if (overlayState.overlayId === editorState.selectedOverlayId) {
        editorCtx.save();
        editorCtx.strokeStyle = 'rgba(129,140,248,0.8)';
        editorCtx.lineWidth = 2;
        editorCtx.setLineDash([6, 4]);
        editorCtx.strokeRect(oX, oY, oW, oH);
        editorCtx.setLineDash([]);
        editorCtx.fillStyle = 'rgba(129,140,248,0.9)';
        const hs = 14;
        for (const corner of [
          [oX, oY],
          [oX + oW, oY],
          [oX, oY + oH],
          [oX + oW, oY + oH]
        ]) {
          editorCtx.fillRect(corner[0]! - hs / 2, corner[1]! - hs / 2, hs, hs);
        }
        editorCtx.restore();
      }
    }

    // GROUP 5.2: Camera PIP drawn AFTER all overlay tracks
    if (hasCamera) {
      if (state.camTransition > 0 && state.opacity > 0) {
        editorCtx.save();
        if (state.opacity < 1) editorCtx.globalAlpha = state.opacity;
        const t = easeInOut(state.camTransition);
        const fullW = isReel ? REEL_CANVAS_W : CANVAS_W;
        const fullH = isReel ? REEL_CANVAS_H : CANVAS_H;
        const drawPipX = isReel ? state.pipX + cropPixelX : state.pipX;
        const drawPipY = state.pipY;
        const camX = drawPipX * (1 - t) + (isReel ? cropPixelX : 0) * t;
        const camY = drawPipY * (1 - t);
        const camW = currentPipSize + (fullW - currentPipSize) * t;
        const camH = currentPipSize + (fullH - currentPipSize) * t;
        const camR = 12 * (1 - t);
        drawCameraRect(editorCtx, activeVideos!.camera!, camX, camY, camW, camH, camR);
        editorCtx.restore();
      } else if (state.opacity > 0) {
        editorCtx.save();
        editorCtx.globalAlpha = state.opacity;
        const drawPipX = isReel ? state.pipX + cropPixelX : state.pipX;
        drawPip(
          editorCtx,
          activeVideos!.camera!,
          drawPipX,
          state.pipY,
          currentPipSize,
          currentPipSize
        );
        editorCtx.restore();
      }
    }

    if (isReel) {
      editorCtx.save();
      editorCtx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      if (cropPixelX > 0) {
        editorCtx.fillRect(0, 0, cropPixelX, CANVAS_H);
      }
      const rightEdge = cropPixelX + REEL_CANVAS_W;
      if (rightEdge < CANVAS_W) {
        editorCtx.fillRect(rightEdge, 0, CANVAS_W - rightEdge, CANVAS_H);
      }
      editorCtx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      editorCtx.lineWidth = 2;
      editorCtx.setLineDash([8, 6]);
      editorCtx.strokeRect(cropPixelX, 0, REEL_CANVAS_W, CANVAS_H);
      editorCtx.restore();
    }
  } catch (err) {
    console.error('[editorDrawLoop] Error during draw:', err);
  }
  scheduleEditorDrawLoop();
}
