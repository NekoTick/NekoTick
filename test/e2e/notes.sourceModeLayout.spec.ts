import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  cleanupIsolatedElectron,
  createNotesRootFilesFixture,
  createChatFixture,
  EDITOR_SELECTOR,
  FILE_TREE_FILE_SELECTOR,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
  openNotesRootInNotes,
} from './notesE2E';

const SOURCE_EDITOR_SELECTOR = '[data-note-source-editor="true"]';
const SOURCE_MODE_ROOT_SELECTOR = '[data-note-source-mode="true"]';

function sourceModeFixtureMarkdown() {
  return [
    '# Source Mode Layout',
    '',
    'A paragraph before the large body.',
    '',
    ...Array.from({ length: 220 }, (_, index) =>
      `Line ${String(index + 1).padStart(3, '0')}: source mode layout text with **markdown** and [links](https://example.com/${index}).`
    ),
    '',
  ].join('\n');
}

function sourceModeInteractionMarkdown(label: string) {
  return [
    `# ${label} Source Audit`,
    '',
    `${label} initial paragraph for source editing.`,
    '',
    '- first item',
    '- second item',
    '',
    '| Column | Value |',
    '| --- | --- |',
    `| ${label} | initial |`,
    '',
    '```ts',
    `export const ${label.toLowerCase()}Sentinel = true;`,
    '```',
    '',
  ].join('\n');
}

function pastedSourceMarkdown() {
  return [
    '',
    '## Pasted Source Section',
    '',
    'Pasted paragraph with **bold**, `code`, and [link](https://example.com/source-mode).',
    '',
    '1. pasted ordered item',
    '2. second ordered item',
    '',
    '> pasted quote sentinel',
    '',
  ].join('\n');
}

function completeRawSourceMarkdown() {
  return [
    '---',
    'title: Raw Source Fidelity',
    'tags:',
    '  - source-mode',
    'draft: false',
    '---',
    '',
    '# Raw Source Fidelity',
    '',
    '<!-- hidden-source-comment: must stay visible in source mode -->',
    '',
    'Visible paragraph with **bold**, _italic_, ==mark==, and <span data-raw="yes">inline html</span>.',
    '',
    '<div class="raw-html-block">',
    '  <p>HTML block content that rendered mode may not expose as source text.</p>',
    '</div>',
    '',
    '```tsx',
    'const markdown = `# not a real heading inside code`;',
    'console.log(markdown);',
    '```',
    '',
    '$$',
    'E = mc^2',
    '$$',
    '',
    '| Column | Value |',
    '| --- | --- |',
    '| escaped pipe | a \\| b |',
    '',
    '',
    'Trailing blank line sentinel follows.',
    '',
  ].join('\n');
}

async function collectSourceModeLayoutMetrics(page: Page) {
  return page.evaluate(() => {
    const rectOf = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return {
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
      };
    };

    return {
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      notesView: rectOf('[data-notes-view-mode="true"]'),
      chatPanel: rectOf('[data-notes-chat-panel="true"]'),
      contentRoot: rectOf('[data-note-content-root="true"]'),
      renderedEditor: rectOf('.milkdown .ProseMirror'),
      sourceRoot: rectOf('[data-note-source-mode="true"]'),
      sourceTextarea: rectOf('[data-note-source-editor="true"]'),
      scrollRoot: rectOf('[data-note-scroll-root="true"]'),
    };
  });
}

async function getSourceEditorValue(page: Page): Promise<string> {
  return page.locator(SOURCE_EDITOR_SELECTOR).evaluate((element) =>
    (element as HTMLTextAreaElement).value
  );
}

async function setSourceEditorValue(page: Page, value: string): Promise<void> {
  await page.locator(SOURCE_EDITOR_SELECTOR).focus();
  await page.evaluate((nextValue) => {
    const textarea = document.querySelector<HTMLTextAreaElement>('[data-note-source-editor="true"]');
    if (!textarea) {
      throw new Error('Source editor textarea was not mounted');
    }
    textarea.setSelectionRange(0, textarea.value.length);
    textarea.setRangeText(nextValue, 0, textarea.value.length, 'end');
    textarea.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: nextValue,
      inputType: 'insertText',
    }));
  }, value);
}

async function getCurrentNoteContent(page: Page): Promise<string> {
  return page.evaluate(() =>
    String((window as any).__vlainaE2E.getNotesState().currentNote?.content ?? '')
  );
}

