import {
  getOverlayStateAtTime,
  applyOverlayTrimDelta
} from '../../src/renderer/features/timeline/overlay-utils.js';

interface OverlayPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Overlay {
  id: string;
  mediaPath: string;
  mediaType: string;
  startTime: number;
  endTime: number;
  sourceStart: number;
  sourceEnd: number;
  landscape: OverlayPosition;
  reel: OverlayPosition;
}

function makeOverlay(overrides: Partial<Overlay> = {}): Overlay {
  return {
    id: 'o1',
    mediaPath: 'overlay-media/img.png',
    mediaType: 'image',
    startTime: 5,
    endTime: 10,
    sourceStart: 0,
    sourceEnd: 5,
    landscape: { x: 200, y: 100, width: 400, height: 300 },
    reel: { x: 50, y: 200, width: 300, height: 200 },
    ...overrides
  };
}

describe('renderer/features/timeline/overlay-utils', () => {
  test('returns inactive when no overlays', () => {
    expect(getOverlayStateAtTime(5, [], 'landscape')).toEqual({ active: false });
    expect(getOverlayStateAtTime(5, null, 'landscape')).toEqual({ active: false });
  });

  test('returns inactive when time is outside all overlay ranges', () => {
    const overlays = [makeOverlay({ startTime: 5, endTime: 10 })];
    expect(getOverlayStateAtTime(3, overlays, 'landscape').active).toBe(false);
    expect(getOverlayStateAtTime(12, overlays, 'landscape').active).toBe(false);
  });

  test('returns active with full opacity when well within range', () => {
    const overlays = [makeOverlay({ startTime: 5, endTime: 10 })];
    const state = getOverlayStateAtTime(7, overlays, 'landscape');
    expect(state.active).toBe(true);
    expect(state.opacity).toBe(1);
    expect(state.overlayId).toBe('o1');
    expect(state.x).toBe(200);
    expect(state.y).toBe(100);
    expect(state.width).toBe(400);
    expect(state.height).toBe(300);
  });

  test('fade in during TRANSITION_DURATION at start', () => {
    const overlays = [makeOverlay({ startTime: 5, endTime: 10 })];
    const state = getOverlayStateAtTime(5.15, overlays, 'landscape');
    expect(state.active).toBe(true);
    expect(state.opacity).toBeCloseTo(0.5, 1);
  });

  test('fade out during TRANSITION_DURATION at end', () => {
    const overlays = [makeOverlay({ startTime: 5, endTime: 10 })];
    const state = getOverlayStateAtTime(9.85, overlays, 'landscape');
    expect(state.active).toBe(true);
    expect(state.opacity).toBeCloseTo(0.5, 1);
  });

  test('uses reel mode position when outputMode is reel', () => {
    const overlays = [makeOverlay()];
    const state = getOverlayStateAtTime(7, overlays, 'reel');
    expect(state.x).toBe(50);
    expect(state.y).toBe(200);
    expect(state.width).toBe(300);
    expect(state.height).toBe(200);
  });

  test('computes sourceTime for video overlays', () => {
    const overlays = [makeOverlay({ mediaType: 'video', sourceStart: 10, sourceEnd: 15 })];
    const state = getOverlayStateAtTime(7, overlays, 'landscape');
    expect(state.sourceTime).toBe(12);
  });

  test('sourceTime is 0 for image overlays', () => {
    const overlays = [makeOverlay({ mediaType: 'image' })];
    const state = getOverlayStateAtTime(7, overlays, 'landscape');
    expect(state.sourceTime).toBe(0);
  });

  test('first segment stays at own position approaching boundary (no interpolation)', () => {
    const overlays = [
      makeOverlay({ id: 'o1', startTime: 5, endTime: 10, landscape: { x: 100, y: 100, width: 400, height: 300 } }),
      makeOverlay({ id: 'o2', startTime: 10, endTime: 15, landscape: { x: 500, y: 300, width: 400, height: 300 } })
    ];
    const state = getOverlayStateAtTime(9.85, overlays, 'landscape');
    expect(state.active).toBe(true);
    expect(state.opacity).toBe(1);
    // First segment does NOT interpolate — stays at its own position
    expect(state.x).toBe(100);
    expect(state.y).toBe(100);
  });

  test('interpolates position between adjacent same-media segments past boundary', () => {
    const overlays = [
      makeOverlay({ id: 'o1', startTime: 5, endTime: 10, landscape: { x: 100, y: 100, width: 400, height: 300 } }),
      makeOverlay({ id: 'o2', startTime: 10, endTime: 15, landscape: { x: 500, y: 300, width: 400, height: 300 } })
    ];
    const state = getOverlayStateAtTime(10.15, overlays, 'landscape');
    expect(state.active).toBe(true);
    expect(state.overlayId).toBe('o2');
    expect(state.opacity).toBe(1);
    expect(state.x).toBeCloseTo(300, 0);
    expect(state.y).toBeCloseTo(200, 0);
  });

  test('no position interpolation for different-media adjacent segments', () => {
    const overlays = [
      makeOverlay({ id: 'o1', mediaPath: 'a.png', startTime: 5, endTime: 10, landscape: { x: 100, y: 100, width: 400, height: 300 } }),
      makeOverlay({ id: 'o2', mediaPath: 'b.png', startTime: 10, endTime: 15, landscape: { x: 500, y: 300, width: 400, height: 300 } })
    ];
    const state = getOverlayStateAtTime(9.85, overlays, 'landscape');
    expect(state.x).toBe(100);
    expect(state.opacity).toBeCloseTo(0.5, 1);
  });
});

