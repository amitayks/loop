import type {
  Section,
  Keyframe,
  Overlay,
  AudioOverlay,
  PipSnapPoint
} from '../../../shared/types/domain.js';
import {
  generateOverlayId,
  generateAudioOverlayId,
  normalizePipScale
} from '../../../shared/domain/project-fields.js';
import { DEFAULT_PIP_SCALE } from '../../../shared/domain/canvas.js';
import { roundMs } from '../timeline/section-utils.js';
import {
  generateSectionId,
  reindexSections,
  buildSplitAnchorKeyframe
} from '../timeline/keyframe-ops.js';
import { clampSectionPan, clampReelCropX } from '../geometry/section-geometry.js';
import { formatTime } from '../format/format-utils.js';
import { normalizeTranscriptText } from '../transcript/transcript-utils.js';
import {
  editorBgZoomInput,
  editorBgZoomValue,
  editorPipSizeInput,
  editorPipSizeValue,
  editorAutoTrackControl,
  editorAutoTrackToggle,
  editorAutoTrackSmoothInput,
  editorAutoTrackSmoothValue,
  editorSectionMarkers,
  editorSectionTranscriptList,
  editorOverlayList,
  sidebarTabSegments,
  sidebarTabOverlays
} from '../dom/elements.js';
import {
  renderOverlayList,
  renderOverlayMarkers,
  buildVolumeHeartStack
} from '../overlay/overlay.js';
import { renderAudioOverlayMarkers } from '../audio-overlay/audio-overlay.js';
import { getStateAtTime, editorSeek, updateEditorTimeDisplay } from '../editor/transport.js';
import {
  editorState,
  activeProject,
  activeProjectPath,
  proxyStatus,
  sectionZoomDragActive,
  DEFAULT_SECTION_ZOOM,
  setActiveProject,
  setActiveSidebarTab,
  setSectionZoomDragActive
} from '../../state.js';
import { setWorkspaceView } from '../workspace/workspace.js';
import { getMouseTrailForTake } from '../media/take-media.js';
import { refreshWaveform } from '../editor/interactions.js';
import { clampSectionZoom, formatSectionZoom } from '../editor/zoom-crop.js';
import {
  pushUndo,
  scheduleProjectSave,
  persistProjectNow,
  stageTakeIfUnreferenced,
  clearEditorState
} from '../project/project-lifecycle.js';

export function recalculateTimelinePositions(): void {
  if (!editorState || !editorState.sections) return;
  let cursor = 0;
  for (const section of editorState.sections) {
    const duration = section.sourceEnd - section.sourceStart;
    section.start = roundMs(cursor);
    section.end = roundMs(cursor + duration);
    section.duration = roundMs(duration);
    cursor += duration;
  }
  editorState.duration = cursor;
}

export async function toggleSectionSaved(sectionId: string): Promise<void> {
  if (!editorState) return;

  // Check if it's an active section
  const activeSection = editorState.sections.find((s) => s.id === sectionId);
  if (activeSection) {
    pushUndo();
    activeSection.saved = !activeSection.saved;
    renderSectionTranscriptList();
    scheduleProjectSave();
    return;
  }

  // Check if it's a saved+removed section — unsaving removes it entirely
  const savedIndex = editorState.savedSections.findIndex((s) => s.id === sectionId);
  if (savedIndex >= 0) {
    pushUndo();
    const removed = editorState.savedSections.splice(savedIndex, 1)[0]!;
    await stageTakeIfUnreferenced(removed.takeId!);
    renderSectionTranscriptList();
    scheduleProjectSave();
  }
}

export async function readdSavedSection(sectionId: string): Promise<void> {
  if (!editorState) return;
  const savedIndex = editorState.savedSections.findIndex((s) => s.id === sectionId);
  if (savedIndex < 0) return;

  pushUndo();

  const section = editorState.savedSections.splice(savedIndex, 1)[0]!;

  let insertIndex = editorState.sections.length;
  for (let i = 0; i < editorState.sections.length; i++) {
    if (editorState.sections[i]!.start >= section.start) {
      insertIndex = i;
      break;
    }
  }
  editorState.sections.splice(insertIndex, 0, section);

  reindexSections(editorState.sections);
  recalculateTimelinePositions();
  syncSectionAnchorKeyframes();

  const readdedSection = editorState.sections.find((s) => s.id === sectionId);
  renderSectionTranscriptList();
  renderSectionMarkers();
  refreshWaveform();
  editorSeek(readdedSection?.start ?? 0);
  scheduleProjectSave();
}

export function findSectionForTime(time: number): Section | null {
  if (!editorState || !editorState.sections || editorState.sections.length === 0) return null;
  const sections = editorState.sections;
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    const isLast = i === sections.length - 1;
    if (time >= section.start && (time < section.end || (isLast && time <= section.end + 0.001))) {
      return section;
    }
  }
  if (time < sections[0]!.start) return sections[0]!;
  return sections[sections.length - 1]!;
}

export function getSelectedSection(): Section | null {
  if (!editorState || !editorState.sections || editorState.sections.length === 0) return null;
  return (
    editorState.sections.find((section) => section.id === editorState!.selectedSectionId) ||
    editorState.sections[0]!
  );
}

