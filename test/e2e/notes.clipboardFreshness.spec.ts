import { expect, test, type ElectronApplication, type Page } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
} from './notesE2E';

const COPY_SHORTCUT = process.platform === 'darwin' ? 'Meta+C' : 'Control+C';
const CUT_SHORTCUT = process.platform === 'darwin' ? 'Meta+X' : 'Control+X';
const PASTE_SHORTCUT = process.platform === 'darwin' ? 'Meta+V' : 'Control+V';
const SELECT_ALL_SHORTCUT = process.platform === 'darwin' ? 'Meta+A' : 'Control+A';
const SOURCE_SHORTCUT = process.platform === 'darwin' ? 'Meta+/' : 'Control+/';
const SOURCE_EDITOR_SELECTOR = '[data-note-source-editor="true"]';
const IPC_CLIPBOARD_WRITE_CHANNEL = 'desktop:clipboard:write-text';
const TEXT_MARKERS = Array.from({ length: 24 }, (_, index) => (
  `Fresh clipboard round ${String(index + 1).padStart(2, '0')} 中文内容 ${index % 2 === 0 ? '甲' : '乙'}`
));
const BLOCK_MARKER = 'Fresh block clipboard 中文块选择';
const CODE_MARKER = 'const freshClipboardCode = "最新代码块内容";';
const TEXT_CUT_MARKER = 'Fresh text cut clipboard 中文剪切';
const BLOCK_CUT_MARKER = 'Fresh block cut clipboard 中文块剪切';
const CODE_CUT_MARKER = 'const freshClipboardCut = "最新代码剪切";';

async function delayRendererClipboardWrites(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ clipboard, ipcMain }, channel) => {
    const state = globalThis as typeof globalThis & { __clipboardFreshnessIpcCalls?: number };
    state.__clipboardFreshnessIpcCalls = 0;
    ipcMain.removeHandler(channel);
    ipcMain.handle(channel, async (_event, text) => {
      state.__clipboardFreshnessIpcCalls = (state.__clipboardFreshnessIpcCalls ?? 0) + 1;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      clipboard.writeText(typeof text === 'string' ? text : '');
    });
  }, IPC_CLIPBOARD_WRITE_CHANNEL);
}

async function setSystemClipboard(app: ElectronApplication, text: string): Promise<void> {
  await app.evaluate(({ clipboard }, value) => clipboard.writeText(value), text);
}

async function readSystemClipboard(app: ElectronApplication): Promise<string> {
  return app.evaluate(({ clipboard }) => clipboard.readText());
}

async function rendererClipboardWriteCount(app: ElectronApplication): Promise<number> {
  return app.evaluate(() => (
    (globalThis as typeof globalThis & { __clipboardFreshnessIpcCalls?: number })
      .__clipboardFreshnessIpcCalls ?? 0
  ));
}

async function selectRenderedText(page: Page, text: string): Promise<void> {
  const selection = await page.evaluate(
    (target) => (window as any).__vlainaE2E.selectEditorTextByText(target),
    text,
  );
  expect(selection.selectedText).toBe(text);
}

async function selectCodeBlockText(page: Page, index: number, expected: string): Promise<void> {
  const editor = page.locator(`${EDITOR_SELECTOR} .code-block-container .cm-editor`).nth(index);
  await editor.locator('.cm-line').first().click();
  await expect(editor).toHaveClass(/cm-focused/);
  await page.keyboard.press(SELECT_ALL_SHORTCUT);
  await expect.poll(() => page.evaluate((blockIndex) => (
    document.querySelectorAll<HTMLElement>('.code-block-container .cm-editor')[blockIndex]
      ?.dataset.e2eSelectionText ?? null
  ), index)).toBe(expected);
}

async function expectImmediateClipboardShortcut(
  app: ElectronApplication,
  page: Page,
  expected: string,
  oldClipboard: string,
  shortcut = COPY_SHORTCUT,
): Promise<void> {
  await setSystemClipboard(app, oldClipboard);
  await page.keyboard.press(shortcut);
  expect(await readSystemClipboard(app)).toBe(expected);
}

