const BASE64_PREFIX = /^data:[^;]*;base64,/i;

export async function readFilesystemBinary(data: string | Blob): Promise<Uint8Array> {
  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }

  const normalized = data.replace(BASE64_PREFIX, '');
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function encodeFilesystemBinary(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function readFilesystemText(data: string | Blob): Promise<string> {
  return data instanceof Blob ? data.text() : data;
}
