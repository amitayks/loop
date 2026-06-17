import {
  activeProject,
  activeProjectPath,
  activeProjectSession,
  backgroundImagePath,
  editorState,
  hideFromRecording,
  mouseTrailCache,
  overlayImageCache,
  overlayVideoCurrentPaths,
  overlayVideoEls,
  persistQueue,
  proxyStatus,
  redoStack,
  saveDebounceTimer,
  undoStack,
  MAX_UNDO,
  setActiveProject,
  setActiveProjectPath,
  setActiveProjectSession,
  setEditorState,
  setHideFromRecording,
  setPersistQueue,
  setSaveDebounceTimer,
  setSaveFolder,
  setWaveformPeaks
} from '../../state.js';
import type { TimelineSnapshot } from '../../state.js';
import {
  cameraSyncOffsetInput,
  editorRedoBtn,
  editorUndoBtn,
  exportAudioPresetSelect,
  folderPathEl,
  lastProjectName,
  lastProjectPath,
  lastProjectRow,
  openFolderBtn,
  projectHomeMessage,
  recentProjectsList,
  resumeLastBtn,
  screenFitSelect
} from '../dom/elements.js';
import { DEFAULT_PIP_SCALE, PIP_MARGIN } from '../../../shared/domain/canvas.js';
import {
  normalizeExportAudioPreset,
  normalizePipScale
} from '../../../shared/domain/project-fields.js';
import type { Project, ProjectTimeline, Take } from '../../../shared/types/domain.js';
import type { RecentProjectsResult, RecoveryTake } from '../../../shared/types/services.js';
import { normalizeCameraSyncOffsetMs } from '../timeline/camera-sync.js';
import { computePipSize } from '../geometry/pip-geometry.js';
import { clampSectionPan, clampReelCropX } from '../geometry/section-geometry.js';
import { getEffectiveCanvasDimensions } from '../drawing/compositing.js';
import { formatProjectDate } from '../format/format-utils.js';
import {
  recalculateTimelinePositions,
  renderSectionMarkers,
  renderSectionTranscriptList,
  syncSectionAnchorKeyframes,
  updateSectionZoomControls
} from '../section/section-editing.js';
import { cancelEditorDrawLoop, editorPause, editorSeek } from '../editor/transport.js';
import { clearAudioBufferCache } from '../audio-overlay/audio-overlay.js';
import { recoverPendingTake } from '../recording/recording.js';
import { enterEditor } from '../../app.js';
import { cleanupVideoPool, syncContentProtection } from '../media/take-media.js';
import { setWorkspaceView, updateWorkspaceHeader } from '../workspace/workspace.js';
import { loadBackgroundFromPath } from '../background/background-image.js';
import { refreshWaveform, renderWaveform } from '../editor/interactions.js';
import { clampSectionZoom, updateOutputModeUI } from '../editor/zoom-crop.js';

export function getActiveProjectSession(): { id: number; projectPath: string } {
  return {
    id: activeProjectSession,
    projectPath: activeProjectPath
  };
}

export function matchesActiveProjectSession(session: { id: number; projectPath: string }): boolean {
  return (
    !!session && session.id === activeProjectSession && session.projectPath === activeProjectPath
  );
}

