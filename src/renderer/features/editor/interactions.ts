import { roundMs } from '../timeline/section-utils.js';
import { applyOverlayTrimDelta } from '../timeline/overlay-utils.js';
import type {
  OverlayTrimSnapshot,
  OverlayTrimContext
} from '../timeline/overlay-utils.js';
import { CANVAS_W, CANVAS_H } from '../../../shared/domain/canvas.js';
import { clampReelCropX } from '../geometry/section-geometry.js';
import { renderOverlayMarkers } from '../overlay/overlay.js';
import { renderAudioOverlayMarkers } from '../audio-overlay/audio-overlay.js';
import { editorSeek, editorPause } from './transport.js';
import {
  getSelectedSection,
  renderSectionMarkers,
  syncSectionAnchorKeyframes,
  recalculateTimelinePositions,
  getSectionAnchorKeyframe,
  findSectionForTime
} from '../section/section-editing.js';
import { pushUndo, scheduleProjectSave, updateUndoRedoButtons } from '../project/project-lifecycle.js';
import { pathToFileUrl } from '../media/take-media.js';
import type { Overlay, AudioOverlay, Keyframe, Take } from '../../../shared/types/domain.js';
import {
  editorState,
  timelineZoom,
  setTimelineZoom,
  waveformPeaks,
  setWaveformPeaks,
  takeAudioBufferCache,
  activeProject,
  trimDragState,
  setTrimDragState,
  undoStack
} from '../../state.js';
import {
  editorWaveformCanvas,
  editorTimeline,
  editorTimelineWrapper,
  editorCanvas
} from '../dom/elements.js';

// Recognises the benign "this take has no decodable audio track" failure that
// `OfflineAudioContext.decodeAudioData` throws for no-mic recordings — typically a
// DOMException named `EncodingError` with the message "Unable to decode audio data".
// Used to keep no-audio takes quiet (D5) without swallowing real decode errors.
function isNoAudioTrackError(err: unknown): boolean {
  if (!err) return false;
  const name = (err as { name?: string }).name;
  if (name === 'EncodingError') return true;
  const message = (err as { message?: string }).message;
  return typeof message === 'string' && /unable to decode audio data/i.test(message);
}

function computeWaveformPeaksFromCache(numBuckets = 800): Float32Array | null {
  if (!editorState || !editorState.sections || editorState.sections.length === 0) return null;
  const totalDuration = editorState.duration;
  if (totalDuration <= 0) return null;

  const peaks = new Float32Array(numBuckets);
  for (let bucket = 0; bucket < numBuckets; bucket++) {
    const bucketStart = (bucket / numBuckets) * totalDuration;
    const bucketEnd = ((bucket + 1) / numBuckets) * totalDuration;
    let maxPeak = 0;

    for (const section of editorState.sections) {
      if (bucketEnd <= section.start || bucketStart >= section.end) continue;
      const overlapStart = Math.max(bucketStart, section.start);
      const overlapEnd = Math.min(bucketEnd, section.end);
      const sourceStart = section.sourceStart + (overlapStart - section.start);
      const sourceEnd = section.sourceStart + (overlapEnd - section.start);

      const audioBuffer = takeAudioBufferCache.get(section.takeId!);
      if (!audioBuffer) continue;
      const channelData = audioBuffer.getChannelData(0);
      const sampleRate = audioBuffer.sampleRate;
      const startSample = Math.floor(sourceStart * sampleRate);
      const endSample = Math.min(Math.ceil(sourceEnd * sampleRate), channelData.length);

      for (let j = startSample; j < endSample; j++) {
        const abs = Math.abs(channelData[j]!);
        if (abs > maxPeak) maxPeak = abs;
      }
    }
    peaks[bucket] = maxPeak;
  }
  return peaks;
}

export function refreshWaveform(): void {
  if (!editorState) return;
  setWaveformPeaks(computeWaveformPeaksFromCache(Math.round(800 * timelineZoom)));
  renderWaveform();
}