// ── applyOverlayTrimDelta tests ───────────────────────────────────────

interface MinimalOverlay {
  id: string;
  trackIndex: number;
  startTime: number;
  endTime: number;
  sourceStart: number;
  sourceEnd: number;
}

function makeMinimalOverlay(overrides: Partial<MinimalOverlay> = {}): MinimalOverlay {
  return {
    id: 'ov1',
    trackIndex: 0,
    startTime: 0,
    endTime: 30,
    sourceStart: 0,
    sourceEnd: 30,
    ...overrides
  };
}

function snap(o: MinimalOverlay): OverlayTrimSnapshot {
  return {
    id: o.id,
    originalStartTime: o.startTime,
    originalEndTime: o.endTime,
    originalSourceStart: o.sourceStart,
    originalSourceEnd: o.sourceEnd
  };
}

describe('applyOverlayTrimDelta', () => {
  describe('left-edge shortening', () => {
    test('advances sourceStart for edge-aligned overlay on first section', () => {
      // Section: sourceStart 0→10, after recalculate start=0, end=20
      // Overlay starts at section start (edge-aligned)
      const overlay = makeMinimalOverlay({ startTime: 0, endTime: 30, sourceStart: 0, sourceEnd: 30 });
      const snaps = [snap(overlay)];
      const ctx = {
        trimEdge: 'left',
        sourceDelta: 10,       // sourceStart moved from 0 to 10
        durationDelta: -10,    // was 30s, now 20s
        sectionStart: 0,       // after recalculate (first section)
        sectionEnd: 20,        // after recalculate
        origSectionStart: 0,
        origSectionEnd: 30
      };

      applyOverlayTrimDelta([overlay] as unknown as Parameters<typeof applyOverlayTrimDelta>[0], snaps, ctx);

      // sourceStart should advance by 10 (matching section's source advance)
      expect(overlay.sourceStart).toBeCloseTo(10, 2);
      // endTime should be clamped to sectionEnd (20)
      expect(overlay.endTime).toBeCloseTo(20, 2);
      // sourceEnd stays at 30: source 10→30 = 20s matches timeline 0→20
      expect(overlay.sourceEnd).toBeCloseTo(30, 2);
    });

    test('advances sourceStart for edge-aligned overlay on non-first section', () => {
      // Section 2: sourceStart 0→5, after recalculate start=15, end=20
      // (Section 1 is 0-15, then section 2 follows)
      const overlay = makeMinimalOverlay({ startTime: 15, endTime: 25, sourceStart: 0, sourceEnd: 10 });
      const snaps = [snap(overlay)];
      const ctx = {
        trimEdge: 'left',
        sourceDelta: 5,        // sourceStart moved from 0 to 5
        durationDelta: -5,     // was 10s, now 5s
        sectionStart: 15,      // after recalculate
        sectionEnd: 20,        // after recalculate
        origSectionStart: 15,
        origSectionEnd: 25
      };

      applyOverlayTrimDelta([overlay] as unknown as Parameters<typeof applyOverlayTrimDelta>[0], snaps, ctx);

      expect(overlay.sourceStart).toBeCloseTo(5, 2);
      expect(overlay.endTime).toBeCloseTo(20, 2);
    });

    test('clamps overlay endTime to sectionEnd when section shrinks', () => {
      // Single section trimmed from left: sourceStart 0→10, duration 30→20
      // Overlay spans full section
      const overlay = makeMinimalOverlay({ startTime: 0, endTime: 30, sourceStart: 0, sourceEnd: 30 });
      const snaps = [snap(overlay)];
      const ctx = {
        trimEdge: 'left',
        sourceDelta: 10,
        durationDelta: -10,
        sectionStart: 0,
        sectionEnd: 20,
        origSectionStart: 0,
        origSectionEnd: 30
      };

      applyOverlayTrimDelta([overlay] as unknown as Parameters<typeof applyOverlayTrimDelta>[0], snaps, ctx);

      // endTime clamped to sectionEnd
      expect(overlay.endTime).toBeCloseTo(20, 2);
      // sourceEnd recomputed: sourceStart=10, timeline duration=20, rate=1:1 → sourceEnd=30
      expect(overlay.sourceEnd).toBeCloseTo(30, 2);
      // Net result: source 10→30 (20s) mapped to timeline 0→20 (20s) ✓
    });

    test('preserves correct source mapping: overlay plays section source range', () => {
      // This is THE critical test for the bug fix.
      // After left-edge trim, the overlay should play exactly the section's source range.
      const overlay = makeMinimalOverlay({ startTime: 0, endTime: 30, sourceStart: 0, sourceEnd: 30 });
      const snaps = [snap(overlay)];
      const ctx = {
        trimEdge: 'left',
        sourceDelta: 10,
        durationDelta: -10,
        sectionStart: 0,
        sectionEnd: 20,
        origSectionStart: 0,
        origSectionEnd: 30
      };

      applyOverlayTrimDelta([overlay] as unknown as Parameters<typeof applyOverlayTrimDelta>[0], snaps, ctx);

      // The overlay should now play source 10→30 over timeline 0→20
      expect(overlay.sourceStart).toBeCloseTo(10, 2);
      expect(overlay.sourceEnd).toBeCloseTo(30, 2);
      expect(overlay.startTime).toBeCloseTo(0, 2);
      expect(overlay.endTime).toBeCloseTo(20, 2);
    });
  });

  describe('right-edge shortening', () => {
    test('trims overlay endTime and sourceEnd when section right edge shortened', () => {
      // Section: sourceEnd 30→20, after recalculate start=0, end=20
      const overlay = makeMinimalOverlay({ startTime: 0, endTime: 30, sourceStart: 0, sourceEnd: 30 });
      const snaps = [snap(overlay)];
      const ctx = {
        trimEdge: 'right',
        sourceDelta: -10,      // sourceEnd moved from 30 to 20
        durationDelta: -10,
        sectionStart: 0,
        sectionEnd: 20,
        origSectionStart: 0,
        origSectionEnd: 30
      };

      applyOverlayTrimDelta([overlay] as unknown as Parameters<typeof applyOverlayTrimDelta>[0], snaps, ctx);

      expect(overlay.endTime).toBeCloseTo(20, 2);
      expect(overlay.sourceEnd).toBeCloseTo(20, 2);
      expect(overlay.sourceStart).toBeCloseTo(0, 2);
    });
  });

  describe('left-edge extending', () => {
    test('extends edge-aligned overlay sourceStart when section left edge extended', () => {
      // Section: sourceStart 10→5, after recalculate start=0, end=25
      // (section was start=0, end=20, now start=0, end=25 with 5 more at start)
      const overlay = makeMinimalOverlay({ startTime: 0, endTime: 20, sourceStart: 10, sourceEnd: 30 });
      const snaps = [snap(overlay)];
      const ctx = {
        trimEdge: 'left',
        sourceDelta: -5,       // sourceStart moved from 10 to 5
        durationDelta: 5,      // was 20s, now 25s
        sectionStart: 0,       // after recalculate
        sectionEnd: 25,        // after recalculate
        origSectionStart: 0,
        origSectionEnd: 20
      };

      applyOverlayTrimDelta([overlay] as unknown as Parameters<typeof applyOverlayTrimDelta>[0], snaps, ctx);

      // Edge-aligned overlay should extend: startTime decreases, sourceStart decreases
      expect(overlay.sourceStart).toBeCloseTo(5, 2);
    });
  });
});
