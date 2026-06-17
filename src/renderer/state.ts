// ── Renderer mutable state ──────────────────────────────────────────
//
// This module owns every module-level mutable global formerly declared in
// `app.ts`. `app.ts` (and future feature modules) import these bindings and
// read them directly via ESM live bindings, so reads stay byte-identical.
// Reassignable state is exported as `let` plus a `setX` setter; in-place
// mutated state (arrays, Maps, caches/pools, constants) is exported as `const`.

import type {
  Section,
  Keyframe,
  Overlay,
  AudioOverlay,
  OutputMode,
  OverlayPosition,
} from '../shared/types/domain.js';
import type { MouseTrailData, MouseTrailEntry } from '../shared/types/mouse-trail.js';
import type { OverlayTrimSnapshot } from './features/timeline/overlay-utils.js';
import {
  editorOverlayTrack0,
  editorOverlayTrack1,
  editorOverlayTrack2,
  editorOverlayTrack3,
} from './features/dom/elements.js';

// ── State-only types (relocated from app.ts) ────────────────────────

export interface EditorState {
  duration: number;
  currentTime: number;
  playing: boolean;
  pipSize: number;
  defaultPipX: number;
  defaultPipY: number;
  keyframes: Keyframe[];
  sections: Section[];
  savedSections: Section[];
  selectedSectionId: string | null;
  screenFitMode: string;
  rendering: boolean;
  renderProgress: number;
  playbackSpeed: number;
  cameraSyncOffsetMs: number;
  hasCamera: boolean;
  sourceWidth: number | null;
  sourceHeight: number | null;
  outputMode: OutputMode;
  pipScale: number;
  overlays: Overlay[];
  savedOverlays: Overlay[];
  selectedOverlayId: string | null;
  audioOverlays: AudioOverlay[];
  savedAudioOverlays: AudioOverlay[];
  selectedAudioOverlayId: string | null;
}

export interface TakeVideos {
  screen: HTMLVideoElement;
  camera: HTMLVideoElement | null;
}

export interface TimelineSnapshot {
  sections: Section[];
  savedSections: Section[];
  keyframes: Keyframe[];
  overlays: Overlay[];
  savedOverlays: Overlay[];
  selectedOverlayId: string | null;
  audioOverlays: AudioOverlay[];
  savedAudioOverlays: AudioOverlay[];
  selectedAudioOverlayId: string | null;
  selectedSectionId: string | null;
  duration: number;
  outputMode: OutputMode;
}

export interface ProxyEntry {
  status: 'pending' | 'done' | 'error';
  percent?: number;
}

export interface TrimDragState {
  sectionId: string;
  edge: string;
  originalSourceStart: number;
  originalSourceEnd: number;
  originalStart: number;
  originalEnd: number;
  startMouseX: number;
  pixelsPerSecond: number;
  overlaySnapshots: OverlayTrimSnapshot[];
  audioOverlaySnapshots: OverlayTrimSnapshot[];
}

export interface BackgroundDragState {
  sectionId: string;
  startMouseX: number;
  startMouseY: number;
  startPanX: number;
  startPanY: number;
  zoom: number;
}

export interface CropDragState {
  sectionId: string;
  startMouseX: number;
  startCropX: number;
  zoom: number;
}

export interface OverlayTrimDragState {
  overlayId: string;
  edge: string;
  startX: number;
  originalStartTime: number;
  originalEndTime: number;
  originalSourceStart: number;
  originalSourceEnd: number;
}

export interface SpeechSegment {
  start: number;
  end: number;
  text: string;
  deleted?: boolean;
}

export type AppMediaRecorder = MediaRecorder & {
  blobPromise: Promise<{ blob: Blob; path: string }>;
  suffix: string;
};

export type PickerMode = 'none' | 'entire-screen' | 'windows' | 'device';

// ── DOM element bundle ──────────────────────────────────────────────

export const overlayTrackEls = [
  editorOverlayTrack0,
  editorOverlayTrack1,
  editorOverlayTrack2,
  editorOverlayTrack3,
];

// ── Recording / capture state ───────────────────────────────────────

