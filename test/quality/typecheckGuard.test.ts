import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function normalizePathForSnapshot(path: string) {
  return path.replace(/\\/g, '/');
}

function readText(path: string) {
  return readFileSync(path, 'utf8');
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      return listSourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(entry) ? [path] : [];
  });
}

function findStorageWriteSites(): string[] {
  const storageWritePattern = /\b(?:window\.)?localStorage\.(?:setItem|removeItem)\s*\(/g;

  return listSourceFiles('src')
    .filter((path) => !/\.test\.(?:ts|tsx)$/.test(path))
    .filter((path) => !/\.fixtures\.(?:ts|tsx)$/.test(path))
    .flatMap((path) => {
      const source = readText(path);
      return [...source.matchAll(storageWritePattern)].map((match) => {
        const expression = source.slice(match.index, source.indexOf('\n', match.index)).trim();
        return `${normalizePathForSnapshot(path)}:${expression}`;
      });
    })
    .sort();
}

function findHardcodedUiTextAttributeSites(): string[] {
  const hardcodedUiTextAttributePattern = /\b(?:aria-label|placeholder|title)="[A-Z][^"{}<>]+"/g;

  return listSourceFiles('src/components')
    .filter((path) => !/\.test\.(?:ts|tsx)$/.test(path))
    .flatMap((path) => {
      const source = readText(path);
      return [...source.matchAll(hardcodedUiTextAttributePattern)].map((match) => {
        const end = source.indexOf('\n', match.index);
        const expression = source.slice(match.index, end === -1 ? undefined : end).trim();
        return `${normalizePathForSnapshot(path)}:${expression}`;
      });
    })
    .sort();
}

describe('typecheck quality gate', () => {
  it('keeps TypeScript unused-symbol checks enabled', () => {
    const tsconfig = readText('tsconfig.json');

    expect(tsconfig).toMatch(/"noUnusedLocals"\s*:\s*true/);
    expect(tsconfig).toMatch(/"noUnusedParameters"\s*:\s*true/);
  });

  it('keeps the typecheck script wired to tsc no-emit', () => {
    const packageJson = JSON.parse(readText('package.json')) as {
      scripts?: Record<string, string>;
    };

    expect(packageJson.scripts?.typecheck).toContain('tsc --noEmit');
  });

  it('runs typecheck in the GitHub Actions test job', () => {
    const workflow = readText('.github/workflows/build.yml');

    expect(workflow).toMatch(/run:\s*pnpm typecheck/);
  });

  it('keeps Settings UI storage access behind store synchronization', () => {
    const offenders = listSourceFiles('src/components/Settings').filter((path) => {
      const source = readText(path);
      return /\b(?:localStorage|sessionStorage)\s*\./.test(source);
    });

    expect(offenders).toEqual([]);
  });

  it('keeps production hard-coded UI text attributes explicitly classified for i18n follow-up', () => {
    const expectedSites: string[] = [];

    expect(findHardcodedUiTextAttributeSites()).toEqual([...expectedSites].sort());
  });

  it('keeps production localStorage writes explicitly classified for cross-window sync', () => {
    const expectedSites = [
      // Cross-window sync transports.
      'src/lib/storage/storageAutoSync.ts:localStorage.setItem(STORAGE_KEY, JSON.stringify(event));',
      'src/stores/notes/document/externalPathBroadcast.ts:localStorage.setItem(STORAGE_KEY, JSON.stringify(event));',

      // Shared user/application state with explicit storage listeners or sync events.
      'src/stores/accountSession/authSupport.ts:localStorage.removeItem(ACCOUNT_USER_PERSIST_KEY);',
      'src/stores/accountSession/authSupport.ts:localStorage.removeItem(ACCOUNT_STATUS_REFRESH_KEY);',
      'src/stores/accountSession/authSupport.ts:localStorage.setItem(ACCOUNT_STATUS_REFRESH_KEY, String(Date.now()));',
      'src/stores/accountSession/authSupport.ts:localStorage.setItem(ACCOUNT_USER_PERSIST_KEY, JSON.stringify(normalized));',
      'src/stores/notes/storagePreferences.ts:localStorage.setItem(NOTE_ICON_SIZE_KEY, String(normalized));',
      'src/stores/uiPreferences.ts:localStorage.setItem(key, value);',
      'src/stores/uiPreferences.ts:localStorage.removeItem(key);',
      'src/stores/useManagedAIStore.ts:localStorage.setItem(BUDGET_SYNC_STORAGE_KEY, JSON.stringify({ budget, syncedAt }))',
      'src/stores/useManagedAIStore.ts:localStorage.removeItem(BUDGET_SYNC_STORAGE_KEY)',
      'src/stores/notesRootLocalStorage.ts:localStorage.setItem(key, JSON.stringify(value));',

      // Window-local/layout-local preferences.
      'src/components/layout/ResizablePanel.tsx:localStorage.setItem(storageKey, String(width));',
      'src/components/common/UniversalIconPicker/constants.ts:localStorage.setItem(RECENT_ICONS_KEY, JSON.stringify(validIcons));',
      'src/components/common/UniversalIconPicker/constants.ts:localStorage.setItem(SKIN_TONE_KEY, String(validTone));',
      'src/components/common/UniversalIconPicker/constants.ts:localStorage.setItem(ICON_COLOR_KEY, color);',
      'src/components/common/UniversalIconPicker/constants.ts:localStorage.setItem(ACTIVE_TAB_KEY, tab);',
      'src/components/Notes/features/Editor/plugins/floating-toolbar/components/ai-dropdown/usageRanking.ts:window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));',

      // Navigation/history caches that do not drive live cross-window state.
      'src/stores/notes/storagePreferences.ts:localStorage.setItem(RECENT_NOTES_KEY, JSON.stringify(normalizeRecentNotePaths(paths)));',

      // Future-facing shortcut customization storage. There is no editing UI yet; adding one should revisit sync.
      'src/lib/shortcuts/storage.ts:localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));',
      'src/lib/shortcuts/storage.ts:localStorage.removeItem(STORAGE_KEY);',

      // Web auth and inter-window mutation lock internals.
      'src/lib/account/webSession.ts:localStorage.removeItem(ACCOUNT_USER_PERSIST_KEY);',
      'src/lib/ai/sessionMutationLockStorage.ts:localStorage.setItem(getLockKey(sessionId), JSON.stringify(record));',
      'src/lib/ai/sessionMutationLockStorage.ts:localStorage.removeItem(getLockKey(sessionId));',

      // Desktop update cache/check throttle, with cache change events for update UI listeners.
      'src/lib/desktop/updateStatus.ts:window.localStorage.removeItem(UPDATE_INFO_CACHE_KEY);',
      'src/lib/desktop/updateStatus.ts:window.localStorage.setItem(UPDATE_INFO_CACHE_KEY, JSON.stringify(updateInfo));',
      'src/lib/desktop/updateStatus.ts:window.localStorage.setItem(UPDATE_LAST_AUTO_CHECK_KEY, String(value));',

      // E2E-only bridge activation persistence, guarded behind import.meta.env.DEV.
      "src/lib/e2e/syncE2EBridgeState.ts:window.localStorage.setItem(E2E_LOCAL_STORAGE_KEY, '1');",

    ];

    expect(findStorageWriteSites()).toEqual([...expectedSites].sort());
  });
});
