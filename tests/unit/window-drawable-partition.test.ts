import { describe, it, expect } from 'vitest';
import { partitionDrawableWindows } from '../../src/renderer/features/capture/window-drawable.js';

// partitionDrawableWindows backs the source-picker "drop never-ready windows"
// policy: a window <video> whose decoded frame never reached non-zero
// dimensions (occluded / offscreen / degenerate windows like an "App Icon
// Window") must be dropped so it is never recorded into a 0-byte / undecodable
// .webm that breaks proxy generation and the render/export.

describe('partitionDrawableWindows', () => {
  it('keeps windows with non-zero width and height', () => {
    const { keptIndices, droppedIndices } = partitionDrawableWindows([
      { videoWidth: 1920, videoHeight: 1080 },
      { videoWidth: 1280, videoHeight: 720 }
    ]);
    expect(keptIndices).toEqual([0, 1]);
    expect(droppedIndices).toEqual([]);
  });

  it('drops a window that never became drawable (videoWidth === 0)', () => {
    const { keptIndices, droppedIndices } = partitionDrawableWindows([
      { videoWidth: 1920, videoHeight: 1080 },
      { videoWidth: 0, videoHeight: 0 }
    ]);
    expect(keptIndices).toEqual([0]);
    expect(droppedIndices).toEqual([1]);
  });

  it('treats a window with width but zero height as undrawable', () => {
    const { keptIndices, droppedIndices } = partitionDrawableWindows([
      { videoWidth: 800, videoHeight: 0 }
    ]);
    expect(keptIndices).toEqual([]);
    expect(droppedIndices).toEqual([0]);
  });

  it('treats a window with height but zero width as undrawable', () => {
    const { keptIndices, droppedIndices } = partitionDrawableWindows([
      { videoWidth: 0, videoHeight: 600 }
    ]);
    expect(keptIndices).toEqual([]);
    expect(droppedIndices).toEqual([0]);
  });

  it('preserves original indices so callers can keep arrays index-aligned', () => {
    // Only the middle window is drawable; the kept index must point at it so a
    // caller mapping windowStreams/windowVideos/windowSourceNames stays aligned.
    const { keptIndices, droppedIndices } = partitionDrawableWindows([
      { videoWidth: 0, videoHeight: 0 },
      { videoWidth: 1920, videoHeight: 1080 },
      { videoWidth: 0, videoHeight: 0 }
    ]);
    expect(keptIndices).toEqual([1]);
    expect(droppedIndices).toEqual([0, 2]);
  });

  it('returns empty partitions for no windows', () => {
    const { keptIndices, droppedIndices } = partitionDrawableWindows([]);
    expect(keptIndices).toEqual([]);
    expect(droppedIndices).toEqual([]);
  });

  it('drops every window when none became drawable', () => {
    const { keptIndices, droppedIndices } = partitionDrawableWindows([
      { videoWidth: 0, videoHeight: 0 },
      { videoWidth: 0, videoHeight: 0 }
    ]);
    expect(keptIndices).toEqual([]);
    expect(droppedIndices).toEqual([0, 1]);
  });
});
