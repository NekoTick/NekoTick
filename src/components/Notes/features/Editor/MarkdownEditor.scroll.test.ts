import { render } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { canPersistNoteScrollPosition } from './MarkdownEditor';
import {
  LargeMarkdownFirstPaintPreview,
  shouldShowLargeMarkdownFirstPaintPreview,
} from './LargeMarkdownFirstPaintPreview';
import {
  loadPersistedNoteScrollPosition,
  NOTE_SCROLL_POSITION_STORAGE_KEY,
  persistNoteScrollPosition,
} from './utils/noteScrollPositionStorage';

describe('note scroll position storage', () => {
  beforeEach(() => {
    window.localStorage.removeItem(NOTE_SCROLL_POSITION_STORAGE_KEY);
  });

  it('persists and loads scroll positions by notesRoot and note path', () => {
    persistNoteScrollPosition('/notes-root-a', 'docs/alpha.md', 320.4);
    persistNoteScrollPosition('/notes-root-b', 'docs/alpha.md', 48);

    expect(loadPersistedNoteScrollPosition('/notes-root-a', 'docs/alpha.md')).toBe(320);
    expect(loadPersistedNoteScrollPosition('/notes-root-b', 'docs/alpha.md')).toBe(48);
    expect(loadPersistedNoteScrollPosition('/notes-root-a', 'docs/missing.md')).toBeNull();
  });

  it('persists absolute markdown file scroll positions', () => {
    persistNoteScrollPosition('/notes-root-a', '/external/notes/alpha.md', 128);

    expect(loadPersistedNoteScrollPosition('/notes-root-a', '/external/notes/alpha.md')).toBe(128);
    expect(loadPersistedNoteScrollPosition('/notes-root-b', '/external/notes/alpha.md')).toBe(128);
  });

  it('ignores draft note scroll positions', () => {
    persistNoteScrollPosition('/notes-root-a', 'draft:local', 128);

    expect(loadPersistedNoteScrollPosition('/notes-root-a', 'draft:local')).toBeNull();
    expect(window.localStorage.getItem(NOTE_SCROLL_POSITION_STORAGE_KEY)).toBeNull();
  });
});

describe('canPersistNoteScrollPosition', () => {
  it('allows visible scroll roots to persist their current scroll position', () => {
    const scrollRoot = document.createElement('div');
    Object.defineProperty(scrollRoot, 'clientHeight', { value: 600, configurable: true });
    Object.defineProperty(scrollRoot, 'scrollHeight', { value: 1800, configurable: true });
    document.body.append(scrollRoot);

    expect(canPersistNoteScrollPosition(scrollRoot)).toBe(true);

    scrollRoot.remove();
  });

  it('rejects hidden scroll roots so they cannot overwrite a saved position with zero', () => {
    const scrollRoot = document.createElement('div');
    Object.defineProperty(scrollRoot, 'clientHeight', { value: 0, configurable: true });
    Object.defineProperty(scrollRoot, 'scrollHeight', { value: 0, configurable: true });
    document.body.append(scrollRoot);

    expect(canPersistNoteScrollPosition(scrollRoot)).toBe(false);

    scrollRoot.remove();
  });
});

describe('large markdown first paint preview', () => {
  it('keeps small notes on the normal editor path', () => {
    expect(shouldShowLargeMarkdownFirstPaintPreview('# Title\n\nBody')).toBe(false);
  });

  it('uses the immediate preview for long notes', () => {
    expect(shouldShowLargeMarkdownFirstPaintPreview('x'.repeat(60_000))).toBe(true);
  });

  it('puts the complete markdown in the immediate source view', () => {
    const markdown = [
      '# Large Note',
      '',
      'First visible paragraph.',
      'x'.repeat(60_000),
      'Final preview sentinel.',
    ].join('\n');
    const { container } = render(createElement(LargeMarkdownFirstPaintPreview, { markdown }));
    const source = container.querySelector<HTMLTextAreaElement>(
      '[data-note-first-paint-preview-source="true"]',
    );

    expect(source?.value).toBe(markdown);
    expect(source?.value.endsWith('Final preview sentinel.')).toBe(true);
    expect(source?.wrap).toBe('off');
  });
});
