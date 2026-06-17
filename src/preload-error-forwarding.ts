// Narrow diagnostic: forward uncaught renderer errors to console.error so the
// main process (and the e2e smoke) can observe them via the [renderer-uncaught] marker.
export function installRendererErrorForwarding(
  target: Pick<Window, 'addEventListener'> | undefined = (globalThis as { window?: Window }).window
): void {
  if (!target || typeof target.addEventListener !== 'function') return;
  target.addEventListener('error', (e) => {
    console.error('[renderer-uncaught] ' + ((e as ErrorEvent)?.message ?? e));
  });
  target.addEventListener('unhandledrejection', (e) => {
    console.error('[renderer-uncaught] ' + (e as PromiseRejectionEvent)?.reason);
  });
}
