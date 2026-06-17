import type { AudioOverlay } from '../../../shared/types/domain.js';
import { generateAudioOverlayId } from '../../../shared/domain/project-fields.js';
import {
  editorState,
  activeProjectPath,
  activeSidebarTab,
  audioBufferCache,
  audioOverlayPeakCache,
  audioOverlayTrimDragState,
  setAudioOverlayTrimDragState,
  audioOverlayContext,
  setAudioOverlayContext,
  activeAudioOverlayNodes,
  setActiveAudioOverlayNodes
} from '../../state.js';
import { editorAudioTrack0, editorTimeline } from '../dom/elements.js';
import { formatTime } from '../format/format-utils.js';
import { renderSectionMarkers } from '../section/section-editing.js';
import { pushUndo, scheduleProjectSave } from '../project/project-lifecycle.js';
import { renderOverlayList, renderOverlayMarkers } from '../overlay/overlay.js';

export async function toggleAudioOverlaySaved(audioOverlayId: string): Promise<void> {
  if (!editorState) return;

  const activeAo = editorState.audioOverlays.find((o) => o.id === audioOverlayId);
  if (activeAo) {
    pushUndo();
    activeAo.saved = !activeAo.saved;
    renderOverlayList();
    scheduleProjectSave();
    return;
  }

  const savedAo = editorState.savedAudioOverlays.find((o) => o.id === audioOverlayId);
  if (savedAo) {
    pushUndo();
    const idx = editorState.savedAudioOverlays.indexOf(savedAo);
    editorState.savedAudioOverlays.splice(idx, 1);
    // Check if media file is still referenced
    const stillReferenced =
      editorState.audioOverlays.some((o) => o.mediaPath === savedAo.mediaPath) ||
      editorState.savedAudioOverlays.some((o) => o.mediaPath === savedAo.mediaPath);
    if (!stillReferenced && activeProjectPath) {
      await window.electronAPI
        .stageAudioOverlayFile(activeProjectPath, savedAo.mediaPath)
        .catch(() => {});
    }
    renderOverlayList();
    scheduleProjectSave();
  }
}

export function readdSavedAudioOverlay(audioOverlayId: string): void {
  if (!editorState) return;
  const idx = editorState.savedAudioOverlays.findIndex((o) => o.id === audioOverlayId);
  if (idx < 0) return;
  pushUndo();
  const ao = editorState.savedAudioOverlays.splice(idx, 1)[0]!;
  // Try to place at original position
  const placedStart = placeAudioOverlayAtTime(
    ao.startTime,
    ao.endTime - ao.startTime,
    editorState.duration,
    ao.trackIndex || 0
  );
  if (placedStart !== null) {
    ao.startTime = placedStart;
    ao.endTime = placedStart + (ao.endTime - ao.startTime);
  }
  editorState.audioOverlays.push(ao);
  editorState.audioOverlays.sort((a, b) => a.startTime - b.startTime);
  editorState.selectedAudioOverlayId = ao.id;
  renderAudioOverlayMarkers();
  renderOverlayList();
  scheduleProjectSave();
}

export function selectAudioOverlay(audioOverlayId: string): void {
  if (!editorState) return;
  editorState.selectedAudioOverlayId = audioOverlayId;
  editorState.selectedOverlayId = null;
  editorState.selectedSectionId = null;
  renderAudioOverlayMarkers();
  renderOverlayMarkers();
  renderSectionMarkers();
  if (activeSidebarTab === 'overlays') renderOverlayList();
}

