import fs from 'node:fs';

const maxUpdateDownloadBytes = 1024 * 1024 * 1024;
const updateDownloadIdleTimeoutMs = process.env.NODE_ENV === 'test' ? 20 : 30_000;

function withUpdateDownloadIdleTimeout(task, message, onTimeout = () => {}) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      try {
        onTimeout();
      } catch {
      }
      reject(new Error(message));
    }, updateDownloadIdleTimeoutMs);
  });

  return Promise.race([task, timeout]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

export async function writeResponseBodyToFile(response, filePath, {
  append = false,
  existingBytes = 0,
} = {}) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    throw new Error('Update download response body is unavailable.');
  }

  const contentLength = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(contentLength) && existingBytes + contentLength > maxUpdateDownloadBytes) {
    throw new Error('Update download is too large.');
  }

  const reader = response.body.getReader();
  const stream = fs.createWriteStream(filePath, { flags: append ? 'a' : 'w' });
  let rejectStreamError;
  const streamErrorPromise = new Promise((_, reject) => {
    rejectStreamError = reject;
  });
  const handleStreamError = (error) => rejectStreamError(error);
  stream.once('error', handleStreamError);
  let downloadedBytes = 0;

  try {
    for (;;) {
      const { done, value } = await withUpdateDownloadIdleTimeout(
        Promise.race([reader.read(), streamErrorPromise]),
        'Update download stalled while waiting for data.',
        () => {
          void Promise.resolve(reader.cancel()).catch(() => {});
        },
      );
      if (done) break;
      const chunk = Buffer.from(value);
      downloadedBytes += chunk.byteLength;
      if (existingBytes + downloadedBytes > maxUpdateDownloadBytes) {
        throw new Error('Update download is too large.');
      }
      if (!stream.write(chunk)) {
        await withUpdateDownloadIdleTimeout(
          Promise.race([
            new Promise((resolve) => stream.once('drain', resolve)),
            streamErrorPromise,
          ]),
          'Update download stalled while writing to disk.',
          () => stream.destroy(),
        );
      }
    }

    await withUpdateDownloadIdleTimeout(
      Promise.race([
        new Promise((resolve, reject) => {
          stream.end((error) => {
            if (error) reject(error);
            else resolve();
          });
        }),
        streamErrorPromise,
      ]),
      'Update download stalled while finalizing the file.',
      () => stream.destroy(),
    );
  } catch (error) {
    stream.destroy();
    throw error;
  } finally {
    stream.removeListener('error', handleStreamError);
    reader.releaseLock();
  }

  if (existingBytes + downloadedBytes <= 0) {
    throw new Error('Update download is empty.');
  }

  return existingBytes + downloadedBytes;
}
