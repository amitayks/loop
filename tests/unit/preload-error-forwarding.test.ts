// @vitest-environment jsdom
import { installRendererErrorForwarding } from '../../src/preload-error-forwarding.js';

describe('installRendererErrorForwarding', () => {
  test('forwards window error events as [renderer-uncaught]', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      installRendererErrorForwarding(window);

      window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }));

      expect(errorSpy).toHaveBeenCalled();
      const arg = errorSpy.mock.calls.at(-1)![0];
      expect(typeof arg).toBe('string');
      expect(arg as string).toMatch(/^\[renderer-uncaught\] /);
      expect(arg as string).toContain('boom');
    } finally {
      errorSpy.mockRestore();
    }
  });

  test('forwards unhandledrejection events as [renderer-uncaught]', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      installRendererErrorForwarding(window);

      const event = new Event('unhandledrejection');
      (event as unknown as { reason: unknown }).reason = 'kaboom';
      window.dispatchEvent(event);

      expect(errorSpy).toHaveBeenCalled();
      const arg = errorSpy.mock.calls.at(-1)![0];
      expect(typeof arg).toBe('string');
      expect(arg as string).toMatch(/^\[renderer-uncaught\] /);
      expect(arg as string).toContain('kaboom');
    } finally {
      errorSpy.mockRestore();
    }
  });
});
