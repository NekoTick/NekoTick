import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.vlaina.mobile',
  appName: 'Vlaina',
  webDir: 'dist',
  backgroundColor: '#ffffff',
  android: {
    allowMixedContent: false,
    backgroundColor: '#ffffff',
  },
  ios: {
    backgroundColor: '#ffffff',
    contentInset: 'never',
    preferredContentMode: 'mobile',
  },
  plugins: {
    CapacitorCookies: {
      enabled: true,
    },
    Keyboard: {
      resize: KeyboardResize.Native,
      resizeOnFullScreen: true,
    },
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#ffffff',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: true,
    },
  },
};

export default config;
