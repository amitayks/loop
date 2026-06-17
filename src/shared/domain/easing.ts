/**
 * Canonical ease-in-out cubic-ish curve shared by the renderer (number form)
 * and the ffmpeg render filter (expression-string form). Keeping both forms in
 * one module guarantees the editor preview and the rendered output use the
 * identical curve; any drift becomes a unit-test failure.
 */

/**
 * easeInOut over t in [0,1]: t < 0.5 ? 2*t*t : 1 - pow(-2*t+2, 2)/2.
 */
export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

/**
 * The ffmpeg-expression form of the SAME curve, with `progressExpr` substituted
 * for `t`. `progressExpr` is a sub-expression that already evaluates to the
 * normalized progress in [0,1] (e.g. `(t-1.000)/0.300`).
 */
export function easeInOutExpr(progressExpr: string): string {
  return `if(lt(${progressExpr},0.5),2*${progressExpr}*${progressExpr},1-pow(-2*${progressExpr}+2,2)/2)`;
}
