import { expect, test, type Locator, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  EDITOR_SELECTOR,
  NOTE_IMAGE_BLOCK_SELECTOR,
  NOTE_SOURCE_FALLBACK_SELECTOR,
  cleanupIsolatedElectron,
  createNotesRootFilesFixture,
  getOpenBridgePages,
  launchIsolatedElectron,
  openAbsoluteNote,
  waitForEditorAnimationFrame,
} from './notesE2E';

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z8BQDwAFgwJ/l4KC+A4AAAAASUVORK5CYII=';
const NOTE_SOURCE_EDITOR_SELECTOR = '[data-note-source-editor="true"]';

function createLocalSvg(): string {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90" viewBox="0 0 160 90">',
    '<rect width="160" height="90" fill="#2563eb"/>',
    '<circle cx="45" cy="45" r="24" fill="#f8fafc"/>',
    '<path d="M80 28h56v12H80zm0 22h40v12H80z" fill="#bfdbfe"/>',
    '</svg>',
  ].join('');
}

function createCompletenessMarkdown(): string {
  return [
    '# Rich Markdown Completeness',
    '',
    '![Local image 中文 sentinel](./assets/本地%20image.svg)',
    '',
    '| Feature | Status | Detail |',
    '| :--- | :---: | ---: |',
    '| Table sentinel | **Editable** | `a \\| b` |',
    '',
    'Inline formula sentinel $a^2 + b^2 = c^2$.',
    '',
    '$$',
    '\\int_0^1 x^2 \\, dx = \\frac{1}{3}',
    '$$',
    '',
    '```mermaid',
    'flowchart TD',
    '  Start[Completeness start] --> Check{All supported?}',
    '  Check -->|Yes| Done[Completeness done]',
    '```',
    '',
    'Round-trip tail sentinel.',
  ].join('\n');
}

async function expectImageReady(imageBlock: Locator): Promise<void> {
  await imageBlock.scrollIntoViewIfNeeded();
  await expect(imageBlock).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => imageBlock.locator('img').evaluate((image) => ({
    complete: image.complete,
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight,
  })), { timeout: 30_000 }).toEqual({
    complete: true,
    naturalWidth: expect.any(Number),
    naturalHeight: expect.any(Number),
  });
  const dimensions = await imageBlock.locator('img').evaluate((image) => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }));
  expect(dimensions.width).toBeGreaterThan(0);
  expect(dimensions.height).toBeGreaterThan(0);
}

async function expectRichMarkdownRendered(page: Page): Promise<void> {
  await expect(page.locator(NOTE_SOURCE_FALLBACK_SELECTOR)).toHaveCount(0);
  await expectImageReady(
    page.locator(`${NOTE_IMAGE_BLOCK_SELECTOR}[data-alt="Local image 中文 sentinel"]`),
  );
  await expect(page.locator(`${EDITOR_SELECTOR} table`, { hasText: 'Table sentinel' })).toBeVisible();
  await expect(page.locator(`${EDITOR_SELECTOR} table strong`, { hasText: 'Editable' })).toBeVisible();
  await expect(page.locator(`${EDITOR_SELECTOR} table code`, { hasText: 'a | b' })).toBeVisible();
  await expect(page.locator(`${EDITOR_SELECTOR} span[data-type="math-inline"] .katex`)).toHaveCount(1);
  await expect(page.locator(`${EDITOR_SELECTOR} div[data-type="math-block"] .katex`)).toHaveCount(1);
  const mermaid = page.locator(`${EDITOR_SELECTOR} div[data-type="mermaid"]`);
  await mermaid.scrollIntoViewIfNeeded();
  await expect(mermaid.locator('svg')).toBeVisible({ timeout: 30_000 });
  await expect(mermaid.locator('.mermaid-error')).toHaveCount(0);
}

