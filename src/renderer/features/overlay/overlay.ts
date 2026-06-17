import type { Overlay, AudioOverlay } from '../../../shared/types/domain.js';
import { generateOverlayId, generateAudioOverlayId } from '../../../shared/domain/project-fields.js';
import {
  CANVAS_W,
  CANVAS_H,
  REEL_CANVAS_W,
  REEL_CANVAS_H,
  getContentWidth
} from '../../../shared/domain/canvas.js';
import {
  AUDIO_OVERLAY_EXTENSIONS,
  OVERLAY_IMAGE_EXTS,
  OVERLAY_VIDEO_EXTS,
  activeProjectPath,
  activeSidebarTab,
  editorState,
  overlayImageCache,
  overlayTrackEls,
  overlayTrimDragState,
  overlayVideoCurrentPaths,
  overlayVideoEls,
  preMuteVolumes,
  undoStack,
  setOverlayTrimDragState
} from '../../state.js';
import {
  editorOverlayList,
  editorOverlaySizeControl,
  editorOverlaySizeInput,
  editorOverlaySizeValue,
  editorTimeline
} from '../dom/elements.js';
import { formatTime, hexToRgba, getVolumeSvg } from '../format/format-utils.js';
import { reelCropXToPixelOffset } from '../geometry/section-geometry.js';
import { getStateAtTime, editorSeek } from '../editor/transport.js';
import {
  toggleAudioOverlaySaved,
  readdSavedAudioOverlay,
  selectAudioOverlay,
  renderAudioOverlayMarkers,
  placeAudioOverlayAtTime
} from '../audio-overlay/audio-overlay.js';
import { renderSectionMarkers } from '../section/section-editing.js';
import { pathToFileUrl } from '../media/take-media.js';
import { initScrubDrag } from '../editor/interactions.js';
import {
  pushUndo,
  scheduleProjectSave,
  updateUndoRedoButtons
} from '../project/project-lifecycle.js';

export function getOverlayImageElement(mediaPath: string): HTMLImageElement | null {
  if (overlayImageCache.has(mediaPath)) return overlayImageCache.get(mediaPath)!;
  if (!activeProjectPath) return null;
  const img = new Image();
  img.src = pathToFileUrl(`${activeProjectPath}/${mediaPath}`);
  overlayImageCache.set(mediaPath, img);
  return img;
}

export function getOverlayVideoElement(mediaPath: string, trackIdx = 0): HTMLVideoElement | null {
  if (!overlayVideoEls[trackIdx]) {
    overlayVideoEls[trackIdx] = document.createElement('video');
    overlayVideoEls[trackIdx]!.muted = true;
    overlayVideoEls[trackIdx]!.preload = 'auto';
  }
  if (overlayVideoCurrentPaths[trackIdx] !== mediaPath && activeProjectPath) {
    // Absolute paths (window captures) should not be prefixed with project path
    const isAbsolute = mediaPath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(mediaPath);
    const fullPath = isAbsolute ? mediaPath : `${activeProjectPath}/${mediaPath}`;
    overlayVideoEls[trackIdx]!.src = pathToFileUrl(fullPath);
    overlayVideoCurrentPaths[trackIdx] = mediaPath;
  }
  return overlayVideoEls[trackIdx];
}

export function selectOverlay(overlayId: string): void {
  if (!editorState || !Array.isArray(editorState.overlays)) return;
  if (!editorState.overlays.some((o) => o.id === overlayId)) return;
  editorState.selectedOverlayId = overlayId;
  editorState.selectedAudioOverlayId = null;
  renderOverlayMarkers();
  renderAudioOverlayMarkers();
  renderSectionMarkers();
}

export function updateOverlaySizeControl(): void {
  if (!editorOverlaySizeControl) return;
  const hasSelection = editorState && editorState.selectedOverlayId;
  editorOverlaySizeControl.classList.toggle('hidden', !hasSelection);
  editorOverlaySizeControl.classList.toggle('flex', !!hasSelection);
  if (!hasSelection) return;
  const overlay = editorState!.overlays.find((o) => o.id === editorState!.selectedOverlayId);
  if (!overlay) return;
  const mode: 'reel' | 'landscape' = editorState!.outputMode === 'reel' ? 'reel' : 'landscape';
  const baseW = mode === 'reel' ? REEL_CANVAS_W : CANVAS_W;
  const currentScale = overlay[mode].width / (baseW * 0.4);
  editorOverlaySizeInput.value = String(Math.max(0.05, Math.min(5, currentScale)));
  editorOverlaySizeValue.textContent = `${Math.round(currentScale * 100)}%`;
}

