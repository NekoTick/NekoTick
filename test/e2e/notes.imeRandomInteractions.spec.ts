import { expect, test, type Page } from '@playwright/test';

import {
  EDITOR_SELECTOR,
  cleanupIsolatedElectron,
  createNotesRootFilesFixture,
  getOpenBridgePages,
  launchIsolatedElectron,
  openAbsoluteNote,
  waitForEditorAnimationFrame,
} from './notesE2E';

const DEFAULT_SEED = 'notes-ime-random-v1';
const DEFAULT_STEPS = 24;
const MIN_STEPS = 12;
const MAX_STEPS = 60;

type Replacement = {
  expectedFragment: string;
  followUp: string;
  marker: string;
  noteIndex: number;
  splitAfterCommit: boolean;
  target: string;
  targetFragment: string;
};

function getSeed(): string {
  return process.env.NOTES_IME_RANDOM_SEED?.trim() || DEFAULT_SEED;
}

function getStepCount(): number {
  const parsed = Number.parseInt(process.env.NOTES_IME_RANDOM_STEPS ?? '', 10);
  if (!Number.isFinite(parsed)) return DEFAULT_STEPS;
  return Math.min(MAX_STEPS, Math.max(MIN_STEPS, parsed));
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRng(seed: string): () => number {
  let state = hashSeed(seed) || 0x9e3779b9;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createNoteContent(label: string, steps: number): string {
  return [
    `# IME Random ${label}`,
    '',
    ...Array.from({ length: steps }, (_, step) => [
      `Target-${label}-${step} preserved suffix ${label}-${step}.`,
      '',
    ]).flat(),
    `Final ${label} sentinel.`,
  ].join('\n');
}

async function focusEditor(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => (
    (window as any).__vlainaE2E.focusCurrentEditor()
  ))).toBe(true);
}

async function replaceSelectionWithIme(
  page: Page,
  target: string,
  targetFragment: string,
  committedText: string,
): Promise<void> {
  const anchorRange = await page.evaluate(
    (anchorText) => (window as any).__vlainaE2E.getEditorTextRange(anchorText),
    targetFragment,
  );
  expect(anchorRange, `Expected to find ${targetFragment}`).not.toBeNull();
  const targetOffset = targetFragment.indexOf(target);
  expect(targetOffset).toBeGreaterThanOrEqual(0);
  const selection = await page.evaluate(
    ({ from, to }) => (window as any).__vlainaE2E.setEditorSelectionRange(from, to),
    {
      from: anchorRange!.from + targetOffset,
      to: anchorRange!.from + targetOffset + target.length,
    },
  );
  expect(selection?.selectedText, `Expected editor selection to remain ${target}`).toBe(target);
  await focusEditor(page);
  const focusedSelection = await page.evaluate(() => (
    (window as any).__vlainaE2E.getEditorSelectionSummary()
  ));
  expect(focusedSelection?.selectedText, `Expected focused selection to remain ${target}`).toBe(target);
  const started = await page.evaluate(({ editorSelector, text }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    if (!editor) return false;
    editor.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }));
    editor.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      data: text,
      inputType: 'insertCompositionText',
      isComposing: true,
    }));
    return true;
  }, { editorSelector: EDITOR_SELECTOR, text: committedText });
  expect(started).toBe(true);

  await page.keyboard.insertText(committedText);
  const commitState = await page.evaluate(({ editorSelector, marker, targetText }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    const text = editor?.textContent ?? '';
    return {
      markerCount: text.split(marker).length - 1,
      targetPresent: text.includes(targetText),
    };
  }, { editorSelector: EDITOR_SELECTOR, marker: committedText, targetText: targetFragment });
  expect(commitState).toEqual({ markerCount: 1, targetPresent: false });
  await page.evaluate(({ editorSelector, text }) => {
    document.querySelector<HTMLElement>(editorSelector)?.dispatchEvent(new CompositionEvent('compositionend', {
      bubbles: true,
      data: text,
    }));
  }, { editorSelector: EDITOR_SELECTOR, text: committedText });
}

async function expectReplacementInEditor(page: Page, replacement: Replacement): Promise<void> {
  await expect.poll(() => page.evaluate(({ editorSelector, marker, targetFragment, followUp, splitAfterCommit }) => {
    const editor = document.querySelector<HTMLElement>(editorSelector);
    const paragraphs = Array.from(editor?.querySelectorAll<HTMLElement>('p') ?? [])
      .map((paragraph) => paragraph.textContent ?? '');
    const markerParagraphIndex = paragraphs.findIndex((text) => text.includes(marker));
    const expectedSingleLine = `${marker}${followUp} preserved suffix`;
    const expectedNextLine = `${followUp} preserved suffix`;
    return {
      markerCount: (editor?.textContent ?? '').split(marker).length - 1,
      hasTarget: (editor?.textContent ?? '').includes(targetFragment),
      hasExpectedStructure: splitAfterCommit
        ? paragraphs[markerParagraphIndex] === marker &&
          (paragraphs[markerParagraphIndex + 1] ?? '').startsWith(expectedNextLine)
        : (paragraphs[markerParagraphIndex] ?? '').startsWith(expectedSingleLine),
    };
  }, {
    editorSelector: EDITOR_SELECTOR,
    marker: replacement.marker,
    targetFragment: replacement.targetFragment,
    followUp: replacement.followUp,
    splitAfterCommit: replacement.splitAfterCommit,
  })).toEqual({
    markerCount: 1,
    hasTarget: false,
    hasExpectedStructure: true,
  });
}