export function getSectionBackgroundZoom(sectionId: string): number {
  if (!editorState || !sectionId) return DEFAULT_SECTION_ZOOM;
  const anchor = editorState.keyframes.find((kf) => kf.sectionId === sectionId);
  return clampSectionZoom(anchor?.backgroundZoom);
}

export function getSectionBackgroundPan(sectionId: string): { x: number; y: number } {
  if (!editorState || !sectionId) return { x: 0, y: 0 };
  const anchor = editorState.keyframes.find((kf) => kf.sectionId === sectionId);
  return {
    x: clampSectionPan(anchor?.backgroundPanX),
    y: clampSectionPan(anchor?.backgroundPanY)
  };
}

export function updateSectionZoomControls(): void {
  if (!editorBgZoomInput || !editorBgZoomValue) return;
  const selectedSection = getSelectedSection();
  const disabled = !editorState || editorState.rendering || !selectedSection;
  const zoom = selectedSection
    ? getSectionBackgroundZoom(selectedSection.id)
    : DEFAULT_SECTION_ZOOM;
  editorBgZoomInput.disabled = disabled;
  editorBgZoomInput.value = String(zoom);
  editorBgZoomValue.textContent = formatSectionZoom(zoom);

  // Update PIP size slider to reflect current section's pipScale
  if (editorPipSizeInput && editorState) {
    const sectionAnchor = selectedSection
      ? getSectionAnchorKeyframe(selectedSection.id, false)
      : null;
    const sectionPipScale = sectionAnchor
      ? normalizePipScale(sectionAnchor.pipScale)
      : editorState.pipScale || DEFAULT_PIP_SCALE;
    editorPipSizeInput.value = String(sectionPipScale);
    if (editorPipSizeValue) editorPipSizeValue.textContent = sectionPipScale.toFixed(2);
  }

  // Update auto-track controls
  if (editorAutoTrackControl && editorState) {
    const sectionAnchor = selectedSection
      ? getSectionAnchorKeyframe(selectedSection.id, false)
      : null;
    const hasMouseData = selectedSection && getMouseTrailForTake(selectedSection.takeId!);
    const showAutoTrack = hasMouseData && zoom > 1.0001;
    editorAutoTrackControl.classList.toggle('hidden', !showAutoTrack);
    editorAutoTrackControl.classList.toggle('flex', !!showAutoTrack);
    if (showAutoTrack && sectionAnchor) {
      const isOn = !!sectionAnchor.autoTrack;
      if (editorAutoTrackToggle) {
        editorAutoTrackToggle.textContent = isOn ? 'Track \u2713' : 'Track';
        editorAutoTrackToggle.style.color = isOn ? '' : '';
        editorAutoTrackToggle.className = `text-xs transition-colors ${isOn ? 'text-emerald-300 font-bold' : 'text-emerald-400 hover:text-emerald-300'}`;
      }
      const sm = sectionAnchor.autoTrackSmoothing || 0.15;
      if (editorAutoTrackSmoothInput) editorAutoTrackSmoothInput.value = String(sm);
      if (editorAutoTrackSmoothValue) editorAutoTrackSmoothValue.textContent = sm.toFixed(2);
    }
  }
}

export function getSectionAnchorKeyframe(sectionId: string, createIfMissing: boolean): Keyframe | null {
  if (!editorState || !sectionId) return null;

  let anchor = editorState.keyframes.find((kf) => kf.sectionId === sectionId);
  if (anchor || !createIfMissing) return anchor || null;

  const section = editorState.sections.find((s) => s.id === sectionId);
  if (!section) return null;

  const fallback = getStateAtTime(section.start);
  anchor = {
    time: section.start,
    pipX: fallback.pipX,
    pipY: fallback.pipY,
    pipVisible: fallback.pipVisible,
    cameraFullscreen: fallback.cameraFullscreen || false,
    backgroundZoom: clampSectionZoom(fallback.backgroundZoom),
    backgroundPanX: clampSectionPan(fallback.backgroundPanX),
    backgroundPanY: clampSectionPan(fallback.backgroundPanY),
    reelCropX: clampReelCropX(fallback.reelCropX),
    pipScale: normalizePipScale(fallback.pipScale),
    pipSnapPoint: (fallback.pipSnapPoint || 'br') as PipSnapPoint,
    autoTrack: !!fallback.autoTrack,
    autoTrackSmoothing: fallback.autoTrackSmoothing || 0.15,
    sectionId: section.id,
    autoSection: true,
    savedLandscape: null,
    savedReel: null
  };
  editorState.keyframes.push(anchor);
  editorState.keyframes.sort((a, b) => a.time - b.time);
  return anchor;
}

