import { expect, test, type Page } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  NOTE_IMAGE_BLOCK_SELECTOR,
  NOTE_SCROLL_ROOT_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
} from './notesE2E';

function createViewportPreloadMarkdown(): string {
  return [
    '# Mermaid viewport preload',
    '',
    ...Array.from(
      { length: 140 },
      (_, index) => `Spacing paragraph ${index + 1}. ${'Context '.repeat(12)}`,
    ),
    '',
    ...Array.from({ length: 4 }, (_, index) => [
      '```mermaid',
      'flowchart TD',
      index === 0
        ? '  Arrival[Viewport arrival sentinel] --> Ready[Rendered immediately]'
        : `  Later${index} --> Done${index}`,
      '```',
    ].join('\n\n')),
  ].join('\n\n');
}

const SEED_MARKDOWN = '# Scroll interaction seed\n\nPlain note without Mermaid.';
const VIEWPORT_IMAGE_URL = 'https://example.com/vlaina-e2e-viewport-image.svg';

function createViewportImageMarkdown(): string {
  return [
    '# Image viewport preload',
    '',
    ...Array.from(
      { length: 140 },
      (_, index) => `Image spacing paragraph ${index + 1}. ${'Context '.repeat(12)}`,
    ),
    '',
    `![Viewport image sentinel](${VIEWPORT_IMAGE_URL})`,
    '',
    ...Array.from({ length: 4 }, (_, index) => [
      '```mermaid',
      'flowchart TD',
      `  ImageLater${index} --> Done${index}`,
      '```',
    ].join('\n\n')),
  ].join('\n\n');
}

async function startScrollHeartbeat(page: Page, property: string): Promise<void> {
  await page.evaluate(({ selector, propertyName }) => {
    const testWindow = window as typeof window & Record<string, number | undefined>;
    const markScrolling = () => {
      const scrollRoot = document.querySelector<HTMLElement>(selector);
      if (!scrollRoot) return;
      scrollRoot.dataset.overlayScrollbarInteracting = 'true';
      scrollRoot.dispatchEvent(new Event('scroll', { bubbles: true }));
    };
    markScrolling();
    testWindow[propertyName] = window.setInterval(markScrolling, 100);
  }, {
    propertyName: property,
    selector: NOTE_SCROLL_ROOT_SELECTOR,
  });
}

async function stopScrollHeartbeat(page: Page, property: string): Promise<void> {
  await page.evaluate(({ propertyName }) => {
    const testWindow = window as typeof window & Record<string, number | undefined>;
    const heartbeat = testWindow[propertyName];
    if (heartbeat !== undefined) {
      window.clearInterval(heartbeat);
      delete testWindow[propertyName];
    }
    const scrollRoot = document.querySelector<HTMLElement>('[data-note-scroll-root="true"]');
    if (scrollRoot) delete scrollRoot.dataset.overlayScrollbarInteracting;
  }, { propertyName: property }).catch(() => {});
}

