/**
 * Browser-safe project field helpers: overlay/audio-overlay ID generation and
 * the PiP-scale / export-audio-preset normalizers. These are the only pieces of
 * project-domain logic the renderer consumes, and they have NO Node dependencies
 * (unlike project.ts, which imports `path` for project-file resolution). Keeping
 * them here lets the renderer bundle consume them without pulling Node built-ins.
 * project.ts re-exports these so the main process keeps importing them unchanged.
 */

import {
  MIN_PIP_SCALE,
  MAX_PIP_SCALE,
  DEFAULT_PIP_SCALE,
  EXPORT_AUDIO_PRESET_OFF,
  EXPORT_AUDIO_PRESET_COMPRESSED
} from '../types/domain.js';
import type { ExportAudioPreset } from '../types/domain.js';

let overlayIdCounter = 0;
let audioOverlayIdCounter = 0;

export function generateOverlayId(): string {
  overlayIdCounter += 1;
  return `overlay-${Date.now()}-${overlayIdCounter}`;
}

export function generateAudioOverlayId(): string {
  audioOverlayIdCounter += 1;
  return `audio-overlay-${Date.now()}-${audioOverlayIdCounter}`;
}

export function normalizePipScale(value: unknown): number {
  if (value === null || value === undefined) return DEFAULT_PIP_SCALE;
  const v = Number(value);
  if (!Number.isFinite(v)) return DEFAULT_PIP_SCALE;
  return Math.max(MIN_PIP_SCALE, Math.min(MAX_PIP_SCALE, v));
}

export function normalizeExportAudioPreset(value: unknown): ExportAudioPreset {
  return value === EXPORT_AUDIO_PRESET_OFF
    ? EXPORT_AUDIO_PRESET_OFF
    : EXPORT_AUDIO_PRESET_COMPRESSED;
}
