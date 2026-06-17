import {
  activeProject,
  activeProjectPath,
  backgroundImagePath,
  capturingThumbnail,
  editorState,
  editorRenderTimeout,
  saveFolder,
  selectedSegmentIndex,
  speechSegments,
  thumbnailToastTimer,
  DEFAULT_SECTION_ZOOM,
  setCapturingThumbnail,
  setEditorRenderTimeout,
  setSelectedSegmentIndex,
  setThumbnailToastTimer
} from '../../state.js';
import {
  editorCamFullBtn,
  editorPlayBtn,
  editorRedoBtn,
  editorRenderBtn,
  editorSectionMarkers,
  editorSplitBtn,
  editorToggleCamBtn,
  editorUndoBtn,
  exportAudioPresetSelect,
  processingStatus,
  processingTitle,
  segmentBadge,
  transcriptContent
} from '../dom/elements.js';
import { editorPause, editorSeek, getStateAtTime } from '../editor/transport.js';
import {
  commitSectionZoomChange,
  getSectionAnchorKeyframe,
  syncSectionAnchorKeyframes,
  updateSectionZoomControls
} from '../section/section-editing.js';
import { clampSectionZoom } from '../editor/zoom-crop.js';
import { clampReelCropX, clampSectionPan } from '../geometry/section-geometry.js';
import { setProcessingProgress } from '../recording/recording.js';
import {
  persistProjectNow,
  updateUndoRedoButtons
} from '../project/project-lifecycle.js';
import { resolveTimeToSource } from '../media/take-media.js';
import { CANVAS_H, CANVAS_W } from '../../../shared/domain/canvas.js';
import { DEFAULT_PIP_SCALE } from '../../../shared/types/domain.js';
import {
  normalizeExportAudioPreset,
  normalizePipScale
} from '../../../shared/domain/project-fields.js';
import type { Keyframe, PipSnapPoint, Take } from '../../../shared/types/domain.js';

export function handleRenderProgress(update: { percent?: number | null; status?: string }) {
  if (!editorState || !editorState.rendering) return;

  const percent = Number.isFinite(Number(update?.percent))
    ? Math.max(0, Math.min(1, Number(update.percent)))
    : null;
  editorState.renderProgress = percent ?? 0;

  processingTitle.textContent = 'Rendering export...';
  processingStatus.textContent =
    typeof update?.status === 'string' && update.status ? update.status : 'Rendering...';
  setProcessingProgress(percent);

  if (percent === null) {
    setRenderBtnState(processingStatus.textContent, 'busy');
    return;
  }

  setRenderBtnState(`Rendering ${Math.round(percent * 100)}%`, 'busy');
}

export function updateProxyProgressBars(takeId: string, percent: number): void {
  const pct = Math.round(percent * 100);
  const bars = editorSectionMarkers.querySelectorAll(`[data-proxy-bar="${takeId}"]`);
  for (const bar of Array.from(bars)) {
    (bar as HTMLElement).style.width = `${pct}%`;
    (bar as HTMLElement).title = `Optimizing for editing\u2026 ${pct}%`;
  }
}

export function getRenderKeyframes(): Keyframe[] {
  if (!editorState) return [];

  if (editorState.sections && editorState.sections.length > 0) {
    syncSectionAnchorKeyframes();
  }

  const sorted = [...editorState.keyframes].sort((a, b) => a.time - b.time);
  const minimal = sorted.map((kf) => ({
    time: kf.time,
    pipX: kf.pipX,
    pipY: kf.pipY,
    pipVisible: kf.pipVisible,
    cameraFullscreen: !!kf.cameraFullscreen,
    backgroundZoom: clampSectionZoom(kf.backgroundZoom),
    backgroundPanX: clampSectionPan(kf.backgroundPanX),
    backgroundPanY: clampSectionPan(kf.backgroundPanY),
    reelCropX: clampReelCropX(kf.reelCropX),
    pipScale: normalizePipScale(kf.pipScale),
    autoTrack: !!kf.autoTrack,
    autoTrackSmoothing: kf.autoTrackSmoothing || 0.15,
    sectionId: kf.sectionId,
    autoSection: kf.autoSection,
    pipSnapPoint: kf.pipSnapPoint,
    savedLandscape: kf.savedLandscape,
    savedReel: kf.savedReel
  }));

  if (minimal.length === 0 || minimal[0]!.time > 0.0001) {
    minimal.unshift({
      time: 0,
      pipX: editorState.defaultPipX,
      pipY: editorState.defaultPipY,
      pipVisible: true,
      cameraFullscreen: false,
      backgroundZoom: DEFAULT_SECTION_ZOOM,
      backgroundPanX: 0,
      backgroundPanY: 0,
      reelCropX: 0,
      pipScale: editorState.pipScale || DEFAULT_PIP_SCALE,
      autoTrack: false,
      autoTrackSmoothing: 0.15,
      sectionId: null,
      autoSection: false,
      pipSnapPoint: 'br' as PipSnapPoint,
      savedLandscape: null,
      savedReel: null
    });
  }

  return minimal;
}