test('always copies and pastes the newest clipboard payload across Notes editor surfaces', async () => {
  test.setTimeout(120_000);
  const { app, userDataRoot } = await launchIsolatedElectron('notes-clipboard-freshness');

  try {
    await app.firstWindow();
    const [page] = await getOpenBridgePages(app, 1);
    await page.setViewportSize({ width: 1280, height: 860 });
    await openMarkdownFixture(page, {
      filename: 'clipboard-freshness.md',
      content: [
        ...TEXT_MARKERS.flatMap((marker) => [marker, '']),
        BLOCK_MARKER,
        '',
        TEXT_CUT_MARKER,
        '',
        BLOCK_CUT_MARKER,
        '',
        '```ts',
        CODE_MARKER,
        '```',
        '',
        '```ts',
        CODE_CUT_MARKER,
        '```',
        '',
        'Clipboard paste destination.',
      ].join('\n'),
    });
    const syncBridgeProbe = await page.evaluate(() => {
      const clipboard = (window as any).vlainaDesktop?.clipboard;
      return {
        available: typeof clipboard?.writeTextSync === 'function',
        result: clipboard?.writeTextSync?.('Synchronous clipboard bridge probe') ?? null,
      };
    });
    expect(syncBridgeProbe).toEqual({ available: true, result: true });
    expect(await readSystemClipboard(app)).toBe('Synchronous clipboard bridge probe');
    await delayRendererClipboardWrites(app);

    for (const [index, marker] of TEXT_MARKERS.entries()) {
      await selectRenderedText(page, marker);
      await expectImmediateClipboardShortcut(app, page, marker, `stale rendered clipboard ${index}`);
    }

    const selectedBlocks = await page.evaluate(
      (text) => (window as any).__vlainaE2E.selectNoteBlocksByText([text]),
      BLOCK_MARKER,
    );
    expect(selectedBlocks).toBe(1);
    await expectImmediateClipboardShortcut(app, page, BLOCK_MARKER, 'stale block clipboard');

    const codeContent = page.locator(`${EDITOR_SELECTOR} .code-block-container .cm-content`).first();
    await setSystemClipboard(app, 'stale code clipboard');
    await expect(codeContent).toBeVisible();
    await selectCodeBlockText(page, 0, CODE_MARKER);
    await page.keyboard.press(COPY_SHORTCUT);
    expect(await readSystemClipboard(app)).toBe(CODE_MARKER);

    await selectRenderedText(page, TEXT_CUT_MARKER);
    await expectImmediateClipboardShortcut(app, page, TEXT_CUT_MARKER, 'stale text cut clipboard', CUT_SHORTCUT);
    await expect(page.locator(EDITOR_SELECTOR)).not.toContainText(TEXT_CUT_MARKER);

    const selectedCutBlocks = await page.evaluate(
      (text) => (window as any).__vlainaE2E.selectNoteBlocksByText([text]),
      BLOCK_CUT_MARKER,
    );
    expect(selectedCutBlocks).toBe(1);
    await expectImmediateClipboardShortcut(app, page, BLOCK_CUT_MARKER, 'stale block cut clipboard', CUT_SHORTCUT);
    await expect(page.locator(EDITOR_SELECTOR)).not.toContainText(BLOCK_CUT_MARKER);

    const codeCutContent = page.locator(`${EDITOR_SELECTOR} .code-block-container .cm-content`).nth(1);
    await setSystemClipboard(app, 'stale code cut clipboard');
    await selectCodeBlockText(page, 1, CODE_CUT_MARKER);
    await page.keyboard.press(CUT_SHORTCUT);
    expect(await readSystemClipboard(app)).toBe(CODE_CUT_MARKER);
    await expect(codeCutContent).not.toContainText(CODE_CUT_MARKER);

    for (let index = 0; index < 12; index += 1) {
      const latestExternalText = `Rendered external clipboard ${index + 1} 中文最新 ${index % 2 === 0 ? '丙' : '丁'}`;
      await setSystemClipboard(app, latestExternalText);
      await page.evaluate(() => (window as any).__vlainaE2E.focusCurrentEditorAtEnd());
      await page.keyboard.press(PASTE_SHORTCUT);
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(latestExternalText);
    }
    await expect(codeCutContent).not.toContainText(CODE_CUT_MARKER);

    expect(await rendererClipboardWriteCount(app)).toBe(0);

    await page.keyboard.press(SOURCE_SHORTCUT);
    const sourceEditor = page.locator(SOURCE_EDITOR_SELECTOR);
    await expect(sourceEditor).toBeVisible();
    const sourceAfterCuts = await sourceEditor.inputValue();
    expect(sourceAfterCuts).not.toContain(TEXT_CUT_MARKER);
    expect(sourceAfterCuts).not.toContain(BLOCK_CUT_MARKER);
    expect(sourceAfterCuts).not.toContain(CODE_CUT_MARKER);
    await sourceEditor.focus();
    await page.evaluate(({ selector, text }) => {
      const textarea = document.querySelector<HTMLTextAreaElement>(selector);
      if (!textarea) throw new Error('Source editor was not mounted');
      const start = textarea.value.indexOf(text);
      if (start < 0) throw new Error('Source clipboard marker was not found');
      textarea.setSelectionRange(start, start + text.length);
    }, { selector: SOURCE_EDITOR_SELECTOR, text: TEXT_MARKERS[7] });
    await expectImmediateClipboardShortcut(app, page, TEXT_MARKERS[7], 'stale source clipboard');

    for (let index = 0; index < 12; index += 1) {
      const latestExternalText = `External clipboard round ${index + 1} 中文粘贴 ${index % 2 === 0 ? '新' : '鲜'}`;
      await setSystemClipboard(app, latestExternalText);
      await sourceEditor.focus();
      await page.evaluate((selector) => {
        const textarea = document.querySelector<HTMLTextAreaElement>(selector);
        if (!textarea) throw new Error('Source editor was not mounted');
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      }, SOURCE_EDITOR_SELECTOR);
      await page.keyboard.press(PASTE_SHORTCUT);
      await expect(sourceEditor).toHaveValue(new RegExp(`${latestExternalText}$`));
    }

    expect(await rendererClipboardWriteCount(app)).toBe(0);
  } finally {
    await cleanupIsolatedElectron(app, userDataRoot);
  }
});
