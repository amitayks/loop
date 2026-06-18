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
import { partitionDrawableWindows } from './window-drawable.js';

// ── Source picker state ───────────────────────────────────────────

// macOS Screen Recording permission status (from the main process). When false,
// `desktopCapturer.getSources()` returns no windows — common when launching via
// `npm run dev`, since macOS grants Screen Recording to the responsible parent
// process (the terminal), not Electron. The picker shows an actionable message
// rather than a silently-empty list.
let screenAccessGranted = true;

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

  // Screen Recording permission missing → explain it instead of an empty list.
  // Inline styles (not Tailwind classes) so it renders regardless of CSS purging.
  if (!screenAccessGranted) {
    const warn = document.createElement('div');
    warn.style.cssText = 'padding:8px 12px;font-size:12px;line-height:1.5;color:#fbbf24';
    warn.innerHTML =
      '⚠ <span style="font-weight:600">Screen Recording permission needed.</span><br>' +
      'In dev, grant it to the app you launched from — <span style="color:#fcd34d">your terminal ' +
      '(Cursor / VS Code / Terminal / iTerm)</span>, not the loop app. If it is not listed, click ' +
      '<span style="color:#fcd34d">＋</span> and add that app. Then fully quit &amp; reopen it.';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Open Screen Recording settings';
    btn.style.cssText =
      'margin-top:6px;padding:4px 10px;font-size:12px;border-radius:6px;border:1px solid #b45309;' +
      'background:#78350f;color:#fde68a;cursor:pointer';
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.electronAPI.openScreenRecordingSettings().catch(() => {});
    });
    warn.appendChild(document.createElement('br'));
    warn.appendChild(btn);
    screenPickerSingleZone.appendChild(warn);
  }

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

  // Detect missing Screen Recording permission so the picker can explain an empty
  // source list (instead of looking broken). Absence of any screen/window source
  // is itself a strong signal even if the status query is unavailable.
  try {
    const status = await window.electronAPI.getScreenAccessStatus();
    const hasAnyCaptureSource = pickerAllSources.some(
      (s) => s.id.startsWith('screen:') || s.id.startsWith('window:')
    );
    screenAccessGranted = status === 'granted' || (status === 'unknown' && hasAnyCaptureSource);
  } catch {
    screenAccessGranted = true;
  }

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

// Hidden, persistent DOM container that holds the per-window <video> elements.
// Off-DOM <video autoplay> with a MediaStream does not reliably begin decoding
// in Chromium, leaving videoWidth = 0 (black/empty draws). Mirroring the in-DOM
// hidden #screenVideo, window videos are appended here so frames decode.
let windowVideoSink: HTMLDivElement | null = null;

function getWindowVideoSink(): HTMLDivElement {
  if (!windowVideoSink || !windowVideoSink.isConnected) {
    const sink = document.createElement('div');
    sink.id = 'windowVideoSink';
    sink.style.display = 'none';
    document.body.appendChild(sink);
    windowVideoSink = sink;
  }
  return windowVideoSink;
}

// Wait until a window <video> has decoded its first frame and reports a
// non-zero videoWidth, so the compositor/recording draw loop draws real
// content instead of a black/empty rectangle. Resolves early if already ready.
function awaitWindowVideoReady(video: HTMLVideoElement): Promise<void> {
  if (video.videoWidth > 0 && video.videoHeight > 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('loadeddata', onReady);
      resolve();
    };
    const onReady = (): void => {
      if (video.videoWidth > 0 && video.videoHeight > 0) finish();
    };
    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('loadeddata', onReady);
    // Safety net: never block stream acquisition indefinitely if the OS never
    // delivers a frame (the draw loop's videoWidth gate still skips it).
    setTimeout(finish, 3000);
  });
}

export async function updateWindowStreams(
  sourceIds: Array<{ id: string; name: string }>
): Promise<void> {
  cleanupWindowStreams();
  setWindowSourceNames([]);
  const sink = getWindowVideoSink();
  const readyWaiters: Array<Promise<void>> = [];
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
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      // In-DOM (hidden) so Chromium reliably decodes frames, mirroring #screenVideo.
      sink.appendChild(video);
      windowStreams.push(stream);
      windowVideos.push(video);
      windowSourceNames.push(source.name);

      // Explicit play() + readiness await removes the race that leaves
      // videoWidth = 0; autoplay alone is not reliable for off-/freshly-attached
      // MediaStream elements.
      try {
        await video.play();
      } catch (playErr) {
        console.warn(`Window video play() failed for "${source.name}":`, playErr);
      }
      readyWaiters.push(awaitWindowVideoReady(video));

      // Handle window closed during recording. Capture the stream reference
      // directly (not a live-array index) so this stays correct after
      // undrawable windows are dropped and the arrays are reassigned below.
      const track = stream.getVideoTracks()[0];
      if (track) {
        track.addEventListener('ended', () => {
          console.warn(`Window capture track ended: ${source.name}`);
          stream.getTracks().forEach((t) => t.stop());
        });
      }
    } catch (err) {
      console.warn(`Failed to capture window "${source.name}":`, err);
    }
  }
  // Don't treat sources as drawable until each has reached non-zero videoWidth.
  await Promise.all(readyWaiters);

  // awaitWindowVideoReady() resolves on a 3s safety timeout even when the OS
  // never delivered a frame (occluded / offscreen / degenerate windows like an
  // "App Icon Window"), leaving videoWidth/videoHeight at 0. Recording such a
  // never-ready window produces a 0-byte / undecodable .webm that breaks proxy
  // generation and the render/export. Drop every still-undrawable window here so
  // only capturable windows reach startRecording(). The pre-flight in
  // recording.ts surfaces an explicit error if this leaves no visual source.
  const { keptIndices, droppedIndices } = partitionDrawableWindows(windowVideos);
  if (droppedIndices.length > 0) {
    for (const i of droppedIndices) {
      const name = windowSourceNames[i] ?? 'unknown window';
      console.warn(
        `Dropping window "${name}": no frames captured (occluded, offscreen, or ` +
          `not drawable). It will not be recorded.`
      );
      const stream = windowStreams[i];
      if (stream) stream.getTracks().forEach((t) => t.stop());
      const video = windowVideos[i];
      if (video) {
        video.srcObject = null;
        video.remove();
      }
    }
    // Reassign filtered, still index-aligned arrays through the state setters so
    // the live bindings (windowStreams/windowVideos/windowSourceNames) stay in
    // sync — never mutate the imported arrays in place here.
    setWindowStreams(keptIndices.map((i) => windowStreams[i]!));
    setWindowVideos(keptIndices.map((i) => windowVideos[i]!));
    setWindowSourceNames(keptIndices.map((i) => windowSourceNames[i]!));
  }
}

export function cleanupWindowStreams(): void {
  for (const stream of windowStreams) {
    stream.getTracks().forEach((t) => t.stop());
  }
  for (const video of windowVideos) {
    video.srcObject = null;
    // Detach from the hidden sink so old elements don't keep decoding.
    video.remove();
  }
  setWindowStreams([]);
  setWindowVideos([]);
  setWindowSourceNames([]);
}
