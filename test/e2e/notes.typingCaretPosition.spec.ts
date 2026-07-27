import { expect, test, type Page } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  NOTE_SCROLL_ROOT_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
  waitForEditorAnimationFrame,
} from './notesE2E';

const SETTINGS_MODAL_SELECTOR = '[data-settings-modal="true"]';
const TEXTBLOCK_CARET_OVERLAY_SELECTOR = '.editor-textblock-caret-overlay';

function createLongTypingMarkdown() {
  const lines = ['# Typing Caret Position', ''];
  for (let index = 0; index < 90; index += 1) {
    lines.push(
      `Typing caret paragraph ${index} sentinel text stays editable in the middle of a long note.`
    );
    lines.push('');
  }
  lines.push('Final typing caret sentinel should not receive middle input.');
  return lines.join('\n');
}

function createStructuredTypingMarkdown() {
  const lines = [
    '# Structured Typing Caret Position',
    '',
    '| Key | Value |',
    '| --- | --- |',
    '| alpha | beta |',
    '',
    '- list item before target',
    '- another list item before target',
    '',
    '```ts',
    'const beforeTarget = true;',
    '```',
    '',
  ];

  for (let index = 0; index < 64; index += 1) {
    lines.push(
      `Structured caret paragraph ${index} sentinel plain segment before [a link](https://example.com/${index}) and **bold text** for parser coverage.`
    );
    lines.push('');
    if (index % 11 === 0) {
      lines.push('<!--vlaina-markdown-blank-line-->');
      lines.push('');
    }
  }

  lines.push('Final structured typing caret sentinel should not receive middle input.');
  return lines.join('\n');
}

type TypingDiagnostics = {
  markerParagraphs: Array<{
    marker: string;
    index: number;
    text: string | null;
  }>;
  paragraphTexts: string[];
  lastParagraphText: string | null;
  paragraphCount: number;
  scrollTop: number;
  maxScrollTop: number;
  selection: {
    from: number;
    to: number;
    empty: boolean;
    selectedText: string;
    docTextLength: number;
  } | null;
  isDirty: boolean;
  currentContentIncludesMarkers: boolean[];
};

type TypewriterScrollCaretSnapshot = {
  scrollTop: number;
  requestedScrollTop: number;
  selectionEmpty: boolean | null;
  selectedBlockText: string | null;
  caretRect: {
    top: number;
    bottom: number;
    centerY: number;
  } | null;
  selectedBlockRect: {
    top: number;
    bottom: number;
    centerY: number;
  } | null;
  centerDelta: number | null;
};

async function setContentCommitThrottleMs(page: Page, throttleMs: number): Promise<void> {
  await page.evaluate((ms) => {
    (globalThis as { __VL_TEST_CONTENT_COMMIT_THROTTLE_MS__?: number })
      .__VL_TEST_CONTENT_COMMIT_THROTTLE_MS__ = ms;
  }, throttleMs);
}

async function enableMarkdownTypewriterMode(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('open-settings'));
  });
  await expect(page.locator(SETTINGS_MODAL_SELECTOR)).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-settings-tab="markdown"]').click();
  await expect(page.locator(SETTINGS_MODAL_SELECTOR)).toHaveAttribute('data-settings-active-tab', 'markdown', {
    timeout: 10_000,
  });

  const isEnabled = await page.evaluate(() => (
    (window as any).__vlainaE2E.getUnifiedData().settings.markdown.typewriterMode === true
  ));
  if (!isEnabled) {
    await page.locator('[data-settings-control="markdown-typewriter-mode"]').click();
    await expect.poll(async () => page.evaluate(() => (
      (window as any).__vlainaE2E.getUnifiedData().settings.markdown.typewriterMode === true
    )), { timeout: 10_000 }).toBe(true);
  }

  await page.locator('[data-settings-action="close"]').click();
  await expect(page.locator(SETTINGS_MODAL_SELECTOR)).toBeHidden({ timeout: 10_000 });
}

async function scrollTextIntoView(page: Page, text: string) {
  const before = await page.evaluate(({ editorSelector, scrollRootSelector, text }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    const scrollRoot = document.querySelector<HTMLElement>(scrollRootSelector);
    const paragraph = Array.from(editor?.querySelectorAll<HTMLElement>('p') ?? [])
      .find((candidate) => candidate.textContent?.includes(text)) ?? null;
    paragraph?.scrollIntoView({ block: 'center', inline: 'nearest' });
    return {
      scrollTop: Math.round(scrollRoot?.scrollTop ?? 0),
      maxScrollTop: Math.round((scrollRoot?.scrollHeight ?? 0) - (scrollRoot?.clientHeight ?? 0)),
      targetText: paragraph?.textContent ?? null,
    };
  }, { editorSelector: EDITOR_SELECTOR, scrollRootSelector: NOTE_SCROLL_ROOT_SELECTOR, text });
  expect(before.targetText).toContain(text);
  await waitForEditorAnimationFrame(page);
  return before;
}

async function clickText(page: Page, text: string): Promise<void> {
  const point = await page.evaluate(({ editorSelector, text }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    if (!editor) return null;

    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const value = node.textContent ?? '';
      const index = value.indexOf(text);
      if (index >= 0) {
        const range = document.createRange();
        const offset = index + Math.min(24, Math.max(1, text.length - 1));
        range.setStart(node, offset);
        range.setEnd(node, Math.min(value.length, offset + 1));
        const rect = range.getBoundingClientRect();
        range.detach();
        if (rect.width > 0 && rect.height > 0) {
          return {
            x: rect.left + Math.min(4, rect.width / 2),
            y: rect.top + rect.height / 2,
          };
        }
      }
      node = walker.nextNode();
    }

    return null;
  }, { editorSelector: EDITOR_SELECTOR, text });

  expect(point, `Expected visible text point for ${text}`).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
  await waitForEditorAnimationFrame(page);
}

