export type NativeAIFetchHandler = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

let nativeAIFetchHandler: NativeAIFetchHandler | null = null;

export function configureNativeAIFetch(handler: NativeAIFetchHandler | null): void {
  nativeAIFetchHandler = handler;
}

export function aiTransportFetch(url: string, init?: RequestInit): Promise<Response> {
  return nativeAIFetchHandler
    ? nativeAIFetchHandler(url, init)
    : fetch(url, init);
}
