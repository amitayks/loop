/**
 * Section normalization and remap helpers for the timeline.
 */

import type { Section } from '../../../shared/types/domain.js';
import { normalizeTranscriptText } from '../transcript/transcript-utils.js';
import {
  roundMs,
  buildMergedSegments,
  remapToTimeline
} from '../../../shared/domain/section-math.js';

export { roundMs } from '../../../shared/domain/section-math.js';

export const TRIM_PADDING = 0.15;

/** Section shape produced by the renderer — may lack `label` / `saved` before full normalization. */
export type RendererSection = Omit<Section, 'label' | 'saved'> & {
  label?: string;
  saved?: boolean;
};

/** Input segment shape accepted by buildRemappedSectionsFromSegments. */
interface SpeechSegment {
  start: number;
  end: number;
  text?: string;
}

/** Raw section input accepted by normalizeSections. */
interface RawSection {
  id?: string;
  start: unknown;
  end: unknown;
  sourceStart?: unknown;
  sourceEnd?: unknown;
  takeId?: string;
  transcript?: string;
  text?: string;
  saved?: boolean;
}

/**
 * Builds remapped sections from speech segments (padding, merge, timeline mapping).
 *
 * Delegates pad/filter/sort/merge/remap to the shared, transcript-agnostic
 * section-math core, then reattaches transcripts via the `sourceIndices` the
 * core hands back (renderer policy: clamp empty segments, merge when touching).
 */
export function buildRemappedSectionsFromSegments(segments: SpeechSegment[]): RendererSection[] {
  if (!Array.isArray(segments) || segments.length === 0) return [];

  const merged = buildMergedSegments(segments, {
    padding: TRIM_PADDING,
    emptyHandling: 'clamp',
    mergeTouching: true
  });
  const { sections, sourceIndices } = remapToTimeline(merged);

  return sections.map((section, i): RendererSection => {
    const transcript = normalizeTranscriptText(
      sourceIndices[i]!
        .map((idx) => normalizeTranscriptText(segments[idx]?.text))
        .filter((text) => text)
        .join(' ')
    );
    return {
      ...section,
      transcript,
      takeId: null,
      volume: 1.0
    };
  });
}

/**
 * Normalizes raw sections: validates times, clamps to duration, adds index/label/duration.
 */
export function normalizeSections(rawSections: unknown, duration: unknown): Section[] {
  const safeDuration = Math.max(0, Number(duration) || 0);
  const input = Array.isArray(rawSections) ? rawSections as RawSection[] : [];
  const baseSections: RawSection[] = input.length > 0
    ? input
    : (safeDuration > 0 ? [{ id: 'section-1', start: 0, end: safeDuration }] : []);

  const normalized = baseSections
    .map((section, idx) => {
      let start = Number(section.start);
      let end = Number(section.end);
      if (!Number.isFinite(start)) start = 0;
      if (!Number.isFinite(end)) end = start;
      const transcript = normalizeTranscriptText(
        typeof section.transcript === 'string'
          ? section.transcript
          : (typeof section.text === 'string' ? section.text : '')
      );
      start = Math.max(0, start);
      end = Math.max(start, end);

      if (safeDuration > 0) {
        start = Math.min(start, safeDuration);
        end = Math.min(end, safeDuration);
      }

      // NOTE: sourceStart/sourceEnd are NOT clamped here because `duration` may
      // be either the take's source duration (fresh take) OR the timeline duration
      // (loaded project). Clamping against the timeline duration destroys source
      // pointers that correctly point into the take's full recording range.
      // Source-range clamping happens in normalizeTakeSections, which is only
      // called when duration == take source duration.
      const sourceStart = Number.isFinite(Number(section.sourceStart)) ? Number(section.sourceStart) : start;
      const sourceEnd = Number.isFinite(Number(section.sourceEnd)) ? Number(section.sourceEnd) : end;

      return {
        id: section.id || `section-${idx + 1}`,
        index: 0,
        label: '',
        sourceStart,
        sourceEnd,
        start: roundMs(start),
        end: roundMs(end),
        duration: 0,
        takeId: typeof section.takeId === 'string' && section.takeId ? section.takeId : null,
        transcript,
        saved: !!section.saved,
        volume: 1.0
      };
    })
    .filter(section => section.end - section.start > 0.0001)
    .sort((a, b) => a.start - b.start);

  if (normalized.length === 0) return [];

  if (safeDuration > 0) {
    const last = normalized[normalized.length - 1]!;
    const drift = Math.abs(safeDuration - last.end);
    if (drift <= 0.2) {
      last.end = roundMs(safeDuration);
    }
  }

  for (let i = 0; i < normalized.length; i++) {
    const section = normalized[i]!;
    section.index = i;
    section.label = `Section ${i + 1}`;
    section.duration = roundMs(Math.max(0, section.end - section.start));
  }

  return normalized;
}