export function renderAudioOverlayMarkers(): void {
  if (!editorAudioTrack0) return;
  editorAudioTrack0.innerHTML = '';
  if (
    !editorState ||
    !editorState.duration ||
    !Array.isArray(editorState.audioOverlays) ||
    editorState.audioOverlays.length === 0
  ) {
    if (activeSidebarTab === 'overlays') renderOverlayList();
    return;
  }

  for (const ao of editorState.audioOverlays) {
    const pctLeft = (ao.startTime / editorState.duration) * 100;
    const pctWidth = Math.max(0.35, ((ao.endTime - ao.startTime) / editorState.duration) * 100);
    const selected = ao.id === editorState.selectedAudioOverlayId;

    const band = document.createElement('div');
    band.className = 'absolute top-0 bottom-0';
    band.dataset.audioOverlayId = ao.id;
    band.style.left = pctLeft + '%';
    band.style.width = pctWidth + '%';
    band.style.backgroundColor = selected ? 'rgba(20,184,166,0.45)' : 'rgba(20,184,166,0.22)';
    band.style.borderRadius = '3px';
    band.style.cursor = 'pointer';
    if (selected) {
      band.style.boxShadow = 'inset 0 0 0 2px rgba(94,234,212,0.6)';
    }

    const fileName = ao.mediaPath.split('/').pop() || '';
    band.title = `\u266B ${fileName}: ${formatTime(ao.startTime)} - ${formatTime(ao.endTime)}`;

    // Waveform canvas
    const peaks = audioOverlayPeakCache.get(ao.mediaPath);
    if (peaks) {
      const waveCanvas = document.createElement('canvas');
      waveCanvas.className = 'absolute inset-0 pointer-events-none';
      waveCanvas.style.cssText = 'width:100%;height:100%;opacity:0.5;';
      band.appendChild(waveCanvas);
      // Defer drawing to next frame so dimensions are available
      requestAnimationFrame(() => {
        const rect = band.getBoundingClientRect();
        waveCanvas.width = Math.max(1, Math.round(rect.width));
        waveCanvas.height = Math.max(1, Math.round(rect.height));
        drawWaveformOnCanvas(
          waveCanvas,
          peaks,
          ao.sourceStart,
          ao.sourceEnd,
          audioBufferCache.get(ao.mediaPath)?.duration || ao.sourceEnd
        );
      });
    } else {
      // Trigger async decode for waveform (will render on next markers refresh)
      decodeAndCacheAudioBuffer(ao.mediaPath).then(() => {
        /* waveform available on next render */
      });
    }

    const label = document.createElement('div');
    label.className = 'absolute text-[9px] font-medium pointer-events-none truncate';
    label.style.cssText = 'left:4px;right:4px;top:50%;transform:translateY(-50%);z-index:1;';
    label.style.color = selected ? 'rgba(167,243,208,0.95)' : 'rgba(94,234,212,0.75)';
    label.textContent = `\u266B ${fileName}`;
    band.appendChild(label);

    if (selected) {
      const leftHandle = document.createElement('div');
      leftHandle.dataset.audioOverlayTrimEdge = 'left';
      leftHandle.dataset.audioOverlayId = ao.id;
      leftHandle.style.cssText =
        'position:absolute;top:0;bottom:0;left:0;width:6px;cursor:col-resize;z-index:30;border-left:3px solid rgba(94,234,212,0.7);';
      band.appendChild(leftHandle);
      const rightHandle = document.createElement('div');
      rightHandle.dataset.audioOverlayTrimEdge = 'right';
      rightHandle.dataset.audioOverlayId = ao.id;
      rightHandle.style.cssText =
        'position:absolute;top:0;bottom:0;right:0;width:6px;cursor:col-resize;z-index:30;border-right:3px solid rgba(94,234,212,0.7);';
      band.appendChild(rightHandle);
    }

    editorAudioTrack0.appendChild(band);
  }
  if (activeSidebarTab === 'overlays') renderOverlayList();
}

