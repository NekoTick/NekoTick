import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  getWindowsAppUserModelId,
  isMicrosoftStoreRuntime,
} from '../../electron/microsoftStoreIdentity.mjs';

describe('Microsoft Store runtime identity', () => {
  it('targets a Windows version accepted by Microsoft Store', () => {
    const builderConfig = readFileSync('electron-builder.yml', 'utf8');

    expect(builderConfig).toMatch(/^  minVersion: 10\.0\.17763\.0$/m);
    expect(builderConfig).toMatch(/^  maxVersionTested: 10\.0\.26100\.0$/m);
  });

  it('uses the package AUMID for Store builds', () => {
    const runtime = { windowsStore: true };
    expect(isMicrosoftStoreRuntime(runtime)).toBe(true);
    expect(getWindowsAppUserModelId(runtime)).toBe('vladelaina.vlaina_hnew8t3b8e0t6!vlaina');
  });

  it('keeps the direct distribution AUMID for ordinary builds', () => {
    expect(isMicrosoftStoreRuntime({})).toBe(false);
    expect(getWindowsAppUserModelId({})).toBe('com.vlaina.desktop');
  });
});
