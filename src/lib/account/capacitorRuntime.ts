interface CapacitorRuntime {
  isNativePlatform?: () => boolean;
}

export interface NativeAccountHttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  data?: string;
  connectTimeout: number;
  readTimeout: number;
  responseType: 'text';
}

export interface NativeAccountHttpResponse {
  data: unknown;
  status: number;
  headers: Record<string, string>;
  url: string;
}

type NativeAccountHttpHandler = (
  request: NativeAccountHttpRequest,
) => Promise<NativeAccountHttpResponse>;

let nativeAccountHttpHandler: NativeAccountHttpHandler | null = null;

export function isNativeCapacitorRuntime(): boolean {
  const capacitor = (globalThis as typeof globalThis & { Capacitor?: CapacitorRuntime }).Capacitor;
  try {
    return capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

export function configureNativeAccountHttp(handler: NativeAccountHttpHandler | null): void {
  nativeAccountHttpHandler = handler;
}

export function requestNativeAccountHttp(
  request: NativeAccountHttpRequest,
): Promise<NativeAccountHttpResponse> {
  if (!nativeAccountHttpHandler) {
    throw new Error('Native account HTTP is unavailable.');
  }
  return nativeAccountHttpHandler(request);
}
