import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  assertDesktopCommandAllowed,
  buildDesktopCommandEnvironment,
  getDesktopCommandShell,
  normalizeDesktopCommandRequest,
  referencesProtectedCodexConfig,
} from '../../electron/desktopCommandPolicy.mjs';

describe('desktop command policy', () => {
  it('normalizes a bounded single-line request relative to the active workspace', () => {
    expect(normalizeDesktopCommandRequest({
      command: 'pnpm install',
      cwd: 'project',
      workspaceRoot: '/home/example',
      purpose: 'Install project dependencies',
      timeoutSeconds: 30,
      locale: 'zh-CN',
    })).toEqual({
      command: 'pnpm install',
      cwd: path.resolve('/home/example', 'project'),
      workspaceRoot: path.resolve('/home/example'),
      purpose: 'Install project dependencies',
      timeoutMs: 30_000,
      locale: 'zh-CN',
    });
  });

  it('rejects commands that can visually hide extra lines or bidi content', () => {
    expect(() => normalizeDesktopCommandRequest({ command: 'echo safe\nrm -rf /' }, '/tmp'))
      .toThrow('unsupported control characters');
    expect(() => normalizeDesktopCommandRequest({ command: 'echo safe\u202Erm' }, '/tmp'))
      .toThrow('unsupported control characters');
    expect(() => normalizeDesktopCommandRequest({ command: 'echo safe\u2028hidden' }, '/tmp'))
      .toThrow('unsupported control characters');
    expect(() => normalizeDesktopCommandRequest({ command: 'echo zero\u200Bwidth' }, '/tmp'))
      .toThrow('unsupported control characters');
  });

  it('rejects invalid timeouts and oversized commands', () => {
    expect(() => normalizeDesktopCommandRequest({
      command: 'echo ok', purpose: 'Check output', timeoutSeconds: 0, workspaceRoot: '/tmp',
    }))
      .toThrow('between 1 and 1800 seconds');
    expect(() => normalizeDesktopCommandRequest({
      command: 'x'.repeat(2049), purpose: 'Check output', workspaceRoot: '/tmp',
    }))
      .toThrow('too long');
  });

  it('bounds untrusted locale input before normalization', () => {
    expect(normalizeDesktopCommandRequest({
      command: 'echo ok',
      purpose: 'Check output',
      workspaceRoot: '/tmp',
      locale: `zh-CN${'x'.repeat(1000)}`,
    }).locale).toBe('en');
  });

  it('requires command working directories to stay inside the active workspace', () => {
    expect(() => normalizeDesktopCommandRequest({
      command: 'pwd',
      cwd: '/home/example-other',
      purpose: 'Print the working directory',
      workspaceRoot: '/home/example',
    })).toThrow('must stay inside the active workspace');
  });

  it('requires the AI-provided command purpose at the desktop boundary', () => {
    expect(() => normalizeDesktopCommandRequest({ command: 'echo ok', purpose: '' }, '/tmp'))
      .toThrow('Command purpose is required');
  });

  it('passes only an explicit environment allowlist to commands', () => {
    const environment = buildDesktopCommandEnvironment({
      PATH: '/usr/bin',
      HOME: '/home/example',
      LANG: 'en_US.UTF-8',
      OPENAI_API_KEY: 'secret',
      AWS_SECRET_ACCESS_KEY: 'secret',
      CUSTOM_TOKEN: 'secret',
    });

    expect(environment).toMatchObject({
      PATH: '/usr/bin',
      HOME: '/home/example',
      LANG: 'en_US.UTF-8',
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    });
    expect(environment).not.toHaveProperty('OPENAI_API_KEY');
    expect(environment).not.toHaveProperty('AWS_SECRET_ACCESS_KEY');
    expect(environment).not.toHaveProperty('CUSTOM_TOKEN');
  });

  it('blocks direct and lightly obfuscated access to Codex configuration', () => {
    expect(referencesProtectedCodexConfig('type %USERPROFILE%\\.codex\\config.toml')).toBe(true);
    expect(referencesProtectedCodexConfig('cat "$HOME"/.co"dex"/config.toml')).toBe(true);
    expect(referencesProtectedCodexConfig('Get-Content $env:CODEX_HOME/config.toml')).toBe(true);
    expect(referencesProtectedCodexConfig('codex --version')).toBe(false);

    expect(() => assertDesktopCommandAllowed('cat ~/.codex/config.toml', 'linux'))
      .toThrow('protected Codex configuration');
    expect(() => assertDesktopCommandAllowed('type %USERPROFILE%\\.codex\\config.toml', 'win32'))
      .toThrow('protected Codex configuration');
  });

  it('rejects explicit background and detached process syntax', () => {
    expect(() => assertDesktopCommandAllowed('sleep 10 &', 'linux'))
      .toThrow('background commands');
    expect(() => assertDesktopCommandAllowed('nohup sleep 10', 'linux'))
      .toThrow('background commands');
    expect(() => assertDesktopCommandAllowed('Start-Process notepad.exe', 'win32'))
      .toThrow('background commands');
    expect(() => assertDesktopCommandAllowed('start "" /b worker.exe', 'win32'))
      .toThrow('background commands');
    expect(() => assertDesktopCommandAllowed('echo first && echo second', 'linux')).not.toThrow();
    expect(() => assertDesktopCommandAllowed("printf 'a&b'", 'linux')).not.toThrow();
    expect(() => assertDesktopCommandAllowed('npm start', 'win32')).not.toThrow();
  });

  it('uses fixed shells rather than arbitrary upstream-provided programs', () => {
    expect(getDesktopCommandShell('linux', { SHELL: '/tmp/evil-shell' })).toEqual({
      shell: '/bin/sh',
      args: ['-c'],
    });
    expect(getDesktopCommandShell('win32', {
      SystemRoot: 'C:\\Windows',
      ComSpec: 'C:\\Tools\\cmd.exe',
    })).toEqual({
      shell: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c'],
    });
    expect(getDesktopCommandShell('win32', {
      SystemRoot: 'C:\\Temp',
      ComSpec: 'C:\\Temp\\cmd.exe',
    })).toEqual({
      shell: 'C:\\Windows\\System32\\cmd.exe',
      args: ['/d', '/s', '/c'],
    });
  });
});