test.describe('notes viewport preload', () => {
  test.setTimeout(120_000);

  test('renders a direct-jump Mermaid target while scrolling stays active', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-mermaid-viewport-preload');
    let page: Page | undefined;

    try {
      await app.firstWindow();
      [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 720 });
      await openMarkdownFixture(page, {
        filename: 'mermaid-viewport-seed.md',
        content: SEED_MARKDOWN,
      });
      await page.evaluate(() => {
        document.body.tabIndex = -1;
        document.body.focus();
      });
      await startScrollHeartbeat(page, '__mermaidViewportScrollHeartbeat');

      await openMarkdownFixture(page, {
        filename: 'mermaid-viewport-preload.md',
        content: createViewportPreloadMarkdown(),
      });

      await expect(page.locator('.milkdown-editor'))
        .toHaveAttribute('data-note-lazy-block-visibility', 'true');
      await expect(page.locator(NOTE_SCROLL_ROOT_SELECTOR))
        .toHaveAttribute('data-overlay-scrollbar-interacting', 'true');
      const target = page.locator(`${EDITOR_SELECTOR} [data-type="mermaid"]`).first();
      await expect(target).toHaveCount(1);
      await expect(target.locator('.mermaid-placeholder')).toHaveCount(1);

      await page.evaluate((selector) => {
        const scrollRoot = document.querySelector<HTMLElement>(selector);
        const block = document.querySelectorAll<HTMLElement>(
          '.milkdown .ProseMirror[contenteditable="true"] [data-type="mermaid"]',
        )[0];
        if (!scrollRoot || !block) throw new Error('Missing Mermaid scroll fixture');

        scrollRoot.scrollTop = 0;
        scrollRoot.dataset.overlayScrollbarInteracting = 'true';
        block.scrollIntoView({ block: 'center', inline: 'nearest' });
        scrollRoot.dispatchEvent(new Event('scroll', { bubbles: true }));
      }, NOTE_SCROLL_ROOT_SELECTOR);

      await expect(target.locator('svg')).toBeVisible({ timeout: 30_000 });
      await expect(target.locator('.mermaid-placeholder')).toHaveCount(0);
      await expect(page.locator(NOTE_SCROLL_ROOT_SELECTOR))
        .toHaveAttribute('data-overlay-scrollbar-interacting', 'true');
    } finally {
      if (page) {
        await stopScrollHeartbeat(page, '__mermaidViewportScrollHeartbeat');
      }
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('shows a direct-jump image target while scrolling stays active', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-image-viewport-preload');
    let page: Page | undefined;

    try {
      await app.firstWindow();
      [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.route(VIEWPORT_IMAGE_URL, async (route) => {
        await route.fulfill({
          body: [
            '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">',
            '<rect width="640" height="360" fill="#467a63"/>',
            '<circle cx="480" cy="110" r="70" fill="#e6c566"/>',
            '</svg>',
          ].join(''),
          contentType: 'image/svg+xml',
          status: 200,
        });
      });
      await openMarkdownFixture(page, {
        filename: 'image-viewport-seed.md',
        content: SEED_MARKDOWN,
      });
      await page.evaluate(() => {
        document.body.tabIndex = -1;
        document.body.focus();
      });
      await startScrollHeartbeat(page, '__imageViewportScrollHeartbeat');

      await openMarkdownFixture(page, {
        filename: 'image-viewport-preload.md',
        content: createViewportImageMarkdown(),
      });

      await expect(page.locator('.milkdown-editor'))
        .toHaveAttribute('data-note-lazy-block-visibility', 'true');
      const target = page.locator(
        `${NOTE_IMAGE_BLOCK_SELECTOR}[data-alt="Viewport image sentinel"]`,
      );
      await expect(target).toHaveCount(1);
      await expect(target.locator('img')).toHaveCount(1);
      await expect(target.locator('[data-testid="remote-image-placeholder"]')).toHaveCount(1);
      await expect.poll(() => target.locator('img').evaluate((image) => (
        (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0
      ))).toBe(true);

      await page.evaluate(({ scrollSelector, targetSelector }) => {
        const scrollRoot = document.querySelector<HTMLElement>(scrollSelector);
        const block = document.querySelector<HTMLElement>(targetSelector);
        if (!scrollRoot || !block) throw new Error('Missing image scroll fixture');

        block.scrollIntoView({ block: 'center', inline: 'nearest' });
        scrollRoot.dispatchEvent(new Event('scroll', { bubbles: true }));
      }, {
        scrollSelector: NOTE_SCROLL_ROOT_SELECTOR,
        targetSelector: `${EDITOR_SELECTOR} .image-block-container[data-alt="Viewport image sentinel"]`,
      });

      await expect(target.locator('[data-testid="remote-image-placeholder"]')).toHaveCount(0);
      await expect(target.locator('img')).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(NOTE_SCROLL_ROOT_SELECTOR))
        .toHaveAttribute('data-overlay-scrollbar-interacting', 'true');
    } finally {
      if (page) {
        await stopScrollHeartbeat(page, '__imageViewportScrollHeartbeat');
      }
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
