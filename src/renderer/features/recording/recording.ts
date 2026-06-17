// ── Recording lifecycle + audio meter + live transcript ─────────────
//
// The recording cluster: acquire streams (via the capture module) → record →
// meter audio → stream the live transcript → stop → process. Extracted verbatim
// from app.ts; function bodies are unchanged. State is consumed via live
// bindings + setters from `../../state.js`; DOM from `../dom/elements.js`;
// `mergeInt16Arrays` from `./pcm-utils.js`; transcript/section helpers from
// their feature modules; remaining not-yet-extracted helpers from `../../app.js`
// (circular, esbuild-handled). Web Audio / MediaRecorder / `window.electronAPI`
// remain ambient globals.

import {
  recording,
  setRecording,
  recorders,
  setRecorders,
  screenStream,
  cameraStream,
  audioStream,
  startTime,
  setStartTime,
  timerInterval,
  setTimerInterval,
  audioContext,
  setAudioContext,
  setAnalyser,
  meterRAF,
  setMeterRAF,
  scribeWs,
  setScribeWs,
  speechSegments,
  setSpeechSegments,
  audioChunkBuffer,
  setAudioChunkBuffer,
  audioSendInterval,
  setAudioSendInterval,
  micSourceNode,
  setMicSourceNode,
  scribeWorkletNode,
  setScribeWorkletNode,
  workletRegistered,
  setWorkletRegistered,
  scribeAudioOffset,
  setScribeAudioOffset,
  mouseTrailSamples,
  setMouseTrailSamples,
  mouseTrailCaptureWidth,
  setMouseTrailCaptureWidth,
  mouseTrailCaptureHeight,
  setMouseTrailCaptureHeight,
  screenRecInterval,
  setScreenRecInterval,
  windowStreams,
  windowVideos,
  windowRecIntervals,
  setWindowRecIntervals,
  windowSourceNames,
  saveFolder,
  activeProject,
  activeProjectPath,
  editorState,
  proxyStatus,
  selectedSegmentIndex,
  supportedRecorderMimeType,
  setSupportedRecorderMimeType
} from '../../state.js';
import type { AppMediaRecorder } from '../../state.js';
import {
  audioMeter,
  audioSelect,
  cameraSelect,
  processingBar,
  recordBtn,
  screenPickerBtn,
  screenSelect,
  screenVideo,
  segmentBadge,
  timerEl,
  transcriptContent,
  transcriptPanel
} from '../dom/elements.js';
import { mergeInt16Arrays } from './pcm-utils.js';
import {
  attachSectionTranscripts,
  buildDefaultSectionsForDuration,
  buildRemappedSectionsFromSegments,
  normalizeTakeSections
} from '../timeline/section-utils.js';
import {
  extractSpokenWordTokens,
  stripNonSpeechAnnotations
} from '../transcript/transcript-utils.js';
import type { ScribeToken } from '../transcript/transcript-utils.js';
import { renderSectionMarkers } from '../section/section-editing.js';
import { appendTakeToTimeline } from '../../app.js';
import { setWorkspaceView, updateWorkspaceHeader } from '../workspace/workspace.js';
import { selectSegment, updateSegmentBadge } from '../render/render.js';
import {
  completeRecoveryTake,
  getActiveProjectSession,
  matchesActiveProjectSession,
  persistProjectNow,
  saveRecoveryTake
} from '../project/project-lifecycle.js';
import type { Section, Take } from '../../../shared/types/domain.js';
import type { RecoveryTake } from '../../../shared/types/services.js';
import type { MouseTrailData } from '../../../shared/types/mouse-trail.js';

// Audio level meter
export function startAudioMeter(stream: MediaStream): void {
  const meterContext = new AudioContext();
  setAudioContext(meterContext);
  const meterAnalyser = meterContext.createAnalyser();
  setAnalyser(meterAnalyser);
  meterAnalyser.fftSize = 256;
  const source = meterContext.createMediaStreamSource(stream);
  setMicSourceNode(source);
  source.connect(meterAnalyser);

  const data = new Uint8Array(meterAnalyser.frequencyBinCount);

  function updateMeter(): void {
    meterAnalyser.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    const pct = Math.min(100, (avg / 128) * 100);
    audioMeter.style.width = pct + '%';
    audioMeter.className = `h-full rounded-full transition-all duration-75 ${pct > 70 ? 'bg-red-500' : pct > 40 ? 'bg-amber-500' : 'bg-emerald-500'}`;
    setMeterRAF(requestAnimationFrame(updateMeter));
  }
  updateMeter();
}

