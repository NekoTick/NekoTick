export const MAX_AI_STREAM_RESPONSE_BYTES = 64 * 1024 * 1024;

const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  'byteLength',
)?.get;
const typedArrayTagGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  Symbol.toStringTag,
)?.get;
const byteTypedArrayTags = new Set(['Int8Array', 'Uint8Array', 'Uint8ClampedArray']);

function getByteTypedArrayLength(chunk: unknown): number | null {
  if (!ArrayBuffer.isView(chunk) || !typedArrayByteLengthGetter || !typedArrayTagGetter) {
    return null;
  }

  try {
    const tag = Reflect.apply(typedArrayTagGetter, chunk, []) as unknown;
    if (typeof tag !== 'string' || !byteTypedArrayTags.has(tag)) {
      return null;
    }

    const byteLength = Reflect.apply(typedArrayByteLengthGetter, chunk, []) as unknown;
    return typeof byteLength === 'number' ? byteLength : null;
  } catch {
    return null;
  }
}

export function addAiStreamResponseChunkBytes(totalBytes: number, chunk: unknown): number {
  const byteLength = getByteTypedArrayLength(chunk);
  if (typeof byteLength !== 'number' || !Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new Error('Invalid AI stream response chunk');
  }
  if (byteLength > MAX_AI_STREAM_RESPONSE_BYTES - totalBytes) {
    throw new Error('AI stream response is too large');
  }
  return totalBytes + byteLength;
}
