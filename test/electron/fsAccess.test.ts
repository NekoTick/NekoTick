import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isProtectedAppDataPath,
  isProtectedCodexConfigPath,
  isProtectedGitMetadataPath,
} from '../../electron/fsAccess.mjs';

describe('desktop filesystem access boundary', () => {
  const userDataPath = path.join('/home/alice', '.config', 'vlaina');

  it('protects internal secret directories and sensitive account store files from generic renderer fs access', () => {
    expect(isProtectedAppDataPath(path.join(userDataPath, '.vlaina', 'app', 'secrets'), userDataPath)).toBe(true);
    expect(isProtectedAppDataPath(path.join(userDataPath, '.vlaina', 'app', 'secrets', 'ai-providers.json'), userDataPath)).toBe(true);
    expect(isProtectedAppDataPath(path.join(userDataPath, '.vlaina', 'app', 'secrets', 'account.json'), userDataPath)).toBe(true);
    expect(isProtectedAppDataPath(path.join(userDataPath, '.vlaina', 'app', 'account', 'profile.json'), userDataPath)).toBe(true);
    expect(isProtectedAppDataPath(path.join(userDataPath, '.vlaina', 'app', 'permissions', 'filesystem.json'), userDataPath)).toBe(true);
  });

  it('keeps normal app data files accessible through the generic storage adapter', () => {
    expect(isProtectedAppDataPath(path.join(userDataPath, '.vlaina', 'app'), userDataPath)).toBe(false);
    expect(isProtectedAppDataPath(path.join(userDataPath, '.vlaina', 'app', 'settings.json'), userDataPath)).toBe(false);
    expect(isProtectedAppDataPath(path.join(userDataPath, '.vlaina', 'chat', 'sessions', 'index.json'), userDataPath)).toBe(false);
  });

  it('protects default and configured Codex homes across desktop platforms', () => {
    expect(isProtectedCodexConfigPath('/home/test/.codex/config.toml', {
      homePath: '/home/test',
      platform: 'linux',
    })).toBe(true);
    expect(isProtectedCodexConfigPath('/home/test/.codex-other', {
      homePath: '/home/test',
      platform: 'linux',
    })).toBe(false);
    expect(isProtectedCodexConfigPath('C:\\Users\\Test\\.Codex\\config.toml', {
      homePath: 'C:\\Users\\Test',
      platform: 'win32',
    })).toBe(true);
    expect(isProtectedCodexConfigPath('D:\\agent-config\\settings.toml', {
      homePath: 'C:\\Users\\Test',
      platform: 'win32',
      codexHome: 'D:\\agent-config',
    })).toBe(true);
  });

  it('protects Git metadata paths across desktop platforms', () => {
    expect(isProtectedGitMetadataPath('/home/test/project/.git/config', { platform: 'linux' })).toBe(true);
    expect(isProtectedGitMetadataPath('/home/test/project/.github/workflows/test.yml', { platform: 'linux' })).toBe(false);
    expect(isProtectedGitMetadataPath('C:\\Users\\Test\\Project\\.Git\\config', { platform: 'win32' })).toBe(true);
  });

});