export function stopAudioMeter(): void {
  if (meterRAF) cancelAnimationFrame(meterRAF);
  setMeterRAF(null);
  setMicSourceNode(null);
  if (audioContext) {
    if (workletRegistered === audioContext) setWorkletRegistered(null);
    audioContext.close();
    setAudioContext(null);
  }
  audioMeter.style.width = '0%';
}

// Recording
export function toggleRecording(): void {
  if (!recording) startRecording();
  else stopRecording();
}

export function getSupportedRecorderMimeType(): string {
  if (supportedRecorderMimeType !== undefined) return supportedRecorderMimeType;

  const candidates = ['video/webm; codecs=vp8', 'video/webm; codecs=vp9', 'video/webm'];

  const resolved =
    candidates.find((mimeType) => {
      return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mimeType);
    }) || '';
  setSupportedRecorderMimeType(resolved);

  return resolved;
}

export function getRecorderOptions(suffix: string): MediaRecorderOptions {
  const mimeType = getSupportedRecorderMimeType();
  const options: MediaRecorderOptions = mimeType ? { mimeType } : {};

  if (suffix === 'camera') {
    options.videoBitsPerSecond = 10000000;
    options.audioBitsPerSecond = 192000;
  } else if (suffix.startsWith('win')) {
    // Window captures: maximum bitrate for pixel-perfect text/UI
    options.videoBitsPerSecond = 60000000;
    options.audioBitsPerSecond = 192000;
  } else {
    // Screen recording
    options.videoBitsPerSecond = 30000000;
    options.audioBitsPerSecond = 192000;
  }

  return options;
}

export function createRecorder(stream: MediaStream, suffix: string): AppMediaRecorder {
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, getRecorderOptions(suffix)) as AppMediaRecorder;

  recorder.ondataavailable = (e: BlobEvent) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.blobPromise = new Promise((resolve) => {
    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: 'video/webm' });
      const buffer = await blob.arrayBuffer();
      const savedPath = await window.electronAPI.saveVideo(buffer, saveFolder, suffix);
      if (savedPath) console.log('Saved:', savedPath);
      resolve({ blob, path: savedPath });
    };
  });

  recorder.suffix = suffix;
  return recorder;
}

export function addAudioToStream(stream: MediaStream): MediaStream {
  if (!audioStream) return stream;
  const combined = new MediaStream([...stream.getVideoTracks(), ...audioStream.getAudioTracks()]);
  return combined;
}