export function getProjectTimelineSnapshot(): ProjectTimeline {
  if (!editorState) {
    return (
      activeProject?.timeline || {
        duration: 0,
        sections: [],
        savedSections: [],
        keyframes: [],
        selectedSectionId: null,
        hasCamera: false,
        sourceWidth: null,
        sourceHeight: null,
        overlays: [],
        savedOverlays: [],
        audioOverlays: [],
        savedAudioOverlays: [],
        backgroundImagePath: null
      }
    );
  }

  return {
    duration: Number(editorState.duration) || 0,
    sections: Array.isArray(editorState.sections)
      ? editorState.sections.map((section) => ({ ...section }))
      : [],
    savedSections: Array.isArray(editorState.savedSections)
      ? editorState.savedSections.map((section) => ({ ...section }))
      : [],
    keyframes: Array.isArray(editorState.keyframes)
      ? editorState.keyframes.map((kf) => ({
          ...kf,
          backgroundZoom: clampSectionZoom(kf.backgroundZoom),
          backgroundPanX: clampSectionPan(kf.backgroundPanX),
          backgroundPanY: clampSectionPan(kf.backgroundPanY),
          reelCropX: clampReelCropX(kf.reelCropX),
          pipScale: normalizePipScale(kf.pipScale)
        }))
      : [],
    selectedSectionId: editorState.selectedSectionId || null,
    hasCamera: !!editorState.hasCamera,
    sourceWidth: editorState.sourceWidth || null,
    sourceHeight: editorState.sourceHeight || null,
    overlays: Array.isArray(editorState.overlays)
      ? editorState.overlays.map((o) => ({
          ...o,
          landscape: { ...o.landscape },
          reel: { ...o.reel }
        }))
      : [],
    savedOverlays: Array.isArray(editorState.savedOverlays)
      ? editorState.savedOverlays.map((o) => ({
          ...o,
          landscape: { ...o.landscape },
          reel: { ...o.reel }
        }))
      : [],
    audioOverlays: Array.isArray(editorState.audioOverlays)
      ? editorState.audioOverlays.map((ao) => ({ ...ao }))
      : [],
    savedAudioOverlays: Array.isArray(editorState.savedAudioOverlays)
      ? editorState.savedAudioOverlays.map((ao) => ({ ...ao }))
      : [],
    backgroundImagePath: backgroundImagePath
  };
}

function buildProjectSavePayload(): unknown {
  if (!activeProject) return null;
  return {
    ...activeProject,
    settings: {
      screenFitMode: screenFitSelect.value || 'fill',
      hideFromRecording: hideFromRecording === 'true',
      exportAudioPreset: normalizeExportAudioPreset(exportAudioPresetSelect.value),
      cameraSyncOffsetMs: normalizeCameraSyncOffsetMs(cameraSyncOffsetInput.value),
      outputMode: editorState?.outputMode || 'landscape',
      pipScale: editorState?.pipScale || DEFAULT_PIP_SCALE
    },
    timeline: getProjectTimelineSnapshot()
  };
}

export async function persistProjectNow(): Promise<void> {
  if (!activeProjectPath || !activeProject) return;
  const expectedProjectPath = activeProjectPath;
  const payload = buildProjectSavePayload();
  if (!payload) return;

  setPersistQueue(
    persistQueue
      .then(async () => {
        const result = await window.electronAPI.projectSave({
          projectPath: expectedProjectPath,
          project: payload
        });
        if (result?.projectPath && result?.project && activeProjectPath === expectedProjectPath) {
          setActiveProjectPath(result.projectPath);
          setActiveProject(result.project);
          setSaveFolder(activeProjectPath);
          folderPathEl.textContent = activeProjectPath;
          openFolderBtn.classList.toggle('hidden', !activeProjectPath);
          updateWorkspaceHeader();
          await window.electronAPI.projectSetLast(expectedProjectPath);
        }
      })
      .catch((error: unknown) => {
        console.error('Failed to persist project:', error);
      })
  );

  await persistQueue;
}

export async function saveRecoveryTake(take: unknown): Promise<void> {
  if (!activeProjectPath || !(take as RecoveryTake)?.screenPath) return;
  try {
    await window.electronAPI.projectSetRecoveryTake({
      projectPath: activeProjectPath,
      take
    });
  } catch (error) {
    console.error('Failed to save recovery take:', error);
  }
}

export async function completeRecoveryTake(projectPath = activeProjectPath): Promise<void> {
  if (!projectPath) return;
  try {
    await window.electronAPI.projectCompleteRecoveryTake(projectPath);
  } catch (error) {
    console.error('Failed to finalize recovery take:', error);
  }
}

export function scheduleProjectSave(): void {
  if (!activeProjectPath || !activeProject) return;
  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  setSaveDebounceTimer(
    setTimeout(() => {
      persistProjectNow().catch((error: unknown) => {
        console.error('Failed to save project:', error);
      });
    }, 250)
  );
}

export async function flushScheduledProjectSave(): Promise<void> {
  if (saveDebounceTimer) {
    clearTimeout(saveDebounceTimer);
    setSaveDebounceTimer(null);
  }
  await persistProjectNow();
}

