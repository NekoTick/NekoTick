import { describe, expect, it, vi } from 'vitest';
import { registerDesktopGitIpc } from '../../electron/desktopGitIpc.mjs';

describe('desktop Git IPC', () => {
  it('registers the fixed Git API and forwards only its declared arguments', async () => {
    const handlers = new Map<string, (...args: unknown[]) => unknown>();
    const service = {
      status: vi.fn(async () => ({ branch: 'main' })),
      workingDiff: vi.fn(async () => 'working patch'),
      history: vi.fn(async () => [{ hash: 'abc' }]),
      commitDiff: vi.fn(async () => 'commit patch'),
      commit: vi.fn(async () => ({ branch: 'main' })),
      fetch: vi.fn(async () => ({ branch: 'main' })),
      pull: vi.fn(async () => ({ branch: 'main' })),
      push: vi.fn(async () => ({ branch: 'main' })),
    };

    registerDesktopGitIpc({
      handleIpc: (channel, handler) => handlers.set(channel, handler),
      service,
    });

    expect([...handlers.keys()]).toEqual([
      'desktop:git:status',
      'desktop:git:fetch',
      'desktop:git:working-diff',
      'desktop:git:history',
      'desktop:git:commit-diff',
      'desktop:git:commit',
      'desktop:git:pull',
      'desktop:git:push',
    ]);

    await expect(handlers.get('desktop:git:status')?.({}, '/repo')).resolves.toEqual({ branch: 'main' });
    await expect(handlers.get('desktop:git:fetch')?.({}, '/repo')).resolves.toEqual({ branch: 'main' });
    await expect(handlers.get('desktop:git:working-diff')?.({}, '/repo', ['README.md'])).resolves.toBe(
      'working patch',
    );
    await expect(handlers.get('desktop:git:history')?.({}, '/repo', 25)).resolves.toEqual([{ hash: 'abc' }]);
    await expect(handlers.get('desktop:git:commit-diff')?.({}, '/repo', 'abcdef0')).resolves.toBe(
      'commit patch',
    );
    const options = { message: 'Save notes', paths: ['notes/today.md'] };
    await handlers.get('desktop:git:commit')?.({}, '/repo', options);
    await handlers.get('desktop:git:pull')?.({}, '/repo');
    await handlers.get('desktop:git:push')?.({}, '/repo');

    expect(service.status).toHaveBeenCalledWith('/repo');
    expect(service.fetch).toHaveBeenCalledWith('/repo');
    expect(service.workingDiff).toHaveBeenCalledWith('/repo', ['README.md']);
    expect(service.history).toHaveBeenCalledWith('/repo', 25);
    expect(service.commitDiff).toHaveBeenCalledWith('/repo', 'abcdef0');
    expect(service.commit).toHaveBeenCalledWith('/repo', options);
    expect(service.pull).toHaveBeenCalledWith('/repo');
    expect(service.push).toHaveBeenCalledWith('/repo');
  });

  it('serializes operations for the same repository while keeping repositories independent', async () => {
    const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
    let finishCommit: () => void = () => undefined;
    const service = {
      status: vi.fn(),
      workingDiff: vi.fn(),
      history: vi.fn(),
      commitDiff: vi.fn(),
      fetch: vi.fn(),
      commit: vi.fn(() => new Promise((resolve) => {
        finishCommit = () => resolve({ branch: 'main' });
      })),
      pull: vi.fn(async () => ({ branch: 'other' })),
      push: vi.fn(async () => ({ branch: 'main' })),
    };
    registerDesktopGitIpc({
      handleIpc: (channel, handler) => handlers.set(channel, handler),
      service,
    });

    const commit = handlers.get('desktop:git:commit')?.({}, '/repo', {
      message: 'First', paths: ['README.md'],
    });
    await vi.waitFor(() => expect(service.commit).toHaveBeenCalledTimes(1));
    const push = handlers.get('desktop:git:push')?.({}, '/repo');
    const otherRepositoryPull = handlers.get('desktop:git:pull')?.({}, '/other-repo');

    await expect(otherRepositoryPull).resolves.toEqual({ branch: 'other' });
    expect(service.push).not.toHaveBeenCalled();
    finishCommit();
    await expect(commit).resolves.toEqual({ branch: 'main' });
    await expect(push).resolves.toEqual({ branch: 'main' });
    expect(service.push).toHaveBeenCalledTimes(1);
  });
});
