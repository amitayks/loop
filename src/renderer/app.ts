import {
  roundMs,
  normalizeSections,
  normalizeTakeSections
} from './features/timeline/section-utils.js';
import {
  normalizeCameraSyncOffsetMs,
  resolveCameraPlaybackTargetTime
} from './features/timeline/camera-sync.js';
import { getOverlayStateAtTime as _getOverlayStateAtTime } from './features/timeline/overlay-utils.js';
import type { OverlayState } from './features/timeline/overlay-utils.js';
import {
  getEffectiveCanvasDimensions,
  updatePreview
} from './features/drawing/compositing.js';
import {
  clampSectionZoom,
  setOutputMode,
  updateOutputModeUI,
  getZoomCropBounds,
  resolveZoomCrop
} from './features/editor/zoom-crop.js';
import { cleanupAllMedia } from './features/media-cleanup.js';
import {
  cleanupVideoPool,
  getOrCreateTakeVideos,
  loadMouseTrail,
  pathToFileUrl,
  syncContentProtection
} from './features/media/take-media.js';
import { setWorkspaceView, updateWorkspaceHeader } from './features/workspace/workspace.js';
import { pickAndLoadBackground } from './features/background/background-image.js';
import type {
  Section,
  Keyframe,
  Overlay,
  AudioOverlay,
  OutputMode,
  PipSnapPoint,
  Take
} from '../shared/types/domain.js';
import {
  generateAudioOverlayId,
  normalizePipScale,
  normalizeExportAudioPreset
} from '../shared/domain/project-fields.js';
import {
  CANVAS_W,
  CANVAS_H,
  PIP_MARGIN,
  PIP_SIZE,
  REEL_CANVAS_W,
  REEL_CANVAS_H,
  DEFAULT_PIP_SCALE,
  MIN_PIP_SCALE,
  MAX_PIP_SCALE,
  getContentWidth
} from '../shared/domain/canvas.js';
import {
  getSnapPointPosition,
  snapToNearest,
  computePipSize
} from './features/geometry/pip-geometry.js';
import {
  clampSectionPan,
  clampReelCropX,
  reelCropXToPixelOffset
} from './features/geometry/section-geometry.js';
import { createOverlaysFromWindowPaths } from './features/overlay/window-overlays.js';
import {
  centerSelectedOverlay,
  deleteSelectedOverlay,
  handleOverlayDrop,
  placeOverlayAtTime,
  renderOverlayMarkers,
  selectOverlay,
  splitOverlayAtPlayhead,
  startOverlayTrimDrag,
  updateOverlaySizeControl
} from './features/overlay/overlay.js';
import {
  selectAudioOverlay,
  renderAudioOverlayMarkers,
  startAudioOverlayTrimDrag,
  splitAudioOverlayAtPlayhead,
  deleteSelectedAudioOverlay,
  placeAudioOverlayAtTime
} from './features/audio-overlay/audio-overlay.js';
import {
  projectHomeView,
  newProjectNameInput,
  createProjectBtn,
  openProjectBtn,
  resumeLastBtn,
  recentProjectsList,
  saveAndCleanBtn,
  activeProjectPathEl,
  goRecordingBtn,
  goTimelineBtn,
  switchProjectBtn,
  exportAudioPresetSelect,
  cameraSyncOffsetInput,
  screenSelect,
  screenPickerBtn,
  screenPickerPanel,
  screenFitSelect,
  cameraSelect,
  audioSelect,
  recordBtn,
  openFolderBtn,
  pickFolderBtn,
  contentProtectionToggle,
  transcriptContent,
  processingTitle,
  processingStatus,
  editorCanvas,
  editorRenderBtn,
  editorUndoBtn,
  editorRedoBtn,
  editorPlayBtn,
  editorSplitBtn,
  editorToggleCamBtn,
  editorCamFullBtn,
  editorBgZoomInput,
  editorBgZoomValue,
  editorApplyFutureBtn,
  editorModeLandscapeBtn,
  editorModeReelBtn,
  editorPipSizeInput,
  editorPipSizeValue,
  editorAutoTrackToggle,
  editorAutoTrackSmoothScrub,
  editorAutoTrackSmoothValue,
  editorAutoTrackSmoothInput,
  editorOverlaySizeInput,
  editorOverlaySizeValue,
  editorOverlaySizeScrub,
  sidebarTabSegments,
  sidebarTabOverlays,
  editorCropLeftBtn,
  editorCropCenterBtn,
  editorCropRightBtn,
  editorTimelineWrapper,
  editorTimeline,
  editorAudioTrack0,
  editorBgZoomScrub,
  editorPipSizeScrub
} from './features/dom/elements.js';
import {
  renderPickerPanel,
  populatePickerSources,
  updateScreenStream,
  updateCameraStream,
  updateAudioStream
} from './features/capture/source-picker.js';
import {
  stopAudioMeter,
  toggleRecording,
  setProcessingProgress
} from './features/recording/recording.js';
import {
  hasPendingEditorDraw,
  cancelEditorDrawLoop,
  scheduleEditorDrawLoop,
  getStateAtTime,
  getOverlayStateAtTime,
  getTimelineBoundaries,
  updateEditorTimeDisplay,
  editorTogglePlay,
  cyclePlaybackSpeed,
  editorSeek
} from './features/editor/transport.js';
import {
  findSectionForTime,
  getSelectedSection,
  getSectionBackgroundPan,
  updateSectionZoomControls,
  getSectionAnchorKeyframe,
  syncSectionAnchorKeyframes,
  selectEditorSection,
  applyStyleToFutureSections,
  switchSidebarTab,
  renderSectionMarkers,
  deleteSelectedSection,
  splitSectionAtPlayhead,
  splitAllAtPlayhead,
  setSelectedSectionBackgroundZoom,
  setSectionBackgroundPan,
  commitSectionZoomChange
} from './features/section/section-editing.js';
import {
  activateProject,
  clearProjectHomeMessage,
  editorRedo,
  editorUndo,
  flushScheduledProjectSave,
  matchesActiveProjectSession,
  openProjectByPath,
  persistProjectNow,
  pushUndo,
  refreshRecentProjects,
  scheduleProjectSave,
  showProjectHomeMessage,
  updateUndoRedoButtons
} from './features/project/project-lifecycle.js';
import {
  applySegmentDeletedStyle,
  captureThumbnailFrame,
  handleRenderProgress,
  renderVideo,
  selectSegment,
  updateProxyProgressBars,
  updateSegmentBadge
} from './features/render/render.js';
import {
  applyTimelineZoom,
  canvasToEditorCoords,
  extractWaveformPeaks,
  initScrubDrag,
  renderWaveform,
  seekFromTimeline,
  setCropPreset,
  startTrimDrag,
  toggleCameraFullscreen,
  toggleCameraVisibility
} from './features/editor/interactions.js';

import {
  AUDIO_OVERLAY_EXTENSIONS,
  DEFAULT_SECTION_ZOOM,
  MAX_SECTION_ZOOM,
  MIN_REEL_SECTION_ZOOM,
  MIN_SECTION_ZOOM,
  activeProject,
  activeProjectPath,
  activeWorkspaceView,
  audioContext,
  audioSendInterval,
  audioStream,
  autoTrackSmoothDragActive,
  backgroundDragMoved,
  backgroundDragState,
  cameraStream,
  cropDragMoved,
  cropDragState,
  draggingBackground,
  draggingCrop,
  draggingOverlay,
  draggingPip,
  drawRAF,
  editorState,
  mediaIdleTimer,
  meterRAF,
  overlayDragMoved,
  overlayDragOrigX,
  overlayDragOrigY,
  overlayDragStartX,
  overlayDragStartY,
  overlayResizeAspect,
  overlayResizeCorner,
  overlayResizeOrigRect,
  overlayResizeStartX,
  overlaySizeDragActive,
  overlayTrackEls,
  pipDragMoved,
  pipSizeDragActive,
  proxyStatus,
  recorders,
  recording,
  resizingOverlay,
  screenRecInterval,
  screenStream,
  scribeWorkletNode,
  scribeWs,
  sectionZoomDragActive,
  selectedSegmentIndex,
  speechSegments,
  takeVideoPool,
  timelineZoom,
  timerInterval,
  undoStack,
  windowRecIntervals,
  windowStreams,
  setActivePlaybackSection,
  setActiveTakeId,
  setAudioContext,
  setAudioSendInterval,
  setAudioStream,
  setAutoTrackSmoothDragActive,
  setBackgroundDragMoved,
  setBackgroundDragState,
  setCameraStream,
  setCropDragMoved,
  setCropDragState,
  setDraggingBackground,
  setDraggingCrop,
  setDraggingOverlay,
  setDraggingPip,
  setDrawRAF,
  setEditorState,
  setHideFromRecording,
  setMediaIdleTimer,
  setMeterRAF,
  setOverlayDragMoved,
  setOverlayDragOrigX,
  setOverlayDragOrigY,
  setOverlayDragStartX,
  setOverlayDragStartY,
  setOverlayResizeAspect,
  setOverlayResizeCorner,
  setOverlayResizeOrigRect,
  setOverlayResizeStartX,
  setOverlaySizeDragActive,
  setPipDragMoved,
  setPipSizeDragActive,
  setRecorders,
  setRecording,
  setResizingOverlay,
  setScreenRecInterval,
  setScreenStream,
  setScribeWorkletNode,
  setScribeWs,
  setSectionZoomDragActive,
  setTimelineZoom,
  setWaveformPeaks
} from './state.js';
import type { EditorState } from './state.js';

// ── Local interfaces ────────────────────────────────────────────────

interface EnterEditorOpts {
  duration?: number;
  keyframes?: Keyframe[];
  savedSections?: Section[];
  selectedSectionId?: string | null;
  hasCamera?: boolean;
  sourceWidth?: number | null;
  sourceHeight?: number | null;
  cameraSyncOffsetMs?: unknown;
  outputMode?: string;
  pipScale?: number | null;
  overlays?: Overlay[];
  savedOverlays?: Overlay[];
  audioOverlays?: AudioOverlay[];
  savedAudioOverlays?: AudioOverlay[];
  initialView?: string;
  screenFitMode?: string;
}