export function syncSectionAnchorKeyframes(): void {
  if (!editorState || !editorState.sections || editorState.sections.length === 0) return;

  const manual = editorState.keyframes
    .filter((kf) => !kf.sectionId)
    .map((kf) => ({
      ...kf,
      backgroundZoom: clampSectionZoom(kf.backgroundZoom),
      backgroundPanX: clampSectionPan(kf.backgroundPanX),
      backgroundPanY: clampSectionPan(kf.backgroundPanY)
    }));
  const sectionAnchors: Keyframe[] = editorState.sections.map((section) => {
    const existing = editorState!.keyframes.find((kf) => kf.sectionId === section.id);
    return {
      time: section.start,
      pipX: existing ? existing.pipX : editorState!.defaultPipX,
      pipY: existing ? existing.pipY : editorState!.defaultPipY,
      pipVisible: existing ? existing.pipVisible : true,
      cameraFullscreen: existing ? !!existing.cameraFullscreen : false,
      backgroundZoom: existing ? clampSectionZoom(existing.backgroundZoom) : DEFAULT_SECTION_ZOOM,
      backgroundPanX: existing ? clampSectionPan(existing.backgroundPanX) : 0,
      backgroundPanY: existing ? clampSectionPan(existing.backgroundPanY) : 0,
      reelCropX: existing ? clampReelCropX(existing.reelCropX) : 0,
      pipScale: existing
        ? normalizePipScale(existing.pipScale)
        : editorState!.pipScale || DEFAULT_PIP_SCALE,
      pipSnapPoint: (existing?.pipSnapPoint || 'br') as PipSnapPoint,
      autoTrack: existing ? !!existing.autoTrack : false,
      autoTrackSmoothing: existing?.autoTrackSmoothing || 0.15,
      sectionId: section.id,
      autoSection: true,
      savedLandscape: existing?.savedLandscape ? { ...existing.savedLandscape } : null,
      savedReel: existing?.savedReel ? { ...existing.savedReel } : null
    };
  });

  editorState.keyframes = [...sectionAnchors, ...manual].sort((a, b) => a.time - b.time);

  if (!editorState.sections.some((section) => section.id === editorState!.selectedSectionId)) {
    editorState.selectedSectionId = editorState.sections[0]!.id;
  }
}

export function selectEditorSection(sectionId: string): void {
  if (!editorState || !editorState.sections || editorState.sections.length === 0) return;
  if (!editorState.sections.some((section) => section.id === sectionId)) return;
  commitSectionZoomChange();
  editorState.selectedSectionId = sectionId;
  renderSectionMarkers();
  updateSectionZoomControls();
  updateEditorTimeDisplay();
  scheduleProjectSave();
}

export function applyStyleToFutureSections(): void {
  if (!editorState || !editorState.sections || editorState.sections.length === 0) return;

  const currentSection = getSelectedSection();
  if (!currentSection) return;

  const currentAnchor = getSectionAnchorKeyframe(currentSection.id, true);
  if (!currentAnchor) return;

  const currentIndex = editorState.sections.findIndex((s) => s.id === currentSection.id);
  const futureSections = editorState.sections.slice(currentIndex + 1);
  if (futureSections.length === 0) return;

  pushUndo();

  for (const section of futureSections) {
    const anchor = getSectionAnchorKeyframe(section.id, true);
    if (!anchor) continue;
    anchor.pipX = currentAnchor.pipX;
    anchor.pipY = currentAnchor.pipY;
    anchor.pipVisible = currentAnchor.pipVisible;
    anchor.cameraFullscreen = currentAnchor.cameraFullscreen;
    anchor.backgroundZoom = clampSectionZoom(currentAnchor.backgroundZoom);
    anchor.backgroundPanX = clampSectionPan(currentAnchor.backgroundPanX);
    anchor.backgroundPanY = clampSectionPan(currentAnchor.backgroundPanY);
    anchor.reelCropX = clampReelCropX(currentAnchor.reelCropX);
    anchor.pipScale = normalizePipScale(currentAnchor.pipScale);
    anchor.pipSnapPoint = currentAnchor.pipSnapPoint || 'br';
    anchor.autoTrack = !!currentAnchor.autoTrack;
    anchor.autoTrackSmoothing = currentAnchor.autoTrackSmoothing || 0.15;
    anchor.savedLandscape = currentAnchor.savedLandscape
      ? { ...currentAnchor.savedLandscape }
      : null;
    anchor.savedReel = currentAnchor.savedReel ? { ...currentAnchor.savedReel } : null;
  }

  renderSectionMarkers();
  updateSectionZoomControls();
  editorSeek(editorState.currentTime);
  updateEditorTimeDisplay();
  scheduleProjectSave();
}

