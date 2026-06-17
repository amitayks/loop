import {
  roundMs,
  buildMergedSegments,
  remapToTimeline
} from '../../src/shared/domain/section-math.js';
import type { SectionMathOptions } from '../../src/shared/domain/section-math.js';

const CLAMP_TOUCHING: SectionMathOptions = {
  padding: 0.15,
  emptyHandling: 'clamp',
  mergeTouching: true
};

const DROP_OVERLAP: SectionMathOptions = {
  padding: 0.15,
  emptyHandling: 'drop',
  mergeTouching: false
};

describe('roundMs', () => {
  test('rounds to 3 decimal places (millisecond precision)', () => {
    expect(roundMs(1.23456)).toBe(1.235);
  });
});

describe('buildMergedSegments', () => {
  test('pads two non-overlapping segments into two merged segments with correct sourceIndices', () => {
    const merged = buildMergedSegments(
      [{ start: 1, end: 2 }, { start: 5, end: 6 }],
      CLAMP_TOUCHING
    );

    expect(merged).toHaveLength(2);
    // padding 0.15 on each side
    expect(merged[0]!.start).toBeCloseTo(0.85, 10);
    expect(merged[0]!.end).toBeCloseTo(2.15, 10);
    expect(merged[0]!.sourceIndices).toEqual([0]);
    expect(merged[1]!.start).toBeCloseTo(4.85, 10);
    expect(merged[1]!.end).toBeCloseTo(6.15, 10);
    expect(merged[1]!.sourceIndices).toEqual([1]);
  });

  test('merges segments that overlap after padding, unioning end and concatenating sourceIndices', () => {
    // After padding 0.15: [0.85, 2.15] and [1.85, 3.15] overlap (1.85 < 2.15)
    const merged = buildMergedSegments(
      [{ start: 1, end: 2 }, { start: 2, end: 3 }],
      CLAMP_TOUCHING
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]!.start).toBeCloseTo(0.85, 10);
    expect(merged[0]!.end).toBeCloseTo(3.15, 10);
    expect(merged[0]!.sourceIndices).toEqual([0, 1]);
  });

  test("emptyHandling 'drop' removes a segment whose end<=start after padding", () => {
    // Negative padding makes end<=start: raw [1,1] with padding -0.5 => start=1.5, end=0.5
    const opts: SectionMathOptions = { padding: -0.5, emptyHandling: 'drop', mergeTouching: false };
    const merged = buildMergedSegments([{ start: 1, end: 1 }], opts);
    expect(merged).toEqual([]);
  });

  test("emptyHandling 'clamp' keeps a segment whose end<=start after padding, clamping end to start", () => {
    const opts: SectionMathOptions = { padding: -0.5, emptyHandling: 'clamp', mergeTouching: true };
    const merged = buildMergedSegments([{ start: 1, end: 1 }], opts);
    expect(merged).toHaveLength(1);
    // start = max(0, 1 - (-0.5)) = 1.5 ; end = 1 + (-0.5) = 0.5 -> clamped to 1.5
    expect(merged[0]!.start).toBeCloseTo(1.5, 10);
    expect(merged[0]!.end).toBeCloseTo(1.5, 10);
    expect(merged[0]!.sourceIndices).toEqual([0]);
  });

  test('mergeTouching=true merges segments where current.start exactly equals last.end', () => {
    // With padding 0, [0,1] and [1,2]: current.start (1) === last.end (1)
    const opts: SectionMathOptions = { padding: 0, emptyHandling: 'clamp', mergeTouching: true };
    const merged = buildMergedSegments([{ start: 0, end: 1 }, { start: 1, end: 2 }], opts);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.start).toBeCloseTo(0, 10);
    expect(merged[0]!.end).toBeCloseTo(2, 10);
    expect(merged[0]!.sourceIndices).toEqual([0, 1]);
  });

  test('mergeTouching=false keeps segments where current.start exactly equals last.end separate', () => {
    const opts: SectionMathOptions = { padding: 0, emptyHandling: 'drop', mergeTouching: false };
    const merged = buildMergedSegments([{ start: 0, end: 1 }, { start: 1, end: 2 }], opts);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.sourceIndices).toEqual([0]);
    expect(merged[1]!.sourceIndices).toEqual([1]);
  });

  test('drops segments with non-finite raw bounds', () => {
    const merged = buildMergedSegments(
      [{ start: Number.NaN, end: 2 }, { start: 5, end: 6 }],
      DROP_OVERLAP
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]!.sourceIndices).toEqual([1]);
  });

  test('returns empty array for empty input', () => {
    expect(buildMergedSegments([], CLAMP_TOUCHING)).toEqual([]);
  });
});

describe('remapToTimeline', () => {
  test('produces contiguous zero-based, ms-rounded sections with correct ids/durations and passthrough sourceIndices', () => {
    const merged = buildMergedSegments(
      [{ start: 1, end: 2 }, { start: 5, end: 6 }],
      CLAMP_TOUCHING
    );
    const { sections, sourceIndices } = remapToTimeline(merged);

    expect(sections).toHaveLength(2);

    const a = sections[0]!;
    expect(a.id).toBe('section-1');
    expect(a.index).toBe(0);
    expect(a.sourceStart).toBe(0.85);
    expect(a.sourceEnd).toBe(2.15);
    expect(a.duration).toBe(1.3);
    expect(a.start).toBe(0);
    expect(a.end).toBe(1.3);

    const b = sections[1]!;
    expect(b.id).toBe('section-2');
    expect(b.index).toBe(1);
    expect(b.sourceStart).toBe(4.85);
    expect(b.sourceEnd).toBe(6.15);
    expect(b.duration).toBe(1.3);
    // contiguous: starts where previous ended
    expect(b.start).toBe(a.end);
    expect(b.end).toBe(2.6);

    // sourceIndices passthrough aligns with sections
    expect(sourceIndices).toEqual([[0], [1]]);
    expect(sourceIndices[0]).toEqual(merged[0]!.sourceIndices);
    expect(sourceIndices[1]).toEqual(merged[1]!.sourceIndices);
  });

  test('returns empty result for empty merged input', () => {
    expect(remapToTimeline([])).toEqual({ sections: [], sourceIndices: [] });
  });
});