interface AppendTakeOpts {
  takeId: string;
  screenPath: string;
  cameraPath: string | null;
  windowPaths: Array<{
    name: string;
    path: string;
    width?: number;
    height?: number;
    proxyPath?: string | null;
  }> | null;
  recordedDuration: number;
  trimSections: Section[];
  projectSession: { id: number; projectPath: string };
}

interface AppendTakeResult {
  takeSections: Section[];
  takeDuration: number;
  appendedSections: Section[];
}

// ── DOM elements ────────────────────────────────────────────────────

if (typeof window.electronAPI.onRenderProgress === 'function') {
  window.electronAPI.onRenderProgress((update) => {
    handleRenderProgress(update);
  });
}

if (typeof window.electronAPI.onProxyProgress === 'function') {
  window.electronAPI.onProxyProgress((payload) => {
    if (!payload || !payload.takeId) return;
    if (payload.status === 'progress') {
      const current = proxyStatus.get(payload.takeId);
      if (current && current.status === 'pending') {
        current.percent = payload.percent || 0;
        updateProxyProgressBars(payload.takeId, current.percent);
      }
    } else if (payload.status === 'done' && payload.proxyPath) {
      proxyStatus.set(payload.takeId, { status: 'done' });

      // Check if this is a window proxy (takeId format: "take-xxx-win0")
      const winProxyMatch = (payload.takeId as string).match(/^(.+)-win(\d+)$/);
      if (winProxyMatch) {
        const realTakeId = winProxyMatch[1]!;
        const winIdx = parseInt(winProxyMatch[2]!, 10);
        const take = activeProject?.takes?.find((t: Take) => t.id === realTakeId);
        if (take && Array.isArray(take.windowPaths) && take.windowPaths[winIdx]) {
          take.windowPaths[winIdx]!.proxyPath = payload.proxyPath;
          // Also update any window overlay that uses this media path
          if (editorState) {
            const wp = take.windowPaths[winIdx]!;
            for (const ov of editorState.overlays) {
              if (ov.mediaType === 'window' && ov.mediaPath === wp.path) {
                ov.proxyPath = payload.proxyPath;
              }
            }
          }
          persistProjectNow().catch((err: unknown) =>
            console.warn('[Proxy] Failed to persist window proxyPath:', err)
          );
        }
        // Also hot-swap the take screen video if it was using win0
        if (winIdx === 0) {
          const cached = takeVideoPool.get(realTakeId);
          if (cached) {
            const wasPlaying = !cached.screen.paused;
            const currentTime = cached.screen.currentTime;
            const rate = cached.screen.playbackRate;
            cached.screen.src = pathToFileUrl(payload.proxyPath!);
            cached.screen.addEventListener(
              'loadedmetadata',
              () => {
                cached.screen.currentTime = currentTime;
                if (wasPlaying) {
                  cached.screen.playbackRate = rate;
                  cached.screen.play().catch(() => {});
                  if (!hasPendingEditorDraw()) scheduleEditorDrawLoop();
                }
              },
              { once: true }
            );
          }
        }
      } else {
        // Standard screen proxy
        const take = activeProject?.takes?.find((t: Take) => t.id === payload.takeId);
        if (take) {
          take.proxyPath = payload.proxyPath;
          persistProjectNow().catch((err: unknown) =>
            console.warn('[Proxy] Failed to persist proxyPath:', err)
          );
        }
        // Hot-swap the cached video element to use the proxy
        const cached = takeVideoPool.get(payload.takeId);
        if (cached) {
          const wasPlaying = !cached.screen.paused;
          const currentTime = cached.screen.currentTime;
          const rate = cached.screen.playbackRate;
          cached.screen.src = pathToFileUrl(payload.proxyPath!);
          cached.screen.addEventListener(
            'loadedmetadata',
            () => {
              cached.screen.currentTime = currentTime;
              if (wasPlaying) {
                cached.screen.playbackRate = rate;
                cached.screen.play().catch(() => {});
                if (!hasPendingEditorDraw()) scheduleEditorDrawLoop();
              }
            },
            { once: true }
          );
        }
      }
      renderSectionMarkers();
    } else if (payload.status === 'error') {
      proxyStatus.set(payload.takeId, { status: 'error' });
      console.warn('[Proxy] Generation failed for take', payload.takeId, payload.error);
      renderSectionMarkers();
    }
  });
}

async function _clearRecoveryTake(projectPath = activeProjectPath): Promise<void> {
  if (!projectPath) return;
  try {
    await window.electronAPI.projectClearRecoveryTake(projectPath);
  } catch (error) {
    console.error('Failed to clear recovery take:', error);
  }
}

function _deleteNearestKeyframe(): void {
  if (!editorState || !Array.isArray(editorState.keyframes)) return;

  const manualKeyframes = editorState.keyframes.filter((kf) => !kf.sectionId);
  if (manualKeyframes.length === 0) return;

  const currentTime = Number(editorState.currentTime) || 0;
  let nearest = manualKeyframes[0]!;
  let nearestDistance = Math.abs((Number(nearest.time) || 0) - currentTime);

  for (let i = 1; i < manualKeyframes.length; i++) {
    const candidate = manualKeyframes[i]!;
    const distance = Math.abs((Number(candidate.time) || 0) - currentTime);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }

  const nearestTime = Number(nearest.time) || 0;
  editorState.keyframes = editorState.keyframes.filter((kf) => {
    if (kf.sectionId) return true;
    const time = Number(kf.time) || 0;
    return time !== nearestTime;
  });

  renderSectionMarkers();
  editorSeek(currentTime);
  updateEditorTimeDisplay();
  scheduleProjectSave();
}

// Sidebar tab switching
if (sidebarTabSegments)
  sidebarTabSegments.addEventListener('click', () => switchSidebarTab('segments'));
if (sidebarTabOverlays)
  sidebarTabOverlays.addEventListener('click', () => switchSidebarTab('overlays'));

// === Audio overlay timeline, trim, split, delete ===

// Audio track click & trim handlers
if (editorAudioTrack0) {
  editorAudioTrack0.addEventListener('mousedown', (e: MouseEvent) => {
    if (!editorState) return;
    const target = e.target as HTMLElement;
    // Trim handle
    const trimEdge = target.dataset.audioOverlayTrimEdge;
    const trimId = target.dataset.audioOverlayId;
    if (trimEdge && trimId) {
      e.stopPropagation();
      startAudioOverlayTrimDrag(e, trimId, trimEdge);
      return;
    }
    // Segment click
    const bandEl = target.closest('[data-audio-overlay-id]') as HTMLElement | null;
    if (bandEl) {
      const aoId = bandEl.dataset.audioOverlayId;
      if (aoId) selectAudioOverlay(aoId);
      return;
    }
  });

  // Drop zone for audio files
  editorAudioTrack0.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  editorAudioTrack0.addEventListener('drop', async (e: DragEvent) => {
    e.preventDefault();
    if (!editorState || !activeProjectPath || !e.dataTransfer?.files?.length) return;
    const file = e.dataTransfer.files[0]!;
    const filePath = window.electronAPI.getFilePathFromDrop(file);
    if (!filePath) return;
    const ext = filePath.substring(filePath.lastIndexOf('.')).toLowerCase();
    if (!AUDIO_OVERLAY_EXTENSIONS.includes(ext as (typeof AUDIO_OVERLAY_EXTENSIONS)[number]))
      return;

    const result = await window.electronAPI.importAudioOverlayMedia(activeProjectPath, filePath);
    if (!result || !result.mediaPath) return;

    pushUndo();
    const startTime = editorState.currentTime;
    // Use file duration from import or fallback to remaining timeline
    const audioDuration =
      result.duration > 0 ? result.duration : Math.max(5, editorState.duration - startTime);
    const endTime = Math.min(startTime + audioDuration, editorState.duration);
    const placedStart = placeAudioOverlayAtTime(
      startTime,
      endTime - startTime,
      editorState.duration,
      0
    );
    if (placedStart === null) return;

    const newAo: AudioOverlay = {
      id: generateAudioOverlayId(),
      trackIndex: 0,
      mediaPath: result.mediaPath,
      startTime: placedStart,
      endTime: placedStart + (endTime - startTime),
      sourceStart: 0,
      sourceEnd: endTime - startTime,
      volume: 1.0,
      saved: false
    };
    editorState.audioOverlays.push(newAo);
    editorState.audioOverlays.sort((a, b) => a.startTime - b.startTime);
    editorState.selectedAudioOverlayId = newAo.id;
    renderAudioOverlayMarkers();
    scheduleProjectSave();
  });
}

// ── Source picker state ───────────────────────────────────────────

// Toggle picker panel
screenPickerBtn.addEventListener('click', () => {
  if (recording) return;
  const isOpen = !screenPickerPanel.classList.contains('hidden');
  if (isOpen) {
    screenPickerPanel.classList.add('hidden');
  } else {
    populatePickerSources().then(() => {
      renderPickerPanel();
      screenPickerPanel.classList.remove('hidden');
    });
  }
});

// Close picker on outside click
document.addEventListener('click', (e) => {
  if (
    !screenPickerPanel.classList.contains('hidden') &&
    !screenPickerPanel.contains(e.target as Node) &&
    e.target !== screenPickerBtn
  ) {
    screenPickerPanel.classList.add('hidden');
  }
});

// Refresh on device change
if (navigator.mediaDevices && typeof navigator.mediaDevices.ondevicechange !== 'undefined') {
  navigator.mediaDevices.addEventListener('devicechange', () => {
    if (!screenPickerPanel.classList.contains('hidden')) {
      populatePickerSources().then(() => renderPickerPanel());
    }
  });
}