export function renderSectionTranscriptList(): void {
  const activeSections = editorState?.sections || [];
  const savedSections = editorState?.savedSections || [];

  if (activeSections.length === 0 && savedSections.length === 0) {
    editorSectionTranscriptList.innerHTML =
      '<div class="text-xs text-neutral-500 px-1">No sections available.</div>';
    return;
  }

  const activeItems = activeSections.map((s) => ({ section: s, isRemoved: false }));
  const savedItems = savedSections.map((s) => ({ section: s, isRemoved: true }));
  const allItems = [...activeItems, ...savedItems].sort((a, b) => {
    const timeDiff = a.section.start - b.section.start;
    if (timeDiff !== 0) return timeDiff;
    if (a.isRemoved !== b.isRemoved) return a.isRemoved ? -1 : 1;
    return 0;
  });

  editorSectionTranscriptList.innerHTML = '';
  for (const { section, isRemoved } of allItems) {
    const selected = !isRemoved && section.id === editorState!.selectedSectionId;
    const transcript = normalizeTranscriptText(section.transcript);

    const row = document.createElement('div');
    row.dataset.sectionId = section.id;
    row.className = `w-full text-left rounded-lg px-3 py-2 transition-all ${selected ? 'bg-neutral-800' : isRemoved ? '' : 'hover:bg-neutral-900 cursor-pointer'}`;

    const meta = document.createElement('div');
    meta.className =
      'text-xs text-neutral-500 font-mono tabular-nums flex items-center justify-between';

    const metaLabel = document.createElement('span');
    if (isRemoved) metaLabel.style.opacity = '0.5';
    metaLabel.textContent = `${section.label} (${formatTime(section.start)} - ${formatTime(section.end)})`;
    meta.appendChild(metaLabel);

    const metaActions = document.createElement('span');
    metaActions.className = 'flex items-center gap-1 ml-2';

    metaActions.appendChild(
      buildVolumeHeartStack({
        id: section.id,
        volume: section.volume,
        saved: section.saved,
        isRemoved,
        onVolumeChange: (newVol) => {
          section.volume = newVol;
          scheduleProjectSave();
        },
        onHeartClick: () => toggleSectionSaved(section.id)
      })
    );

    if (isRemoved) {
      const readdBtn = document.createElement('button');
      readdBtn.type = 'button';
      readdBtn.className = 'hover:text-green-400 transition-colors leading-none flex items-center';
      readdBtn.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
      readdBtn.title = 'Re-add to timeline';
      readdBtn.addEventListener('click', (e: MouseEvent) => {
        e.stopPropagation();
        readdSavedSection(section.id);
      });
      metaActions.appendChild(readdBtn);
    }

    meta.appendChild(metaActions);

    const text = document.createElement('div');
    text.className = `mt-1 text-sm leading-snug ${transcript ? 'text-neutral-300' : 'text-neutral-600 italic'}`;
    if (isRemoved) text.style.opacity = '0.5';
    text.textContent = transcript || 'No transcript captured for this section.';

    row.appendChild(meta);
    row.appendChild(text);

    if (!isRemoved) {
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => {
        selectEditorSection(section.id);
      });
    }

    editorSectionTranscriptList.appendChild(row);
  }
}

// Sidebar tab switching
export function switchSidebarTab(tab: string): void {
  setActiveSidebarTab(tab);
  const isSegments = tab === 'segments';
  if (sidebarTabSegments)
    sidebarTabSegments.className = `flex-1 px-2 py-1 text-xs transition-colors ${isSegments ? 'bg-white text-black' : 'text-neutral-400 hover:text-neutral-200'}`;
  if (sidebarTabOverlays)
    sidebarTabOverlays.className = `flex-1 px-2 py-1 text-xs transition-colors ${!isSegments ? 'bg-indigo-600 text-white' : 'text-neutral-400 hover:text-neutral-200'}`;
  editorSectionTranscriptList.classList.toggle('hidden', !isSegments);
  if (editorOverlayList) editorOverlayList.classList.toggle('hidden', isSegments);
  if (!isSegments) renderOverlayList();
}

