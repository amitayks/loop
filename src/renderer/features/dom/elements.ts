// ── DOM element bindings ─────────────────────────────────────────────
//
// All module-level DOM element bindings used by the renderer. Resolved once
// when this module is first imported during bundle execution (after the DOM is
// parsed, since the renderer <script type="module"> is at the end of <body>).
// Named exports keep every usage in app.ts byte-identical. No business logic,
// no event listeners, no mutable state lives here.

import { CANVAS_W, CANVAS_H } from '../../../shared/domain/canvas.js';

// ── Project home / workspace header ──────────────────────────────────

export const projectHomeView = document.getElementById('projectHomeView')!;
export const workspaceHeader = document.getElementById('workspaceHeader')!;
export const newProjectNameInput = document.getElementById('newProjectName') as HTMLInputElement;
export const createProjectBtn = document.getElementById('createProjectBtn') as HTMLButtonElement;
export const openProjectBtn = document.getElementById('openProjectBtn') as HTMLButtonElement;
export const projectHomeMessage = document.getElementById('projectHomeMessage')!;
export const lastProjectRow = document.getElementById('lastProjectRow')!;
export const lastProjectName = document.getElementById('lastProjectName')!;
export const lastProjectPath = document.getElementById('lastProjectPath')!;
export const resumeLastBtn = document.getElementById('resumeLastBtn') as HTMLButtonElement;
export const recentProjectsList = document.getElementById('recentProjectsList')!;
export const saveAndCleanBtn = document.getElementById('saveAndCleanBtn') as HTMLButtonElement;
export const activeProjectNameEl = document.getElementById('activeProjectName')!;
export const activeProjectPathEl = document.getElementById('activeProjectPath')!;
export const goRecordingBtn = document.getElementById('goRecordingBtn') as HTMLButtonElement;
export const goTimelineBtn = document.getElementById('goTimelineBtn') as HTMLButtonElement;
export const switchProjectBtn = document.getElementById('switchProjectBtn') as HTMLButtonElement;
export const exportAudioPresetControl = document.getElementById('exportAudioPresetControl')!;
export const exportAudioPresetSelect = document.getElementById('exportAudioPreset') as HTMLSelectElement;
export const cameraSyncOffsetControl = document.getElementById('cameraSyncOffsetControl')!;
export const cameraSyncOffsetInput = document.getElementById('cameraSyncOffsetMs') as HTMLInputElement;

// ── Recording view ──────────────────────────────────────────────────

export const screenSelect = document.getElementById('screenSource') as HTMLSelectElement;
export const screenPickerBtn = document.getElementById('screenPickerBtn')!;
export const screenPickerPanel = document.getElementById('screenPickerPanel')!;
export const screenPickerSingleZone = document.getElementById('screenPickerSingleZone')!;
export const screenPickerWindowZone = document.getElementById('screenPickerWindowZone')!;
export const screenPickerDeviceZone = document.getElementById('screenPickerDeviceZone')!;
export const screenFitSelect = document.getElementById('screenFit') as HTMLSelectElement;
export const cameraSelect = document.getElementById('cameraSource') as HTMLSelectElement;
export const audioSelect = document.getElementById('audioSource') as HTMLSelectElement;
export const canvas = document.getElementById('compositeCanvas') as HTMLCanvasElement;
export const ctx = canvas.getContext('2d')!;
export const screenVideo = document.getElementById('screenVideo') as HTMLVideoElement;
export const cameraVideo = document.getElementById('cameraVideo') as HTMLVideoElement;
export const noPreview = document.getElementById('noPreview')!;
export const audioMeter = document.getElementById('audioMeter')!;
export const recordBtn = document.getElementById('recordBtn') as HTMLButtonElement;
export const timerEl = document.getElementById('timer')!;
export const folderPathEl = document.getElementById('folderPath')!;
export const openFolderBtn = document.getElementById('openFolderBtn') as HTMLButtonElement;
export const pickFolderBtn = document.getElementById('pickFolderBtn') as HTMLButtonElement;
export const contentProtectionToggle = document.getElementById('contentProtectionToggle') as HTMLInputElement;
export const recordingView = document.getElementById('recordingView')!;
export const transcriptPanel = document.getElementById('transcriptPanel')!;
export const transcriptContent = document.getElementById('transcriptContent')!;
export const segmentBadge = document.getElementById('segmentBadge')!;

// ── Processing view ─────────────────────────────────────────────────

export const processingView = document.getElementById('processingView')!;
export const processingTitle = document.getElementById('processingTitle')!;
export const processingStatus = document.getElementById('processingStatus')!;
export const processingBar = document.getElementById('processingBar')!;

// ── Editor view ─────────────────────────────────────────────────────