function _showProcessingState(title: string, status: string, progress: number | null = null): void {
  processingTitle.textContent = title || 'Processing...';
  processingStatus.textContent = status || '';
  setProcessingProgress(progress);
  setWorkspaceView('processing');
}

function _buildSectionAnchorSnapshot(keyframes: Keyframe[]): Map<string, Partial<Keyframe>> {
  const anchors = new Map<string, Partial<Keyframe>>();
  for (const keyframe of Array.isArray(keyframes) ? keyframes : []) {
    if (!keyframe.sectionId) continue;
    anchors.set(keyframe.sectionId, {
      pipX: keyframe.pipX,
      pipY: keyframe.pipY,
      pipVisible: keyframe.pipVisible !== false,
      cameraFullscreen: !!keyframe.cameraFullscreen,
      backgroundZoom: clampSectionZoom(keyframe.backgroundZoom),
      backgroundPanX: clampSectionPan(keyframe.backgroundPanX),
      backgroundPanY: clampSectionPan(keyframe.backgroundPanY)
    });
  }
  return anchors;
}

export function appendTakeToTimeline({
  takeId,
  screenPath: _screenPath,
  cameraPath,
  windowPaths: _appendWindowPaths,
  recordedDuration,
  trimSections,
  projectSession
}: AppendTakeOpts): AppendTakeResult | null {
  const takeSections = normalizeTakeSections(trimSections, recordedDuration);
  for (const section of takeSections) {
    section.takeId = takeId;
  }
  const takeDuration =
    takeSections.length > 0
      ? takeSections[takeSections.length - 1]!.end
      : Math.max(0, Number(recordedDuration) || 0);

  if (!matchesActiveProjectSession(projectSession)) return null;

  const hasCamera = !!cameraPath;

  // Create window overlays from recorded window paths
  const windowOverlays: Overlay[] =
    Array.isArray(_appendWindowPaths) && _appendWindowPaths.length > 0
      ? createOverlaysFromWindowPaths(_appendWindowPaths, takeDuration)
      : [];

  if (!editorState) {
    enterEditor(takeSections, {
      hasCamera,
      overlays: windowOverlays.length > 0 ? windowOverlays : undefined,
      // Window overlay mode uses canvas dimensions as source resolution
      sourceWidth: windowOverlays.length > 0 ? CANVAS_W : undefined,
      sourceHeight: windowOverlays.length > 0 ? CANVAS_H : undefined,
      initialView: 'timeline'
    });

    return {
      takeSections,
      takeDuration,
      appendedSections: takeSections
    };
  }

  pushUndo();

  const baseDuration = Math.max(0, Number(editorState.duration) || 0);
  const existingSections = editorState.sections.map((s) => ({ ...s }));
  const existingKeyframes = Array.isArray(editorState.keyframes)
    ? editorState.keyframes.map((kf) => ({ ...kf }))
    : [];

  const hadCameraBefore = !!editorState.hasCamera;
  const keepCamera = hadCameraBefore || hasCamera;

  const startIndex = existingSections.length;
  const appendedSections: Section[] = takeSections.map((section, idx) => {
    const sectionNumber = startIndex + idx + 1;
    return {
      ...section,
      id: `section-${sectionNumber}`,
      index: sectionNumber - 1,
      label: `Section ${sectionNumber}`,
      start: roundMs(section.start + baseDuration),
      end: roundMs(section.end + baseDuration),
      duration: roundMs(section.end - section.start),
      takeId
    };
  });

  const timelineSections = [...existingSections, ...appendedSections];

  const carryState = getStateAtTime(Math.max(0, baseDuration - 0.001));
  const newAnchors: Keyframe[] = appendedSections.map((section) => ({
    time: section.start,
    pipX: carryState.pipX,
    pipY: carryState.pipY,
    pipVisible: carryState.pipVisible,
    cameraFullscreen: !!carryState.cameraFullscreen,
    backgroundZoom: clampSectionZoom(carryState.backgroundZoom),
    backgroundPanX: clampSectionPan(carryState.backgroundPanX),
    backgroundPanY: clampSectionPan(carryState.backgroundPanY),
    reelCropX: 0,
    pipScale: normalizePipScale(carryState.pipScale),
    pipSnapPoint: 'br' as PipSnapPoint,
    autoTrack: false,
    autoTrackSmoothing: 0.15,
    sectionId: section.id,
    autoSection: true,
    savedLandscape: null,
    savedReel: null
  }));

  const withoutConflictingAnchors = existingKeyframes.filter(
    (kf) => !kf.sectionId || !newAnchors.some((anchor) => anchor.sectionId === kf.sectionId)
  );

  // Merge existing overlays with new window overlays (offset by baseDuration)
  const existingOverlays = editorState?.overlays || [];
  const offsetWindowOverlays = windowOverlays.map((wo) => ({
    ...wo,
    startTime: wo.startTime + baseDuration,
    endTime: wo.endTime + baseDuration
  }));
  const mergedOverlays = [...existingOverlays, ...offsetWindowOverlays];

  enterEditor(timelineSections, {
    keyframes: [...withoutConflictingAnchors, ...newAnchors].sort((a, b) => a.time - b.time),
    selectedSectionId: appendedSections[0]?.id || editorState?.selectedSectionId,
    hasCamera: keepCamera,
    screenFitMode: editorState?.screenFitMode,
    sourceWidth: editorState?.sourceWidth,
    sourceHeight: editorState?.sourceHeight,
    outputMode: editorState?.outputMode,
    pipScale: editorState?.pipScale,
    overlays: mergedOverlays,
    savedOverlays: editorState?.savedOverlays,
    audioOverlays: editorState?.audioOverlays,
    savedAudioOverlays: editorState?.savedAudioOverlays,
    initialView: 'timeline'
  });

  return {
    takeSections,
    takeDuration,
    appendedSections
  };
}

// ===== Editor =====

export function enterEditor(rawSections: Section[], opts: EnterEditorOpts = {}): void {
  if (drawRAF) {
    cancelAnimationFrame(drawRAF);
    setDrawRAF(null);
  }
  cancelEditorDrawLoop();

  setTimelineZoom(1);
  editorTimeline.style.minWidth = '100%';
  editorTimelineWrapper.scrollLeft = 0;

  cleanupVideoPool();

  const defaultPipX = CANVAS_W - PIP_SIZE - PIP_MARGIN;
  const defaultPipY = CANVAS_H - PIP_SIZE - PIP_MARGIN;
  const sections = normalizeSections(rawSections, opts.duration || 0);

  const duration = sections.length > 0 ? sections[sections.length - 1]!.end : opts.duration || 0;

  const sectionKeyframes: Keyframe[] = sections.map((section) => ({
    time: section.start,
    pipX: defaultPipX,
    pipY: defaultPipY,
    pipVisible: true,
    cameraFullscreen: false,
    backgroundZoom: DEFAULT_SECTION_ZOOM,
    backgroundPanX: 0,
    backgroundPanY: 0,
    reelCropX: 0,
    pipScale: DEFAULT_PIP_SCALE,
    pipSnapPoint: 'br' as PipSnapPoint,
    autoTrack: false,
    autoTrackSmoothing: 0.15,
    sectionId: section.id,
    autoSection: true,
    savedLandscape: null,
    savedReel: null
  }));

  const outputMode: OutputMode = opts.outputMode === 'reel' ? 'reel' : 'landscape';
  const minZoomForLoad = outputMode === 'reel' ? MIN_REEL_SECTION_ZOOM : MIN_SECTION_ZOOM;

  const providedKeyframes =
    Array.isArray(opts.keyframes) && opts.keyframes.length > 0
      ? opts.keyframes.map((kf) => ({
          ...kf,
          backgroundZoom: Math.max(
            minZoomForLoad,
            Math.min(
              MAX_SECTION_ZOOM,
              Number.isFinite(Number(kf.backgroundZoom))
                ? Number(kf.backgroundZoom)
                : DEFAULT_SECTION_ZOOM
            )
          ),
          backgroundPanX: clampSectionPan(kf.backgroundPanX),
          backgroundPanY: clampSectionPan(kf.backgroundPanY),
          reelCropX: clampReelCropX(kf.reelCropX),
          pipScale: normalizePipScale(kf.pipScale)
        }))
      : null;
  const keyframes = (providedKeyframes || sectionKeyframes).sort((a, b) => a.time - b.time);
  const pipScale = (() => {
    const v = Number(opts.pipScale);
    if (opts.pipScale == null || !Number.isFinite(v)) return DEFAULT_PIP_SCALE;
    return Math.max(MIN_PIP_SCALE, Math.min(MAX_PIP_SCALE, v));
  })();
  const effectiveW = outputMode === 'reel' ? REEL_CANVAS_W : CANVAS_W;
  const effectiveH = outputMode === 'reel' ? REEL_CANVAS_H : CANVAS_H;
  const effectivePipSize = computePipSize(pipScale, effectiveW);
  const effDefaultPipX = effectiveW - effectivePipSize - PIP_MARGIN;
  const effDefaultPipY = effectiveH - effectivePipSize - PIP_MARGIN;

  const newEditorState: EditorState = {
    duration,
    currentTime: 0,
    playing: false,
    pipSize: effectivePipSize,
    defaultPipX: effDefaultPipX,
    defaultPipY: effDefaultPipY,
    keyframes,
    sections,
    savedSections: opts.savedSections || [],
    selectedSectionId: opts.selectedSectionId || sections[0]?.id || null,
    screenFitMode: opts.screenFitMode || screenFitSelect.value,
    rendering: false,
    renderProgress: 0,
    playbackSpeed: 1,
    cameraSyncOffsetMs: normalizeCameraSyncOffsetMs(opts.cameraSyncOffsetMs),
    hasCamera: typeof opts.hasCamera === 'boolean' ? opts.hasCamera : false,
    sourceWidth: opts.sourceWidth || null,
    sourceHeight: opts.sourceHeight || null,
    outputMode,
    pipScale,
    overlays: Array.isArray(opts.overlays) ? opts.overlays : [],
    savedOverlays: Array.isArray(opts.savedOverlays) ? opts.savedOverlays : [],
    selectedOverlayId: null,
    audioOverlays: Array.isArray(opts.audioOverlays) ? opts.audioOverlays : [],
    savedAudioOverlays: Array.isArray(opts.savedAudioOverlays) ? opts.savedAudioOverlays : [],
    selectedAudioOverlayId: null
  };
  setEditorState(newEditorState);
  screenFitSelect.value = newEditorState.screenFitMode === 'fit' ? 'fit' : 'fill';
  cameraSyncOffsetInput.value = String(newEditorState.cameraSyncOffsetMs);
  updateSectionZoomControls();
  updateOutputModeUI();

  const referencedTakeIds = new Set(sections.map((s) => s.takeId).filter(Boolean) as string[]);
  for (const takeId of referencedTakeIds) {
    getOrCreateTakeVideos(takeId);
    loadMouseTrail(takeId).catch(() => {});
  }

  if (sections.length > 0) {
    const firstSection = sections[0]!;
    setActiveTakeId(firstSection.takeId);
    setActivePlaybackSection(firstSection);
    const videos = getOrCreateTakeVideos(firstSection.takeId!);
    if (videos) {
      videos.screen.currentTime = firstSection.sourceStart;
      if (videos.camera) {
        videos.camera.currentTime = resolveCameraPlaybackTargetTime(
          firstSection.sourceStart,
          newEditorState.cameraSyncOffsetMs
        );
      }
    }
  }

  if (referencedTakeIds.size > 0) {
    const firstTakeId = sections[0]?.takeId;
    const firstTake = activeProject?.takes?.find((t: Take) => t.id === firstTakeId);
    const videos = firstTakeId ? getOrCreateTakeVideos(firstTakeId) : null;
    if (videos) {
      const applySourceResolution = (w: number, h: number) => {
        if (!editorState) return;
        if (w && h) {
          editorState.sourceWidth = w;
          editorState.sourceHeight = h;
        }
        syncSectionAnchorKeyframes();
        renderSectionMarkers();
        updateEditorTimeDisplay();
        scheduleProjectSave();
        extractWaveformPeaks().then((peaks) => {
          if (!editorState) return;
          setWaveformPeaks(peaks);
          renderWaveform();
        });
      };

      // In window overlay mode, the output is always the canvas size (1920x1080)
      // — individual window dimensions don't define the output.
      const hasWindowOverlaysOnLoad = newEditorState.overlays.some((o) => o.mediaType === 'window');
      if (hasWindowOverlaysOnLoad) {
        applySourceResolution(CANVAS_W, CANVAS_H);
      } else if (firstTake?.proxyPath && firstTake?.screenPath) {
        const sourceProbe = document.createElement('video');
        sourceProbe.preload = 'metadata';
        sourceProbe.src = pathToFileUrl(firstTake.screenPath);
        sourceProbe.addEventListener(
          'loadedmetadata',
          () => {
            applySourceResolution(sourceProbe.videoWidth, sourceProbe.videoHeight);
            sourceProbe.src = '';
          },
          { once: true }
        );
      } else {
        const onMeta = () =>
          applySourceResolution(videos.screen.videoWidth, videos.screen.videoHeight);
        if (videos.screen.readyState >= 1) onMeta();
        else videos.screen.addEventListener('loadedmetadata', onMeta, { once: true });
      }
    }
  }

  updateEditorTimeDisplay();
  renderSectionMarkers();
  const initialView = opts.initialView === 'recording' ? 'recording' : 'timeline';
  setWorkspaceView(initialView);
}

