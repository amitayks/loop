import type { ComputeSectionsOptions, ComputeSectionsResult } from '../../shared/types/services.js';
import { buildMergedSegments, remapToTimeline } from '../../shared/domain/section-math.js';

export function computeSections(opts: ComputeSectionsOptions = {}): ComputeSectionsResult {
  const segments = Array.isArray(opts.segments) ? opts.segments : [];
  const paddingSeconds = Number.isFinite(Number(opts.paddingSeconds))
    ? Math.max(0, Number(opts.paddingSeconds))
    : 0.15;

  const merged = buildMergedSegments(segments, {
    padding: paddingSeconds,
    emptyHandling: 'drop',
    mergeTouching: false
  });

  const { sections } = remapToTimeline(merged);

  return {
    sections,
    trimmedDuration: sections.length > 0 ? sections[sections.length - 1]!.end : 0
  };
}