interface VolumeHeartOpts {
  id: string;
  volume: number;
  saved: boolean;
  isRemoved: boolean;
  onVolumeChange: (newVol: number) => void;
  onHeartClick: () => void;
}

export function buildVolumeHeartStack(opts: VolumeHeartOpts): HTMLElement {
  const container = document.createElement('span');
  container.className = 'flex flex-col items-center gap-1';

  // Heart button
  const heartBtn = document.createElement('button');
  heartBtn.type = 'button';
  heartBtn.className = 'hover:text-red-400 transition-colors leading-none flex items-center';
  heartBtn.innerHTML = opts.saved
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
  heartBtn.title = opts.saved ? 'Unsave' : 'Save';
  heartBtn.addEventListener('click', (e: MouseEvent) => {
    e.stopPropagation();
    opts.onHeartClick();
  });
  container.appendChild(heartBtn);

  // Volume row (only for active items)
  if (!opts.isRemoved) {
    const volWrap = document.createElement('span');
    volWrap.className = 'flex items-center gap-1 select-none';

    const volIcon = document.createElement('button');
    volIcon.type = 'button';
    volIcon.className =
      'text-neutral-400 hover:text-neutral-200 transition-colors leading-none flex items-center';
    volIcon.innerHTML = getVolumeSvg(opts.volume);
    volIcon.title = opts.volume > 0 ? 'Mute' : 'Unmute';

    const volValue = document.createElement('span');
    volValue.className =
      'text-xs font-mono tabular-nums text-neutral-300 min-w-[32px] text-right cursor-ew-resize';
    volValue.textContent = opts.volume.toFixed(2);

    const volInput = document.createElement('input');
    volInput.type = 'range';
    volInput.min = '0';
    volInput.max = '1';
    volInput.step = '0.01';
    volInput.value = String(opts.volume);
    volInput.className = 'hidden';

    // Click to toggle mute
    volIcon.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      let newVol: number;
      if (opts.volume > 0) {
        preMuteVolumes.set(opts.id, opts.volume);
        newVol = 0;
      } else {
        newVol = preMuteVolumes.get(opts.id) || 1.0;
        preMuteVolumes.delete(opts.id);
      }
      volInput.value = String(newVol);
      volInput.dispatchEvent(new Event('input'));
      volInput.dispatchEvent(new Event('change'));
    });

    volWrap.appendChild(volIcon);
    volWrap.appendChild(volValue);
    volWrap.appendChild(volInput);
    container.appendChild(volWrap);

    // Drag to scrub on value label
    initScrubDrag(volValue, null, volInput);

    let dragActive = false;
    volInput.addEventListener('input', () => {
      const newVol = Math.max(0, Math.min(1, parseFloat(volInput.value)));
      if (!dragActive) {
        pushUndo();
        dragActive = true;
      }
      opts.volume = newVol;
      volValue.textContent = newVol.toFixed(2);
      volIcon.innerHTML = getVolumeSvg(newVol);
      volIcon.title = newVol > 0 ? 'Mute' : 'Unmute';
      opts.onVolumeChange(newVol);
    });
    volInput.addEventListener('change', () => {
      dragActive = false;
    });
  }

  return container;
}