export let editorRenderTimeout: ReturnType<typeof setTimeout> | null = null;
export function setEditorRenderTimeout(v: ReturnType<typeof setTimeout> | null): void {
  editorRenderTimeout = v;
}

export let screenStream: MediaStream | null = null;
export function setScreenStream(v: MediaStream | null): void {
  screenStream = v;
}

export let cameraStream: MediaStream | null = null;
export function setCameraStream(v: MediaStream | null): void {
  cameraStream = v;
}

export let audioStream: MediaStream | null = null;
export function setAudioStream(v: MediaStream | null): void {
  audioStream = v;
}

export let recorders: AppMediaRecorder[] = [];
export function setRecorders(v: AppMediaRecorder[]): void {
  recorders = v;
}

export let recording = false;
export function setRecording(v: boolean): void {
  recording = v;
}

export let screenRecInterval: ReturnType<typeof setInterval> | null = null;
export function setScreenRecInterval(v: ReturnType<typeof setInterval> | null): void {
  screenRecInterval = v;
}

export let timerInterval: ReturnType<typeof setInterval> | null = null;
export function setTimerInterval(v: ReturnType<typeof setInterval> | null): void {
  timerInterval = v;
}

export let mouseTrailSamples: MouseTrailEntry[] = [];
export function setMouseTrailSamples(v: MouseTrailEntry[]): void {
  mouseTrailSamples = v;
}

export let mouseTrailCaptureWidth: number | null = null;
export function setMouseTrailCaptureWidth(v: number | null): void {
  mouseTrailCaptureWidth = v;
}

export let mouseTrailCaptureHeight: number | null = null;
export function setMouseTrailCaptureHeight(v: number | null): void {
  mouseTrailCaptureHeight = v;
}

export let startTime = 0;
export function setStartTime(v: number): void {
  startTime = v;
}

export let audioContext: AudioContext | null = null;
export function setAudioContext(v: AudioContext | null): void {
  audioContext = v;
}

export let analyser: AnalyserNode | null = null;
export function setAnalyser(v: AnalyserNode | null): void {
  analyser = v;
}

export let meterRAF: number | null = null;
export function setMeterRAF(v: number | null): void {
  meterRAF = v;
}

export let drawRAF: number | null = null;
export function setDrawRAF(v: number | null): void {
  drawRAF = v;
}

export let saveFolder = '';
export function setSaveFolder(v: string): void {
  saveFolder = v;
}

export let hideFromRecording = 'true';
export function setHideFromRecording(v: string): void {
  hideFromRecording = v;
}

