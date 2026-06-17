import {
  roundMs,
  TRIM_PADDING,
  buildRemappedSectionsFromSegments,
  normalizeSections,
  buildDefaultSectionsForDuration,
  normalizeTakeSections,
  attachSectionTranscripts
} from '../../src/renderer/features/timeline/section-utils.js';

describe('section-utils', () => {
  describe('roundMs', () => {
    test('rounds to 3 decimal places', () => {
      expect(roundMs(1.23456)).toBe(1.235);
      expect(roundMs(0.001)).toBe(0.001);
    });
  });

  describe('TRIM_PADDING', () => {
    test('is 0.15', () => {
      expect(TRIM_PADDING).toBe(0.15);
    });
  });

  describe('buildRemappedSectionsFromSegments', () => {
    test('returns empty for empty or non-array input', () => {
      expect(buildRemappedSectionsFromSegments([])).toEqual([]);
      expect(buildRemappedSectionsFromSegments(null)).toEqual([]);
    });
    test('builds sections with padding and timeline mapping', () => {
      const segments = [
        { start: 1, end: 2, text: 'hello' },
        { start: 3, end: 4, text: 'world' }
      ];
      const result = buildRemappedSectionsFromSegments(segments);
      expect(result).toHaveLength(2);
      expect(result[0]!.id).toBe('section-1');
      expect(result[0]!.transcript).toBe('hello');
      expect(result[1]!.transcript).toBe('world');
      expect(result[0]!.sourceStart).toBeLessThan(1);
      expect(result[0]!.sourceEnd).toBeGreaterThan(2);
    });
    test('merges overlapping segments', () => {
      const segments = [
        { start: 0, end: 1, text: 'a' },
        { start: 0.5, end: 1.5, text: 'b' }
      ];
      const result = buildRemappedSectionsFromSegments(segments);
      expect(result).toHaveLength(1);
      expect(result[0]!.transcript).toMatch(/a/);
      expect(result[0]!.transcript).toMatch(/b/);
    });
  });

  describe('normalizeSections', () => {
    test('returns empty for zero duration and no input', () => {
      expect(normalizeSections([], 0)).toEqual([]);
    });
    test('creates default section when input empty but duration > 0', () => {
      const result = normalizeSections([], 10);
      expect(result).toHaveLength(1);
      expect(result[0]!.start).toBe(0);
      expect(result[0]!.end).toBe(10);
      expect(result[0]!.label).toBe('Section 1');
    });
    test('normalizes raw sections with transcript', () => {
      const raw = [{ start: 0, end: 5, transcript: '  hello  world  ' }];
      const result = normalizeSections(raw, 10);
      expect(result[0]!.transcript).toBe('hello world');
      expect(result[0]!.index).toBe(0);
      expect(result[0]!.duration).toBe(5);
    });
    test('preserves saved field on sections', () => {
      const raw = [
        { start: 0, end: 3, saved: true },
        { start: 3, end: 6, saved: false },
        { start: 6, end: 9 }
      ];
      const result = normalizeSections(raw, 9);
      expect(result[0]!.saved).toBe(true);
      expect(result[1]!.saved).toBe(false);
      expect(result[2]!.saved).toBe(false);
    });
    test('does NOT clamp sourceStart/sourceEnd against duration argument', () => {
      // Regression: normalizeSections is called during project load with
      // duration = timeline duration (not take source duration). Source
      // pointers correctly reference the take's full recording range, which
      // can be larger than the timeline duration. Clamping them here would
      // destroy the source pointers and break playback/render.
      const raw = [
        { start: 0, end: 2.53, sourceStart: 100, sourceEnd: 102.53 },
        { start: 2.53, end: 5, sourceStart: 200, sourceEnd: 202.47 }
      ];
      const result = normalizeSections(raw, 13.27); // timeline duration
      expect(result[0]!.sourceStart).toBe(100);
      expect(result[0]!.sourceEnd).toBe(102.53);
      expect(result[1]!.sourceStart).toBe(200);
      expect(result[1]!.sourceEnd).toBe(202.47);
    });
  });

  describe('buildDefaultSectionsForDuration', () => {
    test('returns empty for zero or negative duration', () => {
      expect(buildDefaultSectionsForDuration(0)).toEqual([]);
      expect(buildDefaultSectionsForDuration(-1)).toEqual([]);
    });
    test('returns single section spanning duration', () => {
      const result = buildDefaultSectionsForDuration(5);
      expect(result).toHaveLength(1);
      expect(result[0]!.sourceStart).toBe(0);
      expect(result[0]!.sourceEnd).toBe(5);
      expect(result[0]!.start).toBe(0);
      expect(result[0]!.end).toBe(5);
    });
  });

  describe('normalizeTakeSections', () => {
    test('falls back to default when normalizeSections returns empty', () => {
      const result = normalizeTakeSections([], 5);
      expect(result).toHaveLength(1);
      expect(result[0]!.end).toBe(5);
    });
    test('uses normalized sections when available', () => {
      const raw = [{ start: 0, end: 3 }];
      const result = normalizeTakeSections(raw, 10);
      expect(result).toHaveLength(1);
      expect(result[0]!.end).toBe(3);
    });
    test('clamps sourceStart/sourceEnd to take duration (fresh take path)', () => {
      // For fresh takes, duration IS the source duration, so clamping is valid
      const raw = [
        { start: 0, end: 5, sourceStart: 0, sourceEnd: 5.15 } // Scribe padding overshoot
      ];
      const result = normalizeTakeSections(raw, 5);
      expect(result[0]!.sourceEnd).toBe(5); // clamped to duration
    });
    test('drops sections whose source range becomes zero after clamping', () => {
      const raw = [
        { start: 0, end: 5, sourceStart: 10, sourceEnd: 15 } // entirely beyond duration
      ];
      const result = normalizeTakeSections(raw, 5);
      // Section gets dropped because sourceEnd clamp == sourceStart clamp = 5
      expect(result).toHaveLength(0);
    });
  });

  describe('attachSectionTranscripts', () => {
    test('preserves existing transcript on section', () => {
      const sections = [{ id: 's1', transcript: 'existing' }];
      const result = attachSectionTranscripts(sections, []);
      expect(result[0]!.transcript).toBe('existing');
    });
    test('attaches by index when no existing transcript', () => {
      const sections = [{ id: 's1', sourceStart: 0, sourceEnd: 1 }];
      const transcriptSource = [{ transcript: 'from index' }];
      const result = attachSectionTranscripts(sections, transcriptSource);
      expect(result[0]!.transcript).toBe('from index');
    });
    test('handles empty inputs', () => {
      expect(attachSectionTranscripts([], [])).toEqual([]);
    });
  });
});