export function clearEditorState(): void {
  editorPause();
  cancelEditorDrawLoop();

  cleanupVideoPool();
  // Clean up overlay media state
  overlayImageCache.clear();
  mouseTrailCache.clear();
  for (let t = 0; t < overlayVideoEls.length; t++) {
    if (overlayVideoEls[t]) {
      overlayVideoEls[t]!.pause();
      overlayVideoEls[t]!.removeAttribute('src');
      overlayVideoEls[t]!.load();
      overlayVideoEls[t] = null;
    }
    overlayVideoCurrentPaths[t] = null;
  }
  setEditorState(null);
  proxyStatus.clear();
  undoStack.length = 0;
  redoStack.length = 0;
  setWaveformPeaks(null);
  clearAudioBufferCache();
  renderWaveform();
  renderSectionMarkers();
  updateSectionZoomControls();
  updateWorkspaceHeader();
  updateUndoRedoButtons();
}

function isTakeReferenced(takeId: string): boolean {
  if (!editorState || !takeId) return false;
  return (
    editorState.sections.some((s) => s.takeId === takeId) ||
    editorState.savedSections.some((s) => s.takeId === takeId)
  );
}

export async function stageTakeIfUnreferenced(takeId: string): Promise<void> {
  if (!takeId || !activeProjectPath || !activeProject) return;
  if (isTakeReferenced(takeId)) return;
  const take = activeProject.takes?.find((t: Take) => t.id === takeId);
  if (!take) return;
  const filePaths = [take.screenPath, take.cameraPath, take.mousePath, take.proxyPath].filter(
    Boolean
  ) as string[];
  if (Array.isArray(take.windowPaths)) {
    for (const wp of take.windowPaths) {
      if (wp.path) filePaths.push(wp.path);
      if (wp.proxyPath) filePaths.push(wp.proxyPath);
    }
  }
  if (filePaths.length > 0) {
    await window.electronAPI.stageTakeFiles(activeProjectPath, filePaths);
  }
}

async function unstageTakeById(takeId: string): Promise<void> {
  if (!takeId || !activeProjectPath || !activeProject) return;
  const take = activeProject.takes?.find((t: Take) => t.id === takeId);
  if (!take) return;
  const allPaths = [take.screenPath, take.cameraPath, take.mousePath, take.proxyPath] as (
    | string
    | null
  )[];
  if (Array.isArray(take.windowPaths)) {
    for (const wp of take.windowPaths) {
      if (wp.path) allPaths.push(wp.path);
      if (wp.proxyPath) allPaths.push(wp.proxyPath);
    }
  }
  const fileNames = allPaths.filter(Boolean).map((p) => {
    const parts = (p as string).split(/[/\\]/);
    return parts[parts.length - 1]!;
  });
  if (fileNames.length > 0) {
    await window.electronAPI.unstageTakeFiles(activeProjectPath, fileNames);
  }
}

function snapshotTimeline(): TimelineSnapshot {
  return {
    sections: editorState!.sections.map((s) => ({ ...s })),
    savedSections: editorState!.savedSections.map((s) => ({ ...s })),
    keyframes: editorState!.keyframes.map((kf) => ({ ...kf })),
    overlays: editorState!.overlays.map((o) => ({
      ...o,
      landscape: { ...o.landscape },
      reel: { ...o.reel }
    })),
    savedOverlays: editorState!.savedOverlays.map((o) => ({
      ...o,
      landscape: { ...o.landscape },
      reel: { ...o.reel }
    })),
    selectedOverlayId: editorState!.selectedOverlayId,
    audioOverlays: editorState!.audioOverlays.map((ao) => ({ ...ao })),
    savedAudioOverlays: editorState!.savedAudioOverlays.map((ao) => ({ ...ao })),
    selectedAudioOverlayId: editorState!.selectedAudioOverlayId,
    selectedSectionId: editorState!.selectedSectionId,
    duration: editorState!.duration,
    outputMode: editorState!.outputMode
  };
}