function _exitEditor(): void {
  setWorkspaceView('recording');
}

// ===== Keyframe management =====

// ===== PiP drag-to-reposition =====

editorCanvas.addEventListener('mousedown', (e: MouseEvent) => {
  if (!editorState || editorState.rendering) return;
  const { x, y } = canvasToEditorCoords(e.clientX, e.clientY);
  const kf = getStateAtTime(editorState.currentTime);
  const isReel = editorState.outputMode === 'reel';
  const mousedownContentW = isReel
    ? getContentWidth(
        editorState.sourceWidth,
        editorState.sourceHeight,
        editorState.screenFitMode as 'fit' | 'fill',
        CANVAS_W,
        CANVAS_H
      )
    : CANVAS_W;
  const cropOffsetX = isReel
    ? reelCropXToPixelOffset(kf.reelCropX, kf.backgroundZoom, mousedownContentW)
    : 0;

  if (editorState.selectedOverlayId) {
    let overlayS: OverlayState | null = null;
    for (let t = 3; t >= 0; t--) {
      const s = getOverlayStateAtTime(editorState.currentTime, t);
      if (s.active && s.overlayId === editorState.selectedOverlayId) {
        overlayS = s;
        break;
      }
    }
    if (overlayS && overlayS.active) {
      const oX = overlayS.x;
      const oY = overlayS.y;
      const oW = overlayS.width;
      const oH = overlayS.height;
      const CORNER_HIT = 40;

      const corners = [
        { name: 'tl', x0: oX, y0: oY, x1: oX + CORNER_HIT, y1: oY + CORNER_HIT },
        { name: 'tr', x0: oX + oW - CORNER_HIT, y0: oY, x1: oX + oW, y1: oY + CORNER_HIT },
        { name: 'bl', x0: oX, y0: oY + oH - CORNER_HIT, x1: oX + CORNER_HIT, y1: oY + oH },
        { name: 'br', x0: oX + oW - CORNER_HIT, y0: oY + oH - CORNER_HIT, x1: oX + oW, y1: oY + oH }
      ];
      for (const c of corners) {
        if (x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1) {
          setResizingOverlay(true);
          setOverlayResizeCorner(c.name);
          setOverlayResizeStartX(x);
          const mode: 'reel' | 'landscape' = isReel ? 'reel' : 'landscape';
          const overlay = editorState.overlays.find((o) => o.id === editorState!.selectedOverlayId);
          if (overlay) {
            const origRect = { ...overlay[mode] };
            setOverlayResizeOrigRect(origRect);
            setOverlayResizeAspect(origRect.width / Math.max(1, origRect.height));
          }
          setOverlayDragMoved(false);
          pushUndo();
          e.preventDefault();
          return;
        }
      }

      if (x >= oX && x <= oX + oW && y >= oY && y <= oY + oH) {
        setDraggingOverlay(true);
        setOverlayDragMoved(false);
        setOverlayDragStartX(x);
        setOverlayDragStartY(y);
        const mode: 'reel' | 'landscape' = isReel ? 'reel' : 'landscape';
        const overlay = editorState.overlays.find((o) => o.id === editorState!.selectedOverlayId);
        if (overlay) {
          setOverlayDragOrigX(overlay[mode].x);
          setOverlayDragOrigY(overlay[mode].y);
        }
        pushUndo();
        e.preventDefault();
        return;
      }
    }
  }

  if (editorState.hasCamera && kf.pipVisible && kf.camTransition <= 0) {
    const hitEffW = isReel ? REEL_CANVAS_W : CANVAS_W;
    const pipW = computePipSize(kf.pipScale, hitEffW);
    const pipH = pipW;
    const drawPipX = isReel ? kf.pipX + cropOffsetX : kf.pipX;
    if (x >= drawPipX && x <= drawPipX + pipW && y >= kf.pipY && y <= kf.pipY + pipH) {
      setPipDragMoved(false);
      pushUndo();
      setDraggingPip(true);
      e.preventDefault();
      return;
    }
  }

  // GROUP 6.4: Canvas background click deselects overlay
  if (editorState.selectedOverlayId) {
    editorState.selectedOverlayId = null;
    renderOverlayMarkers();
  }

  const activeSection = findSectionForTime(editorState.currentTime);
  if (activeSection) selectEditorSection(activeSection.id);

  if (isReel && activeSection) {
    const cropLeft = cropOffsetX;
    const cropRight = cropOffsetX + REEL_CANVAS_W;
    if (x >= cropLeft && x <= cropRight && y >= 0 && y <= CANVAS_H) {
      setCropDragMoved(false);
      pushUndo();
      setDraggingCrop(true);
      const anchor = getSectionAnchorKeyframe(activeSection.id, true);
      setCropDragState({
        sectionId: activeSection.id,
        startMouseX: x,
        startCropX: anchor ? clampReelCropX(anchor.reelCropX) : 0,
        zoom: kf.backgroundZoom || 1
      });
      e.preventDefault();
      return;
    }
  }

  if (!activeSection || kf.backgroundZoom <= 1.0001 || (kf.cameraFullscreen && kf.opacity > 0))
    return;
  if (kf.autoTrack) return;
  const initialPan = getSectionBackgroundPan(activeSection.id);
  pushUndo();
  setBackgroundDragMoved(false);
  setDraggingBackground(true);
  setBackgroundDragState({
    sectionId: activeSection.id,
    startMouseX: x,
    startMouseY: y,
    startPanX: initialPan.x,
    startPanY: initialPan.y,
    zoom: kf.backgroundZoom
  });
  e.preventDefault();
});