export async function startRecording(): Promise<void> {
  if (!activeProjectPath) return;
  setRecorders([]);
  setSpeechSegments([]);
  setAudioChunkBuffer([]);

  if (screenStream) {
    const srcTrack = screenStream.getVideoTracks()[0]!;
    const settings = srcTrack.getSettings();
    const recCanvas = document.createElement('canvas');
    recCanvas.width = settings.width || 1920;
    recCanvas.height = settings.height || 1080;
    setMouseTrailCaptureWidth(recCanvas.width);
    setMouseTrailCaptureHeight(recCanvas.height);
    const recCtx = recCanvas.getContext('2d', { alpha: false })!;
    recCtx.drawImage(screenVideo, 0, 0, recCanvas.width, recCanvas.height);
    setScreenRecInterval(
      setInterval(() => {
        recCtx.drawImage(screenVideo, 0, 0, recCanvas.width, recCanvas.height);
      }, 1000 / 30)
    );
    const screenOnly = addAudioToStream(recCanvas.captureStream(30));
    recorders.push(createRecorder(screenOnly, 'screen'));
  }

  // Window capture recording
  setWindowRecIntervals([]);
  for (let i = 0; i < windowStreams.length && i < 2; i++) {
    const wStream = windowStreams[i]!;
    const wVideo = windowVideos[i]!;
    const srcTrack = wStream.getVideoTracks()[0];
    if (!srcTrack) continue;
    const settings = srcTrack.getSettings();
    const wCanvas = document.createElement('canvas');
    wCanvas.width = settings.width || 1920;
    wCanvas.height = settings.height || 1080;
    if (i === 0) {
      setMouseTrailCaptureWidth(wCanvas.width);
      setMouseTrailCaptureHeight(wCanvas.height);
    }
    const wCtx = wCanvas.getContext('2d', { alpha: false })!;
    wCtx.drawImage(wVideo, 0, 0, wCanvas.width, wCanvas.height);
    const interval = setInterval(() => {
      wCtx.drawImage(wVideo, 0, 0, wCanvas.width, wCanvas.height);
    }, 1000 / 30);
    windowRecIntervals.push(interval);
    const winOnly = addAudioToStream(wCanvas.captureStream(30));
    recorders.push(createRecorder(winOnly, `win${i}`));
  }

  if (cameraStream) {
    const cameraOnly = addAudioToStream(new MediaStream(cameraStream.getVideoTracks()));
    recorders.push(createRecorder(cameraOnly, 'camera'));
  }

  recorders.forEach((r) => r.start());
  setRecording(true);
  updateWorkspaceHeader();
  recordBtn.textContent = 'Stop';
  recordBtn.classList.replace('bg-red-600', 'bg-neutral-800');
  recordBtn.classList.replace('hover:bg-red-700', 'hover:bg-neutral-700');
  recordBtn.classList.add('border', 'border-neutral-600');
  screenSelect.disabled = true;
  screenPickerBtn.classList.add('opacity-50', 'pointer-events-none');
  cameraSelect.disabled = true;
  audioSelect.disabled = true;

  setStartTime(Date.now());
  setTimerInterval(setInterval(updateTimer, 200));

  setMouseTrailSamples([]);
  setMouseTrailCaptureWidth(null);
  setMouseTrailCaptureHeight(null);
  window.electronAPI.startMouseTrail().catch(() => {});

  transcriptPanel.classList.remove('hidden');
  transcriptContent.innerHTML = '';
  segmentBadge.textContent = '0 segments';

  if (audioContext && audioStream && micSourceNode) {
    try {
      const token = await window.electronAPI.getScribeToken();
      const sampleRate = audioContext.sampleRate;

      const formatMap: Record<number, string> = {
        8000: 'pcm_8000',
        16000: 'pcm_16000',
        22050: 'pcm_22050',
        24000: 'pcm_24000',
        44100: 'pcm_44100',
        48000: 'pcm_48000'
      };
      const audioFormat = formatMap[sampleRate] || 'pcm_16000';

      const wsUrl =
        `wss://api.elevenlabs.io/v1/speech-to-text/realtime` +
        `?model_id=scribe_v2_realtime` +
        `&token=${token}` +
        `&audio_format=${audioFormat}` +
        `&commit_strategy=vad` +
        `&include_timestamps=true` +
        `&vad_silence_threshold_secs=1.0` +
        `&vad_threshold=0.8` +
        `&min_speech_duration_ms=200` +
        `&language_code=eng`;

      const ws = new WebSocket(wsUrl);
      setScribeWs(ws);

      ws.onmessage = (event: MessageEvent) => {
        const msg = JSON.parse(event.data as string) as {
          message_type: string;
          text?: string;
          words?: ScribeToken[];
        };
        if (msg.message_type === 'partial_transcript') {
          updatePartialTranscript(msg.text || '');
        } else if (msg.message_type === 'committed_transcript_with_timestamps') {
          commitTranscript(msg as { words?: ScribeToken[] });
        }
      };

      ws.onerror = (err: Event) => {
        console.error('Scribe WebSocket error:', err);
      };

      if (workletRegistered !== audioContext) {
        await audioContext.audioWorklet.addModule('audio-processor.js');
        setWorkletRegistered(audioContext);
      }
      const workletNode = new AudioWorkletNode(audioContext, 'audio-capture');
      setScribeWorkletNode(workletNode);
      micSourceNode.connect(workletNode);

      workletNode.port.onmessage = (e: MessageEvent) => {
        if ((e.data as { pcm?: ArrayBuffer }).pcm) {
          audioChunkBuffer.push(new Int16Array((e.data as { pcm: ArrayBuffer }).pcm));
        }
      };

      setScribeAudioOffset((Date.now() - startTime) / 1000);

      setAudioSendInterval(
        setInterval(() => {
          if (audioChunkBuffer.length === 0 || !scribeWs || scribeWs.readyState !== WebSocket.OPEN)
            return;
          const merged = mergeInt16Arrays(audioChunkBuffer);
          setAudioChunkBuffer([]);
          const bytes = new Uint8Array(merged.buffer);
          const CHUNK = 8192;
          let binary = '';
          for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
          }
          const base64 = btoa(binary);
          scribeWs.send(
            JSON.stringify({
              message_type: 'input_audio_chunk',
              audio_base_64: base64,
              sample_rate: sampleRate,
              commit: false
            })
          );
        }, 100)
      );
    } catch (err) {
      console.warn('Scribe setup failed:', err);
    }
  }
}

