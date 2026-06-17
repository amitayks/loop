import { mergeInt16Arrays } from '../../src/renderer/features/recording/pcm-utils.js';

describe('mergeInt16Arrays', () => {
  test('concatenates two arrays: length and contents in order', () => {
    const a = Int16Array.from([1, 2, 3]);
    const b = Int16Array.from([4, 5]);

    const merged = mergeInt16Arrays([a, b]);

    expect(merged).toBeInstanceOf(Int16Array);
    expect(merged.length).toBe(a.length + b.length);
    expect(Array.from(merged)).toEqual([1, 2, 3, 4, 5]);
  });

  test('empty input returns an empty Int16Array', () => {
    const merged = mergeInt16Arrays([]);

    expect(merged).toBeInstanceOf(Int16Array);
    expect(merged.length).toBe(0);
  });
});