async function restoreSnapshot(snapshot: TimelineSnapshot): Promise<void> {
  // Capture current take references before restore
  const beforeTakeIds = new Set<string>();
  for (const s of editorState!.sections) if (s.takeId) beforeTakeIds.add(s.takeId);
  for (const s of editorState!.savedSections) if (s.takeId) beforeTakeIds.add(s.takeId);
  // Capture current overlay media references before restore
  const beforeOverlayPaths = new Set<string>();
  for (const o of editorState!.overlays) if (o.mediaPath) beforeOverlayPaths.add(o.mediaPath);
  const beforeAudioOverlayPaths = new Set<string>();
  for (const ao of editorState!.audioOverlays)
    if (ao.mediaPath) beforeAudioOverlayPaths.add(ao.mediaPath);

  editorState!.sections = snapshot.sections;
  editorState!.savedSections = snapshot.savedSections || [];
  editorState!.keyframes = snapshot.keyframes;
  editorState!.overlays = snapshot.overlays || [];
  editorState!.savedOverlays = snapshot.savedOverlays || [];
  editorState!.selectedOverlayId = snapshot.selectedOverlayId || null;
  editorState!.audioOverlays = snapshot.audioOverlays || [];
  editorState!.savedAudioOverlays = snapshot.savedAudioOverlays || [];
  editorState!.selectedAudioOverlayId = snapshot.selectedAudioOverlayId || null;
  editorState!.selectedSectionId = snapshot.selectedSectionId;
  editorState!.duration = snapshot.duration;
  if (snapshot.outputMode) {
    editorState!.outputMode = snapshot.outputMode;
    const { w, h } = getEffectiveCanvasDimensions();
    const defaultPs = editorState!.pipScale || DEFAULT_PIP_SCALE;
    editorState!.pipSize = computePipSize(defaultPs, w);
    editorState!.defaultPipX = w - editorState!.pipSize - PIP_MARGIN;
    editorState!.defaultPipY = h - editorState!.pipSize - PIP_MARGIN;
    updateOutputModeUI();
  }

  // Compute take references after restore
  const afterTakeIds = new Set<string>();
  for (const s of editorState!.sections) if (s.takeId) afterTakeIds.add(s.takeId);
  for (const s of editorState!.savedSections) if (s.takeId) afterTakeIds.add(s.takeId);

  for (const takeId of beforeTakeIds) {
    if (!afterTakeIds.has(takeId)) {
      await stageTakeIfUnreferenced(takeId);
    }
  }
  for (const takeId of afterTakeIds) {
    if (!beforeTakeIds.has(takeId)) {
      await unstageTakeById(takeId);
    }
  }

  const afterOverlayPaths = new Set<string>();
  for (const o of editorState!.overlays) if (o.mediaPath) afterOverlayPaths.add(o.mediaPath);
  if (activeProjectPath) {
    for (const mediaPath of beforeOverlayPaths) {
      if (!afterOverlayPaths.has(mediaPath)) {
        await window.electronAPI.stageOverlayFile(activeProjectPath, mediaPath).catch(() => {});
      }
    }
    for (const mediaPath of afterOverlayPaths) {
      if (!beforeOverlayPaths.has(mediaPath)) {
        await window.electronAPI.unstageOverlayFile(activeProjectPath, mediaPath).catch(() => {});
      }
    }
  }

  // Audio overlay file staging on undo/redo
  const afterAudioOverlayPaths = new Set<string>();
  for (const ao of editorState!.audioOverlays)
    if (ao.mediaPath) afterAudioOverlayPaths.add(ao.mediaPath);
  if (activeProjectPath) {
    for (const mediaPath of beforeAudioOverlayPaths) {
      if (!afterAudioOverlayPaths.has(mediaPath)) {
        await window.electronAPI
          .stageAudioOverlayFile(activeProjectPath, mediaPath)
          .catch(() => {});
      }
    }
    for (const mediaPath of afterAudioOverlayPaths) {
      if (!beforeAudioOverlayPaths.has(mediaPath)) {
        await window.electronAPI
          .unstageAudioOverlayFile(activeProjectPath, mediaPath)
          .catch(() => {});
      }
    }
  }

  recalculateTimelinePositions();
  syncSectionAnchorKeyframes();
  renderSectionMarkers();
  renderSectionTranscriptList();
  updateSectionZoomControls();
  refreshWaveform();
  editorSeek(Math.min(editorState!.currentTime, editorState!.duration));
  updateUndoRedoButtons();
  scheduleProjectSave();
}