async function getCurrentNotePath(page: Page): Promise<string> {
  return page.evaluate(() =>
    String((window as any).__vlainaE2E.getNotesState().currentNote?.path ?? '')
  );
}

async function getRenderedTerminalBlankLineCount(page: Page, tailText: string): Promise<number> {
  return page.locator(EDITOR_SELECTOR).evaluate((editor, expectedTailText) => {
    const isBlankLineElement = (element: Element) => {
      if (element.matches('[data-type="html-block"][data-value="<!--vlaina-markdown-blank-line-->"]')) {
        return true;
      }
      if (element.matches('p.editor-editable-markdown-blank-line, p.editor-empty-paragraph, p:empty')) {
        return true;
      }
      return element.tagName === 'P' && (element.textContent ?? '').trim() === '';
    };
    const children = Array.from(editor.children);
    const tailIndex = children.findIndex((element) =>
      (element.textContent ?? '').includes(expectedTailText)
    );
    if (tailIndex < 0) {
      return -1;
    }
    return children.slice(tailIndex + 1).filter(isBlankLineElement).length;
  }, tailText);
}

async function clickFileTreeNote(page: Page, row: Locator, expectedPathTail: string): Promise<void> {
  await row.scrollIntoViewIfNeeded();
  await expect(row).toBeVisible({ timeout: 10_000 });
  const rowPath = await row.evaluate((element) =>
    element.getAttribute('data-file-tree-path') ?? ''
  );
  expect(rowPath).toContain(expectedPathTail);

  await row.locator('div').first().click();
  await expect.poll(() => getCurrentNotePath(page), { timeout: 10_000 })
    .toContain(expectedPathTail);
}

async function toggleSourceModeFromMoreMenu(page: Page, targetMode: 'source' | 'rendered'): Promise<number> {
  const label = targetMode === 'source' ? 'Source mode' : 'Rendered mode';
  const moreActionsButton = page.getByRole('button', { name: 'More' });
  const startedAt = Date.now();
  await moreActionsButton.click();
  await expect(page.getByText(label, { exact: true })).toBeVisible({ timeout: 10_000 });
  const openMs = Date.now() - startedAt;
  await page.getByText(label, { exact: true }).click();
  await expect(moreActionsButton).not.toBeFocused({ timeout: 10_000 });
  return openMs;
}

async function toggleSourceModeWithShortcut(page: Page, targetMode: 'source' | 'rendered'): Promise<void> {
  await page.keyboard.press('Control+/');
  await expect(page.getByRole('dialog', { name: 'Shortcuts' })).toHaveCount(0);
  if (targetMode === 'source') {
    await expect(page.locator(SOURCE_EDITOR_SELECTOR)).toBeVisible({ timeout: 10_000 });
    return;
  }
  await expect(page.locator(SOURCE_EDITOR_SELECTOR)).toHaveCount(0);
}

async function appendClipboardTextInSource(page: Page, text: string): Promise<void> {
  await page.locator(SOURCE_EDITOR_SELECTOR).focus();
  await page.evaluate(() => {
    const textarea = document.querySelector<HTMLTextAreaElement>('[data-note-source-editor="true"]');
    if (!textarea) {
      throw new Error('Source editor textarea was not mounted');
    }
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  });
  await page.evaluate((clipboardText) =>
    (window as any).__vlainaE2E.writeClipboardText(clipboardText), text
  );
  await page.keyboard.press('Control+V');
}

async function replaceSourceText(page: Page, target: string, replacement: string): Promise<void> {
  await page.locator(SOURCE_EDITOR_SELECTOR).focus();
  await page.evaluate(({ targetText }) => {
    const textarea = document.querySelector<HTMLTextAreaElement>('[data-note-source-editor="true"]');
    if (!textarea) {
      throw new Error('Source editor textarea was not mounted');
    }
    const start = textarea.value.indexOf(targetText);
    if (start < 0) {
      throw new Error(`Source text target was not found: ${targetText}`);
    }
    textarea.setSelectionRange(start, start + targetText.length);
  }, { targetText: target });
  await page.keyboard.type(replacement);
}