export function renderSectionMarkers(): void {
  if (
    !editorState ||
    !editorState.duration ||
    !editorState.sections ||
    editorState.sections.length === 0
  ) {
    editorSectionMarkers.innerHTML = '';
    renderSectionTranscriptList();
    return;
  }

  editorSectionMarkers.innerHTML = '';
  for (const section of editorState.sections) {
    const sectionStart = (section.start / editorState.duration) * 100;
    const sectionWidth = Math.max(
      0.35,
      ((section.end - section.start) / editorState.duration) * 100
    );
    const selected = section.id === editorState.selectedSectionId;
    const baseColor = section.index % 2 === 0 ? 'rgba(23,23,23,0.72)' : 'rgba(38,38,38,0.68)';

    const band = document.createElement('div');
    band.className = 'absolute top-0 bottom-0';
    band.dataset.sectionId = section.id;
    band.style.left = sectionStart + '%';
    band.style.width = sectionWidth + '%';
    band.style.backgroundColor = selected ? 'rgba(255,255,255,0.12)' : baseColor;
    band.style.borderLeft = section.index === 0 ? 'none' : '1px solid rgba(10,10,10,0.9)';
    if (selected) {
      band.style.boxShadow = 'inset 0 0 0 2px rgba(255,255,255,0.3)';
    }
    const transcriptPreview = normalizeTranscriptText(section.transcript);
    band.title = transcriptPreview
      ? `${section.label}: ${formatTime(section.start)} - ${formatTime(section.end)}\n${transcriptPreview}`
      : `${section.label}: ${formatTime(section.start)} - ${formatTime(section.end)}`;
    const label = document.createElement('div');
    label.className = 'absolute text-[10px] font-medium pointer-events-none';
    label.style.left = '6px';
    label.style.top = '50%';
    label.style.transform = 'translateY(-50%)';
    label.style.color = selected ? 'rgba(255,255,255,0.9)' : 'rgba(163,163,163,0.8)';
    label.textContent = String(section.index + 1);
    band.appendChild(label);
    if (selected) {
      const leftHandle = document.createElement('div');
      leftHandle.dataset.trimEdge = 'left';
      leftHandle.dataset.sectionId = section.id;
      leftHandle.style.cssText =
        'position:absolute;top:0;bottom:0;left:0;width:6px;cursor:col-resize;z-index:30;border-left:3px solid rgba(255,255,255,0.5);';
      band.appendChild(leftHandle);
      const rightHandle = document.createElement('div');
      rightHandle.dataset.trimEdge = 'right';
      rightHandle.dataset.sectionId = section.id;
      rightHandle.style.cssText =
        'position:absolute;top:0;bottom:0;right:0;width:6px;cursor:col-resize;z-index:30;border-right:3px solid rgba(255,255,255,0.5);';
      band.appendChild(rightHandle);
    }

    const takeProxy = proxyStatus.get(section.takeId!);
    if (takeProxy && takeProxy.status === 'pending') {
      const pct = Math.round((takeProxy.percent || 0) * 100);
      const proxyBar = document.createElement('div');
      proxyBar.className = 'absolute bottom-0 left-0 pointer-events-none';
      proxyBar.dataset.proxyBar = section.takeId!;
      proxyBar.style.cssText = `height:3px;width:${pct}%;background:rgba(251,191,36,0.85);z-index:10;transition:width 0.3s ease;`;
      proxyBar.title = `Optimizing for editing\u2026 ${pct}%`;
      band.appendChild(proxyBar);
    }

    editorSectionMarkers.appendChild(band);

    if (section.index < editorState.sections.length - 1) {
      const cut = document.createElement('div');
      cut.className = 'absolute top-0 bottom-0 pointer-events-none';
      cut.style.left = `${(section.end / editorState.duration) * 100}%`;
      cut.style.width = '3px';
      cut.style.transform = 'translateX(-1.5px)';
      cut.style.backgroundColor = 'rgba(255,255,255,0.25)';
      editorSectionMarkers.appendChild(cut);
    }
  }
  renderSectionTranscriptList();
  renderOverlayMarkers();
  renderAudioOverlayMarkers();
}

export function remapManualKeyframesAfterSectionDelete(
  keyframes: Keyframe[],
  removedSection: Section
): Keyframe[] {
  const epsilon = 0.001;
  const removedDuration = Math.max(0, Number(removedSection?.end) - Number(removedSection?.start));

  return (Array.isArray(keyframes) ? keyframes : [])
    .filter((keyframe) => !keyframe.sectionId)
    .map((keyframe) => {
      const time = Number(keyframe.time) || 0;
      if (time >= removedSection.start - epsilon && time < removedSection.end - epsilon) {
        return null;
      }

      const nextTime =
        time >= removedSection.end - epsilon ? roundMs(time - removedDuration) : roundMs(time);

      return {
        ...keyframe,
        time: Math.max(0, nextTime)
      };
    })
    .filter((kf): kf is Keyframe => kf !== null)
    .sort((a, b) => a.time - b.time);
}

export function remapOverlaysAfterSectionDelete(
  overlays: Overlay[],
  removedSection: Section
): { kept: Overlay[]; removed: Overlay[] } {
  const epsilon = 0.01;
  const sectionStart = removedSection.start;
  const sectionEnd = removedSection.end;
  const removedDuration = Math.max(0, sectionEnd - sectionStart);
  const MIN_DURATION = 0.1;

  const kept: Overlay[] = [];
  const removed: Overlay[] = [];

  for (const o of overlays) {
    // Phase 1: DELETE — fully within section range
    if (o.startTime >= sectionStart - epsilon && o.endTime <= sectionEnd + epsilon) {
      removed.push(o);
      continue;
    }

    // Phase 2: TRIM — partial overlap
    const overlapsStart =
      o.startTime < sectionStart - epsilon &&
      o.endTime > sectionStart + epsilon &&
      o.endTime <= sectionEnd + epsilon;
    const overlapsEnd =
      o.startTime >= sectionStart - epsilon &&
      o.startTime < sectionEnd - epsilon &&
      o.endTime > sectionEnd + epsilon;
    const spansEntireSection =
      o.startTime < sectionStart - epsilon && o.endTime > sectionEnd + epsilon;

    if (overlapsStart) {
      // Overlay starts before section, ends within — trim endTime to sectionStart
      const isVideoLike = o.mediaType === 'video' || o.mediaType === 'window';
      if (isVideoLike) {
        const originalDuration = o.endTime - o.startTime;
        const trimmedDuration = sectionStart - o.startTime;
        const sourceSpan = o.sourceEnd - o.sourceStart;
        o.sourceEnd = o.sourceStart + (sourceSpan * trimmedDuration) / originalDuration;
      }
      o.endTime = sectionStart;
      if (o.endTime - o.startTime < MIN_DURATION) {
        removed.push(o);
      } else {
        kept.push(o);
      }
    } else if (overlapsEnd) {
      // Overlay starts within section, ends after — trim startTime to sectionEnd, then shift
      const isVideoLike = o.mediaType === 'video' || o.mediaType === 'window';
      if (isVideoLike) {
        const originalDuration = o.endTime - o.startTime;
        const trimAmount = sectionEnd - o.startTime;
        const sourceSpan = o.sourceEnd - o.sourceStart;
        o.sourceStart = o.sourceStart + (sourceSpan * trimAmount) / originalDuration;
      }
      o.startTime = sectionEnd;
      // Then shift (Phase 3 applies)
      o.startTime = roundMs(o.startTime - removedDuration);
      o.endTime = roundMs(o.endTime - removedDuration);
      o.startTime = Math.max(0, o.startTime);
      if (o.endTime - o.startTime < MIN_DURATION) {
        removed.push(o);
      } else {
        kept.push(o);
      }
    } else if (spansEntireSection) {
      // Overlay spans the entire deleted section — shrink by removedDuration
      const isVideoLike = o.mediaType === 'video' || o.mediaType === 'window';
      if (isVideoLike) {
        const originalDuration = o.endTime - o.startTime;
        const sourceSpan = o.sourceEnd - o.sourceStart;
        // Remove the proportion of source corresponding to the deleted section
        const removedProportion = removedDuration / originalDuration;
        const removedSourceDuration = sourceSpan * removedProportion;
        // Shift source content after the cut point
        o.sourceEnd = roundMs(o.sourceEnd - removedSourceDuration);
      }
      o.endTime = roundMs(o.endTime - removedDuration);
      if (o.endTime - o.startTime < MIN_DURATION) {
        removed.push(o);
      } else {
        kept.push(o);
      }
    } else if (o.startTime >= sectionEnd - epsilon) {
      // Phase 3: SHIFT — overlay entirely after the deleted section
      o.startTime = Math.max(0, roundMs(o.startTime - removedDuration));
      o.endTime = roundMs(o.endTime - removedDuration);
      kept.push(o);
    } else {
      // Overlay entirely before the deleted section — no change
      kept.push(o);
    }
  }

  return { kept, removed };
}