async function clickParagraphRightBlank(page: Page, text: string): Promise<void> {
  const point = await page.evaluate(({ editorSelector, text }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    if (!editor) return null;
    const paragraph = Array.from(editor.querySelectorAll<HTMLElement>('p'))
      .find((candidate) => candidate.textContent?.includes(text)) ?? null;
    if (!paragraph) return null;
    const rect = paragraph.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    return {
      x: rect.right - Math.min(36, Math.max(12, rect.width * 0.08)),
      y: rect.top + Math.min(rect.height - 2, Math.max(2, rect.height / 2)),
    };
  }, { editorSelector: EDITOR_SELECTOR, text });

  expect(point, `Expected paragraph right-side point for ${text}`).not.toBeNull();
  await page.mouse.click(point!.x, point!.y);
  await waitForEditorAnimationFrame(page);
}

async function insertImeText(page: Page, text: string): Promise<void> {
  const started = await page.evaluate(({ editorSelector, text }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    if (!editor) return false;
    editor.dispatchEvent(new CompositionEvent('compositionstart', {
      bubbles: true,
      data: '',
    }));
    editor.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      data: text,
      inputType: 'insertCompositionText',
    }));
    return true;
  }, { editorSelector: EDITOR_SELECTOR, text });
  expect(started, 'Expected editor to receive IME composition start').toBe(true);

  await page.keyboard.insertText(text);

  await page.evaluate(({ editorSelector, text }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    editor?.dispatchEvent(new CompositionEvent('compositionend', {
      bubbles: true,
      data: text,
    }));
  }, { editorSelector: EDITOR_SELECTOR, text });
}

async function expectEditorFocusedAtFirstLineEnd(page: Page): Promise<void> {
  await expect.poll(async () => page.evaluate((editorSelector) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    const firstTextBlock = editor?.querySelector<HTMLElement>('h1, h2, h3, h4, h5, h6, p');
    const selection = (window as any).__vlainaE2E.getEditorSelectionSummary();
    const expectedLineEnd = (firstTextBlock?.textContent?.length ?? 0) + 1;
    return {
      focused: Boolean(editor && (
        document.activeElement === editor ||
        editor.contains(document.activeElement)
      )),
      atFirstLineEnd: selection?.from === expectedLineEnd,
      selectionEmpty: selection?.empty ?? false,
      selectionFrom: selection?.from ?? null,
    };
  }, EDITOR_SELECTOR), { timeout: 5_000 }).toMatchObject({
    focused: true,
    atFirstLineEnd: true,
    selectionEmpty: true,
  });
}

async function installTypewriterScrollCaretProbe(page: Page): Promise<void> {
  const installed = await page.evaluate(({ caretSelector, editorSelector, scrollRootSelector }) => {
    const scrollRoot = document.querySelector<HTMLElement>(scrollRootSelector);
    if (!scrollRoot) return false;

    let prototype: object | null = scrollRoot;
    let descriptor: PropertyDescriptor | undefined;
    while (prototype && !descriptor) {
      descriptor = Object.getOwnPropertyDescriptor(prototype, 'scrollTop');
      prototype = Object.getPrototypeOf(prototype);
    }
    if (!descriptor?.get || !descriptor.set) return false;

    const snapshots: TypewriterScrollCaretSnapshot[] = [];
    const readScrollTop = () => descriptor.get!.call(scrollRoot) as number;

    const readSnapshot = (requestedScrollTop: number): void => {
      const editor = document.querySelector<HTMLElement>(editorSelector);
      const caret = document.querySelector<HTMLElement>(caretSelector);
      if (!editor || !caret) return;

      const selection = window.getSelection();
      const anchorNode = selection?.anchorNode ?? null;
      const anchorElement = anchorNode instanceof HTMLElement
        ? anchorNode
        : anchorNode?.parentElement ?? null;
      const selectedBlock = anchorElement?.closest<HTMLElement>('p, h1, h2, h3, h4, h5, h6, li') ?? null;
      if (!selectedBlock || !editor.contains(selectedBlock)) return;

      const caretRect = caret.getBoundingClientRect();
      const selectedBlockRect = selectedBlock.getBoundingClientRect();
      const caretCenterY = (caretRect.top + caretRect.bottom) / 2;
      const selectedBlockCenterY = (selectedBlockRect.top + selectedBlockRect.bottom) / 2;
      snapshots.push({
        scrollTop: readScrollTop(),
        requestedScrollTop,
        selectionEmpty: selection?.isCollapsed ?? null,
        selectedBlockText: selectedBlock.textContent ?? null,
        caretRect: {
          top: caretRect.top,
          bottom: caretRect.bottom,
          centerY: caretCenterY,
        },
        selectedBlockRect: {
          top: selectedBlockRect.top,
          bottom: selectedBlockRect.bottom,
          centerY: selectedBlockCenterY,
        },
        centerDelta: Math.abs(caretCenterY - selectedBlockCenterY),
      });
    };

    Object.defineProperty(scrollRoot, 'scrollTop', {
      configurable: true,
      get() {
        return descriptor.get!.call(this);
      },
      set(value: number) {
        descriptor.set!.call(this, value);
        queueMicrotask(() => readSnapshot(value));
      },
    });

    (window as any).__vlainaTypewriterScrollCaretProbe = {
      snapshots,
    };
    return true;
  }, {
    caretSelector: TEXTBLOCK_CARET_OVERLAY_SELECTOR,
    editorSelector: EDITOR_SELECTOR,
    scrollRootSelector: NOTE_SCROLL_ROOT_SELECTOR,
  });

  expect(installed).toBe(true);
}

async function readTypewriterScrollCaretProbe(page: Page): Promise<TypewriterScrollCaretSnapshot[]> {
  return page.evaluate(() => (
    (window as any).__vlainaTypewriterScrollCaretProbe?.snapshots ?? []
  ));
}

async function resetTypewriterScrollCaretProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe = (window as any).__vlainaTypewriterScrollCaretProbe;
    if (probe?.snapshots) {
      probe.snapshots.length = 0;
    }
  });
}

