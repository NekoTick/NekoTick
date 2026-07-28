import { expect, test } from '@playwright/test';
import {
  BLOCK_CONTROLS_SELECTOR,
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
} from './notesE2E';

test.describe('notes slash video command', () => {
  test('inserts supported video URLs without showing the remote-blocked placeholder', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-slash-video-supported-url');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'slash-video-direct-url-e2e.md',
        content: [
          '# Slash Video Direct URL',
          '',
          'Insert a direct video from slash.',
        ].join('\n'),
      });

      const focused = await page.evaluate(() => (window as any).__vlainaE2E.focusCurrentEditorAtEnd());
      expect(focused).toBe(true);

      await page.keyboard.type('/video');
      await expect(page.locator('.slash-menu-item.selected')).toContainText('Video');
      await page.keyboard.press('Enter');
      const input = page.locator('.slash-video-prompt .link-editor-rail-input');
      await expect(input).toBeFocused({ timeout: 10_000 });
      await input.fill('https://example.com/video.mp4');
      await input.press('Enter');

      const videoBlock = page.locator(`${EDITOR_SELECTOR} div[data-type="video"]`).first();
      await expect(videoBlock).toBeVisible({ timeout: 10_000 });
      await expect(videoBlock.locator('video')).toHaveAttribute('src', 'https://example.com/video.mp4');
      await expect(videoBlock.locator('video')).toHaveAttribute('preload', 'none');
      await expect(videoBlock.locator('.video-placeholder')).toHaveCount(0);
      await expect(videoBlock).not.toContainText('Remote video blocked');
      await videoBlock.click();
      await expect(videoBlock).toHaveClass(/ProseMirror-selectednode/);
      const clickedVideoSelectionStyle = await videoBlock.evaluate((element) => {
        const style = window.getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          boxShadow: style.boxShadow,
        };
      });
      expect(clickedVideoSelectionStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)');
      expect(clickedVideoSelectionStyle.boxShadow).not.toBe('none');

      const focusedAgain = await page.evaluate(() => (window as any).__vlainaE2E.focusCurrentEditorAtEnd());
      expect(focusedAgain).toBe(true);

      await page.keyboard.type('/video');
      await expect(page.locator('.slash-menu-item.selected')).toContainText('Video');
      await page.keyboard.press('Enter');
      const providerInput = page.locator('.slash-video-prompt .link-editor-rail-input');
      await expect(providerInput).toBeFocused({ timeout: 10_000 });
      await providerInput.fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
      await providerInput.press('Enter');

      const providerBlock = page.locator(`${EDITOR_SELECTOR} div[data-type="video"]`).nth(1);
      await expect(providerBlock).toBeVisible({ timeout: 10_000 });
      await expect(providerBlock.locator('iframe')).toHaveAttribute(
        'src',
        'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0&playsinline=1&rel=0'
      );
      await expect(providerBlock.locator('iframe')).toHaveAttribute(
        'allow',
        'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
      );
      await expect(providerBlock.locator('iframe')).toHaveAttribute(
        'sandbox',
        'allow-scripts allow-same-origin allow-presentation allow-popups'
      );
      await expect(providerBlock.locator('.video-placeholder')).toHaveCount(0);
      await expect(providerBlock).not.toContainText('Remote video blocked');

      const focusedForBilibili = await page.evaluate(() => (window as any).__vlainaE2E.focusCurrentEditorAtEnd());
      expect(focusedForBilibili).toBe(true);

      await page.keyboard.type('/video');
      await expect(page.locator('.slash-menu-item.selected')).toContainText('Video');
      await page.keyboard.press('Enter');
      const bilibiliInput = page.locator('.slash-video-prompt .link-editor-rail-input');
      await expect(bilibiliInput).toBeFocused({ timeout: 10_000 });
      await bilibiliInput.fill('https://www.bilibili.com/video/BV1KPJx6NEtQ/?spm_id_from=333.1007.tianma.1-1-1.click&vd_source=efeaf6f967e48f58317a9291cef584cd');
      await bilibiliInput.press('Enter');

      const bilibiliBlock = page.locator(`${EDITOR_SELECTOR} div[data-type="video"]`).nth(2);
      await expect(bilibiliBlock).toBeVisible({ timeout: 10_000 });
      await expect(bilibiliBlock.locator('iframe')).toHaveAttribute(
        'src',
        'https://player.bilibili.com/player.html?isOutside=true&bvid=BV1KPJx6NEtQ&p=1&danmaku=0&autoplay=0&cid=39100549298',
        { timeout: 15_000 }
      );
      await expect(bilibiliBlock.locator('iframe')).toHaveAttribute(
        'sandbox',
        'allow-scripts allow-same-origin allow-presentation allow-popups'
      );
      await expect(bilibiliBlock.locator('.video-placeholder')).toHaveCount(0);
      await expect(bilibiliBlock).not.toContainText('Remote video blocked');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps existing video iframe DOM when dragging a different block', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-slash-video-drag-neighbor');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'video-drag-neighbor.md',
        content: [
          'Move me below the video',
          '',
          '![video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)',
          '',
          'Drop target paragraph',
        ].join('\n'),
      });

      const videoFrame = page.locator(`${EDITOR_SELECTOR} div[data-type="video"] iframe`).first();
      await expect(videoFrame).toHaveAttribute(
        'src',
        'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0&playsinline=1&rel=0'
      );
      await videoFrame.evaluate((frame) => {
        (frame as HTMLIFrameElement & { __vlainaE2EFrameMarker?: string }).__vlainaE2EFrameMarker = 'kept';
      });

      const selectedCount = await page.evaluate(() => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks();
        const index = blocks.findIndex((block: { text: string }) => block.text.includes('Move me below the video'));
        return (window as any).__vlainaE2E.selectNoteBlocksByIndexes([index]);
      });
      expect(selectedCount).toBe(1);

      const selected = page.locator(`${EDITOR_SELECTOR} .editor-block-selected`).first();
      const selectedBox = await selected.boundingBox();
      if (!selectedBox) {
        throw new Error('Could not resolve selected paragraph geometry');
      }
      await page.mouse.move(Math.max(8, selectedBox.x - 18), selectedBox.y + selectedBox.height / 2);
      await expect(page.locator(BLOCK_CONTROLS_SELECTOR)).toBeVisible();

      const handleBox = await page.locator('.editor-block-control-handle').boundingBox();
      const targetBox = await page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'Drop target paragraph' }).boundingBox();
      if (!handleBox || !targetBox) {
        throw new Error('Could not resolve block drag geometry');
      }

      const dragStartX = handleBox.x + handleBox.width / 2;
      const dragStartY = handleBox.y + handleBox.height / 2;
      await page.mouse.move(dragStartX, dragStartY);
      await page.mouse.down();
      await page.mouse.move(dragStartX + 28, dragStartY, { steps: 4 });
      await page.mouse.move(Math.max(8, targetBox.x - 20), targetBox.y + targetBox.height + 8, { steps: 10 });
      await page.mouse.up();

      await expect.poll(async () => page.locator(`${EDITOR_SELECTOR}`).evaluate((editor) => editor.textContent ?? ''))
        .toContain('Drop target paragraphMove me below the video');

      const frameMarker = await videoFrame.evaluate((frame) => (
        frame as HTMLIFrameElement & { __vlainaE2EFrameMarker?: string }
      ).__vlainaE2EFrameMarker ?? null);
      expect(frameMarker).toBe('kept');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('reuses the video iframe DOM when moving the video block itself', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-slash-video-drag-video');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });

      await openMarkdownFixture(page, {
        filename: 'video-drag-self.md',
        content: [
          'Before video',
          '',
          '![video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)',
          '',
          'After video',
        ].join('\n'),
      });

      const videoBlock = page.locator(`${EDITOR_SELECTOR} div[data-type="video"]`).first();
      const videoFrame = videoBlock.locator('iframe');
      await expect(videoFrame).toHaveAttribute(
        'src',
        'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=0&playsinline=1&rel=0'
      );
      await videoFrame.evaluate((frame) => {
        (frame as HTMLIFrameElement & { __vlainaE2EFrameMarker?: string }).__vlainaE2EFrameMarker = 'kept';
      });

      const selectedVideoCount = await page.evaluate(() => {
        const blocks = (window as any).__vlainaE2E.getNoteSelectableBlocks();
        const index = blocks.findIndex((block: {
          className: string;
          dataset: Record<string, string>;
        }) => block.dataset.type === 'video' || block.className.includes('video-block'));
        return (window as any).__vlainaE2E.selectNoteBlocksByIndexes([index]);
      });
      expect(selectedVideoCount).toBe(1);
      await expect(videoBlock).toHaveClass(/editor-block-selected/);
      const videoBox = await videoBlock.boundingBox();
      if (!videoBox) {
        throw new Error('Could not resolve video block geometry');
      }
      await page.mouse.move(Math.max(8, videoBox.x - 18), videoBox.y + videoBox.height / 2);
      await expect(page.locator(BLOCK_CONTROLS_SELECTOR)).toBeVisible();

      const handleBox = await page.locator('.editor-block-control-handle').boundingBox();
      const targetBox = await page.locator(`${EDITOR_SELECTOR} p`, { hasText: 'After video' }).boundingBox();
      if (!handleBox || !targetBox) {
        throw new Error('Could not resolve video block drag geometry');
      }

      const dragStartX = handleBox.x + handleBox.width / 2;
      const dragStartY = handleBox.y + handleBox.height / 2;
      await page.mouse.move(dragStartX, dragStartY);
      await page.mouse.down();
      await page.mouse.move(dragStartX + 28, dragStartY, { steps: 4 });
      await page.mouse.move(Math.max(8, targetBox.x - 20), targetBox.y + targetBox.height + 8, { steps: 10 });
      await page.mouse.up();

      await expect.poll(async () => videoBlock.evaluate((block) => {
        const previous = block.previousElementSibling;
        return previous?.textContent ?? '';
      })).toContain('After video');

      const frameMarker = await videoFrame.evaluate((frame) => (
        frame as HTMLIFrameElement & { __vlainaE2EFrameMarker?: string }
      ).__vlainaE2EFrameMarker ?? null);
      expect(frameMarker).toBe('kept');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
