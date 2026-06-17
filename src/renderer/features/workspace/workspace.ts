// ── Workspace view routing (toggle buttons, header, view switch) ─────
//
// The workspace routing helpers decide which top-level view (home / recording /
// timeline / processing) is visible and keep the header toggle buttons in sync.
// Extracted verbatim from app.ts; function bodies are unchanged. State is
// consumed via live bindings + setters from `../../state.js`; DOM from
// `../dom/elements.js`; siblings from their feature modules. `setWorkspaceView`
// may schedule editor draw loops and tear down idle media. `window.electronAPI`
// remains an ambient global.

import {
  MEDIA_IDLE_TIMEOUT_MS,
  activeProject,
  activeProjectPath,
  activeWorkspaceView,
  audioContext,
  audioSendInterval,
  audioStream,
  cameraStream,
  drawRAF,
  editorState,
  mediaIdleTimer,
  mediaInitialized,
  meterRAF,
  recorders,
  recording,
  screenRecInterval,
  screenStream,
  scribeWorkletNode,
  scribeWs,
  timerInterval,
  windowRecIntervals,
  windowStreams,
  setActiveWorkspaceView,
  setAudioContext,
  setAudioSendInterval,
  setAudioStream,
  setCameraStream,
  setDrawRAF,
  setMediaIdleTimer,
  setMediaInitialized,
  setMeterRAF,
  setRecorders,
  setScreenRecInterval,
  setScreenStream,
  setScribeWorkletNode,
  setScribeWs,
  setWindowRecIntervals,
  setWindowSourceNames,
  setWindowStreams,
  setWindowVideos
} from '../../state.js';
import {
  activeProjectNameEl,
  activeProjectPathEl,
  cameraSyncOffsetControl,
  editorRenderBtn,
  editorView,
  exportAudioPresetControl,
  goRecordingBtn,
  goTimelineBtn,
  processingView,
  projectHomeView,
  recordBtn,
  recordingView,
  timerEl,
  workspaceHeader
} from '../dom/elements.js';
import { updatePreview } from '../drawing/compositing.js';
import { cleanupAllMedia } from '../media-cleanup.js';
import {
  cancelEditorDrawLoop,
  editorDrawLoop,
  editorPause,
  hasPendingEditorDraw
} from '../editor/transport.js';
import { stopAudioMeter } from '../recording/recording.js';
import { ensureMediaInitialized } from '../media/take-media.js';

function setToggleButtonState(button: HTMLButtonElement, active: boolean, disabled: boolean): void {
  button.disabled = !!disabled;
  button.className = `px-3 py-1.5 rounded-md text-sm transition-colors ${active ? 'bg-white text-neutral-950 font-medium' : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800'} disabled:opacity-40 disabled:cursor-not-allowed`;
}

export function updateWorkspaceHeader(): void {
  const hasProject = !!activeProjectPath;
  const showTimelineTools = hasProject && activeWorkspaceView === 'timeline';
  activeProjectNameEl.textContent = activeProject?.name || 'Project';
  activeProjectPathEl.textContent = activeProjectPath || '';
  workspaceHeader.classList.toggle('hidden', !hasProject || activeWorkspaceView === 'home');
  setToggleButtonState(
    goRecordingBtn,
    activeWorkspaceView === 'recording',
    !hasProject || activeWorkspaceView === 'processing'
  );
  setToggleButtonState(
    goTimelineBtn,
    activeWorkspaceView === 'timeline',
    !hasProject || !editorState || activeWorkspaceView === 'processing' || recording
  );
  recordBtn.classList.toggle('hidden', activeWorkspaceView !== 'recording');
  timerEl.classList.toggle('hidden', activeWorkspaceView !== 'recording');
  cameraSyncOffsetControl.classList.toggle('hidden', !showTimelineTools);
  cameraSyncOffsetControl.classList.toggle('flex', showTimelineTools);
  exportAudioPresetControl.classList.toggle('hidden', !showTimelineTools);
  exportAudioPresetControl.classList.toggle('flex', showTimelineTools);
  editorRenderBtn.classList.toggle('hidden', !showTimelineTools);
}

export function setWorkspaceView(nextView: string): void {
  setActiveWorkspaceView(nextView);
  const showHome = nextView === 'home';
  const showRecording = nextView === 'recording';
  const showTimeline = nextView === 'timeline' && !!editorState;
  const showProcessing = nextView === 'processing';

  projectHomeView.classList.toggle('hidden', !showHome);
  recordingView.classList.toggle('hidden', !showRecording);
  editorView.classList.toggle('hidden', !showTimeline);
  processingView.classList.toggle('hidden', !showProcessing);

  if (showRecording) {
    if (mediaIdleTimer) {
      clearTimeout(mediaIdleTimer);
      setMediaIdleTimer(null);
    }
    if (!mediaInitialized) {
      ensureMediaInitialized();
    }
    updatePreview();
  } else if (drawRAF) {
    cancelAnimationFrame(drawRAF);
    setDrawRAF(null);
  }

  // Start idle timer when leaving recording view (and streams are active)
  if (!showRecording && mediaInitialized && !recording && !mediaIdleTimer) {
    setMediaIdleTimer(
      setTimeout(() => {
        setMediaIdleTimer(null);
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
        setWindowStreams([]);
        setWindowVideos([]);
        setWindowRecIntervals([]);
        setWindowSourceNames([]);
        setMediaInitialized(false);
      }, MEDIA_IDLE_TIMEOUT_MS)
    );
  }

  if (showTimeline && editorState && !hasPendingEditorDraw()) {
    editorDrawLoop();
  } else if (!showTimeline && hasPendingEditorDraw()) {
    cancelEditorDrawLoop();
    if (editorState?.playing) editorPause();
  }

  updateWorkspaceHeader();
}