export function remapAudioOverlaysAfterSectionDelete(
  audioOverlays: AudioOverlay[],
  removedSection: Section
): { kept: AudioOverlay[]; removed: AudioOverlay[] } {
  const epsilon = 0.01;
  const sectionStart = removedSection.start;
  const sectionEnd = removedSection.end;
  const removedDuration = Math.max(0, sectionEnd - sectionStart);
  const MIN_DURATION = 0.1;

  const kept: AudioOverlay[] = [];
  const removed: AudioOverlay[] = [];

  for (const ao of audioOverlays) {
    // Phase 1: DELETE — fully within section range
    if (ao.startTime >= sectionStart - epsilon && ao.endTime <= sectionEnd + epsilon) {
      removed.push(ao);
      continue;
    }

    // Phase 2: TRIM — partial overlap
    const overlapsStart =
      ao.startTime < sectionStart - epsilon &&
      ao.endTime > sectionStart + epsilon &&
      ao.endTime <= sectionEnd + epsilon;
    const overlapsEnd =
      ao.startTime >= sectionStart - epsilon &&
      ao.startTime < sectionEnd - epsilon &&
      ao.endTime > sectionEnd + epsilon;
    const spansEntireSection =
      ao.startTime < sectionStart - epsilon && ao.endTime > sectionEnd + epsilon;

    if (overlapsStart) {
      // Audio starts before section, ends within — trim endTime
      const originalDuration = ao.endTime - ao.startTime;
      const trimmedDuration = sectionStart - ao.startTime;
      const sourceSpan = ao.sourceEnd - ao.sourceStart;
      ao.sourceEnd = ao.sourceStart + (sourceSpan * trimmedDuration) / originalDuration;
      ao.endTime = sectionStart;
      if (ao.endTime - ao.startTime < MIN_DURATION) {
        removed.push(ao);
      } else {
        kept.push(ao);
      }
    } else if (overlapsEnd) {
      // Audio starts within section, ends after — trim startTime, then shift
      const originalDuration = ao.endTime - ao.startTime;
      const trimAmount = sectionEnd - ao.startTime;
      const sourceSpan = ao.sourceEnd - ao.sourceStart;
      ao.sourceStart = ao.sourceStart + (sourceSpan * trimAmount) / originalDuration;
      ao.startTime = sectionEnd;
      // Shift
      ao.startTime = Math.max(0, roundMs(ao.startTime - removedDuration));
      ao.endTime = roundMs(ao.endTime - removedDuration);
      if (ao.endTime - ao.startTime < MIN_DURATION) {
        removed.push(ao);
      } else {
        kept.push(ao);
      }
    } else if (spansEntireSection) {
      // Audio spans entire deleted section — shrink by removedDuration
      const originalDuration = ao.endTime - ao.startTime;
      const sourceSpan = ao.sourceEnd - ao.sourceStart;
      const removedSourceDuration = sourceSpan * (removedDuration / originalDuration);
      ao.sourceEnd = roundMs(ao.sourceEnd - removedSourceDuration);
      ao.endTime = roundMs(ao.endTime - removedDuration);
      if (ao.endTime - ao.startTime < MIN_DURATION) {
        removed.push(ao);
      } else {
        kept.push(ao);
      }
    } else if (ao.startTime >= sectionEnd - epsilon) {
      // Phase 3: SHIFT — entirely after deleted section
      ao.startTime = Math.max(0, roundMs(ao.startTime - removedDuration));
      ao.endTime = roundMs(ao.endTime - removedDuration);
      kept.push(ao);
    } else {
      // Entirely before — no change
      kept.push(ao);
    }
  }

  return { kept, removed };
}

