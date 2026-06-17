## ADDED Requirements

### Requirement: Canonical easing curve in shared domain

The easeInOut curve SHALL have exactly one canonical definition in `src/shared/domain/easing.ts`. The module SHALL export `easeInOut(t: number): number` implementing `t < 0.5 ? 2*t*t : 1 - pow(-2*t+2, 2)/2`, and `easeInOutExpr(progressExpr: string): string` producing the equivalent ffmpeg expression for a given progress sub-expression. No other module SHALL re-implement the curve; the renderer SHALL import `easeInOut` and the render filter builder SHALL build its eased expressions via `easeInOutExpr`.

#### Scenario: JS evaluator matches the known curve
- **WHEN** `easeInOut` is called with `t = 0`, `0.5`, and `1`
- **THEN** it returns `0`, `0.5`, and `1` respectively, and is monotonically non-decreasing across `t ∈ [0,1]`

#### Scenario: ffmpeg expression agrees with the JS evaluator
- **WHEN** the ffmpeg string from `easeInOutExpr(p)` is evaluated at sampled progress values `p ∈ {0, 0.1, …, 1.0}`
- **THEN** each evaluated result equals `easeInOut(p)` within `1e-9`

#### Scenario: Render filter uses the shared curve
- **WHEN** `render-filter-service` builds an eased transition expression
- **THEN** it delegates the curve to `easeInOutExpr` rather than inlining the polynomial, so editor preview and exported video share one source of truth
