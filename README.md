# loop

`loop` is a desktop app for recording screen-based videos, transcribing speech in real time, cutting dead space from the transcript, and turning raw takes into a clean, edited MP4 — landscape **or** vertical (9:16) — without leaving the app.

The goal behind it: the creator should spend 100% of their time on the video content and let the tool handle the rest of the edit.

Built with **Electron**, **ffmpeg** (`ffmpeg-static`), and **ElevenLabs** (Scribe for realtime transcription; music/SFX/voice for audio overlays), `loop` keeps the editing loop short: record → trim by speech → arrange the timeline → render.

---

## Read this first (you are the audience)

**If you are an AI coding agent working in this repository — Claude Code or any other assistant — this README is written for you.** It is your orientation map: what `loop` is, where its code lives, how it is built, and how it must be changed. It is *not* the law.

> **[`AGENTS.md`](./AGENTS.md) is the canonical source of truth.** It owns the required workflow, test-first expectations, coverage policy by layer, architecture guardrails, verification requirements, release-integrity rules, and the agent completion checklist. **When this README and `AGENTS.md` disagree, follow `AGENTS.md`.** [`CLAUDE.md`](./CLAUDE.md) exists only to point you there.

Before you change anything, in order:

1. **[`AGENTS.md`](./AGENTS.md)** — the rules you must follow. Non-negotiable.
2. **`openspec/`** — how work is proposed and specced here (see [Working with OpenSpec](#working-with-openspec)). Run `openspec list` to see active changes.
3. **This README** — the feature surface and the module map, so you know where code belongs.
4. **`docs/production/`** — deeper internal docs: `feature-inventory.md`, `target-architecture.md`, `runbook.md`.

Human readers are welcome — but everything below is addressed to the agent doing the work.

---

## What `loop` does

`loop` has grown well past "record and trim." Treat the list below as the current product surface — every item is backed by a shipped or in-flight spec under `openspec/specs/`.

```
   CAPTURE                     EDIT  (timeline)                  RENDER  (ffmpeg)
 ┌────────────────┐   ┌──────────────────────────────┐   ┌──────────────────────┐
 │ screen + mic   │   │ sections: split·trim·delete   │   │ trim + concat, CFR    │
 │ optional camera│   │ undo / redo, multi-take       │   │ fps probe → stable fps│
 │ multi-window   │──▶│ zoom/pan + mouse auto-track   │──▶│ zoompan expressions   │
 │  (≤2, no macOS │   │ reel 9:16 crop + zoom-out bg  │   │ reel crop + dark bg   │
 │  FPS penalty)  │   │ overlays on 4 tracks          │   │ overlay filter graph  │
 │ wallpaper base │   │ audio overlays + volume mix   │   │ amix + audio presets  │
 │ mouse @ ~20Hz  │   │ camera PiP / fullscreen keyfr.│   │ camera PiP / fullscreen│
 └────────────────┘   └──────────────────────────────┘   └──────────────────────┘
        │                          ▲                         │ + Ctrl+T → full-res
        ▼                          │ proxy .mp4 (smooth      │   thumbnail PNG
   ElevenLabs Scribe ──▶ realtime  │ scrubbing on long takes)
   transcript ──▶ auto-build timeline sections from speech
```

### Capture & devices
- Records **screen + microphone**, with an **optional camera** stream, in one session.
- **Multi-window capture**: capture up to two individual windows via `desktopCapturer` and composite them on a **wallpaper background**. This sidesteps the macOS ScreenCaptureKit penalty that drops full-screen capture to ~1 FPS on space switches.
- Hybrid **source picker** (single-select for None/Entire-Screen/devices, multi-select for windows).
- Live **composite preview** while recording (screen fit/fill + camera PiP + window streams).
- **Mouse position** recorded at ~20 Hz to a per-take JSON file (enables auto-track in the editor).
- **Content protection** ("invisible from recording") synced with `setContentProtection`.

### Transcript & auto-trim (speech-first editing)
- **Realtime transcript** via ElevenLabs Scribe websocket — partial + committed segments.
- Non-speech annotations (bracketed cues) are stripped from the visible transcript.
- **Segment editing**: select and toggle-delete transcript segments before the first cut.
- **Automatic section building** from speech (padding + overlap merge), with safe fallbacks when there is no speech.

### Timeline editor
- Section ops: **split, trim, delete**, all with **undo/redo** snapshots.
- **Playback** across section boundaries and across multiple takes.
- **Camera sync offset** (per project) for capture devices that arrive late (e.g. HDMI dongles).
- **Camera keyframing**: PiP / fullscreen / hidden per section, with "apply to future sections."
- **Per-section PiP scale** with interpolated transitions.
- **Per-mode state save/restore**: landscape and reel each remember their own zoom/pan/PiP/crop independently.

### Zoom, pan & mouse auto-track
- Per-section **zoom (1×–3×)** with draggable pan keyframes; smooth 0.3 s transitions.
- **Mouse auto-track** ("follow cursor") — the zoomed viewport follows the recorded cursor trail with configurable smoothing, in both preview and render.

### Reel mode (9:16)
- Output **aspect toggle** 16:9 / 9:16.
- Draggable **crop strip** with per-section keyframe anchors and animated transitions.
- **Zoom-out (<1×)** fills the letterbox with a darkened, scaled copy of the content.
- **Crop-fit to content bounds** so fit-mode reels never show black side bars.

### Overlays (one unified system, tracks 0–3)
- **Media overlays** — images and video, drag/resize (aspect-locked), split, trim, per-mode position/size, fade + movement transitions.
- **Window-capture overlays** — recorded window streams are first-class overlays (`mediaType: 'window'`), not a parallel system.
- **Audio overlays** — background music, SFX, or voiceover with per-clip **volume**, waveform thumbnails, and per-section screen-audio volume; mixed via ffmpeg `amix`. (This is where the ElevenLabs music / sound-effects / text-to-speech skills under `.agents/skills/` come in.)
- **Center-on-click**, reference-counted media files, and undo/redo across all tracks.

### Render & export (ffmpeg)
- Composite render: trims sources, concatenates, applies fit/fill + camera PiP/fullscreen keyframes, outputs **constant-frame-rate** video after probing for a stable fps.
- Camera **sync-offset compensation**, reel crop + zoom-out background, auto-track zoompan expressions, overlay filter graph (z-ordered by track), and audio mixing with export presets + optional compressor.
- **Thumbnail capture** (`Ctrl+T`) renders a full-resolution PNG of the current frame through the same filter graph — landscape or reel.

### Performance
- **Editor proxy files**: each take is transcoded in the background to a lightweight H264 960×540 proxy with dense keyframes for smooth scrubbing; export always uses the original source.
- Lazy media init, stale-media cleanup, and explicit media-stream lifecycle teardown.

### Projects & recovery
- Create/open projects (auto-numbered sibling folders to avoid clobbering), autosave + manual save points.
- Recent + last-project list (deduped, with missing folders filtered out).
- **Pending-take recovery** via `.pending-recording.json` so an interrupted recording can be re-appended on reopen.
- Take/section file staging (`.deleted/`) with reference counting.

---

## Architecture & where code goes

`loop` runs from compiled output in `dist/` — never from `src/` directly. All source is **TypeScript** (`strict: true`) with project references enforcing the layer boundaries below. Respect them; `AGENTS.md` treats them as guardrails.

```
src/
├── main/            Electron main process (.ts)
│   ├── app/         window + app bootstrap (create-window, …)
│   ├── ipc/         IPC registration — wiring only, no business logic
│   ├── infra/       runtime infra
│   └── services/    main-process business logic ← put it here, not in ipc/ or app/
│       ├── project-service.ts        project load/save/normalize
│       ├── scribe-service.ts         ElevenLabs Scribe realtime tokens
│       ├── sections-service.ts       section computation from transcript
│       ├── render-service.ts         composite render orchestration
│       ├── render-filter-service.ts  ffmpeg filter-graph builders (pure-ish)
│       ├── ffmpeg-runner.ts          ffmpeg process execution
│       ├── fps-service.ts            fps probing / CFR selection
│       ├── proxy-service.ts          background proxy .mp4 generation
│       └── thumbnail-service.ts      Ctrl+T single-frame PNG render
│
├── shared/          browser-safe domain logic shared across layers (.ts)
│   ├── domain/      canvas geometry, easing, section-math, mouse-trail, project rules
│   └── types/       domain / ipc / services type contracts
│
└── renderer/        renderer entrypoint + feature modules (.ts, esbuild-bundled)
    └── features/    capture, recording, transcript, editor, timeline, section,
                     drawing, overlay, audio-overlay, media, render, project,
                     background, keyframe, geometry, format, dom, workspace
```

Placement rules (full version in `AGENTS.md`):

- **Shared domain/normalization logic → `src/shared/`.** Never duplicate business logic across renderer and main.
- **Main-process business logic → `src/main/services/`**, not in IPC registration or bootstrap.
- **Renderer feature logic → `src/renderer/features/`**, not inline in `src/index.html`.
- **`preload` stays a narrow bridge** — no business logic.
- Pure data logic first (testable), side effects at the edges, dependencies injected where practical.

---

## How this repo is built

The recent history is a deliberate hardening arc — useful context when you read the code:

- **Full TypeScript conversion** with strict mode and project references.
- **Shared domain logic centralized** (canvas geometry, easing, section math, mouse trail, project canonicalization) so renderer and main share one source of truth.
- **Renderer god-file decomposed** — the old `app.ts` was split into ~28 focused feature modules plus dedicated state/DOM-element modules.
- **esbuild ESM bundle** for the renderer, with a stricter CSP and no Tailwind CDN.
- **Renderer-health e2e gate** that fails the build if the renderer doesn't come up clean.

Carry that discipline forward: small focused modules, named by responsibility, with tests.

---

## The workflow you must follow

This is the short version. **`AGENTS.md` is authoritative** — read it before a non-trivial change.

1. Identify the affected feature and its expected behavior.
2. Define/update acceptance criteria **before** implementing.
3. **Write or update tests first** for the intended behavior (one proving test that would fail without your change).
4. Implement the code.
5. Run the **full verification suite**.
6. If tests fail, fix the *code* — do **not** weaken assertions unless the product requirement itself changed.

Coverage expectation by layer: very high for `src/shared/**`, high for pure `src/main/services/**` (normalization, parsing, validation, section math, fps selection, ffmpeg filter builders), unit + integration for orchestration-heavy code, and behavior/smoke/e2e for renderer glue. If logic moves or behavior changes, coverage stays the same or improves.

A change is **not complete** until: acceptance criteria are set, tests are added/updated, implementation matches them, no assertion was weakened to get green, docs are updated if workflow/behavior changed, and **`npm run check` passes**. End every handoff by stating what behavior changed, what tests you added, what commands you ran, and any residual risk.

---

## Commands

Use **npm** in this repo.

```bash
npm ci              # install
npm run dev         # build (ts → bundle → assets → styles) then launch Electron
npm start           # same build + launch for a normal local run

npm run lint        # eslint, zero warnings
npm run typecheck   # tsc --build
npm run test        # vitest unit/integration with coverage
npm run test:e2e    # Electron smoke / renderer-health gate
npm run package:smoke

npm run check       # lint + typecheck + test + e2e + package smoke — run before finishing
```

Do not launch with raw `electron .` — the app runs from `dist/`, which the build scripts produce. Do not add `.js` source files to `src/`.

---

## Getting started

### Requirements
- Node.js 22+
- npm

### Configure environment
`loop` needs an ElevenLabs API key to mint realtime Scribe tokens (and to use the audio-generation skills).

```bash
cp .env.example .env
# then set:
ELEVENLABS_API_KEY=your_key_here
```

Required env vars must be documented in `.env.example`, validated at runtime, and never committed. Don't commit `.env`.

### Run

```bash
npm run dev
```

---

## Working with OpenSpec

This repo is **spec-driven**. Product behavior is captured as capabilities and changes under `openspec/`:

- `openspec/specs/<capability>/spec.md` — the living spec for each capability (e.g. `reel-mode`, `unified-overlay-render`, `take-proxy-files`, `window-capture-recording`).
- `openspec/changes/<name>/` — in-flight changes (`proposal.md`, `design.md`, `tasks.md`, delta specs).
- `openspec/changes/archive/` — completed changes, dated. The archive is the project's design history — read it to understand *why* something is the way it is.

```bash
openspec list          # active changes + progress
openspec list --json   # machine-readable
```

When you add or change behavior, update the relevant spec and, if contributor workflow or product behavior changed, the docs under `docs/production/` and `AGENTS.md`.

---

## Notes

- Realtime transcription requires `ELEVENLABS_API_KEY`.
- Project files and captured media are stored **locally**.
- Final renders are produced through **ffmpeg**; export always uses the original take, never the editor proxy.
- Cross-platform behavior matters — avoid macOS-only assumptions in paths, dialogs, and workflows.

## Status

This project is being prepared for open-source release; the repository is moving to `tadaspetra/loop`.

## License

Licensed under **Apache-2.0**. See [`LICENSE`](./LICENSE).