export function updatePartialTranscript(text: string): void {
  let partial = document.getElementById('partialText');
  if (!partial) {
    partial = document.createElement('div');
    partial.id = 'partialText';
    partial.className = 'text-neutral-600 italic';
    transcriptContent.prepend(partial);
  }
  partial.textContent = stripNonSpeechAnnotations(text);
  transcriptContent.scrollTop = 0;
}

export function commitTranscript(data: { words?: ScribeToken[] }): void {
  const partial = document.getElementById('partialText');
  if (partial) partial.remove();

  const spokenWords = extractSpokenWordTokens(data.words || []);
  if (spokenWords.length === 0) return;

  const cleanText = stripNonSpeechAnnotations(spokenWords.map((w) => w.text).join(' '));
  if (!cleanText) return;

  speechSegments.push({
    start: (spokenWords[0]!.start ?? 0) + scribeAudioOffset,
    end: (spokenWords[spokenWords.length - 1]!.end ?? 0) + scribeAudioOffset,
    text: cleanText
  });

  const div = document.createElement('div');
  div.className =
    'mb-2 text-neutral-300 cursor-pointer rounded-md px-1.5 py-0.5 -mx-1 hover:bg-neutral-800/60 transition-colors';
  div.dataset.segmentIndex = String(speechSegments.length - 1);
  div.textContent = cleanText;
  div.addEventListener('click', () => {
    const idx = parseInt(div.dataset.segmentIndex!, 10);
    selectSegment(selectedSegmentIndex === idx ? -1 : idx);
  });
  transcriptContent.prepend(div);
  transcriptContent.scrollTop = 0;

  updateSegmentBadge();
}

export async function recoverPendingTake(recoveryTake: RecoveryTake): Promise<void> {
  if (!recoveryTake?.screenPath) return;

  const projectSession = getActiveProjectSession();
  const existingTake = Array.isArray(activeProject?.takes)
    ? activeProject.takes.find((take: Take) => take.id === recoveryTake.id)
    : null;
  if (existingTake) {
    await completeRecoveryTake(projectSession.projectPath);
    return;
  }

  const takeId = recoveryTake.id || `take-${Date.now()}`;
  const screenPath = recoveryTake.screenPath;
  const cameraPath = recoveryTake.cameraPath || null;
  let recoverySections = normalizeTakeSections(
    recoveryTake.sections,
    recoveryTake.recordedDuration
  );
  const recoverySegments = Array.isArray(recoveryTake.trimSegments)
    ? recoveryTake.trimSegments
    : [];
  const fallbackSections = buildRemappedSectionsFromSegments(recoverySegments);

  try {
    if (recoverySegments.length > 0) {
      const computed = await window.electronAPI.computeSections({
        segments: recoverySegments
      });
      if (!matchesActiveProjectSession(projectSession)) return;
      recoverySections = (
        Array.isArray(computed?.sections) && computed.sections.length > 0
          ? attachSectionTranscripts(computed.sections, fallbackSections)
          : fallbackSections.length > 0
            ? fallbackSections
            : recoverySections
      ) as Section[];
    }

    recoverySections = recoverySections.map((s) => ({ ...s, takeId }));

    if (activeProject) {
      if (!Array.isArray(activeProject.takes)) activeProject.takes = [];
      activeProject.takes.push({
        id: takeId,
        createdAt: recoveryTake.createdAt || new Date().toISOString(),
        duration: recoveryTake.recordedDuration,
        screenPath,
        cameraPath,
        sections: recoverySections
      });
    }

    const appendResult = appendTakeToTimeline({
      takeId,
      screenPath,
      cameraPath,
      windowPaths: null,
      recordedDuration: recoveryTake.recordedDuration,
      trimSections: recoverySections,
      projectSession
    });
    if (!appendResult || !matchesActiveProjectSession(projectSession)) return;

    if (activeProject && appendResult) {
      const take = activeProject.takes.find((t: Take) => t.id === takeId);
      if (take) {
        take.duration = appendResult.takeDuration;
        take.sections = appendResult.takeSections;
      }
      await persistProjectNow();
    }

    await completeRecoveryTake(projectSession.projectPath);
  } catch (error) {
    console.error('Failed to recover pending take:', error);
    if (matchesActiveProjectSession(projectSession)) {
      setWorkspaceView(editorState ? 'timeline' : 'recording');
    }
  }
}