window.addEventListener('mousemove', (e: MouseEvent) => {
  if (draggingOverlay && editorState && editorState.selectedOverlayId) {
    const { x, y } = canvasToEditorCoords(e.clientX, e.clientY);
    const mode: 'reel' | 'landscape' = editorState.outputMode === 'reel' ? 'reel' : 'landscape';
    const overlay = editorState.overlays.find((o) => o.id === editorState!.selectedOverlayId);
    if (overlay) {
      overlay[mode].x = overlayDragOrigX + (x - overlayDragStartX);
      overlay[mode].y = overlayDragOrigY + (y - overlayDragStartY);
      setOverlayDragMoved(true);
    }
    return;
  }

  if (resizingOverlay && editorState && editorState.selectedOverlayId && overlayResizeOrigRect) {
    const { x } = canvasToEditorCoords(e.clientX, e.clientY);
    const mode: 'reel' | 'landscape' = editorState.outputMode === 'reel' ? 'reel' : 'landscape';
    const overlay = editorState.overlays.find((o) => o.id === editorState!.selectedOverlayId);
    if (overlay) {
      const orig = overlayResizeOrigRect;
      const aspect = overlayResizeAspect;
      let newW: number, newH: number, newX: number, newY: number;

      if (overlayResizeCorner === 'br') {
        newW = Math.max(50, orig.width + (x - overlayResizeStartX));
        newH = newW / aspect;
        newX = orig.x;
        newY = orig.y;
      } else if (overlayResizeCorner === 'bl') {
        newW = Math.max(50, orig.width - (x - overlayResizeStartX));
        newH = newW / aspect;
        newX = orig.x + orig.width - newW;
        newY = orig.y;
      } else if (overlayResizeCorner === 'tr') {
        newW = Math.max(50, orig.width + (x - overlayResizeStartX));
        newH = newW / aspect;
        newX = orig.x;
        newY = orig.y + orig.height - newH;
      } else {
        // tl
        newW = Math.max(50, orig.width - (x - overlayResizeStartX));
        newH = newW / aspect;
        newX = orig.x + orig.width - newW;
        newY = orig.y + orig.height - newH;
      }

      overlay[mode].x = Math.round(newX);
      overlay[mode].y = Math.round(newY);
      overlay[mode].width = Math.round(newW);
      overlay[mode].height = Math.round(Math.max(50 / aspect, newH));
      setOverlayDragMoved(true);
      updateOverlaySizeControl();
    }
    return;
  }

  if (draggingCrop && editorState && cropDragState) {
    const { x } = canvasToEditorCoords(e.clientX, e.clientY);
    const deltaX = x - cropDragState.startMouseX;
    const zoom = cropDragState.zoom || 1;
    const dragContentW = getContentWidth(
      editorState.sourceWidth,
      editorState.sourceHeight,
      editorState.screenFitMode as 'fit' | 'fill',
      CANVAS_W,
      CANVAS_H
    );
    const scaledW = dragContentW * Math.min(1, zoom);
    const maxCropRange = Math.max(0, scaledW - REEL_CANVAS_W);
    const deltaCropX = maxCropRange > 0 ? (deltaX / maxCropRange) * 2 : 0;
    const newCropX = clampReelCropX(cropDragState.startCropX + deltaCropX);
    const anchor = getSectionAnchorKeyframe(cropDragState.sectionId, true);
    if (anchor && Math.abs(clampReelCropX(anchor.reelCropX) - newCropX) > 0.001) {
      anchor.reelCropX = newCropX;
      setCropDragMoved(true);
    }
    return;
  }

  if (draggingBackground && editorState && backgroundDragState) {
    const { x, y } = canvasToEditorCoords(e.clientX, e.clientY);
    const deltaX = x - backgroundDragState.startMouseX;
    const deltaY = y - backgroundDragState.startMouseY;
    const { maxOffsetX, maxOffsetY } = getZoomCropBounds(backgroundDragState.zoom);
    const nextPanX = maxOffsetX > 0 ? backgroundDragState.startPanX - deltaX / maxOffsetX : 0;
    const nextPanY = maxOffsetY > 0 ? backgroundDragState.startPanY - deltaY / maxOffsetY : 0;
    setBackgroundDragMoved(
      setSectionBackgroundPan(backgroundDragState.sectionId, nextPanX, nextPanY) ||
        backgroundDragMoved
    );
    return;
  }

  if (!draggingPip || !editorState) return;
  setPipDragMoved(true);
  const { x, y } = canvasToEditorCoords(e.clientX, e.clientY);
  const isReel = editorState.outputMode === 'reel';
  const { w, h } = getEffectiveCanvasDimensions();
  const currentState = getStateAtTime(editorState.currentTime);
  const snapContentW = isReel
    ? getContentWidth(
        editorState.sourceWidth,
        editorState.sourceHeight,
        editorState.screenFitMode as 'fit' | 'fill',
        CANVAS_W,
        CANVAS_H
      )
    : CANVAS_W;
  const snapX = isReel
    ? x - reelCropXToPixelOffset(currentState.reelCropX, currentState.backgroundZoom, snapContentW)
    : x;
  const dragPipSize = computePipSize(currentState.pipScale, w);
  const snapped = snapToNearest(snapX, y, w, h, dragPipSize);

  const selectedSection = getSelectedSection();
  const section = selectedSection || findSectionForTime(editorState.currentTime);
  if (section) {
    const anchor = getSectionAnchorKeyframe(section.id, true);
    if (anchor) {
      anchor.pipX = snapped.x;
      anchor.pipY = snapped.y;
      anchor.pipSnapPoint = snapped.snapPoint as PipSnapPoint;
    }
  }
});

window.addEventListener('mouseup', () => {
  if (draggingOverlay || resizingOverlay) {
    const wasDragging = draggingOverlay || resizingOverlay;
    setDraggingOverlay(false);
    setResizingOverlay(false);
    setOverlayResizeCorner(null);
    setOverlayResizeOrigRect(null);
    editorCanvas.style.cursor = '';
    if (wasDragging) {
      if (overlayDragMoved) {
        scheduleProjectSave();
      } else {
        undoStack.pop();
        updateUndoRedoButtons();
      }
      setOverlayDragMoved(false);
    }
  }

  const wasDraggingCrop = draggingCrop;
  setDraggingCrop(false);
  setCropDragState(null);
  if (wasDraggingCrop) {
    if (cropDragMoved) {
      scheduleProjectSave();
    } else {
      undoStack.pop();
      updateUndoRedoButtons();
    }
    setCropDragMoved(false);
  }

  const wasDraggingBackground = draggingBackground;
  setDraggingBackground(false);
  setBackgroundDragState(null);
  if (wasDraggingBackground) {
    if (backgroundDragMoved) {
      scheduleProjectSave();
    } else {
      undoStack.pop();
      updateUndoRedoButtons();
    }
    setBackgroundDragMoved(false);
  }

  const wasDragging = draggingPip;
  setDraggingPip(false);
  if (wasDragging) {
    if (pipDragMoved) {
      scheduleProjectSave();
    } else {
      undoStack.pop();
      updateUndoRedoButtons();
    }
    setPipDragMoved(false);
  }
});

// ===== Overlay cursor style on hover =====
editorCanvas.addEventListener('mousemove', (e: MouseEvent) => {
  if (!editorState || editorState.rendering || draggingOverlay || resizingOverlay || draggingPip)
    return;
  if (!editorState.selectedOverlayId) {
    if (
      editorCanvas.style.cursor === 'nwse-resize' ||
      editorCanvas.style.cursor === 'nesw-resize' ||
      editorCanvas.style.cursor === 'move'
    ) {
      editorCanvas.style.cursor = '';
    }
    return;
  }
  let overlayS: OverlayState | null = null;
  for (let t = 1; t >= 0; t--) {
    const s = getOverlayStateAtTime(editorState.currentTime, t);
    if (s.active && s.overlayId === editorState.selectedOverlayId) {
      overlayS = s;
      break;
    }
  }
  if (!overlayS || !overlayS.active) {
    editorCanvas.style.cursor = '';
    return;
  }
  const { x, y } = canvasToEditorCoords(e.clientX, e.clientY);
  const isReel = editorState.outputMode === 'reel';
  const kf = getStateAtTime(editorState.currentTime);
  const hoverContentW = isReel
    ? getContentWidth(
        editorState.sourceWidth,
        editorState.sourceHeight,
        editorState.screenFitMode as 'fit' | 'fill',
        CANVAS_W,
        CANVAS_H
      )
    : CANVAS_W;
  const hoverCropX = isReel
    ? reelCropXToPixelOffset(kf.reelCropX, kf.backgroundZoom, hoverContentW)
    : 0;
  const oX = overlayS.x + (isReel ? hoverCropX : 0);
  const oY = overlayS.y;
  const oW = overlayS.width;
  const oH = overlayS.height;
  const CH = 40;
  const cornerZones = [
    { cursor: 'nwse-resize', x0: oX, y0: oY, x1: oX + CH, y1: oY + CH },
    { cursor: 'nesw-resize', x0: oX + oW - CH, y0: oY, x1: oX + oW, y1: oY + CH },
    { cursor: 'nesw-resize', x0: oX, y0: oY + oH - CH, x1: oX + CH, y1: oY + oH },
    { cursor: 'nwse-resize', x0: oX + oW - CH, y0: oY + oH - CH, x1: oX + oW, y1: oY + oH }
  ];
  for (const z of cornerZones) {
    if (x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1) {
      editorCanvas.style.cursor = z.cursor;
      return;
    }
  }
  if (x >= oX && x <= oX + oW && y >= oY && y <= oY + oH) {
    editorCanvas.style.cursor = 'move';
    return;
  }
  editorCanvas.style.cursor = '';
});

// ===== Overlay drag-and-drop import =====

editorCanvas.addEventListener('dragover', (e: DragEvent) => {
  if (!editorState || editorState.rendering) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
});

editorCanvas.addEventListener('drop', handleOverlayDrop);

// ===== Overlay track drop targets =====
for (let _trackIdx = 0; _trackIdx < 4; _trackIdx++) {
  const trackEl = overlayTrackEls[_trackIdx]!;
  const trackIdx = _trackIdx;
  trackEl.addEventListener('dragover', (e: DragEvent) => {
    if (!editorState || editorState.rendering) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  });
  trackEl.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault();
    // Tracks 0-1 are window-only, reject user media drops on them
    if (trackIdx < 2) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- attach track index for shared handler
    (e as any)._overlayDropTrackIndex = trackIdx;
    handleOverlayDrop(e);
  });
}

// ===== Timeline scrubber =====

