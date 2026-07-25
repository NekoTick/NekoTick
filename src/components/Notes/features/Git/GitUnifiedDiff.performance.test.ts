import { describe, expect, it } from 'vitest';
import {
  getGitDiffLineStats,
  groupGitDiffLineRuns,
  splitGitDiffFiles,
} from './GitUnifiedDiff';
import { exceedsGitDiffPreviewBudget } from './gitDiffBudget';

describe('GitUnifiedDiff rendering budget', () => {
  it('renders a large contiguous addition as one DOM run', () => {
    const lines = Array.from({ length: 10_000 }, (_, index) => `+Added line ${index}`);

    const runs = groupGitDiffLineRuns(lines);

    expect(runs).toHaveLength(1);
    expect(runs[0].text).toContain('+Added line 0');
    expect(runs[0].text).toContain('+Added line 9999');
  });

  it('keeps different diff line types in separate color runs', () => {
    const runs = groupGitDiffLineRuns([' context', '-old', '-older', '+new', '+newer', ' context']);

    expect(runs).toHaveLength(4);
  });

  it('keeps content that resembles file headers once a hunk has started', () => {
    const diff = [
      'diff --git a/note.md b/note.md',
      '--- a/note.md',
      '+++ b/note.md',
      '@@ -1,2 +1,2 @@',
      '--- removed content',
      '+++ added content',
      '----',
      '+---',
    ].join('\n');

    expect(splitGitDiffFiles(diff)[0].lines).toEqual([
      '--- removed content',
      '+++ added content',
      '----',
      '+---',
    ]);
    expect(getGitDiffLineStats(diff)).toEqual({ additions: 2, deletions: 2 });
  });

  it('rejects a diff that would create too many rendered lines', () => {
    const diff = Array.from({ length: 12_001 }, (_, index) => `+line ${index}`).join('\n');

    expect(exceedsGitDiffPreviewBudget(diff)).toBe(true);
  });
});