function expectCaretSnapshotsAligned(
  snapshots: TypewriterScrollCaretSnapshot[],
  options: { requireBlankLine: boolean },
): void {
  const matchingSnapshots = snapshots.filter((snapshot) => (
    snapshot.selectionEmpty === true &&
    snapshot.selectedBlockRect !== null &&
    snapshot.caretRect !== null &&
    (
      !options.requireBlankLine ||
      snapshot.selectedBlockText === '' ||
      snapshot.selectedBlockText === '\u200B'
    )
  ));
  expect(matchingSnapshots.length, { snapshots }).toBeGreaterThan(0);

  for (const snapshot of matchingSnapshots) {
    expect(snapshot.centerDelta, { snapshot, snapshots }).toBeLessThanOrEqual(6);
  }
}

async function getTypingDiagnostics(page: Page, markers: string[]): Promise<TypingDiagnostics> {
  return page.evaluate(({ editorSelector, markers, scrollRootSelector }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    const scrollRoot = document.querySelector<HTMLElement>(scrollRootSelector);
    const paragraphs = Array.from(editor?.querySelectorAll<HTMLElement>('p') ?? []);
    const state = (window as any).__vlainaE2E.getNotesState();
    return {
      markerParagraphs: markers.map((marker: string) => {
        const index = paragraphs.findIndex((paragraph) => paragraph.textContent?.includes(marker));
        return {
          marker,
          index,
          text: index >= 0 ? paragraphs[index]?.textContent ?? null : null,
        };
      }),
      paragraphTexts: paragraphs.map((paragraph) => paragraph.textContent ?? ''),
      lastParagraphText: paragraphs.at(-1)?.textContent ?? null,
      paragraphCount: paragraphs.length,
      scrollTop: Math.round(scrollRoot?.scrollTop ?? 0),
      maxScrollTop: Math.round((scrollRoot?.scrollHeight ?? 0) - (scrollRoot?.clientHeight ?? 0)),
      selection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
      isDirty: Boolean(state.isDirty),
      currentContentIncludesMarkers: markers.map((marker: string) => (
        typeof state.currentNote?.content === 'string' && state.currentNote.content.includes(marker)
      )),
    };
  }, { editorSelector: EDITOR_SELECTOR, markers, scrollRootSelector: NOTE_SCROLL_ROOT_SELECTOR });
}

function expectMarkersAwayFromLastLine(diagnostics: TypingDiagnostics, markers: string[]) {
  for (const marker of markers) {
    const markerParagraph = diagnostics.markerParagraphs.find((paragraph) => paragraph.marker === marker);
    expect(markerParagraph?.index, `Expected marker ${marker} to appear in an editor paragraph`).toBeGreaterThanOrEqual(0);
    expect(markerParagraph?.text, `Expected marker ${marker} paragraph text`).toContain(marker);
    expect(diagnostics.lastParagraphText, `Last paragraph must not receive marker ${marker}`).not.toContain(marker);
    expect(markerParagraph?.index, `Marker ${marker} should not be in the final paragraph`)
      .toBeLessThan(Math.max(0, diagnostics.paragraphCount - 1));
  }
}

