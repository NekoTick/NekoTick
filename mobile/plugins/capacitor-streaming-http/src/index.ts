import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface StreamingHttpStartOptions {
  id: string;
  url: string;
  method: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  bodyBase64?: string;
  includeCookies?: boolean;
  readTimeoutMs?: number;
}

export interface StreamingHttpResponseEvent {
  id: string;
  status: number;
  statusText: string;
  headers: Record<string, string>;
}

export interface StreamingHttpChunkEvent {
  id: string;
  dataBase64: string;
}

export interface StreamingHttpTerminalEvent {
  id: string;
}

export interface StreamingHttpErrorEvent extends StreamingHttpTerminalEvent {
  message: string;
}

export interface StreamingHttpPlugin {
  start(options: StreamingHttpStartOptions): Promise<void>;
  cancel(options: { id: string }): Promise<void>;
  addListener(
    eventName: 'response',
    listener: (event: StreamingHttpResponseEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'chunk',
    listener: (event: StreamingHttpChunkEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'end',
    listener: (event: StreamingHttpTerminalEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'error',
    listener: (event: StreamingHttpErrorEvent) => void,
  ): Promise<PluginListenerHandle>;
}

export const StreamingHttp = registerPlugin<StreamingHttpPlugin>('StreamingHttp');
