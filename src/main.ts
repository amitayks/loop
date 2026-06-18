import 'dotenv/config';
import electronReload from 'electron-reload';
electronReload(__dirname);

import { app, BrowserWindow, ipcMain, dialog, desktopCapturer, shell, screen, systemPreferences } from 'electron';

import { createWindow } from './main/app/create-window.js';
import { registerIpcHandlers } from './main/ipc/register-handlers.js';
import { createProjectService } from './main/services/project-service.js';
import { renderComposite } from './main/services/render-service.js';
import { captureThumbnail } from './main/services/thumbnail-service.js';
import { computeSections } from './main/services/sections-service.js';
import { getScribeToken } from './main/services/scribe-service.js';
import * as proxyService from './main/services/proxy-service.js';

let win: BrowserWindow | null = null;

const projectService = createProjectService({ app: app as { getPath: (name: string) => string } });

const { cleanupMouseTrailTimer } = registerIpcHandlers({
  ipcMain,
  app,
  dialog,
  desktopCapturer,
  shell,
  getWindow: () => win,
  screen,
  projectService,
  renderComposite,
  captureThumbnail,
  computeSections,
  getScribeToken,
  proxyService
});

// macOS Screen Recording permission status. When the app is launched from a CLI
// (`npm run dev`), macOS attributes Screen Recording permission to the responsible
// parent process (the terminal), not to Electron — so an ungranted terminal yields
// an empty source list. The renderer queries this to show an actionable message
// instead of a silently-blank picker. On non-macOS this resolves to 'granted'.
ipcMain.handle('get-screen-access-status', () => {
  try {
    return systemPreferences.getMediaAccessStatus('screen');
  } catch {
    return 'unknown';
  }
});

// Open the macOS Screen Recording settings pane so the user can grant permission
// to the responsible app (their terminal) without hunting through System Settings.
ipcMain.handle('open-screen-recording-settings', () => {
  return shell
    .openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture')
    .then(() => true)
    .catch(() => false);
});

// Defensive cleanup for stale timer state from a previous hot-reload
cleanupMouseTrailTimer();

app.on('before-quit', () => {
  cleanupMouseTrailTimer();
});

function createMainWindow(): void {
  win = createWindow({
    BrowserWindow,
    onConsoleMessage: ({ level, message, line, sourceId }) => {
      console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
    },
    onDidFinishLoad: () => {
      console.log('[renderer-loaded]');
    },
    onRenderProcessGone: (d) => {
      console.log('[renderer-gone] ' + (d?.reason ?? 'unknown'));
    }
  });
  win.on('closed', () => {
    win = null;
  });
}

app.whenReady().then(createMainWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