async function dispatchImageTransfer(
  page: Page,
  type: 'paste' | 'drop',
  fileName: string,
  clipboardMetadata?: {
    text: string;
    html: string;
    imageExposure?: 'items' | 'files' | 'both';
  },
  targetSelector = EDITOR_SELECTOR,
): Promise<void> {
  const result = await page.evaluate(({ editorSelector, eventType, name, base64, metadata }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    if (!editor) return { reason: 'missing-editor', defaultPrevented: false };

    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const file = new File([bytes], name, {
      type: 'image/png',
      lastModified: Date.now() - 10_000,
    });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    if (metadata) {
      dataTransfer.setData('text/plain', metadata.text);
      dataTransfer.setData('text/html', metadata.html);
    }
    dataTransfer.effectAllowed = 'copy';

    if (eventType === 'paste') {
      const event = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
      });
      const imageExposure = metadata?.imageExposure ?? 'files';
      const clipboardData = metadata
        ? {
            files: imageExposure === 'items' ? [] : [file],
            items: [
              ...(imageExposure === 'files'
                ? []
                : [{ kind: 'file', type: file.type, getAsFile: () => file }]),
              { kind: 'string', type: 'text/plain', getAsFile: () => null },
              { kind: 'string', type: 'text/html', getAsFile: () => null },
            ],
            types: ['Files', 'text/plain', 'text/html'],
            getData(type: string) {
              if (type === 'text/plain') return metadata.text;
              if (type === 'text/html') return metadata.html;
              return '';
            },
          }
        : dataTransfer;
      Object.defineProperty(event, 'clipboardData', { value: clipboardData });
      editor.dispatchEvent(event);
      return { reason: null, defaultPrevented: event.defaultPrevented };
    }

    const rect = editor.getBoundingClientRect();
    const clientX = rect.left + Math.min(48, rect.width / 2);
    const clientY = rect.bottom - Math.min(48, rect.height / 2);
    for (const dragType of ['dragenter', 'dragover'] as const) {
      editor.dispatchEvent(new DragEvent(dragType, {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        dataTransfer,
      }));
    }
    const event = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      clientX,
      clientY,
      dataTransfer,
    });
    editor.dispatchEvent(event);
    return { reason: null, defaultPrevented: event.defaultPrevented };
  }, {
    editorSelector: targetSelector,
    eventType: type,
    name: fileName,
    base64: TINY_PNG_BASE64,
    metadata: clipboardMetadata,
  });

  expect(result.reason).toBeNull();
  expect(result.defaultPrevented).toBe(true);
  await waitForEditorAnimationFrame(page);
}

async function dispatchHtmlImagePaste(
  page: Page,
  html: string,
  text: string,
): Promise<void> {
  const result = await page.evaluate(({ editorSelector, clipboardHtml, clipboardText }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    if (!editor) return { reason: 'missing-editor', defaultPrevented: false };

    const event = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(event, 'clipboardData', {
      value: {
        files: [],
        items: [
          { kind: 'string', type: 'text/plain', getAsFile: () => null },
          { kind: 'string', type: 'text/html', getAsFile: () => null },
        ],
        types: ['text/plain', 'text/html'],
        getData(type: string) {
          if (type === 'text/plain') return clipboardText;
          if (type === 'text/html') return clipboardHtml;
          return '';
        },
      },
    });
    editor.dispatchEvent(event);
    return { reason: null, defaultPrevented: event.defaultPrevented };
  }, {
    editorSelector: EDITOR_SELECTOR,
    clipboardHtml: html,
    clipboardText: text,
  });

  expect(result.reason).toBeNull();
  expect(result.defaultPrevented).toBe(true);
  await waitForEditorAnimationFrame(page);
}

async function expectTypedTextInOwnVisibleParagraph(page: Page, text: string): Promise<void> {
  const visibility = await page.evaluate(({ editorSelector, expectedText }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    const selection = window.getSelection();
    const anchorElement = selection?.anchorNode instanceof Element
      ? selection.anchorNode
      : selection?.anchorNode?.parentElement;
    const paragraph = anchorElement?.closest('p') ?? null;
    const walker = editor
      ? document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
      : null;
    let textNode: Text | null = null;
    while (walker?.nextNode()) {
      const candidate = walker.currentNode as Text;
      if (candidate.data.includes(expectedText)) {
        textNode = candidate;
        break;
      }
    }
    const range = textNode ? document.createRange() : null;
    const textStart = textNode?.data.indexOf(expectedText) ?? -1;
    if (range && textNode && textStart >= 0) {
      range.setStart(textNode, textStart);
      range.setEnd(textNode, textStart + expectedText.length);
    }
    const rect = range?.getBoundingClientRect();
    return {
      anchorInTypedParagraph: Boolean(paragraph?.contains(textNode)),
      paragraphHasImage: Boolean(paragraph?.querySelector('[data-type="image"], .image-block-container')),
      textHeight: rect?.height ?? 0,
      textWidth: rect?.width ?? 0,
    };
  }, { editorSelector: EDITOR_SELECTOR, expectedText: text });

  expect(visibility).toEqual({
    anchorInTypedParagraph: true,
    paragraphHasImage: false,
    textHeight: expect.any(Number),
    textWidth: expect.any(Number),
  });
  expect(visibility.textHeight).toBeGreaterThan(0);
  expect(visibility.textWidth).toBeGreaterThan(0);
}

