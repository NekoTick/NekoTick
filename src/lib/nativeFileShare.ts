export interface NativeFileShareRequest {
  data: Blob | Uint8Array;
  fileName: string;
  mimeType: string;
  title?: string;
}

export type NativeFileShareHandler = (
  request: NativeFileShareRequest,
) => Promise<void>;

let nativeFileShareHandler: NativeFileShareHandler | null = null;

export function configureNativeFileShare(
  handler: NativeFileShareHandler | null,
): void {
  nativeFileShareHandler = handler;
}

export function hasNativeFileShare(): boolean {
  return nativeFileShareHandler !== null;
}

export async function shareNativeFile(
  request: NativeFileShareRequest,
): Promise<boolean> {
  if (!nativeFileShareHandler) return false;
  await nativeFileShareHandler(request);
  return true;
}