export async function extractWaveformPeaks(numBuckets = 800): Promise<Float32Array | null> {
  if (!editorState || !editorState.sections || editorState.sections.length === 0) return null;

  try {
    for (const section of editorState.sections) {
      if (!section.takeId || takeAudioBufferCache.has(section.takeId)) continue;
      const take = activeProject?.takes?.find((t: Take) => t.id === section.takeId);
      if (!take) continue;
      try {
        const url = pathToFileUrl(take.screenPath);
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const offlineCtx = new OfflineAudioContext(1, 1, 44100);
        const audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
        takeAudioBufferCache.set(section.takeId, audioBuffer);
      } catch (err) {
        // D5: a take recorded with no audio track (no-mic / permission-denied) has
        // no decodable audio in its webm, so decodeAudioData throws
        // "EncodingError: Unable to decode audio data". That is an expected, valid
        // state — not an error — so quiet it to a single debug log instead of a
        // per-take warning (which also trips the renderer-health error scan).
        // Genuine, unexpected decode failures still surface as a warning.
        if (isNoAudioTrackError(err)) {
          console.debug(`No audio track to decode for take ${section.takeId} (skipping waveform)`);
        } else {
          console.warn(`Failed to decode audio for take ${section.takeId}:`, err);
        }
      }
    }

    return computeWaveformPeaksFromCache(numBuckets);
  } catch (err) {
    console.warn('Failed to extract waveform:', err);
    return null;
  }
}

export function renderWaveform(): void {
  const wfCanvas = editorWaveformCanvas;
  const rect = wfCanvas.parentElement!.getBoundingClientRect();
  wfCanvas.width = Math.round(rect.width * devicePixelRatio);
  wfCanvas.height = Math.round(rect.height * devicePixelRatio);
  const wCtx = wfCanvas.getContext('2d')!;
  wCtx.clearRect(0, 0, wfCanvas.width, wfCanvas.height);
  if (!waveformPeaks || waveformPeaks.length === 0) return;

  const w = wfCanvas.width;
  const h = wfCanvas.height;
  const midY = h / 2;
  const barWidth = w / waveformPeaks.length;

  wCtx.fillStyle = 'rgba(163, 163, 163, 0.5)';
  for (let i = 0; i < waveformPeaks.length; i++) {
    const barHeight = waveformPeaks[i]! * midY * 0.9;
    const x = i * barWidth;
    wCtx.fillRect(x, midY - barHeight, Math.max(1, barWidth - 0.5), barHeight * 2);
  }
}