export let activeProjectPath = '';
export function setActiveProjectPath(v: string): void {
  activeProjectPath = v;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- project shape is loose at runtime
export let activeProject: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- project shape is loose at runtime
export function setActiveProject(v: any): void {
  activeProject = v;
}

export let activeProjectSession = 0;
export function setActiveProjectSession(v: number): void {
  activeProjectSession = v;
}

export let activeWorkspaceView = 'home';
export function setActiveWorkspaceView(v: string): void {
  activeWorkspaceView = v;
}

export let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;
export function setSaveDebounceTimer(v: ReturnType<typeof setTimeout> | null): void {
  saveDebounceTimer = v;
}

export let persistQueue: Promise<void> = Promise.resolve();
export function setPersistQueue(v: Promise<void>): void {
  persistQueue = v;
}

export let mediaInitialized = false;
export function setMediaInitialized(v: boolean): void {
  mediaInitialized = v;
}

export let scribeWs: WebSocket | null = null;
export function setScribeWs(v: WebSocket | null): void {
  scribeWs = v;
}

export let scribeWorkletNode: AudioWorkletNode | null = null;
export function setScribeWorkletNode(v: AudioWorkletNode | null): void {
  scribeWorkletNode = v;
}

export let mediaIdleTimer: ReturnType<typeof setTimeout> | null = null;
export function setMediaIdleTimer(v: ReturnType<typeof setTimeout> | null): void {
  mediaIdleTimer = v;
}

export const MEDIA_IDLE_TIMEOUT_MS = 30000;

export let speechSegments: SpeechSegment[] = [];
export function setSpeechSegments(v: SpeechSegment[]): void {
  speechSegments = v;
}

export let audioChunkBuffer: Int16Array[] = [];
export function setAudioChunkBuffer(v: Int16Array[]): void {
  audioChunkBuffer = v;
}

export let audioSendInterval: ReturnType<typeof setInterval> | null = null;
export function setAudioSendInterval(v: ReturnType<typeof setInterval> | null): void {
  audioSendInterval = v;
}

export let micSourceNode: MediaStreamAudioSourceNode | null = null;
export function setMicSourceNode(v: MediaStreamAudioSourceNode | null): void {
  micSourceNode = v;
}

// Window capture state
export let windowStreams: MediaStream[] = [];
export function setWindowStreams(v: MediaStream[]): void {
  windowStreams = v;
}

export let windowVideos: HTMLVideoElement[] = [];
export function setWindowVideos(v: HTMLVideoElement[]): void {
  windowVideos = v;
}

export let windowRecIntervals: ReturnType<typeof setInterval>[] = [];
export function setWindowRecIntervals(v: ReturnType<typeof setInterval>[]): void {
  windowRecIntervals = v;
}

export let windowSourceNames: string[] = [];
export function setWindowSourceNames(v: string[]): void {
  windowSourceNames = v;
}

export let backgroundImage: HTMLImageElement | null = null;
export function setBackgroundImage(v: HTMLImageElement | null): void {
  backgroundImage = v;
}

export let backgroundImagePath: string | null = null;
export function setBackgroundImagePath(v: string | null): void {
  backgroundImagePath = v;
}

export let scribeAudioOffset = 0; // seconds between recording start and first audio sent to Scribe
export function setScribeAudioOffset(v: number): void {
  scribeAudioOffset = v;
}

export let workletRegistered: AudioContext | null = null; // tracks which AudioContext has the worklet registered
export function setWorkletRegistered(v: AudioContext | null): void {
  workletRegistered = v;
}

// ── Section zoom constants ──────────────────────────────────────────

export const AUDIO_OVERLAY_EXTENSIONS = ['.mp3', '.wav', '.aac', '.ogg', '.flac', '.m4a'];

export const MIN_SECTION_ZOOM = 1;
export const MIN_REEL_SECTION_ZOOM = 0.5;
export const MAX_SECTION_ZOOM = 3;
export const DEFAULT_SECTION_ZOOM = 1;

export const TRANSITION_DURATION = 0.3;
export const CAMERA_DRIFT_SOFT_THRESHOLD = 0.015;
export const CAMERA_DRIFT_HARD_THRESHOLD = 0.18;
export const CAMERA_DRIFT_LOG_THRESHOLD = 0.08;
export const CAMERA_DRIFT_LOG_INTERVAL_MS = 1000;
export const CAMERA_RESYNC_COOLDOWN_MS = 500;

// ===== Editor State =====
export const undoStack: TimelineSnapshot[] = [];
export const redoStack: TimelineSnapshot[] = [];
export const MAX_UNDO = 50;

export let editorState: EditorState | null = null;
export function setEditorState(v: EditorState | null): void {
  editorState = v;
}

export let editorDrawRAF: number | null = null;
export function setEditorDrawRAF(v: number | null): void {
  editorDrawRAF = v;
}

export let editorPausedDrawTimer: ReturnType<typeof setTimeout> | null = null;
export function setEditorPausedDrawTimer(v: ReturnType<typeof setTimeout> | null): void {
  editorPausedDrawTimer = v;
}

export let editorVideoFrameCallbackId: number | null = null;
export function setEditorVideoFrameCallbackId(v: number | null): void {
  editorVideoFrameCallbackId = v;
}

export let editorVideoFrameHost: HTMLVideoElement | null = null;
export function setEditorVideoFrameHost(v: HTMLVideoElement | null): void {
  editorVideoFrameHost = v;
}

export let editorVideoFrameSafetyTimer: ReturnType<typeof setTimeout> | null = null;
export function setEditorVideoFrameSafetyTimer(v: ReturnType<typeof setTimeout> | null): void {
  editorVideoFrameSafetyTimer = v;
}

export let draggingPip = false;
export function setDraggingPip(v: boolean): void {
  draggingPip = v;
}

export let pipDragMoved = false;
export function setPipDragMoved(v: boolean): void {
  pipDragMoved = v;
}

export let waveformPeaks: Float32Array | null = null;
export function setWaveformPeaks(v: Float32Array | null): void {
  waveformPeaks = v;
}

export let timelineZoom = 1;
export function setTimelineZoom(v: number): void {
  timelineZoom = v;
}

export let trimDragState: TrimDragState | null = null;
export function setTrimDragState(v: TrimDragState | null): void {
  trimDragState = v;
}

export let sectionZoomDragActive = false;
export function setSectionZoomDragActive(v: boolean): void {
  sectionZoomDragActive = v;
}

export let draggingBackground = false;
export function setDraggingBackground(v: boolean): void {
  draggingBackground = v;
}

export let backgroundDragMoved = false;
export function setBackgroundDragMoved(v: boolean): void {
  backgroundDragMoved = v;
}

export let backgroundDragState: BackgroundDragState | null = null;
export function setBackgroundDragState(v: BackgroundDragState | null): void {
  backgroundDragState = v;
}

export const takeAudioBufferCache = new Map<string, AudioBuffer>(); // takeId -> AudioBuffer
export const takeVideoPool = new Map<string, TakeVideos>(); // takeId -> { screen, camera }
export const proxyStatus = new Map<string, ProxyEntry>(); // takeId -> status entry
export const overlayImageCache = new Map<string, HTMLImageElement>(); // mediaPath -> HTMLImageElement
export const mouseTrailCache = new Map<string, MouseTrailData>(); // takeId -> trail data
export const overlayVideoEls: (HTMLVideoElement | null)[] = [null, null, null, null]; // per-track reusable <video> elements
export const overlayVideoCurrentPaths: (string | null)[] = [null, null, null, null];

export let activeTakeId: string | null = null;
export function setActiveTakeId(v: string | null): void {
  activeTakeId = v;
}

export let activePlaybackSection: Section | null = null;
export function setActivePlaybackSection(v: Section | null): void {
  activePlaybackSection = v;
}

export let cameraResyncCooldownUntil = 0;
export function setCameraResyncCooldownUntil(v: number): void {
  cameraResyncCooldownUntil = v;
}

export let lastCameraDriftLogAt = 0;
export function setLastCameraDriftLogAt(v: number): void {
  lastCameraDriftLogAt = v;
}

export let draggingCrop = false;
export function setDraggingCrop(v: boolean): void {
  draggingCrop = v;
}

export let cropDragMoved = false;
export function setCropDragMoved(v: boolean): void {
  cropDragMoved = v;
}

export let cropDragState: CropDragState | null = null;
export function setCropDragState(v: CropDragState | null): void {
  cropDragState = v;
}

// ── Sidebar / mute state ────────────────────────────────────────────

export let activeSidebarTab = 'segments';
export function setActiveSidebarTab(v: string): void {
  activeSidebarTab = v;
}

export const preMuteVolumes = new Map<string, number>();

// ── Overlay trim drag state ─────────────────────────────────────────

export let overlayTrimDragState: OverlayTrimDragState | null = null;
export function setOverlayTrimDragState(v: OverlayTrimDragState | null): void {
  overlayTrimDragState = v;
}

export let audioOverlayTrimDragState: OverlayTrimDragState | null = null;
export function setAudioOverlayTrimDragState(v: OverlayTrimDragState | null): void {
  audioOverlayTrimDragState = v;
}

// ── Source picker state ─────────────────────────────────────────────

export let pickerMode: PickerMode = 'none';
export function setPickerMode(v: PickerMode): void {
  pickerMode = v;
}

export let pickerEntireScreenId = '';
export function setPickerEntireScreenId(v: string): void {
  pickerEntireScreenId = v;
}

export let pickerDeviceId = '';
export function setPickerDeviceId(v: string): void {
  pickerDeviceId = v;
}

export let pickerCheckedWindows: Array<{ id: string; name: string }> = [];
export function setPickerCheckedWindows(v: Array<{ id: string; name: string }>): void {
  pickerCheckedWindows = v;
}

export let pickerAllSources: Array<{ id: string; name: string }> = [];
export function setPickerAllSources(v: Array<{ id: string; name: string }>): void {
  pickerAllSources = v;
}

export let pickerAllVideoInputs: MediaDeviceInfo[] = [];
export function setPickerAllVideoInputs(v: MediaDeviceInfo[]): void {
  pickerAllVideoInputs = v;
}

export let supportedRecorderMimeType: string | undefined;
export function setSupportedRecorderMimeType(v: string | undefined): void {
  supportedRecorderMimeType = v;
}

// === Audio overlay playback preview ===
export const audioBufferCache = new Map<string, AudioBuffer>();
export const audioOverlayPeakCache = new Map<string, { min: Float32Array; max: Float32Array }>();

export let audioOverlayContext: AudioContext | null = null;
export function setAudioOverlayContext(v: AudioContext | null): void {
  audioOverlayContext = v;
}

export let activeAudioOverlayNodes: Array<{ source: AudioBufferSourceNode; gain: GainNode; aoId: string }> = [];
export function setActiveAudioOverlayNodes(
  v: Array<{ source: AudioBufferSourceNode; gain: GainNode; aoId: string }>,
): void {
  activeAudioOverlayNodes = v;
}

// ── Overlay drag / resize state ─────────────────────────────────────

export let draggingOverlay = false;
export function setDraggingOverlay(v: boolean): void {
  draggingOverlay = v;
}

export let overlayDragMoved = false;
export function setOverlayDragMoved(v: boolean): void {
  overlayDragMoved = v;
}

export let overlayDragStartX = 0;
export function setOverlayDragStartX(v: number): void {
  overlayDragStartX = v;
}

export let overlayDragStartY = 0;
export function setOverlayDragStartY(v: number): void {
  overlayDragStartY = v;
}

export let overlayDragOrigX = 0;
export function setOverlayDragOrigX(v: number): void {
  overlayDragOrigX = v;
}

export let overlayDragOrigY = 0;
export function setOverlayDragOrigY(v: number): void {
  overlayDragOrigY = v;
}

export let resizingOverlay = false;
export function setResizingOverlay(v: boolean): void {
  resizingOverlay = v;
}

export let overlayResizeCorner: string | null = null;
export function setOverlayResizeCorner(v: string | null): void {
  overlayResizeCorner = v;
}

export let overlayResizeStartX = 0;
export function setOverlayResizeStartX(v: number): void {
  overlayResizeStartX = v;
}

export let overlayResizeOrigRect: OverlayPosition | null = null;
export function setOverlayResizeOrigRect(v: OverlayPosition | null): void {
  overlayResizeOrigRect = v;
}

export let overlayResizeAspect = 1;
export function setOverlayResizeAspect(v: number): void {
  overlayResizeAspect = v;
}

// ── Overlay media extension constants ───────────────────────────────

export const OVERLAY_IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
export const OVERLAY_VIDEO_EXTS = ['.mp4', '.webm', '.mov'];

// ── Misc editor UI state ────────────────────────────────────────────

export let autoTrackSmoothDragActive = false;
export function setAutoTrackSmoothDragActive(v: boolean): void {
  autoTrackSmoothDragActive = v;
}

export let overlaySizeDragActive = false;
export function setOverlaySizeDragActive(v: boolean): void {
  overlaySizeDragActive = v;
}

export let pipSizeDragActive = false;
export function setPipSizeDragActive(v: boolean): void {
  pipSizeDragActive = v;
}

export let thumbnailToastTimer: ReturnType<typeof setTimeout> | null = null;
export function setThumbnailToastTimer(v: ReturnType<typeof setTimeout> | null): void {
  thumbnailToastTimer = v;
}

export let capturingThumbnail = false;
export function setCapturingThumbnail(v: boolean): void {
  capturingThumbnail = v;
}

export let selectedSegmentIndex = -1;
export function setSelectedSegmentIndex(v: number): void {
  selectedSegmentIndex = v;
}
