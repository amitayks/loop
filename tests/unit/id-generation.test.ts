import { generateOverlayId, generateAudioOverlayId } from '../../src/shared/domain/project.js';

describe('generateOverlayId', () => {
  test('matches the overlay-<ts>-<n> format', () => {
    expect(generateOverlayId()).toMatch(/^overlay-\d+-\d+$/);
  });

  test('produces unique values across 1000 rapid calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      ids.add(generateOverlayId());
    }
    expect(ids.size).toBe(1000);
  });
});

describe('generateAudioOverlayId', () => {
  test('matches the audio-overlay-<ts>-<n> format', () => {
    expect(generateAudioOverlayId()).toMatch(/^audio-overlay-\d+-\d+$/);
  });

  test('produces unique values across 1000 rapid calls', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      ids.add(generateAudioOverlayId());
    }
    expect(ids.size).toBe(1000);
  });
});