export function renderOverlayList(): void {
  if (!editorOverlayList) return;
  const activeOverlays = editorState?.overlays || [];
  const savedOverlays = editorState?.savedOverlays || [];
  const activeAudioOverlays = editorState?.audioOverlays || [];
  const savedAudioOverlays = editorState?.savedAudioOverlays || [];

  if (
    activeOverlays.length === 0 &&
    savedOverlays.length === 0 &&
    activeAudioOverlays.length === 0 &&
    savedAudioOverlays.length === 0
  ) {
    editorOverlayList.innerHTML =
      '<div class="text-xs text-neutral-500 px-1">Drop media onto the canvas to add overlays.</div>';
    return;
  }

  const activeItems = activeOverlays.map((o) => ({ overlay: o, isRemoved: false }));
  const savedItems = savedOverlays.map((o) => ({ overlay: o, isRemoved: true }));
  const allItems = [...activeItems, ...savedItems].sort(
    (a, b) => a.overlay.startTime - b.overlay.startTime
  );

  editorOverlayList.innerHTML = '';
  for (const { overlay, isRemoved } of allItems) {
    const selected = !isRemoved && overlay.id === editorState!.selectedOverlayId;
    const fileName = overlay.mediaPath.split('/').pop() || '';
    const icon = overlay.mediaType === 'video' ? '\u25B6' : '\u25A3';

    const row = document.createElement('div');
    row.dataset.overlayId = overlay.id;
    row.className = `w-full text-left rounded-lg px-3 py-2 transition-all ${selected ? 'bg-indigo-900/40' : isRemoved ? '' : 'hover:bg-neutral-900 cursor-pointer'}`;

    const meta = document.createElement('div');
    meta.className =
      'text-xs text-neutral-500 font-mono tabular-nums flex items-center justify-between';

    const metaLabel = document.createElement('span');
    if (isRemoved) metaLabel.style.opacity = '0.5';
    metaLabel.textContent = `${icon} ${formatTime(overlay.startTime)} - ${formatTime(overlay.endTime)}`;
    meta.appendChild(metaLabel);

    const metaActions = document.createElement('span');
    metaActions.className = 'flex items-center gap-1 ml-2';

    const heartBtn = document.createElement('button');
    heartBtn.type = 'button';
    heartBtn.className = 'hover:text-red-400 transition-colors leading-none flex items-center';
    heartBtn.innerHTML = overlay.saved
      ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>'
      : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
    heartBtn.title = overlay.saved ? 'Unsave overlay' : 'Save overlay';
    heartBtn.addEventListener('click', (e: MouseEvent) => {
      e.stopPropagation();
      toggleOverlaySaved(overlay.id);
    });
    metaActions.appendChild(heartBtn);

    if (isRemoved) {
      const readdBtn = document.createElement('button');
      readdBtn.type = 'button';
      readdBtn.className = 'hover:text-green-400 transition-colors leading-none flex items-center';
      readdBtn.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
      readdBtn.title = 'Re-add to timeline';
      readdBtn.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        readdSavedOverlay(overlay.id);
      });
      metaActions.appendChild(readdBtn);
    }

    meta.appendChild(metaActions);

    const text = document.createElement('div');
    text.className = `mt-1 text-sm leading-snug truncate ${isRemoved ? 'text-neutral-600' : 'text-neutral-300'}`;
    if (isRemoved) text.style.opacity = '0.5';
    text.textContent = fileName;

    row.appendChild(meta);
    row.appendChild(text);

    if (!isRemoved) {
      row.addEventListener('click', () => {
        selectOverlay(overlay.id);
        editorSeek(overlay.startTime);
      });
    }

    editorOverlayList.appendChild(row);
  }

  // Audio overlay section
  if (activeAudioOverlays.length > 0 || savedAudioOverlays.length > 0) {
    const header = document.createElement('div');
    header.className =
      'text-[10px] font-semibold text-neutral-500 uppercase tracking-wider px-1 pt-2 pb-1';
    header.textContent = 'Audio';
    editorOverlayList.appendChild(header);

    const audioActiveItems = activeAudioOverlays.map((ao) => ({ ao, isRemoved: false }));
    const audioSavedItems = savedAudioOverlays.map((ao) => ({ ao, isRemoved: true }));
    const allAudioItems = [...audioActiveItems, ...audioSavedItems].sort(
      (a, b) => a.ao.startTime - b.ao.startTime
    );

    for (const { ao, isRemoved } of allAudioItems) {
      const selected = !isRemoved && ao.id === editorState!.selectedAudioOverlayId;
      const fileName = ao.mediaPath.split('/').pop() || '';

      const row = document.createElement('div');
      row.dataset.audioOverlayId = ao.id;
      row.className = `w-full text-left rounded-lg px-3 py-2 transition-all ${selected ? 'bg-teal-900/40' : isRemoved ? '' : 'hover:bg-neutral-900 cursor-pointer'}`;

      const meta = document.createElement('div');
      meta.className =
        'text-xs text-neutral-500 font-mono tabular-nums flex items-center justify-between';

      const metaLabel = document.createElement('span');
      if (isRemoved) metaLabel.style.opacity = '0.5';
      metaLabel.textContent = `\u266B ${formatTime(ao.startTime)} - ${formatTime(ao.endTime)}`;
      meta.appendChild(metaLabel);

      const metaActions = document.createElement('span');
      metaActions.className = 'flex items-center gap-1 ml-2';

      metaActions.appendChild(
        buildVolumeHeartStack({
          id: ao.id,
          volume: ao.volume,
          saved: ao.saved,
          isRemoved,
          onVolumeChange: (newVol) => {
            ao.volume = newVol;
            scheduleProjectSave();
          },
          onHeartClick: () => toggleAudioOverlaySaved(ao.id)
        })
      );

      if (isRemoved) {
        const readdBtn = document.createElement('button');
        readdBtn.type = 'button';
        readdBtn.className =
          'hover:text-green-400 transition-colors leading-none flex items-center';
        readdBtn.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
        readdBtn.title = 'Re-add to timeline';
        readdBtn.addEventListener('click', (e: MouseEvent) => {
          e.stopPropagation();
          readdSavedAudioOverlay(ao.id);
        });
        metaActions.appendChild(readdBtn);
      }

      meta.appendChild(metaActions);

      const text = document.createElement('div');
      text.className = `mt-1 text-sm leading-snug truncate ${isRemoved ? 'text-neutral-600' : 'text-neutral-300'}`;
      if (isRemoved) text.style.opacity = '0.5';
      text.textContent = fileName;

      row.appendChild(meta);
      row.appendChild(text);

      if (!isRemoved) {
        row.addEventListener('click', () => {
          selectAudioOverlay(ao.id);
          editorSeek(ao.startTime);
        });
      }

      editorOverlayList.appendChild(row);
    }
  }
}

