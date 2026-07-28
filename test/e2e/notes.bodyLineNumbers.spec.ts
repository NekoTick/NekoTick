import { expect, test, type Page } from '@playwright/test';
import {
  cleanupIsolatedElectron,
  EDITOR_SELECTOR,
  getOpenBridgePages,
  launchIsolatedElectron,
  openMarkdownFixture,
  waitForEditorAnimationFrame,
} from './notesE2E';
import { createMarkdownSyntaxRoundtripCases } from './notesMarkdownSyntaxFixture';
import { getMarkdownBodyLineNumbers } from '../../src/components/Notes/features/Editor/utils/bodyLineNumbers';

const BODY_LINE_NUMBER_MARKDOWN = [
  '---',
  'title: Body Line Numbers',
  '---',
  '# Heading sentinel',
  '<!--vlaina-markdown-blank-line-->',
  'Intro paragraph sentinel that is intentionally long enough to stay a regular body paragraph.',
  '- Parent item sentinel',
  '  - Nested item sentinel',
  '- Next item sentinel',
  '',
  '```ts',
  'const hidden = true;',
  'const visible = false;',
  '```',
  '',
  'After code sentinel',
  '| Col | Value |',
  '| --- | --- |',
  '| A | B |',
  '> Quote sentinel',
].join('\n');

const EXPECTED_BODY_LINE_LABELS = getMarkdownBodyLineNumbers(BODY_LINE_NUMBER_MARKDOWN).map(String);