export function startAudioOverlayTrimDrag(e: MouseEvent, audioOverlayId: string, edge: string): void {
  const ao = editorState!.audioOverlays.find((o) => o.id === audioOverlayId);
  if (!ao) return;
  pushUndo();
  setAudioOverlayTrimDragState({
    overlayId: audioOverlayId,
    edge,
    startX: e.clientX,
    originalStartTime: ao.startTime,
    originalEndTime: ao.endTime,
    originalSourceStart: ao.sourceStart,
    originalSourceEnd: ao.sourceEnd
  });
  const onMove = (e2: MouseEvent) => updateAudioOverlayTrimDrag(e2);
  const onUp = () => {
    setAudioOverlayTrimDragState(null);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    renderAudioOverlayMarkers();
    scheduleProjectSave();
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

export function updateAudioOverlayTrimDrag(e: MouseEvent): void {
  if (!audioOverlayTrimDragState || !editorState) return;
  const ao = editorState.audioOverlays.find((o) => o.id === audioOverlayTrimDragState!.overlayId);
  if (!ao) return;
  const rect = editorTimeline.getBoundingClientRect();
  const pxPerSec = rect.width / editorState.duration;
  const deltaSec = (e.clientX - audioOverlayTrimDragState.startX) / pxPerSec;
  const sameTrack = editorState.audioOverlays.filter(
    (o) => (o.trackIndex || 0) === (ao.trackIndex || 0)
  );
  const idxInTrack = sameTrack.indexOf(ao);
  const prevEnd = idxInTrack > 0 ? sameTrack[idxInTrack - 1]!.endTime : 0;
  const nextStart =
    idxInTrack < sameTrack.length - 1 ? sameTrack[idxInTrack + 1]!.startTime : editorState.duration;

  if (audioOverlayTrimDragState.edge === 'left') {
    const newStart = Math.max(
      prevEnd,
      Math.min(ao.endTime - 0.1, audioOverlayTrimDragState.originalStartTime + deltaSec)
    );
    const shift = newStart - audioOverlayTrimDragState.originalStartTime;
    ao.startTime = newStart;
    ao.sourceStart = Math.max(0, audioOverlayTrimDragState.originalSourceStart + shift);
  } else {
    const newEnd = Math.min(
      nextStart,
      Math.max(ao.startTime + 0.1, audioOverlayTrimDragState.originalEndTime + deltaSec)
    );
    const shift = newEnd - audioOverlayTrimDragState.originalEndTime;
    ao.endTime = newEnd;
    ao.sourceEnd = Math.max(
      ao.sourceStart + 0.1,
      audioOverlayTrimDragState.originalSourceEnd + shift
    );
  }
  renderAudioOverlayMarkers();
}

export function splitAudioOverlayAtPlayhead(): void {
  if (!editorState || !editorState.selectedAudioOverlayId) return;
  const ao = editorState.audioOverlays.find((o) => o.id === editorState!.selectedAudioOverlayId);
  if (!ao) return;
  const time = editorState.currentTime;
  if (time <= ao.startTime + 0.1 || time >= ao.endTime - 0.1) return;
  pushUndo();

  const splitSourceTime = ao.sourceStart + (time - ao.startTime);
  const newAo: AudioOverlay = {
    id: generateAudioOverlayId(),
    trackIndex: ao.trackIndex || 0,
    mediaPath: ao.mediaPath,
    startTime: time,
    endTime: ao.endTime,
    sourceStart: splitSourceTime,
    sourceEnd: ao.sourceEnd,
    volume: ao.volume,
    saved: false
  };
  ao.endTime = time;
  ao.sourceEnd = splitSourceTime;
  const idx = editorState.audioOverlays.indexOf(ao);
  editorState.audioOverlays.splice(idx + 1, 0, newAo);
  editorState.selectedAudioOverlayId = newAo.id;
  renderAudioOverlayMarkers();
  scheduleProjectSave();
}

export function deleteSelectedAudioOverlay(): void {
  if (!editorState || !editorState.selectedAudioOverlayId) return;
  const idx = editorState.audioOverlays.findIndex(
    (o) => o.id === editorState!.selectedAudioOverlayId
  );
  if (idx < 0) return;
  pushUndo();
  const removed = editorState.audioOverlays.splice(idx, 1)[0]!;
  if (removed.saved) {
    editorState.savedAudioOverlays.push(removed);
  } else {
    const stillReferenced =
      editorState.audioOverlays.some((o) => o.mediaPath === removed.mediaPath) ||
      editorState.savedAudioOverlays.some((o) => o.mediaPath === removed.mediaPath);
    if (!stillReferenced && activeProjectPath) {
      window.electronAPI
        .stageAudioOverlayFile(activeProjectPath, removed.mediaPath)
        .catch(() => {});
    }
  }
  editorState.selectedAudioOverlayId = null;
  renderAudioOverlayMarkers();
  renderOverlayList();
  scheduleProjectSave();
}

export function placeAudioOverlayAtTime(
  targetStart: number,
  duration: number,
  maxTime: number,
  trackIndex = 0,
  excludeId: string | null = null
): number | null {
  const others = editorState!.audioOverlays.filter(
    (o) => o.id !== excludeId && (o.trackIndex || 0) === trackIndex
  );
  const targetEnd = targetStart + duration;
  const collisions = others.filter((o) => o.startTime < targetEnd && o.endTime > targetStart);
  if (collisions.length === 0) {
    return Math.max(0, Math.min(maxTime - duration, targetStart));
  }
  // Find first gap after targetStart
  const sorted = others.sort((a, b) => a.startTime - b.startTime);
  let candidate = targetStart;
  for (const o of sorted) {
    if (candidate + duration <= o.startTime) break;
    candidate = o.endTime;
  }
  if (candidate + duration > maxTime) return null;
  return candidate;
}

export function getAudioOverlayContext(): AudioContext {
  let context = audioOverlayContext;
  if (!context || context.state === 'closed') {
    context = new AudioContext();
    setAudioOverlayContext(context);
  }
  return context;
}

export async function decodeAndCacheAudioBuffer(mediaPath: string): Promise<AudioBuffer | null> {
  if (audioBufferCache.has(mediaPath)) return audioBufferCache.get(mediaPath)!;
  if (!activeProjectPath) return null;
  const fileUrl = window.electronAPI.pathToFileUrl(activeProjectPath + '/' + mediaPath);
  try {
    const response = await fetch(fileUrl);
    const arrayBuffer = await response.arrayBuffer();
    const ctx = getAudioOverlayContext();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    audioBufferCache.set(mediaPath, audioBuffer);
    // Extract peak data for waveform
    extractPeakData(mediaPath, audioBuffer);
    return audioBuffer;
  } catch (err) {
    console.error('Failed to decode audio overlay:', mediaPath, err);
    return null;
  }
}

export function extractPeakData(mediaPath: string, audioBuffer: AudioBuffer): void {
  if (audioOverlayPeakCache.has(mediaPath)) return;
  const channel = audioBuffer.getChannelData(0);
  const numPeaks = Math.min(1000, channel.length);
  const samplesPerPeak = Math.max(1, Math.floor(channel.length / numPeaks));
  const minPeaks = new Float32Array(numPeaks);
  const maxPeaks = new Float32Array(numPeaks);
  for (let i = 0; i < numPeaks; i++) {
    let min = 1;
    let max = -1;
    const start = i * samplesPerPeak;
    const end = Math.min(start + samplesPerPeak, channel.length);
    for (let j = start; j < end; j++) {
      const val = channel[j]!;
      if (val < min) min = val;
      if (val > max) max = val;
    }
    minPeaks[i] = min;
    maxPeaks[i] = max;
  }
  audioOverlayPeakCache.set(mediaPath, { min: minPeaks, max: maxPeaks });
}

export function drawWaveformOnCanvas(
  canvas: HTMLCanvasElement,
  peaks: { min: Float32Array; max: Float32Array },
  sourceStart: number,
  sourceEnd: number,
  totalDuration: number
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  const midY = h / 2;

  // Map source range to peak indices
  const totalPeaks = peaks.min.length;
  const startIdx = Math.floor((sourceStart / totalDuration) * totalPeaks);
  const endIdx = Math.ceil((sourceEnd / totalDuration) * totalPeaks);
  const rangeLen = Math.max(1, endIdx - startIdx);

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(20, 184, 166, 0.6)';
  for (let x = 0; x < w; x++) {
    const peakIdx = startIdx + Math.floor((x / w) * rangeLen);
    const clampedIdx = Math.max(0, Math.min(totalPeaks - 1, peakIdx));
    const minVal = peaks.min[clampedIdx]!;
    const maxVal = peaks.max[clampedIdx]!;
    const top = midY - maxVal * midY;
    const bottom = midY - minVal * midY;
    ctx.fillRect(x, top, 1, Math.max(1, bottom - top));
  }
}

export function startAudioOverlayPlayback(): void {
  stopAudioOverlayPlayback();
  if (!editorState || !editorState.audioOverlays.length) return;
  const ctx = getAudioOverlayContext();
  if (ctx.state === 'suspended') ctx.resume();
  const time = editorState.currentTime;

  for (const ao of editorState.audioOverlays) {
    if (time >= ao.endTime || time < ao.startTime) continue;
    const buffer = audioBufferCache.get(ao.mediaPath);
    if (!buffer) continue;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.value = ao.volume;
    source.connect(gain);
    gain.connect(ctx.destination);

    const offset = ao.sourceStart + (time - ao.startTime);
    const remaining = ao.sourceEnd - offset;
    if (remaining <= 0) continue;
    source.start(0, offset, remaining);
    activeAudioOverlayNodes.push({ source, gain, aoId: ao.id });
  }
}

export function stopAudioOverlayPlayback(): void {
  for (const node of activeAudioOverlayNodes) {
    try {
      node.source.stop();
    } catch (_) {
      /* already stopped */
    }
    try {
      node.source.disconnect();
      node.gain.disconnect();
    } catch (_) {
      /* ok */
    }
  }
  setActiveAudioOverlayNodes([]);
}

export function clearAudioBufferCache(): void {
  audioBufferCache.clear();
  audioOverlayPeakCache.clear();
  stopAudioOverlayPlayback();
  if (audioOverlayContext && audioOverlayContext.state !== 'closed') {
    audioOverlayContext.close().catch(() => {});
    setAudioOverlayContext(null);
  }
}