editorTimeline.addEventListener('mousedown', (e: MouseEvent) => {
  if (!editorState || editorState.rendering) return;

  const target = e.target as HTMLElement;
  const overlayTrimEdge = target?.dataset?.overlayTrimEdge;
  if (overlayTrimEdge) {
    const overlayId = target.dataset.overlayId;
    if (overlayId) {
      startOverlayTrimDrag(e, overlayId, overlayTrimEdge);
      return;
    }
  }

  const overlayId = target?.dataset?.overlayId || target?.parentElement?.dataset?.overlayId;
  if (overlayId) {
    selectOverlay(overlayId);
    const overlay = editorState.overlays.find((o) => o.id === overlayId);
    if (overlay) {
      let overlayMoveDragStarted = false;
      const overlayMoveDuration = overlay.endTime - overlay.startTime;
      const overlayMoveOrigStart = overlay.startTime;
      const overlayMoveOrigTrack = overlay.trackIndex || 0;
      let dragGhostEl: HTMLDivElement | null = null;
      let lastDragTargetTime = overlay.startTime;
      let lastDragTargetTrack = overlayMoveOrigTrack;
      let currentGhostParent: HTMLElement | null = null;
      pushUndo();

      const onMoveOverlay = (e2: MouseEvent) => {
        overlayMoveDragStarted = true;
        const rect = editorTimeline.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e2.clientX - rect.left) / rect.width));
        lastDragTargetTime = Math.max(
          0,
          Math.min(
            editorState!.duration - overlayMoveDuration,
            pct * editorState!.duration - overlayMoveDuration / 2
          )
        );

        // Determine target track from mouse Y, locked to same type range
        // Window overlays (tracks 0-1) can only move within 0-1
        // Media overlays (tracks 2-3) can only move within 2-3
        const isWindowOverlay = overlay.mediaType === 'window';
        const minTrack = isWindowOverlay ? 0 : 2;
        const maxTrack = isWindowOverlay ? 1 : 3;
        for (let ti = minTrack; ti <= maxTrack; ti++) {
          const trackRect = overlayTrackEls[ti]!.getBoundingClientRect();
          if (e2.clientY >= trackRect.top && e2.clientY <= trackRect.bottom) {
            lastDragTargetTrack = ti;
            break;
          }
        }

        const targetTrackEl =
          overlayTrackEls[Math.min(lastDragTargetTrack, 3)] || overlayTrackEls[0]!;

        if (!dragGhostEl) {
          dragGhostEl = document.createElement('div');
          dragGhostEl.style.cssText =
            'position:absolute;top:0;bottom:0;z-index:40;border-radius:3px;pointer-events:none;';
          dragGhostEl.style.backgroundColor = 'rgba(79,70,229,0.6)';
          dragGhostEl.style.boxShadow = '0 0 8px rgba(99,102,241,0.5)';
          targetTrackEl.appendChild(dragGhostEl);
          currentGhostParent = targetTrackEl;
          const origTrackEl =
            overlayTrackEls[Math.min(overlayMoveOrigTrack, 3)] || overlayTrackEls[0]!;
          const origBand = origTrackEl.querySelector(
            `[data-overlay-id="${overlayId}"]`
          ) as HTMLElement | null;
          if (origBand) origBand.style.opacity = '0.25';
        }

        if (currentGhostParent !== targetTrackEl) {
          targetTrackEl.appendChild(dragGhostEl);
          currentGhostParent = targetTrackEl;
        }

        const ghostLeft = (lastDragTargetTime / editorState!.duration) * 100;
        const ghostWidth = (overlayMoveDuration / editorState!.duration) * 100;
        dragGhostEl.style.left = ghostLeft + '%';
        dragGhostEl.style.width = ghostWidth + '%';
      };
      const onUpOverlay = () => {
        window.removeEventListener('mousemove', onMoveOverlay);
        window.removeEventListener('mouseup', onUpOverlay);
        if (dragGhostEl) {
          dragGhostEl.remove();
          dragGhostEl = null;
        }
        if (overlayMoveDragStarted) {
          overlay.startTime = overlayMoveOrigStart;
          overlay.endTime = overlayMoveOrigStart + overlayMoveDuration;
          overlay.trackIndex = lastDragTargetTrack;
          const placed = placeOverlayAtTime(
            overlayId,
            lastDragTargetTime,
            overlayMoveDuration,
            editorState!.duration,
            lastDragTargetTrack
          );
          if (placed !== null) {
            overlay.startTime = placed;
            overlay.endTime = placed + overlayMoveDuration;
          }
          editorState!.overlays.sort(
            (a, b) => (a.trackIndex || 0) - (b.trackIndex || 0) || a.startTime - b.startTime
          );
          renderOverlayMarkers();
          scheduleProjectSave();
        } else {
          undoStack.pop();
          updateUndoRedoButtons();
        }
      };
      window.addEventListener('mousemove', onMoveOverlay);
      window.addEventListener('mouseup', onUpOverlay);
    }
    return;
  }

  // Audio overlay trim edge
  const audioOverlayTrimEdge = target?.dataset?.audioOverlayTrimEdge;
  if (audioOverlayTrimEdge) {
    const aoTrimId = target.dataset.audioOverlayId;
    if (aoTrimId) {
      startAudioOverlayTrimDrag(e, aoTrimId, audioOverlayTrimEdge);
      return;
    }
  }

  // Audio overlay band drag-to-move
  const audioOverlayId =
    target?.dataset?.audioOverlayId || target?.parentElement?.dataset?.audioOverlayId;
  if (audioOverlayId) {
    selectAudioOverlay(audioOverlayId);
    const ao = editorState.audioOverlays.find((o) => o.id === audioOverlayId);
    if (ao) {
      let aoMoveDragStarted = false;
      const aoMoveDuration = ao.endTime - ao.startTime;
      const aoMoveOrigStart = ao.startTime;
      let aoDragGhostEl: HTMLDivElement | null = null;
      let aoLastDragTargetTime = ao.startTime;
      pushUndo();

      const onMoveAo = (e2: MouseEvent) => {
        aoMoveDragStarted = true;
        const rect = editorTimeline.getBoundingClientRect();
        const pct = Math.max(0, Math.min(1, (e2.clientX - rect.left) / rect.width));
        aoLastDragTargetTime = Math.max(
          0,
          Math.min(
            editorState!.duration - aoMoveDuration,
            pct * editorState!.duration - aoMoveDuration / 2
          )
        );

        if (!aoDragGhostEl && editorAudioTrack0) {
          aoDragGhostEl = document.createElement('div');
          aoDragGhostEl.style.cssText =
            'position:absolute;top:0;bottom:0;z-index:40;border-radius:3px;pointer-events:none;';
          aoDragGhostEl.style.backgroundColor = 'rgba(20,184,166,0.6)';
          aoDragGhostEl.style.boxShadow = '0 0 8px rgba(94,234,212,0.5)';
          editorAudioTrack0.appendChild(aoDragGhostEl);
          const origBand = editorAudioTrack0.querySelector(
            `[data-audio-overlay-id="${audioOverlayId}"]`
          ) as HTMLElement | null;
          if (origBand) origBand.style.opacity = '0.25';
        }

        if (aoDragGhostEl) {
          const ghostLeft = (aoLastDragTargetTime / editorState!.duration) * 100;
          const ghostWidth = (aoMoveDuration / editorState!.duration) * 100;
          aoDragGhostEl.style.left = ghostLeft + '%';
          aoDragGhostEl.style.width = ghostWidth + '%';
        }
      };
      const onUpAo = () => {
        window.removeEventListener('mousemove', onMoveAo);
        window.removeEventListener('mouseup', onUpAo);
        if (aoDragGhostEl) {
          aoDragGhostEl.remove();
          aoDragGhostEl = null;
        }
        if (aoMoveDragStarted) {
          ao.startTime = aoMoveOrigStart;
          ao.endTime = aoMoveOrigStart + aoMoveDuration;
          const placed = placeAudioOverlayAtTime(
            aoLastDragTargetTime,
            aoMoveDuration,
            editorState!.duration,
            ao.trackIndex || 0,
            audioOverlayId
          );
          if (placed !== null) {
            ao.startTime = placed;
            ao.endTime = placed + aoMoveDuration;
          }
          editorState!.audioOverlays.sort((a, b) => a.startTime - b.startTime);
          renderAudioOverlayMarkers();
          scheduleProjectSave();
        } else {
          undoStack.pop();
          updateUndoRedoButtons();
        }
      };
      window.addEventListener('mousemove', onMoveAo);
      window.addEventListener('mouseup', onUpAo);
    }
    return;
  }

  const trimEdge = target?.dataset?.trimEdge;
  if (trimEdge) {
    const trimSectionId = target.dataset.sectionId;
    if (trimSectionId) {
      startTrimDrag(e, trimSectionId, trimEdge);
      return;
    }
  }

  const sectionId = target && target.dataset ? target.dataset.sectionId : null;
  if (sectionId) {
    selectEditorSection(sectionId);
    if (editorState.selectedOverlayId) {
      editorState.selectedOverlayId = null;
      renderOverlayMarkers();
    }
    if (editorState.selectedAudioOverlayId) {
      editorState.selectedAudioOverlayId = null;
      renderAudioOverlayMarkers();
    }
  }
  seekFromTimeline(e);
  const onMove = (e2: MouseEvent) => seekFromTimeline(e2);
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
});

// ===== Editor button handlers =====

new ResizeObserver(() => renderWaveform()).observe(editorTimelineWrapper);

editorTimelineWrapper.addEventListener(
  'wheel',
  (e: WheelEvent) => {
    if (!editorState) return;
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = 1 - e.deltaY * 0.01;
      applyTimelineZoom(timelineZoom * factor, e.clientX);
    }
  },
  { passive: false }
);

