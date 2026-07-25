const DYNAMIC_IMPORT_RETRY_DELAYS_MS = [150, 600] as const;

type RetryWait = (delayMs: number) => Promise<void>;

export function isTransientDynamicImportError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  return name === 'ChunkLoadError' || /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module|loading chunk .* failed/i.test(message);
}

export async function retryDynamicImport<T>(
  load: () => Promise<T>,
  wait: RetryWait = waitForRetry,
): Promise<T> {
  for (const delayMs of DYNAMIC_IMPORT_RETRY_DELAYS_MS) {
    try {
      return await load();
    } catch (error) {
      if (!isTransientDynamicImportError(error)) throw error;
      await wait(delayMs);
    }
  }
  return load();
}

function waitForRetry(delayMs: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}
