import {
  editorState,
  MIN_REEL_SECTION_ZOOM,
  MIN_SECTION_ZOOM,
  MAX_SECTION_ZOOM,
  DEFAULT_SECTION_ZOOM
} from '../../state.js';
import {
  editorModeLandscapeBtn,
  editorModeReelBtn,
  editorPipSizeControl,
  editorPipSizeInput,
  editorPipSizeValue,
  editorCropPresets,
  editorBgZoomInput
} from '../dom/elements.js';
import {
  CANVAS_W,
  CANVAS_H,
  PIP_MARGIN,
  DEFAULT_PIP_SCALE
} from '../../../shared/domain/canvas.js';
import { normalizePipScale } from '../../../shared/domain/project-fields.js';
import type { OutputMode } from '../../../shared/types/domain.js';
import {
  saveModeState,
  restoreModeState,
  getDefaultModeState
} from '../keyframe/mode-state.js';
import { clampSectionPan } from '../geometry/section-geometry.js';
import { computePipSize } from '../geometry/pip-geometry.js';
import {
  getSelectedSection,
  getSectionAnchorKeyframe,
  updateSectionZoomControls
} from '../section/section-editing.js';
import { getEffectiveCanvasDimensions } from '../drawing/compositing.js';
import { pushUndo, scheduleProjectSave } from '../project/project-lifecycle.js';

export function clampSectionZoom(value: unknown): number {
  const minZoom =
    editorState && editorState.outputMode === 'reel' ? MIN_REEL_SECTION_ZOOM : MIN_SECTION_ZOOM;
  const zoom = Number(value);
  if (!Number.isFinite(zoom)) return DEFAULT_SECTION_ZOOM;
  return Math.max(minZoom, Math.min(MAX_SECTION_ZOOM, zoom));
}

export function formatSectionZoom(value: unknown): string {
  return `${clampSectionZoom(value).toFixed(2)}x`;
}

export function setOutputMode(mode: string): void {
  if (!editorState) return;
  const newMode: OutputMode = mode === 'reel' ? 'reel' : 'landscape';
  if (editorState.outputMode === newMode) return;
  pushUndo();

  const oldMode = editorState.outputMode;
  const defaults = getDefaultModeState(newMode);

  // Save current mode state, then restore or apply defaults for new mode
  if (editorState.keyframes) {
    for (const kf of editorState.keyframes) {
      saveModeState(kf, oldMode);
      restoreModeState(kf, newMode, defaults);
    }
  }

  editorState.outputMode = newMode;

  const { w, h } = getEffectiveCanvasDimensions();
  const defaultPs = editorState.pipScale || DEFAULT_PIP_SCALE;
  editorState.pipSize = computePipSize(defaultPs, w);
  editorState.defaultPipX = w - editorState.pipSize - PIP_MARGIN;
  editorState.defaultPipY = h - editorState.pipSize - PIP_MARGIN;

  updateOutputModeUI();
  scheduleProjectSave();
}

export function updateOutputModeUI(): void {
  if (!editorModeLandscapeBtn || !editorModeReelBtn) return;
  const isReel = editorState && editorState.outputMode === 'reel';
  editorModeLandscapeBtn.className = isReel
    ? 'px-2.5 py-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors'
    : 'px-2.5 py-1 text-xs bg-white text-black transition-colors';
  editorModeReelBtn.className = isReel
    ? 'px-2.5 py-1 text-xs bg-white text-black transition-colors'
    : 'px-2.5 py-1 text-xs text-neutral-400 hover:text-neutral-200 transition-colors';
  // Show/hide PIP size control when camera is present
  if (editorPipSizeControl) {
    const showPipControl = editorState && editorState.hasCamera;
    editorPipSizeControl.classList.toggle('hidden', !showPipControl);
    editorPipSizeControl.classList.toggle('flex', !!showPipControl);
  }
  if (editorPipSizeInput && editorState) {
    const selectedSection = getSelectedSection();
    const sectionAnchor = selectedSection
      ? getSectionAnchorKeyframe(selectedSection.id, false)
      : null;
    const currentPipScale = sectionAnchor
      ? normalizePipScale(sectionAnchor.pipScale)
      : editorState.pipScale || DEFAULT_PIP_SCALE;
    editorPipSizeInput.value = String(currentPipScale);
    if (editorPipSizeValue) editorPipSizeValue.textContent = currentPipScale.toFixed(2);
  }
  if (editorCropPresets) {
    editorCropPresets.classList.toggle('hidden', !isReel);
    editorCropPresets.classList.toggle('flex', !!isReel);
  }
  // Update zoom slider range based on mode
  if (editorBgZoomInput) {
    editorBgZoomInput.min = isReel ? '0.5' : '1';
  }
  updateSectionZoomControls();
}

export function getZoomCropBounds(zoom: unknown): {
  sourceW: number;
  sourceH: number;
  maxOffsetX: number;
  maxOffsetY: number;
} {
  const clampedZoom = clampSectionZoom(zoom);
  const sourceW = CANVAS_W / clampedZoom;
  const sourceH = CANVAS_H / clampedZoom;
  return {
    sourceW,
    sourceH,
    maxOffsetX: Math.max(0, (CANVAS_W - sourceW) / 2),
    maxOffsetY: Math.max(0, (CANVAS_H - sourceH) / 2)
  };
}

export function resolveZoomCrop(
  zoom: unknown,
  panX = 0,
  panY = 0
): {
  sourceW: number;
  sourceH: number;
  sourceX: number;
  sourceY: number;
  maxOffsetX: number;
  maxOffsetY: number;
} {
  const { sourceW, sourceH, maxOffsetX, maxOffsetY } = getZoomCropBounds(zoom);
  return {
    sourceW,
    sourceH,
    sourceX: maxOffsetX + clampSectionPan(panX) * maxOffsetX,
    sourceY: maxOffsetY + clampSectionPan(panY) * maxOffsetY,
    maxOffsetX,
    maxOffsetY
  };
}

export function panToFocusCoord(zoom: unknown, pan: unknown, defaultCoord = 0.5): number {
  const normalizedZoom = clampSectionZoom(zoom);
  if (normalizedZoom <= 1.0001) return defaultCoord;
  const cropFraction = 1 / normalizedZoom;
  return cropFraction / 2 + ((clampSectionPan(pan) + 1) / 2) * (1 - cropFraction);
}

export function focusToPanCoord(zoom: unknown, focus: number, defaultPan = 0): number {
  const normalizedZoom = clampSectionZoom(zoom);
  if (normalizedZoom <= 1.0001) return defaultPan;
  const cropFraction = 1 / normalizedZoom;
  const availableFraction = 1 - cropFraction;
  if (availableFraction <= 0.000001) return defaultPan;
  return clampSectionPan(((focus - cropFraction / 2) / availableFraction) * 2 - 1);
}
