import { expect, test, type Page } from '@playwright/test';
import {
  closeElectron,
  cleanupIsolatedElectron,
  EDITOR_SELECTOR,
  getOpenBridgePages,
  launchIsolatedElectron,
  openAbsoluteNote,
  openMarkdownFixture,
} from './notesE2E';
import { createMarkdownSyntaxRoundtripCases } from './notesMarkdownSyntaxFixture';

const ROUNDTRIP_TAIL = 'Roundtrip tail sentinel';
const ROUNDTRIP_EDIT = 'roundtrip-edit-sentinel';
const RANDOM_SEEDS = [0x13579bdf, 0xf00dbabe] as const;

const RANDOM_BLOCK_FACTORIES = [
  (id: number) => `## Random heading ${id}`,
  (id: number) => [`* Bullet ${id}`, `  * Nested bullet ${id}`].join('\n'),
  (id: number) => [`- [ ] Task ${id}`, `- [x] Completed ${id}`].join('\n'),
  (id: number) => [`1. Ordered ${id}`, `2. Continued ${id}`].join('\n'),
  (id: number) => [`> Quote ${id}`, `> Continued ${id}`].join('\n'),
  (id: number) => ['```ts', `const value${id} = ${id};`, '', `console.log(value${id});`, '```'].join('\n'),
  (id: number) => ['$$', `x_${id} = y_${id}`, '', `z_${id} = 1`, '$$'].join('\n'),
  (id: number) => ['```mermaid', 'flowchart TD', '', `  A${id} --> B${id}`, '```'].join('\n'),
  (id: number) => `<!-- Random user comment ${id} -->`,
] as const;

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

function createRandomElectronRoundtripCases() {
  return RANDOM_SEEDS.flatMap((seed) => {
    const random = createRandom(seed);
    return Array.from({ length: 4 }, (_, caseIndex) => {
      const blockCount = 4 + (random() % 4);
      const blocks = Array.from({ length: blockCount }, (_, blockIndex) => {
        const id = caseIndex * 100 + blockIndex;
        return RANDOM_BLOCK_FACTORIES[random() % RANDOM_BLOCK_FACTORIES.length]!(id);
      });
      const gaps = Array.from({ length: blockCount - 1 }, () => random() % 3);
      return {
        expectExactAfterEdit: true,
        label: `random-${seed.toString(16)}-${caseIndex}-gaps-${gaps.join('-')}`,
        markdown: blocks.map((block, index) =>
          index === 0 ? block : `${'\n'.repeat((gaps[index - 1] ?? 0) + 1)}${block}`
        ).join(''),
      };
    });
  });
}

function withRoundtripTail(markdown: string): string {
  return `${markdown.replace(/\n+$/g, '')}\n\n${ROUNDTRIP_TAIL}.`;
}

function safeFilename(label: string): string {
  return `syntax-roundtrip-${label.replace(/[^a-z0-9-]+/gi, '-').toLowerCase()}.md`;
}

async function getCurrentNoteContent(page: Page): Promise<string> {
  return page.evaluate(() =>
    String((window as any).__vlainaE2E.getNotesState().currentNote?.content ?? '')
  );
}

async function typeRoundtripEditAtEnd(page: Page): Promise<void> {
  const focused = await page.evaluate(() => (window as any).__vlainaE2E.focusCurrentEditorAtEnd());
  expect(focused).toBe(true);
  await page.keyboard.type(ROUNDTRIP_EDIT);
  await expect.poll(async () => getCurrentNoteContent(page), { timeout: 10_000 })
    .toContain(ROUNDTRIP_EDIT);
}

function expectNoInternalPersistenceArtifacts(
  markdown: string,
  label: string,
  allowedPatterns: readonly string[] = [],
): void {
  const leakedPatterns = [
    '\u0000',
    '\u200B',
    '\u200C',
    '\u2800',
    'VLAINA_LIST_GAP_SENTINEL',
    'VLAINA_USER_BR_SENTINEL',
    '<!--vlaina-markdown-blank-line-->',
    '<!--vlaina-rendered-html-boundary-blank-line-->',
    '<!--vlaina-markdown-tight-heading-->',
    '<!--vlaina-user-authored-internal-comment:',
    'data-vlaina-empty-line',
    'date-vlaina-empty-line',
    'data-vlaina-list-gap',
    'date-vlaina-list-gap',
    'data-vlaina-user-br',
    'date-vlaina-user-br',
  ];

  for (const pattern of leakedPatterns) {
    if (allowedPatterns.some((allowed) => allowed.includes(pattern))) continue;
    expect(markdown, `${label} leaked internal persistence artifact ${JSON.stringify(pattern)}`)
      .not.toContain(pattern);
  }
}

