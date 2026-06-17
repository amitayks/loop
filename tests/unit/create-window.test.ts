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

function createFakeBrowserWindow(): {
  BrowserWindow: CreateWindowOptions['BrowserWindow'];
  handlers: Map<string, Handler>;
} {
  const handlers = new Map<string, Handler>();

  const FakeBrowserWindow = function (this: FakeWindow): FakeWindow {
    this.webContents = {
      on: (event: string, handler: Handler) => {
        handlers.set(event, handler);
      }
    };
    this.setContentProtection = () => {};
    this.loadFile = () => {};
    return this;
  } as unknown as CreateWindowOptions['BrowserWindow'];

  return { BrowserWindow: FakeBrowserWindow, handlers };
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
});
