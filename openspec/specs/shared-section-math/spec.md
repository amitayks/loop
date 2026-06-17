# shared-section-math Specification

## Purpose
TBD - created by archiving change centralize-duplicated-domain-logic. Update Purpose after archive.
## Requirements
### Requirement: Canonical section pad/merge/remap algorithm in shared domain

The section-building algorithm — pad each source segment, drop or clamp invalid segments, sort by start, merge adjacent/overlapping segments, and remap onto a zero-based timeline cursor with millisecond rounding — SHALL have exactly one canonical implementation in `src/shared/domain/section-math.ts`. The module SHALL expose a pure core parameterized by `padding`, `emptyHandling` (`'clamp' | 'drop'`), and `mergeTouching` (boolean), returning merged source-time segments (each carrying the indices of the raw segments it absorbed) and a remap step producing base sections `{ id, index, sourceStart, sourceEnd, start, end, duration }`. The core SHALL be transcript-agnostic: per-segment metadata is reattached by callers using the returned source indices.

#### Scenario: Padding, merge, and timeline remap
- **WHEN** the core runs over two non-overlapping segments `{start:1,end:2}` and `{start:5,end:6}` with `padding=0.15`
- **THEN** it produces two sections whose `sourceStart`/`sourceEnd` reflect the padded bounds and whose `start`/`end` are contiguous from a zero-based timeline cursor, all rounded to 3 decimals

#### Scenario: Overlapping segments merge into one section
- **WHEN** two segments overlap after padding
- **THEN** the core merges them into a single section spanning the union, and records both raw indices in that section's source index list

#### Scenario: Empty-handling policy is honored
- **WHEN** a segment would have `end <= start` after padding
- **THEN** `emptyHandling: 'drop'` removes it while `emptyHandling: 'clamp'` keeps it with `end` clamped to `start`

#### Scenario: Merge-touching policy is honored
- **WHEN** one segment's start exactly equals the previous segment's end after padding
- **THEN** `mergeTouching: true` merges them and `mergeTouching: false` keeps them separate

### Requirement: Renderer and main section builders delegate to the shared core

`src/renderer/features/timeline/section-utils.ts` (`buildRemappedSectionsFromSegments`) and `src/main/services/sections-service.ts` (`computeSections`) SHALL be implemented in terms of the shared core while preserving their exact existing observable outputs. The renderer SHALL configure `padding = TRIM_PADDING (0.15)`, `emptyHandling = 'clamp'`, `mergeTouching = true`, and decorate each section with `transcript`, `takeId: null`, and `volume: 1.0`. The main service SHALL configure `padding = paddingSeconds (default 0.15)`, `emptyHandling = 'drop'`, `mergeTouching = false`, and return `{ sections, trimmedDuration }`.

#### Scenario: Renderer output unchanged
- **WHEN** `buildRemappedSectionsFromSegments` runs after delegating to the shared core
- **THEN** the existing `tests/unit/section-utils.test.ts` suite passes with no assertion changes, including transcript concatenation/normalization and `takeId`/`volume` fields

#### Scenario: Main service output unchanged
- **WHEN** `computeSections` runs after delegating to the shared core
- **THEN** the existing `tests/unit/sections-service.test.ts` suite passes with no assertion changes, including `trimmedDuration` and the drop-empty / strict-overlap-merge behavior

### Requirement: Single millisecond-rounding helper

Millisecond rounding (`Number(value.toFixed(3))`) SHALL have one canonical implementation, `roundMs`, exported from `src/shared/domain/section-math.ts`. `section-utils.ts` SHALL re-export it for backward-compatible imports, and `sections-service.ts` SHALL use it instead of inlining `.toFixed(3)`.

#### Scenario: Consistent rounding across layers
- **WHEN** any renderer or main code rounds a time value to millisecond precision
- **THEN** it calls the shared `roundMs`, and `roundMs(1.23456)` equals `1.235`