test.describe('notes rich Markdown completeness', () => {
  test.setTimeout(180_000);

  test('renders and round-trips local images, tables, formulas, and Mermaid together', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-rich-markdown-completeness');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 900 });

      const fixture = await createNotesRootFilesFixture(page, {
        name: 'rich-markdown-completeness',
        files: [
          { filename: 'docs/complete.md', content: createCompletenessMarkdown() },
          { filename: 'docs/assets/本地 image.svg', content: createLocalSvg() },
          { filename: 'other.md', content: '# Other note' },
        ],
      });
      const notePath = fixture.notePaths[0]!;
      const otherNotePath = path.join(fixture.notesRootPath, 'other.md');

      await openAbsoluteNote(page, notePath);
      await expectRichMarkdownRendered(page);

      const focused = await page.evaluate(() => (window as any).__vlainaE2E.focusCurrentEditorAtEnd());
      expect(focused).toBe(true);
      await page.keyboard.type(' Persisted completeness edit.');
      await expect.poll(async () => page.evaluate(() =>
        String((window as any).__vlainaE2E.getNotesState().currentNote?.content ?? '')
      )).toContain('Persisted completeness edit.');

      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      const saved = await page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), notePath);
      expect(saved).toContain('本地%20image.svg');
      expect(saved).toContain('Table sentinel');
      expect(saved).toContain('a^2 + b^2 = c^2');
      expect(saved).toContain('flowchart TD');
      expect(saved).toContain('Persisted completeness edit.');

      await openAbsoluteNote(page, otherNotePath);
      await openAbsoluteNote(page, notePath);
      await expectRichMarkdownRendered(page);
      const reopened = await page.evaluate(() =>
        String((window as any).__vlainaE2E.getNotesState().currentNote?.content ?? '')
      );
      expect(reopened).toBe(saved);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('persists pasted and dropped image files beside a nested note', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-image-transfer-completeness');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const fixture = await createNotesRootFilesFixture(page, {
        name: 'image-transfer-completeness',
        files: [
          { filename: 'daily/upload.md', content: '# Image transfer\n\nTransfer tail.' },
          { filename: 'other.md', content: '# Other note' },
        ],
      });
      const notePath = fixture.notePaths[0]!;

      await page.evaluate(() => (window as any).__vlainaE2E.setUIPreferences({
        imageStorageMode: 'subfolder',
        imageSubfolderName: 'assets',
        imageFilenameFormat: 'original',
      }));
      await openAbsoluteNote(page, notePath);

      const companionUrl = 'https://example.test/apps/image-source';
      const companionText = `[${companionUrl.slice(0, -1)}](${companionUrl})\n\n\u200B${companionUrl}`;

      for (const [eventType, fileName] of [
        ['paste', 'pasted-note-image.png'],
        ['drop', 'dropped-note-image.png'],
      ] as const) {
        const focused = await page.evaluate(() => (window as any).__vlainaE2E.focusCurrentEditorAtEnd());
        expect(focused).toBe(true);
        await dispatchImageTransfer(
          page,
          eventType,
          fileName,
          eventType === 'paste'
            ? {
                text: companionText,
                html: `<a href="${companionUrl}"><img src="${companionUrl}/icon.png"></a>`,
              }
            : undefined,
        );

        const imageBlock = page.locator(`${NOTE_IMAGE_BLOCK_SELECTOR}[data-src="./assets/${fileName}"]`);
        await expectImageReady(imageBlock);
        await expect.poll(async () => page.evaluate((expectedName) =>
          String((window as any).__vlainaE2E.getNotesState().currentNote?.content ?? '').includes(expectedName),
        fileName)).toBe(true);
        expect(await page.evaluate(() =>
          String((window as any).__vlainaE2E.getNotesState().currentNote?.content ?? ''),
        )).not.toContain(companionUrl);

        const storedBytes = await fs.readFile(path.join(path.dirname(notePath), 'assets', fileName));
        expect(storedBytes.byteLength).toBeGreaterThan(0);
      }
      await expect(page.locator(NOTE_IMAGE_BLOCK_SELECTOR)).toHaveCount(2);

      const clipboardImageUrl = 'https://images.example.test/copied.png';
      const nativeClipboardAudit = await app.evaluate(({ clipboard, nativeImage }, { html, text }) => {
        const image = nativeImage.createFromBitmap(Buffer.from([32, 96, 160, 255]), {
          width: 1,
          height: 1,
          scaleFactor: 1,
        });
        clipboard.write({
          image,
          text,
          html,
        });
        const clipboardImage = clipboard.readImage();
        return {
          sourceEmpty: image.isEmpty(),
          clipboardEmpty: clipboardImage.isEmpty(),
        };
      }, {
        text: companionText,
        html: `<a href="${companionUrl}"><img src="${clipboardImageUrl}"></a>`,
      });
      expect(nativeClipboardAudit).toMatchObject({
        sourceEmpty: false,
        clipboardEmpty: false,
      });
      expect(await page.evaluate(() => (window as any).__vlainaE2E.focusCurrentEditorAtEnd())).toBe(true);
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
      await expect(page.locator(NOTE_IMAGE_BLOCK_SELECTOR)).toHaveCount(3);
      const nativeTypedText = 'Native clipboard immediate typing sentinel';
      await page.keyboard.type(nativeTypedText);
      await expect.poll(async () => page.evaluate((expectedText) =>
        String((window as any).__vlainaE2E.getNotesState().currentNote?.content ?? '').includes(expectedText),
      nativeTypedText)).toBe(true);
      await expectTypedTextInOwnVisibleParagraph(page, nativeTypedText);
      expect(await page.evaluate(() =>
        String((window as any).__vlainaE2E.getNotesState().currentNote?.content ?? ''),
      )).not.toContain(companionUrl);

      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      const saved = await page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), notePath);
      expect(saved).toContain('./assets/pasted-note-image.png');
      expect(saved).toContain('./assets/dropped-note-image.png');
      expect(saved.match(/\.\/assets\/pasted-note-image\.png/g)).toHaveLength(1);
      expect(saved).not.toContain(companionUrl);
      expect(saved).not.toContain('\u200B');
      const nativeTextLineIndex = saved.split('\n').indexOf(nativeTypedText);
      expect(nativeTextLineIndex).toBeGreaterThanOrEqual(2);
      expect(saved.split('\n')[nativeTextLineIndex - 1]).toBe('');
      expect(saved.split('\n')[nativeTextLineIndex - 2]).toContain('./assets/');

      await openAbsoluteNote(page, path.join(fixture.notesRootPath, 'other.md'));
      await openAbsoluteNote(page, notePath);
      await expectImageReady(
        page.locator(`${NOTE_IMAGE_BLOCK_SELECTOR}[data-src="./assets/pasted-note-image.png"]`),
      );
      await expectImageReady(
        page.locator(`${NOTE_IMAGE_BLOCK_SELECTOR}[data-src="./assets/dropped-note-image.png"]`),
      );
      const reopened = await page.evaluate(() =>
        String((window as any).__vlainaE2E.getNotesState().currentNote?.content ?? ''),
      );
      expect(reopened.match(/\.\/assets\/pasted-note-image\.png/g)).toHaveLength(1);
      expect(reopened).not.toContain(companionUrl);
      expect(reopened).not.toContain('\u200B');
      await expect(page.locator(NOTE_IMAGE_BLOCK_SELECTOR)).toHaveCount(3);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('round-trips source-mode image paste without duplicate or companion content', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-source-image-transfer');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const initial = '# Source image transfer\n\nbefore SOURCE_SLOT after';
      const fixture = await createNotesRootFilesFixture(page, {
        name: 'source-image-transfer',
        files: [
          { filename: 'daily/source.md', content: initial },
          { filename: 'other.md', content: '# Other note' },
        ],
      });
      const notePath = fixture.notePaths[0]!;
      const otherNotePath = path.join(fixture.notesRootPath, 'other.md');

      await page.evaluate(() => (window as any).__vlainaE2E.setUIPreferences({
        imageStorageMode: 'subfolder',
        imageSubfolderName: 'assets',
        imageFilenameFormat: 'original',
      }));
      await openAbsoluteNote(page, notePath);
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+/' : 'Control+/');
      const sourceEditor = page.locator(NOTE_SOURCE_EDITOR_SELECTOR);
      await expect(sourceEditor).toBeVisible();
      await sourceEditor.evaluate((textarea: HTMLTextAreaElement) => {
        const selectionStart = textarea.value.indexOf('SOURCE_SLOT');
        textarea.focus();
        textarea.setSelectionRange(selectionStart, selectionStart + 'SOURCE_SLOT'.length);
      });

      const companionUrl = 'https://example.test/apps/source-image';
      const companionText = `[${companionUrl.slice(0, -1)}](${companionUrl})\n\n\u200B${companionUrl}`;
      await dispatchImageTransfer(page, 'paste', 'source-pasted.png', {
        text: companionText,
        html: `<a href="${companionUrl}"><img src="https://images.example.test/source.png"></a>`,
        imageExposure: 'items',
      }, NOTE_SOURCE_EDITOR_SELECTOR);

      const firstReference = '![source-pasted](<./assets/source-pasted.png>)';
      const afterSyntheticPaste = initial.replace('SOURCE_SLOT', firstReference);
      await expect(sourceEditor).toHaveValue(afterSyntheticPaste);
      const syntheticBytes = await fs.readFile(
        path.join(path.dirname(notePath), 'assets', 'source-pasted.png'),
      );
      expect(syntheticBytes).toEqual(Buffer.from(TINY_PNG_BASE64, 'base64'));

      const nativeSourceClipboardAudit = await app.evaluate(({ clipboard, nativeImage }, { html, text }) => {
        const image = nativeImage.createFromBitmap(Buffer.from([160, 96, 32, 255]), {
          width: 1,
          height: 1,
          scaleFactor: 1,
        });
        clipboard.write({
          image,
          text,
          html,
        });
        const clipboardImage = clipboard.readImage();
        return {
          sourceEmpty: image.isEmpty(),
          clipboardEmpty: clipboardImage.isEmpty(),
        };
      }, {
        text: companionText,
        html: `<a href="${companionUrl}"><img src="https://images.example.test/system.png"></a>`,
      });
      expect(nativeSourceClipboardAudit).toMatchObject({
        sourceEmpty: false,
        clipboardEmpty: false,
      });
      await sourceEditor.evaluate((textarea: HTMLTextAreaElement) => {
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      });
      await page.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
      await expect.poll(async () => {
        const value = await sourceEditor.inputValue();
        return {
          count: value.match(/!\[[^\]]*\]\(<\.\/assets\/[^>]+>\)/g)?.length ?? 0,
          value,
        };
      }).toMatchObject({ count: 2 });

      const sourceValue = await sourceEditor.inputValue();
      const references = sourceValue.match(/!\[[^\]]*\]\(<\.\/assets\/[^>]+>\)/g) ?? [];
      expect(references).toHaveLength(2);
      expect(references.filter((reference) => reference === firstReference)).toHaveLength(1);
      expect(sourceValue).toBe(afterSyntheticPaste + references[1]);
      expect(sourceValue).not.toContain(companionUrl);
      expect(sourceValue).not.toContain('\u200B');

      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      const saved = await page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), notePath);
      expect(saved).toBe(sourceValue);
      const stateContent = await page.evaluate(() =>
        String((window as any).__vlainaE2E.getNotesState().currentNote?.content ?? ''));
      expect(stateContent).toBe(saved);

      const systemRelativePath = references[1]!.match(/<(.+)>/)?.[1];
      expect(systemRelativePath).toMatch(/^\.\/assets\/[^/]+\.png$/);
      const systemBytes = await fs.readFile(
        path.join(path.dirname(notePath), systemRelativePath!.replace(/^\.\//, '')),
      );
      expect(systemBytes.byteLength).toBeGreaterThan(0);

      await page.evaluate((pathToOpen) =>
        (window as any).__vlainaE2E.openAbsoluteNote(pathToOpen), otherNotePath);
      await expect.poll(async () => page.evaluate(() =>
        (window as any).__vlainaE2E.getNotesState().currentNote?.path ?? null,
      )).toBe(otherNotePath);
      await expect(page.locator(NOTE_SOURCE_EDITOR_SELECTOR)).toHaveValue('# Other note');

      await page.evaluate((pathToOpen) =>
        (window as any).__vlainaE2E.openAbsoluteNote(pathToOpen), notePath);
      await expect.poll(async () => page.evaluate(() =>
        (window as any).__vlainaE2E.getNotesState().currentNote?.path ?? null,
      )).toBe(notePath);
      await expect(page.locator(NOTE_SOURCE_EDITOR_SELECTOR)).toHaveValue(saved);
      expect(await page.evaluate(() =>
        String((window as any).__vlainaE2E.getNotesState().currentNote?.content ?? ''),
      )).toBe(saved);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps immediate typing visible in a paragraph after a pasted image', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-image-paste-immediate-typing');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const fixture = await createNotesRootFilesFixture(page, {
        name: 'image-paste-immediate-typing',
        files: [
          { filename: 'immediate.md', content: '# Immediate typing\n\nBefore image.' },
          { filename: 'other.md', content: '# Other note' },
        ],
      });
      const notePath = fixture.notePaths[0]!;
      const typedText = 'Immediate typing sentinel 2323432423432';

      await page.evaluate(() => (window as any).__vlainaE2E.setUIPreferences({
        imageStorageMode: 'subfolder',
        imageSubfolderName: 'assets',
        imageFilenameFormat: 'original',
      }));
      await openAbsoluteNote(page, notePath);
      expect(await page.evaluate(() => (window as any).__vlainaE2E.focusCurrentEditorAtEnd())).toBe(true);
      await page.keyboard.press('Enter');
      await dispatchImageTransfer(page, 'paste', 'immediate.png');
      await expectImageReady(
        page.locator(`${NOTE_IMAGE_BLOCK_SELECTOR}[data-src="./assets/immediate.png"]`),
      );

      await page.keyboard.type(typedText);
      await expect.poll(async () => page.evaluate(() =>
        String((window as any).__vlainaE2E.getNotesState().currentNote?.content ?? ''),
      )).toContain(typedText);
      await expectTypedTextInOwnVisibleParagraph(page, typedText);

      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      const saved = await page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), notePath);
      const savedLines = saved.split('\n');
      const imageLineIndex = savedLines.findIndex((line) => line.includes('src="./assets/immediate.png"'));
      expect(imageLineIndex).toBeGreaterThanOrEqual(0);
      expect(savedLines.slice(imageLineIndex, imageLineIndex + 3)).toEqual([
        expect.stringMatching(/^<img\b[^>]*\bsrc="\.\/assets\/immediate\.png"[^>]*\/>$/),
        '',
        typedText,
      ]);

      await openAbsoluteNote(page, path.join(fixture.notesRootPath, 'other.md'));
      await openAbsoluteNote(page, notePath);
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: typedText })).toBeVisible();
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps immediate typing separate from an HTML-only pasted image', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-html-image-paste-immediate-typing');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      const fixture = await createNotesRootFilesFixture(page, {
        name: 'html-image-paste-immediate-typing',
        files: [
          { filename: 'immediate.md', content: '# HTML image typing\n\nBefore image.' },
          { filename: 'other.md', content: '# Other note' },
        ],
      });
      const notePath = fixture.notePaths[0]!;
      const imageUrl = 'https://images.example.test/remote-paste.png';
      const companionUrl = 'https://example.test/remote-paste';
      const typedText = 'HTML image immediate typing sentinel';

      await openAbsoluteNote(page, notePath);
      expect(await page.evaluate(() => (window as any).__vlainaE2E.focusCurrentEditorAtEnd())).toBe(true);
      await page.keyboard.press('Enter');
      await dispatchHtmlImagePaste(
        page,
        `<a href="${companionUrl}"><img src="${imageUrl}" alt="Remote paste"></a>`,
        companionUrl,
      );

      const imageBlock = page.locator(`${NOTE_IMAGE_BLOCK_SELECTOR}[data-src="${imageUrl}"]`);
      await expect(imageBlock).toHaveCount(1);
      await page.keyboard.type(typedText);
      await expectTypedTextInOwnVisibleParagraph(page, typedText);

      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      const saved = await page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), notePath);
      const savedLines = saved.split('\n');
      const imageLineIndex = savedLines.findIndex((line) => line.includes(imageUrl));
      expect(saved.match(new RegExp(imageUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(1);
      expect(saved).not.toContain(companionUrl);
      expect(savedLines.slice(imageLineIndex, imageLineIndex + 3)).toEqual([
        expect.stringMatching(/^<img\b[^>]*\bsrc="https:\/\/images\.example\.test\/remote-paste\.png"[^>]*\/>$/),
        '',
        typedText,
      ]);

      await openAbsoluteNote(page, path.join(fixture.notesRootPath, 'other.md'));
      await openAbsoluteNote(page, notePath);
      await expect(page.locator(`${NOTE_IMAGE_BLOCK_SELECTOR}[data-src="${imageUrl}"]`)).toHaveCount(1);
      await expect(page.locator(`${EDITOR_SELECTOR} p`, { hasText: typedText })).toBeVisible();
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
