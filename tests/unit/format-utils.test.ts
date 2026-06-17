import {
  formatTime,
  formatProjectDate,
  hexToRgba,
  getVolumeSvg,
  VOL_SVG_MUTE,
  VOL_SVG_LOW,
  VOL_SVG_HIGH,
} from '../../src/renderer/features/format/format-utils.js';

describe('formatTime', () => {
  test('formats zero as 00:00', () => {
    expect(formatTime(0)).toBe('00:00');
  });

  test('formats sub-minute durations with zero-padded minutes', () => {
    expect(formatTime(5)).toBe('00:05');
    expect(formatTime(59)).toBe('00:59');
  });

  test('formats multi-minute durations', () => {
    expect(formatTime(60)).toBe('01:00');
    expect(formatTime(125)).toBe('02:05');
  });

  test('rolls minutes past 60 (no hours component)', () => {
    expect(formatTime(3600)).toBe('60:00');
    expect(formatTime(3661)).toBe('61:01');
  });

  test('floors fractional seconds', () => {
    expect(formatTime(90.9)).toBe('01:30');
  });
});

describe('hexToRgba', () => {
  test('parses #rrggbb with alpha', () => {
    expect(hexToRgba('#ff8800', 0.5)).toBe('rgba(255,136,0,0.5)');
  });

  test('parses black and white', () => {
    expect(hexToRgba('#000000', 1)).toBe('rgba(0,0,0,1)');
    expect(hexToRgba('#ffffff', 0)).toBe('rgba(255,255,255,0)');
  });
});

describe('formatProjectDate', () => {
  test('formats a valid timestamp', () => {
    const ts = 1700000000000;
    expect(formatProjectDate(ts)).toBe(new Date(ts).toLocaleString());
  });

  test('returns empty string for falsy input', () => {
    expect(formatProjectDate(0)).toBe('');
    expect(formatProjectDate(null)).toBe('');
    expect(formatProjectDate(undefined)).toBe('');
    expect(formatProjectDate('')).toBe('');
  });

  test('returns empty string for invalid input', () => {
    expect(formatProjectDate('not-a-date')).toBe('');
  });
});

describe('getVolumeSvg', () => {
  test('returns mute svg at or below zero', () => {
    expect(getVolumeSvg(0)).toBe(VOL_SVG_MUTE);
    expect(getVolumeSvg(-1)).toBe(VOL_SVG_MUTE);
  });

  test('returns low svg for volumes up to and including 0.5', () => {
    expect(getVolumeSvg(0.1)).toBe(VOL_SVG_LOW);
    expect(getVolumeSvg(0.5)).toBe(VOL_SVG_LOW);
  });

  test('returns high svg above 0.5', () => {
    expect(getVolumeSvg(0.51)).toBe(VOL_SVG_HIGH);
    expect(getVolumeSvg(1)).toBe(VOL_SVG_HIGH);
  });
});
