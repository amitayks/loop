// ── Background image pick + load ─────────────────────────────────────
//
// The background-image helpers let the user pick a wallpaper image and load it
// into the renderer state. Extracted verbatim from app.ts; function bodies are
// unchanged. State setters come from `../../state.js`; the project-save schedule
// from `../project/project-lifecycle.js`. `window.electronAPI` remains an
// ambient global.

import { setBackgroundImage, setBackgroundImagePath } from '../../state.js';
import { scheduleProjectSave } from '../project/project-lifecycle.js';

export async function pickAndLoadBackground(): Promise<void> {
  const filePath = await window.electronAPI.pickBackgroundImage();
  if (!filePath) return;
  await loadBackgroundFromPath(filePath);
  scheduleProjectSave();
}

export async function loadBackgroundFromPath(filePath: string): Promise<void> {
  try {
    const fileUrl = window.electronAPI.pathToFileUrl(filePath);
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load background image'));
      img.src = fileUrl;
    });
    setBackgroundImage(img);
    setBackgroundImagePath(filePath);
  } catch (_err) {
    setBackgroundImage(null);
    setBackgroundImagePath(null);
  }
}
