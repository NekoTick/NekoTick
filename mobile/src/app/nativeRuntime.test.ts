import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MOBILE_BACK_REQUEST_EVENT,
  MOBILE_URL_OPEN_EVENT,
  type MobileUrlOpenDetail,
} from './mobileNavigationEvents';

type NativeListener = (event: never) => void;

const mocks = vi.hoisted(() => ({
  appListeners: new Map<string, NativeListener>(),
  keyboardListeners: new Map<string, NativeListener>(),
  exitApp: vi.fn(async () => undefined),
  flushPendingWrites: vi.fn(async () => true),
  flushEditor: vi.fn(),
  getLaunchUrl: vi.fn(async () => undefined as { url: string } | undefined),
  hideKeyboard: vi.fn(async () => undefined),
  hideSplash: vi.fn(async () => undefined),
  listenerRemoves: [] as ReturnType<typeof vi.fn>[],
}));

function addListener(target: Map<string, NativeListener>, name: string, listener: NativeListener) {
  target.set(name, listener);
  const remove = vi.fn(async () => undefined);
  mocks.listenerRemoves.push(remove);
  return Promise.resolve({ remove });
}

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn((name: string, listener: NativeListener) => (
      addListener(mocks.appListeners, name, listener)
    )),
    exitApp: mocks.exitApp,
    getLaunchUrl: mocks.getLaunchUrl,
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(() => 'android'),
    isNativePlatform: vi.fn(() => true),
  },
}));

vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: vi.fn(async () => undefined) },
  ImpactStyle: { Light: 'LIGHT' },
}));

vi.mock('@capacitor/keyboard', () => ({
  Keyboard: {
    addListener: vi.fn((name: string, listener: NativeListener) => (
      addListener(mocks.keyboardListeners, name, listener)
    )),
    hide: mocks.hideKeyboard,
  },
}));

vi.mock('@capacitor/share', () => ({
  Share: {
    canShare: vi.fn(async () => ({ value: true })),
    share: vi.fn(async () => undefined),
  },
}));

vi.mock('@capacitor/splash-screen', () => ({
  SplashScreen: { hide: mocks.hideSplash },
}));

vi.mock('@capacitor/status-bar', () => ({
  StatusBar: {
    getInfo: vi.fn(async () => ({ height: 24 })),
    setOverlaysWebView: vi.fn(async () => undefined),
    setStyle: vi.fn(async () => undefined),
  },
  Style: { Dark: 'DARK', Light: 'LIGHT' },
}));

vi.mock('@/lib/storage/flushPendingWrites', () => ({
  flushPendingWrites: mocks.flushPendingWrites,
}));

vi.mock('@/stores/notes/pendingEditorMarkdownFlusher', () => ({
  flushCurrentPendingEditorMarkdown: mocks.flushEditor,
}));

import { installMobileNativeRuntime } from './nativeRuntime';

function emit(
  listeners: Map<string, NativeListener>,
  name: string,
  detail: unknown = undefined,
): void {
  const listener = listeners.get(name);
  if (!listener) throw new Error(`Missing ${name} listener`);
  listener(detail as never);
}

