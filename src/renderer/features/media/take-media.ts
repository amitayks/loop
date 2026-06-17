// ── Take video pool + mouse-trail + media init + content protection ──
//
// The take/media infrastructure used across renderer modules: the per-take
// video pool, mouse-trail lookups, recording-media initialization, content
// protection, plus the `pathToFileUrl` / `resolveTimeToSource` helpers.
// Extracted verbatim from app.ts; function bodies are unchanged. State is
// consumed via live bindings + setters from `../../state.js`; DOM from
// `../dom/elements.js`; siblings from their feature modules. `window.electronAPI`
// remains an ambient global.

import {
  activeProject,
  activeWorkspaceView,
  hideFromRecording,
  mediaInitialized,
  mouseTrailCache,
  pickerCheckedWindows,
  pickerMode,
  takeAudioBufferCache,
  takeVideoPool,
  setActivePlaybackSection,
  setActiveTakeId,
  setMediaInitialized
} from '../../state.js';
import type { TakeVideos } from '../../state.js';
import { contentProtectionToggle } from '../dom/elements.js';
import { updatePreview } from '../drawing/compositing.js';
import { findSectionForTime } from '../section/section-editing.js';
import {
  enumerateDevices,
  updateAudioStream,
  updateCameraStream,
  updateScreenStream,
  updateWindowStreams
} from '../capture/source-picker.js';
import type { MouseTrailData } from '../../../shared/types/mouse-trail.js';
import type { Section, Take } from '../../../shared/types/domain.js';

export function getOrCreateTakeVideos(takeId: string): TakeVideos | null {
  if (takeVideoPool.has(takeId)) return takeVideoPool.get(takeId)!;
  const take = activeProject?.takes?.find((t: Take) => t.id === takeId);
  if (!take) return null;
  const screen = document.createElement('video');
  screen.playsInline = true;
  screen.preload = 'auto';
  // In window capture mode (no screenPath), use first window file as timing source
  const screenSrc =
    take.proxyPath ||
    take.screenPath ||
    (Array.isArray(take.windowPaths) && take.windowPaths.length > 0
      ? take.windowPaths[0]!.path
      : null);
  if (screenSrc) {
    screen.src = pathToFileUrl(screenSrc);
  }
  let camera: HTMLVideoElement | null = null;
  if (take.cameraPath) {
    camera = document.createElement('video');
    camera.playsInline = true;
    camera.muted = true;
    camera.preload = 'auto';
    camera.src = pathToFileUrl(take.cameraPath);
  }
  const entry: TakeVideos = { screen, camera };
  takeVideoPool.set(takeId, entry);
  return entry;
}

export function cleanupVideoPool(): void {
  for (const [, videos] of takeVideoPool) {
    videos.screen.pause();
    videos.screen.src = '';
    if (videos.camera) {
      videos.camera.pause();
      videos.camera.src = '';
    }
  }
  takeVideoPool.clear();
  takeAudioBufferCache.clear();
  setActiveTakeId(null);
  setActivePlaybackSection(null);
}

export function resolveTimeToSource(
  timelineTime: number
): { takeId: string; sourceTime: number; section: Section } | null {
  const section = findSectionForTime(timelineTime);
  if (!section) return null;
  const sourceTime = section.sourceStart + (timelineTime - section.start);
  return { takeId: section.takeId!, sourceTime, section };
}

export function pathToFileUrl(filePath: string | null): string {
  if (!filePath) return '';
  return window.electronAPI.pathToFileUrl(filePath);
}

export async function loadMouseTrail(takeId: string): Promise<MouseTrailData | null> {
  if (mouseTrailCache.has(takeId)) return mouseTrailCache.get(takeId)!;
  const take = activeProject?.takes?.find((t: Take) => t.id === takeId);
  if (!take?.mousePath) return null;
  try {
    const response = await fetch(pathToFileUrl(take.mousePath));
    const data = (await response.json()) as MouseTrailData;
    if (data && Array.isArray(data.trail)) {
      mouseTrailCache.set(takeId, data);
      return data;
    }
  } catch (err) {
    console.warn('Failed to load mouse trail:', err);
  }
  return null;
}

export function getMouseTrailForTake(takeId: string): MouseTrailData | null {
  return mouseTrailCache.get(takeId) || null;
}

export async function ensureMediaInitialized(): Promise<void> {
  if (mediaInitialized) return;
  setMediaInitialized(true);
  await enumerateDevices();
  // Acquire streams based on picker state
  if (pickerMode === 'windows' && pickerCheckedWindows.length > 0) {
    try {
      await updateWindowStreams(pickerCheckedWindows);
    } catch (error) {
      console.warn('Window stream init failed:', error);
    }
  } else {
    try {
      await updateScreenStream();
    } catch (error) {
      console.warn('Screen source init failed:', error);
    }
  }
  try {
    await updateCameraStream();
  } catch (error) {
    console.warn('Camera source init failed:', error);
  }
  try {
    await updateAudioStream();
  } catch (error) {
    console.warn('Audio source init failed:', error);
  }
  if (activeWorkspaceView === 'recording') updatePreview();
}

export async function syncContentProtection(): Promise<void> {
  const enabled = hideFromRecording === 'true';
  contentProtectionToggle.checked = enabled;

  try {
    await window.electronAPI.setContentProtection(enabled);
  } catch (error) {
    console.error('Failed to update content protection:', error);
  }
}