test.describe('notes typing caret position', () => {
  test.setTimeout(120_000);

  test('focuses the editor body when opening a populated note', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-open-populated-autofocus');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);

      await openMarkdownFixture(page, {
        filename: 'populated-autofocus-e2e.md',
        content: [
          '# Populated Autofocus',
          '',
          'Opening this existing note should place the cursor in the editor without a click.',
        ].join('\n'),
      });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Opening this existing note');
      await expectEditorFocusedAtFirstLineEnd(page);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps middle-of-note typing at the clicked paragraph instead of jumping to the last line', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-typing-caret-position');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const targetText = 'Typing caret paragraph 42 sentinel text';
      const marker = ' middle-input-e2e ';
      await openMarkdownFixture(page, {
        filename: 'typing-caret-position-e2e.md',
        content: createLongTypingMarkdown(),
      });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Final typing caret sentinel');

      const before = await scrollTextIntoView(page, targetText);

      await clickText(page, targetText);
      await page.keyboard.type(marker, { delay: 0 });
      await waitForEditorAnimationFrame(page);
      await waitForEditorAnimationFrame(page);
      await page.waitForTimeout(900);
      await waitForEditorAnimationFrame(page);

      const after = await page.evaluate(({ editorSelector, marker, scrollRootSelector, targetText }) => {
        const editor = document.querySelector<HTMLElement>(editorSelector);
        const scrollRoot = document.querySelector<HTMLElement>(scrollRootSelector);
        const paragraphs = Array.from(editor?.querySelectorAll<HTMLElement>('p') ?? []);
        const markerParagraph = paragraphs.find((paragraph) => paragraph.textContent?.includes(marker)) ?? null;
        const targetParagraph = paragraphs.find((paragraph) => paragraph.textContent?.includes(targetText)) ?? null;
        const lastParagraph = paragraphs.at(-1) ?? null;
        const selection = (window as any).__vlainaE2E.getEditorSelectionSummary();
        return {
          markerParagraphText: markerParagraph?.textContent ?? null,
          targetParagraphText: targetParagraph?.textContent ?? null,
          lastParagraphText: lastParagraph?.textContent ?? null,
          scrollTop: Math.round(scrollRoot?.scrollTop ?? 0),
          maxScrollTop: Math.round((scrollRoot?.scrollHeight ?? 0) - (scrollRoot?.clientHeight ?? 0)),
          selection,
        };
      }, { editorSelector: EDITOR_SELECTOR, marker, scrollRootSelector: NOTE_SCROLL_ROOT_SELECTOR, targetText });

      console.info('[notes-typing-caret-position]', { before, after });

      expect(after.markerParagraphText).toContain('Typing caret paragraph 4');
      expect(after.markerParagraphText).toContain('2 sentinel text');
      expect(after.markerParagraphText).toContain(marker.trim());
      expect(after.lastParagraphText).not.toContain(marker.trim());
      expect(after.scrollTop).toBeLessThan(after.maxScrollTop - 120);
      expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThan(220);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps typing position after pending markdown is flushed by save before scheduled content commit', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-typing-caret-save-flush');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await setContentCommitThrottleMs(page, 5_000);

      const targetText = 'Typing caret paragraph 42 sentinel text';
      const firstMarker = 'pendingFlushFirstE2E';
      const secondMarker = 'afterSaveSecondE2E';
      await openMarkdownFixture(page, {
        filename: 'typing-caret-save-flush-e2e.md',
        content: createLongTypingMarkdown(),
      });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Final typing caret sentinel');

      const before = await scrollTextIntoView(page, targetText);
      await clickText(page, targetText);
      await page.keyboard.type(firstMarker, { delay: 0 });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(firstMarker);

      const beforeSave = await getTypingDiagnostics(page, [firstMarker]);
      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      await waitForEditorAnimationFrame(page);
      await page.waitForTimeout(150);

      const afterSave = await getTypingDiagnostics(page, [firstMarker]);
      await page.keyboard.type(secondMarker, { delay: 0 });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(secondMarker);
      await waitForEditorAnimationFrame(page);
      await page.waitForTimeout(150);

      const afterSecondType = await getTypingDiagnostics(page, [firstMarker, secondMarker]);
      console.info('[notes-typing-caret-save-flush]', {
        before,
        beforeSave,
        afterSave,
        afterSecondType,
      });

      expectMarkersAwayFromLastLine(afterSecondType, [firstMarker, secondMarker]);
      expect(afterSecondType.markerParagraphs[0]?.index).toBe(afterSecondType.markerParagraphs[1]?.index);
      expect(afterSave.currentContentIncludesMarkers[0]).toBe(true);
      expect(afterSecondType.scrollTop).toBeLessThan(afterSecondType.maxScrollTop - 120);
      expect(Math.abs(afterSecondType.scrollTop - before.scrollTop)).toBeLessThan(260);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps typing position after scheduled autosave content commit settles', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-typing-caret-autosave-commit');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await setContentCommitThrottleMs(page, 120);

      const targetText = 'Typing caret paragraph 42 sentinel text';
      const firstMarker = 'autoCommitFirstE2E';
      const secondMarker = 'autoCommitSecondE2E';
      await openMarkdownFixture(page, {
        filename: 'typing-caret-autosave-commit-e2e.md',
        content: createLongTypingMarkdown(),
      });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Final typing caret sentinel');

      const before = await scrollTextIntoView(page, targetText);
      await clickText(page, targetText);
      await page.keyboard.type(firstMarker, { delay: 0 });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(firstMarker);
      await waitForEditorAnimationFrame(page);
      await page.waitForTimeout(900);

      const afterFirstCommit = await getTypingDiagnostics(page, [firstMarker]);
      await page.keyboard.type(secondMarker, { delay: 0 });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(secondMarker);
      await waitForEditorAnimationFrame(page);
      await page.waitForTimeout(900);

      const afterSecondCommit = await getTypingDiagnostics(page, [firstMarker, secondMarker]);
      console.info('[notes-typing-caret-autosave-commit]', {
        before,
        afterFirstCommit,
        afterSecondCommit,
      });

      expectMarkersAwayFromLastLine(afterSecondCommit, [firstMarker, secondMarker]);
      expect(afterSecondCommit.markerParagraphs[0]?.index).toBe(afterSecondCommit.markerParagraphs[1]?.index);
      expect(afterFirstCommit.currentContentIncludesMarkers[0]).toBe(true);
      expect(afterSecondCommit.currentContentIncludesMarkers).toEqual([true, true]);
      expect(afterSecondCommit.scrollTop).toBeLessThan(afterSecondCommit.maxScrollTop - 120);
      expect(Math.abs(afterSecondCommit.scrollTop - before.scrollTop)).toBeLessThan(260);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps typing position after the debounced disk save completes', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-typing-caret-disk-save');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await setContentCommitThrottleMs(page, 120);

      const targetText = 'Typing caret paragraph 42 sentinel text';
      const firstMarker = 'diskSaveFirstE2E';
      const secondMarker = 'diskSaveSecondE2E';
      const opened = await openMarkdownFixture(page, {
        filename: 'typing-caret-disk-save-e2e.md',
        content: createLongTypingMarkdown(),
      });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Final typing caret sentinel');

      const before = await scrollTextIntoView(page, targetText);
      await clickText(page, targetText);
      await page.keyboard.type(firstMarker, { delay: 0 });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(firstMarker);
      await expect.poll(async () => page.evaluate((marker) => (
        (window as any).__vlainaE2E.getNotesState().currentNote?.content?.includes(marker) === true
      ), firstMarker), { timeout: 8_000 }).toBe(true);
      await expect.poll(async () => page.evaluate((path) => (
        (window as any).__vlainaE2E.readTextFile(path)
      ), opened.notePath), { timeout: 8_000 }).toContain(firstMarker);

      const afterDiskSave = await getTypingDiagnostics(page, [firstMarker]);
      await page.keyboard.type(secondMarker, { delay: 0 });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(secondMarker);
      await waitForEditorAnimationFrame(page);
      await page.waitForTimeout(900);

      const afterSecondCommit = await getTypingDiagnostics(page, [firstMarker, secondMarker]);
      console.info('[notes-typing-caret-disk-save]', {
        before,
        afterDiskSave,
        afterSecondCommit,
      });

      expectMarkersAwayFromLastLine(afterSecondCommit, [firstMarker, secondMarker]);
      expect(afterSecondCommit.markerParagraphs[0]?.index).toBe(afterSecondCommit.markerParagraphs[1]?.index);
      expect(afterSecondCommit.currentContentIncludesMarkers).toEqual([true, true]);
      expect(afterSecondCommit.scrollTop).toBeLessThan(afterSecondCommit.maxScrollTop - 120);
      expect(Math.abs(afterSecondCommit.scrollTop - before.scrollTop)).toBeLessThan(260);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps typing position after a clean same-note disk reload replaces editor content', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-typing-caret-external-disk-reload');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const originalMarkdown = createLongTypingMarkdown();
      const externalMarkdown = originalMarkdown.replace(
        'Typing caret paragraph 10 sentinel text',
        'Typing caret paragraph 10 external disk edit sentinel text'
      );
      const targetText = 'Typing caret paragraph 42 sentinel text';
      const externalMarker = 'external disk edit sentinel';
      const inputMarker = 'afterExternalReloadE2E';
      const opened = await openMarkdownFixture(page, {
        filename: 'typing-caret-external-disk-reload-e2e.md',
        content: originalMarkdown,
      });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Final typing caret sentinel');

      const before = await scrollTextIntoView(page, targetText);
      await clickText(page, targetText);
      const beforeReload = await getTypingDiagnostics(page, []);

      await page.evaluate(
        ({ path, content }) => (window as any).__vlainaE2E.writeTextFile(path, content),
        { path: opened.notePath, content: externalMarkdown }
      );
      const reloadResult = await page.evaluate(() =>
        (window as any).__vlainaE2E.syncCurrentNoteFromDisk({ force: true })
      );
      expect(['reloaded', 'unchanged']).toContain(reloadResult);
      await expect.poll(async () => page.evaluate((marker) => (
        (window as any).__vlainaE2E.getNotesState().currentNote?.content?.includes(marker) === true
      ), externalMarker), { timeout: 8_000 }).toBe(true);
      await waitForEditorAnimationFrame(page);
      await waitForEditorAnimationFrame(page);

      const afterReload = await getTypingDiagnostics(page, []);
      await page.keyboard.type(inputMarker, { delay: 0 });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(inputMarker);
      await waitForEditorAnimationFrame(page);
      await page.waitForTimeout(900);

      const afterType = await getTypingDiagnostics(page, [inputMarker]);
      console.info('[notes-typing-caret-external-disk-reload]', {
        before,
        beforeReload,
        afterReload,
        afterType,
      });

      expectMarkersAwayFromLastLine(afterType, [inputMarker]);
      expect(afterType.markerParagraphs[0]?.text).toContain('caret paragraph 42');
      expect(afterType.markerParagraphs[0]?.text).toContain('sentinel text');
      expect(afterType.currentContentIncludesMarkers).toEqual([true]);
      expect(afterType.lastParagraphText).toContain('Final typing caret sentinel');
      expect(afterType.scrollTop).toBeLessThan(afterType.maxScrollTop - 120);
      expect(Math.abs(afterType.scrollTop - before.scrollTop)).toBeLessThan(280);
      expect(afterReload.selection?.from ?? 0).toBeLessThan((afterReload.selection?.docTextLength ?? 0) - 120);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps typing position through repeated same-note save and disk reload cycles', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-typing-caret-repeated-replacements');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await setContentCommitThrottleMs(page, 120);

      const targetText = 'Typing caret paragraph 42 sentinel text';
      const finalSentinel = 'Final typing caret sentinel should not receive middle input.';
      const markers = Array.from({ length: 5 }, (_, index) => `loopStress${index}E2E`);
      const opened = await openMarkdownFixture(page, {
        filename: 'typing-caret-repeated-replacements-e2e.md',
        content: createLongTypingMarkdown(),
      });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(finalSentinel);

      const before = await scrollTextIntoView(page, targetText);
      await clickText(page, targetText);

      for (let index = 0; index < markers.length; index += 1) {
        const marker = markers[index]!;
        const reloadMarker = `External reload cycle ${index} after target.`;

        await page.keyboard.type(marker, { delay: 0 });
        await expect(page.locator(EDITOR_SELECTOR)).toContainText(marker);
        await waitForEditorAnimationFrame(page);
        await page.waitForTimeout(900);

        const afterType = await getTypingDiagnostics(page, markers.slice(0, index + 1));
        expectMarkersAwayFromLastLine(afterType, markers.slice(0, index + 1));
        expect(afterType.markerParagraphs[index]?.text).toContain('Typing caret paragraph 4');
        expect(afterType.markerParagraphs[index]?.text).toContain('2 sentinel text');

        await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
        await expect.poll(async () => page.evaluate((path) => (
          (window as any).__vlainaE2E.readTextFile(path)
        ), opened.notePath), { timeout: 8_000 }).toContain(marker);

        const currentContent = await page.evaluate(() => (
          String((window as any).__vlainaE2E.getNotesState().currentNote?.content ?? '')
        ));
        expect(currentContent).toContain(marker);
        const nextDiskContent = currentContent.includes(reloadMarker)
          ? currentContent
          : currentContent.replace(finalSentinel, `${reloadMarker}\n\n${finalSentinel}`);
        await page.evaluate(
          ({ path, content }) => (window as any).__vlainaE2E.writeTextFile(path, content),
          { path: opened.notePath, content: nextDiskContent }
        );
        const reloadResult = await page.evaluate(() =>
          (window as any).__vlainaE2E.syncCurrentNoteFromDisk({ force: true })
        );
        expect(['reloaded', 'unchanged']).toContain(reloadResult);
        await expect.poll(async () => page.evaluate((text) => (
          (window as any).__vlainaE2E.getNotesState().currentNote?.content?.includes(text) === true
        ), reloadMarker), { timeout: 8_000 }).toBe(true);
        await waitForEditorAnimationFrame(page);
        await waitForEditorAnimationFrame(page);

        const afterReload = await getTypingDiagnostics(page, markers.slice(0, index + 1));
        expectMarkersAwayFromLastLine(afterReload, markers.slice(0, index + 1));
        expect(afterReload.selection?.from ?? 0)
          .toBeLessThan((afterReload.selection?.docTextLength ?? 0) - 120);
        expect(Math.abs(afterReload.scrollTop - before.scrollTop)).toBeLessThan(320);
      }

      const afterAll = await getTypingDiagnostics(page, markers);
      console.info('[notes-typing-caret-repeated-replacements]', { before, afterAll });

      expectMarkersAwayFromLastLine(afterAll, markers);
      for (const markerParagraph of afterAll.markerParagraphs) {
        expect(markerParagraph.text).toContain('Typing caret paragraph 4');
        expect(markerParagraph.text).toContain('2 sentinel text');
      }
      expect(afterAll.markerParagraphs.map((paragraph) => paragraph.index))
        .toEqual(markers.map(() => afterAll.markerParagraphs[0]?.index));
      expect(afterAll.lastParagraphText).toContain(finalSentinel);
      expect(afterAll.currentContentIncludesMarkers).toEqual(markers.map(() => true));
      expect(Math.abs(afterAll.scrollTop - before.scrollTop)).toBeLessThan(320);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps typing position in structured markdown after autosave normalization settles', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-typing-caret-structured-markdown');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await setContentCommitThrottleMs(page, 120);

      const targetText = 'Structured caret paragraph 28 sentinel plain segment before';
      const firstMarker = 'structuredFirstE2E';
      const secondMarker = 'structuredSecondE2E';
      const thirdMarker = 'structuredThirdE2E';
      await openMarkdownFixture(page, {
        filename: 'typing-caret-structured-markdown-e2e.md',
        content: createStructuredTypingMarkdown(),
      });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Final structured typing caret sentinel');

      const before = await scrollTextIntoView(page, targetText);
      await clickText(page, targetText);
      await page.keyboard.type(firstMarker, { delay: 0 });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(firstMarker);
      await waitForEditorAnimationFrame(page);
      await page.waitForTimeout(900);

      const afterFirstCommit = await getTypingDiagnostics(page, [firstMarker]);
      await page.keyboard.type(secondMarker, { delay: 0 });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(secondMarker);
      await waitForEditorAnimationFrame(page);
      await page.waitForTimeout(900);

      const afterSecondCommit = await getTypingDiagnostics(page, [firstMarker, secondMarker]);
      await page.keyboard.type(thirdMarker, { delay: 0 });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(thirdMarker);
      await waitForEditorAnimationFrame(page);
      await page.waitForTimeout(900);

      const afterThirdCommit = await getTypingDiagnostics(page, [firstMarker, secondMarker, thirdMarker]);
      console.info('[notes-typing-caret-structured-markdown]', {
        before,
        afterFirstCommit,
        afterSecondCommit,
        afterThirdCommit,
      });

      expectMarkersAwayFromLastLine(afterThirdCommit, [firstMarker, secondMarker, thirdMarker]);
      expect(afterThirdCommit.markerParagraphs[0]?.index).toBe(afterThirdCommit.markerParagraphs[1]?.index);
      expect(afterThirdCommit.markerParagraphs[1]?.index).toBe(afterThirdCommit.markerParagraphs[2]?.index);
      for (const paragraph of afterThirdCommit.markerParagraphs) {
        expect(paragraph.text).toContain('Structured caret paragra');
        expect(paragraph.text).toContain('ph 28 sentinel plain segment before');
      }
      expect(afterThirdCommit.currentContentIncludesMarkers).toEqual([true, true, true]);
      expect(afterThirdCommit.lastParagraphText).toContain('Final structured typing caret sentinel');
      expect(afterThirdCommit.scrollTop).toBeLessThan(afterThirdCommit.maxScrollTop - 120);
      expect(Math.abs(afterThirdCommit.scrollTop - before.scrollTop)).toBeLessThan(280);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps typewriter mode typing near the clicked paragraph instead of jumping to the tail', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-typing-caret-typewriter-mode');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await setContentCommitThrottleMs(page, 120);
      await enableMarkdownTypewriterMode(page);

      const targetText = 'Typing caret paragraph 42 sentinel text';
      const marker = 'typewriterModeE2E';
      await openMarkdownFixture(page, {
        filename: 'typing-caret-typewriter-mode-e2e.md',
        content: createLongTypingMarkdown(),
      });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Final typing caret sentinel');

      const before = await scrollTextIntoView(page, targetText);
      await clickText(page, targetText);
      await page.keyboard.type(marker, { delay: 0 });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(marker);
      await waitForEditorAnimationFrame(page);
      await page.waitForTimeout(900);

      const after = await getTypingDiagnostics(page, [marker]);
      console.info('[notes-typing-caret-typewriter-mode]', { before, after });

      expectMarkersAwayFromLastLine(after, [marker]);
      expect(after.markerParagraphs[0]?.index).toBeGreaterThan(35);
      expect(after.markerParagraphs[0]?.index).toBeLessThan(50);
      expect(after.currentContentIncludesMarkers).toEqual([true]);
      expect(after.scrollTop).toBeLessThan(after.maxScrollTop - 120);
      expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThan(420);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps typewriter mode keyboard input active after Enter creates an empty paragraph', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-typewriter-enter-no-click');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await enableMarkdownTypewriterMode(page);

      const beforeText = 'Typewriter no click before';
      const marker = 'NoClickAfterEnterE2E';
      await openMarkdownFixture(page, {
        filename: 'typewriter-enter-no-click-e2e.md',
        content: '',
      });

      await page.locator(EDITOR_SELECTOR).click();
      await page.keyboard.type(beforeText, { delay: 0 });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(beforeText);
      await page.keyboard.press('Enter');
      await waitForEditorAnimationFrame(page);
      await page.waitForTimeout(300);

      const beforeType = await page.locator(EDITOR_SELECTOR).evaluate((editor) => ({
        focused: document.activeElement === editor || editor.contains(document.activeElement),
        selection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
        paragraphTexts: Array.from(editor.querySelectorAll('p')).map((node) => node.textContent ?? ''),
      }));
      expect(beforeType.focused, JSON.stringify(beforeType, null, 2)).toBe(true);
      expect(beforeType.selection?.empty, JSON.stringify(beforeType, null, 2)).toBe(true);
      expect(beforeType.paragraphTexts, JSON.stringify(beforeType, null, 2)).toEqual([beforeText, '']);

      await page.keyboard.type(marker, { delay: 0 });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(marker);
      await waitForEditorAnimationFrame(page);

      const afterType = await page.locator(EDITOR_SELECTOR).evaluate((editor) => ({
        focused: document.activeElement === editor || editor.contains(document.activeElement),
        selection: (window as any).__vlainaE2E.getEditorSelectionSummary(),
        paragraphTexts: Array.from(editor.querySelectorAll('p')).map((node) => node.textContent ?? ''),
      }));
      expect(afterType.focused, JSON.stringify(afterType, null, 2)).toBe(true);
      expect(afterType.selection?.empty, JSON.stringify(afterType, null, 2)).toBe(true);
      expect(afterType.paragraphTexts, JSON.stringify(afterType, null, 2)).toEqual([beforeText, marker]);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps the typewriter caret overlay aligned while editing consecutive blank lines', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-typewriter-consecutive-blank-caret');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await enableMarkdownTypewriterMode(page);

      const targetText = 'Typing caret paragraph 42 sentinel text';
      await openMarkdownFixture(page, {
        filename: 'typewriter-consecutive-blank-caret-e2e.md',
        content: createLongTypingMarkdown(),
      });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Final typing caret sentinel');

      await scrollTextIntoView(page, targetText);
      await clickText(page, targetText);
      await expect(page.locator(TEXTBLOCK_CARET_OVERLAY_SELECTOR)).toBeVisible({ timeout: 10_000 });

      await installTypewriterScrollCaretProbe(page);
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await waitForEditorAnimationFrame(page);
      await page.keyboard.press('Enter');
      await waitForEditorAnimationFrame(page);
      await waitForEditorAnimationFrame(page);

      const snapshots = await readTypewriterScrollCaretProbe(page);
      expectCaretSnapshotsAligned(snapshots, { requireBlankLine: true });

      await page.evaluate((scrollRootSelector) => {
        const scrollRoot = document.querySelector<HTMLElement>(scrollRootSelector);
        if (scrollRoot) {
          scrollRoot.scrollTop += 160;
        }
      }, NOTE_SCROLL_ROOT_SELECTOR);
      await waitForEditorAnimationFrame(page);
      await waitForEditorAnimationFrame(page);
      await resetTypewriterScrollCaretProbe(page);
      await page.keyboard.press('Backspace');
      await waitForEditorAnimationFrame(page);
      await waitForEditorAnimationFrame(page);

      const afterBackspaceSnapshots = await readTypewriterScrollCaretProbe(page);
      expectCaretSnapshotsAligned(afterBackspaceSnapshots, { requireBlankLine: false });
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps typewriter mode typing stable across repeated far-apart paragraph clicks', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-typing-caret-typewriter-loop');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await setContentCommitThrottleMs(page, 120);
      await enableMarkdownTypewriterMode(page);

      const targets = [12, 42, 72, 31];
      const markers = targets.map((target, index) => `typewriterLoop${index}E2E`);
      const opened = await openMarkdownFixture(page, {
        filename: 'typing-caret-typewriter-loop-e2e.md',
        content: createLongTypingMarkdown(),
      });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Final typing caret sentinel');

      for (let index = 0; index < targets.length; index += 1) {
        const targetIndex = targets[index]!;
        const targetText = `Typing caret paragraph ${targetIndex} sentinel text`;
        const marker = markers[index]!;

        const before = await scrollTextIntoView(page, targetText);
        await clickText(page, targetText);
        await page.keyboard.type(marker, { delay: 0 });
        await expect(page.locator(EDITOR_SELECTOR)).toContainText(marker);
        await waitForEditorAnimationFrame(page);
        await page.waitForTimeout(900);

        const after = await getTypingDiagnostics(page, markers.slice(0, index + 1));
        const markerParagraph = after.markerParagraphs[index];
        console.info('[notes-typing-caret-typewriter-loop]', {
          iteration: index,
          targetIndex,
          before,
          markerParagraph,
          scrollTop: after.scrollTop,
          maxScrollTop: after.maxScrollTop,
        });

        expectMarkersAwayFromLastLine(after, markers.slice(0, index + 1));
        expect(markerParagraph?.index).toBe(targetIndex);
        expect(markerParagraph?.text).toContain(`Typing caret paragraph ${Math.floor(targetIndex / 10)}`);
        expect(markerParagraph?.text).toContain(`${targetIndex % 10} sentinel text`);
        expect(markerParagraph?.text).toContain(marker);
        expect(after.scrollTop).toBeLessThan(after.maxScrollTop - 120);
        expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThan(420);
        await expect.poll(async () => page.evaluate((currentMarker) => (
          (window as any).__vlainaE2E.getNotesState().currentNote?.content?.includes(currentMarker) === true
        ), marker), { timeout: 8_000 }).toBe(true);
      }

      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      for (const marker of markers) {
        await expect.poll(async () => page.evaluate((input) => (
          (window as any).__vlainaE2E.readTextFile(input.path)
            .then((content: string) => content.includes(input.marker))
        ), { path: opened.notePath, marker }), { timeout: 8_000 }).toBe(true);
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps right-side blank clicks in the visible middle paragraph instead of the final line', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-typing-caret-right-blank');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await setContentCommitThrottleMs(page, 120);

      const targetText = 'Typing caret paragraph 42 sentinel text';
      const marker = 'rightBlankClickE2E';
      await openMarkdownFixture(page, {
        filename: 'typing-caret-right-blank-e2e.md',
        content: createLongTypingMarkdown(),
      });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Final typing caret sentinel');

      const before = await scrollTextIntoView(page, targetText);
      await clickParagraphRightBlank(page, targetText);
      await page.keyboard.type(marker, { delay: 0 });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText(marker);
      await waitForEditorAnimationFrame(page);
      await page.waitForTimeout(900);

      const after = await getTypingDiagnostics(page, [marker]);
      console.info('[notes-typing-caret-right-blank]', { before, after });

      expectMarkersAwayFromLastLine(after, [marker]);
      expect(after.markerParagraphs[0]?.index).toBeGreaterThan(35);
      expect(after.markerParagraphs[0]?.index).toBeLessThan(50);
      expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThan(260);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps repeated IME-style Chinese follow-up typing appended instead of replacing committed text', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-typing-caret-selected-chinese');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await setContentCommitThrottleMs(page, 120);

      await openMarkdownFixture(page, {
        filename: 'typing-caret-selected-chinese-e2e.md',
        content: createLongTypingMarkdown(),
      });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Final typing caret sentinel');

      const cases = [42, 43, 44].map((paragraphIndex) => ({
        anchorText: `Typing caret paragraph ${paragraphIndex} sentinel text`,
        targetText: `paragraph ${paragraphIndex} sentinel`,
        marker: `我输入这输入这-${paragraphIndex}-e2e`,
        probe: `Probe${paragraphIndex}E2E`,
        tail: `Tail${paragraphIndex}E2E`,
      }));

      const before = await scrollTextIntoView(page, cases[0]!.anchorText);
      const completedMarkers: string[] = [];

      for (const testCase of cases) {
        await scrollTextIntoView(page, testCase.anchorText);
        const selected = await page.evaluate(
          ({ targetText, anchorText }) => (window as any).__vlainaE2E.selectEditorTextByText(targetText, anchorText),
          { targetText: testCase.targetText, anchorText: testCase.anchorText }
        );
        expect(selected.selected).toBe(true);

        await insertImeText(page, testCase.marker);
        await expect(page.locator(EDITOR_SELECTOR)).toContainText(testCase.marker);
        await waitForEditorAnimationFrame(page);
        await page.waitForTimeout(150);

        const afterIme = await getTypingDiagnostics(page, [testCase.marker]);
        expect(afterIme.markerParagraphs[0]?.text).toContain(testCase.marker);

        await page.keyboard.type(testCase.probe, { delay: 0 });
        await expect(page.locator(EDITOR_SELECTOR)).toContainText(`${testCase.marker}${testCase.probe}`);
        await waitForEditorAnimationFrame(page);
        await page.waitForTimeout(2_400);

        await page.keyboard.type(testCase.tail, { delay: 0 });
        await expect(page.locator(EDITOR_SELECTOR))
          .toContainText(`${testCase.marker}${testCase.probe}${testCase.tail}`);
        await waitForEditorAnimationFrame(page);
        await page.waitForTimeout(300);

        completedMarkers.push(testCase.marker);
        const afterProbe = await getTypingDiagnostics(page, completedMarkers);

        expectMarkersAwayFromLastLine(afterProbe, completedMarkers);
        const markerParagraph = afterProbe.markerParagraphs.find((paragraph) => paragraph.marker === testCase.marker);
        expect(markerParagraph?.text).toContain(`${testCase.marker}${testCase.probe}${testCase.tail}`);
        expect(afterProbe.currentContentIncludesMarkers).toEqual(completedMarkers.map(() => true));
        expect(afterProbe.lastParagraphText).toContain('Final typing caret sentinel');
        expect(Math.abs(afterProbe.scrollTop - before.scrollTop)).toBeLessThan(420);
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps IME-style Chinese committed before immediate Enter line breaks', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-typing-caret-selected-chinese-enter');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await setContentCommitThrottleMs(page, 120);

      const opened = await openMarkdownFixture(page, {
        filename: 'typing-caret-selected-chinese-enter-e2e.md',
        content: createLongTypingMarkdown(),
      });
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Final typing caret sentinel');

      const cases = [45, 46].map((paragraphIndex) => ({
        anchorText: `Typing caret paragraph ${paragraphIndex} sentinel text`,
        targetText: `paragraph ${paragraphIndex} sentinel`,
        marker: `马上回车中文-${paragraphIndex}-e2e`,
        enterLine: `AfterEnter${paragraphIndex}E2E`,
      }));

      const before = await scrollTextIntoView(page, cases[0]!.anchorText);
      const completedMarkers: string[] = [];

      for (const testCase of cases) {
        await scrollTextIntoView(page, testCase.anchorText);
        const selected = await page.evaluate(
          ({ targetText, anchorText }) => (window as any).__vlainaE2E.selectEditorTextByText(targetText, anchorText),
          { targetText: testCase.targetText, anchorText: testCase.anchorText }
        );
        expect(selected.selected).toBe(true);

        await insertImeText(page, testCase.marker);
        await expect(page.locator(EDITOR_SELECTOR)).toContainText(testCase.marker);
        await waitForEditorAnimationFrame(page);
        await page.waitForTimeout(80);

        await page.keyboard.press('Enter');
        await page.keyboard.type(testCase.enterLine, { delay: 0 });
        await expect(page.locator(EDITOR_SELECTOR)).toContainText(testCase.enterLine);
        await waitForEditorAnimationFrame(page);
        await page.waitForTimeout(800);

        completedMarkers.push(testCase.marker);
        const afterEnter = await getTypingDiagnostics(page, completedMarkers);
        expectMarkersAwayFromLastLine(afterEnter, completedMarkers);
        const markerParagraph = afterEnter.markerParagraphs.find((paragraph) => paragraph.marker === testCase.marker);
        expect(markerParagraph?.text).toBe(`Typing caret ${testCase.marker}`);
        const nextParagraph = afterEnter.paragraphTexts[(markerParagraph?.index ?? -2) + 1] ?? '';
        expect(nextParagraph).toBe(`${testCase.enterLine} text stays editable in the middle of a long note.`);
        expect(afterEnter.paragraphTexts.filter((text) => text.includes(testCase.marker))).toHaveLength(1);
        expect(afterEnter.currentContentIncludesMarkers).toEqual(completedMarkers.map(() => true));
        expect(await page.evaluate(({ marker, enterLine, targetText }) => {
          const content = String((window as any).__vlainaE2E.getNotesState().currentNote?.content ?? '');
          return {
            markerCount: content.split(marker).length - 1,
            hasExpectedLines: content.includes(
              `Typing caret ${marker}\n${enterLine} text stays editable in the middle of a long note.`
            ),
            hasReplacedText: content.includes(targetText),
          };
        }, testCase)).toEqual({
          markerCount: 1,
          hasExpectedLines: true,
          hasReplacedText: false,
        });
        expect(afterEnter.lastParagraphText).toContain('Final typing caret sentinel');
        expect(Math.abs(afterEnter.scrollTop - before.scrollTop)).toBeLessThan(460);
      }

      await expect.poll(async () => page.evaluate(async ({ path, cases }) => {
        const content = String(await (window as any).__vlainaE2E.readTextFile(path));
        return cases.map(({ marker, enterLine, targetText }) => ({
          markerCount: content.split(marker).length - 1,
          hasExpectedLines: content.includes(
            `Typing caret ${marker}\n${enterLine} text stays editable in the middle of a long note.`
          ),
          hasReplacedText: content.includes(targetText),
        }));
      }, { path: opened.notePath, cases }), { timeout: 10_000 }).toEqual(cases.map(() => ({
        markerCount: 1,
        hasExpectedLines: true,
        hasReplacedText: false,
      })));
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