async function collectBodyLineNumberDiagnostics(page: Page) {
  return page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
    if (!editor) throw new Error('Missing editor');

    function findTextElement(selector: string, text: string): HTMLElement {
      const element = Array.from(editor.querySelectorAll<HTMLElement>(selector))
        .find((candidate) => candidate.textContent?.includes(text));
      if (!element) throw new Error(`Missing ${selector} containing ${text}`);
      return element;
    }

    function getOwnListItemText(item: HTMLElement): string {
      return Array.from(item.childNodes)
        .filter((node) => !(node instanceof HTMLElement && /^(?:ul|ol)$/i.test(node.tagName)))
        .map((node) => node.textContent ?? '')
        .join('');
    }

    function findListItem(text: string): HTMLElement {
      const element = Array.from(editor.querySelectorAll<HTMLElement>('li'))
        .find((candidate) => getOwnListItemText(candidate).includes(text));
      if (!element) throw new Error(`Missing li containing own text ${text}`);
      return element;
    }

    function firstTextCenterY(root: HTMLElement): number {
      if (
        root.classList.contains('editor-paragraph-has-image-block')
        || root.classList.contains('image-block-container')
        || root.classList.contains('video-block')
        || root.dataset.type === 'video'
        || (
          root.dataset.type === 'html-block'
          && root.querySelector('img, video, audio, iframe, source, track') !== null
        )
      ) {
        const mediaAnchor = root.classList.contains('image-block-container')
          || root.classList.contains('video-block')
          || root.dataset.type === 'video'
          ? root
          : root.querySelector<HTMLElement>(
            '.image-block-container, .video-block, [data-type="video"], img, video, audio, iframe'
          ) ?? root;
        const rect = mediaAnchor.getBoundingClientRect();
        return rect.top + rect.height / 2;
      }

      const scanRoot = root.classList.contains('code-block-container')
        ? root.querySelector<HTMLElement>('.code-block-editable, .code-block-lazy-preview, .cm-content, pre, code') ?? root
        : root;
      const walker = document.createTreeWalker(scanRoot, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const parent = node.parentElement;
        if (!parent) continue;
        if (root.tagName === 'LI' && parent.closest('li') !== root) continue;
        if (parent.closest('[aria-hidden="true"], .body-line-number-gutter')) continue;
        if (
          parent.closest('[contenteditable="false"]')
          && root.tagName !== 'TR'
          && !root.classList.contains('milkdown-table-block')
          && !root.closest('.code-block-container')
        ) continue;

        const range = document.createRange();
        try {
          range.selectNodeContents(node);
          const rects = range.getClientRects();
          for (let index = 0; index < rects.length; index += 1) {
            const rect = rects.item(index);
            if (rect && (rect.width > 0 || rect.height > 0)) {
              return rect.top + rect.height / 2;
            }
          }
        } finally {
          range.detach();
        }
      }

      const rect = root.getBoundingClientRect();
      return rect.top + rect.height / 2;
    }

    function isFrontmatterBlock(element: HTMLElement): boolean {
      return element.classList.contains('frontmatter-block-container');
    }

    function isNumberedBlankLineTarget(element: HTMLElement): boolean {
      if (element.classList.contains('editor-editable-markdown-blank-line')) return true;
      if (element.classList.contains('editor-empty-paragraph')) return true;
      return element.dataset.type === 'html-block'
        && /<!--\s*vlaina-markdown-blank-line\s*-->/.test(element.dataset.value ?? '');
    }

    function isNonNumberedPlaceholder(element: HTMLElement): boolean {
      return element.dataset.type === 'html-block'
        && /<!--\s*(?:vlaina-rendered-html-boundary-blank-line|vlaina-markdown-tight-heading)\s*-->/.test(element.dataset.value ?? '');
    }

    function isHiddenDefinition(element: HTMLElement): boolean {
      return /^(?:\[[^\]\n]+]:\s+\S|\*\[[^\]\n]+]:\s+\S)/.test((element.textContent ?? '').trim());
    }

    function collectBodyLineTargets(): HTMLElement[] {
      const targets: HTMLElement[] = [];

      function collectCodeBlockLineTargets(codeBlock: HTMLElement): HTMLElement[] {
        const codeRoot = codeBlock.querySelector<HTMLElement>('.cm-content')
          ?? codeBlock.querySelector<HTMLElement>('.code-block-lazy-preview, pre, code')
          ?? codeBlock;
        const lines = Array.from(codeRoot.querySelectorAll<HTMLElement>('.cm-line'))
          .filter((line) =>
            line.closest('.code-block-container, pre[data-language], pre.code-block-wrapper') === codeBlock
            && line.closest('.cm-gutters, .cm-gutter, .cm-lineNumbers') === null
        );
        return lines.length > 0 ? lines : [codeRoot];
      }

      function collectTableRowTargets(tableBlock: HTMLElement): HTMLElement[] {
        const table = tableBlock.tagName.toLowerCase() === 'table'
          ? tableBlock
          : tableBlock.querySelector<HTMLElement>('table');
        if (!table) return [tableBlock];
        const rows = Array.from(table.querySelectorAll<HTMLElement>('tr'))
          .filter((row) => row.closest('table') === table);
        return rows.length > 0 ? rows : [tableBlock];
      }

      for (let index = 0; index < editor.children.length; index += 1) {
        const child = editor.children.item(index);
        if (!(child instanceof HTMLElement)) continue;
        if (
          isFrontmatterBlock(child)
          || isNonNumberedPlaceholder(child)
          || isHiddenDefinition(child)
        ) continue;
        if (
          child.classList.contains('code-block-container')
          || child.matches('pre[data-language], pre.code-block-wrapper')
        ) {
          targets.push(...collectCodeBlockLineTargets(child));
          continue;
        }
        if (child.classList.contains('milkdown-table-block') || child.tagName.toLowerCase() === 'table') {
          targets.push(...collectTableRowTargets(child));
          continue;
        }

        const tagName = child.tagName.toLowerCase();
        if (tagName === 'ul' || tagName === 'ol') {
          targets.push(...Array.from(child.querySelectorAll<HTMLElement>('li')));
          continue;
        }

        targets.push(child);
      }

      return targets;
    }

    const labels = Array.from(document.querySelectorAll<HTMLElement>('.body-line-number'));
    const targets = collectBodyLineTargets();
    const targetCenters = targets.map((target) => firstTextCenterY(target));
    const blankTargets = targets.filter(isNumberedBlankLineTarget);
    const blankRects = blankTargets.map((target) => target.getBoundingClientRect());
    const editorRect = editor.getBoundingClientRect();
    const labelRects = labels.map((label) => {
      const rect = label.getBoundingClientRect();
      return {
        text: label.textContent?.trim() ?? '',
        centerY: rect.top + rect.height / 2,
        right: rect.right,
      };
    });

    findTextElement('h1', 'Heading sentinel');
    findTextElement('p', 'Intro paragraph sentinel');
    findListItem('Parent item sentinel');
    findListItem('Nested item sentinel');
    findListItem('Next item sentinel');
    findTextElement('.code-block-container', 'const hidden = true;');
    findTextElement('.code-block-container', 'const visible = false;');
    findTextElement('p', 'After code sentinel');
    findTextElement('.milkdown-table-block, table', 'Col');
    findTextElement('blockquote, [data-type="callout"]', 'Quote sentinel');

    return {
      labels: labelRects.map((label) => label.text),
      targetCount: targets.length,
      blankTargetCount: blankTargets.length,
      deltaSummaries: labelRects.map((label, index) => ({
        delta: Math.abs(label.centerY - (targetCenters[index] ?? Number.POSITIVE_INFINITY)),
        label: label.text,
        labelCenterY: label.centerY,
        targetCenterY: targetCenters[index] ?? null,
        target: targets[index]
          ? {
              tagName: targets[index].tagName,
              className: targets[index].className,
              datasetType: targets[index].dataset.type ?? null,
              text: (targets[index].textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
            }
          : null,
      })).sort((a, b) => b.delta - a.delta).slice(0, 5),
      maxVerticalDelta: Math.max(
        ...labelRects.map((label, index) => Math.abs(label.centerY - (targetCenters[index] ?? Number.POSITIVE_INFINITY)))
      ),
      minLabelContentGap: Math.min(...labelRects.map((label) => editorRect.left - label.right)),
      blankPlaceholderLabelCount: Array.from(document.querySelectorAll<HTMLElement>('.body-line-number'))
        .filter((label) => {
          const rect = label.getBoundingClientRect();
          const centerY = rect.top + rect.height / 2;
          return blankRects.some((blankRect) => centerY >= blankRect.top && centerY <= blankRect.bottom);
        }).length,
    };
  });
}