export function getRenderSections(): unknown[] {
  if (!editorState) return [];
  if (editorState.sections && editorState.sections.length > 0) {
    syncSectionAnchorKeyframes();
  }
  return editorState.sections.map((section) => {
    const anchor = getSectionAnchorKeyframe(section.id, true);
    return {
      takeId: section.takeId,
      sourceStart: section.sourceStart,
      sourceEnd: section.sourceEnd,
      backgroundZoom: clampSectionZoom(anchor?.backgroundZoom),
      backgroundPanX: clampSectionPan(anchor?.backgroundPanX),
      backgroundPanY: clampSectionPan(anchor?.backgroundPanY),
      reelCropX: clampReelCropX(anchor?.reelCropX),
      pipScale: normalizePipScale(anchor?.pipScale)
    };
  });
}

export function showThumbnailToast(message: string): void {
  const toast = document.getElementById('editorThumbnailToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove('hidden');
  if (thumbnailToastTimer) clearTimeout(thumbnailToastTimer);
  setThumbnailToastTimer(
    setTimeout(() => {
      toast.classList.add('hidden');
      setThumbnailToastTimer(null);
    }, 2000)
  );
}

export function setRenderBtnState(text: string, style = 'idle'): void {
  if (editorRenderTimeout) clearTimeout(editorRenderTimeout);
  editorRenderBtn.textContent = text;
  if (style === 'busy') {
    editorRenderBtn.className =
      'px-4 py-1.5 bg-neutral-700 text-neutral-300 rounded-lg text-sm font-medium transition-colors min-w-[80px] text-center cursor-wait';
  } else if (style === 'done') {
    editorRenderBtn.className =
      'px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-sm font-medium transition-colors min-w-[80px] text-center';
  } else if (style === 'error') {
    editorRenderBtn.className =
      'px-4 py-1.5 bg-red-600 text-white rounded-lg text-sm font-medium transition-colors min-w-[80px] text-center';
  } else {
    editorRenderBtn.className =
      'px-4 py-1.5 bg-white text-neutral-950 hover:bg-neutral-200 rounded-lg text-sm font-medium transition-colors min-w-[80px] text-center';
  }
}

export async function captureThumbnailFrame(): Promise<void> {
  if (capturingThumbnail || !editorState || !activeProjectPath) return;

  const resolved = resolveTimeToSource(editorState.currentTime);
  if (!resolved) return;

  const take = activeProject?.takes?.find((t: Take) => t.id === resolved.takeId);
  const hasWindowOverlays = (editorState.overlays || []).some((o) => o.mediaType === 'window');
  if (!take?.screenPath && !hasWindowOverlays) return;

  setCapturingThumbnail(true);
  showThumbnailToast('Capturing...');

  try {
    const state = getStateAtTime(editorState.currentTime);
    const frozenKeyframe: Keyframe = {
      time: 0,
      pipX: state.pipX,
      pipY: state.pipY,
      pipVisible: state.pipVisible,
      cameraFullscreen: state.cameraFullscreen,
      backgroundZoom: state.backgroundZoom,
      backgroundPanX: state.backgroundPanX,
      backgroundPanY: state.backgroundPanY,
      reelCropX: state.reelCropX,
      pipScale: state.pipScale,
      pipSnapPoint: state.pipSnapPoint,
      autoTrack: state.autoTrack,
      autoTrackSmoothing: state.autoTrackSmoothing,
      sectionId: null,
      autoSection: false,
      savedLandscape: null,
      savedReel: null,
      backgroundFocusX: state.backgroundFocusX,
      backgroundFocusY: state.backgroundFocusY
    };

    const currentTime = editorState.currentTime;
    const visibleOverlays = (editorState.overlays || [])
      .filter((o) => o.startTime <= currentTime && currentTime < o.endTime)
      .map((o) => {
        const delta = currentTime - o.startTime;
        const isVideoLike = o.mediaType === 'video' || o.mediaType === 'window';
        return {
          ...o,
          startTime: 0,
          endTime: 0.1,
          sourceStart: isVideoLike ? o.sourceStart + delta : o.sourceStart,
          sourceEnd: isVideoLike ? o.sourceStart + delta + 0.1 : o.sourceEnd
        };
      });

    await window.electronAPI.captureThumbnail({
      takes: take
        ? [
            {
              id: take.id,
              screenPath: take.screenPath,
              cameraPath: take.cameraPath,
              mousePath: take.mousePath || null,
              windowPaths: take.windowPaths || null
            }
          ]
        : [],
      keyframes: [frozenKeyframe],
      overlays: visibleOverlays,
      wallpaperPath: hasWindowOverlays ? backgroundImagePath : null,
      timelineTime: editorState.currentTime,
      sourceTime: resolved.sourceTime,
      cameraSyncOffsetMs: editorState.cameraSyncOffsetMs,
      sourceWidth: editorState.sourceWidth || CANVAS_W,
      sourceHeight: editorState.sourceHeight || CANVAS_H,
      outputMode: editorState.outputMode || 'landscape',
      screenFitMode: editorState.screenFitMode as 'fit' | 'fill',
      pipSize: editorState.pipSize,
      projectFolder: activeProjectPath
    });

    showThumbnailToast('Thumbnail saved');
  } catch (err) {
    console.error('Thumbnail capture error:', err);
    showThumbnailToast('Capture failed');
  } finally {
    setCapturingThumbnail(false);
  }
}

export async function renderVideo(): Promise<void> {
  commitSectionZoomChange();
  editorState!.rendering = true;
  editorState!.renderProgress = 0;
  setRenderBtnState('Rendering...', 'busy');
  processingTitle.textContent = 'Rendering export...';
  processingStatus.textContent = 'Preparing render...';
  setProcessingProgress(0);
  editorPause();

  editorUndoBtn.disabled = true;
  editorRedoBtn.disabled = true;
  editorPlayBtn.disabled = true;
  editorSplitBtn.disabled = true;
  editorToggleCamBtn.disabled = true;
  editorCamFullBtn.disabled = true;
  editorRenderBtn.disabled = true;
  updateSectionZoomControls();

  try {
    const renderKeyframes = getRenderKeyframes();
    const renderSections = getRenderSections();

    const referencedTakeIds = new Set(
      editorState!.sections.map((s) => s.takeId).filter(Boolean) as string[]
    );
    const takes: Array<{
      id: string;
      screenPath: string | null;
      cameraPath: string | null;
      mousePath: string | null;
      windowPaths: Array<{ name: string; path: string }> | null;
    }> = [];
    for (const takeId of referencedTakeIds) {
      const take = activeProject?.takes?.find((t: Take) => t.id === takeId);
      if (take) {
        takes.push({
          id: take.id,
          screenPath: take.screenPath,
          cameraPath: take.cameraPath,
          mousePath: take.mousePath || null,
          windowPaths: take.windowPaths || null
        });
      }
    }

    const mp4Path = await window.electronAPI.renderComposite({
      takes,
      sections: renderSections,
      keyframes: renderKeyframes,
      pipSize: editorState!.pipSize,
      screenFitMode: editorState!.screenFitMode as 'fit' | 'fill',
      exportAudioPreset: normalizeExportAudioPreset(exportAudioPresetSelect.value) as
        | 'off'
        | 'compressed',
      cameraSyncOffsetMs: editorState!.cameraSyncOffsetMs,
      sourceWidth: editorState!.sourceWidth || CANVAS_W,
      sourceHeight: editorState!.sourceHeight || CANVAS_H,
      outputMode: editorState!.outputMode || 'landscape',
      overlays: editorState!.overlays || [],
      audioOverlays: editorState!.audioOverlays || [],
      wallpaperPath: backgroundImagePath,
      outputFolder: saveFolder
    });

    editorState!.rendering = false;
    editorState!.renderProgress = 1;
    setProcessingProgress(1);
    setRenderBtnState('Done!', 'done');
    console.log('Rendered:', mp4Path);
    await persistProjectNow();
  } catch (err) {
    editorState!.rendering = false;
    editorState!.renderProgress = 0;
    setProcessingProgress(null);
    console.error('Render error:', err);
    setRenderBtnState('Failed', 'error');
  }

  updateUndoRedoButtons();
  editorPlayBtn.disabled = false;
  editorSplitBtn.disabled = false;
  editorToggleCamBtn.disabled = false;
  editorCamFullBtn.disabled = false;
  editorRenderBtn.disabled = false;
  updateSectionZoomControls();

  setEditorRenderTimeout(setTimeout(() => setRenderBtnState('Render', 'idle'), 3000));
  editorSeek(0);
}

export function selectSegment(index: number): void {
  if (selectedSegmentIndex >= 0) {
    const prev = transcriptContent.querySelector(
      `[data-segment-index="${selectedSegmentIndex}"]`
    ) as HTMLElement | null;
    if (prev) prev.style.outline = '';
  }
  setSelectedSegmentIndex(index);
  if (index >= 0) {
    const el = transcriptContent.querySelector(
      `[data-segment-index="${index}"]`
    ) as HTMLElement | null;
    if (el) el.style.outline = '2px solid rgba(255, 255, 255, 0.3)';
  }
}

export function applySegmentDeletedStyle(el: HTMLElement, deleted: boolean): void {
  el.style.textDecoration = deleted ? 'line-through' : '';
  el.style.opacity = deleted ? '0.4' : '';
}

export function updateSegmentBadge(): void {
  const total = speechSegments.length;
  const removed = speechSegments.filter((s) => s.deleted).length;
  const active = total - removed;
  if (removed > 0) {
    segmentBadge.textContent = `${active} segment${active !== 1 ? 's' : ''} (${removed} removed)`;
  } else {
    segmentBadge.textContent = `${total} segment${total !== 1 ? 's' : ''}`;
  }
}
