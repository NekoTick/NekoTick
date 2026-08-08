import { expect, test } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
} from './notesE2E';

const FRONTMATTER_PROPERTIES_MARKDOWN = [
  '---',
  'title: Notes syntax check',
  'description: Manual syntax coverage for the Notes editor',
  'tags:',
  '  - notes-syntax',
  '  - manual-check',
  'published: true',
  'priority: 2',
  'author:',
  '  name: Ada',
  'empty: null',
  '---',
  '',
  '# Notes syntax check',
  '',
  'Body sentinel.',
].join('\n');

test.describe('notes frontmatter properties', () => {
  test('switches modes promptly on the first interaction', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-frontmatter-properties-cold-switch');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await openMarkdownFixture(page, {
        filename: 'frontmatter-properties-cold-switch.md',
        content: FRONTMATTER_PROPERTIES_MARKDOWN,
      });

      const block = page.locator(`${EDITOR_SELECTOR} .frontmatter-block-container`);
      const modeButton = block.locator('.frontmatter-properties-mode');
      await expect(block.locator('.frontmatter-properties-view')).toBeVisible();
      await expect(modeButton).toHaveAttribute('aria-label', 'YAML source');

      const blockBox = await block.boundingBox();
      expect(blockBox).not.toBeNull();
      await page.mouse.move(blockBox!.x + 4, blockBox!.y + 4);
      let buttonBox = await modeButton.boundingBox();
      expect(buttonBox).not.toBeNull();
      await page.mouse.move(
        buttonBox!.x + buttonBox!.width / 2,
        buttonBox!.y + buttonBox!.height / 2,
      );
      const sourceSwitchStart = await page.evaluate(() => performance.now());
      await page.mouse.down();
      await expect(block.locator('.frontmatter-block-editor')).toBeVisible();
      const sourceSwitchElapsed = await page.evaluate(
        (start) => performance.now() - start,
        sourceSwitchStart,
      );
      await page.mouse.up();

      await page.mouse.move(blockBox!.x + 4, blockBox!.y + 4);
      buttonBox = await modeButton.boundingBox();
      expect(buttonBox).not.toBeNull();
      await page.mouse.move(
        buttonBox!.x + buttonBox!.width / 2,
        buttonBox!.y + buttonBox!.height / 2,
      );
      const propertiesSwitchStart = await page.evaluate(() => performance.now());
      await page.mouse.down();
      await expect(block.locator('.frontmatter-block-editor')).toBeHidden();
      const propertiesSwitchElapsed = await page.evaluate(
        (start) => performance.now() - start,
        propertiesSwitchStart,
      );
      await page.mouse.up();

      expect(sourceSwitchElapsed).toBeLessThan(1000);
      expect(propertiesSwitchElapsed).toBeLessThan(1000);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('edits YAML properties visually and keeps source mode and persistence available', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-frontmatter-properties');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      const { notePath } = await openMarkdownFixture(page, {
        filename: 'frontmatter-properties.md',
        content: FRONTMATTER_PROPERTIES_MARKDOWN,
      });
      const block = page.locator(`${EDITOR_SELECTOR} .frontmatter-block-container`);
      const rows = block.locator('.frontmatter-property-row:not(.frontmatter-property-row-new)');

      await expect(block.locator('.frontmatter-properties-view')).toBeVisible();
      await expect(rows).toHaveCount(7);
      await expect(block.locator('.frontmatter-properties-heading')).toHaveCount(0);
      await expect(block.locator('.frontmatter-properties-count')).toHaveCount(0);
      await expect(block.locator('.frontmatter-property-icon')).toHaveCount(0);
      await expect(block.locator('.frontmatter-property-chip')).toHaveCount(2);
      await expect(block.locator('.frontmatter-property-complex-value')).toHaveCount(2);
      await expect(block.locator('.frontmatter-property-value-input[aria-label="empty"]')).toHaveCount(0);
      await expect(block.locator('.frontmatter-block-editor')).toBeHidden();
      await expect(block.locator('.frontmatter-property-add')).toHaveText('Add');
      await expect(block).toHaveCSS('border-top-style', 'dashed');
      await expect(block).toHaveCSS('border-top-width', '1px');
      await expect.poll(() => block.evaluate((element) => getComputedStyle(element).marginTop)).toBe('0px');
      await expect.poll(() => page.locator('[data-hero-icon-header] [data-vlaina-markdown-font-size-surface="true"]')
        .evaluate((element) => getComputedStyle(element).marginBottom)).toBe('0px');
      const titleInput = page.locator('[data-note-title-input="true"]');
      const titleToPropertiesGap = await Promise.all([
        titleInput.boundingBox(),
        rows.first().boundingBox(),
      ]).then(([titleBox, rowBox]) => {
        expect(titleBox).not.toBeNull();
        expect(rowBox).not.toBeNull();
        return rowBox!.y - (titleBox!.y + titleBox!.height);
      });
      expect(titleToPropertiesGap).toBeLessThanOrEqual(2);
      const modeButton = block.locator('.frontmatter-properties-mode');
      const firstDeleteButton = rows.first().locator('.frontmatter-property-delete');
      await expect(modeButton).toHaveCount(1);
      await expect(modeButton).toHaveAttribute('aria-label', 'YAML source');
      await expect(block.locator('.frontmatter-properties-toolbar')).toHaveCSS('pointer-events', 'none');

      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.mouse.move(0, 0);
      await expect.poll(() => modeButton.evaluate((element) => getComputedStyle(element).opacity)).toBe('0');
      await expect.poll(() => firstDeleteButton.evaluate((element) => getComputedStyle(element).opacity)).toBe('0');
      await expect(firstDeleteButton).toHaveCSS('pointer-events', 'none');
      await expect.poll(() => rows.first().evaluate((element) => getComputedStyle(element).borderTopColor))
        .toBe('rgba(0, 0, 0, 0)');
      await rows.first().hover();
      await expect.poll(() => modeButton.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
      await expect.poll(() => firstDeleteButton.evaluate((element) => getComputedStyle(element).opacity)).toBe('1');
      await expect(firstDeleteButton).toHaveCSS('pointer-events', 'auto');
      await expect.poll(() => rows.first().evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          focusWithin: element.matches(':focus-within'),
          hovered: element.matches(':hover'),
          style: style.borderTopStyle,
          transparent: style.borderTopColor === 'rgba(0, 0, 0, 0)',
          width: style.borderTopWidth,
        };
      })).toEqual({
        focusWithin: false,
        hovered: true,
        style: 'solid',
        transparent: false,
        width: '2px',
      });
      await rows.nth(1).hover();
      await expect.poll(() => rows.first().evaluate((element) => element.matches(':hover'))).toBe(false);
      await expect.poll(() => rows.nth(1).evaluate((element) => element.matches(':hover'))).toBe(true);
      await expect(rows.nth(1)).toHaveCSS('transition-property', 'none');
      await expect(modeButton).toHaveCSS('transition-property', 'none');
      await expect(firstDeleteButton).toHaveCSS('transition-property', 'none');
      await expect(rows.first().locator('.frontmatter-property-key-input'))
        .toHaveCSS('transition-property', 'none');
      await rows.first().locator('.frontmatter-property-key-input').focus();
      await expect.poll(() => rows.first().evaluate((element) => getComputedStyle(element).borderTopColor))
        .toBe('rgba(0, 0, 0, 0)');
      await modeButton.hover();
      await expect(page.locator('[data-slot="tooltip-content"]')).toHaveCount(0);
      await rows.first().locator('.frontmatter-property-key-input').focus();
      await page.mouse.move(0, 0);
      await expect.poll(() => modeButton.evaluate((element) => getComputedStyle(element).opacity)).toBe('0');
      await expect.poll(() => firstDeleteButton.evaluate((element) => getComputedStyle(element).opacity)).toBe('0');

      const propertyList = block.locator('.frontmatter-properties-list');
      const addButton = block.locator('.frontmatter-property-add');
      const [propertyListBox, addButtonBox] = await Promise.all([
        propertyList.boundingBox(),
        addButton.boundingBox(),
      ]);
      expect(propertyListBox).not.toBeNull();
      expect(addButtonBox).not.toBeNull();
      const listWhitespacePoint = {
        x: propertyListBox!.x + propertyListBox!.width - 8,
        y: addButtonBox!.y + addButtonBox!.height / 2,
      };
      await page.mouse.click(
        listWhitespacePoint.x,
        listWhitespacePoint.y,
      );
      await expect(titleInput).toBeFocused();
      await expect.poll(() => titleInput.evaluate((element) => ({
        length: (element as HTMLTextAreaElement).value.length,
        selectionEnd: (element as HTMLTextAreaElement).selectionEnd,
        selectionStart: (element as HTMLTextAreaElement).selectionStart,
      }))).toEqual({
        length: await titleInput.inputValue().then((value) => value.length),
        selectionEnd: await titleInput.inputValue().then((value) => value.length),
        selectionStart: await titleInput.inputValue().then((value) => value.length),
      });

      await page.mouse.click(
        addButtonBox!.x + addButtonBox!.width / 2,
        addButtonBox!.y + addButtonBox!.height + 4,
      );
      await expect(titleInput).toBeFocused();
      await expect.poll(() => titleInput.evaluate((element) => ({
        length: (element as HTMLTextAreaElement).value.length,
        selectionEnd: (element as HTMLTextAreaElement).selectionEnd,
        selectionStart: (element as HTMLTextAreaElement).selectionStart,
      }))).toEqual({
        length: await titleInput.inputValue().then((value) => value.length),
        selectionEnd: await titleInput.inputValue().then((value) => value.length),
        selectionStart: await titleInput.inputValue().then((value) => value.length),
      });

      const editorHeading = page.locator(`${EDITOR_SELECTOR} > h1`).first();
      const [gapBlockBox, headingBox] = await Promise.all([
        block.boundingBox(),
        editorHeading.boundingBox(),
      ]);
      expect(gapBlockBox).not.toBeNull();
      expect(headingBox).not.toBeNull();
      const gapY = (gapBlockBox!.y + gapBlockBox!.height + headingBox!.y) / 2;
      await page.mouse.click(
        addButtonBox!.x + addButtonBox!.width / 2,
        gapY,
      );
      await expect(titleInput).toBeFocused();
      await expect.poll(() => titleInput.evaluate((element) => ({
        length: (element as HTMLTextAreaElement).value.length,
        selectionEnd: (element as HTMLTextAreaElement).selectionEnd,
        selectionStart: (element as HTMLTextAreaElement).selectionStart,
      }))).toEqual({
        length: await titleInput.inputValue().then((value) => value.length),
        selectionEnd: await titleInput.inputValue().then((value) => value.length),
        selectionStart: await titleInput.inputValue().then((value) => value.length),
      });

      await page.mouse.click(gapBlockBox!.x + 4, gapY);
      await expect(titleInput).toBeFocused();
      await expect.poll(() => titleInput.evaluate((element) => ({
        length: (element as HTMLTextAreaElement).value.length,
        selectionEnd: (element as HTMLTextAreaElement).selectionEnd,
        selectionStart: (element as HTMLTextAreaElement).selectionStart,
      }))).toEqual({
        length: await titleInput.inputValue().then((value) => value.length),
        selectionEnd: await titleInput.inputValue().then((value) => value.length),
        selectionStart: await titleInput.inputValue().then((value) => value.length),
      });

      const viewBox = await block.locator('.frontmatter-properties-view').boundingBox();
      expect(viewBox).not.toBeNull();
      await page.mouse.click(
        addButtonBox!.x + addButtonBox!.width / 2,
        Math.min(viewBox!.y + viewBox!.height - 2, addButtonBox!.y + addButtonBox!.height + 6),
      );
      await expect(titleInput).toBeFocused();
      await expect.poll(() => titleInput.evaluate((element) => ({
        length: (element as HTMLTextAreaElement).value.length,
        selectionEnd: (element as HTMLTextAreaElement).selectionEnd,
        selectionStart: (element as HTMLTextAreaElement).selectionStart,
      }))).toEqual({
        length: await titleInput.inputValue().then((value) => value.length),
        selectionEnd: await titleInput.inputValue().then((value) => value.length),
        selectionStart: await titleInput.inputValue().then((value) => value.length),
      });

      await block.click({ position: { x: 2, y: 2 } });
      await expect(block.locator('.frontmatter-block-editor')).toBeHidden();
      await expect(titleInput).toBeFocused();
      await expect.poll(() => titleInput.evaluate((element) => ({
        length: (element as HTMLTextAreaElement).value.length,
        selectionEnd: (element as HTMLTextAreaElement).selectionEnd,
        selectionStart: (element as HTMLTextAreaElement).selectionStart,
      }))).toEqual({
        length: await titleInput.inputValue().then((value) => value.length),
        selectionEnd: await titleInput.inputValue().then((value) => value.length),
        selectionStart: await titleInput.inputValue().then((value) => value.length),
      });

      const firstRowBox = await rows.first().boundingBox();
      expect(firstRowBox).not.toBeNull();
      await page.mouse.click(
        gapBlockBox!.x - 4,
        firstRowBox!.y + firstRowBox!.height / 2,
      );
      await expect(titleInput).toBeFocused();
      await expect.poll(() => titleInput.evaluate((element) => ({
        length: (element as HTMLTextAreaElement).value.length,
        selectionEnd: (element as HTMLTextAreaElement).selectionEnd,
        selectionStart: (element as HTMLTextAreaElement).selectionStart,
      }))).toEqual({
        length: await titleInput.inputValue().then((value) => value.length),
        selectionEnd: await titleInput.inputValue().then((value) => value.length),
        selectionStart: await titleInput.inputValue().then((value) => value.length),
      });
      await expect(page.locator('.ProseMirror-gapcursor:visible')).toHaveCount(0);
      await expect(page.locator('.editor-textblock-caret-overlay:visible')).toHaveCount(0);

      const descriptionValue = rows.nth(1).locator('.frontmatter-property-value-input');
      await descriptionValue.fill('A polished visual properties editor');
      const descriptionBox = await descriptionValue.boundingBox();
      expect(descriptionBox).not.toBeNull();
      await page.mouse.move(
        descriptionBox!.x + descriptionBox!.width - 8,
        descriptionBox!.y + descriptionBox!.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        descriptionBox!.x + 8,
        descriptionBox!.y + descriptionBox!.height / 2,
        { steps: 12 },
      );
      await page.mouse.up();
      await expect.poll(() => descriptionValue.evaluate((element) => ({
        selectionDirection: (element as HTMLInputElement).selectionDirection,
        selectionEnd: (element as HTMLInputElement).selectionEnd,
        selectionStart: (element as HTMLInputElement).selectionStart,
      }))).toMatchObject({
        selectionDirection: 'backward',
      });
      const backwardSelection = await descriptionValue.evaluate((element) => ({
        selectionEnd: (element as HTMLInputElement).selectionEnd ?? 0,
        selectionStart: (element as HTMLInputElement).selectionStart ?? 0,
      }));
      expect(backwardSelection.selectionEnd).toBeGreaterThan(backwardSelection.selectionStart);
      await descriptionValue.press('Tab');

      const tagInput = block.locator('.frontmatter-property-list-value > input');
      await tagInput.fill('design');
      await tagInput.press('Control+Enter');
      await expect(block.locator('.frontmatter-property-chip')).toHaveCount(3);

      const listDeleteSnapshot = await block.evaluate((element) => {
        const chip = Array.from(element.querySelectorAll('.frontmatter-property-chip'))
          .find((candidate) => candidate.querySelector('span')?.textContent === 'notes-syntax');
        const removeButton = chip?.querySelector('button');
        if (!chip || !removeButton) return { chipRemoved: false };
        removeButton.click();
        return { chipRemoved: !chip.isConnected };
      });
      expect(listDeleteSnapshot).toEqual({ chipRemoved: true });

      const propertyDeleteSnapshot = await block.evaluate((element) => {
        const row = Array.from(element.querySelectorAll('.frontmatter-property-row'))
          .find((candidate) => (
            candidate.querySelector('.frontmatter-property-key-input') as HTMLInputElement | null
          )?.value === 'priority');
        const deleteButton = row?.querySelector('.frontmatter-property-delete');
        if (!row || !deleteButton) return { rowRemoved: false };
        deleteButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return { rowRemoved: !row.isConnected };
      });
      expect(propertyDeleteSnapshot).toEqual({ rowRemoved: true });

      const immediateAddBox = await addButton.boundingBox();
      expect(immediateAddBox).not.toBeNull();
      await page.mouse.move(
        immediateAddBox!.x + immediateAddBox!.width / 2,
        immediateAddBox!.y + immediateAddBox!.height / 2,
      );
      await page.mouse.down();
      const newPropertyInput = block.locator('.frontmatter-property-row-new input');
      await expect(newPropertyInput).toBeVisible();
      await expect(newPropertyInput).toBeFocused();
      await page.mouse.up();
      await newPropertyInput.fill('topics');
      await newPropertyInput.press('Tab');

      const topicsValue = block.locator('.frontmatter-property-value-input[aria-label="topics"]');
      await expect(topicsValue).toBeFocused();
      await expect(block.locator('.editor-textblock-caret-overlay:visible')).toHaveCount(0);
      await expect(page.locator('.ProseMirror-gapcursor:visible')).toHaveCount(0);
      await topicsValue.fill('notes-syntax');
      await topicsValue.press('Control+Enter');

      const topicsListInput = block.locator('.frontmatter-property-list-value > input[aria-label="topics"]');
      await expect(topicsListInput).toBeFocused();
      const topicsList = topicsListInput.locator('..');
      await expect(topicsList.locator('.frontmatter-property-chip')).toHaveCount(1);
      await topicsListInput.fill('manual-check');
      await topicsListInput.press('Control+Enter');
      await expect(topicsListInput).toBeFocused();
      await expect(topicsList.locator('.frontmatter-property-chip')).toHaveCount(2);

      const topicsRemoveButtons = topicsList.locator('.frontmatter-property-chip button');
      await topicsRemoveButtons.first().click();
      await topicsRemoveButtons.first().click();
      await expect(topicsList.locator('.frontmatter-property-chip')).toHaveCount(0);
      await topicsListInput.fill('draft-without-shortcut');
      await topicsListInput.press('Tab');
      await expect(topicsList.locator('.frontmatter-property-chip')).toHaveCount(0);
      await topicsListInput.fill('notes-syntax');
      await topicsListInput.press('Control+Enter');
      await topicsListInput.fill('manual-check');
      await topicsListInput.press('Control+Enter');
      await expect(topicsList.locator('.frontmatter-property-chip')).toHaveCount(2);

      await addButton.click();
      const guardedPropertyInput = block.locator('.frontmatter-property-row-new input');
      await guardedPropertyInput.fill('主题');
      await guardedPropertyInput.dispatchEvent('keydown', {
        bubbles: true,
        cancelable: true,
        code: 'Enter',
        isComposing: true,
        key: 'Enter',
        keyCode: 229,
      });
      await expect(guardedPropertyInput).toBeFocused();
      await expect(block.locator('.frontmatter-property-value-input[aria-label="主题"]')).toHaveCount(0);
      await guardedPropertyInput.fill('vlaina_custom');
      await guardedPropertyInput.press('Tab');
      await expect(guardedPropertyInput).toHaveAttribute('aria-invalid', 'true');
      await expect(guardedPropertyInput).toBeFocused();
      await guardedPropertyInput.press('Escape');
      await expect(block.locator('.frontmatter-property-row-new')).toHaveCount(0);

      await modeButton.hover();
      const sourceModeButtonBox = await modeButton.boundingBox();
      expect(sourceModeButtonBox).not.toBeNull();
      await page.mouse.move(
        sourceModeButtonBox!.x + sourceModeButtonBox!.width / 2,
        sourceModeButtonBox!.y + sourceModeButtonBox!.height / 2,
      );
      await page.mouse.down();
      await expect(block.locator('.frontmatter-block-editor')).toBeVisible();
      await expect(modeButton).toHaveAttribute('aria-label', 'Properties');
      await expect(block.locator('.cm-content')).toBeFocused();
      await expect(block.locator('.cm-content')).toContainText('description: A polished visual properties editor');
      await page.mouse.up();
      await expect.poll(() => page.evaluate(() => {
        const selection = (window as any).__vlainaE2E.getEditorSelectionSummary();
        return selection && {
          collapsed: selection.from === selection.to,
          empty: selection.empty,
        };
      })).toEqual({ collapsed: true, empty: true });
      const sourceContent = block.locator('.cm-content');
      const nativeFocusState = await app.evaluate(async ({ BrowserWindow }, mainUrl) => {
        const mainWindow = BrowserWindow.getAllWindows()
          .find((window) => window.webContents.getURL() === mainUrl);
        const focusWindow = new BrowserWindow({
          show: true,
          width: 240,
          height: 120,
          webPreferences: { backgroundThrottling: false },
        });
        (globalThis as any).__frontmatterE2EFocusWindow = focusWindow;
        await focusWindow.loadURL('data:text/html,<title>focus target</title>');
        mainWindow?.blur();
        focusWindow.show();
        focusWindow.focus();
        return {
          mainWindowFocused: mainWindow?.isFocused() ?? null,
        };
      }, page.url());
      expect(nativeFocusState).toEqual({
        mainWindowFocused: false,
      });
      await page.evaluate(() => {
        const content = document.querySelector<HTMLElement>(
          '.frontmatter-block-container .cm-content',
        );
        const selection = document.getSelection();
        if (!content || !selection) return;
        const range = document.createRange();
        range.selectNodeContents(content);
        selection.removeAllRanges();
        selection.addRange(range);
        window.dispatchEvent(new FocusEvent('blur'));
        document.dispatchEvent(new Event('selectionchange'));
      });
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
      await expect.poll(() => page.evaluate(() => {
        const selection = (window as any).__vlainaE2E.getEditorSelectionSummary();
        return selection && {
          collapsed: selection.from === selection.to,
          empty: selection.empty,
        };
      })).toEqual({ collapsed: true, empty: true });
      const sourceSelectionRects = await block.locator('.cm-selectionBackground').evaluateAll((elements) =>
        elements.map((element) => {
          const rect = element.getBoundingClientRect();
          return { height: rect.height, width: rect.width };
        }),
      );
      expect(sourceSelectionRects.every(({ width, height }) => width === 0 || height === 0)).toBe(true);
      await app.evaluate(({ BrowserWindow }, mainUrl) => {
        const focusWindow = (globalThis as any).__frontmatterE2EFocusWindow;
        focusWindow?.close();
        delete (globalThis as any).__frontmatterE2EFocusWindow;
        const mainWindow = BrowserWindow.getAllWindows()
          .find((window) => window.webContents.getURL() === mainUrl);
        mainWindow?.show();
        mainWindow?.focus();
      }, page.url());
      await sourceContent.click();
      await modeButton.hover();
      const propertiesModeButtonBox = await modeButton.boundingBox();
      expect(propertiesModeButtonBox).not.toBeNull();
      await page.mouse.move(
        propertiesModeButtonBox!.x + propertiesModeButtonBox!.width / 2,
        propertiesModeButtonBox!.y + propertiesModeButtonBox!.height / 2,
      );
      await page.mouse.down();
      await expect(descriptionValue).toHaveValue('A polished visual properties editor');
      await expect(block.locator('.frontmatter-block-editor')).toBeHidden();
      await page.mouse.up();

      await page.setViewportSize({ width: 527, height: 860 });
      await expect(block).toBeVisible();
      const overflow = await block.evaluate((element) => ({
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);

      await page.setViewportSize({ width: 720, height: 860 });
      const compactLayout = await block.evaluate((element) => {
        const host = element.querySelector<HTMLElement>('.frontmatter-properties-host');
        const key = element.querySelector<HTMLElement>('.frontmatter-property-key-input');
        const value = element.querySelector<HTMLElement>('.frontmatter-property-value-input');
        if (!host || !key || !value) return null;
        return {
          hostWidth: host.clientWidth,
          sameRow: Math.abs(key.getBoundingClientRect().y - value.getBoundingClientRect().y) <= 1,
        };
      });
      expect(compactLayout).not.toBeNull();
      expect(compactLayout!.sameRow).toBe(true);

      await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
      await expect.poll(async () => page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), notePath
      )).toContain('description: A polished visual properties editor');
      await expect.poll(async () => page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), notePath
      )).toContain('  - design');
      await expect.poll(async () => page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), notePath
      )).toContain([
        'topics:',
        '  - notes-syntax',
        '  - manual-check',
      ].join('\n'));
      await expect.poll(async () => page.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), notePath
      )).not.toContain('vlaina_custom');

      await page.setViewportSize({ width: 1280, height: 860 });
      await modeButton.click();
      await sourceContent.click();
      await page.keyboard.press('Control+A');
      await page.keyboard.insertText('invalid: [');
      await expect(modeButton).toBeDisabled();
      await page.mouse.move(0, 0);
      await expect.poll(() => modeButton.evaluate((element) => getComputedStyle(element).opacity)).toBe('0');
      await block.hover();
      await expect.poll(() => modeButton.evaluate((element) => getComputedStyle(element).opacity)).toBe('0.35');
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
