import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createNoteRecoveryService } from '../../electron/noteRecovery.mjs';

const tempDirs: string[] = [];

function createService() {
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'vlaina-note-recovery-'));
  tempDirs.push(userDataPath);
  return {
    service: createNoteRecoveryService({
      app: { getPath: () => userDataPath },
    }),
    userDataPath,
  };
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { force: true, recursive: true });
  }
  tempDirs.length = 0;
});

describe('note recovery service', () => {
  it('atomically stages private recovery data and detects the disk baseline', async () => {
    const { service, userDataPath } = createService();

    await service.stage({
      notesPath: '/notes',
      notePath: 'alpha.md',
      content: '# Unsaved',
      baselineContent: '# Saved',
    });

    await expect(service.read({
      notesPath: '/notes',
      notePath: 'alpha.md',
      currentDiskContent: '# Saved',
    })).resolves.toMatchObject({
      content: '# Unsaved',
      diskMatchesBaseline: true,
    });
    await expect(service.read({
      notesPath: '/notes',
      notePath: 'alpha.md',
      currentDiskContent: '# Changed elsewhere',
    })).resolves.toMatchObject({
      diskMatchesBaseline: false,
    });

    if (process.platform !== 'win32') {
      const recoveryDir = path.join(userDataPath, '.vlaina', 'app', 'note-recovery');
      const [fileName] = fs.readdirSync(recoveryDir);
      expect(fs.statSync(recoveryDir).mode & 0o777).toBe(0o700);
      expect(fs.statSync(path.join(recoveryDir, fileName!)).mode & 0o777).toBe(0o600);
    }
  });

  it('never clears a newer snapshot after an older save finishes', async () => {
    const { service } = createService();
    const identity = { notesPath: '/notes', notePath: 'alpha.md' };

    await service.stage({
      ...identity,
      content: '# First edit',
      baselineContent: '# Saved',
    });
    void service.stage({
      ...identity,
      content: '# Newer edit',
      baselineContent: '# First edit',
    });

    await expect(service.clear({
      ...identity,
      expectedContent: '# First edit',
    })).resolves.toBe(false);
    await expect(service.read({
      ...identity,
      currentDiskContent: '# First edit',
    })).resolves.toMatchObject({ content: '# Newer edit', diskMatchesBaseline: true });
    await expect(service.clear({
      ...identity,
      expectedContent: '# Newer edit',
    })).resolves.toBe(true);
    await expect(service.read({
      ...identity,
      currentDiskContent: '# First edit',
    })).resolves.toBeNull();
  });

  it('lists only draft recoveries from the requested notes root', async () => {
    const { service } = createService();
    await Promise.all([
      service.stage({
        notesPath: '/notes-a',
        notePath: 'draft:a',
        content: 'Recovered A',
        baselineContent: '',
        draft: { parentPath: null, name: 'Draft A', kind: 'notesRoot' },
      }),
      service.stage({
        notesPath: '/notes-b',
        notePath: 'draft:b',
        content: 'Recovered B',
        baselineContent: '',
        draft: { parentPath: null, name: 'Draft B', kind: 'notesRoot' },
      }),
    ]);

    await expect(service.listDrafts('/notes-a')).resolves.toEqual([
      expect.objectContaining({
        notePath: 'draft:a',
        content: 'Recovered A',
        draft: { parentPath: null, name: 'Draft A', kind: 'notesRoot' },
      }),
    ]);
  });
});
