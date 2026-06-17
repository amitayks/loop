// ── Source picker UI + capture streams ──────────────────────────────
//
// The source-picker panel builds the capture source list and, on selection,
// drives the capture streams (screen / device / windows). Extracted verbatim
// from app.ts; function bodies are unchanged. State is consumed via live
// bindings + setters from `../../state.js`; DOM from `../dom/elements.js`.
// `window.electronAPI` and `navigator.mediaDevices` remain ambient globals.

import {
  pickerMode,
  pickerEntireScreenId,
  pickerDeviceId,
  pickerCheckedWindows,
  pickerAllSources,
  pickerAllVideoInputs,
  screenStream,
  cameraStream,
  audioStream,
  windowStreams,
  windowVideos,
  windowSourceNames,
  backgroundImage,
  setPickerMode,
  setPickerEntireScreenId,
  setPickerDeviceId,
  setPickerCheckedWindows,
  setPickerAllSources,
  setPickerAllVideoInputs,
  setScreenStream,
  setCameraStream,
  setAudioStream,
  setWindowStreams,
  setWindowVideos,
  setWindowSourceNames
} from '../../state.js';
import {
  screenPickerBtn,
  screenPickerSingleZone,
  screenPickerWindowZone,
  screenPickerDeviceZone,
  cameraSelect,
  audioSelect,
  screenVideo,
  cameraVideo
} from '../dom/elements.js';
import { updatePreview } from '../drawing/compositing.js';
import { pickAndLoadBackground } from '../background/background-image.js';
import { startAudioMeter, stopAudioMeter } from '../recording/recording.js';

// ── Source picker state ───────────────────────────────────────────

export function updatePickerButtonText(): void {
  if (pickerMode === 'none') {
    screenPickerBtn.textContent = 'None';
  } else if (pickerMode === 'entire-screen') {
    screenPickerBtn.textContent = 'Entire Screen';
  } else if (pickerMode === 'device') {
    const dev = pickerAllVideoInputs.find((d) => d.deviceId === pickerDeviceId);
    screenPickerBtn.textContent = dev?.label || 'Camera';
  } else if (pickerCheckedWindows.length === 1) {
    screenPickerBtn.textContent = pickerCheckedWindows[0]!.name;
  } else if (pickerCheckedWindows.length === 2) {
    screenPickerBtn.textContent = '2 Windows';
  } else {
    screenPickerBtn.textContent = 'None';
  }
}

export function renderPickerPanel(): void {
  // Single-select zone: None + Entire Screen
  screenPickerSingleZone.innerHTML = '';
  const noneRow = createPickerRadioRow('None', pickerMode === 'none', () => {
    setPickerMode('none');
    setPickerCheckedWindows([]);
    setPickerDeviceId('');
    applyPickerSelection();
  });
  screenPickerSingleZone.appendChild(noneRow);

  const screenSource = pickerAllSources.find((s) => s.id.startsWith('screen:'));
  if (screenSource) {
    setPickerEntireScreenId(screenSource.id);
    const entireRow = createPickerRadioRow('Entire Screen', pickerMode === 'entire-screen', () => {
      setPickerMode('entire-screen');
      setPickerCheckedWindows([]);
      setPickerDeviceId('');
      applyPickerSelection();
    });
    screenPickerSingleZone.appendChild(entireRow);
  }

  // Window checkboxes zone
  screenPickerWindowZone.innerHTML = '';
  const windowSources = pickerAllSources.filter((s) => s.id.startsWith('window:'));
  if (windowSources.length === 0) {
    screenPickerWindowZone.classList.add('hidden');
  } else {
    screenPickerWindowZone.classList.remove('hidden');
    for (const ws of windowSources) {
      const checked = pickerCheckedWindows.some((w) => w.id === ws.id);
      const disabled = !checked && pickerCheckedWindows.length >= 2;
      const row = createPickerCheckboxRow(ws.name, checked, disabled, (isChecked) => {
        if (isChecked) {
          if (pickerCheckedWindows.length < 2) {
            pickerCheckedWindows.push({ id: ws.id, name: ws.name });
            setPickerMode('windows');
            setPickerDeviceId('');
          }
        } else {
          setPickerCheckedWindows(pickerCheckedWindows.filter((w) => w.id !== ws.id));
          if (pickerCheckedWindows.length === 0) setPickerMode('none');
        }
        applyPickerSelection();
      });
      screenPickerWindowZone.appendChild(row);
    }
  }

  // Capture devices zone
  screenPickerDeviceZone.innerHTML = '';
  if (pickerAllVideoInputs.length === 0) {
    screenPickerDeviceZone.classList.add('hidden');
  } else {
    screenPickerDeviceZone.classList.remove('hidden');
    const label = document.createElement('div');
    label.className = 'px-3 py-1 text-xs text-neutral-500 uppercase tracking-wider';
    label.textContent = 'Capture Devices';
    screenPickerDeviceZone.appendChild(label);
    for (const dev of pickerAllVideoInputs) {
      const active = pickerMode === 'device' && pickerDeviceId === dev.deviceId;
      const row = createPickerRadioRow(dev.label || 'Camera', active, () => {
        setPickerMode('device');
        setPickerDeviceId(dev.deviceId);
        setPickerCheckedWindows([]);
        applyPickerSelection();
      });
      screenPickerDeviceZone.appendChild(row);
    }
  }
}