function summarizeContent(content: string, replacements: Replacement[]) {
  return replacements.map(({ expectedFragment, marker, targetFragment }) => ({
    markerCount: content.split(marker).length - 1,
    hasExpectedFragment: content.includes(expectedFragment),
    hasTarget: content.includes(targetFragment),
  }));
}

test.describe('notes seeded random IME interactions', () => {
  test.setTimeout(240_000);

  test('preserves Chinese composition through Enter, undo, redo, switching, and disk saves', async () => {
    const seed = getSeed();
    const steps = getStepCount();
    const rng = createRng(seed);
    const seedTag = hashSeed(seed).toString(36);
    const phrases = ['中文输入', '混合标点，。！？', '全角括号（）', '简繁混合測試', '数字１２３'];
    const { app, userDataRoot } = await launchIsolatedElectron(`notes-ime-random-${seedTag}`);

    try {
      await app.firstWindow();
      const [page] = await getOpenBridgePages(app, 1);
      await page.setViewportSize({ width: 1280, height: 860 });
      const labels = ['Alpha', 'Beta'];
      const fixture = await createNotesRootFilesFixture(page, {
        name: `ime-random-${seedTag}`,
        files: labels.map((label) => ({
          filename: `${label.toLowerCase()}.md`,
          content: createNoteContent(label, steps),
        })),
      });
      const replacements: Replacement[] = [];
      let currentNoteIndex = -1;

      for (let step = 0; step < steps; step += 1) {
        await test.step(`seed ${seed} IME operation ${step + 1}/${steps}`, async () => {
          const noteIndex = rng() < 0.5 ? 0 : 1;
          if (currentNoteIndex !== noteIndex) {
            await openAbsoluteNote(page, fixture.notePaths[noteIndex]!);
            currentNoteIndex = noteIndex;
          }
          const label = labels[noteIndex]!;
          const target = `Target-${label}-${step}`;
          const targetFragment = `${target} preserved suffix ${label}-${step}.`;
          const marker = `${phrases[Math.floor(rng() * phrases.length)]}-${seedTag}-step-${step}-commit`;
          const followUp = `FollowIme${step}`;
          const splitAfterCommit = rng() < 0.5;
          const expectedFragment = splitAfterCommit
            ? `${marker}\n${followUp} preserved suffix ${label}-${step}.`
            : `${marker}${followUp} preserved suffix ${label}-${step}.`;
          const replacement = {
            expectedFragment,
            followUp,
            marker,
            noteIndex,
            splitAfterCommit,
            target,
            targetFragment,
          };

          await replaceSelectionWithIme(page, target, targetFragment, marker);
          if (splitAfterCommit) {
            await page.keyboard.press('Enter');
          }
          await page.keyboard.type(followUp, { delay: 0 });
          await waitForEditorAnimationFrame(page);
          await expectReplacementInEditor(page, replacement);

          if (rng() < 0.3) {
            const beforeUndo = await page.locator(EDITOR_SELECTOR).innerText();
            await focusEditor(page);
            await page.keyboard.press('Control+z');
            await expect.poll(() => page.locator(EDITOR_SELECTOR).innerText()).not.toBe(beforeUndo);
            const afterUndoHistory = await page.evaluate(() => (
              (window as any).__vlainaE2E.getEditorHistoryDepth()
            ));
            expect(afterUndoHistory?.redo).toBeGreaterThan(0);
            if (rng() < 0.5) {
              const otherNoteIndex = noteIndex === 0 ? 1 : 0;
              await openAbsoluteNote(page, fixture.notePaths[otherNoteIndex]!);
              await openAbsoluteNote(page, fixture.notePaths[noteIndex]!);
              currentNoteIndex = noteIndex;
            }
            const restoredHistory = await page.evaluate(() => (
              (window as any).__vlainaE2E.getEditorHistoryDepth()
            ));
            expect(restoredHistory?.redo).toBeGreaterThan(0);
            await focusEditor(page);
            await page.keyboard.press('Control+Shift+z');
            await expect.poll(() => page.locator(EDITOR_SELECTOR).innerText()).toBe(beforeUndo);
          }

          replacements.push(replacement);
        });
      }

      for (const noteIndex of [0, 1]) {
        await openAbsoluteNote(page, fixture.notePaths[noteIndex]!);
        const expected = replacements.filter((replacement) => replacement.noteIndex === noteIndex);
        await expect.poll(async () => {
          const content = await page.evaluate(() => String(
            (window as any).__vlainaE2E.getNotesState().currentNote?.content ?? ''
          ));
          return summarizeContent(content, expected);
        }, { timeout: 15_000 }).toEqual(expected.map(() => ({
          markerCount: 1,
          hasExpectedFragment: true,
          hasTarget: false,
        })));
        await expect.poll(async () => {
          const content = String(await page.evaluate(
            (path) => (window as any).__vlainaE2E.readTextFile(path),
            fixture.notePaths[noteIndex]!,
          ));
          return summarizeContent(content, expected);
        }, { timeout: 15_000 }).toEqual(expected.map(() => ({
          markerCount: 1,
          hasExpectedFragment: true,
          hasTarget: false,
        })));
      }
    } finally {
      await cleanupIsolatedElectron(app, userDataRoot);
    }
  });
});