export async function toggleOverlaySaved(overlayId: string): Promise<void> {
  if (!editorState) return;

  const activeOverlay = editorState.overlays.find((o) => o.id === overlayId);
  if (activeOverlay) {
    pushUndo();
    activeOverlay.saved = !activeOverlay.saved;
    renderOverlayList();
    scheduleProjectSave();
    return;
  }

  const savedIdx = editorState.savedOverlays.findIndex((o) => o.id === overlayId);
  if (savedIdx >= 0) {
    pushUndo();
    const removed = editorState.savedOverlays.splice(savedIdx, 1)[0]!;
    const stillReferenced =
      editorState.overlays.some((o) => o.mediaPath === removed.mediaPath) ||
      editorState.savedOverlays.some((o) => o.mediaPath === removed.mediaPath);
    if (!stillReferenced && activeProjectPath) {
      await window.electronAPI
        .stageOverlayFile(activeProjectPath, removed.mediaPath)
        .catch(() => {});
    }
    renderOverlayList();
    scheduleProjectSave();
  }
}

export function readdSavedOverlay(overlayId: string): void {
  if (!editorState) return;
  const savedIdx = editorState.savedOverlays.findIndex((o) => o.id === overlayId);
  if (savedIdx < 0) return;

  pushUndo();
  const overlay = editorState.savedOverlays.splice(savedIdx, 1)[0]!;
  overlay.saved = true;

  const duration = overlay.endTime - overlay.startTime;
  const placed = placeOverlayAtTime(
    null,
    overlay.startTime,
    duration,
    editorState.duration,
    overlay.trackIndex || 0
  );
  if (placed !== null) {
    overlay.startTime = placed;
    overlay.endTime = placed + duration;
  }

  editorState.overlays.push(overlay);
  editorState.overlays.sort(
    (a, b) => (a.trackIndex || 0) - (b.trackIndex || 0) || a.startTime - b.startTime
  );
  editorState.selectedOverlayId = overlay.id;
  renderOverlayMarkers();
  renderOverlayList();
  scheduleProjectSave();
}

