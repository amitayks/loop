import type { Overlay, AudioOverlay, OutputMode, OverlayMediaType } from '../../../shared/types/domain.js';
import { roundMs } from './section-utils.js';

const TRANSITION_DURATION = 0.3;

// ── Overlay Trim Snapshot ──────────────────────────────────────────

export interface OverlayTrimSnapshot {
  id: string;
  originalStartTime: number;
  originalEndTime: number;
  originalSourceStart: number;
  originalSourceEnd: number;
}

export interface OverlayTrimContext {
  trimEdge: 'left' | 'right';
  sourceDelta: number;       // how much the section's source boundary moved
  durationDelta: number;     // newDuration - oldDuration (negative when shortened)
  sectionStart: number;      // section.start after recalculate
  sectionEnd: number;        // section.end after recalculate
  origSectionStart: number;
  origSectionEnd: number;
}

/**
 * Adjust overlay times/sources after a section edge trim.
 *
 * SHORTEN: any overlay extending past the new section boundary is cut.
 *          For left-edge shortening, overlays also have their sourceStart
 *          advanced to match the section's source advance.
 * EXTEND:  only edge-aligned overlays are extended by the source delta.
 *
 * Pure function — mutates the overlay objects in-place.
 */
export function applyOverlayTrimDelta(
  overlayList: (Overlay | AudioOverlay)[],
  snaps: OverlayTrimSnapshot[],
  ctx: OverlayTrimContext
): void {
  const eps = 0.05;
  const { trimEdge, sourceDelta, durationDelta, sectionStart, sectionEnd, origSectionStart, origSectionEnd } = ctx;
  const isShortening = trimEdge === 'left' ? sourceDelta > 0.001 : sourceDelta < -0.001;
  const isExtending = trimEdge === 'left' ? sourceDelta < -0.001 : sourceDelta > 0.001;

  for (const snap of snaps) {
    const o = overlayList.find((ov) => ov.id === snap.id);
    if (!o) continue;
    const track = ('trackIndex' in o) ? (o as { trackIndex: number }).trackIndex : 0;

    if (trimEdge === 'right') {
      const edgeAligned = Math.abs(snap.originalEndTime - origSectionEnd) <= eps;

      if (isShortening) {
        // Cut any overlay whose endTime extends past the new section end
        if (snap.originalEndTime > sectionEnd + eps) {
          o.endTime = roundMs(sectionEnd);
          const timelineTrimmed = snap.originalEndTime - o.endTime;
          const overlayDuration = snap.originalEndTime - snap.originalStartTime;
          if (overlayDuration > 0) {
            const sourceSpan = snap.originalSourceEnd - snap.originalSourceStart;
            o.sourceEnd = roundMs(snap.originalSourceEnd - (sourceSpan * timelineTrimmed / overlayDuration));
          }
        }
      } else if (isExtending && edgeAligned) {
        let desiredEnd = roundMs(snap.originalEndTime + durationDelta);
        const neighbors = overlayList.filter(
          n => n.id !== o.id && ('trackIndex' in n ? (n as { trackIndex: number }).trackIndex : 0) === track && n.startTime > snap.originalEndTime - eps
        );
        if (neighbors.length > 0) {
          const nearestStart = Math.min(...neighbors.map(n => n.startTime));
          desiredEnd = Math.min(desiredEnd, nearestStart);
        }
        const actualDelta = desiredEnd - snap.originalEndTime;
        o.endTime = roundMs(desiredEnd);
        const fullDelta = durationDelta;
        const sourceAdjust = fullDelta !== 0 ? sourceDelta * (actualDelta / fullDelta) : 0;
        o.sourceEnd = roundMs(snap.originalSourceEnd + sourceAdjust);
      }
    } else {
      // Left edge
      const edgeAligned = Math.abs(snap.originalStartTime - origSectionStart) <= eps;

      if (isShortening) {
        const overlayDuration = snap.originalEndTime - snap.originalStartTime;
        const sourceSpan = snap.originalSourceEnd - snap.originalSourceStart;
        const sourceRate = overlayDuration > 0 ? sourceSpan / overlayDuration : 0;

        // Advance sourceStart by the section's source delta (proportional to overlap)
        if (edgeAligned && overlayDuration > 0) {
          // Edge-aligned: advance sourceStart by the full sourceDelta
          o.sourceStart = roundMs(snap.originalSourceStart + sourceDelta);
        } else if (snap.originalStartTime < sectionStart - eps && overlayDuration > 0) {
          // Overlay starts before new section start — clip at boundary
          o.startTime = roundMs(sectionStart);
          const timelineTrimmed = o.startTime - snap.originalStartTime;
          o.sourceStart = roundMs(snap.originalSourceStart + (sourceSpan * timelineTrimmed / overlayDuration));
        }

        // Clamp endTime to sectionEnd (section got shorter, overlay may overshoot)
        if (snap.originalEndTime > sectionEnd + eps) {
          o.endTime = roundMs(sectionEnd);
        }

        // Recompute sourceEnd from the final timeline duration and source rate
        // so sourceStart advance and endTime clamp don't compound incorrectly
        if (overlayDuration > 0) {
          const finalTimelineDuration = o.endTime - o.startTime;
          o.sourceEnd = roundMs(o.sourceStart + finalTimelineDuration * sourceRate);
        }
      } else if (isExtending && edgeAligned) {
        let desiredStart = roundMs(snap.originalStartTime + durationDelta);
        const neighbors = overlayList.filter(
          n => n.id !== o.id && ('trackIndex' in n ? (n as { trackIndex: number }).trackIndex : 0) === track && n.endTime < snap.originalStartTime + eps
        );
        if (neighbors.length > 0) {
          const nearestEnd = Math.max(...neighbors.map(n => n.endTime));
          desiredStart = Math.max(desiredStart, nearestEnd);
        }
        desiredStart = Math.max(0, desiredStart);
        const actualDelta = desiredStart - snap.originalStartTime;
        o.startTime = roundMs(desiredStart);
        const fullDelta = durationDelta;
        const sourceAdjust = fullDelta !== 0 ? sourceDelta * (actualDelta / fullDelta) : 0;
        o.sourceStart = roundMs(Math.max(0, snap.originalSourceStart + sourceAdjust));
      }
    }
  }
}

