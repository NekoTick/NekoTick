import { describe, expect, it } from 'vitest';
import { hexToRgb, hsvToRgb, rgbToHex, rgbToHsv } from './whiteboardColor';

describe('whiteboard color conversion', () => {
  it('parses short and long hex values', () => {
    expect(hexToRgb('#4a5')).toEqual({ r: 68, g: 170, b: 85 });
    expect(hexToRgb('#43A555')).toEqual({ r: 67, g: 165, b: 85 });
    expect(hexToRgb('#nope')).toBeNull();
  });

  it('round trips RGB through HSV and HEX', () => {
    const rgb = { r: 67, g: 165, b: 85 };
    expect(rgbToHex(rgb)).toBe('#43A555');
    const roundTrip = hsvToRgb(rgbToHsv(rgb));
    expect(roundTrip.r).toBeCloseTo(rgb.r);
    expect(roundTrip.g).toBeCloseTo(rgb.g);
    expect(roundTrip.b).toBeCloseTo(rgb.b);
  });
});