/**
 * Builds a single default section spanning the full duration.
 */
export function buildDefaultSectionsForDuration(duration: unknown): Section[] {
  const safeDuration = Math.max(0, Number(duration) || 0);
  if (safeDuration <= 0) return [];
  return [{
    id: 'section-1',
    index: 0,
    label: 'Section 1',
    sourceStart: 0,
    sourceEnd: roundMs(safeDuration),
    start: 0,
    end: roundMs(safeDuration),
    duration: roundMs(safeDuration),
    transcript: '',
    takeId: null,
    saved: false,
    volume: 1.0
  }];
}

/**
 * Normalizes sections for a freshly-recorded take. Here `duration` is the
 * take's source/recording duration, so source ranges can be safely clamped
 * against it (protects against Scribe padding overshoot, etc).
 */
export function normalizeTakeSections(rawSections: unknown, duration: unknown): Section[] {
  const safeDuration = Math.max(0, Number(duration) || 0);
  const normalized = normalizeSections(rawSections, duration);
  if (normalized.length === 0) {
    return buildDefaultSectionsForDuration(duration);
  }

  // Clamp source ranges to the take's recording duration
  if (safeDuration > 0) {
    for (const section of normalized) {
      section.sourceStart = Math.max(0, Math.min(section.sourceStart, safeDuration));
      section.sourceEnd = Math.max(section.sourceStart, Math.min(section.sourceEnd, safeDuration));
      // Drop sections that became zero-duration after clamping
    }
  }

  return normalized.filter(s => s.sourceEnd - s.sourceStart > 0.0001);
}

/** Transcript-bearing section candidate used for attachment. */
interface TranscriptCandidate {
  sourceStart?: unknown;
  sourceEnd?: unknown;
  transcript?: string;
  text?: string;
}

/** Input section shape for attachSectionTranscripts. */
interface AttachableSection {
  sourceStart?: unknown;
  sourceEnd?: unknown;
  transcript?: string;
  text?: string;
  [key: string]: unknown;
}

/**
 * Attaches transcript text to sections by index or source time overlap.
 */
export function attachSectionTranscripts(
  sections: unknown,
  transcriptSections: unknown
): AttachableSection[] {
  const baseSections = Array.isArray(sections) ? sections as AttachableSection[] : [];
  const transcriptSource = Array.isArray(transcriptSections) ? transcriptSections as TranscriptCandidate[] : [];

  return baseSections.map((section, index) => {
    const existing = normalizeTranscriptText(
      typeof section.transcript === 'string'
        ? section.transcript
        : (typeof section.text === 'string' ? section.text : '')
    );
    if (existing) {
      return { ...section, transcript: existing };
    }

    const byIndex = transcriptSource[index];
    let transcript = normalizeTranscriptText(byIndex?.transcript || byIndex?.text || '');

    if (!transcript) {
      const sourceStart = Number(section.sourceStart);
      const sourceEnd = Number(section.sourceEnd);
      if (Number.isFinite(sourceStart) && Number.isFinite(sourceEnd)) {
        const bySource = transcriptSource.find((candidate) => {
          const candidateStart = Number(candidate?.sourceStart);
          const candidateEnd = Number(candidate?.sourceEnd);
          return Number.isFinite(candidateStart)
            && Number.isFinite(candidateEnd)
            && Math.abs(candidateStart - sourceStart) <= 0.05
            && Math.abs(candidateEnd - sourceEnd) <= 0.05;
        });
        transcript = normalizeTranscriptText(bySource?.transcript || bySource?.text || '');
      }
    }

    return { ...section, transcript };
  });
}
