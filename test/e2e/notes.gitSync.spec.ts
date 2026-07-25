import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
} from './notesE2E';

const execFileAsync = promisify(execFile);

async function runGit(
  args: string[],
  isolationEnv: Record<string, string>,
  envOverrides: Record<string, string> = {},
): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      ...isolationEnv,
      ...envOverrides,
    },
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  });

  return String(stdout);
}

test.describe('notes Git sync', () => {
  test('shows all diffs, commits selected files with a timestamp message, and opens history', async () => {
    const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'vlaina-git-sync-e2e-'));
    const repoPath = path.join(fixtureRoot, 'project');
    const gitHomePath = path.join(fixtureRoot, 'git-home');
    const gitConfigPath = path.join(fixtureRoot, 'gitconfig');
    const hooksPath = path.join(fixtureRoot, 'empty-hooks');
    const noteRelativePath = 'docs/guides/setup.md';
    const notePath = path.join(repoPath, ...noteRelativePath.split('/'));
    const remainingRelativePath = 'docs/guides/remaining.md';
    const remainingPath = path.join(repoPath, ...remainingRelativePath.split('/'));
    const imageRelativePath = 'assets/cover.png';
    const imagePath = path.join(repoPath, ...imageRelativePath.split('/'));
    const identityId = randomUUID();
    const isolationEnv = {
      GIT_CONFIG_GLOBAL: gitConfigPath,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_PAGER: 'cat',
      GIT_TERMINAL_PROMPT: '0',
      HOME: gitHomePath,
      PAGER: 'cat',
      TZ: 'UTC',
      XDG_CONFIG_HOME: path.join(gitHomePath, '.config'),
    };
    let launched: Awaited<ReturnType<typeof launchIsolatedElectron>> | null = null;

    try {
      await fs.mkdir(gitHomePath, { recursive: true });
      await fs.mkdir(hooksPath, { recursive: true });
      await fs.writeFile(gitConfigPath, '', 'utf8');
      await runGit(['init', '--initial-branch=main', repoPath], isolationEnv);
      await runGit(
        ['-C', repoPath, 'config', 'user.name', `Vlaina E2E ${identityId}`],
        isolationEnv,
      );
      await runGit(
        ['-C', repoPath, 'config', 'user.email', `vlaina-e2e-${identityId}@example.invalid`],
        isolationEnv,
      );
      await runGit(['-C', repoPath, 'config', 'commit.gpgSign', 'false'], isolationEnv);
      await runGit(['-C', repoPath, 'config', 'core.hooksPath', hooksPath], isolationEnv);

      await fs.mkdir(path.dirname(notePath), { recursive: true });
      await fs.writeFile(
        notePath,
        '# Git Sync E2E\n\nInitial tracked line.\n\nStable context line.\n',
        'utf8',
      );
      await fs.writeFile(remainingPath, '# Remaining\n\nInitial content.\n', 'utf8');
      await runGit(
        ['-C', repoPath, 'add', '--', noteRelativePath, remainingRelativePath],
        isolationEnv,
      );
      await runGit(
        ['-C', repoPath, 'commit', '-m', 'Initial Git sync fixture'],
        isolationEnv,
        {
          GIT_AUTHOR_DATE: '2024-01-02T03:04:05Z',
          GIT_COMMITTER_DATE: '2024-01-02T03:04:05Z',
        },
      );
      await fs.writeFile(
        notePath,
        '# Git Sync E2E\n\nModified tracked line.\n\nStable context line.\n',
        'utf8',
      );
      await fs.writeFile(remainingPath, '# Remaining\n\nStill uncommitted.\n', 'utf8');
      await fs.mkdir(path.dirname(imagePath), { recursive: true });
      await fs.writeFile(imagePath, Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      ]));

      launched = await launchIsolatedElectron('notes-git-sync', {
        args: [notePath],
        envOverrides: isolationEnv,
      });
      await launched.app.firstWindow();
      const [page] = await getOpenBridgePages(launched.app, 1);
      await page.setViewportSize({ width: 1440, height: 900 });

      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Modified tracked line.', {
        timeout: 30_000,
      });
      await expect.poll(async () => page.evaluate(() => {
        const notesRootState = (window as any).__vlainaE2E.getNotesRootState();
        const notesState = (window as any).__vlainaE2E.getNotesState();
        return {
          currentNotesRootPath: notesRootState.currentNotesRoot?.path ?? null,
          currentNotePath: notesState.currentNote?.path ?? null,
        };
      }), { timeout: 30_000 }).toEqual({
        currentNotesRootPath: repoPath,
        currentNotePath: noteRelativePath,
      });
      await page.evaluate(async () => {
        await (window as any).__vlainaE2E.setUIPreferences({ languagePreference: 'zh-CN' });
      });

      const syncButton = page.getByTestId('git-sync-button');
      await expect(syncButton).toBeVisible({ timeout: 30_000 });
      await expect(syncButton).toHaveAttribute('aria-label', 'Git 同步');
      await expect(syncButton).toHaveClass(/text-\[var\(--vlaina-sidebar-row-selected-text\)\]/);
      await syncButton.click();

      const popover = page.getByTestId('git-sync-popover');
      await expect(popover).toBeVisible();
      await expect(popover.getByText('提交说明')).toBeVisible();
      await expect(popover.getByText('main', { exact: true })).toBeVisible();
      await expect(popover.getByText('提交时间', { exact: true })).toHaveCount(0);
      await expect(popover.getByLabel('刷新 Git 状态')).toHaveCount(0);
      const changeRow = popover.getByTestId('git-change-row').filter({
        hasText: 'docs/guides/setup.md',
      });
      await expect(changeRow).toBeVisible({ timeout: 30_000 });

      const changeCheckboxes = popover.getByTestId('git-change-checkbox');
      await expect(changeCheckboxes).toHaveCount(3);
      await expect(popover.getByTestId('git-select-all')).toHaveAttribute('data-state', 'checked');
      const remainingCheckboxByPath = popover.locator(
        '[data-testid="git-change-checkbox"][data-path="docs/guides/remaining.md"]',
      );
      await remainingCheckboxByPath.click();
      await expect(remainingCheckboxByPath).toHaveAttribute('data-state', 'unchecked');
      const imageRow = popover.getByTestId('git-change-row').filter({ hasText: imageRelativePath });
      await expect(imageRow).toBeVisible();
      await expect(imageRow).not.toContainText('+0');
      await expect(imageRow).not.toContainText('-0');
      const imageCheckboxByPath = popover.locator(
        `[data-testid="git-change-checkbox"][data-path="${imageRelativePath}"]`,
      );
      await expect(imageCheckboxByPath).toHaveAttribute('data-state', 'checked');
      await expect(imageRow.getByTestId('git-open-file')).toHaveCount(0);
      await imageRow.getByTestId('git-change-file-label').click();
      await expect.poll(async () => page.evaluate(() => (
        (window as any).__vlainaE2E.getNotesState().error ?? null
      ))).toBeNull();
      await imageCheckboxByPath.click();
      await expect(imageCheckboxByPath).toHaveAttribute('data-state', 'unchecked');

      const workingDiff = popover.getByTestId('git-diff');
      await expect(workingDiff).toContainText('Initial tracked line.');
      await expect(workingDiff).toContainText('Modified tracked line.');
      await expect(workingDiff).toContainText('Initial content.');
      await expect(workingDiff).toContainText('Still uncommitted.');
      await expect(workingDiff).not.toContainText('diff --git ');
      await expect(workingDiff).not.toContainText('index ');
      await expect(workingDiff).not.toContainText(`--- a/${noteRelativePath}`);
      await expect(workingDiff).not.toContainText(`+++ b/${noteRelativePath}`);
      await expect(workingDiff).not.toContainText('@@ ');
      await expect(workingDiff.getByTestId('git-diff-file')).toHaveCount(3);
      await expect(workingDiff.getByTestId('git-diff-file').filter({ hasText: imageRelativePath }))
        .toContainText('Binary files');
      const commitMessageBox = await popover.getByTestId('git-commit-message').boundingBox();
      const changeRowBox = await changeRow.boundingBox();
      const diffBox = await workingDiff.boundingBox();
      expect(commitMessageBox).not.toBeNull();
      expect(changeRowBox).not.toBeNull();
      expect(diffBox).not.toBeNull();
      expect(commitMessageBox!.y).toBeLessThan(changeRowBox!.y);
      expect(commitMessageBox!.y).toBeLessThan(diffBox!.y);
      const diffScroll = popover.getByTestId('git-diff-scroll');
      await expect.poll(() => diffScroll.evaluate((element) => (
        element.scrollHeight > element.clientHeight
      ))).toBe(true);
      await diffScroll.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
      await expect.poll(() => diffScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

      const popoverScroll = popover.getByTestId('git-popover-scroll');
      await expect.poll(() => popoverScroll.evaluate((element) => (
        element.scrollHeight > element.clientHeight
      ))).toBe(true);
      await popoverScroll.hover();
      await page.mouse.wheel(0, 600);
      await expect.poll(() => popoverScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

      const resizeHandle = popover.getByTestId('git-popover-resize-handle');
      const initialPopoverHeight = await popover.evaluate((element) => element.getBoundingClientRect().height);
      const resizeHandleBox = await resizeHandle.boundingBox();
      expect(resizeHandleBox).not.toBeNull();
      await page.mouse.move(
        resizeHandleBox!.x + resizeHandleBox!.width / 2,
        resizeHandleBox!.y + resizeHandleBox!.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        resizeHandleBox!.x + resizeHandleBox!.width / 2,
        resizeHandleBox!.y + resizeHandleBox!.height / 2 + 100,
      );
      await page.mouse.up();
      await expect.poll(() => popover.evaluate((element) => element.getBoundingClientRect().height))
        .toBeGreaterThan(initialPopoverHeight + 50);
      await resizeHandle.dblclick();
      await expect.poll(() => popover.evaluate((element) => element.getBoundingClientRect().height))
        .toBeCloseTo(initialPopoverHeight, -1);

      await page.setViewportSize({ width: 800, height: 700 });
      await expect(popover.getByTestId('git-commit-message')).toBeVisible();
      await expect(popover.getByTestId('git-use-current-time')).toBeVisible();
      await expect(popover.getByTestId('git-commit-button')).toBeVisible();
      await expect.poll(async () => {
        const box = await popover.boundingBox();
        if (!box) return Number.POSITIVE_INFINITY;
        return Math.abs(box.x - (800 - box.x - box.width));
      }).toBeLessThanOrEqual(1);
      const popoverBox = await popover.boundingBox();
      expect(popoverBox).not.toBeNull();
      expect(popoverBox!.x).toBeGreaterThanOrEqual(0);
      expect(popoverBox!.x + popoverBox!.width).toBeLessThanOrEqual(800);
      await page.setViewportSize({ width: 1440, height: 900 });

      await popover.getByTestId('git-use-current-time').click();
      await expect(popover.getByTestId('git-commit-message')).toHaveValue(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
      );
      const commitSubject = await popover.getByTestId('git-commit-message').inputValue();
      await popover.getByTestId('git-commit-button').click();

      await expect.poll(async () => {
        return (await runGit(['-C', repoPath, 'log', '-1', '--format=%s'], isolationEnv)).trim();
      }, { timeout: 30_000 }).toBe(commitSubject);
      await expect.poll(async () => (
        await runGit(['-C', repoPath, 'show', '--format=', '--name-only', 'HEAD'], isolationEnv)
      ).trim(), { timeout: 30_000 }).toBe(noteRelativePath);
      await expect.poll(async () => (
        await runGit(['-C', repoPath, 'status', '--porcelain', '--untracked-files=all'], isolationEnv)
      ).trim(), { timeout: 30_000 }).toContain(`?? ${imageRelativePath}`);
      await expect(popover.getByTestId('git-change-row')).toHaveCount(2, { timeout: 30_000 });
      const remainingRow = popover.getByTestId('git-change-row').filter({ hasText: remainingRelativePath });
      await expect(remainingRow).toContainText('+1');
      await expect(remainingRow).toContainText('-1');
      await expect(popover.getByTestId('git-change-row').filter({ hasText: imageRelativePath }))
        .toBeVisible();

      await popover.getByTestId('git-history-tab').click();
      const historyRow = popover.getByTestId('git-history-row').filter({ hasText: commitSubject });
      await expect(historyRow).toBeVisible({ timeout: 30_000 });

      const historyDiff = popover.getByTestId('git-history-diff');
      await expect(historyDiff).toContainText('Initial tracked line.');
      await expect(historyDiff).toContainText('Modified tracked line.');

      const initialHistoryRow = popover.getByTestId('git-history-row').filter({
        hasText: 'Initial Git sync fixture',
      });
      await initialHistoryRow.click();
      const historyFiles = historyDiff.getByTestId('git-diff-file');
      await expect(historyFiles).toHaveCount(2);
      await expect(historyFiles.filter({ hasText: noteRelativePath })).toContainText('+5');
      await expect(historyFiles.filter({ hasText: noteRelativePath })).not.toContainText('-0');
      await expect(historyFiles.filter({ hasText: remainingRelativePath })).toContainText('+3');
      await expect(historyFiles.filter({ hasText: remainingRelativePath })).not.toContainText('-0');

      await popover.getByTestId('git-changes-tab').click();
      await remainingRow.getByTestId('git-open-file').click();
      await expect.poll(async () => page.evaluate(() => (
        (window as any).__vlainaE2E.getNotesState().currentNote?.path ?? null
      ))).toBe(remainingRelativePath);
    } finally {
      if (launched) {
        await cleanupIsolatedElectron(launched.app, launched.userDataRoot);
      }
      await fs.rm(fixtureRoot, { recursive: true, force: true }).catch(() => {});
    }
  });
});
