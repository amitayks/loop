// ── Window drawability partition (pure, DOM-free) ───────────────────
//
// Backs the source-picker "drop never-ready windows" policy. A window <video>
// is only drawable once its decoded frame reports non-zero dimensions. Occluded
// / offscreen / degenerate windows (e.g. an "App Icon Window") never reach that
// and would otherwise be recorded into a 0-byte / undecodable .webm that breaks
// proxy generation and the render/export. Kept DOM-free so it is unit-testable
// in the node test environment without a DOM fixture.

// Minimal shape of a window <video> needed to decide drawability.
export interface DrawableProbe {
  videoWidth: number;
  videoHeight: number;
}

// Pure partition: given the index-aligned window videos, return which indices
// are drawable (non-zero width AND height) and which are not. Indices are
// preserved so callers can keep their index-aligned arrays
// (streams / videos / source names) consistent.
export function partitionDrawableWindows(videos: ReadonlyArray<DrawableProbe>): {
  keptIndices: number[];
  droppedIndices: number[];
} {
  const keptIndices: number[] = [];
  const droppedIndices: number[] = [];
  for (let i = 0; i < videos.length; i++) {
    const v = videos[i]!;
    if (v.videoWidth > 0 && v.videoHeight > 0) keptIndices.push(i);
    else droppedIndices.push(i);
  }
  return { keptIndices, droppedIndices };
}