export function renderOverlayMarkers(): void {
  const TRACK_COLORS = ['#3B82F6', '#22C55E', '#6366F1', '#6366F1'];

  // Clear all 4 tracks
  for (const tel of overlayTrackEls) {
    if (tel) tel.innerHTML = '';
  }

  // Determine which tracks have overlays for visibility toggling
  const tracksWithOverlays = new Set<number>();
  if (editorState && Array.isArray(editorState.overlays)) {
    for (const o of editorState.overlays) {
      tracksWithOverlays.add(o.trackIndex || 0);
    }
  }
  for (let t = 0; t < 4; t++) {
    const el = overlayTrackEls[t];
    if (el) {
      el.classList.toggle('hidden', !tracksWithOverlays.has(t));
    }
  }

  if (
    !editorState ||
    !editorState.duration ||
    !Array.isArray(editorState.overlays) ||
    editorState.overlays.length === 0
  ) {
    updateOverlaySizeControl();
    if (activeSidebarTab === 'overlays') renderOverlayList();
    return;
  }

  for (const overlay of editorState.overlays) {
    const trackIdx = overlay.trackIndex || 0;
    const trackColor = TRACK_COLORS[Math.min(trackIdx, 3)] || '#6366F1';
    const pctLeft = (overlay.startTime / editorState.duration) * 100;
    const pctWidth = Math.max(
      0.35,
      ((overlay.endTime - overlay.startTime) / editorState.duration) * 100
    );
    const selected = overlay.id === editorState.selectedOverlayId;

    const band = document.createElement('div');
    band.className = 'absolute top-0 bottom-0';
    band.dataset.overlayId = overlay.id;
    band.style.left = pctLeft + '%';
    band.style.width = pctWidth + '%';
    band.style.backgroundColor = selected
      ? hexToRgba(trackColor, 0.45)
      : hexToRgba(trackColor, 0.22);
    band.style.borderRadius = '3px';
    band.style.cursor = 'pointer';
    if (selected) {
      band.style.boxShadow = `inset 0 0 0 2px ${hexToRgba(trackColor, 0.6)}`;
    }

    // Label: for window overlays, show sourceName; otherwise filename + icon
    let displayLabel: string;
    let displayTitle: string;
    if (overlay.mediaType === 'window') {
      const wName = overlay.sourceName || 'Window';
      const icon = '\u25A1'; // window icon
      displayLabel = `${icon} ${wName}`;
      displayTitle = `${icon} ${wName}: ${formatTime(overlay.startTime)} - ${formatTime(overlay.endTime)}`;
    } else {
      const fileName = overlay.mediaPath.split('/').pop() || '';
      const icon = overlay.mediaType === 'video' ? '\u25B6' : '\u25A3';
      displayLabel = `${icon} ${fileName}`;
      displayTitle = `${icon} ${fileName}: ${formatTime(overlay.startTime)} - ${formatTime(overlay.endTime)}`;
    }
    band.title = displayTitle;

    const label = document.createElement('div');
    label.className = 'absolute text-[9px] font-medium pointer-events-none truncate';
    label.style.cssText = 'left:4px;right:4px;top:50%;transform:translateY(-50%);';
    label.style.color = selected ? hexToRgba(trackColor, 0.95) : hexToRgba(trackColor, 0.75);
    label.textContent = displayLabel;
    band.appendChild(label);

    if (selected) {
      const leftHandle = document.createElement('div');
      leftHandle.dataset.overlayTrimEdge = 'left';
      leftHandle.dataset.overlayId = overlay.id;
      leftHandle.style.cssText = `position:absolute;top:0;bottom:0;left:0;width:6px;cursor:col-resize;z-index:30;border-left:3px solid ${hexToRgba(trackColor, 0.7)};`;
      band.appendChild(leftHandle);
      const rightHandle = document.createElement('div');
      rightHandle.dataset.overlayTrimEdge = 'right';
      rightHandle.dataset.overlayId = overlay.id;
      rightHandle.style.cssText = `position:absolute;top:0;bottom:0;right:0;width:6px;cursor:col-resize;z-index:30;border-right:3px solid ${hexToRgba(trackColor, 0.7)};`;
      band.appendChild(rightHandle);
    }

    const trackEl = overlayTrackEls[Math.min(trackIdx, 3)] || overlayTrackEls[0]!;
    trackEl.appendChild(band);
  }
  updateOverlaySizeControl();
  if (activeSidebarTab === 'overlays') renderOverlayList();
}