test.describe('notes markdown syntax roundtrip persistence', () => {
  test.setTimeout(360_000);

  test('saves and reopens each supported syntax case without hidden line-break drift', async () => {
    const { app, userDataRoot } = await launchIsolatedElectron('notes-markdown-syntax-roundtrip');

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      const switchTarget = await openMarkdownFixture(page, {
        filename: 'syntax-roundtrip-switch-target.md',
        content: '# Syntax roundtrip switch target',
      });

      const syntaxCases = [
        ...createMarkdownSyntaxRoundtripCases(),
        ...createRandomElectronRoundtripCases(),
      ];
      for (const syntaxCase of syntaxCases) {
        await test.step(syntaxCase.label, async () => {
          const opened = await openMarkdownFixture(page, {
            filename: safeFilename(syntaxCase.label),
            content: withRoundtripTail(syntaxCase.markdown),
          });

          await typeRoundtripEditAtEnd(page);

          await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
          const savedContent = await page.evaluate((pathToRead) =>
            (window as any).__vlainaE2E.readTextFile(pathToRead), opened.notePath
          );
          const currentContent = await getCurrentNoteContent(page);

          expect(savedContent, `${syntaxCase.label} disk content should match current note state after save`)
            .toBe(currentContent);
          expect(savedContent, `${syntaxCase.label} should persist the typed tail edit`)
            .toContain(ROUNDTRIP_EDIT);
          if (syntaxCase.expectExactAfterEdit) {
            expect(savedContent, `${syntaxCase.label} should preserve every authored line on first save`)
              .toBe(`${withRoundtripTail(syntaxCase.markdown)}\n${ROUNDTRIP_EDIT}`);
          }
          expectNoInternalPersistenceArtifacts(
            savedContent,
            syntaxCase.label,
            syntaxCase.allowedInternalPersistencePatterns,
          );

          await openAbsoluteNote(page, switchTarget.notePath);
          expect(await getCurrentNoteContent(page)).toBe('# Syntax roundtrip switch target');
          await openAbsoluteNote(page, opened.notePath);
          const reopenedContent = await getCurrentNoteContent(page);
          expect(reopenedContent, `${syntaxCase.label} should reopen to the saved markdown`)
            .toBe(savedContent);

          await page.evaluate(() => (window as any).__vlainaE2E.saveCurrentNote());
          const resavedContent = await page.evaluate((pathToRead) =>
            (window as any).__vlainaE2E.readTextFile(pathToRead), opened.notePath
          );
          expect(resavedContent, `${syntaxCase.label} should be stable after reopen and save`)
            .toBe(savedContent);
        });
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });

  test('migrates a legacy escaped list after inline image prose across relaunch', async () => {
    const first = await launchIsolatedElectron('notes-escaped-numbered-list-relaunch-a');
    let second: Awaited<ReturnType<typeof launchIsolatedElectron>> | null = null;
    const legacyMarkdown = [
      '<img src="./assets/example.png" alt="Example" width="61%" />Intro',
      '2\\. Skin display',
      '3\\. Default visibility',
      '4\\. Memory audit',
      '5\\. Edge smoothing',
      '6\\. License change',
      '7\\. Position limits',
      '8\\. Project credits',
      '9\\. Window sizing',
      '10\\. C rewrite',
      '11\\. Final item',
    ].join('\n');
    const expectedMarkdown = [
      '<img src="./assets/example.png" alt="Example" width="61%" />Intro',
      '',
      '2. Skin display',
      '3. Default visibility',
      '4. Memory audit',
      '5. Edge smoothing',
      '6. License change',
      '7. Position limits',
      '8. Project credits',
      '9. Window sizing',
      '10. C rewrite',
      '11. Final item',
      '12. Twelfth item',
    ].join('\n');

    try {
      await first.app.firstWindow();
      const [page] = await getOpenBridgePages(first.app, 1);
      const opened = await openMarkdownFixture(page, {
        filename: 'escaped-numbered-list-relaunch.md',
        content: legacyMarkdown,
      });

      await expect(page.locator(`${EDITOR_SELECTOR} ol[start="2"] > li`)).toHaveCount(10);

      const focused = await page.evaluate(async () => {
        const bridge = (window as any).__vlainaE2E;
        const range = await bridge.selectEditorTextByText('Final item');
        if (!range?.selected || typeof range.to !== 'number') return false;
        return Boolean(await bridge.setEditorSelectionRange(range.to));
      });
      expect(focused).toBe(true);
      await page.keyboard.press('Enter');
      await page.keyboard.type('Twelfth item');
      await expect(page.locator(`${EDITOR_SELECTOR} ol[start="2"] > li`)).toHaveCount(11);

      await closeElectron(first.app);
      second = await launchIsolatedElectron('notes-escaped-numbered-list-relaunch-b', {
        envOverrides: { VLAINA_USER_DATA_DIR: first.userDataDir },
      });
      await second.app.firstWindow();
      const [reopenedPage] = await getOpenBridgePages(second.app, 1);
      await openAbsoluteNote(reopenedPage, opened.notePath);

      await expect(reopenedPage.locator(`${EDITOR_SELECTOR} ol[start="2"] > li`)).toHaveCount(11, {
        timeout: 30_000,
      });
      await expect(reopenedPage.locator(`${EDITOR_SELECTOR} ol[start="2"] > li`).last())
        .toContainText('Twelfth item');
      const saved = await reopenedPage.evaluate((pathToRead) =>
        (window as any).__vlainaE2E.readTextFile(pathToRead), opened.notePath
      );
      expect(saved).toBe(expectedMarkdown);
    } finally {
      if (second) {
        await cleanupIsolatedElectron(second.app, second.userDataRoot);
      }
      await cleanupIsolatedElectron(first.app, first.userDataRoot);
    }
  });
});
