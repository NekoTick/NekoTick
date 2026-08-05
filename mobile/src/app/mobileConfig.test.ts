import { describe, expect, it } from 'vitest';
import config from '../../capacitor.config';

describe('mobile native configuration', () => {
  it('uses native keyboard resizing and an explicitly controlled splash screen', () => {
    expect(config.plugins).toMatchObject({
      Keyboard: {
        resize: 'native',
        resizeOnFullScreen: true,
      },
      SplashScreen: {
        launchAutoHide: false,
      },
    });
  });
});
