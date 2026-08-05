function byteToHex(value: number): string {
  return value.toString(16).padStart(2, '0');
}

export function createMobileRandomUUID(): `${string}-${string}-${string}-${string}-${string}` {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, byteToHex).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function combineMobileAbortSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  const cleanups: Array<() => void> = [];
  const abortFrom = (signal: AbortSignal) => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    controller.abort(signal.reason);
  };

  for (const signal of signals) {
    if (signal.aborted) {
      abortFrom(signal);
      break;
    }
    const abort = () => abortFrom(signal);
    signal.addEventListener('abort', abort, { once: true });
    cleanups.push(() => signal.removeEventListener('abort', abort));
  }
  return controller.signal;
}

export function installMobileWebApiPolyfills(): void {
  if (typeof crypto.randomUUID !== 'function') {
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: createMobileRandomUUID,
    });
  }
  if (typeof AbortSignal.any !== 'function') {
    Object.defineProperty(AbortSignal, 'any', {
      configurable: true,
      value: combineMobileAbortSignals,
    });
  }
}