editorUndoBtn.addEventListener('click', editorUndo);
editorRedoBtn.addEventListener('click', editorRedo);
editorPlayBtn.addEventListener('click', editorTogglePlay);
editorSplitBtn.addEventListener('click', () => {
  if (editorState?.selectedAudioOverlayId) {
    splitAudioOverlayAtPlayhead();
  } else if (editorState?.selectedOverlayId) {
    splitOverlayAtPlayhead();
  } else {
    splitSectionAtPlayhead();
  }
});
editorToggleCamBtn.addEventListener('click', toggleCameraVisibility);
editorCamFullBtn.addEventListener('click', toggleCameraFullscreen);
editorApplyFutureBtn.addEventListener('click', applyStyleToFutureSections);
editorBgZoomInput.addEventListener('input', () => {
  if (!editorState || editorState.rendering) return;
  const changed = setSelectedSectionBackgroundZoom(editorBgZoomInput.value, {
    pushHistory: !sectionZoomDragActive
  });
  if (changed) setSectionZoomDragActive(true);
});
editorBgZoomInput.addEventListener('change', commitSectionZoomChange);
editorBgZoomInput.addEventListener('pointerup', commitSectionZoomChange);
editorBgZoomInput.addEventListener('blur', commitSectionZoomChange);

// Scrub drag for Zoom control
initScrubDrag(editorBgZoomScrub, editorBgZoomValue, editorBgZoomInput);
initScrubDrag(editorPipSizeScrub, editorPipSizeValue, editorPipSizeInput);
initScrubDrag(editorOverlaySizeScrub ?? null, editorOverlaySizeValue, editorOverlaySizeInput);
initScrubDrag(
  editorAutoTrackSmoothScrub ?? null,
  editorAutoTrackSmoothValue ?? null,
  editorAutoTrackSmoothInput
);

// Click on "Size" label centers the selected overlay (click = < 3px movement)
if (editorOverlaySizeScrub) {
  let sizeClickStartX = 0;
  editorOverlaySizeScrub.addEventListener('mousedown', (e: MouseEvent) => {
    sizeClickStartX = e.clientX;
  });
  editorOverlaySizeScrub.addEventListener('mouseup', (e: MouseEvent) => {
    if (Math.abs(e.clientX - sizeClickStartX) < 3) {
      centerSelectedOverlay();
    }
  });
}

// Auto-track toggle
if (editorAutoTrackToggle) {
  editorAutoTrackToggle.addEventListener('click', () => {
    if (!editorState || editorState.rendering) return;
    const section = getSelectedSection() || findSectionForTime(editorState.currentTime);
    if (!section) return;
    const anchor = getSectionAnchorKeyframe(section.id, true);
    if (!anchor) return;
    pushUndo();
    anchor.autoTrack = !anchor.autoTrack;
    updateSectionZoomControls();
    scheduleProjectSave();
  });
}

// Auto-track smoothing input
if (editorAutoTrackSmoothInput) {
  editorAutoTrackSmoothInput.addEventListener('input', () => {
    if (!editorState || editorState.rendering) return;
    const section = getSelectedSection() || findSectionForTime(editorState.currentTime);
    if (!section) return;
    const anchor = getSectionAnchorKeyframe(section.id, true);
    if (!anchor) return;
    if (!autoTrackSmoothDragActive) pushUndo();
    setAutoTrackSmoothDragActive(true);
    anchor.autoTrackSmoothing = Math.max(
      0.01,
      Math.min(1.0, parseFloat(editorAutoTrackSmoothInput!.value))
    );
    if (editorAutoTrackSmoothValue)
      editorAutoTrackSmoothValue.textContent = anchor.autoTrackSmoothing.toFixed(2);
  });
  const commitAutoTrackSmooth = () => {
    if (autoTrackSmoothDragActive) scheduleProjectSave();
    setAutoTrackSmoothDragActive(false);
  };
  editorAutoTrackSmoothInput.addEventListener('change', commitAutoTrackSmooth);
  editorAutoTrackSmoothInput.addEventListener('pointerup', commitAutoTrackSmooth);
  editorAutoTrackSmoothInput.addEventListener('blur', commitAutoTrackSmooth);
}

// Overlay size input handler
editorOverlaySizeInput.addEventListener('input', () => {
  if (!editorState || editorState.rendering || !editorState.selectedOverlayId) return;
  const overlay = editorState.overlays.find((o) => o.id === editorState!.selectedOverlayId);
  if (!overlay) return;
  if (!overlaySizeDragActive) pushUndo();
  setOverlaySizeDragActive(true);
  const mode: 'reel' | 'landscape' = editorState.outputMode === 'reel' ? 'reel' : 'landscape';
  const pos = overlay[mode];
  const aspect = pos.width / Math.max(1, pos.height);
  const baseW = mode === 'reel' ? REEL_CANVAS_W : CANVAS_W;
  const newW = Math.max(20, Math.round(baseW * 0.4 * parseFloat(editorOverlaySizeInput.value)));
  const newH = Math.max(20, Math.round(newW / aspect));
  const cx = pos.x + pos.width / 2;
  const cy = pos.y + pos.height / 2;
  pos.x = Math.round(cx - newW / 2);
  pos.y = Math.round(cy - newH / 2);
  pos.width = newW;
  pos.height = newH;
  editorOverlaySizeValue.textContent = `${Math.round(parseFloat(editorOverlaySizeInput.value) * 100)}%`;
});
const commitOverlaySizeChange = () => {
  if (overlaySizeDragActive) scheduleProjectSave();
  setOverlaySizeDragActive(false);
};
editorOverlaySizeInput.addEventListener('change', commitOverlaySizeChange);
editorOverlaySizeInput.addEventListener('pointerup', commitOverlaySizeChange);
editorOverlaySizeInput.addEventListener('blur', commitOverlaySizeChange);

// Output mode toggle buttons
if (editorModeLandscapeBtn) {
  editorModeLandscapeBtn.addEventListener('click', () => setOutputMode('landscape'));
}
if (editorModeReelBtn) {
  editorModeReelBtn.addEventListener('click', () => setOutputMode('reel'));
}

// Crop preset buttons
if (editorCropLeftBtn) editorCropLeftBtn.addEventListener('click', () => setCropPreset(-1));
if (editorCropCenterBtn) editorCropCenterBtn.addEventListener('click', () => setCropPreset(0));
if (editorCropRightBtn) editorCropRightBtn.addEventListener('click', () => setCropPreset(1));

// PIP size slider
if (editorPipSizeInput) {
  editorPipSizeInput.addEventListener('input', () => {
    if (!editorState || editorState.rendering) return;
    const newScale = Math.max(
      MIN_PIP_SCALE,
      Math.min(MAX_PIP_SCALE, Number(editorPipSizeInput!.value))
    );
    if (!pipSizeDragActive) pushUndo();
    setPipSizeDragActive(true);

    const section = getSelectedSection() || findSectionForTime(editorState.currentTime);
    if (section) {
      const anchor = getSectionAnchorKeyframe(section.id, true);
      if (anchor) {
        anchor.pipScale = newScale;
        const { w, h } = getEffectiveCanvasDimensions();
        const newPipSize = computePipSize(newScale, w);
        const pos = getSnapPointPosition(anchor.pipSnapPoint || 'br', w, h, newPipSize);
        anchor.pipX = pos.x;
        anchor.pipY = pos.y;
      }
    }

    if (editorPipSizeValue) editorPipSizeValue.textContent = newScale.toFixed(2);
    scheduleProjectSave();
  });
  const commitPipSizeChange = () => {
    setPipSizeDragActive(false);
  };
  editorPipSizeInput.addEventListener('change', commitPipSizeChange);
  editorPipSizeInput.addEventListener('pointerup', commitPipSizeChange);
  editorPipSizeInput.addEventListener('blur', commitPipSizeChange);
}

updateSectionZoomControls();

// ===== Render pipeline =====

editorRenderBtn.addEventListener('click', async () => {
  if (!editorState || editorState.rendering) return;
  await renderVideo();
});

// ===== Segment selection =====

transcriptContent.addEventListener('click', (e: MouseEvent) => {
  if (!(e.target as HTMLElement).closest('[data-segment-index]')) selectSegment(-1);
});

// ===== Keyboard shortcuts =====

