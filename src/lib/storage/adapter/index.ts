import { hasElectronDesktopBridge } from '@/lib/desktop/backend';
import { getElectronBridge } from '@/lib/electron/bridge';
import type { StorageAdapter, StoragePlatform } from './types';
import { ElectronAdapter } from './ElectronAdapter';
import { WebAdapter } from './WebAdapter';
import { joinPath as simpleJoin } from './pathUtils';

export type { StorageAdapter, StoragePlatform, FileInfo, WriteOptions, ReadOptions, ListOptions } from './types';
export { ElectronAdapter } from './ElectronAdapter';
export { WebAdapter } from './WebAdapter';
export * from './pathUtils';

let adapterInstance: StorageAdapter | null = null;

export function getPlatform(): StoragePlatform {
  if (adapterInstance) {
    return adapterInstance.platform;
  }

  if (hasElectronDesktopBridge()) {
    return 'electron';
  }

  return 'web';
}

export function isElectron(): boolean {
  return getPlatform() === 'electron';
}

export function isWeb(): boolean {
  return getPlatform() === 'web';
}

export function isCapacitor(): boolean {
  return getPlatform() === 'capacitor';
}

export function registerStorageAdapter(adapter: StorageAdapter): void {
  adapterInstance = adapter;
}

export function getStorageAdapter(): StorageAdapter {
  if (!adapterInstance) {
    const platform = getPlatform();
    adapterInstance = platform === 'electron'
      ? new ElectronAdapter()
      : new WebAdapter();
  }

  return adapterInstance;
}

export function resetStorageAdapter(): void {
  adapterInstance = null;
}

export async function joinPath(...segments: string[]): Promise<string> {
  if (isElectron()) {
    const bridge = getElectronBridge();
    if (!bridge) {
      throw new Error('Electron path bridge is not available.');
    }
    return bridge.path.join(...segments);
  }

  return simpleJoin(...segments);
}

export async function toFileUrl(path: string): Promise<string> {
  if (isElectron()) {
    const bridge = getElectronBridge();
    if (!bridge) {
      throw new Error('Electron path bridge is not available.');
    }
    return bridge.path.toFileUrl(path);
  }

  const adapter = getStorageAdapter();
  if (adapter.toFileUrl) {
    return adapter.toFileUrl(path);
  }

  return path;
}