export function pushUndo(): void {
  if (!editorState) return;
  undoStack.push(snapshotTimeline());
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
  updateUndoRedoButtons();
}

export async function editorUndo(): Promise<void> {
  if (!editorState || editorState.rendering || undoStack.length === 0) return;
  redoStack.push(snapshotTimeline());
  await restoreSnapshot(undoStack.pop()!);
}

export async function editorRedo(): Promise<void> {
  if (!editorState || editorState.rendering || redoStack.length === 0) return;
  undoStack.push(snapshotTimeline());
  await restoreSnapshot(redoStack.pop()!);
}

export function updateUndoRedoButtons(): void {
  editorUndoBtn.disabled = undoStack.length === 0;
  editorRedoBtn.disabled = redoStack.length === 0;
}

function renderRecentProjects(meta: RecentProjectsResult): void {
  const projects = Array.isArray(meta?.projects) ? meta.projects : [];
  const lastPath = meta?.lastProjectPath || '';

  recentProjectsList.innerHTML = '';
  if (projects.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'text-sm text-neutral-600 py-2';
    empty.textContent = 'No recent projects yet.';
    recentProjectsList.appendChild(empty);
  } else {
    for (const project of projects) {
      const btn = document.createElement('button');
      btn.className =
        'w-full text-left bg-neutral-900 border border-neutral-800 rounded-lg px-4 py-3 hover:bg-neutral-800 hover:border-neutral-700 transition-all';
      btn.type = 'button';
      btn.dataset.projectPath = project.projectPath;

      const title = document.createElement('div');
      title.className = 'text-sm text-neutral-100 truncate font-medium';
      title.textContent = project.name || 'Untitled Project';
      const subtitle = document.createElement('div');
      subtitle.className = 'text-xs text-neutral-500 truncate mt-0.5';
      subtitle.textContent = `${project.projectPath} • ${formatProjectDate(project.updatedAt)}`;
      btn.appendChild(title);
      btn.appendChild(subtitle);
      recentProjectsList.appendChild(btn);
    }
  }

  const last =
    projects.find((project: { projectPath: string }) => project.projectPath === lastPath) ||
    projects[0];
  if (last) {
    lastProjectName.textContent = last.name || 'Untitled Project';
    lastProjectPath.textContent = last.projectPath;
    resumeLastBtn.dataset.projectPath = last.projectPath;
    lastProjectRow.classList.remove('hidden');
  } else {
    lastProjectRow.classList.add('hidden');
    resumeLastBtn.dataset.projectPath = '';
  }
}

export function clearProjectHomeMessage(): void {
  projectHomeMessage.textContent = '';
  projectHomeMessage.className = 'hidden rounded border px-3 py-2 text-sm';
}

export function showProjectHomeMessage(message: string, tone = 'error'): void {
  if (!message) {
    clearProjectHomeMessage();
    return;
  }

  const toneClass =
    tone === 'info'
      ? 'border-blue-500/40 bg-blue-500/10 text-blue-200'
      : 'border-red-500/40 bg-red-500/10 text-red-200';

  projectHomeMessage.textContent = message;
  projectHomeMessage.className = `rounded border px-3 py-2 text-sm ${toneClass}`;
}

export async function refreshRecentProjects(): Promise<void> {
  try {
    const recent = await window.electronAPI.projectListRecent(8);
    renderRecentProjects(recent || { projects: [], lastProjectPath: null });
  } catch (error) {
    console.error('Failed to list recent projects:', error);
    renderRecentProjects({ projects: [], lastProjectPath: null });
  }
}

