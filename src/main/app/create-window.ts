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
      preload: path.join(__dirname, '..', '..', 'preload.js')
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
