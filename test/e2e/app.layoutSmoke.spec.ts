import { expect, test, type Page } from '@playwright/test';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  CHAT_COMPOSER_TEXTAREA_SELECTOR,
  CHAT_SCROLLABLE_SELECTOR,
  CHAT_SESSION_ROW_SELECTOR,
  CHAT_VIEW_SELECTOR,
  EDITOR_SELECTOR,
  FILE_TREE_FILE_SELECTOR,
  NOTES_SIDEBAR_SCROLL_ROOT_SELECTOR,
  NOTES_VIEW_SELECTOR,
  cleanupIsolatedElectron,
  collectLayoutSmokeMetrics,
  createChatFixture,
  createNotesRootFilesFixture,
  getOpenBridgePages,
  installReferenceTyporaTheme,
  launchIsolatedElectron,
  openAbsoluteNote,
  openNotesRootInNotes,
  setAppViewMode,
  waitForChatSession,
} from './notesE2E';

const LONG_LAYOUT_TOKEN = 'abcdef0123456789'.repeat(40);
const LONG_LAYOUT_INLINE_URL = `https://example.com/${LONG_LAYOUT_TOKEN}.webp`;
const LONG_LAYOUT_TAG = `layout-${'a'.repeat(118)}`;

async function expectNotesUnbrokenTextContained(page: Page) {
  const metrics = await page.evaluate(({ inlineUrl, tag }) => {
    const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror[contenteditable="true"]');
    const inlineCode = Array.from(editor?.querySelectorAll<HTMLElement>('code') ?? [])
      .find((element) => element.textContent === inlineUrl) ?? null;
    const tagToken = Array.from(editor?.querySelectorAll<HTMLElement>('.editor-tag-token') ?? [])
      .find((element) => element.textContent?.includes(tag)) ?? null;
    const editorRect = editor?.getBoundingClientRect() ?? null;
    const rightOverflow = (element: HTMLElement | null) => {
      if (!element || !editorRect) return 0;
      return Math.max(
        0,
        ...Array.from(element.getClientRects(), (rect) => rect.right - editorRect.right),
      );
    };

    return {
      hasEditor: Boolean(editor),
      hasInlineCode: Boolean(inlineCode),
      hasTagToken: Boolean(tagToken),
      inlineCodeRightOverflowPx: rightOverflow(inlineCode),
      tagRightOverflowPx: rightOverflow(tagToken),
    };
  }, { inlineUrl: LONG_LAYOUT_INLINE_URL, tag: LONG_LAYOUT_TAG });

  expect(metrics.hasEditor).toBe(true);
  expect(metrics.hasInlineCode).toBe(true);
  expect(metrics.hasTagToken).toBe(true);
  expect(metrics.inlineCodeRightOverflowPx).toBeLessThanOrEqual(2);
  expect(metrics.tagRightOverflowPx).toBeLessThanOrEqual(2);
}