export async function activateProject(
  projectPath: string,
  project: Project,
  preferredView = 'recording'
): Promise<void> {
  if (!projectPath || !project) return;

  await flushScheduledProjectSave();
  try {
    await window.electronAPI.cleanupDeleted(projectPath);
  } catch (_e) {
    /* best effort */
  }
  clearEditorState();
  setActiveProjectSession(activeProjectSession + 1);

  setActiveProjectPath(projectPath);
  setActiveProject(project);
  setSaveFolder(projectPath);
  folderPathEl.textContent = projectPath;
  openFolderBtn.classList.remove('hidden');
  screenFitSelect.value = project.settings?.screenFitMode === 'fit' ? 'fit' : 'fill';
  setHideFromRecording(project.settings?.hideFromRecording === false ? 'false' : 'true');
  exportAudioPresetSelect.value = normalizeExportAudioPreset(project.settings?.exportAudioPreset);
  cameraSyncOffsetInput.value = String(
    normalizeCameraSyncOffsetMs(project.settings?.cameraSyncOffsetMs)
  );
  await syncContentProtection();

  if (
    project.timeline &&
    Array.isArray(project.timeline.sections) &&
    project.timeline.sections.length > 0
  ) {
    enterEditor(project.timeline.sections, {
      duration: project.timeline.duration || 0,
      keyframes: project.timeline.keyframes || [],
      savedSections: project.timeline.savedSections || [],
      selectedSectionId: project.timeline.selectedSectionId || null,
      hasCamera: !!project.timeline.hasCamera,
      sourceWidth: project.timeline.sourceWidth || null,
      sourceHeight: project.timeline.sourceHeight || null,
      cameraSyncOffsetMs: project.settings?.cameraSyncOffsetMs,
      outputMode: project.settings?.outputMode,
      pipScale: project.settings?.pipScale,
      overlays: project.timeline.overlays || [],
      savedOverlays: project.timeline.savedOverlays || [],
      audioOverlays: project.timeline.audioOverlays || [],
      savedAudioOverlays: project.timeline.savedAudioOverlays || [],
      initialView: preferredView === 'recording' ? 'recording' : 'timeline'
    });
  } else {
    setWorkspaceView('recording');
  }

  // Load background image if set in project
  if (project.timeline?.backgroundImagePath) {
    loadBackgroundFromPath(project.timeline.backgroundImagePath).catch(() => {});
  }

  await window.electronAPI.projectSetLast(projectPath);
  updateWorkspaceHeader();

  // Queue background proxy generation for any takes missing a proxy
  if (Array.isArray(project.takes)) {
    let needsMarkerUpdate = false;
    for (const take of project.takes) {
      if (!take.proxyPath && take.screenPath) {
        // Standard screen proxy
        proxyStatus.set(take.id, { status: 'pending', percent: 0 });
        needsMarkerUpdate = true;
        window.electronAPI
          .generateProxy({
            takeId: take.id,
            screenPath: take.screenPath,
            projectFolder: projectPath,
            durationSec: take.duration || 0
          })
          .catch((err: unknown) => console.warn('[Proxy] Failed to start proxy generation:', err));
      }
      // Window file proxies
      if (Array.isArray(take.windowPaths)) {
        for (let wi = 0; wi < take.windowPaths.length; wi++) {
          const wp = take.windowPaths[wi]!;
          if (wp.path && !wp.proxyPath) {
            const proxyKey = `${take.id}-win${wi}`;
            proxyStatus.set(proxyKey, { status: 'pending', percent: 0 });
            needsMarkerUpdate = true;
            window.electronAPI
              .generateProxy({
                takeId: proxyKey,
                screenPath: wp.path,
                projectFolder: projectPath,
                durationSec: take.duration || 0
              })
              .catch((err: unknown) => console.warn(`[Proxy] Failed for window ${wi}:`, err));
          }
        }
      }
    }
    if (needsMarkerUpdate) renderSectionMarkers();
  }
}

export async function openProjectByPath(
  projectPath: string,
  preferredView = 'timeline'
): Promise<void> {
  if (!projectPath) return;
  clearProjectHomeMessage();
  try {
    const opened = await window.electronAPI.projectOpen(projectPath);
    if (!opened?.projectPath || !opened?.project) return;
    await activateProject(opened.projectPath, opened.project, preferredView);
    if (opened?.recoveryTake) {
      await recoverPendingTake(opened.recoveryTake);
    }
    await refreshRecentProjects();
  } catch (error) {
    console.error('Failed to open project:', error);
    showProjectHomeMessage((error as Error)?.message || 'Failed to open project folder.');
  }
}