async function dispatchCompositionSequence(page: Page, text: string) {
  return page.evaluate(async (compositionText) => {
    const textarea = document.querySelector<HTMLTextAreaElement>('[data-note-source-editor="true"]');
    if (!textarea) {
      throw new Error('Source editor textarea was not mounted');
    }

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    textarea.dispatchEvent(new CompositionEvent('compositionstart', {
      bubbles: true,
      data: '',
    }));
    textarea.setRangeText(`\n${compositionText}`, textarea.selectionStart, textarea.selectionEnd, 'end');
    textarea.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      data: compositionText,
      inputType: 'insertCompositionText',
      isComposing: true,
    }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const duringCompositionContent = String((window as any).__vlainaE2E.getNotesState().currentNote?.content ?? '');
    textarea.dispatchEvent(new CompositionEvent('compositionend', {
      bubbles: true,
      data: compositionText,
    }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const afterCompositionContent = String((window as any).__vlainaE2E.getNotesState().currentNote?.content ?? '');

    return {
      duringCompositionHasText: duringCompositionContent.includes(compositionText),
      afterCompositionHasText: afterCompositionContent.includes(compositionText),
      textareaHasText: textarea.value.includes(compositionText),
    };
  }, text);
}

async function measureSourceInputMs(page: Page) {
  return page.evaluate(async () => {
    const textarea = document.querySelector<HTMLTextAreaElement>('[data-note-source-editor="true"]');
    if (!textarea) {
      throw new Error('Source editor textarea was not mounted');
    }

    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    const startedAt = performance.now();
    for (let index = 0; index < 40; index += 1) {
      textarea.setRangeText(`\nsource-mode-input-${index}`, textarea.selectionStart, textarea.selectionEnd, 'end');
      textarea.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        data: `source-mode-input-${index}`,
        inputType: 'insertText',
      }));
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return Math.round(performance.now() - startedAt);
  });
}

async function measureSourceToRenderedSwitchMs(page: Page, expectedRenderedText: string): Promise<number> {
  const startedAt = Date.now();
  await toggleSourceModeWithShortcut(page, 'rendered');
  await expect(page.locator(EDITOR_SELECTOR)).toContainText(expectedRenderedText, { timeout: 30_000 });
  return Date.now() - startedAt;
}