document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (recording && e.code === 'Backspace') {
    e.preventDefault();
    if (selectedSegmentIndex >= 0 && selectedSegmentIndex < speechSegments.length) {
      const seg = speechSegments[selectedSegmentIndex]!;
      seg.deleted = !seg.deleted;
      const el = transcriptContent.querySelector(
        `[data-segment-index="${selectedSegmentIndex}"]`
      ) as HTMLElement | null;
      if (el) applySegmentDeletedStyle(el, !!seg.deleted);
      updateSegmentBadge();
    } else {
      for (let i = speechSegments.length - 1; i >= 0; i--) {
        if (!speechSegments[i]!.deleted) {
          speechSegments[i]!.deleted = true;
          const el = transcriptContent.querySelector(
            `[data-segment-index="${i}"]`
          ) as HTMLElement | null;
          if (el) applySegmentDeletedStyle(el, true);
          updateSegmentBadge();
          break;
        }
      }
    }
    return;
  }

  if (recording && e.code === 'Escape') {
    selectSegment(-1);
    return;
  }

  // Cmd+B: pick background image — works in both recording and editor views
  if (e.code === 'KeyB' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    pickAndLoadBackground();
    return;
  }

  if (!editorState || editorState.rendering || activeWorkspaceView !== 'timeline') return;
  if (
    (e.target as HTMLElement).tagName === 'SELECT' ||
    (e.target as HTMLElement).tagName === 'INPUT'
  )
    return;

  if (e.code === 'KeyZ' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    if (e.shiftKey) {
      editorRedo();
    } else {
      editorUndo();
    }
    return;
  }

  if (e.code === 'KeyT' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    captureThumbnailFrame();
    return;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    editorTogglePlay();
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    const stepL = e.metaKey || e.ctrlKey ? 5 / 30 : 1 / 30;
    editorSeek(editorState.currentTime - stepL);
  } else if (e.code === 'ArrowRight') {
    e.preventDefault();
    const stepR = e.metaKey || e.ctrlKey ? 5 / 30 : 1 / 30;
    editorSeek(editorState.currentTime + stepR);
  } else if (e.code === 'ArrowUp') {
    e.preventDefault();
    const boundaries = getTimelineBoundaries();
    const nextB = boundaries.find((t) => t > editorState!.currentTime + 0.001);
    if (nextB !== undefined) editorSeek(nextB);
  } else if (e.code === 'ArrowDown') {
    e.preventDefault();
    const boundaries = getTimelineBoundaries();
    let prevB: number | null = null;
    for (const t of boundaries) {
      if (t < editorState!.currentTime - 0.001) prevB = t;
      else break;
    }
    if (prevB !== null) editorSeek(prevB);
  } else if (e.code === 'Backspace' || e.code === 'Delete') {
    e.preventDefault();
    if (editorState?.selectedOverlayId && !(e.metaKey || e.ctrlKey)) {
      deleteSelectedOverlay();
    } else if (editorState?.selectedAudioOverlayId && !(e.metaKey || e.ctrlKey)) {
      deleteSelectedAudioOverlay();
    } else {
      // Cmd+Delete: find section at playhead; plain Delete: use selected section
      if (e.metaKey || e.ctrlKey) {
        const sectionAtPlayhead = findSectionForTime(editorState!.currentTime);
        if (sectionAtPlayhead) {
          editorState!.selectedSectionId = sectionAtPlayhead.id;
        }
      }
      deleteSelectedSection();
    }
  } else if (e.code === 'KeyS') {
    e.preventDefault();
    if (e.metaKey || e.ctrlKey) {
      splitAllAtPlayhead();
    } else if (editorState?.selectedOverlayId) {
      splitOverlayAtPlayhead();
    } else if (editorState?.selectedAudioOverlayId) {
      splitAudioOverlayAtPlayhead();
    } else {
      splitAllAtPlayhead();
    }
  } else if (e.code === 'KeyC') {
    e.preventDefault();
    toggleCameraVisibility();
  } else if (e.code === 'KeyF') {
    e.preventDefault();
    toggleCameraFullscreen();
  } else if (e.code === 'KeyL') {
    e.preventDefault();
    cyclePlaybackSpeed();
  }
});

// Settings
openFolderBtn.addEventListener('click', () => {
  if (activeProjectPath) window.electronAPI.openFolder(activeProjectPath);
});

activeProjectPathEl.addEventListener('click', () => {
  if (activeProjectPath) window.electronAPI.openFolder(activeProjectPath);
});

pickFolderBtn.addEventListener('click', () => {
  setWorkspaceView('home');
});

contentProtectionToggle.addEventListener('change', async () => {
  setHideFromRecording(contentProtectionToggle.checked ? 'true' : 'false');
  await syncContentProtection();
  scheduleProjectSave();
});

exportAudioPresetSelect.addEventListener('change', () => {
  exportAudioPresetSelect.value = normalizeExportAudioPreset(exportAudioPresetSelect.value);
  if (activeProject?.settings) {
    activeProject.settings.exportAudioPreset = exportAudioPresetSelect.value;
  }
  scheduleProjectSave();
});

cameraSyncOffsetInput.addEventListener('change', () => {
  const normalized = normalizeCameraSyncOffsetMs(cameraSyncOffsetInput.value);
  cameraSyncOffsetInput.value = String(normalized);
  if (activeProject?.settings) {
    activeProject.settings.cameraSyncOffsetMs = normalized;
  }
  if (editorState) {
    editorState.cameraSyncOffsetMs = normalized;
    editorSeek(editorState.currentTime);
  }
  scheduleProjectSave();
});

screenFitSelect.addEventListener('change', () => {
  if (editorState) editorState.screenFitMode = screenFitSelect.value;
  updatePreview();
  scheduleProjectSave();
});

screenSelect.addEventListener('change', async () => {
  try {
    await updateScreenStream();
  } catch (_e) {
    console.error(_e);
  }
  updatePreview();
});

cameraSelect.addEventListener('change', async () => {
  try {
    await updateCameraStream();
  } catch (_e) {
    console.error(_e);
  }
  updatePreview();
});

audioSelect.addEventListener('change', async () => {
  try {
    await updateAudioStream();
  } catch (_e) {
    console.error(_e);
  }
});

recordBtn.addEventListener('click', toggleRecording);

goRecordingBtn.addEventListener('click', () => {
  if (!activeProjectPath) return;
  setWorkspaceView('recording');
});

goTimelineBtn.addEventListener('click', () => {
  if (!activeProjectPath || !editorState) return;
  setWorkspaceView('timeline');
});

switchProjectBtn.addEventListener('click', async () => {
  if (recording) return;
  await flushScheduledProjectSave();
  if (activeProjectPath) {
    try {
      await window.electronAPI.cleanupDeleted(activeProjectPath);
    } catch (_e) {
      /* best effort */
    }
  }
  setWorkspaceView('home');
  await refreshRecentProjects();
});

// Project home actions
projectHomeView.addEventListener(
  'click',
  (event: MouseEvent) => {
    const target =
      (event.target as HTMLElement)?.id || (event.target as HTMLElement)?.tagName || 'unknown';
    console.log('project-home-click', target);
  },
  true
);

createProjectBtn.addEventListener('click', async () => {
  const name = (newProjectNameInput.value || '').trim() || 'Untitled Project';
  showProjectHomeMessage('Opening folder picker...', 'info');
  try {
    const projectPath = await window.electronAPI.pickProjectLocation({ name });
    if (!projectPath) return;
    const created = await window.electronAPI.projectCreate({ projectPath, name });
    if (!created?.projectPath || !created?.project) return;
    newProjectNameInput.value = '';
    clearProjectHomeMessage();
    await activateProject(created.projectPath, created.project, 'recording');
    await refreshRecentProjects();
  } catch (error) {
    console.error('Failed to create project:', error);
    showProjectHomeMessage((error as Error)?.message || 'Failed to create project.');
  }
});

openProjectBtn.addEventListener('click', async () => {
  showProjectHomeMessage('Opening folder picker...', 'info');
  try {
    const folder = await window.electronAPI.pickFolder({
      title: 'Open Project Folder',
      buttonLabel: 'Open Project'
    });
    if (!folder) return;
    await openProjectByPath(folder, 'timeline');
  } catch (error) {
    console.error('Failed to choose project folder:', error);
    showProjectHomeMessage((error as Error)?.message || 'Failed to choose project folder.');
  }
});

resumeLastBtn.addEventListener('click', async () => {
  const projectPath = resumeLastBtn.dataset.projectPath;
  if (!projectPath) return;
  await openProjectByPath(projectPath, 'timeline');
});

recentProjectsList.addEventListener('click', async (event: MouseEvent) => {
  const button = (event.target as HTMLElement).closest(
    'button[data-project-path]'
  ) as HTMLButtonElement | null;
  if (!button) return;
  await openProjectByPath(button.dataset.projectPath!, 'timeline');
});

saveAndCleanBtn.addEventListener('click', async () => {
  const lastProjPath = resumeLastBtn.dataset.projectPath;
  if (!lastProjPath) {
    showProjectHomeMessage('No recent project to clean up.', 'info');
    return;
  }
  try {
    const result = await window.electronAPI.cleanupUnusedTakes(lastProjPath);
    const count = result?.removedCount || 0;
    const msg =
      count > 0
        ? `Cleanup complete. Removed ${count} unused take${count > 1 ? 's' : ''}.`
        : 'Cleanup complete. No unused takes found.';
    showProjectHomeMessage(msg, 'info');
  } catch (error) {
    console.error('Save & Clean failed:', error);
    showProjectHomeMessage((error as Error)?.message || 'Cleanup failed.', 'error');
  }
});

newProjectNameInput.addEventListener('keydown', async (event: KeyboardEvent) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  createProjectBtn.click();
});

// Init
cleanupAllMedia({
  recording,
  screenStream,
  cameraStream,
  audioStream,
  recorders,
  screenRecInterval,
  audioSendInterval,
  timerInterval,
  audioContext,
  scribeWorkletNode,
  scribeWs,
  drawRAF,
  meterRAF,
  cancelEditorDrawLoop,
  stopAudioMeter,
  windowStreams,
  windowRecIntervals
});

setWorkspaceView('home');
syncContentProtection();
updateWorkspaceHeader();
refreshRecentProjects();

window.addEventListener('beforeunload', () => {
  if (mediaIdleTimer) {
    clearTimeout(mediaIdleTimer);
    setMediaIdleTimer(null);
  }
  cleanupAllMedia({
    recording,
    screenStream,
    cameraStream,
    audioStream,
    recorders,
    screenRecInterval,
    audioSendInterval,
    timerInterval,
    audioContext,
    scribeWorkletNode,
    scribeWs,
    drawRAF,
    meterRAF,
    cancelEditorDrawLoop,
    stopAudioMeter,
    windowStreams,
    windowRecIntervals
  });
  setRecording(false);
  setScreenStream(null);
  setCameraStream(null);
  setAudioStream(null);
  setRecorders([]);
  setScreenRecInterval(null);
  setAudioSendInterval(null);
  setAudioContext(null);
  setScribeWorkletNode(null);
  setScribeWs(null);
  setDrawRAF(null);
  setMeterRAF(null);

  flushScheduledProjectSave().catch((error: unknown) => {
    console.warn('Failed to flush project save on exit:', error);
  });
  if (activeProjectPath) {
    window.electronAPI.cleanupDeleted(activeProjectPath).catch(() => {});
  }
});

// Suppress unused variable warnings for intentionally-unused functions
void _clearRecoveryTake;
void _showProcessingState;
void _buildSectionAnchorSnapshot;
void _deleteNearestKeyframe;
void _exitEditor;
void resolveZoomCrop;
