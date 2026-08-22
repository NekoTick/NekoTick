import { expect, test } from '@playwright/test';
import {
  EDITOR_SELECTOR,
  NOTE_SOURCE_FALLBACK_SELECTOR,
  cleanupIsolatedElectron,
  createNotesRootFilesFixture,
  getOpenBridgePages,
  launchIsolatedElectron,
  openAbsoluteNote,
  openNotesRootInNotes,
} from './notesE2E';

function createLargeMarkdown(label: string): string {
  return [
    `# ${label}`,
    '',
    `<a href="https://example.test/${label.toLowerCase()}">`,
    `  <img src="https://images.example.test/${label.toLowerCase()}.svg" alt="${label} badge" />`,
    '</a>',
    '',
    ...Array.from({ length: 550 }, (_, index) => [
      `## ${label} section ${index + 1}`,
      '',
      `This paragraph exercises deferred editor startup for ${label}. It remains editable after the note is opened and switched to from another large Markdown document.`,
    ].join('\n')),
    '',
    `${label} final sentinel.`,
  ].join('\n\n');
}

test('keeps the rendered editor while switching large Markdown notes', async () => {
  test.setTimeout(180_000);
  const { app, userDataRoot } = await launchIsolatedElectron('large-markdown-switching');

  try {
    await app.firstWindow();
    const [page] = await getOpenBridgePages(app, 1);
    const files = [
      { filename: 'first.md', content: createLargeMarkdown('First') },
      { filename: 'second.md', content: createLargeMarkdown('Second') },
    ];
    expect(files[0]!.content.length).toBeGreaterThan(98_000);
    expect(files[0]!.content.length).toBeLessThan(250_000);
    const fixture = await createNotesRootFilesFixture(page, {
      name: 'large-markdown-switching',
      files,
    });
    await openNotesRootInNotes(page, {
      notesRootPath: fixture.notesRootPath,
      minFileCount: files.length,
    });

    for (const notePath of fixture.notePaths) {
      await openAbsoluteNote(page, notePath);
      await expect(page.locator(EDITOR_SELECTOR)).toBeVisible();
      await expect(page.locator(NOTE_SOURCE_FALLBACK_SELECTOR)).toHaveCount(0);
    }
  } finally {
    await cleanupIsolatedElectron(app, userDataRoot);
  }
});