export function setProcessingProgress(progress: number | null = null): void {
  if (!processingBar) return;
  const isDeterminate = Number.isFinite(Number(progress));
  if (!isDeterminate) {
    processingBar.classList.add('animate-pulse');
    processingBar.style.width = '100%';
    return;
  }

  const clamped = Math.max(0, Math.min(1, Number(progress)));
  processingBar.classList.remove('animate-pulse');
  processingBar.style.width = `${Math.max(2, Math.round(clamped * 100))}%`;
}

export async function stopRecording(): Promise<void> {
  const projectSession = getActiveProjectSession();
  const recordedDuration = (Date.now() - startTime) / 1000;
  clearInterval(timerInterval!);

  // Stop recorders and canvas intervals immediately so file durations
  // match recordedDuration (before any async cleanup adds delay).
  if (screenRecInterval) {
    clearInterval(screenRecInterval);
    setScreenRecInterval(null);
  }
  for (const interval of windowRecIntervals) {
    clearInterval(interval);
  }
  setWindowRecIntervals([]);
  recorders.forEach((r) => {
    if (r.state !== 'inactive') r.stop();
  });

  try {
    setMouseTrailSamples(await window.electronAPI.stopMouseTrail());
  } catch (_) {
    setMouseTrailSamples([]);
  }

  if (audioSendInterval) {
    clearInterval(audioSendInterval);
    setAudioSendInterval(null);
  }

  if (scribeWorkletNode) {
    scribeWorkletNode.port.onmessage = null;
    if (micSourceNode) micSourceNode.disconnect(scribeWorkletNode);
    scribeWorkletNode.disconnect();
    setScribeWorkletNode(null);
  }

  const hadScribe = !!scribeWs;
  if (scribeWs && scribeWs.readyState === WebSocket.OPEN) {
    scribeWs.send(JSON.stringify({ message_type: 'commit' }));
    await new Promise<void>((r) => setTimeout(r, 1000));
    scribeWs.close();
  }
  setScribeWs(null);
  setAudioChunkBuffer([]);

  const results: Record<string, { blob: Blob; path: string }> = {};
  for (const r of recorders) {
    results[r.suffix] = await r.blobPromise;
  }

  setRecorders([]);
  setRecording(false);
  updateWorkspaceHeader();
  recordBtn.textContent = 'Record';
  recordBtn.classList.replace('bg-neutral-800', 'bg-red-600');
  recordBtn.classList.replace('hover:bg-neutral-700', 'hover:bg-red-700');
  recordBtn.classList.remove('border', 'border-neutral-600');
  screenSelect.disabled = false;
  screenPickerBtn.classList.remove('opacity-50', 'pointer-events-none');
  cameraSelect.disabled = false;
  audioSelect.disabled = false;
  timerEl.textContent = '00:00';

  transcriptPanel.classList.add('hidden');

  // Build windowPaths from results, including captured dimensions
  const recordedWindowPaths: Array<{
    name: string;
    path: string;
    width?: number;
    height?: number;
  }> = [];
  for (let i = 0; i < 2; i++) {
    const key = `win${i}`;
    if (results[key] && windowSourceNames[i]) {
      let w: number | undefined;
      let h: number | undefined;
      if (windowVideos[i]) {
        w = windowVideos[i]!.videoWidth || undefined;
        h = windowVideos[i]!.videoHeight || undefined;
      }
      recordedWindowPaths.push({
        name: windowSourceNames[i]!,
        path: results[key]!.path,
        width: w,
        height: h
      });
    }
  }
  const hasWindowCaptures = recordedWindowPaths.length > 0;
  const hasScreen = !!results.screen;

  if (hasScreen || hasWindowCaptures) {
    const takeId = `take-${Date.now()}`;
    const takeCreatedAt = new Date().toISOString();
    const screenPath = results.screen?.path || '';
    const cameraPath = results.camera?.path || null;
    let sectionsForTimeline = buildDefaultSectionsForDuration(recordedDuration);

    const activeSegments = speechSegments.filter((s) => !s.deleted);
    const fallbackSections = buildRemappedSectionsFromSegments(activeSegments);
    await saveRecoveryTake({
      id: takeId,
      createdAt: takeCreatedAt,
      screenPath,
      cameraPath,
      recordedDuration,
      sections: sectionsForTimeline,
      trimSegments: activeSegments
    });
    if (activeSegments.length > 0) {
      try {
        const computed = await window.electronAPI.computeSections({
          segments: activeSegments
        });
        sectionsForTimeline = (
          Array.isArray(computed?.sections) && computed.sections.length > 0
            ? attachSectionTranscripts(computed.sections, fallbackSections)
            : fallbackSections.length > 0
              ? fallbackSections
              : sectionsForTimeline
        ) as Section[];
        if (!matchesActiveProjectSession(projectSession)) return;
      } catch (err) {
        console.warn('Section computation failed, using fallback sections:', err);
        if (fallbackSections.length > 0) sectionsForTimeline = fallbackSections as Section[];
      }
    } else if (hadScribe) {
      console.warn('No speech detected, using full recording');
    }

    sectionsForTimeline = sectionsForTimeline.map((s) => ({ ...s, takeId }));

    let mousePath: string | null = null;
    if (mouseTrailSamples.length > 0 && activeProjectPath) {
      try {
        const trailData: MouseTrailData = {
          captureWidth: mouseTrailCaptureWidth || 1920,
          captureHeight: mouseTrailCaptureHeight || 1080,
          interval: 100,
          trail: mouseTrailSamples
        };
        const suffix = takeId.replace('take-', '');
        mousePath = await window.electronAPI.saveMouseTrail(activeProjectPath, suffix, trailData);
      } catch (err) {
        console.warn('Failed to save mouse trail:', err);
      }
      setMouseTrailSamples([]);
    }

    if (activeProject) {
      if (!Array.isArray(activeProject.takes)) activeProject.takes = [];
      activeProject.takes.push({
        id: takeId,
        createdAt: takeCreatedAt,
        duration: recordedDuration,
        screenPath: screenPath || null,
        cameraPath,
        mousePath: mousePath ? `${activeProjectPath}/${mousePath}` : null,
        proxyPath: null,
        windowPaths: hasWindowCaptures ? recordedWindowPaths : null,
        sections: sectionsForTimeline
      });
    }

    try {
      const appendResult = appendTakeToTimeline({
        takeId,
        screenPath: screenPath || '',
        cameraPath,
        windowPaths: hasWindowCaptures ? recordedWindowPaths : null,
        recordedDuration,
        trimSections: sectionsForTimeline,
        projectSession
      });
      if (!appendResult || !matchesActiveProjectSession(projectSession)) return;

      if (activeProject && appendResult) {
        const take = activeProject.takes.find((t: Take) => t.id === takeId);
        if (take) {
          take.duration = appendResult.takeDuration;
          take.sections = appendResult.takeSections;
        }
        await persistProjectNow();
        if (activeProjectPath && hasScreen && screenPath) {
          // Standard screen proxy
          proxyStatus.set(takeId, { status: 'pending', percent: 0 });
          renderSectionMarkers();
          window.electronAPI
            .generateProxy({
              takeId,
              screenPath,
              projectFolder: activeProjectPath,
              durationSec: recordedDuration
            })
            .catch((err: unknown) =>
              console.warn('[Proxy] Failed to start proxy generation:', err)
            );
        } else if (activeProjectPath && hasWindowCaptures) {
          // Generate a proxy for each window file
          for (let wi = 0; wi < recordedWindowPaths.length; wi++) {
            const wp = recordedWindowPaths[wi]!;
            const proxyKey = `${takeId}-win${wi}`;
            proxyStatus.set(proxyKey, { status: 'pending', percent: 0 });
            window.electronAPI
              .generateProxy({
                takeId: proxyKey,
                screenPath: wp.path,
                projectFolder: activeProjectPath,
                durationSec: recordedDuration
              })
              .catch((err: unknown) => console.warn(`[Proxy] Failed for window ${wi}:`, err));
          }
          renderSectionMarkers();
        }
      }
      await completeRecoveryTake();
    } catch (error) {
      console.error('Failed to append recording to project timeline:', error);
      setWorkspaceView('recording');
    }
  }
  updateWorkspaceHeader();
}

export function updateTimer(): void {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  timerEl.textContent = `${m}:${s}`;
}
