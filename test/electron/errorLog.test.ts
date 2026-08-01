import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createErrorLogService,
  ERROR_LOG_DEDUPE_LIMIT,
  ERROR_LOG_MAX_FILE_BYTES,
  ERROR_LOG_MAX_RETAINED_FILES,
} from '../../electron/errorLog.mjs';

let tempDirs: string[] = [];

function createMockApp() {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'vlaina-error-log-'));
  tempDirs.push(userDataPath);

  return {
    isPackaged: true,
    getName: () => 'vlaina-test',
    getVersion: () => '9.9.9',
    getLocale: () => 'zh-CN',
    getPath: (name: string) => {
      if (name !== 'userData') {
        throw new Error(`Unexpected path request: ${name}`);
      }
      return userDataPath;
    },
  };
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
  tempDirs = [];
});

describe('error log service', () => {
  it('persists renderer diagnostics without query parameter values', async () => {
    const service = createErrorLogService({ app: createMockApp() });
    const logFilePath = await service.logRendererError({
      source: 'react-error-boundary',
      type: 'react',
      name: 'TypeError',
      message: 'Cannot read properties of null',
      reactVersion: '19.2.7',
      buildMode: 'production',
      isDev: false,
      isProd: true,
      href: 'file:///app/index.html?notesRootPath=/private/notes&notePath=secret.md#heading',
      location: {
        protocol: 'file:',
        origin: 'file://',
        pathname: '/C:/Program Files/vlaina/resources/app.asar/dist/index.html',
        hash: '',
        search: '?notePath=C:/Users/example/private-note.md',
        searchKeys: ['notesRootPath', 'notePath'],
      },
      document: {
        title: 'vlaina',
        visibilityState: 'visible',
        hasFocus: true,
      },
      screen: {
        width: 1920,
        height: 1080,
        availWidth: 1920,
        availHeight: 1040,
        colorDepth: 24,
        pixelDepth: 24,
      },
      timezone: {
        timeZone: 'Asia/Shanghai',
        offsetMinutes: -480,
      },
      storage: {
        localStorage: true,
        sessionStorage: true,
        indexedDB: true,
      },
      runtime: {
        isSecureContext: true,
        crossOriginIsolated: false,
        hardwareConcurrency: 16,
        deviceMemory: 8,
        maxTouchPoints: 0,
      },
    }, 'renderer-reported-error');

    expect(logFilePath).toBeTruthy();
    const entry = JSON.parse(fs.readFileSync(logFilePath!, 'utf8'));

    expect(entry.schemaVersion).toBe(2);
    expect(entry.processType).toBe('renderer');
    expect(entry.renderer.diagnostics).toMatchObject({
      reactVersion: '19.2.7',
      buildMode: 'production',
      isDev: false,
      isProd: true,
      location: {
        searchKeys: ['notesRootPath', 'notePath'],
      },
      document: {
        title: 'vlaina',
        visibilityState: 'visible',
        hasFocus: true,
      },
      timezone: {
        timeZone: 'Asia/Shanghai',
        offsetMinutes: -480,
      },
      storage: {
        localStorage: true,
        sessionStorage: true,
        indexedDB: true,
      },
    });
    expect(JSON.stringify(entry)).not.toContain('C:/Users/example/private-note.md');
    expect(JSON.stringify(entry)).not.toContain('/private/notes');
    expect(JSON.stringify(entry)).not.toContain('secret.md');
  });

  it('redacts sensitive values and stores logs with private POSIX permissions', async () => {
    const service = createErrorLogService({ app: createMockApp() });
    const error = new Error(
      'Request failed Authorization: Bearer sk-secret-value-123456 x-api-key=secret_header_value url=https://example.com/?token=nts_query_secret_123456'
    );
    error.stack = [
      'Error: Request failed',
      'x-app-session-token: nts_stack_secret_123456',
      'at demo (app.js:1:1)',
    ].join('\n');

    const logFilePath = await service.logMainError(error, 'main');

    expect(logFilePath).toBeTruthy();
    const rawLog = fs.readFileSync(logFilePath!, 'utf8');
    expect(rawLog).not.toContain('sk-secret-value-123456');
    expect(rawLog).not.toContain('secret_header_value');
    expect(rawLog).not.toContain('nts_query_secret_123456');
    expect(rawLog).not.toContain('nts_stack_secret_123456');
    expect(rawLog).toContain('[redacted]');

    if (process.platform !== 'win32') {
      expect(fs.statSync(path.dirname(logFilePath!)).mode & 0o777).toBe(0o700);
      expect(fs.statSync(logFilePath!).mode & 0o777).toBe(0o600);
    }
  });

  it('deduplicates repeated renderer errors', async () => {
    const service = createErrorLogService({ app: createMockApp() });
    for (let index = 0; index < ERROR_LOG_DEDUPE_LIMIT + 5; index += 1) {
      await service.logRendererError({ source: 'note-save', message: 'same failure' });
    }

    const { currentLogFilePath } = service.getInfo();
    const rawLog = fs.readFileSync(currentLogFilePath, 'utf8');
    expect(rawLog.match(/"schemaVersion"/g)).toHaveLength(ERROR_LOG_DEDUPE_LIMIT);
  });

  it('rotates oversized logs and bounds retained files', async () => {
    const service = createErrorLogService({ app: createMockApp() });
    for (let index = 0; index < 40; index += 1) {
      await service.logMainError(new Error(`${index}-${'x'.repeat(32 * 1024)}`), `main-${index}`);
    }

    const { logsDir } = service.getInfo();
    const logFiles = fs.readdirSync(logsDir).filter((name) => name.startsWith('vlaina-error-'));
    expect(logFiles.length).toBeLessThanOrEqual(ERROR_LOG_MAX_RETAINED_FILES);
    for (const fileName of logFiles) {
      expect(fs.statSync(path.join(logsDir, fileName)).size).toBeLessThanOrEqual(
        ERROR_LOG_MAX_FILE_BYTES,
      );
    }
  });
});