export const editorView = document.getElementById('editorView')!;
export const editorCanvas = document.getElementById('editorCanvas') as HTMLCanvasElement;
export const editorCtx = editorCanvas.getContext('2d')!;
export const editorRenderBtn = document.getElementById('editorRenderBtn') as HTMLButtonElement;
export const editorUndoBtn = document.getElementById('editorUndoBtn') as HTMLButtonElement;
export const editorRedoBtn = document.getElementById('editorRedoBtn') as HTMLButtonElement;
export const editorPlayBtn = document.getElementById('editorPlayBtn') as HTMLButtonElement;
export const editorSplitBtn = document.getElementById('editorSplitBtn') as HTMLButtonElement;
export const editorToggleCamBtn = document.getElementById('editorToggleCamBtn') as HTMLButtonElement;
export const editorCamFullBtn = document.getElementById('editorCamFullBtn') as HTMLButtonElement;
export const editorBgZoomInput = document.getElementById('editorBgZoomInput') as HTMLInputElement;
export const editorBgZoomValue = document.getElementById('editorBgZoomValue')!;
export const editorApplyFutureBtn = document.getElementById('editorApplyFutureBtn') as HTMLButtonElement;
export const editorModeLandscapeBtn = document.getElementById('editorModeLandscape') as HTMLButtonElement | null;
export const editorModeReelBtn = document.getElementById('editorModeReel') as HTMLButtonElement | null;
export const editorPipSizeControl = document.getElementById('editorPipSizeControl');
export const editorPipSizeInput = document.getElementById('editorPipSizeInput') as HTMLInputElement | null;
export const editorPipSizeValue = document.getElementById('editorPipSizeValue');
export const editorAutoTrackControl = document.getElementById('editorAutoTrackControl');
export const editorAutoTrackToggle = document.getElementById('editorAutoTrackToggle') as HTMLButtonElement | null;
export const editorAutoTrackSmoothScrub = document.getElementById('editorAutoTrackSmoothScrub');
export const editorAutoTrackSmoothValue = document.getElementById('editorAutoTrackSmoothValue');
export const editorAutoTrackSmoothInput = document.getElementById('editorAutoTrackSmoothInput') as HTMLInputElement | null;
export const editorOverlaySizeControl = document.getElementById('editorOverlaySizeControl');
export const editorOverlaySizeInput = document.getElementById('editorOverlaySizeInput') as HTMLInputElement;
export const editorOverlaySizeValue = document.getElementById('editorOverlaySizeValue')!;
export const editorOverlaySizeScrub = document.getElementById('editorOverlaySizeScrub');
export const sidebarTabSegments = document.getElementById('sidebarTabSegments');
export const sidebarTabOverlays = document.getElementById('sidebarTabOverlays');
export const editorOverlayList = document.getElementById('editorOverlayList');
export const editorCropPresets = document.getElementById('editorCropPresets');
export const editorCropLeftBtn = document.getElementById('editorCropLeft');
export const editorCropCenterBtn = document.getElementById('editorCropCenter');
export const editorCropRightBtn = document.getElementById('editorCropRight');
export const editorTimeEl = document.getElementById('editorTime')!;
export const editorTimelineWrapper = document.getElementById('editorTimelineWrapper')!;
export const editorTimeline = document.getElementById('editorTimeline')!;
export const editorSectionMarkers = document.getElementById('editorSectionMarkers')!;
export const editorOverlayTrack0 = document.getElementById('editorOverlayTrack0')!;
export const editorOverlayTrack1 = document.getElementById('editorOverlayTrack1')!;
export const editorOverlayTrack2 = document.getElementById('editorOverlayTrack2')!;
export const editorOverlayTrack3 = document.getElementById('editorOverlayTrack3')!;
export const editorScrubber = document.getElementById('editorScrubber')!;
export const editorSectionTranscriptList = document.getElementById('editorSectionTranscriptList')!;
export const editorWaveformCanvas = document.getElementById('editorWaveformCanvas') as HTMLCanvasElement;
export const editorAudioTrack0 = document.getElementById('editorAudioTrack0');
export const editorBgZoomScrub = document.getElementById('editorBgZoomScrub');
export const editorPipSizeScrub = document.getElementById('editorPipSizeScrub');

// ── Canvas dimension setup ──────────────────────────────────────────

canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
editorCanvas.width = CANVAS_W;
editorCanvas.height = CANVAS_H;

// ── Editor zoom-buffer (eager, off-DOM helper canvas) ───────────────

export const editorZoomBuffer = document.createElement('canvas');
editorZoomBuffer.width = CANVAS_W;
editorZoomBuffer.height = CANVAS_H;
export const editorZoomBufferCtx = editorZoomBuffer.getContext('2d');
