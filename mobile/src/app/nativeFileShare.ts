import { Directory, type FilesystemPlugin } from '@capacitor/filesystem';
import type { SharePlugin } from '@capacitor/share';
import type {
  NativeFileShareHandler,
  NativeFileShareRequest,
} from '@/lib/nativeFileShare';
import { encodeFilesystemBinary } from '../storage/capacitorBinary';

const MAX_NATIVE_SHARE_FILE_BYTES = 64 * 1024 * 1024;
const NATIVE_SHARE_CACHE_DIRECTORY = 'vlaina-exports';
const INVALID_FILE_NAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

function sanitizeFileName(fileName: string): string {
  return fileName
    .replace(INVALID_FILE_NAME_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'Vlaina export';
}

async function readShareBytes(data: NativeFileShareRequest['data']): Promise<Uint8Array> {
  const byteLength = data instanceof Blob ? data.size : data.byteLength;
  if (byteLength > MAX_NATIVE_SHARE_FILE_BYTES) {
    throw new Error('Native share file is too large.');
  }
  return data instanceof Blob
    ? new Uint8Array(await data.arrayBuffer())
    : data;
}

export function createMobileFileShareHandler(
  filesystem: FilesystemPlugin,
  share: SharePlugin,
): NativeFileShareHandler {
  return async (request) => {
    const supported = await share.canShare();
    if (!supported.value) {
      throw new Error('File sharing is not available on this device.');
    }

    const fileName = sanitizeFileName(request.fileName);
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const path = `${NATIVE_SHARE_CACHE_DIRECTORY}/${nonce}-${fileName}`;
    const bytes = await readShareBytes(request.data);
    await filesystem.writeFile({
      data: encodeFilesystemBinary(bytes),
      directory: Directory.Cache,
      path,
      recursive: true,
    });
    const { uri } = await filesystem.getUri({ directory: Directory.Cache, path });
    const title = request.title || fileName;
    await share.share({ dialogTitle: title, files: [uri], title });
  };
}

export async function clearMobileFileShareCache(filesystem: FilesystemPlugin): Promise<void> {
  await filesystem.mkdir({
    directory: Directory.Cache,
    path: NATIVE_SHARE_CACHE_DIRECTORY,
    recursive: true,
  });
  await filesystem.rmdir({
    directory: Directory.Cache,
    path: NATIVE_SHARE_CACHE_DIRECTORY,
    recursive: true,
  });
}

export { MAX_NATIVE_SHARE_FILE_BYTES };
