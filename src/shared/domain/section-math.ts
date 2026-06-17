/**
 * Canonical, transcript-agnostic section math core shared by the renderer
 * (`buildRemappedSectionsFromSegments`) and the main process (`computeSections`).
 *
 * The skeleton is: pad each raw segment, filter non-finite, apply per-segment
 * empty handling (clamp|drop), sort by start, merge per the configured predicate,
 * then remap the merged source-time segments onto a zero-based timeline cursor.
 *
 * Policy differences between callers are expressed via {@link SectionMathOptions}.
 * The core never knows about transcripts; it returns `sourceIndices` (the original
 * input indices that merged into each output) so callers can reattach metadata.
 */

/**
 * Rounds a numeric value to 3 decimal places (millisecond precision).
 */
export function roundMs(value: number): number {
  return Number(value.toFixed(3));
}

/** Raw input segment in source time. */
export interface RawSegmentInput {
  start: number;
  end: number;
}

/** Merged source-time segment with the original input indices that merged into it. */
export interface MergedSegment {
  start: number;
  end: number;
  sourceIndices: number[];
}

/** Policy parameters distinguishing the renderer and main call sites. */
export interface SectionMathOptions {
  /** Seconds of padding added on each side of every raw segment. */
  padding: number;
  /**
   * How to treat a segment whose padded `end <= start`:
   * `'clamp'` keeps it with `end = max(start, end)` (renderer);
   * `'drop'` removes it (main).
   */
  emptyHandling: 'clamp' | 'drop';
  /**
   * Merge predicate for adjacent sorted segments:
   * `true` merges when `current.start <= last.end` (renderer, touching merges);
   * `false` merges only when `current.start < last.end` (main, overlap only).
   */
  mergeTouching: boolean;
}

/** Padded segment carrying its original input index through sort and merge. */
interface PaddedSegment {
  start: number;
  end: number;
  sourceIndex: number;
}

/**
 * Pads, filters, sorts and merges raw source-time segments per the given policy.
 *
 * Each segment is padded (`start = max(0, rawStart - padding)`, `end = rawEnd + padding`),
 * dropped when either raw bound is non-finite, then `emptyHandling` is applied. The
 * survivors are sorted by start and merged per `mergeTouching`, unioning `end` and
 * concatenating the original input indices.
 */
export function buildMergedSegments(
  segments: RawSegmentInput[],
  options: SectionMathOptions
): MergedSegment[] {
  if (!Array.isArray(segments) || segments.length === 0) return [];

  const padded: PaddedSegment[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    const rawStart = Number(segment.start);
    const rawEnd = Number(segment.end);
    if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) continue;

    const start = Math.max(0, rawStart - options.padding);
    let end = rawEnd + options.padding;

    if (options.emptyHandling === 'clamp') {
      end = Math.max(start, end);
    } else {
      // 'drop'
      if (end <= start) continue;
    }

    padded.push({ start, end, sourceIndex: i });
  }

  if (padded.length === 0) return [];

  padded.sort((a, b) => a.start - b.start);

  const first = padded[0]!;
  const merged: MergedSegment[] = [{
    start: first.start,
    end: first.end,
    sourceIndices: [first.sourceIndex]
  }];

  for (let i = 1; i < padded.length; i++) {
    const current = padded[i]!;
    const last = merged[merged.length - 1]!;
    const shouldMerge = options.mergeTouching
      ? current.start <= last.end
      : current.start < last.end;
    if (shouldMerge) {
      last.end = Math.max(last.end, current.end);
      last.sourceIndices.push(current.sourceIndex);
    } else {
      merged.push({
        start: current.start,
        end: current.end,
        sourceIndices: [current.sourceIndex]
      });
    }
  }

  return merged;
}

/** Base (transcript-agnostic) section shape produced by the remap step. */
export interface BaseSection {
  id: string;
  index: number;
  sourceStart: number;
  sourceEnd: number;
  start: number;
  end: number;
  duration: number;
}

/**
 * Remaps merged source-time segments onto a zero-based timeline cursor.
 *
 * For each merged segment the source bounds are ms-rounded, the duration is
 * `max(0, sourceEnd - sourceStart)`, and the timeline `start`/`end` follow the
 * running cursor (also ms-rounded). Returns the base sections paired with the
 * `sourceIndices` from each merged segment so callers can reattach metadata.
 */
export function remapToTimeline(
  merged: MergedSegment[]
): { sections: BaseSection[]; sourceIndices: number[][] } {
  const sections: BaseSection[] = [];
  const sourceIndices: number[][] = [];
  let cursor = 0;

  for (let i = 0; i < merged.length; i++) {
    const segment = merged[i]!;
    const sourceStart = roundMs(segment.start);
    const sourceEnd = roundMs(segment.end);
    const duration = Math.max(0, sourceEnd - sourceStart);
    const start = roundMs(cursor);
    const end = roundMs(cursor + duration);
    sections.push({
      id: `section-${i + 1}`,
      index: i,
      sourceStart,
      sourceEnd,
      start,
      end,
      duration: roundMs(duration)
    });
    sourceIndices.push(segment.sourceIndices);
    cursor += duration;
  }

  return { sections, sourceIndices };
}