export function startTrimDrag(e: MouseEvent, sectionId: string, edge: string): void {
  const section = editorState!.sections.find((s) => s.id === sectionId);
  if (!section) return;
  pushUndo();
  editorPause();
  e.preventDefault();
  const rect = editorTimeline.getBoundingClientRect();
  const epsilon = 0.05;

  // Snapshot all overlays that overlap with the section's trimmed edge.
  // We capture broadly because shortening cuts ANY overlay in the way,
  // while extending only affects edge-aligned overlays (decided in finishTrimDrag).
  // Snapshot overlays that actually extend INTO the section (not just touching the boundary).
  // For right edge: overlay must start before section.end and end after section.start (inside the section)
  // For left edge: overlay must end after section.start and start before section.end (inside the section)
  const overlaySnapshots: OverlayTrimSnapshot[] = [];
  for (const o of editorState!.overlays) {
    const insideSection =
      o.startTime < section.end - epsilon && o.endTime > section.start + epsilon;
    if (insideSection) {
      overlaySnapshots.push({
        id: o.id,
        originalStartTime: o.startTime,
        originalEndTime: o.endTime,
        originalSourceStart: o.sourceStart,
        originalSourceEnd: o.sourceEnd
      });
    }
  }

  const audioOverlaySnapshots: OverlayTrimSnapshot[] = [];
  for (const ao of editorState!.audioOverlays) {
    const insideSection =
      ao.startTime < section.end - epsilon && ao.endTime > section.start + epsilon;
    if (insideSection) {
      audioOverlaySnapshots.push({
        id: ao.id,
        originalStartTime: ao.startTime,
        originalEndTime: ao.endTime,
        originalSourceStart: ao.sourceStart,
        originalSourceEnd: ao.sourceEnd
      });
    }
  }

  setTrimDragState({
    sectionId,
    edge,
    originalSourceStart: section.sourceStart,
    originalSourceEnd: section.sourceEnd,
    originalStart: section.start,
    originalEnd: section.end,
    startMouseX: e.clientX,
    pixelsPerSecond: rect.width / editorState!.duration,
    overlaySnapshots,
    audioOverlaySnapshots
  });
  document.body.style.cursor = 'col-resize';
  const onMove = (e2: MouseEvent) => {
    e2.preventDefault();
    updateTrimDrag(e2);
  };
  const onUp = () => {
    document.body.style.cursor = '';
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    finishTrimDrag();
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

function updateTrimDrag(e: MouseEvent): void {
  if (!trimDragState || !editorState) return;
  const section = editorState.sections.find((s) => s.id === trimDragState!.sectionId);
  if (!section) return;
  const MIN_DURATION = 0.1;
  const deltaPixels = e.clientX - trimDragState.startMouseX;
  const deltaTime = deltaPixels / trimDragState.pixelsPerSecond;

  if (trimDragState.edge === 'left') {
    section.sourceStart = roundMs(
      Math.max(
        0,
        Math.min(
          trimDragState.originalSourceEnd - MIN_DURATION,
          trimDragState.originalSourceStart + deltaTime
        )
      )
    );
    const newDuration = section.sourceEnd - section.sourceStart;
    section.end = trimDragState.originalEnd;
    section.start = roundMs(section.end - newDuration);
    section.duration = roundMs(newDuration);
  } else {
    section.sourceEnd = roundMs(
      Math.max(section.sourceStart + MIN_DURATION, trimDragState.originalSourceEnd + deltaTime)
    );
    const newDuration = section.sourceEnd - section.sourceStart;
    section.start = trimDragState.originalStart;
    section.end = roundMs(section.start + newDuration);
    section.duration = roundMs(newDuration);
  }

  renderSectionMarkers();
}

function finishTrimDrag(): void {
  if (!trimDragState || !editorState) {
    setTrimDragState(null);
    return;
  }
  const section = editorState.sections.find((s) => s.id === trimDragState!.sectionId);
  if (!section) {
    setTrimDragState(null);
    return;
  }
  const sourceStartChanged =
    Math.abs(section.sourceStart - trimDragState.originalSourceStart) > 0.01;
  const sourceEndChanged = Math.abs(section.sourceEnd - trimDragState.originalSourceEnd) > 0.01;

  // Save trim state before clearing
  const trimEdge = trimDragState.edge;
  const origSectionStart = trimDragState.originalStart;
  const origSectionEnd = trimDragState.originalEnd;
  const origSourceStart = trimDragState.originalSourceStart;
  const origSourceEnd = trimDragState.originalSourceEnd;
  const overlaySnaps = trimDragState.overlaySnapshots;
  const audioOverlaySnaps = trimDragState.audioOverlaySnapshots;
  const snapshotIds = new Set(overlaySnaps.map((s) => s.id));
  const audioSnapshotIds = new Set(audioOverlaySnaps.map((s) => s.id));

  // Source delta: how much the section's source range changed at the trimmed edge
  const sourceDelta =
    trimEdge === 'left'
      ? section.sourceStart - origSourceStart // positive = shortened, negative = extended
      : section.sourceEnd - origSourceEnd; // negative = shortened, positive = extended
  const durationDelta = section.sourceEnd - section.sourceStart - (origSourceEnd - origSourceStart);

  setTrimDragState(null);
  if (!sourceStartChanged && !sourceEndChanged) {
    undoStack.pop();
    updateUndoRedoButtons();
    return;
  }
  recalculateTimelinePositions();

  // Apply overlay adjustments based on source-delta and alignment rules
  const trimCtx: OverlayTrimContext = {
    trimEdge: trimEdge as 'left' | 'right',
    sourceDelta,
    durationDelta,
    sectionStart: section.start,
    sectionEnd: section.end,
    origSectionStart,
    origSectionEnd
  };

  applyOverlayTrimDelta(editorState.overlays as (Overlay | AudioOverlay)[], overlaySnaps, trimCtx);
  applyOverlayTrimDelta(
    editorState.audioOverlays as (Overlay | AudioOverlay)[],
    audioOverlaySnaps,
    trimCtx
  );

  // Shift non-snapshotted overlays after the trim boundary to close/open gaps
  if (Math.abs(durationDelta) > 0.001) {
    const shiftBoundary = trimEdge === 'right' ? origSectionEnd : origSectionStart;
    for (const o of editorState.overlays) {
      if (snapshotIds.has(o.id)) continue;
      if (o.startTime >= shiftBoundary - 0.01) {
        o.startTime = roundMs(o.startTime + durationDelta);
        o.endTime = roundMs(o.endTime + durationDelta);
      }
    }
    for (const ao of editorState.audioOverlays) {
      if (audioSnapshotIds.has(ao.id)) continue;
      if (ao.startTime >= shiftBoundary - 0.01) {
        ao.startTime = roundMs(ao.startTime + durationDelta);
        ao.endTime = roundMs(ao.endTime + durationDelta);
      }
    }
  }

  syncSectionAnchorKeyframes();
  renderSectionMarkers();
  renderOverlayMarkers();
  renderAudioOverlayMarkers();
  refreshWaveform();
  editorSeek(section.start);
  scheduleProjectSave();
}

export function getMutableCameraKeyframe(): Keyframe | null {
  if (!editorState) return null;

  const selectedSection = getSelectedSection();
  if (selectedSection) {
    return getSectionAnchorKeyframe(selectedSection.id, true);
  }

  const section = findSectionForTime(editorState.currentTime);
  if (section) {
    return getSectionAnchorKeyframe(section.id, true);
  }

  return null;
}

export function toggleCameraVisibility(): void {
  if (!editorState || editorState.rendering) return;
  const target = getMutableCameraKeyframe();
  if (!target) return;
  pushUndo();
  target.pipVisible = !target.pipVisible;
  scheduleProjectSave();
}

export function toggleCameraFullscreen(): void {
  if (!editorState || editorState.rendering) return;
  const target = getMutableCameraKeyframe();
  if (!target) return;
  pushUndo();
  target.cameraFullscreen = !(target.cameraFullscreen || false);
  scheduleProjectSave();
}

export function canvasToEditorCoords(clientX: number, clientY: number): { x: number; y: number } {
  const rect = editorCanvas.getBoundingClientRect();
  const scaleX = CANVAS_W / rect.width;
  const scaleY = CANVAS_H / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

export function seekFromTimeline(e: MouseEvent): void {
  const rect = editorTimeline.getBoundingClientRect();
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  editorSeek(pct * editorState!.duration);
}

export function applyTimelineZoom(newZoom: number, pivotClientX?: number): void {
  const wrapper = editorTimelineWrapper;
  const oldZoom = timelineZoom;
  newZoom = Math.max(1, Math.min(50, newZoom));
  if (newZoom === oldZoom) return;

  const rect = wrapper.getBoundingClientRect();
  const pivotX = pivotClientX !== undefined ? pivotClientX : rect.left + rect.width / 2;
  const pivotFraction = (pivotX - rect.left + wrapper.scrollLeft) / (rect.width * oldZoom);

  setTimelineZoom(newZoom);
  editorTimeline.style.minWidth = newZoom * 100 + '%';

  setWaveformPeaks(computeWaveformPeaksFromCache(Math.round(800 * newZoom)));
  renderWaveform();

  const newContentWidth = rect.width * newZoom;
  wrapper.scrollLeft = pivotFraction * newContentWidth - (pivotX - rect.left);
}

export function scrollTimelineToPlayhead(): void {
  if (!editorState || editorState.duration <= 0 || timelineZoom <= 1) return;
  const wrapper = editorTimelineWrapper;
  const wrapperWidth = wrapper.clientWidth;
  const contentWidth = wrapperWidth * timelineZoom;
  const playheadX = (editorState.currentTime / editorState.duration) * contentWidth;
  const margin = wrapperWidth * 0.2;
  if (playheadX < wrapper.scrollLeft + margin) {
    wrapper.scrollLeft = playheadX - margin;
  } else if (playheadX > wrapper.scrollLeft + wrapperWidth - margin) {
    wrapper.scrollLeft = playheadX - wrapperWidth + margin;
  }
}

export function initScrubDrag(
  scrubEl: HTMLElement | null,
  valueEl: HTMLElement | null,
  inputEl: HTMLInputElement | null
): void {
  if (!inputEl) return;
  const scrubTargets = [scrubEl, valueEl].filter(Boolean) as HTMLElement[];
  for (const target of scrubTargets) {
    target.addEventListener('mousedown', (e: MouseEvent) => {
      if (!editorState || editorState.rendering) return;
      e.preventDefault();
      const startX = e.clientX;
      const startVal = parseFloat(inputEl.value);
      const min = parseFloat(inputEl.min);
      const max = parseFloat(inputEl.max);
      const step = parseFloat(inputEl.step) || 0.01;
      const range = max - min;
      const sensitivity = range / 200;

      const onMove = (e2: MouseEvent) => {
        const dx = e2.clientX - startX;
        const newVal = Math.max(min, Math.min(max, startVal + dx * sensitivity));
        const stepped = Math.round(newVal / step) * step;
        inputEl.value = String(stepped);
        inputEl.dispatchEvent(new Event('input'));
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
        document.body.style.cursor = '';
        inputEl.dispatchEvent(new Event('change'));
      };
      document.body.style.cursor = 'ew-resize';
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    });
  }
}

export function setCropPreset(cropX: number): void {
  if (!editorState || editorState.rendering || editorState.outputMode !== 'reel') return;
  const section = getSelectedSection() || findSectionForTime(editorState.currentTime);
  if (!section) return;
  const anchor = getSectionAnchorKeyframe(section.id, true);
  if (!anchor) return;
  if (Math.abs(clampReelCropX(anchor.reelCropX) - cropX) < 0.001) return;
  pushUndo();
  anchor.reelCropX = cropX;
  scheduleProjectSave();
}