export function startOverlayTrimDrag(e: MouseEvent, overlayId: string, edge: string): void {
  const overlay = editorState!.overlays.find((o) => o.id === overlayId);
  if (!overlay) return;
  pushUndo();
  setOverlayTrimDragState({
    overlayId,
    edge,
    startX: e.clientX,
    originalStartTime: overlay.startTime,
    originalEndTime: overlay.endTime,
    originalSourceStart: overlay.sourceStart,
    originalSourceEnd: overlay.sourceEnd
  });
  const onMove = (e2: MouseEvent) => updateOverlayTrimDrag(e2);
  const onUp = () => {
    setOverlayTrimDragState(null);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    renderOverlayMarkers();
    scheduleProjectSave();
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

export function updateOverlayTrimDrag(e: MouseEvent): void {
  if (!overlayTrimDragState || !editorState) return;
  const overlay = editorState.overlays.find((o) => o.id === overlayTrimDragState!.overlayId);
  if (!overlay) return;
  const rect = editorTimeline.getBoundingClientRect();
  const pxPerSec = rect.width / editorState.duration;
  const deltaSec = (e.clientX - overlayTrimDragState.startX) / pxPerSec;
  const sameTrack = editorState.overlays.filter(
    (o) => (o.trackIndex || 0) === (overlay.trackIndex || 0)
  );
  const idxInTrack = sameTrack.indexOf(overlay);
  const prevEnd = idxInTrack > 0 ? sameTrack[idxInTrack - 1]!.endTime : 0;
  const nextStart =
    idxInTrack < sameTrack.length - 1 ? sameTrack[idxInTrack + 1]!.startTime : editorState.duration;

  const isVideoLikeTrim = overlay.mediaType === 'video' || overlay.mediaType === 'window';
  if (overlayTrimDragState.edge === 'left') {
    const newStart = Math.max(
      prevEnd,
      Math.min(overlay.endTime - 0.1, overlayTrimDragState.originalStartTime + deltaSec)
    );
    const shift = newStart - overlayTrimDragState.originalStartTime;
    overlay.startTime = newStart;
    if (isVideoLikeTrim) {
      overlay.sourceStart = Math.max(0, overlayTrimDragState.originalSourceStart + shift);
    }
  } else {
    const newEnd = Math.min(
      nextStart,
      Math.max(overlay.startTime + 0.1, overlayTrimDragState.originalEndTime + deltaSec)
    );
    const shift = newEnd - overlayTrimDragState.originalEndTime;
    overlay.endTime = newEnd;
    if (isVideoLikeTrim) {
      overlay.sourceEnd = Math.max(
        overlay.sourceStart + 0.1,
        overlayTrimDragState.originalSourceEnd + shift
      );
    }
  }
  renderOverlayMarkers();
}

export function splitOverlayAtPlayhead(): void {
  if (!editorState || !editorState.selectedOverlayId) return;
  const overlay = editorState.overlays.find((o) => o.id === editorState!.selectedOverlayId);
  if (!overlay) return;
  const time = editorState.currentTime;
  if (time <= overlay.startTime + 0.1 || time >= overlay.endTime - 0.1) return;
  pushUndo();

  const splitSourceTime = overlay.sourceStart + (time - overlay.startTime);
  const isVideoLike = overlay.mediaType === 'video' || overlay.mediaType === 'window';
  const newOverlay: Overlay = {
    id: generateOverlayId(),
    trackIndex: overlay.trackIndex || 0,
    mediaPath: overlay.mediaPath,
    mediaType: overlay.mediaType,
    startTime: time,
    endTime: overlay.endTime,
    sourceStart: isVideoLike ? splitSourceTime : 0,
    sourceEnd: overlay.sourceEnd,
    landscape: { ...overlay.landscape },
    reel: { ...overlay.reel },
    saved: false,
    // Preserve window-specific fields
    ...(overlay.sourceName ? { sourceName: overlay.sourceName } : {}),
    ...(overlay.sourceWidth ? { sourceWidth: overlay.sourceWidth } : {}),
    ...(overlay.sourceHeight ? { sourceHeight: overlay.sourceHeight } : {}),
    ...(overlay.proxyPath ? { proxyPath: overlay.proxyPath } : {})
  };
  overlay.endTime = time;
  if (isVideoLike) {
    overlay.sourceEnd = splitSourceTime;
  }
  const idx = editorState.overlays.indexOf(overlay);
  editorState.overlays.splice(idx + 1, 0, newOverlay);
  editorState.selectedOverlayId = newOverlay.id;
  renderOverlayMarkers();
  scheduleProjectSave();
}

export function deleteSelectedOverlay(): void {
  if (!editorState || !editorState.selectedOverlayId) return;
  const idx = editorState.overlays.findIndex((o) => o.id === editorState!.selectedOverlayId);
  if (idx < 0) return;
  pushUndo();
  const removed = editorState.overlays.splice(idx, 1)[0]!;
  if (removed.saved) {
    editorState.savedOverlays.push(removed);
  } else if (removed.mediaType !== 'window') {
    // Window media files are managed by take cleanup, not stageOverlayFile
    const stillReferenced =
      editorState.overlays.some((o) => o.mediaPath === removed.mediaPath) ||
      editorState.savedOverlays.some((o) => o.mediaPath === removed.mediaPath);
    if (!stillReferenced && activeProjectPath) {
      window.electronAPI.stageOverlayFile(activeProjectPath, removed.mediaPath).catch(() => {});
    }
  }
  editorState.selectedOverlayId = null;
  renderOverlayMarkers();
  renderOverlayList();
  scheduleProjectSave();
}

export function placeOverlayAtTime(
  movingId: string | null,
  targetStart: number,
  duration: number,
  maxTime: number,
  trackIndex = 0
): number | null {
  const others = editorState!.overlays.filter(
    (o) => o.id !== movingId && (o.trackIndex || 0) === trackIndex
  );
  const targetEnd = targetStart + duration;

  const collisions = others.filter((o) => o.startTime < targetEnd && o.endTime > targetStart);
  if (collisions.length === 0) {
    const clamped = Math.max(0, Math.min(maxTime - duration, targetStart));
    return clamped;
  }

  for (const collision of collisions) {
    const overlapCenter =
      (Math.max(targetStart, collision.startTime) + Math.min(targetEnd, collision.endTime)) / 2;
    const collisionCenter = (collision.startTime + collision.endTime) / 2;
    const collisionDuration = collision.endTime - collision.startTime;

    if (overlapCenter <= collisionCenter) {
      const newStart = targetEnd;
      if (newStart + collisionDuration <= maxTime) {
        collision.startTime = newStart;
        collision.endTime = newStart + collisionDuration;
      } else {
        const newStartL = targetStart - collisionDuration;
        if (newStartL >= 0) {
          collision.startTime = newStartL;
          collision.endTime = targetStart;
        } else {
          return null;
        }
      }
    } else {
      const newEnd = targetStart;
      const newStartL = newEnd - collisionDuration;
      if (newStartL >= 0) {
        collision.startTime = newStartL;
        collision.endTime = newEnd;
      } else {
        const newStartR = targetEnd;
        if (newStartR + collisionDuration <= maxTime) {
          collision.startTime = newStartR;
          collision.endTime = newStartR + collisionDuration;
        } else {
          return null;
        }
      }
    }
  }

  others.sort((a, b) => a.startTime - b.startTime);
  for (let i = 1; i < others.length; i++) {
    if (others[i]!.startTime < others[i - 1]!.endTime) {
      const dur = others[i]!.endTime - others[i]!.startTime;
      others[i]!.startTime = others[i - 1]!.endTime;
      others[i]!.endTime = others[i]!.startTime + dur;
      if (others[i]!.endTime > maxTime) return null;
    }
  }

  return Math.max(0, Math.min(maxTime - duration, targetStart));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- DragEvent extended with custom track index property
export async function handleOverlayDrop(e: any): Promise<void> {
  e.preventDefault();
  if (!editorState || editorState.rendering || !activeProjectPath) return;
  const file = e.dataTransfer?.files?.[0] as File | undefined;
  if (!file) return;
  const filePath = window.electronAPI.getFilePathFromDrop(file);
  if (!filePath) return;

  const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  const isAudio = AUDIO_OVERLAY_EXTENSIONS.includes(
    ext as (typeof AUDIO_OVERLAY_EXTENSIONS)[number]
  );
  if (isAudio) {
    try {
      const result = await window.electronAPI.importAudioOverlayMedia(activeProjectPath, filePath);
      if (!result || !result.mediaPath) return;
      pushUndo();
      const startTime = editorState.currentTime;
      const audioDuration =
        result.duration > 0 ? result.duration : Math.max(5, editorState.duration - startTime);
      const endTime = Math.min(startTime + audioDuration, editorState.duration);
      const placedStart = placeAudioOverlayAtTime(
        startTime,
        endTime - startTime,
        editorState.duration,
        0
      );
      if (placedStart === null) {
        undoStack.pop();
        updateUndoRedoButtons();
        return;
      }
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
    } catch (err) {
      console.error('Failed to import audio overlay media:', err);
    }
    return;
  }

  const isImage = OVERLAY_IMAGE_EXTS.includes(ext);
  const isVideo = OVERLAY_VIDEO_EXTS.includes(ext);
  if (!isImage && !isVideo) return;

  try {
    const mediaPath = await window.electronAPI.importOverlayMedia(activeProjectPath, filePath);
    const mediaType = isImage ? 'image' : 'video';

    const effectiveW = editorState.outputMode === 'reel' ? REEL_CANVAS_W : CANVAS_W;
    const defaultW = Math.round(effectiveW * (editorState.outputMode === 'reel' ? 0.7 : 0.4));
    let defaultH = Math.round((defaultW * 3) / 4);

    try {
      if (isImage) {
        const dims = await new Promise<{ w: number; h: number } | null>((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
          img.onerror = () => resolve(null);
          img.src = `file://${activeProjectPath}/${mediaPath}`;
        });
        if (dims) {
          defaultH = Math.round((defaultW * dims.h) / dims.w);
        }
      } else if (isVideo) {
        const dims = await new Promise<{ w: number; h: number } | null>((resolve) => {
          const vid = document.createElement('video');
          vid.preload = 'metadata';
          vid.onloadedmetadata = () => resolve({ w: vid.videoWidth, h: vid.videoHeight });
          vid.onerror = () => resolve(null);
          vid.src = `file://${activeProjectPath}/${mediaPath}`;
        });
        if (dims && dims.w > 0) {
          defaultH = Math.round((defaultW * dims.h) / dims.w);
        }
      }
    } catch (_) {
      /* use default aspect */
    }

    const landscapeW = Math.round(CANVAS_W * 0.4);
    const reelW = Math.round(REEL_CANVAS_W * 0.7);
    const aspectH = (w: number) => Math.round(w * (defaultH / defaultW));

    const duration = isVideo ? 5 : 3;
    const sourceStart = 0;

    // Media overlays go to tracks 2-3 (not window tracks 0-1)
    const rawDropTrack: number = e._overlayDropTrackIndex ?? 2;
    const dropTrackIndex = rawDropTrack < 2 ? 2 : rawDropTrack;

    pushUndo();
    const placedStart = placeOverlayAtTime(
      null,
      editorState.currentTime,
      duration,
      editorState.duration,
      dropTrackIndex
    );
    if (placedStart === null) {
      undoStack.pop();
      updateUndoRedoButtons();
      return;
    }
    const startTime = placedStart;
    const endTime = startTime + duration;
    const sourceEnd = endTime - startTime;

    const overlay: Overlay = {
      id: generateOverlayId(),
      trackIndex: dropTrackIndex,
      mediaPath,
      mediaType: mediaType as 'image' | 'video',
      startTime,
      endTime,
      sourceStart,
      sourceEnd,
      landscape: {
        x: Math.round((CANVAS_W - landscapeW) / 2),
        y: Math.round((CANVAS_H - aspectH(landscapeW)) / 2),
        width: landscapeW,
        height: aspectH(landscapeW)
      },
      reel: {
        x: Math.round((REEL_CANVAS_W - reelW) / 2),
        y: Math.round((REEL_CANVAS_H - aspectH(reelW)) / 2),
        width: reelW,
        height: aspectH(reelW)
      },
      saved: false
    };
    editorState.overlays.push(overlay);
    editorState.overlays.sort(
      (a, b) => (a.trackIndex || 0) - (b.trackIndex || 0) || a.startTime - b.startTime
    );
    editorState.selectedOverlayId = overlay.id;
    renderOverlayMarkers();
    scheduleProjectSave();
  } catch (err) {
    console.error('Failed to import overlay media:', err);
  }
}

export function centerSelectedOverlay(): void {
  if (!editorState || editorState.rendering || !editorState.selectedOverlayId) return;
  const overlay = editorState.overlays.find((o) => o.id === editorState!.selectedOverlayId);
  if (!overlay) return;
  pushUndo();
  const mode: 'reel' | 'landscape' = editorState.outputMode === 'reel' ? 'reel' : 'landscape';
  const pos = overlay[mode];
  if (mode === 'reel') {
    // Overlay positions are in landscape canvas space; center within the reel crop area
    const kf = getStateAtTime(editorState.currentTime);
    const cw = getContentWidth(
      editorState.sourceWidth,
      editorState.sourceHeight,
      editorState.screenFitMode as 'fit' | 'fill',
      CANVAS_W,
      CANVAS_H
    );
    const cropOffset = reelCropXToPixelOffset(kf.reelCropX, kf.backgroundZoom, cw);
    pos.x = Math.round(cropOffset + (REEL_CANVAS_W - pos.width) / 2);
  } else {
    pos.x = Math.round((CANVAS_W - pos.width) / 2);
  }
  pos.y = Math.round((CANVAS_H - pos.height) / 2);
  scheduleProjectSave();
}
