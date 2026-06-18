import { createWindow, type CreateWindowOptions } from '../../src/main/app/create-window.js';

type Handler = (...args: unknown[]) => void;

interface FakeWebContents {
  on: (event: string, handler: Handler) => void;
}

interface FakeWindow {
  webContents: FakeWebContents;
  setContentProtection: (enabled: boolean) => void;
  loadFile: (file: string) => void;
}

interface CapturedOptions {
  webPreferences?: { backgroundThrottling?: boolean; preload?: string };
}

function createFakeBrowserWindow(): {
  BrowserWindow: CreateWindowOptions['BrowserWindow'];
  handlers: Map<string, Handler>;
  getOptions: () => CapturedOptions | undefined;
} {
  const handlers = new Map<string, Handler>();
  let capturedOptions: CapturedOptions | undefined;

  const FakeBrowserWindow = function (this: FakeWindow, options?: CapturedOptions): FakeWindow {
    capturedOptions = options;
    this.webContents = {
      on: (event: string, handler: Handler) => {
        handlers.set(event, handler);
      }
    };
    this.setContentProtection = () => {};
    this.loadFile = () => {};
    return this;
  } as unknown as CreateWindowOptions['BrowserWindow'];

  return { BrowserWindow: FakeBrowserWindow, handlers, getOptions: () => capturedOptions };
}

describe('createWindow', () => {
  test('wires console-message, did-finish-load, and render-process-gone callbacks', () => {
    const { BrowserWindow, handlers } = createFakeBrowserWindow();

    const onConsoleMessage = vi.fn();
    const onDidFinishLoad = vi.fn();
    const onRenderProcessGone = vi.fn();

    createWindow({ BrowserWindow, onConsoleMessage, onDidFinishLoad, onRenderProcessGone });

    expect(handlers.has('console-message')).toBe(true);
    expect(handlers.has('did-finish-load')).toBe(true);
    expect(handlers.has('render-process-gone')).toBe(true);

    const event = {} as unknown;
    handlers.get('console-message')!(event, 3, 'boom', 12, 'app.js');
    expect(onConsoleMessage).toHaveBeenCalledWith({
      event,
      level: 3,
      message: 'boom',
      line: 12,
      sourceId: 'app.js'
    });

    handlers.get('did-finish-load')!();
    expect(onDidFinishLoad).toHaveBeenCalledTimes(1);

    handlers.get('render-process-gone')!(event, { reason: 'crashed' });
    expect(onRenderProcessGone).toHaveBeenCalledWith({ reason: 'crashed' });
  });

  test('disables backgroundThrottling so timer-driven screen/window capture keeps running when the window is backgrounded', () => {
    const { BrowserWindow, getOptions } = createFakeBrowserWindow();

    createWindow({ BrowserWindow });

    // The screen and window recorders draw to a canvas on a setInterval loop and
    // record canvas.captureStream(). Chromium throttles renderer timers when the
    // window is backgrounded — which is exactly when the user switches to other
    // windows during an "Entire Screen" recording — starving the capture of
    // frames (choppy/low-fps screen track; the native camera track is immune).
    // Disabling backgroundThrottling keeps the draw loop at full rate.
    expect(getOptions()?.webPreferences?.backgroundThrottling).toBe(false);
  });
});