export function createPickerRadioRow(
  label: string,
  active: boolean,
  onClick: () => void
): HTMLElement {
  const div = document.createElement('div');
  div.className = `flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-neutral-800 ${active ? 'text-white' : 'text-neutral-400'}`;
  div.innerHTML = `<span class="w-3 h-3 rounded-full border ${active ? 'border-blue-500 bg-blue-500' : 'border-neutral-600'} flex-shrink-0"></span><span class="truncate">${label}</span>`;
  div.addEventListener('click', onClick);
  return div;
}

export function createPickerCheckboxRow(
  label: string,
  checked: boolean,
  disabled: boolean,
  onChange: (checked: boolean) => void
): HTMLElement {
  const div = document.createElement('div');
  div.className = `flex items-center gap-2 px-3 py-1.5 ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-neutral-800'} ${checked ? 'text-white' : 'text-neutral-400'}`;
  div.innerHTML = `<span class="w-3 h-3 rounded-sm border ${checked ? 'border-blue-500 bg-blue-500' : 'border-neutral-600'} flex-shrink-0 flex items-center justify-center text-xs">${checked ? '✓' : ''}</span><span class="truncate">${label}</span>`;
  if (!disabled) {
    div.addEventListener('click', () => onChange(!checked));
  }
  return div;
}

export async function applyPickerSelection(): Promise<void> {
  renderPickerPanel();
  updatePickerButtonText();

  // Handle streams
  if (pickerMode === 'windows' && pickerCheckedWindows.length > 0) {
    // Stop screen stream, start window streams
    if (screenStream) {
      screenStream.getTracks().forEach((t) => t.stop());
      setScreenStream(null);
      screenVideo.srcObject = null;
    }
    await updateWindowStreams(pickerCheckedWindows);
    // Auto-prompt for wallpaper if none set
    if (!backgroundImage) {
      pickAndLoadBackground();
    }
  } else {
    // Stop window streams, use screen/device stream
    cleanupWindowStreams();
    try {
      await updateScreenStream();
    } catch (err) {
      console.warn('Screen stream update failed:', err);
    }
  }
  updatePreview();
}