test.describe('notes source mode layout', () => {
  test.setTimeout(120_000);

  test('keeps source geometry stable when returning from other views', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-source-return-geometry');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await page.evaluate(() => (window as any).__vlainaE2E.setUIPreferences({
        languagePreference: 'en',
      }));
      await openMarkdownFixture(page, {
        filename: 'source-return-geometry.md',
        content: sourceModeFixtureMarkdown(),
      });
      await toggleSourceModeWithShortcut(page, 'source');

      const sourceEditor = page.locator(SOURCE_EDITOR_SELECTOR);
      await expect(sourceEditor).toBeFocused();
      const baseline = await sourceEditor.evaluate((element) => {
        const textarea = element as HTMLTextAreaElement;
        const scrollRoot = textarea.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
        const title = document.querySelector<HTMLElement>('[data-note-title-input="true"]');
        const rect = textarea.getBoundingClientRect();
        return {
          height: rect.height,
          inlineHeight: textarea.style.height,
          scrollTop: scrollRoot?.scrollTop ?? null,
          titleHeight: title?.getBoundingClientRect().height ?? null,
          top: rect.top,
        };
      });
      expect(baseline.height).toBeGreaterThan(1000);

      for (const awayView of ['chat', 'graph', 'whiteboard'] as const) {
        await page.evaluate((mode) => (window as any).__vlainaE2E.setAppViewMode(mode), awayView);
        const awayViewSelector = awayView === 'chat'
          ? '[data-chat-view-mode="full"]'
          : awayView === 'graph'
            ? '[data-graph-view-mode="true"]'
            : '[data-whiteboard-active="true"]';
        await expect(page.locator(awayViewSelector)).toBeVisible({ timeout: 30_000 });

        const hiddenInlineHeight = await page.evaluate(async () => {
          const textarea = document.querySelector<HTMLTextAreaElement>('[data-note-source-editor="true"]');
          if (!textarea || textarea.value.length < 2) throw new Error('Source textarea is unavailable');
          const replaceAt = textarea.value.length - 2;
          const replacement = textarea.value[replaceAt] === 'x' ? 'y' : 'x';
          textarea.setRangeText(replacement, replaceAt, replaceAt + 1, 'preserve');
          textarea.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            data: replacement,
            inputType: 'insertText',
          }));
          await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          return textarea.style.height;
        });
        expect(hiddenInlineHeight, awayView).toBe(baseline.inlineHeight);

        const frames = await page.evaluate(async () => new Promise<Array<{
          height: number | null;
          scrollTop: number | null;
          titleHeight: number | null;
          top: number | null;
        }>>((resolve) => {
          const samples: Array<{
            height: number | null;
            scrollTop: number | null;
            titleHeight: number | null;
            top: number | null;
          }> = [];
          (window as any).__vlainaE2E.setAppViewMode('notes');
          const sample = () => {
            const textarea = document.querySelector<HTMLTextAreaElement>('[data-note-source-editor="true"]');
            const scrollRoot = textarea?.closest('[data-note-scroll-root="true"]') as HTMLElement | null;
            const title = document.querySelector<HTMLElement>('[data-note-title-input="true"]');
            const rect = textarea?.getBoundingClientRect();
            samples.push({
              height: rect?.height ?? null,
              scrollTop: scrollRoot?.scrollTop ?? null,
              titleHeight: title?.getBoundingClientRect().height ?? null,
              top: rect?.top ?? null,
            });
            if (samples.length === 6) {
              resolve(samples);
              return;
            }
            requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        }));

        expect(frames.every((frame) => frame.height === baseline.height), awayView).toBe(true);
        expect(frames.every((frame) => frame.scrollTop === baseline.scrollTop), awayView).toBe(true);
        expect(frames.every((frame) => frame.titleHeight === baseline.titleHeight), awayView).toBe(true);
        expect(frames.every((frame) => frame.top === baseline.top), awayView).toBe(true);
        await expect(sourceEditor, awayView).toBeFocused();
        const selectionStart = await sourceEditor.evaluate((element) => (
          element as HTMLTextAreaElement
        ).selectionStart);
        expect(selectionStart, awayView).toBe('# Source Mode Layout'.length);
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('matches rendered editor width with the right chat panel open and keeps source input responsive', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-source-mode-layout');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1360, height: 860 });
      await page.evaluate(() => (window as any).__vlainaE2E.setUIPreferences({
        languagePreference: 'en',
      }));
      await createChatFixture(page, {
        sessions: [
          {
            title: 'Source Mode Layout Chat',
            messages: [
              { role: 'user', content: 'Keep the right panel open.' },
              { role: 'assistant', content: 'Right panel layout sentinel.' },
            ],
          },
        ],
      });
      await openMarkdownFixture(page, {
        filename: 'source-mode-layout.md',
        content: sourceModeFixtureMarkdown(),
      });
      await page.evaluate(() => (window as any).__vlainaE2E.setUIPreferences({
        notesChatPanelCollapsed: false,
      }));
      await expect(page.locator('[data-notes-chat-panel="true"]')).toBeVisible({ timeout: 30_000 });

      const rendered = await collectSourceModeLayoutMetrics(page);
      expect(rendered.renderedEditor).not.toBeNull();
      expect(rendered.chatPanel).not.toBeNull();
      expect(rendered.documentScrollWidth).toBeLessThanOrEqual(rendered.viewportWidth + 2);
      expect(rendered.bodyScrollWidth).toBeLessThanOrEqual(rendered.viewportWidth + 2);

      const moreMenuOpenMs = await toggleSourceModeFromMoreMenu(page, 'source');
      expect(moreMenuOpenMs).toBeLessThan(1_500);
      await expect(page.locator(SOURCE_EDITOR_SELECTOR)).toBeVisible({ timeout: 10_000 });

      const source = await collectSourceModeLayoutMetrics(page);
      expect(source.sourceRoot).not.toBeNull();
      expect(source.sourceTextarea).not.toBeNull();
      expect(source.chatPanel).not.toBeNull();
      expect(source.documentScrollWidth).toBeLessThanOrEqual(source.viewportWidth + 2);
      expect(source.bodyScrollWidth).toBeLessThanOrEqual(source.viewportWidth + 2);

      expect(Math.abs(source.sourceRoot!.left - rendered.contentRoot!.left)).toBeLessThanOrEqual(2);
      expect(Math.abs(source.sourceRoot!.width - rendered.contentRoot!.width)).toBeLessThanOrEqual(2);
      expect(Math.abs(source.sourceTextarea!.left - rendered.renderedEditor!.left)).toBeLessThanOrEqual(2);
      expect(Math.abs(source.sourceTextarea!.width - rendered.renderedEditor!.width)).toBeLessThanOrEqual(2);
      expect(source.sourceRoot!.right).toBeLessThanOrEqual(source.chatPanel!.left + 2);
      expect(source.scrollRoot!.scrollHeight).toBeGreaterThan(source.scrollRoot!.clientHeight);
      expect(source.sourceTextarea!.scrollHeight).toBeLessThanOrEqual(source.sourceTextarea!.clientHeight + 4);

      const inputMs = await measureSourceInputMs(page);
      expect(inputMs).toBeLessThan(750);

      const sourceToRenderedMs = await measureSourceToRenderedSwitchMs(page, 'Line 220');
      expect(sourceToRenderedMs).toBeLessThan(5_000);
      const renderedAgain = await collectSourceModeLayoutMetrics(page);
      expect(renderedAgain.renderedEditor).not.toBeNull();
      expect(renderedAgain.documentScrollWidth).toBeLessThanOrEqual(renderedAgain.viewportWidth + 2);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('audits source mode edits, shortcuts, chat surfaces, note switching, and persistence', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-source-mode-interaction-audit');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1360, height: 860 });
      await page.evaluate(() => (window as any).__vlainaE2E.setUIPreferences({
        languagePreference: 'en',
        notesChatPanelCollapsed: true,
      }));
      await createChatFixture(page, {
        sessions: [
          {
            title: 'Source Mode Interaction Chat',
            messages: [
              { role: 'user', content: 'Audit source mode interactions.' },
              { role: 'assistant', content: 'Interaction audit sentinel.' },
            ],
          },
        ],
      });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'source-mode-interaction-audit',
        files: [
          { filename: 'alpha-source-audit.md', content: sourceModeInteractionMarkdown('Alpha') },
          { filename: 'beta-source-audit.md', content: sourceModeInteractionMarkdown('Beta') },
        ],
      });
      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Source Mode Interaction Audit',
        minFileCount: 2,
      });

      const alphaRow = page.locator(FILE_TREE_FILE_SELECTOR, { hasText: 'alpha-source-audit' }).first();
      const betaRow = page.locator(FILE_TREE_FILE_SELECTOR, { hasText: 'beta-source-audit' }).first();
      await clickFileTreeNote(page, alphaRow, 'alpha-source-audit.md');
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Alpha initial paragraph', { timeout: 30_000 });

      await toggleSourceModeWithShortcut(page, 'source');
      const sourceEditor = page.locator(SOURCE_EDITOR_SELECTOR);
      await expect(sourceEditor).toBeVisible({ timeout: 10_000 });
      await expect(sourceEditor).toBeFocused({ timeout: 10_000 });
      await expect.poll(() => getSourceEditorValue(page), { timeout: 10_000 })
        .toContain('# Alpha Source Audit');

      const sourceCaretAudit = await sourceEditor.evaluate((element) => {
        const textarea = element as HTMLTextAreaElement;
        const firstLineStart = textarea.value.indexOf('- first item');
        const secondLineStart = textarea.value.indexOf('- second item');
        if (firstLineStart < 0 || secondLineStart < 0) {
          throw new Error('Source caret audit lines were not found');
        }
        textarea.setSelectionRange(firstLineStart + 4, firstLineStart + 4);
        document.dispatchEvent(new Event('vlaina:native-caret-overlay-refresh'));
        const pageDownEvent = new KeyboardEvent('keydown', {
          key: 'PageDown',
          bubbles: true,
          cancelable: true,
        });
        textarea.dispatchEvent(pageDownEvent);
        return {
          caretColor: getComputedStyle(textarea).caretColor,
          firstLineStart,
          hasCustomCaret: Boolean(document.querySelector('.native-caret-overlay')),
          pageDownPrevented: pageDownEvent.defaultPrevented,
          secondLineStart,
        };
      });
      expect(sourceCaretAudit.caretColor).not.toBe('transparent');
      expect(sourceCaretAudit.hasCustomCaret).toBe(false);
      expect(sourceCaretAudit.pageDownPrevented).toBe(false);

      await page.keyboard.press('ArrowRight');
      await expect.poll(() => sourceEditor.evaluate((element) => (element as HTMLTextAreaElement).selectionStart))
        .toBe(sourceCaretAudit.firstLineStart + 5);
      await page.keyboard.press('ArrowLeft');
      await expect.poll(() => sourceEditor.evaluate((element) => (element as HTMLTextAreaElement).selectionStart))
        .toBe(sourceCaretAudit.firstLineStart + 4);
      await page.keyboard.press('ArrowDown');
      await expect.poll(() => sourceEditor.evaluate((element) => (element as HTMLTextAreaElement).selectionStart))
        .toBe(sourceCaretAudit.secondLineStart + 4);
      await page.keyboard.press('ArrowUp');
      await expect.poll(() => sourceEditor.evaluate((element) => (element as HTMLTextAreaElement).selectionStart))
        .toBe(sourceCaretAudit.firstLineStart + 4);

      await sourceEditor.evaluate((element) => (element as HTMLTextAreaElement).blur());
      await sourceEditor.click({ position: { x: 80, y: 16 } });
      await expect(sourceEditor).toBeFocused();

      await sourceEditor.focus();
      await page.keyboard.press('Control+Shift+/');
      const shortcutsDialog = page.getByRole('dialog', { name: 'Shortcuts' });
      await expect(shortcutsDialog).toBeVisible({ timeout: 10_000 });
      await expect(shortcutsDialog).toContainText('Ctrl');
      await expect(shortcutsDialog).toContainText('Shift');
      await expect(shortcutsDialog).toContainText('/');
      await page.keyboard.press('Escape');
      await expect(shortcutsDialog).toHaveCount(0);

      await appendClipboardTextInSource(page, pastedSourceMarkdown());
      await expect.poll(() => getSourceEditorValue(page), { timeout: 10_000 })
        .toContain('Pasted Source Section');
      await replaceSourceText(
        page,
        'Alpha initial paragraph for source editing.',
        'Alpha edited from source with *literal markdown* markers.',
      );
      await expect.poll(() => getCurrentNoteContent(page), { timeout: 10_000 })
        .toContain('Alpha edited from source with *literal markdown* markers.');

      const compositionText = 'source-composition-committed-sentinel';
      const compositionResult = await dispatchCompositionSequence(page, compositionText);
      expect(compositionResult.textareaHasText).toBe(true);
      expect(compositionResult.duringCompositionHasText).toBe(false);
      expect(compositionResult.afterCompositionHasText).toBe(true);

      await toggleSourceModeWithShortcut(page, 'rendered');
      await expect(page.locator(SOURCE_EDITOR_SELECTOR)).toHaveCount(0);
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Alpha edited from source with literal markdown markers', {
        timeout: 30_000,
      });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Pasted Source Section');
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(compositionText);

      await toggleSourceModeFromMoreMenu(page, 'source');
      await expect(sourceEditor).toBeVisible({ timeout: 10_000 });
      await expect(sourceEditor).toBeFocused({ timeout: 10_000 });
      await expect.poll(() => getSourceEditorValue(page), { timeout: 10_000 })
        .toContain(compositionText);

      await sourceEditor.focus();
      await page.keyboard.press('Control+F');
      const findInput = page.getByPlaceholder('Find');
      await expect(findInput).toBeVisible({ timeout: 10_000 });
      await expect(findInput).toBeFocused({ timeout: 10_000 });
      let sourceLayout = await collectSourceModeLayoutMetrics(page);
      expect(sourceLayout.documentScrollWidth).toBeLessThanOrEqual(sourceLayout.viewportWidth + 2);
      await page.keyboard.press('Escape');
      await expect(findInput).toHaveCount(0);
      await sourceEditor.focus();
      await expect(sourceEditor).toBeFocused();

      await page.keyboard.press('Control+L');
      await expect(page.locator('[data-notes-chat-floating="true"]')).toBeVisible({ timeout: 10_000 });
      await sourceEditor.focus();
      await expect(sourceEditor).toBeFocused();

      await page.evaluate(() => (window as any).__vlainaE2E.setUIPreferences({
        notesChatPanelCollapsed: false,
      }));
      await expect(page.locator('[data-notes-chat-panel="true"]')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('[data-notes-chat-floating="true"]')).toHaveCount(0);
      sourceLayout = await collectSourceModeLayoutMetrics(page);
      expect(sourceLayout.sourceRoot).not.toBeNull();
      expect(sourceLayout.chatPanel).not.toBeNull();
      expect(sourceLayout.documentScrollWidth).toBeLessThanOrEqual(sourceLayout.viewportWidth + 2);
      expect(sourceLayout.sourceRoot!.right).toBeLessThanOrEqual(sourceLayout.chatPanel!.left + 2);

      await sourceEditor.focus();
      await page.keyboard.press('Control+S');
      await expect.poll(async () =>
        page.evaluate((pathToRead) => (window as any).__vlainaE2E.readTextFile(pathToRead), fixture.notePaths[0]!)
      , { timeout: 10_000 }).toContain(compositionText);

      await clickFileTreeNote(page, betaRow, 'beta-source-audit.md');
      await expect(sourceEditor).toBeVisible({ timeout: 10_000 });
      await expect.poll(() => getCurrentNoteContent(page), { timeout: 10_000 })
        .toContain('Beta initial paragraph for source editing.');
      await expect.poll(() => getSourceEditorValue(page), { timeout: 10_000 })
        .toContain('# Beta Source Audit');
      await replaceSourceText(
        page,
        'Beta initial paragraph for source editing.',
        'Beta edited while source mode stayed active.',
      );
      await page.keyboard.press('Control+S');
      await expect.poll(async () =>
        page.evaluate((pathToRead) => (window as any).__vlainaE2E.readTextFile(pathToRead), fixture.notePaths[1]!)
      , { timeout: 10_000 }).toContain('Beta edited while source mode stayed active.');

      await clickFileTreeNote(page, alphaRow, 'alpha-source-audit.md');
      await expect(sourceEditor).toBeVisible({ timeout: 10_000 });
      await expect.poll(() => getSourceEditorValue(page), { timeout: 10_000 })
        .toContain('Alpha edited from source with *literal markdown* markers.');
      await expect.poll(() => getSourceEditorValue(page), { timeout: 10_000 })
        .not.toContain('Beta edited while source mode stayed active.');

      const [alphaDisk, betaDisk] = await Promise.all([
        page.evaluate((pathToRead) => (window as any).__vlainaE2E.readTextFile(pathToRead), fixture.notePaths[0]!),
        page.evaluate((pathToRead) => (window as any).__vlainaE2E.readTextFile(pathToRead), fixture.notePaths[1]!),
      ]);
      expect(alphaDisk).toContain('Alpha edited from source with *literal markdown* markers.');
      expect(alphaDisk).toContain('Pasted Source Section');
      expect(alphaDisk).toContain(compositionText);
      expect(alphaDisk).not.toContain('Beta edited while source mode stayed active.');
      expect(betaDisk).toContain('Beta edited while source mode stayed active.');
      expect(betaDisk).not.toContain('Alpha edited from source');

      await toggleSourceModeFromMoreMenu(page, 'rendered');
      await expect(page.locator(SOURCE_MODE_ROOT_SELECTOR)).toHaveCount(0);
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Alpha edited from source with literal markdown markers', {
        timeout: 30_000,
      });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps source-mode terminal blank lines through rendered switch, save, and note switch', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-source-terminal-blank-lines-audit');
    const terminalBlankLineCount = 18;
    const alphaTail = 'Source terminal blank tail sentinel';
    const alphaInitial = ['# Source Terminal Blank Lines', '', alphaTail].join('\n');
    const expectedAlphaContent = `${alphaInitial}${'\n'.repeat(terminalBlankLineCount)}`;

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1360, height: 860 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'source-terminal-blank-lines-audit',
        files: [
          { filename: 'alpha-source-terminal-blank-lines.md', content: alphaInitial },
          { filename: 'beta-source-terminal-blank-lines.md', content: 'Beta source switch sentinel' },
        ],
      });
      await openNotesRootInNotes(page, {
        notesRootPath: fixture.notesRootPath,
        name: 'Source Terminal Blank Lines Audit',
        minFileCount: 2,
      });

      const alphaRow = page.locator(FILE_TREE_FILE_SELECTOR, { hasText: 'alpha-source-terminal-blank-lines' }).first();
      const betaRow = page.locator(FILE_TREE_FILE_SELECTOR, { hasText: 'beta-source-terminal-blank-lines' }).first();
      await clickFileTreeNote(page, alphaRow, 'alpha-source-terminal-blank-lines.md');
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(alphaTail, { timeout: 30_000 });

      await toggleSourceModeWithShortcut(page, 'source');
      const sourceEditor = page.locator(SOURCE_EDITOR_SELECTOR);
      await expect(sourceEditor).toBeVisible({ timeout: 10_000 });
      await expect.poll(() => getSourceEditorValue(page), { timeout: 10_000 })
        .toBe(alphaInitial);

      await sourceEditor.focus();
      await sourceEditor.evaluate((element) => {
        const textarea = element as HTMLTextAreaElement;
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      });
      for (let index = 0; index < terminalBlankLineCount; index += 1) {
        await page.keyboard.press('Enter');
      }

      await expect.poll(() => getSourceEditorValue(page), { timeout: 10_000 })
        .toBe(expectedAlphaContent);
      await expect.poll(() => getCurrentNoteContent(page), { timeout: 10_000 })
        .toBe(expectedAlphaContent);

      await page.keyboard.press('Control+S');
      await expect.poll(async () =>
        page.evaluate((pathToRead) => (window as any).__vlainaE2E.readTextFile(pathToRead), fixture.notePaths[0]!)
      , { timeout: 10_000 }).toBe(expectedAlphaContent);

      await toggleSourceModeWithShortcut(page, 'rendered');
      await expect(page.locator(SOURCE_EDITOR_SELECTOR)).toHaveCount(0);
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(alphaTail, { timeout: 30_000 });
      await expect.poll(() => getRenderedTerminalBlankLineCount(page, alphaTail), { timeout: 10_000 })
        .toBe(terminalBlankLineCount);

      const heading = page.locator(`${EDITOR_SELECTOR} h1`, { hasText: 'Source Terminal Blank Lines' }).first();
      await heading.click();
      await expect.poll(() => getRenderedTerminalBlankLineCount(page, alphaTail), { timeout: 10_000 })
        .toBe(terminalBlankLineCount);

      await clickFileTreeNote(page, betaRow, 'beta-source-terminal-blank-lines.md');
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Beta source switch sentinel', { timeout: 30_000 });
      await clickFileTreeNote(page, alphaRow, 'alpha-source-terminal-blank-lines.md');
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(alphaTail, { timeout: 30_000 });
      await expect.poll(() => getCurrentNoteContent(page), { timeout: 10_000 })
        .toBe(expectedAlphaContent);
      await expect.poll(() => getRenderedTerminalBlankLineCount(page, alphaTail), { timeout: 10_000 })
        .toBe(terminalBlankLineCount);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('shows the complete raw markdown source without omitting hidden rendered syntax', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-source-mode-raw-fidelity');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1360, height: 860 });
      await page.evaluate(() => (window as any).__vlainaE2E.setUIPreferences({
        languagePreference: 'en',
        notesChatPanelCollapsed: true,
      }));

      const expectedMarkdown = completeRawSourceMarkdown();
      const opened = await openMarkdownFixture(page, {
        filename: 'source-mode-raw-fidelity.md',
        content: expectedMarkdown,
      });
      const diskMarkdown = await page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), opened.notePath
      );
      expect(diskMarkdown).toBe(expectedMarkdown);

      await toggleSourceModeWithShortcut(page, 'source');
      await expect(page.locator(SOURCE_EDITOR_SELECTOR)).toBeVisible({ timeout: 10_000 });
      await expect.poll(() => getSourceEditorValue(page), { timeout: 10_000 })
        .toBe(expectedMarkdown);

      const sourceValue = await getSourceEditorValue(page);
      expect(sourceValue).toContain('<!-- hidden-source-comment: must stay visible in source mode -->');
      expect(sourceValue).toContain('<div class="raw-html-block">');
      expect(sourceValue).toContain('const markdown = `# not a real heading inside code`;');
      expect(sourceValue.endsWith('\n')).toBe(true);

      const editedMarkdown = expectedMarkdown.replace(
        'Trailing blank line sentinel follows.\n',
        [
          'Trailing blank line sentinel follows.',
          '',
          '',
          'Source mode saved blank one.',
          '',
          '',
          'Source mode saved blank two.',
          '',
        ].join('\n'),
      );
      await setSourceEditorValue(page, editedMarkdown);
      await expect.poll(() => getCurrentNoteContent(page), { timeout: 10_000 })
        .toBe(editedMarkdown);

      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      const savedMarkdown = await page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), opened.notePath
      );
      expect(savedMarkdown).toBe(editedMarkdown);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
