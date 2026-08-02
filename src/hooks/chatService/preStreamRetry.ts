function createAbortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw createAbortError();
}

export async function sendWithoutReplay(
  send: (onChunk: (chunk: string) => void) => Promise<string>,
  onChunk: (chunk: string) => void,
  signal: AbortSignal | undefined,
): Promise<string> {
  throwIfAborted(signal);
  let result: string;
  try {
    result = await send((chunk) => {
      throwIfAborted(signal);
      onChunk(chunk);
      throwIfAborted(signal);
    });
  } catch (error) {
    throwIfAborted(signal);
    throw error;
  }
  throwIfAborted(signal);
  return result;
}