export async function deleteSelectedSection(): Promise<void> {
  if (!editorState || editorState.rendering) return;
  const selectedSection = getSelectedSection();
  if (!selectedSection) return;

  const selectedIndex = editorState.sections.findIndex(
    (section) => section.id === selectedSection.id
  );
  if (selectedIndex < 0) return;

  pushUndo();

  editorState.sections = editorState.sections.filter(
    (section) => section.id !== selectedSection.id
  );

  if (selectedSection.saved) {
    editorState.savedSections.push({ ...selectedSection });
  } else {
    await stageTakeIfUnreferenced(selectedSection.takeId!);
  }

  // Cascade: remap overlays (delete/trim/shift)
  const overlayResult = remapOverlaysAfterSectionDelete(editorState.overlays, selectedSection);
  editorState.overlays = overlayResult.kept;
  for (const removed of overlayResult.removed) {
    if (removed.saved) {
      editorState.savedOverlays.push(removed);
    } else if (removed.mediaType !== 'window') {
      const stillReferenced =
        editorState.overlays.some((o) => o.mediaPath === removed.mediaPath) ||
        editorState.savedOverlays.some((o) => o.mediaPath === removed.mediaPath);
      if (!stillReferenced && activeProjectPath) {
        window.electronAPI.stageOverlayFile(activeProjectPath, removed.mediaPath).catch(() => {});
      }
    }
  }

  // Cascade: remap audio overlays (delete/trim/shift)
  const audioResult = remapAudioOverlaysAfterSectionDelete(
    editorState.audioOverlays,
    selectedSection
  );
  editorState.audioOverlays = audioResult.kept;
  for (const removed of audioResult.removed) {
    if (removed.saved) {
      editorState.savedAudioOverlays.push(removed);
    } else {
      const stillReferenced =
        editorState.audioOverlays.some((ao) => ao.mediaPath === removed.mediaPath) ||
        editorState.savedAudioOverlays.some((ao) => ao.mediaPath === removed.mediaPath);
      if (!stillReferenced && activeProjectPath) {
        window.electronAPI
          .stageAudioOverlayFile(activeProjectPath, removed.mediaPath)
          .catch(() => {});
      }
    }
  }

  editorState.selectedOverlayId = null;
  editorState.selectedAudioOverlayId = null;

  if (editorState.sections.length === 0 && editorState.savedSections.length === 0) {
    const savedSourceWidth = editorState.sourceWidth || null;
    const savedSourceHeight = editorState.sourceHeight || null;
    clearEditorState();
    if (activeProject) {
      setActiveProject({
        ...activeProject,
        timeline: {
          duration: 0,
          sections: [],
          savedSections: [],
          keyframes: [],
          selectedSectionId: null,
          hasCamera: false,
          sourceWidth: savedSourceWidth,
          sourceHeight: savedSourceHeight
        }
      });
    }
    persistProjectNow();
    setWorkspaceView('recording');
    return;
  }

  const remainingAnchors = editorState.keyframes.filter(
    (kf) => kf.sectionId && kf.sectionId !== selectedSection.id
  );
  const remappedManual = remapManualKeyframesAfterSectionDelete(
    editorState.keyframes,
    selectedSection
  );
  editorState.keyframes = [...remainingAnchors, ...remappedManual];

  reindexSections(editorState.sections);

  recalculateTimelinePositions();
  syncSectionAnchorKeyframes();

  if (editorState.sections.length > 0) {
    const nextSelected =
      editorState.sections[Math.min(selectedIndex, editorState.sections.length - 1)] ||
      editorState.sections[0]!;
    editorState.selectedSectionId = nextSelected?.id || null;
    renderSectionMarkers();
    refreshWaveform();
    editorSeek(nextSelected?.start || 0);
  } else {
    editorState.selectedSectionId = null;
    editorState.duration = 0;
    renderSectionMarkers();
    refreshWaveform();
  }

  renderOverlayMarkers();
  renderAudioOverlayMarkers();
  renderOverlayList();
  renderSectionTranscriptList();
  scheduleProjectSave();
}

