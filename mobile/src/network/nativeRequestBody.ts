const MAX_NATIVE_HTTP_BODY_BYTES = 64 * 1024 * 1024;

function createAbortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) throw createAbortError();
}

async function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> {
  throwIfAborted(signal);
  if (!signal) return await promise;
  promise.catch(() => undefined);

  return await new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener('abort', abort);
    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const abort = () => settle(() => reject(createAbortError()));
    signal.addEventListener('abort', abort, { once: true });
    promise.then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error)),
    );
  });
}

function assertBodySize(byteLength: number): void {
  if (!Number.isFinite(byteLength) || byteLength < 0 || byteLength > MAX_NATIVE_HTTP_BODY_BYTES) {
    throw new Error('Native HTTP request body is too large.');
  }
}

function assertTextBodySize(value: string): void {
  let byteLength = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) byteLength += 1;
    else if (code <= 0x7ff) byteLength += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        byteLength += 4;
        index += 1;
      } else byteLength += 3;
    } else byteLength += 3;
    assertBodySize(byteLength);
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

export async function normalizeNativeRequestBody(
  body: BodyInit | null | undefined,
  signal?: AbortSignal | null,
): Promise<{ body?: string; bodyBase64?: string }> {
  throwIfAborted(signal);
  if (body == null) return {};
  if (typeof body === 'string') {
    assertTextBodySize(body);
    return { body };
  }

  let bytes: Uint8Array;
  if (body instanceof Blob) {
    assertBodySize(body.size);
    bytes = new Uint8Array(await raceWithAbort(body.arrayBuffer(), signal));
  } else if (body instanceof ArrayBuffer) {
    bytes = new Uint8Array(body);
  } else if (ArrayBuffer.isView(body)) {
    bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  } else {
    throw new Error('Unsupported native HTTP request body.');
  }

  throwIfAborted(signal);
  assertBodySize(bytes.byteLength);
  return { bodyBase64: bytesToBase64(bytes) };
}

export { MAX_NATIVE_HTTP_BODY_BYTES };
