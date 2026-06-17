import fs from 'fs';
import os from 'os';
import path from 'path';

import { createProjectService } from '../../src/main/services/project-service.js';

interface Sandbox {
  root: string;
  app: { getPath(name: string): string };
  cleanup(): void;
}

function createSandbox(): Sandbox {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'video-project-service-'));
  const userData = path.join(root, 'user-data');
  const app = {
    getPath(name: string) {
      if (name === 'userData') return userData;
      if (name === 'documents' || name === 'home') return root;
      return root;
    }
  };

  return {
    root,
    app,
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

describe('main/services/project-service integration', () => {
  let sandbox: Sandbox;
  let service: ReturnType<typeof createProjectService>;

  beforeEach(() => {
    sandbox = createSandbox();
    service = createProjectService({ app: sandbox.app });
  });

  afterEach(() => {
    sandbox.cleanup();
  });

  test('createProject creates project files and unique folders', () => {
    const first = service.createProject({ name: 'Demo', parentFolder: sandbox.root });
    const second = service.createProject({ name: 'Demo', parentFolder: sandbox.root });

    expect(fs.existsSync(path.join(first.projectPath, 'project.json'))).toBe(true);
    expect(fs.existsSync(path.join(second.projectPath, 'project.json'))).toBe(true);
    expect(second.projectPath).not.toBe(first.projectPath);
    expect(first.project.settings.exportAudioPreset).toBe('compressed');
    expect(first.project.settings.cameraSyncOffsetMs).toBe(0);
    expect(second.project.settings.exportAudioPreset).toBe('compressed');
    expect(second.project.settings.cameraSyncOffsetMs).toBe(0);
  });

  test('saveProject and openProject round-trip takes and relative paths', () => {
    const created = service.createProject({ name: 'Roundtrip', parentFolder: sandbox.root });
    const screenPath = path.join(created.projectPath, 'screen.webm');
    const cameraPath = path.join(created.projectPath, 'camera.webm');
    fs.writeFileSync(screenPath, 'screen', 'utf8');
    fs.writeFileSync(cameraPath, 'camera', 'utf8');

    const saved = service.saveProject({
      projectPath: created.projectPath,
      project: {
        ...created.project,
        settings: {
          ...created.project.settings,
          exportAudioPreset: 'compressed',
          cameraSyncOffsetMs: 145
        },
        takes: [
          {
            id: 'take-1',
            duration: 2.5,
            screenPath,
            cameraPath,
            sections: [{ start: 0, end: 2.5, sourceStart: 0, sourceEnd: 2.5 }]
          }
        ],
        timeline: {
          duration: 2.5,
          sections: [{ start: 0, end: 2.5, sourceStart: 0, sourceEnd: 2.5, takeId: 'take-1' }],
          keyframes: [
            {
              time: 0,
              pipX: 40,
              pipY: 50,
              pipVisible: true,
              cameraFullscreen: false,
              backgroundZoom: 2.2,
              backgroundPanX: 0.3,
              backgroundPanY: -0.4,
              sectionId: 'section-1',
              autoSection: true
            }
          ],
          selectedSectionId: null,
          hasCamera: true,
          sourceWidth: 1920,
          sourceHeight: 1080
        }
      }
    });

    expect(saved.project.takes[0]!.screenPath).toBe(screenPath);

    const raw = JSON.parse(
      fs.readFileSync(path.join(created.projectPath, 'project.json'), 'utf8')
    );
    expect(raw.takes[0].screenPath).toBe('screen.webm');
    expect(raw.takes[0].cameraPath).toBe('camera.webm');
    expect(raw.timeline.keyframes[0].backgroundZoom).toBe(2.2);
    expect(raw.timeline.keyframes[0].backgroundPanX).toBe(0.3);
    expect(raw.timeline.keyframes[0].backgroundPanY).toBe(-0.4);
    expect(raw.settings.exportAudioPreset).toBe('compressed');
    expect(raw.settings.cameraSyncOffsetMs).toBe(145);

    const opened = service.openProject(created.projectPath);
    expect(opened.project.takes[0]!.screenPath).toBe(screenPath);
    expect(opened.project.timeline.sections).toHaveLength(1);
    expect(opened.project.timeline.keyframes[0]!.backgroundZoom).toBe(2.2);
    expect(opened.project.timeline.keyframes[0]!.backgroundPanX).toBe(0.3);
    expect(opened.project.timeline.keyframes[0]!.backgroundPanY).toBe(-0.4);
    expect(opened.project.settings.exportAudioPreset).toBe('compressed');
    expect(opened.project.settings.cameraSyncOffsetMs).toBe(145);
  });

  test('recovery take lifecycle persists and clears payload', () => {
    const created = service.createProject({ name: 'Recovery', parentFolder: sandbox.root });
    const screenPath = path.join(created.projectPath, 'screen.webm');
    fs.writeFileSync(screenPath, 'screen', 'utf8');

    const recovery = service.setRecoveryTake({
      projectPath: created.projectPath,
      take: {
        id: 'take-r',
        screenPath,
        recordedDuration: 4.2,
        sections: [{ start: 0, end: 4.2, sourceStart: 0, sourceEnd: 4.2 }],
        trimSegments: [{ start: 0, end: 1, text: 'hello' }]
      }
    });

    expect(recovery.recoveryTake.id).toBe('take-r');

    const opened = service.openProject(created.projectPath);
    expect(opened.recoveryTake).toBeTruthy();
    expect(opened.recoveryTake!.id).toBe('take-r');

    expect(service.clearRecoveryByProject(created.projectPath)).toBe(true);
    const reopened = service.openProject(created.projectPath);
    expect(reopened.recoveryTake).toBeNull();
  });

  test('recent project metadata tracks last project and list', () => {
    const one = service.createProject({ name: 'One', parentFolder: sandbox.root });
    const two = service.createProject({ name: 'Two', parentFolder: sandbox.root });

    service.setLastProject(one.projectPath);
    service.setLastProject(two.projectPath);

    const recent = service.listRecentProjects(10);
    expect(recent.projects.length).toBeGreaterThan(0);
    expect(recent.lastProjectPath).toBe(two.projectPath);

    const loaded = service.loadLastProject();
    expect(loaded!.projectPath).toBe(two.projectPath);
  });

  test('stageTakeFiles moves files to .deleted/ folder', () => {
    const created = service.createProject({ name: 'StageTest', parentFolder: sandbox.root });
    const screenFile = path.join(created.projectPath, 'screen.webm');
    const cameraFile = path.join(created.projectPath, 'camera.webm');
    fs.writeFileSync(screenFile, 'screen-data', 'utf8');
    fs.writeFileSync(cameraFile, 'camera-data', 'utf8');

    service.stageTakeFiles(created.projectPath, [screenFile, cameraFile]);

    expect(fs.existsSync(screenFile)).toBe(false);
    expect(fs.existsSync(cameraFile)).toBe(false);
    expect(fs.existsSync(path.join(created.projectPath, '.deleted', 'screen.webm'))).toBe(true);
    expect(fs.existsSync(path.join(created.projectPath, '.deleted', 'camera.webm'))).toBe(true);
  });

  test('unstageTakeFiles moves files back from .deleted/ folder', () => {
    const created = service.createProject({ name: 'UnstageTest', parentFolder: sandbox.root });
    const screenFile = path.join(created.projectPath, 'screen.webm');
    fs.writeFileSync(screenFile, 'screen-data', 'utf8');

    service.stageTakeFiles(created.projectPath, [screenFile]);
    expect(fs.existsSync(screenFile)).toBe(false);

    service.unstageTakeFiles(created.projectPath, ['screen.webm']);
    expect(fs.existsSync(screenFile)).toBe(true);
    expect(fs.readFileSync(screenFile, 'utf8')).toBe('screen-data');
  });

  test('cleanupDeletedFolder removes .deleted/ folder permanently', () => {
    const created = service.createProject({ name: 'CleanupTest', parentFolder: sandbox.root });
    const screenFile = path.join(created.projectPath, 'screen.webm');
    fs.writeFileSync(screenFile, 'screen-data', 'utf8');

    service.stageTakeFiles(created.projectPath, [screenFile]);
    const deletedDir = path.join(created.projectPath, '.deleted');
    expect(fs.existsSync(deletedDir)).toBe(true);

    service.cleanupDeletedFolder(created.projectPath);
    expect(fs.existsSync(deletedDir)).toBe(false);
  });

  test('cleanupDeletedFolder is a no-op when .deleted/ does not exist', () => {
    const created = service.createProject({ name: 'NoDeletedTest', parentFolder: sandbox.root });
    // Should not throw
    service.cleanupDeletedFolder(created.projectPath);
    expect(fs.existsSync(path.join(created.projectPath, '.deleted'))).toBe(false);
  });

  test('stageTakeFiles skips non-existent files gracefully', () => {
    const created = service.createProject({ name: 'SkipTest', parentFolder: sandbox.root });
    // Should not throw when files don't exist
    service.stageTakeFiles(created.projectPath, [
      path.join(created.projectPath, 'nonexistent.webm'),
      null as unknown as string
    ]);
    // .deleted/ is created but empty
    expect(fs.existsSync(path.join(created.projectPath, '.deleted'))).toBe(true);
  });

  test('savedSections round-trip through save and open', () => {
    const created = service.createProject({ name: 'SavedSections', parentFolder: sandbox.root });
    service.saveProject({
      projectPath: created.projectPath,
      project: {
        ...created.project,
        timeline: {
          duration: 4,
          sections: [{ start: 0, end: 2, takeId: 'take-1' }],
          savedSections: [{ start: 2, end: 4, takeId: 'take-2', saved: true }],
          keyframes: [],
          selectedSectionId: null,
          hasCamera: false,
          sourceWidth: null,
          sourceHeight: null
        }
      }
    });

    const opened = service.openProject(created.projectPath);
    expect(opened.project.timeline.savedSections).toHaveLength(1);
    expect(opened.project.timeline.savedSections![0]!.saved).toBe(true);
    expect(opened.project.timeline.savedSections![0]!.takeId).toBe('take-2');
  });

  test('cleanupUnusedTakes removes unreferenced takes and their files', () => {
    const created = service.createProject({ name: 'CleanupTakes', parentFolder: sandbox.root });
    const usedScreen = path.join(created.projectPath, 'used-screen.webm');
    const unusedScreen = path.join(created.projectPath, 'unused-screen.webm');
    const unusedCamera = path.join(created.projectPath, 'unused-camera.webm');
    fs.writeFileSync(usedScreen, 'used', 'utf8');
    fs.writeFileSync(unusedScreen, 'unused-s', 'utf8');
    fs.writeFileSync(unusedCamera, 'unused-c', 'utf8');

    service.saveProject({
      projectPath: created.projectPath,
      project: {
        ...created.project,
        takes: [
          { id: 'take-used', screenPath: usedScreen, cameraPath: null, duration: 2 },
          { id: 'take-unused', screenPath: unusedScreen, cameraPath: unusedCamera, duration: 3 }
        ],
        timeline: {
          duration: 2,
          sections: [{ start: 0, end: 2, takeId: 'take-used' }],
          savedSections: [],
          keyframes: [],
          selectedSectionId: null,
          hasCamera: false,
          sourceWidth: null,
          sourceHeight: null
        }
      }
    });

    const result = service.cleanupUnusedTakes(created.projectPath);
    expect(result.removedCount).toBe(1);

    // Unused take files should be deleted
    expect(fs.existsSync(unusedScreen)).toBe(false);
    expect(fs.existsSync(unusedCamera)).toBe(false);
    // Used take file should remain
    expect(fs.existsSync(usedScreen)).toBe(true);

    // Project on disk should only have the used take
    const reopened = service.openProject(created.projectPath);
    expect(reopened.project.takes).toHaveLength(1);
    expect(reopened.project.takes[0]!.id).toBe('take-used');
  });

  test('cleanupUnusedTakes preserves takes referenced by savedSections', () => {
    const created = service.createProject({ name: 'SavedRef', parentFolder: sandbox.root });
    const savedScreen = path.join(created.projectPath, 'saved-screen.webm');
    fs.writeFileSync(savedScreen, 'saved', 'utf8');

    service.saveProject({
      projectPath: created.projectPath,
      project: {
        ...created.project,
        takes: [
          { id: 'take-saved', screenPath: savedScreen, cameraPath: null, duration: 2 }
        ],
        timeline: {
          duration: 0,
          sections: [],
          savedSections: [{ start: 0, end: 2, takeId: 'take-saved', saved: true }],
          keyframes: [],
          selectedSectionId: null,
          hasCamera: false,
          sourceWidth: null,
          sourceHeight: null
        }
      }
    });

    const result = service.cleanupUnusedTakes(created.projectPath);
    expect(result.removedCount).toBe(0);
    expect(fs.existsSync(savedScreen)).toBe(true);

    const reopened = service.openProject(created.projectPath);
    expect(reopened.project.takes).toHaveLength(1);
  });

  test('cleanupUnusedTakes also removes .deleted/ folder', () => {
    const created = service.createProject({ name: 'CleanBoth', parentFolder: sandbox.root });
    const screenFile = path.join(created.projectPath, 'screen.webm');
    fs.writeFileSync(screenFile, 'data', 'utf8');

    // Stage a file first
    service.stageTakeFiles(created.projectPath, [screenFile]);
    expect(fs.existsSync(path.join(created.projectPath, '.deleted'))).toBe(true);

    service.saveProject({
      projectPath: created.projectPath,
      project: {
        ...created.project,
        takes: [],
        timeline: {
          duration: 0, sections: [], savedSections: [], keyframes: [],
          selectedSectionId: null, hasCamera: false, sourceWidth: null, sourceHeight: null
        }
      }
    });

    service.cleanupUnusedTakes(created.projectPath);
    expect(fs.existsSync(path.join(created.projectPath, '.deleted'))).toBe(false);
  });

  test('importOverlayMedia copies file to overlay-media/ and returns relative path', () => {
    const created = service.createProject({ name: 'Overlay Test', parentFolder: sandbox.root });
    // Create a source file to import
    const sourceFile = path.join(sandbox.root, 'test-image.png');
    fs.writeFileSync(sourceFile, 'fake-png-data');

    const mediaPath = service.importOverlayMedia(created.projectPath, sourceFile);
    expect(mediaPath).toMatch(/^overlay-media\/test-image-\d+\.png$/);
    expect(fs.existsSync(path.join(created.projectPath, mediaPath))).toBe(true);
  });

  test('importOverlayMedia reuses existing file with identical content', () => {
    const created = service.createProject({ name: 'Dedup Test', parentFolder: sandbox.root });
    const sourceFile = path.join(sandbox.root, 'dedup-img.png');
    fs.writeFileSync(sourceFile, 'identical-content');

    const firstPath = service.importOverlayMedia(created.projectPath, sourceFile);
    const secondPath = service.importOverlayMedia(created.projectPath, sourceFile);
    // Same content -> same path returned, no duplicate
    expect(secondPath).toBe(firstPath);
    // Only one file in overlay-media/
    const files = fs.readdirSync(path.join(created.projectPath, 'overlay-media'));
    expect(files.length).toBe(1);
  });

  test('importOverlayMedia creates new file for different content', () => {
    const created = service.createProject({ name: 'Diff Test', parentFolder: sandbox.root });
    const sourceA = path.join(sandbox.root, 'imgA.png');
    const sourceB = path.join(sandbox.root, 'imgB.png');
    fs.writeFileSync(sourceA, 'content-a');
    fs.writeFileSync(sourceB, 'content-b');
    const pathA = service.importOverlayMedia(created.projectPath, sourceA);
    const pathB = service.importOverlayMedia(created.projectPath, sourceB);
    expect(pathA).not.toBe(pathB);
    const files = fs.readdirSync(path.join(created.projectPath, 'overlay-media'));
    expect(files.length).toBe(2);
  });

  test('stageOverlayFile moves file to .deleted/overlay-media/', () => {
    const created = service.createProject({ name: 'Stage Test', parentFolder: sandbox.root });
    const sourceFile = path.join(sandbox.root, 'stage-img.png');
    fs.writeFileSync(sourceFile, 'data');
    const mediaPath = service.importOverlayMedia(created.projectPath, sourceFile);

    service.stageOverlayFile(created.projectPath, mediaPath);
    expect(fs.existsSync(path.join(created.projectPath, mediaPath))).toBe(false);
    expect(fs.existsSync(path.join(created.projectPath, '.deleted', 'overlay-media', path.basename(mediaPath)))).toBe(true);
  });

  test('unstageOverlayFile restores file from .deleted/overlay-media/', () => {
    const created = service.createProject({ name: 'Unstage Test', parentFolder: sandbox.root });
    const sourceFile = path.join(sandbox.root, 'unstage-img.png');
    fs.writeFileSync(sourceFile, 'data');
    const mediaPath = service.importOverlayMedia(created.projectPath, sourceFile);

    service.stageOverlayFile(created.projectPath, mediaPath);
    expect(fs.existsSync(path.join(created.projectPath, mediaPath))).toBe(false);

    service.unstageOverlayFile(created.projectPath, mediaPath);
    expect(fs.existsSync(path.join(created.projectPath, mediaPath))).toBe(true);
  });

  test('cleanupDeletedFolder removes staged overlay media', () => {
    const created = service.createProject({ name: 'Cleanup Test', parentFolder: sandbox.root });
    const sourceFile = path.join(sandbox.root, 'cleanup-img.png');
    fs.writeFileSync(sourceFile, 'data');
    const mediaPath = service.importOverlayMedia(created.projectPath, sourceFile);

    service.stageOverlayFile(created.projectPath, mediaPath);
    service.cleanupDeletedFolder(created.projectPath);
    expect(fs.existsSync(path.join(created.projectPath, '.deleted'))).toBe(false);
  });

  test('saveProject serializes proxyPath as relative and openProject resolves it back', () => {
    const created = service.createProject({ name: 'ProxyRoundtrip', parentFolder: sandbox.root });
    const screenPath = path.join(created.projectPath, 'screen.webm');
    const proxyPath = path.join(created.projectPath, 'screen-proxy.mp4');
    fs.writeFileSync(screenPath, 'screen', 'utf8');
    fs.writeFileSync(proxyPath, 'proxy', 'utf8');

    service.saveProject({
      projectPath: created.projectPath,
      project: {
        ...created.project,
        takes: [{ id: 'take-1', duration: 5, screenPath, proxyPath, sections: [] }]
      }
    });

    const raw = JSON.parse(fs.readFileSync(path.join(created.projectPath, 'project.json'), 'utf8'));
    expect(raw.takes[0].proxyPath).toBe('screen-proxy.mp4');

    const loaded = service.openProject(created.projectPath);
    expect(loaded.project.takes[0]!.proxyPath).toBe(proxyPath);
  });

  test('saveProject serializes proxyPath as null when absent', () => {
    const created = service.createProject({ name: 'ProxyNull', parentFolder: sandbox.root });
    const screenPath = path.join(created.projectPath, 'screen.webm');
    fs.writeFileSync(screenPath, 'screen', 'utf8');

    service.saveProject({
      projectPath: created.projectPath,
      project: {
        ...created.project,
        takes: [{ id: 'take-1', duration: 5, screenPath, sections: [] }]
      }
    });

    const raw = JSON.parse(fs.readFileSync(path.join(created.projectPath, 'project.json'), 'utf8'));
    expect(raw.takes[0].proxyPath).toBeNull();
  });

  test('stageTakeFiles moves proxyPath file to .deleted/ alongside other files', () => {
    const created = service.createProject({ name: 'StageProxy', parentFolder: sandbox.root });
    const screenFile = path.join(created.projectPath, 'screen.webm');
    const proxyFile = path.join(created.projectPath, 'screen-proxy.mp4');
    fs.writeFileSync(screenFile, 'screen-data', 'utf8');
    fs.writeFileSync(proxyFile, 'proxy-data', 'utf8');

    service.stageTakeFiles(created.projectPath, [screenFile, proxyFile]);

    expect(fs.existsSync(screenFile)).toBe(false);
    expect(fs.existsSync(proxyFile)).toBe(false);
    expect(fs.existsSync(path.join(created.projectPath, '.deleted', 'screen.webm'))).toBe(true);
    expect(fs.existsSync(path.join(created.projectPath, '.deleted', 'screen-proxy.mp4'))).toBe(true);
  });

  test('stageTakeFiles skips proxyPath gracefully when file does not exist', () => {
    const created = service.createProject({ name: 'StageProxyMissing', parentFolder: sandbox.root });
    const screenFile = path.join(created.projectPath, 'screen.webm');
    fs.writeFileSync(screenFile, 'screen-data', 'utf8');
    const missingProxy = path.join(created.projectPath, 'screen-proxy.mp4');

    // Should not throw even though proxy does not exist
    service.stageTakeFiles(created.projectPath, [screenFile, missingProxy]);

    expect(fs.existsSync(path.join(created.projectPath, '.deleted', 'screen.webm'))).toBe(true);
    expect(fs.existsSync(path.join(created.projectPath, '.deleted', 'screen-proxy.mp4'))).toBe(false);
  });

  test('unstageTakeFiles restores proxyPath from .deleted/ folder', () => {
    const created = service.createProject({ name: 'UnstageProxy', parentFolder: sandbox.root });
    const screenFile = path.join(created.projectPath, 'screen.webm');
    const proxyFile = path.join(created.projectPath, 'screen-proxy.mp4');
    fs.writeFileSync(screenFile, 'screen-data', 'utf8');
    fs.writeFileSync(proxyFile, 'proxy-data', 'utf8');

    service.stageTakeFiles(created.projectPath, [screenFile, proxyFile]);
    expect(fs.existsSync(proxyFile)).toBe(false);

    service.unstageTakeFiles(created.projectPath, ['screen.webm', 'screen-proxy.mp4']);
    expect(fs.existsSync(screenFile)).toBe(true);
    expect(fs.existsSync(proxyFile)).toBe(true);
    expect(fs.readFileSync(proxyFile, 'utf8')).toBe('proxy-data');
  });

  test('saveProject serializes windowPaths with relative paths and round-trips on open', () => {
    const created = service.createProject({ name: 'WindowProxy', parentFolder: sandbox.root });
    const win0File = path.join(created.projectPath, 'win0.webm');
    const win0Proxy = path.join(created.projectPath, 'win0-proxy.mp4');
    const win1File = path.join(created.projectPath, 'win1.webm');
    fs.writeFileSync(win0File, 'win0-data', 'utf8');
    fs.writeFileSync(win0Proxy, 'win0-proxy-data', 'utf8');
    fs.writeFileSync(win1File, 'win1-data', 'utf8');

    service.saveProject({
      projectPath: created.projectPath,
      project: {
        ...created.project,
        takes: [{
          id: 'take-1',
          duration: 5,
          screenPath: null,
          cameraPath: null,
          sections: [],
          windowPaths: [
            { name: 'VS Code', path: win0File, proxyPath: win0Proxy, width: 1920, height: 1080 },
            { name: 'Chrome', path: win1File, width: 1280, height: 720 }
          ]
        }]
      }
    });

    // On disk, paths should be relative
    const raw = JSON.parse(fs.readFileSync(path.join(created.projectPath, 'project.json'), 'utf8'));
    expect(raw.takes[0].windowPaths[0].path).toBe('win0.webm');
    expect(raw.takes[0].windowPaths[0].proxyPath).toBe('win0-proxy.mp4');
    expect(raw.takes[0].windowPaths[1].path).toBe('win1.webm');

    // On open, paths should be absolute again
    const opened = service.openProject(created.projectPath);
    expect(opened.project.takes[0]!.windowPaths![0]!.path).toBe(win0File);
    expect(opened.project.takes[0]!.windowPaths![0]!.proxyPath).toBe(win0Proxy);
    expect(opened.project.takes[0]!.windowPaths![1]!.path).toBe(win1File);
  });

  test('cleanupUnusedTakes removes window files and proxy files for unreferenced takes', () => {
    const created = service.createProject({ name: 'CleanupWin', parentFolder: sandbox.root });
    const usedScreen = path.join(created.projectPath, 'used-screen.webm');
    const unusedWin0 = path.join(created.projectPath, 'unused-win0.webm');
    const unusedWin0Proxy = path.join(created.projectPath, 'unused-win0-proxy.mp4');
    const unusedProxy = path.join(created.projectPath, 'unused-proxy.mp4');
    const unusedMouse = path.join(created.projectPath, 'unused-mouse.json');
    fs.writeFileSync(usedScreen, 'used', 'utf8');
    fs.writeFileSync(unusedWin0, 'win0', 'utf8');
    fs.writeFileSync(unusedWin0Proxy, 'win0-proxy', 'utf8');
    fs.writeFileSync(unusedProxy, 'proxy', 'utf8');
    fs.writeFileSync(unusedMouse, '{}', 'utf8');

    service.saveProject({
      projectPath: created.projectPath,
      project: {
        ...created.project,
        takes: [
          { id: 'take-used', screenPath: usedScreen, cameraPath: null, duration: 2 },
          {
            id: 'take-unused',
            screenPath: null,
            cameraPath: null,
            mousePath: unusedMouse,
            proxyPath: unusedProxy,
            duration: 3,
            windowPaths: [
              { name: 'Win0', path: unusedWin0, proxyPath: unusedWin0Proxy }
            ]
          }
        ],
        timeline: {
          duration: 2,
          sections: [{ start: 0, end: 2, takeId: 'take-used' }],
          savedSections: [],
          keyframes: [],
          selectedSectionId: null,
          hasCamera: false,
          sourceWidth: null,
          sourceHeight: null
        }
      }
    });

    const result = service.cleanupUnusedTakes(created.projectPath);
    expect(result.removedCount).toBe(1);

    // All unused take files should be deleted
    expect(fs.existsSync(unusedWin0)).toBe(false);
    expect(fs.existsSync(unusedWin0Proxy)).toBe(false);
    expect(fs.existsSync(unusedProxy)).toBe(false);
    expect(fs.existsSync(unusedMouse)).toBe(false);
    // Used take file should remain
    expect(fs.existsSync(usedScreen)).toBe(true);
  });
});