async function expectOverlayScrollbarDraggable(page: Page, viewportSelector: string) {
  const viewport = page.locator(`${viewportSelector}:visible`).first();
  const initialMetrics = await viewport.evaluate((element) => ({
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(initialMetrics.scrollHeight).toBeGreaterThan(initialMetrics.clientHeight);

  await viewport.hover();
  const thumb = viewport
    .locator('xpath=following-sibling::*[@data-overlay-scrollbar-rail="true"]//*[@data-overlay-scrollbar-thumb="true"]')
    .first();
  await expect(thumb).toBeAttached();

  const box = await thumb.boundingBox();
  expect(box).not.toBeNull();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + Math.min(box!.height - 2, Math.max(2, box!.height / 2));

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 120, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(initialMetrics.scrollTop);
}

test.describe('app layout smoke', () => {
  test.setTimeout(120_000);

  test('keeps the Notes body geometry stable when returning from other views', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-return-focus-geometry');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await setAppViewMode(page, 'notes');
      const fixture = await createNotesRootFilesFixture(page, {
        name: 'notes-return-focus-geometry',
        files: [{
          filename: 'return-focus-geometry-with-a-long-wrapped-title-that-stays-stable-across-every-view.md',
          content: [
            '---',
            'vlaina_cover: "./assets/cover.png" x=50 y=50 height=180 scale=1',
            '---',
            '',
            'First line focus target',
            '',
            'Second paragraph geometry sentinel.',
            '',
            ...Array.from({ length: 30 }, (_, index) => `Body line ${index + 1}.`),
          ].join('\n'),
        }],
      });
      const notePath = fixture.notePaths[0];
      if (!notePath) {
        throw new Error('Missing Notes return geometry fixture path');
      }
      const coverAssetPath = path.join(path.dirname(notePath), 'assets', 'cover.png');
      await fs.mkdir(path.dirname(coverAssetPath), { recursive: true });
      await fs.writeFile(coverAssetPath, Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
        'base64',
      ));
      await openAbsoluteNote(page, notePath);
      const cover = page.locator('[data-note-cover-region="true"]');
      await expect(cover).toBeVisible({ timeout: 10_000 });
      await expect(cover.locator('img[src]').first()).toBeVisible({ timeout: 10_000 });

      const baseline = await page.evaluate(() => {
        const scrollRoot = document.querySelector<HTMLElement>('[data-note-scroll-root="true"]');
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        const firstBlock = editor?.firstElementChild?.getBoundingClientRect();
        const title = document.querySelector<HTMLElement>('[data-note-title-input="true"]');
        const coverRegion = document.querySelector<HTMLElement>('[data-note-cover-region="true"]');
        return {
          scrollTop: scrollRoot?.scrollTop ?? null,
          firstBlockTop: firstBlock?.top ?? null,
          titleHeight: title?.getBoundingClientRect().height ?? null,
          coverHeight: coverRegion?.getBoundingClientRect().height ?? null,
        };
      });

      await expect(page.locator(EDITOR_SELECTOR)).toBeFocused();
      expect(baseline.titleHeight).toBeGreaterThan(44);
      for (const awayView of ['chat', 'graph', 'whiteboard'] as const) {
        await page.evaluate((mode) => (window as any).__vlainaE2E.setAppViewMode(mode), awayView);
        const awayViewSelector = awayView === 'chat'
          ? '[data-chat-view-mode="full"]'
          : awayView === 'graph'
            ? '[data-graph-view-mode="true"]'
            : '[data-whiteboard-active="true"]';
        await expect(page.locator(awayViewSelector)).toBeVisible({ timeout: 30_000 });

        const frames = await page.evaluate(async () => new Promise<Array<{
          scrollTop: number | null;
          firstBlockTop: number | null;
          titleHeight: number | null;
          coverHeight: number | null;
          hasCoverImage: boolean;
        }>>((resolve) => {
          const samples: Array<{
            scrollTop: number | null;
            firstBlockTop: number | null;
            titleHeight: number | null;
            coverHeight: number | null;
            hasCoverImage: boolean;
          }> = [];
          (window as any).__vlainaE2E.setAppViewMode('notes');

          const sample = () => {
            const scrollRoot = document.querySelector<HTMLElement>('[data-note-scroll-root="true"]');
            const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
            const firstBlock = editor?.firstElementChild?.getBoundingClientRect();
            const title = document.querySelector<HTMLElement>('[data-note-title-input="true"]');
            const coverRegion = document.querySelector<HTMLElement>('[data-note-cover-region="true"]');
            samples.push({
              scrollTop: scrollRoot?.scrollTop ?? null,
              firstBlockTop: firstBlock?.top ?? null,
              titleHeight: title?.getBoundingClientRect().height ?? null,
              coverHeight: coverRegion?.getBoundingClientRect().height ?? null,
              hasCoverImage: Boolean(coverRegion?.querySelector('img[src]')),
            });
            if (samples.length >= 6) {
              resolve(samples);
              return;
            }
            requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        }));

        expect(frames, awayView).toHaveLength(6);
        expect(frames.every((frame) => frame.scrollTop === baseline.scrollTop), awayView).toBe(true);
        expect(frames.every((frame) => (
          frame.firstBlockTop !== null &&
          baseline.firstBlockTop !== null &&
          Math.abs(frame.firstBlockTop - baseline.firstBlockTop) <= 0.1
        )), awayView).toBe(true);
        expect(frames.every((frame) => (
          frame.titleHeight !== null &&
          baseline.titleHeight !== null &&
          Math.abs(frame.titleHeight - baseline.titleHeight) <= 0.1
        )), awayView).toBe(true);
        expect(frames.every((frame) => (
          frame.coverHeight !== null &&
          baseline.coverHeight !== null &&
          Math.abs(frame.coverHeight - baseline.coverHeight) <= 0.1
        )), awayView).toBe(true);
        expect(frames.every((frame) => frame.hasCoverImage), awayView).toBe(true);
        await expect(page.locator(EDITOR_SELECTOR), awayView).toBeFocused();
        const selection = await page.evaluate(() => ({
          offset: window.getSelection()?.anchorOffset ?? null,
          text: window.getSelection()?.anchorNode?.textContent ?? null,
        }));
        expect(selection, awayView).toEqual({
          offset: 'First line focus target'.length,
          text: 'First line focus target',
        });
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps a multiline Chat composer height stable when returning from Notes', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('chat-composer-view-switch-stability');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await createChatFixture(page, {
        sessions: [{
          title: 'Composer Stability',
          messages: [{ role: 'user', content: 'Composer stability fixture.' }],
        }],
      });
      await setAppViewMode(page, 'chat');

      const textarea = page.locator(CHAT_COMPOSER_TEXTAREA_SELECTOR);
      await textarea.fill(['one', 'two', 'three', 'four', 'five', 'six'].join('\n'));
      const stableHeight = await expect.poll(async () => textarea.evaluate((element) =>
        element.getBoundingClientRect().height
      )).toBeGreaterThan(80).then(() => textarea.evaluate((element) =>
        element.getBoundingClientRect().height
      ));

      await setAppViewMode(page, 'notes');
      const samples = await page.evaluate(async () => new Promise<number[]>((resolve) => {
        const heights: number[] = [];
        (window as any).__vlainaE2E.setAppViewMode('chat');

        const sample = () => {
          const textarea = document.querySelector<HTMLTextAreaElement>('[data-chat-input="true"] textarea');
          const height = textarea?.getBoundingClientRect().height ?? 0;
          if (height > 0) {
            heights.push(height);
          }
          if (heights.length >= 6) {
            resolve(heights);
            return;
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }));

      expect(samples).toHaveLength(6);
      expect(samples.every((height) => Math.abs(height - stableHeight) <= 1)).toBe(true);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('restores Chat message geometry before paint after resizing while hidden', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('chat-hidden-resize-stability');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 900, height: 720 });
      const chatFixture = await createChatFixture(page, {
        sessions: [{
          title: 'Hidden Resize Stability',
          messages: Array.from({ length: 8 }, (_, index) => ({
            role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
            content: `Message ${index + 1}: ${'width-sensitive content '.repeat(24)}`,
          })),
        }],
      });
      await setAppViewMode(page, 'chat');
      await waitForChatSession(page, {
        sessionId: chatFixture.sessionIds[0]!,
        minMessageCount: 8,
        sentinelText: 'Message 8:',
      });

      const scrollable = page.locator(CHAT_SCROLLABLE_SELECTOR);
      await scrollable.evaluate((element) => {
        element.scrollTop = 0;
      });
      await expect.poll(() => page.locator('[data-message-index="1"]').evaluate((element) =>
        element.getBoundingClientRect().top
      )).toBeGreaterThan(100);
      const narrowSecondMessageTop = await page.locator('[data-message-index="1"]').evaluate((element) =>
        element.getBoundingClientRect().top
      );

      await page.setViewportSize({ width: 1280, height: 720 });
      await expect.poll(() => page.locator('[data-message-index="1"]').evaluate((element) =>
        element.getBoundingClientRect().top
      )).not.toBe(narrowSecondMessageTop);

      await setAppViewMode(page, 'notes');
      await page.setViewportSize({ width: 900, height: 720 });
      const samples = await page.evaluate(async () => new Promise<Array<{
        scrollTop: number;
        secondMessageTop: number;
        viewportWidth: number;
      }>>((resolve) => {
        const frames: Array<{
          scrollTop: number;
          secondMessageTop: number;
          viewportWidth: number;
        }> = [];
        (window as any).__vlainaE2E.setAppViewMode('chat');

        const sample = () => {
          const viewport = document.querySelector<HTMLElement>('[data-chat-scrollable="true"]');
          const secondMessage = document.querySelector<HTMLElement>('[data-message-index="1"]');
          if (viewport && secondMessage && viewport.getBoundingClientRect().width > 0) {
            frames.push({
              scrollTop: viewport.scrollTop,
              secondMessageTop: secondMessage.getBoundingClientRect().top,
              viewportWidth: viewport.getBoundingClientRect().width,
            });
          }
          if (frames.length >= 6) {
            resolve(frames);
            return;
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }));

      expect(samples).toHaveLength(6);
      expect(samples.every((sample) => Math.abs(sample.secondMessageTop - narrowSecondMessageTop) <= 1)).toBe(true);
      expect(samples.every((sample) => sample.scrollTop === 0)).toBe(true);
      expect(samples.every((sample) => sample.viewportWidth === samples[0]!.viewportWidth)).toBe(true);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps Notes and Chat primary surfaces visible without document overflow', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('app-layout-smoke');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      const notesFixture = await createNotesRootFilesFixture(page, {
        name: 'layout-smoke',
        files: [
          {
            filename: 'layout-smoke.md',
            content: [
              '# Layout Smoke Note',
              '',
              'Layout smoke sentinel paragraph.',
              '',
              `Inline URL: \`${LONG_LAYOUT_INLINE_URL}\`.`,
              '',
              `Long tag: #${LONG_LAYOUT_TAG}.`,
              '',
              '| Surface | Expected |',
              '| --- | --- |',
              '| Sidebar | Visible |',
              '| Editor | Visible |',
              '',
              '```ts',
              'const layoutSmoke = true;',
              '```',
              '',
            ].join('\n'),
          },
          ...Array.from({ length: 34 }, (_, index) => ({
            filename: `sidebar-scroll-${String(index + 1).padStart(2, '0')}.md`,
            content: `# Sidebar Scroll ${index + 1}\n\nSidebar scroll fixture.`,
          })),
        ],
      });
      const chatFixture = await createChatFixture(page, {
        sessions: [
          {
            title: 'E2E Layout Chat',
            messages: [
              { role: 'user', content: 'Layout smoke user prompt.' },
              {
                role: 'assistant',
                content: [
                  'LAYOUT_CHAT_SENTINEL with **markdown** and a small table.',
                  '',
                  '| A | B |',
                  '| --- | --- |',
                  '| 1 | 2 |',
                  '',
                  ...Array.from({ length: 36 }, (_, index) =>
                    `Chat scroll paragraph ${index + 1}: enough content to make the custom scrollbar draggable under imported Typora backgrounds.`
                  ),
                ].join('\n\n'),
              },
            ],
          },
          ...Array.from({ length: 34 }, (_, index) => ({
            title: `E2E Sidebar Chat ${String(index + 1).padStart(2, '0')}`,
            messages: [
              {
                role: 'user' as const,
                content: `Sidebar chat fixture ${index + 1}.`,
              },
            ],
          })),
        ],
      });

      await openNotesRootInNotes(page, {
        notesRootPath: notesFixture.notesRootPath,
        name: 'Layout Smoke NotesRoot',
        minFileCount: 1,
      });
      await page.locator(FILE_TREE_FILE_SELECTOR, { hasText: 'layout-smoke' }).first().click();
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Layout smoke sentinel paragraph', {
        timeout: 30_000,
      });
      await expectNotesUnbrokenTextContained(page);
      await expect(page.locator('[data-sidebar-surface="true"]').first()).toHaveCSS(
        'background-color',
        'rgba(0, 0, 0, 0)',
      );
      const importedTheme = await installReferenceTyporaTheme(page, 'phycat-sky.css');
      let shellPaperBackground: {
        backgroundImage: string;
        importedLayer: string;
      } | null = null;
      const notesBackground = await page.locator('[data-note-toolbar-root="true"]').evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          rootTheme: document.documentElement.getAttribute('data-vlaina-imported-app-theme'),
          background: style.background,
          backgroundImage: style.backgroundImage,
          importedLayer: style.getPropertyValue('--vlaina-imported-app-background-layer').trim(),
        };
      });
      if (importedTheme.skipped) {
        console.info('[layout-smoke-imported-theme-skipped]', importedTheme);
        expect(notesBackground.rootTheme).toBeNull();
      } else {
        expect(notesBackground.rootTheme).toBe(importedTheme.themeId);
        expect(await page.locator('html').getAttribute('data-vlaina-imported-app-theme-platform')).toBe('typora');
        expect(notesBackground.importedLayer).not.toBe('');
        shellPaperBackground = await page.locator('[data-app-shell-root="true"]').evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            backgroundImage: style.backgroundImage,
            importedLayer: style.getPropertyValue('--vlaina-imported-app-background-layer').trim(),
          };
        });
        expect(shellPaperBackground.importedLayer).toBe(notesBackground.importedLayer);
        expect(shellPaperBackground.backgroundImage).toBe(notesBackground.backgroundImage);
        const notesScrollBackground = await page.locator('[data-note-scroll-root="true"]').evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            background: style.background,
            backgroundImage: style.backgroundImage,
            importedLayer: style.getPropertyValue('--vlaina-imported-app-background-layer').trim(),
          };
        });
        expect(notesScrollBackground.importedLayer).toBe(notesBackground.importedLayer);
        expect(notesScrollBackground.backgroundImage).toBe(notesBackground.backgroundImage);
      }
      await expect(page.locator('[data-sidebar-surface="true"]').first()).toHaveCSS(
        'background-color',
        importedTheme.skipped ? 'rgba(0, 0, 0, 0)' : 'rgba(206, 230, 250, 0.17)',
      );
      if (!importedTheme.skipped) {
        const notesEditorSurfaceBackgrounds = await page.locator(
          '.milkdown-editor[data-markdown-compat-layer="external"]'
        ).evaluate((element) => {
          const editor = element as HTMLElement;
          const milkdown = editor.querySelector<HTMLElement>('.milkdown');
          const proseMirror = editor.querySelector<HTMLElement>('.ProseMirror');
          const editorStyle = getComputedStyle(editor);
          return {
            editorBackgroundColor: editorStyle.backgroundColor,
            editorBackgroundImage: editorStyle.backgroundImage,
            typoraDocumentImage: editorStyle.getPropertyValue('--d-bi').trim(),
            milkdown: milkdown ? getComputedStyle(milkdown).backgroundColor : null,
            proseMirror: proseMirror ? getComputedStyle(proseMirror).backgroundColor : null,
          };
        });
        expect(notesEditorSurfaceBackgrounds).toMatchObject({
          editorBackgroundColor: 'rgb(255, 255, 255)',
          milkdown: 'rgba(0, 0, 0, 0)',
          proseMirror: 'rgba(0, 0, 0, 0)',
        });
        expect(notesEditorSurfaceBackgrounds.typoraDocumentImage).toBe('');
        expect(notesEditorSurfaceBackgrounds.editorBackgroundImage).toBe('none');
      }

      let notesLayout = await collectLayoutSmokeMetrics(page);
      console.info('[layout-smoke-notes-desktop]', notesLayout);
      expect(notesLayout.hasHorizontalDocumentOverflow).toBe(false);
      await expectNotesUnbrokenTextContained(page);
      await expect(page.locator(NOTES_VIEW_SELECTOR)).toBeVisible();
      await expect(page.locator(NOTES_SIDEBAR_SCROLL_ROOT_SELECTOR).first()).toBeVisible();
      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible();
      await expectOverlayScrollbarDraggable(page, '[data-note-scroll-root="true"]');
      await expectOverlayScrollbarDraggable(page, NOTES_SIDEBAR_SCROLL_ROOT_SELECTOR);

      await page.setViewportSize({ width: 900, height: 720 });
      notesLayout = await collectLayoutSmokeMetrics(page);
      console.info('[layout-smoke-notes-narrow]', notesLayout);
      expect(notesLayout.hasHorizontalDocumentOverflow).toBe(false);
      await expectNotesUnbrokenTextContained(page);
      await expect(page.locator(NOTES_VIEW_SELECTOR)).toBeVisible();
      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible();

      await setAppViewMode(page, 'chat');
      await waitForChatSession(page, {
        sessionId: chatFixture.sessionIds[0]!,
        minMessageCount: 2,
        sentinelText: 'LAYOUT_CHAT_SENTINEL',
      });
      await expect(page.locator(CHAT_SESSION_ROW_SELECTOR, { hasText: 'E2E Layout Chat' })).toBeVisible();
      await expect(page.locator(CHAT_SCROLLABLE_SELECTOR)).toBeVisible();
      await expect(page.locator(CHAT_COMPOSER_TEXTAREA_SELECTOR)).toBeVisible();
      const chatBackground = await page.locator(CHAT_VIEW_SELECTOR).evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          rootTheme: document.documentElement.getAttribute('data-vlaina-imported-app-theme'),
          background: style.background,
          backgroundImage: style.backgroundImage,
          documentBackgroundImage: style.getPropertyValue('--vlaina-imported-app-document-background-image').trim(),
          importedLayer: style.getPropertyValue('--vlaina-imported-app-background-layer').trim(),
        };
      });
      if (importedTheme.skipped) {
        expect(chatBackground.rootTheme).toBeNull();
      } else {
        expect(chatBackground.rootTheme).toBe(importedTheme.themeId);
        expect(chatBackground.importedLayer).toBe(notesBackground.importedLayer);
        expect(chatBackground.documentBackgroundImage).toBe('');
        expect(chatBackground.backgroundImage).toBe('none');
        const chatContentBackground = await page.locator(CHAT_SCROLLABLE_SELECTOR).evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            backgroundColor: style.backgroundColor,
            backgroundImage: style.backgroundImage,
            documentBackgroundImage: style.getPropertyValue('--vlaina-imported-app-document-background-image').trim(),
          };
        });
        expect(chatContentBackground.backgroundColor).toBe('rgb(255, 255, 255)');
        expect(chatContentBackground.documentBackgroundImage).toBe('');
        expect(chatContentBackground.backgroundImage).toBe('none');
        const shellPaperBackgroundInChat = await page.locator('[data-app-shell-root="true"]').evaluate((element) => {
          const style = getComputedStyle(element);
          return {
            backgroundImage: style.backgroundImage,
            importedLayer: style.getPropertyValue('--vlaina-imported-app-background-layer').trim(),
          };
        });
        expect(shellPaperBackgroundInChat).toEqual(shellPaperBackground);
      }

      let chatLayout = await collectLayoutSmokeMetrics(page);
      console.info('[layout-smoke-chat-narrow]', chatLayout);
      expect(chatLayout.hasHorizontalDocumentOverflow).toBe(false);
      await expect(page.locator(CHAT_VIEW_SELECTOR)).toBeVisible();
      await expectOverlayScrollbarDraggable(page, CHAT_SCROLLABLE_SELECTOR);
      await expectOverlayScrollbarDraggable(page, '[data-sidebar-scroll-root="true"]');

      await page.setViewportSize({ width: 1280, height: 860 });
      chatLayout = await collectLayoutSmokeMetrics(page);
      console.info('[layout-smoke-chat-desktop]', chatLayout);
      expect(chatLayout.hasHorizontalDocumentOverflow).toBe(false);
      await expect(page.locator(CHAT_VIEW_SELECTOR)).toBeVisible();

      await setAppViewMode(page, 'notes');
      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Layout smoke sentinel paragraph');
      const finalNotesLayout = await collectLayoutSmokeMetrics(page);
      console.info('[layout-smoke-notes-return]', finalNotesLayout);
      expect(finalNotesLayout.hasHorizontalDocumentOverflow).toBe(false);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
