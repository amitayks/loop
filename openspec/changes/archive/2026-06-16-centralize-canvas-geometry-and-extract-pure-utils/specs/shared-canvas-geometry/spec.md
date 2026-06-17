## ADDED Requirements

### Requirement: Canonical canvas geometry constants in shared domain

Canvas, PIP, and reel geometry constants SHALL have a single canonical home, `src/shared/domain/canvas.ts`, importable by both renderer and main. It SHALL export `CANVAS_W`, `CANVAS_H`, `REEL_CANVAS_W`, `REEL_CANVAS_H`, `PIP_FRACTION`, `PIP_MARGIN`, `PIP_SIZE`, `MIN_SECTION_PAN`, `MAX_SECTION_PAN`, and SHALL re-export the existing pip/crop constants from `src/shared/types/domain.ts` (`MIN_REEL_CROP_X`, `MAX_REEL_CROP_X`, `MIN_PIP_SCALE`, `MAX_PIP_SCALE`, `DEFAULT_PIP_SCALE`) so geometry consumers have one import surface. `src/renderer/app.ts` SHALL NOT declare local copies of these constants; it SHALL import them from `canvas.ts`.

#### Scenario: Constant values preserved
- **WHEN** `canvas.ts` is imported
- **THEN** `CANVAS_W === 1920`, `CANVAS_H === 1080`, `REEL_CANVAS_W === Math.round(1080 * 9 / 16)`, `REEL_CANVAS_H === 1080`, `PIP_SIZE === Math.round(1920 * PIP_FRACTION)`, and the re-exported crop/pip constants equal their `domain.ts` values

#### Scenario: app.ts has no duplicate constant declarations
- **WHEN** the renderer needs a geometry constant
- **THEN** it imports it from `canvas.ts` and `app.ts` contains no local `const CANVAS_W`/`MIN_PIP_SCALE`/etc. declaration

### Requirement: Single canonical getContentWidth

The content-fit width calculation SHALL exist once, as the parameterized `getContentWidth(sourceW, sourceH, fitMode, canvasW, canvasH)` in `src/shared/domain/canvas.ts`. `render-filter-service.ts` SHALL import it (removing its local copy) and MAY re-export it so existing importers (`render-service.ts`, `thumbnail-service.ts`) are unaffected. The renderer SHALL call the canonical function with explicit canvas dimensions instead of a constants-bound local copy.

#### Scenario: Fit mode scales by the limiting dimension
- **WHEN** `getContentWidth(sourceW, sourceH, 'fit', canvasW, canvasH)` is called with finite positive source dimensions
- **THEN** it returns `sourceW * min(canvasW/sourceW, canvasH/sourceH)`

#### Scenario: Non-fit or missing source returns canvas width
- **WHEN** `fitMode` is not `'fit'`, or `sourceW`/`sourceH` is falsy
- **THEN** it returns `canvasW`

#### Scenario: Main service consumers unaffected
- **WHEN** `render-service.ts` / `thumbnail-service.ts` import `getContentWidth` from `render-filter-service`
- **THEN** the import still resolves (via re-export) and `render-filter-service`, `render-service`, `thumbnail-service` test suites stay green
