import path from 'path';

import type { BrowserWindow as BrowserWindowType, Event as ElectronEvent } from 'electron';

export interface ConsoleMessageInfo {
  event: ElectronEvent;
  level: number;
  message: string;
  line: number;
  sourceId: string;
}

export interface CreateWindowOptions {
  BrowserWindow: typeof import('electron').BrowserWindow;
  onConsoleMessage?: (info: ConsoleMessageInfo) => void;
  onDidFinishLoad?: () => void;
  onRenderProcessGone?: (details: { reason?: string }) => void;
}

export function createWindow({
  BrowserWindow,
  onConsoleMessage,
  onDidFinishLoad,
  onRenderProcessGone
}: CreateWindowOptions): BrowserWindowType {
  const win = new BrowserWindow({
    width: 960,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '..', '..', 'preload.js'),
      // Screen/window recording draws each frame to a canvas on a setInterval
      // loop and records canvas.captureStream(). Chromium throttles renderer
      // timers (and pauses rAF) when the window is backgrounded — which is
      // exactly what happens when the user switches to other windows during an
      // "Entire Screen" recording — starving the capture and producing a choppy,
      // low-fps screen track while the native camera track stays smooth. Disable
      // background throttling so the draw loop keeps running at full rate.
      backgroundThrottling: false
    }
  });

  win.setContentProtection(true);
  win.webContents.on('console-message', (event: ElectronEvent, level: number, message: string, line: number, sourceId: string) => {
    if (typeof onConsoleMessage === 'function') {
      onConsoleMessage({ event, level, message, line, sourceId });
      return;
    }
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });

  win.webContents.on('did-finish-load', () => {
    onDidFinishLoad?.();
  });

  win.webContents.on('render-process-gone', (_event: ElectronEvent, details: { reason?: string }) => {
    onRenderProcessGone?.({ reason: details?.reason });
  });

  win.loadFile(path.join(__dirname, '..', '..', 'index.html'));
  return win;
}