/** Returned when the playhead is inside an overlay's time span. */
export interface OverlayStateActive {
  active: true;
  overlayId: string;
  mediaPath: string;
  mediaType: OverlayMediaType;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  sourceTime: number;
}

/** Returned when no overlay is active at the given time. */
export interface OverlayStateInactive {
  active: false;
}

/** Discriminated union for overlay state at a point in time. */
export type OverlayState = OverlayStateActive | OverlayStateInactive;

/**
 * Compute the overlay visual state at a given timeline time.
 * Pure function -- no DOM dependencies.
 */
function getOverlayStateAtTime(
  time: number,
  overlays: Overlay[],
  outputMode: OutputMode,
  timelineDuration?: number
): OverlayState {
  if (!Array.isArray(overlays) || overlays.length === 0) {
    return { active: false };
  }
  const mode: 'reel' | 'landscape' = outputMode === 'reel' ? 'reel' : 'landscape';
  const FADE = TRANSITION_DURATION;

  for (let i = 0; i < overlays.length; i++) {
    const o = overlays[i]!;
    if (time < o.startTime - 0.001 || time > o.endTime + 0.001) continue;

    const pos = o[mode] || { x: 0, y: 0, width: 400, height: 300 };
    let x = pos.x, y = pos.y, width = pos.width, height = pos.height;

    // Skip fade-in if overlay starts at the beginning of the video
    const atVideoStart = o.startTime < 0.01;
    // Skip fade-out if overlay ends at or past the end of the video
    const atVideoEnd = timelineDuration != null && o.endTime >= timelineDuration - 0.01;

    // Fade in/out
    let opacity = 1;
    if (!atVideoStart && time < o.startTime + FADE) {
      opacity = Math.max(0, (time - o.startTime) / FADE);
    }
    if (!atVideoEnd && time > o.endTime - FADE) {
      opacity = Math.min(opacity, Math.max(0, (o.endTime - time) / FADE));
    }

    // Position interpolation with adjacent same-media segment
    // Only ONE side handles the transition to avoid double-animation:
    // The SECOND segment handles the full interpolation from prev->current during its FADE window.
    // The FIRST segment does NOT interpolate toward next -- it stays at its own position.
    const prev: Overlay | undefined = i > 0 ? overlays[i - 1] : undefined;
    if (prev && prev.mediaPath === o.mediaPath && Math.abs(o.startTime - prev.endTime) < 0.01) {
      const elapsed = time - o.startTime;
      if (elapsed >= 0 && elapsed < FADE) {
        const t = elapsed / FADE;
        const prevPos = prev[mode] || { x: 0, y: 0, width: 400, height: 300 };
        x = prevPos.x + (x - prevPos.x) * t;
        y = prevPos.y + (y - prevPos.y) * t;
        width = prevPos.width + (width - prevPos.width) * t;
        height = prevPos.height + (height - prevPos.height) * t;
        opacity = 1;
      }
    } else {
      // Only suppress fade-out if next segment is same media (transition handled by next)
      const next: Overlay | undefined = i < overlays.length - 1 ? overlays[i + 1] : undefined;
      if (next && next.mediaPath === o.mediaPath && Math.abs(next.startTime - o.endTime) < 0.01) {
        opacity = 1; // no fade-out, next segment will handle the transition
      }
    }

    const isVideoLike = o.mediaType === 'video' || o.mediaType === 'window';
    const sourceTime = isVideoLike ? o.sourceStart + (time - o.startTime) : 0;

    return {
      active: true,
      overlayId: o.id,
      mediaPath: o.mediaPath,
      mediaType: o.mediaType,
      x, y, width, height,
      opacity,
      sourceTime
    };
  }
  return { active: false };
}

export { getOverlayStateAtTime, TRANSITION_DURATION };