export function splitSectionAtPlayhead(): void {
  if (!editorState || editorState.rendering) return;

  const time = editorState.currentTime;
  const section = findSectionForTime(time);
  if (!section) return;

  const MIN_DURATION = 0.1;
  const offsetInSection = time - section.start;
  const sourceTime = roundMs(section.sourceStart + offsetInSection);

  if (
    sourceTime - section.sourceStart < MIN_DURATION ||
    section.sourceEnd - sourceTime < MIN_DURATION
  )
    return;

  pushUndo();

  const sectionIndex = editorState.sections.findIndex((s) => s.id === section.id);
  if (sectionIndex < 0) return;

  const newSectionId = generateSectionId();
  const rightSection: Section = {
    id: newSectionId,
    index: 0,
    label: 'temp',
    start: 0,
    end: 0,
    duration: 0,
    sourceStart: sourceTime,
    sourceEnd: section.sourceEnd,
    takeId: section.takeId,
    transcript: '',
    saved: !!section.saved,
    volume: section.volume ?? 1.0
  };

  section.sourceEnd = sourceTime;
  editorState.sections.splice(sectionIndex + 1, 0, rightSection);

  reindexSections(editorState.sections);

  recalculateTimelinePositions();

  const newAnchor = buildSplitAnchorKeyframe(
    editorState.keyframes,
    section.id,
    newSectionId,
    rightSection.start,
    { pipX: editorState.defaultPipX, pipY: editorState.defaultPipY }
  );
  editorState.keyframes.push(newAnchor as Keyframe);
  editorState.keyframes.sort((a, b) => a.time - b.time);

  editorState.selectedSectionId = newSectionId;

  renderSectionMarkers();
  refreshWaveform();
  editorSeek(editorState.currentTime);
  scheduleProjectSave();
}

export function splitAllAtPlayhead(): void {
  if (!editorState || editorState.rendering) return;
  const time = editorState.currentTime;

  // Split the section at playhead
  splitSectionAtPlayhead();

  // Split every visual overlay that spans the playhead
  for (let i = editorState.overlays.length - 1; i >= 0; i--) {
    const o = editorState.overlays[i]!;
    if (time <= o.startTime + 0.1 || time >= o.endTime - 0.1) continue;
    const splitSourceTime = o.sourceStart + (time - o.startTime);
    const isVideoLike = o.mediaType === 'video' || o.mediaType === 'window';
    const newOverlay: Overlay = {
      id: generateOverlayId(),
      trackIndex: o.trackIndex || 0,
      mediaPath: o.mediaPath,
      mediaType: o.mediaType,
      startTime: time,
      endTime: o.endTime,
      sourceStart: isVideoLike ? splitSourceTime : 0,
      sourceEnd: o.sourceEnd,
      landscape: { ...o.landscape },
      reel: { ...o.reel },
      saved: false,
      ...(o.sourceName ? { sourceName: o.sourceName } : {}),
      ...(o.sourceWidth ? { sourceWidth: o.sourceWidth } : {}),
      ...(o.sourceHeight ? { sourceHeight: o.sourceHeight } : {}),
      ...(o.proxyPath ? { proxyPath: o.proxyPath } : {})
    };
    o.endTime = time;
    if (isVideoLike) {
      o.sourceEnd = splitSourceTime;
    }
    editorState.overlays.splice(i + 1, 0, newOverlay);
  }

  // Split every audio overlay that spans the playhead
  for (let i = editorState.audioOverlays.length - 1; i >= 0; i--) {
    const ao = editorState.audioOverlays[i]!;
    if (time <= ao.startTime + 0.1 || time >= ao.endTime - 0.1) continue;
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
    editorState.audioOverlays.splice(i + 1, 0, newAo);
  }

  renderOverlayMarkers();
  renderAudioOverlayMarkers();
  scheduleProjectSave();
}

export function setSelectedSectionBackgroundZoom(
  nextZoom: unknown,
  opts: { pushHistory?: boolean } = {}
): boolean {
  if (!editorState || editorState.rendering) return false;
  const pushHistory = opts.pushHistory === true;
  const selectedSection = getSelectedSection();
  if (!selectedSection) return false;
  const anchor = getSectionAnchorKeyframe(selectedSection.id, true);
  if (!anchor) return false;
  const normalizedZoom = clampSectionZoom(nextZoom);
  const currentZoom = clampSectionZoom(anchor.backgroundZoom);
  if (Math.abs(normalizedZoom - currentZoom) < 0.0001) {
    updateSectionZoomControls();
    return false;
  }
  if (pushHistory) pushUndo();
  anchor.backgroundZoom = normalizedZoom;
  updateSectionZoomControls();
  return true;
}

export function setSectionBackgroundPan(
  sectionId: string,
  nextPanX: number,
  nextPanY: number
): boolean {
  if (!editorState || editorState.rendering || !sectionId) return false;
  const anchor = getSectionAnchorKeyframe(sectionId, true);
  if (!anchor) return false;
  const normalizedPanX = clampSectionPan(nextPanX);
  const normalizedPanY = clampSectionPan(nextPanY);
  const currentPanX = clampSectionPan(anchor.backgroundPanX);
  const currentPanY = clampSectionPan(anchor.backgroundPanY);
  if (
    Math.abs(normalizedPanX - currentPanX) < 0.0001 &&
    Math.abs(normalizedPanY - currentPanY) < 0.0001
  ) {
    return false;
  }
  anchor.backgroundPanX = normalizedPanX;
  anchor.backgroundPanY = normalizedPanY;
  return true;
}

export function commitSectionZoomChange(): void {
  if (!sectionZoomDragActive) return;
  setSectionZoomDragActive(false);
  scheduleProjectSave();
}