test.describe('notes body line numbers', () => {
  test.setTimeout(180_000);

  test('aligns mixed markdown body line numbers to rendered body blocks', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-body-line-numbers');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await page.evaluate(() => (window as any).__vlainaE2E.setMarkdownBodyLineNumbers(true));

      await openMarkdownFixture(page, {
        filename: 'body-line-numbers.md',
        content: BODY_LINE_NUMBER_MARKDOWN,
      });

      await expect(page.locator(EDITOR_SELECTOR)).toContainText('After code sentinel');
      await expect.poll(
        async () => page.evaluate(() => Array.from(
          document.querySelectorAll<HTMLElement>('.body-line-number')
        ).map((label) => label.textContent?.trim() ?? '')),
        { timeout: 30_000 },
      ).toEqual(EXPECTED_BODY_LINE_LABELS);
      await waitForEditorAnimationFrame(page);

      const diagnostics = await collectBodyLineNumberDiagnostics(page);
      console.info('[notes-body-line-numbers]', diagnostics);

      expect(diagnostics.labels).toEqual(EXPECTED_BODY_LINE_LABELS);
      expect(diagnostics.targetCount).toBe(EXPECTED_BODY_LINE_LABELS.length);
      expect(diagnostics.blankTargetCount).toBeGreaterThan(0);
      expect(diagnostics.blankPlaceholderLabelCount).toBe(diagnostics.blankTargetCount);
      expect(diagnostics.minLabelContentGap).toBeGreaterThanOrEqual(10);
      expect(diagnostics.maxVerticalDelta).toBeLessThanOrEqual(3);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('places table body line numbers before each rendered table row', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-body-line-numbers-table');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await page.evaluate(() => (window as any).__vlainaE2E.setMarkdownBodyLineNumbers(true));

      await openMarkdownFixture(page, {
        filename: 'body-line-numbers-table.md',
        content: [
          'Before table sentinel',
          '',
          '| Column A | Column B | Column C |',
          '| --- | --- | --- |',
          '| Row 1 alpha | Row 1 beta | Row 1 gamma |',
          '| Row 2 alpha | Row 2 beta | Row 2 gamma |',
          '| Row 3 alpha | Row 3 beta | Row 3 gamma |',
          '| Row 4 alpha | Row 4 beta | Row 4 gamma |',
          '',
          'After table sentinel',
        ].join('\n'),
      });

      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Row 1 alpha');
      await expect.poll(
        async () => page.evaluate(() => document.querySelectorAll('.body-line-number').length),
        { timeout: 30_000 },
      ).toBeGreaterThanOrEqual(5);
      await waitForEditorAnimationFrame(page);

      const tableDiagnostics = await page.evaluate(() => {
        const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
        if (!editor) throw new Error('Missing editor');

        function collectBodyLineTargets(): HTMLElement[] {
          const targets: HTMLElement[] = [];

          function collectTableRowTargets(tableBlock: HTMLElement): HTMLElement[] {
            const table = tableBlock.tagName.toLowerCase() === 'table'
              ? tableBlock
              : tableBlock.querySelector<HTMLElement>('table');
            if (!table) return [tableBlock];
            const rows = Array.from(table.querySelectorAll<HTMLElement>('tr'))
              .filter((row) => row.closest('table') === table);
            return rows.length > 0 ? rows : [tableBlock];
          }

          for (let index = 0; index < editor.children.length; index += 1) {
            const child = editor.children.item(index);
            if (!(child instanceof HTMLElement)) continue;
            if (child.classList.contains('frontmatter-block-container')) {
              continue;
            }
            if (
              child.dataset.type === 'html-block' &&
              /<!--\s*(?:vlaina-rendered-html-boundary-blank-line|vlaina-markdown-tight-heading)\s*-->/.test(child.dataset.value ?? '')
            ) {
              continue;
            }

            const tagName = child.tagName.toLowerCase();
            if (tagName === 'ul' || tagName === 'ol') {
              targets.push(...Array.from(child.querySelectorAll<HTMLElement>('li')));
              continue;
            }
            if (child.classList.contains('milkdown-table-block') || tagName === 'table') {
              targets.push(...collectTableRowTargets(child));
              continue;
            }

            targets.push(child);
          }

          return targets;
        }

        function firstCellTextCenterY(row: HTMLElement): number {
          const firstCell = row.querySelector<HTMLElement>('th, td');
          if (!firstCell) throw new Error('Missing first table cell');
          const walker = document.createTreeWalker(firstCell, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!node.textContent?.trim()) continue;
            const range = document.createRange();
            try {
              range.selectNodeContents(node);
              const rect = range.getClientRects().item(0);
              if (rect && (rect.width > 0 || rect.height > 0)) {
                return rect.top + rect.height / 2;
              }
            } finally {
              range.detach();
            }
          }
          const firstCellRect = firstCell.getBoundingClientRect();
          return firstCellRect.top + firstCellRect.height / 2;
        }

        const labels = Array.from(document.querySelectorAll<HTMLElement>('.body-line-number'));
        const targets = collectBodyLineTargets();
        const tableBlock = editor.querySelector<HTMLElement>('.milkdown-table-block, table');
        if (!tableBlock) throw new Error('Missing rendered table');
        const tableRows = Array.from(tableBlock.querySelectorAll<HTMLElement>('tr'));
        if (tableRows.length < 5) throw new Error(`Expected at least 5 rendered table rows, got ${tableRows.length}`);
        const firstTableIndex = targets.indexOf(tableRows[0]);
        if (firstTableIndex < 0) throw new Error('Rendered table rows are not body line number targets');
        const tableLabels = labels.slice(firstTableIndex, firstTableIndex + tableRows.length);
        if (tableLabels.length !== tableRows.length) throw new Error('Missing table row line number labels');

        const bodyColumnLeft = labels[0]?.getBoundingClientRect().left;
        if (bodyColumnLeft === undefined) throw new Error('Missing ordinary body line number label');
        const rowAudits = tableRows.map((row, index) => {
          const label = tableLabels[index];
          const labelRect = label.getBoundingClientRect();
          const labelCenterY = labelRect.top + labelRect.height / 2;
          const firstCellCenterY = firstCellTextCenterY(row);
          const rowRect = row.getBoundingClientRect();

          return {
            labelText: label.textContent?.trim() ?? '',
            horizontalDelta: Math.abs(labelRect.left - bodyColumnLeft),
            verticalDelta: Math.abs(labelCenterY - firstCellCenterY),
            rowCenterVerticalDelta: Math.abs(labelCenterY - (rowRect.top + rowRect.height / 2)),
          };
        });

        return {
          allLabelTexts: labels.map((label) => label.textContent?.trim() ?? ''),
          tableLabelTexts: tableLabels.map((label) => label.textContent?.trim() ?? ''),
          maxHorizontalDelta: Math.max(...rowAudits.map((audit) => audit.horizontalDelta)),
          maxVerticalDelta: Math.max(...rowAudits.map((audit) => audit.verticalDelta)),
          maxRowCenterVerticalDelta: Math.max(...rowAudits.map((audit) => audit.rowCenterVerticalDelta)),
          tableRowCount: tableRows.length,
        };
      });

      expect(tableDiagnostics.tableRowCount).toBe(5);
      expect(tableDiagnostics.tableLabelTexts).toEqual(['3', '5', '6', '7', '8']);
      expect(tableDiagnostics.allLabelTexts).not.toContain('4');
      expect(tableDiagnostics.maxHorizontalDelta).toBeLessThanOrEqual(1);
      expect(tableDiagnostics.maxVerticalDelta).toBeLessThanOrEqual(3);
      expect(tableDiagnostics.maxRowCenterVerticalDelta).toBeLessThanOrEqual(16);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('keeps paragraph, math, and table body line numbers in one column', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-body-line-numbers-horizontal-alignment');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await page.evaluate(() => (window as any).__vlainaE2E.setMarkdownBodyLineNumbers(true));

      await openMarkdownFixture(page, {
        filename: 'body-line-numbers-horizontal-alignment.md',
        content: [
          'Plain paragraph alignment sentinel.',
          '',
          '$$',
          'E = mc^2',
          '$$',
          '',
          '| Column A | Column B |',
          '| --- | --- |',
          '| Row alpha | Row beta |',
        ].join('\n'),
      });

      await expect(page.locator(EDITOR_SELECTOR)).toContainText('Plain paragraph alignment sentinel');
      await expect(page.locator(`${EDITOR_SELECTOR} [data-type="math-block"]`)).toBeVisible();
      await expect(page.locator(`${EDITOR_SELECTOR} .milkdown-table-block, ${EDITOR_SELECTOR} table`).first()).toBeVisible();
      await expect.poll(
        async () => page.evaluate(() => document.querySelectorAll('.body-line-number').length),
        { timeout: 30_000 },
      ).toBeGreaterThanOrEqual(3);
      await waitForEditorAnimationFrame(page);

      const alignment = await page.evaluate(() => {
        const labels = Array.from(document.querySelectorAll<HTMLElement>('.body-line-number'));
        const paragraph = Array.from(document.querySelectorAll<HTMLElement>('.milkdown .ProseMirror p'))
          .find((element) => element.textContent?.includes('Plain paragraph alignment sentinel'));
        const mathBlock = document.querySelector<HTMLElement>('.milkdown .ProseMirror [data-type="math-block"]');
        const tableRow = document.querySelector<HTMLElement>('.milkdown .ProseMirror .milkdown-table-block tr, .milkdown .ProseMirror table tr');
        if (!paragraph || !mathBlock || !tableRow) {
          throw new Error('Missing paragraph, math block, or table row for body line number alignment audit');
        }

        function centerY(element: HTMLElement): number {
          const rect = element.getBoundingClientRect();
          return rect.top + rect.height / 2;
        }

        function nearestLabel(element: HTMLElement) {
          const targetCenterY = centerY(element);
          let nearest: { text: string; left: number; right: number; delta: number } | null = null;
          for (const label of labels) {
            const rect = label.getBoundingClientRect();
            const delta = Math.abs(rect.top + rect.height / 2 - targetCenterY);
            if (!nearest || delta < nearest.delta) {
              nearest = {
                text: label.textContent?.trim() ?? '',
                left: rect.left,
                right: rect.right,
                delta,
              };
            }
          }
          if (!nearest) throw new Error('Missing body line number label');
          return nearest;
        }

        return {
          paragraph: nearestLabel(paragraph),
          math: nearestLabel(mathBlock),
          table: nearestLabel(tableRow),
        };
      });

      expect(Math.abs(alignment.math.left - alignment.paragraph.left), JSON.stringify(alignment, null, 2))
        .toBeLessThanOrEqual(1);
      expect(Math.abs(alignment.table.left - alignment.paragraph.left), JSON.stringify(alignment, null, 2))
        .toBeLessThanOrEqual(1);
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('covers body line numbers across the supported markdown syntax matrix', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-body-line-numbers-syntax-matrix');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      await page.evaluate(() => (window as any).__vlainaE2E.setMarkdownBodyLineNumbers(true));

      for (const syntaxCase of createMarkdownSyntaxRoundtripCases()) {
        await test.step(syntaxCase.label, async () => {
          const expectedLabelTexts = getMarkdownBodyLineNumbers(syntaxCase.markdown).map(String);
          await openMarkdownFixture(page, {
            filename: `body-line-numbers-syntax-${syntaxCase.label.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.md`,
            content: syntaxCase.markdown,
          });

          await expect(page.locator(EDITOR_SELECTOR)).toBeVisible();
          await waitForEditorAnimationFrame(page);
          await expect.poll(async () => page.evaluate((expectedCount) => {
            const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
            if (!editor) {
              return {
                expectedCount,
                hasRenderedContent: false,
                labelCount: 0,
                targetCount: 0,
              };
            }

            function collectCodeBlockLineTargets(codeBlock: HTMLElement): HTMLElement[] {
              const codeRoot = codeBlock.querySelector<HTMLElement>('.cm-content')
                ?? codeBlock.querySelector<HTMLElement>('.code-block-lazy-preview, pre, code')
                ?? codeBlock;
              const lines = Array.from(codeRoot.querySelectorAll<HTMLElement>('.cm-line'))
                .filter((line) =>
                  line.closest('.code-block-container, pre[data-language], pre.code-block-wrapper') === codeBlock
                  && line.closest('.cm-gutters, .cm-gutter, .cm-lineNumbers') === null
                );
              return lines.length > 0 ? lines : [codeRoot];
            }

            function collectTableRowTargets(tableBlock: HTMLElement): HTMLElement[] {
              const table = tableBlock.tagName.toLowerCase() === 'table'
                ? tableBlock
                : tableBlock.querySelector<HTMLElement>('table');
              if (!table) return [tableBlock];
              const rows = Array.from(table.querySelectorAll<HTMLElement>('tr'))
                .filter((row) => row.closest('table') === table);
              return rows.length > 0 ? rows : [tableBlock];
            }

            let targetCount = 0;
            for (let index = 0; index < editor.children.length; index += 1) {
              const child = editor.children.item(index);
              if (!(child instanceof HTMLElement)) continue;
              if (
                child.classList.contains('frontmatter-block-container')
                || (
                  child.dataset.type === 'html-block'
                  && /<!--\s*(?:vlaina-rendered-html-boundary-blank-line|vlaina-markdown-tight-heading)\s*-->/.test(child.dataset.value ?? '')
                )
                || /^(?:\[[^\]\n]+]:\s+\S|\*\[[^\]\n]+]:\s+\S)/.test((child.textContent ?? '').trim())
              ) {
                continue;
              }

              const tagName = child.tagName.toLowerCase();
              if (child.classList.contains('code-block-container') || child.matches('pre[data-language], pre.code-block-wrapper')) {
                targetCount += collectCodeBlockLineTargets(child).length;
              } else if (child.classList.contains('milkdown-table-block') || tagName === 'table') {
                targetCount += collectTableRowTargets(child).length;
              } else {
                targetCount += tagName === 'ul' || tagName === 'ol'
                  ? child.querySelectorAll('li').length
                  : 1;
              }
            }

            const labelCount = document.querySelectorAll('.body-line-number').length;
            const hasRenderedContent = editor.children.length > 0 && (
              Boolean(editor.textContent?.trim())
              || editor.querySelector('.frontmatter-block-container, [data-type], .code-block-container') !== null
            );
            return {
              debug: targetCount === expectedCount && labelCount === expectedCount
                ? null
                : {
                    children: Array.from(editor.children).map((child) => ({
                      className: child.className,
                      datasetType: child instanceof HTMLElement ? child.dataset.type ?? null : null,
                      datasetValue: child instanceof HTMLElement ? child.dataset.value ?? null : null,
                      listItems: child.querySelectorAll('li').length,
                      tagName: child.tagName,
                      text: (child.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
                    })),
                    labelTexts: Array.from(document.querySelectorAll<HTMLElement>('.body-line-number'))
                      .map((label) => label.textContent?.trim() ?? ''),
                  },
              expectedCount,
              hasRenderedContent,
              labelCount,
              targetCount,
            };
          }, expectedLabelTexts.length), {
            message: `${syntaxCase.label}: body line labels should settle before geometry audit`,
            timeout: 10_000,
          }).toEqual({
            debug: null,
            expectedCount: expectedLabelTexts.length,
            hasRenderedContent: true,
            labelCount: expectedLabelTexts.length,
            targetCount: expectedLabelTexts.length,
          });

          await expect.poll(async () => page.evaluate(() => Array.from(
            document.querySelectorAll<HTMLElement>('.milkdown .ProseMirror .mermaid-block'),
          ).every((block) => (
            block.dataset.mermaidLazy !== 'true'
            && block.querySelector('.mermaid-placeholder') === null
          ))), {
            message: `${syntaxCase.label}: asynchronous Mermaid blocks should finish rendering`,
            timeout: 10_000,
          }).toBe(true);
          await waitForEditorAnimationFrame(page);

          const collectAudit = () => page.evaluate(() => {
            const editor = document.querySelector<HTMLElement>('.milkdown .ProseMirror');
            if (!editor) throw new Error('Missing editor');

            function isFrontmatterBlock(element: HTMLElement): boolean {
              return element.classList.contains('frontmatter-block-container');
            }

            function isNonNumberedPlaceholder(element: HTMLElement): boolean {
              return element.dataset.type === 'html-block'
                && /<!--\s*(?:vlaina-rendered-html-boundary-blank-line|vlaina-markdown-tight-heading)\s*-->/.test(element.dataset.value ?? '');
            }

            function isHiddenDefinition(element: HTMLElement): boolean {
              return /^(?:\[[^\]\n]+]:\s+\S|\*\[[^\]\n]+]:\s+\S)/.test((element.textContent ?? '').trim());
            }

            function collectTargets(): HTMLElement[] {
              const targets: HTMLElement[] = [];

              function collectCodeBlockLineTargets(codeBlock: HTMLElement): HTMLElement[] {
                const codeRoot = codeBlock.querySelector<HTMLElement>('.cm-content')
                  ?? codeBlock.querySelector<HTMLElement>('.code-block-lazy-preview, pre, code')
                  ?? codeBlock;
                const lines = Array.from(codeRoot.querySelectorAll<HTMLElement>('.cm-line'))
                  .filter((line) =>
                    line.closest('.code-block-container, pre[data-language], pre.code-block-wrapper') === codeBlock
                    && line.closest('.cm-gutters, .cm-gutter, .cm-lineNumbers') === null
                  );
                return lines.length > 0 ? lines : [codeRoot];
              }

              function collectTableRowTargets(tableBlock: HTMLElement): HTMLElement[] {
                const table = tableBlock.tagName.toLowerCase() === 'table'
                  ? tableBlock
                  : tableBlock.querySelector<HTMLElement>('table');
                if (!table) return [tableBlock];
                const rows = Array.from(table.querySelectorAll<HTMLElement>('tr'))
                  .filter((row) => row.closest('table') === table);
                return rows.length > 0 ? rows : [tableBlock];
              }

              for (let index = 0; index < editor.children.length; index += 1) {
                const child = editor.children.item(index);
                if (!(child instanceof HTMLElement)) continue;
                if (
                  isFrontmatterBlock(child)
                  || isNonNumberedPlaceholder(child)
                  || isHiddenDefinition(child)
                ) continue;
                if (
                  child.classList.contains('code-block-container')
                  || child.matches('pre[data-language], pre.code-block-wrapper')
                ) {
                  targets.push(...collectCodeBlockLineTargets(child));
                  continue;
                }

                const tagName = child.tagName.toLowerCase();
                if (child.classList.contains('milkdown-table-block') || tagName === 'table') {
                  targets.push(...collectTableRowTargets(child));
                  continue;
                }
                if (tagName === 'ul' || tagName === 'ol') {
                  targets.push(...Array.from(child.querySelectorAll<HTMLElement>('li')));
                  continue;
                }

                targets.push(child);
              }

              return targets;
            }

            function getFirstVisibleClientRect(rects: DOMRectList): DOMRect | null {
              for (let index = 0; index < rects.length; index += 1) {
                const rect = rects.item(index);
                if (rect && (rect.width > 0 || rect.height > 0)) return rect;
              }
              return null;
            }

            function firstTextCenterY(root: HTMLElement): number {
              if (
                root.classList.contains('editor-paragraph-has-image-block')
                || root.classList.contains('image-block-container')
                || root.classList.contains('video-block')
                || root.dataset.type === 'video'
                || (
                  root.dataset.type === 'html-block'
                  && root.querySelector('img, video, audio, iframe, source, track') !== null
                )
              ) {
                const mediaAnchor = root.classList.contains('image-block-container')
                  || root.classList.contains('video-block')
                  || root.dataset.type === 'video'
                  ? root
                  : root.querySelector<HTMLElement>(
                    '.image-block-container, .video-block, [data-type="video"], img, video, audio, iframe'
                  ) ?? root;
                const rect = mediaAnchor.getBoundingClientRect();
                return rect.top + rect.height / 2;
              }

              const scanRoot = root.classList.contains('code-block-container')
                ? root.querySelector<HTMLElement>('.code-block-editable, .code-block-lazy-preview, .cm-content, pre, code') ?? root
                : root;
              const walker = document.createTreeWalker(scanRoot, NodeFilter.SHOW_TEXT);
              for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                if (!node.textContent?.trim()) continue;
                const parent = node.parentElement;
                if (!parent) continue;
                if (root.tagName === 'LI' && parent.closest('li') !== root) continue;
                if (parent.closest('[aria-hidden="true"], .body-line-number-gutter')) continue;
                if (
                  parent.closest('[contenteditable="false"]')
                  && root.tagName !== 'TR'
                  && !root.classList.contains('milkdown-table-block')
                  && !root.closest('.code-block-container')
                ) {
                  continue;
                }

                const range = document.createRange();
                try {
                  range.selectNodeContents(node);
                  const rect = getFirstVisibleClientRect(range.getClientRects());
                  if (rect) return rect.top + rect.height / 2;
                } finally {
                  range.detach();
                }
              }

              const rect = root.getBoundingClientRect();
              return rect.top + rect.height / 2;
            }

            const labels = Array.from(document.querySelectorAll<HTMLElement>('.body-line-number'));
            const targets = collectTargets();
            const labelTexts = labels.map((label) => label.textContent?.trim() ?? '');
            const labelRects = labels.map((label) => {
              const rect = label.getBoundingClientRect();
              return {
                text: label.textContent?.trim() ?? '',
                centerY: rect.top + rect.height / 2,
                left: rect.left,
                right: rect.right,
                width: rect.width,
                height: rect.height,
              };
            });
            const bodyColumnLeft = labelRects[0]?.left ?? 0;
            const targetCenters = targets.map((target) => firstTextCenterY(target));
            const verticalDeltas = labelRects.map((label, index) =>
              Math.abs(label.centerY - (targetCenters[index] ?? Number.POSITIVE_INFINITY))
            );
            const horizontalDeltas = labelRects.map((label) =>
              Math.abs(label.left - bodyColumnLeft)
            );
            const deltaSummaries = verticalDeltas.map((delta, index) => ({
              delta,
              label: labelRects[index]?.text ?? null,
              labelCenterY: labelRects[index]?.centerY ?? null,
              targetCenterY: targetCenters[index] ?? null,
              target: targets[index]
                ? {
                    tagName: targets[index].tagName,
                    className: targets[index].className,
                    datasetType: targets[index].dataset.type ?? null,
                    text: (targets[index].textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
                  }
                : null,
            })).sort((a, b) => b.delta - a.delta).slice(0, 5);
            const horizontalSummaries = horizontalDeltas.map((delta, index) => ({
              delta,
              label: labelRects[index]?.text ?? null,
              left: labelRects[index]?.left ?? null,
              target: targets[index]
                ? {
                    tagName: targets[index].tagName,
                    className: targets[index].className,
                    datasetType: targets[index].dataset.type ?? null,
                    text: (targets[index].textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
                  }
                : null,
            })).sort((a, b) => b.delta - a.delta).slice(0, 5);

            return {
              targetCount: targets.length,
              labelCount: labels.length,
              labelTexts,
              maxVerticalDelta: verticalDeltas.length > 0 ? Math.max(...verticalDeltas) : 0,
              maxHorizontalDelta: horizontalDeltas.length > 0 ? Math.max(...horizontalDeltas) : 0,
              deltaSummaries,
              horizontalSummaries,
              invisibleLabels: labelRects.filter((rect) => rect.width <= 0 || rect.height <= 0).map((rect) => rect.text),
              targetSummaries: targets.map((target, index) => ({
                index,
                tagName: target.tagName,
                className: target.className,
                datasetType: target.dataset.type ?? null,
                text: (target.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
              })),
            };
          });

          await expect.poll(
            async () => (await collectAudit()).maxVerticalDelta,
            {
              message: `${syntaxCase.label}: body line labels should settle after asynchronous block rendering`,
              timeout: 10_000,
            },
          ).toBeLessThanOrEqual(4);
          const audit = await collectAudit();

          expect(audit.labelCount, `${syntaxCase.label}: label count should match numbered targets\n${JSON.stringify(audit.targetSummaries, null, 2)}`)
            .toBe(audit.targetCount);
          expect(audit.labelTexts, `${syntaxCase.label}: labels should match source body line numbers`)
            .toEqual(expectedLabelTexts);
          expect(audit.invisibleLabels, `${syntaxCase.label}: labels should be visible`).toEqual([]);
          expect(audit.maxVerticalDelta, `${syntaxCase.label}: labels should align to target first text line\n${JSON.stringify(audit.deltaSummaries, null, 2)}`)
            .toBeLessThanOrEqual(4);
          expect(audit.maxHorizontalDelta, `${syntaxCase.label}: labels should stay in one body line number column\n${JSON.stringify(audit.horizontalSummaries, null, 2)}`)
            .toBeLessThanOrEqual(1);
        });
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