beforeEach(() => {
  mocks.appListeners.clear();
  mocks.keyboardListeners.clear();
  mocks.listenerRemoves.length = 0;
  mocks.getLaunchUrl.mockResolvedValue(undefined);
  document.documentElement.className = '';
  document.documentElement.removeAttribute('data-mobile-keyboard-open');
  document.documentElement.style.cssText = '';
});

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe('mobile native runtime', () => {
  it('hides the keyboard before dispatching a navigation back request', async () => {
    const runtime = await installMobileNativeRuntime();
    const backRequest = vi.fn();
    window.addEventListener(MOBILE_BACK_REQUEST_EVENT, backRequest);

    emit(mocks.keyboardListeners, 'keyboardWillShow', { keyboardHeight: 243.6 });
    expect(document.documentElement.style.getPropertyValue('--vlaina-mobile-keyboard-height'))
      .toBe('244px');
    expect(document.documentElement.hasAttribute('data-mobile-keyboard-open')).toBe(true);

    emit(mocks.appListeners, 'backButton');
    await vi.waitFor(() => expect(mocks.hideKeyboard).toHaveBeenCalledOnce());
    expect(backRequest).not.toHaveBeenCalled();
    expect(document.documentElement.hasAttribute('data-mobile-keyboard-open')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--vlaina-mobile-keyboard-height'))
      .toBe('0px');

    emit(mocks.keyboardListeners, 'keyboardDidHide');
    expect(document.documentElement.hasAttribute('data-mobile-keyboard-open')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--vlaina-mobile-keyboard-height'))
      .toBe('0px');

    window.removeEventListener(MOBILE_BACK_REQUEST_EVENT, backRequest);
    await runtime.dispose();
  });

  it('closes the top visible dialog before routing or exiting', async () => {
    const runtime = await installMobileNativeRuntime();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    Object.defineProperty(dialog, 'getClientRects', { value: () => [{}] });
    const escape = vi.fn();
    dialog.addEventListener('keydown', escape);
    document.body.appendChild(dialog);
    const backRequest = vi.fn();
    window.addEventListener(MOBILE_BACK_REQUEST_EVENT, backRequest);

    emit(mocks.appListeners, 'backButton');
    await vi.waitFor(() => expect(escape).toHaveBeenCalledOnce());

    expect((escape.mock.calls[0]?.[0] as KeyboardEvent).key).toBe('Escape');
    expect(backRequest).not.toHaveBeenCalled();
    expect(mocks.exitApp).not.toHaveBeenCalled();

    window.removeEventListener(MOBILE_BACK_REQUEST_EVENT, backRequest);
    await runtime.dispose();
  });

  it('exits only when an unobstructed Notes back request is not consumed', async () => {
    const runtime = await installMobileNativeRuntime();
    const consume = (event: Event) => event.preventDefault();
    window.addEventListener(MOBILE_BACK_REQUEST_EVENT, consume);

    emit(mocks.appListeners, 'backButton');
    await Promise.resolve();
    expect(mocks.exitApp).not.toHaveBeenCalled();

    window.removeEventListener(MOBILE_BACK_REQUEST_EVENT, consume);
    emit(mocks.appListeners, 'backButton');
    await vi.waitFor(() => expect(mocks.exitApp).toHaveBeenCalledOnce());
    expect(mocks.flushEditor).toHaveBeenCalledOnce();
    expect(mocks.flushPendingWrites).toHaveBeenCalledOnce();

    await runtime.dispose();
  });

  it('coalesces an exit flush with an in-flight background flush', async () => {
    let finishFlush: (saved: boolean) => void = () => undefined;
    mocks.flushPendingWrites.mockReturnValueOnce(new Promise<boolean>((resolve) => {
      finishFlush = resolve;
    }));
    const runtime = await installMobileNativeRuntime();

    emit(mocks.appListeners, 'pause');
    emit(mocks.appListeners, 'backButton');

    await vi.waitFor(() => expect(mocks.flushPendingWrites).toHaveBeenCalledOnce());
    expect(mocks.exitApp).not.toHaveBeenCalled();

    finishFlush(true);
    await vi.waitFor(() => expect(mocks.exitApp).toHaveBeenCalledOnce());

    await runtime.dispose();
  });

  it('hides the splash once and forwards a launch URL once', async () => {
    vi.useFakeTimers();
    mocks.getLaunchUrl.mockResolvedValue({ url: 'vlaina://open/graph' });
    const runtime = await installMobileNativeRuntime();
    const opened: string[] = [];
    const handleOpen = (event: Event) => {
      opened.push((event as CustomEvent<MobileUrlOpenDetail>).detail.url);
    };
    window.addEventListener(MOBILE_URL_OPEN_EVENT, handleOpen);

    await runtime.hooks.onReady?.();
    await runtime.hooks.onReady?.();
    await vi.runAllTimersAsync();

    expect(mocks.hideSplash).toHaveBeenCalledOnce();
    expect(mocks.getLaunchUrl).toHaveBeenCalledOnce();
    expect(opened).toEqual(['vlaina://open/graph']);

    window.removeEventListener(MOBILE_URL_OPEN_EVENT, handleOpen);
    await runtime.dispose();
    expect(mocks.listenerRemoves.every((remove) => remove.mock.calls.length === 1)).toBe(true);
  });
});