export async function populatePickerSources(): Promise<void> {
  try {
    const tempStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    tempStream.getTracks().forEach((t) => t.stop());
  } catch (_e) {
    /* ignore */
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  setPickerAllSources(await window.electronAPI.getSources());
  setPickerAllVideoInputs(devices.filter((d) => d.kind === 'videoinput'));

  // Remove closed windows from checked list
  setPickerCheckedWindows(
    pickerCheckedWindows.filter((w) => pickerAllSources.some((s) => s.id === w.id))
  );
  if (pickerMode === 'windows' && pickerCheckedWindows.length === 0) {
    setPickerMode('none');
  }
}

// Populate device lists (now also populates picker)
export async function enumerateDevices(): Promise<void> {
  await populatePickerSources();

  // Still populate camera and audio selects the old way
  cameraSelect.innerHTML = '<option value="">None</option>';
  audioSelect.innerHTML = '<option value="">None</option>';

  pickerAllVideoInputs.forEach((d, i) => {
    const opt = document.createElement('option');
    opt.value = d.deviceId;
    opt.textContent = d.label || `Camera ${i + 1}`;
    cameraSelect.appendChild(opt);
  });

  const devices = await navigator.mediaDevices.enumerateDevices();
  devices
    .filter((d) => d.kind === 'audioinput')
    .forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Microphone ${i + 1}`;
      audioSelect.appendChild(opt);
    });

  // Default selection: Entire Screen
  const screenSource = pickerAllSources.find((s) => s.id.startsWith('screen:'));
  if (screenSource && pickerMode === 'none' && pickerCheckedWindows.length === 0) {
    setPickerMode('entire-screen');
    setPickerEntireScreenId(screenSource.id);
  }
  if (cameraSelect.options.length > 1) cameraSelect.selectedIndex = 1;
  if (audioSelect.options.length > 1) audioSelect.selectedIndex = 1;

  updatePickerButtonText();
  // Acquire stream for default selection
  try {
    await updateScreenStream();
  } catch (_e) {
    console.warn('Default screen stream failed:', _e);
  }
  updatePreview();
}

export async function updateScreenStream(): Promise<void> {
  if (screenStream) {
    screenStream.getTracks().forEach((t) => t.stop());
    setScreenStream(null);
    screenVideo.srcObject = null;
  }

  // Derive sourceId from picker state (screenSelect is a dead hidden element)
  let sourceId = '';
  if (pickerMode === 'entire-screen') sourceId = pickerEntireScreenId;
  else if (pickerMode === 'device') sourceId = 'device:' + pickerDeviceId;
  if (!sourceId) return;

  if (sourceId.startsWith('device:')) {
    const deviceId = sourceId.slice('device:'.length);
    setScreenStream(
      await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
      })
    );
  } else {
    // Electron desktop capture uses non-standard 'mandatory' constraints
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Chromium desktop capture mandatory constraints
    const desktopConstraints: any = {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
        maxFrameRate: 30
      }
    };
    setScreenStream(
      await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: desktopConstraints
      })
    );
  }
  screenVideo.srcObject = screenStream;
}

export async function updateCameraStream(): Promise<void> {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    setCameraStream(null);
    cameraVideo.srcObject = null;
  }

  const deviceId = cameraSelect.value;
  if (!deviceId) return;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      deviceId: { exact: deviceId },
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1080 },
      frameRate: { ideal: 30, max: 30 },
      aspectRatio: { ideal: 16 / 9 }
    },
    audio: false
  });
  setCameraStream(stream);
  const [cameraTrack] = stream.getVideoTracks();
  if (cameraTrack && 'contentHint' in cameraTrack) {
    cameraTrack.contentHint = 'detail';
    console.log(`Camera track settings: ${JSON.stringify(cameraTrack.getSettings?.() || {})}`);
  }
  cameraVideo.srcObject = stream;
}

export async function updateAudioStream(): Promise<void> {
  stopAudioMeter();
  if (audioStream) {
    audioStream.getTracks().forEach((t) => t.stop());
    setAudioStream(null);
  }

  const deviceId = audioSelect.value;
  if (!deviceId) return;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: { exact: deviceId } },
    video: false
  });
  setAudioStream(stream);
  startAudioMeter(stream);
}

export async function updateWindowStreams(
  sourceIds: Array<{ id: string; name: string }>
): Promise<void> {
  cleanupWindowStreams();
  setWindowSourceNames([]);
  for (const source of sourceIds) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Chromium desktop capture mandatory constraints
      const desktopConstraints: any = {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id,
          maxFrameRate: 30
        }
      };
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: desktopConstraints
      });
      const video = document.createElement('video');
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      windowStreams.push(stream);
      windowVideos.push(video);
      windowSourceNames.push(source.name);

      // Handle window closed during recording
      const track = stream.getVideoTracks()[0];
      if (track) {
        const idx = windowStreams.length - 1;
        track.addEventListener('ended', () => {
          console.warn(`Window capture track ended: ${source.name}`);
          if (windowStreams[idx]) {
            windowStreams[idx]!.getTracks().forEach((t) => t.stop());
          }
        });
      }
    } catch (err) {
      console.warn(`Failed to capture window "${source.name}":`, err);
    }
  }
}

export function cleanupWindowStreams(): void {
  for (const stream of windowStreams) {
    stream.getTracks().forEach((t) => t.stop());
  }
  for (const video of windowVideos) {
    video.srcObject = null;
  }
  setWindowStreams([]);
  setWindowVideos([]);
  setWindowSourceNames([]);
}
