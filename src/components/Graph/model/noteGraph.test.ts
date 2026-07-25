import { describe, expect, it } from 'vitest';
import type { FileTreeNode, NoteContentCacheEntry } from '@/stores/notes/types';
import { buildNoteGraph, createNoteGraphScanInput } from './noteGraph';

function note(path: string): FileTreeNode {
  return {
    id: path,
    name: path.split('/').at(-1)!,
    path,
    isFolder: false,
    kind: 'note',
  };
}

function cache(entries: Array<[string, string]>): Map<string, NoteContentCacheEntry> {
  return new Map(entries.map(([path, content]) => [path, { content, modifiedAt: 1 }]));
}

describe('buildNoteGraph', () => {
  it('keeps the scan input stable when only folder expansion changes', () => {
    const collapsed: FileTreeNode = {
      id: 'docs',
      name: 'docs',
      path: 'docs',
      isFolder: true,
      expanded: false,
      children: [note('docs/Alpha.md')],
    };
    const expanded = { ...collapsed, expanded: true };

    expect(createNoteGraphScanInput([collapsed])).toEqual(createNoteGraphScanInput([expanded]));
    expect(createNoteGraphScanInput([collapsed]).key).not.toBe(
      createNoteGraphScanInput([{ ...collapsed, children: [note('docs/Beta.md')] }]).key,
    );
  });

  it('builds unique undirected edges from title, alias, and relative wikilinks', () => {
    const graph = buildNoteGraph(
      [note('Alpha.md'), note('docs/Beta.md'), note('docs/Gamma.md')],
      cache([
        ['Alpha.md', 'See [[docs/Beta|Beta note]].'],
        ['docs/Beta.md', 'Back to [[Alpha]] and onward to [[Gamma]].'],
        ['docs/Gamma.md', 'Duplicate [[Beta]] link.'],
      ]),
    );

    expect(graph.edges).toEqual([
      { source: 'Alpha.md', target: 'docs/Beta.md' },
      { source: 'docs/Beta.md', target: 'docs/Gamma.md' },
    ]);
    expect(graph.nodes.find((node) => node.id === 'docs/Beta.md')?.degree).toBe(2);
  });

  it('ignores wikilinks in excluded Markdown ranges and unresolved targets', () => {
    const graph = buildNoteGraph(
      [note('Alpha.md'), note('Beta.md')],
      cache([
        [
          'Alpha.md',
          [
            '`[[Beta]]`',
            '```md',
            '[[Beta]]',
            '```',
            '<pre>[[Beta]]</pre>',
            '[Outer](folder/[[Beta]].md)',
            '[[Missing]]',
          ].join('\n'),
        ],
        ['Beta.md', 'No links'],
      ]),
    );

    expect(graph.edges).toEqual([]);
  });

  it('builds edges from internal Markdown links without treating images or URLs as notes', () => {
    const graph = buildNoteGraph(
      [note('Alpha.md'), note('docs/Beta Note.md'), note('docs/Gamma.md')],
      cache([
        [
          'Alpha.md',
          [
            '[Beta](<docs/Beta%20Note.md#memory> "Section")',
            '![Gamma image](docs/Gamma.md)',
            '[External](https://example.test/docs/Gamma.md)',
            '`[Code](docs/Gamma.md)`',
          ].join('\n'),
        ],
        ['docs/Beta Note.md', '[Gamma](./Gamma.md)'],
        ['docs/Gamma.md', 'No links'],
      ]),
    );

    expect(graph.edges).toEqual([
      { source: 'Alpha.md', target: 'docs/Beta Note.md' },
      { source: 'docs/Beta Note.md', target: 'docs/Gamma.md' },
    ]);
  });

  it('keeps supported full-width Markdown links during syntax prefiltering', () => {
    const graph = buildNoteGraph(
      [note('Alpha.md'), note('Beta.md')],
      cache([
        ['Alpha.md', '\u3010Beta\u3011\uff08Beta.md\uff09'],
        ['Beta.md', 'No links'],
      ]),
    );

    expect(graph.edges).toEqual([
      { source: 'Alpha.md', target: 'Beta.md' },
    ]);
  });

  it('keeps links in frontmatter and resolves duplicate titles deterministically', () => {
    const graph = buildNoteGraph(
      [
        note('Index.md'),
        note('daily/2026-06-25.md'),
        note('archive/2026-06-25.md'),
        note('daily/2026-06-26.md'),
      ],
      cache([
        ['Index.md', '---\nrelated: "[[2026-06-25]]"\n---'],
        ['daily/2026-06-25.md', '---\nnext: "[[2026-06-26]]"\n---'],
        ['archive/2026-06-25.md', 'No links'],
        ['daily/2026-06-26.md', 'No links'],
      ]),
    );

    expect(graph.edges).toEqual([
      { source: 'daily/2026-06-25.md', target: 'daily/2026-06-26.md' },
      { source: 'Index.md', target: 'archive/2026-06-25.md' },
    ]);
  });

  it('builds edges from full, collapsed, and shortcut reference links', () => {
    const graph = buildNoteGraph(
      [note('Alpha.md'), note('Beta.md'), note('Gamma.md'), note('Delta.md')],
      cache([
        [
          'Alpha.md',
          [
            '[Beta note][beta]',
            '[Gamma][]',
            '[delta]',
            '',
            '[beta]: Beta.md',
            '[Gamma]: Gamma.md "Title"',
            '[delta]: <Delta.md>',
          ].join('\n'),
        ],
        ['Beta.md', 'No links'],
        ['Gamma.md', 'No links'],
        ['Delta.md', 'No links'],
      ]),
    );

    expect(graph.edges).toEqual([
      { source: 'Alpha.md', target: 'Beta.md' },
      { source: 'Alpha.md', target: 'Gamma.md' },
      { source: 'Alpha.md', target: 'Delta.md' },
    ]);
  });

  it('shares a revision-keyed graph between the main view and sidebar', () => {
    const fileTree = [note('Alpha.md'), note('Beta.md')];
    const contents = cache([
      ['Alpha.md', '[[Beta]]'],
      ['Beta.md', '[[Alpha]]'],
    ]);

    expect(buildNoteGraph(fileTree, contents, 4)).toBe(buildNoteGraph(fileTree, contents, 4));
    expect(buildNoteGraph(fileTree, contents, 5)).not.toBe(buildNoteGraph(fileTree, contents, 4));
  });

  it('refreshes cached link references when an entry changes in place', () => {
    const fileTree = [note('Alpha.md'), note('Beta.md'), note('Gamma.md')];
    const entry: NoteContentCacheEntry = { content: '[[Beta]]', modifiedAt: 1 };
    const contents = new Map([['Alpha.md', entry]]);

    expect(buildNoteGraph(fileTree, contents).edges).toEqual([
      { source: 'Alpha.md', target: 'Beta.md' },
    ]);

    entry.content = '[[Gamma]]';

    expect(buildNoteGraph(fileTree, contents).edges).toEqual([
      { source: 'Alpha.md', target: 'Gamma.md' },
    ]);
  });

  it('keeps dense valid links beyond the previous small graph budget', () => {
    const noteCount = 60;
    const notes = Array.from({ length: noteCount }, (_, index) => note(`Note ${index}.md`));
    const contents = cache(notes.map((item, sourceIndex) => [
      item.path,
      notes
        .filter((_, targetIndex) => targetIndex !== sourceIndex)
        .map((target) => `[[${target.name.replace(/\.md$/u, '')}]]`)
        .join('\n'),
    ]));

    expect(buildNoteGraph(notes, contents).edges).toHaveLength(
      noteCount * (noteCount - 1) / 2,
    );
  });

  it('keeps a real relationship when its target appears beyond the visible node limit', () => {
    const notes = Array.from(
      { length: 241 },
      (_, index) => note(`Note ${String(index).padStart(3, '0')}.md`),
    );
    const contents = cache([
      ['Note 000.md', '[[Note 240]]'],
      ['Note 240.md', '[[Note 000]]'],
    ]);

    const graph = buildNoteGraph(notes, contents);

    expect(graph.nodes).toHaveLength(240);
    expect(graph.nodes.map((node) => node.id)).toContain('Note 240.md');
    expect(graph.edges).toContainEqual({
      source: 'Note 000.md',
      target: 'Note 240.md',
    });
    expect(graph.stats).toEqual({
      totalCandidateNodes: 241,
      totalCandidateEdges: 1,
      nodesTruncated: true,
      edgesTruncated: true,
    });
  });

  it('keeps selected paths visible without rebuilding unchanged candidate data', () => {
    const notes = Array.from({ length: 241 }, (_, index) => note(`Note ${index}.md`));
    const contents = cache(notes.map((item) => [item.path, '']));
    const baseline = buildNoteGraph(notes, contents, 7);
    const visiblePriority = buildNoteGraph(notes, contents, 7, ['Note 0.md']);
    const outsidePriority = buildNoteGraph(notes, contents, 7, ['Note 240.md']);
    const restoredBaseline = buildNoteGraph(notes, contents, 7);

    expect(visiblePriority).toBe(baseline);
    expect(outsidePriority.nodes.map((node) => node.id)).toContain('Note 240.md');
    expect(restoredBaseline).toBe(baseline);
  });

  it('marks link totals as lower bounds when note content is unavailable', () => {
    const graph = buildNoteGraph(
      [note('Alpha.md'), note('Beta.md')],
      cache([['Alpha.md', '[[Beta]]']]),
    );

    expect(graph.stats.edgesTruncated).toBe(true);
  });

  it('reports an edge limit when the candidate graph exceeds the render budget', () => {
    const noteCount = 91;
    const notes = Array.from({ length: noteCount }, (_, index) => note(`Dense ${index}.md`));
    const contents = cache(notes.map((item, sourceIndex) => [
      item.path,
      notes
        .filter((_, targetIndex) => targetIndex !== sourceIndex)
        .map((target) => `[[${target.name.replace(/\.md$/u, '')}]]`)
        .join('\n'),
    ]));

    const graph = buildNoteGraph(notes, contents);

    expect(graph.stats.totalCandidateNodes).toBe(noteCount);
    expect(graph.stats.totalCandidateEdges).toBe(4_000);
    expect(graph.stats.edgesTruncated).toBe(true);
  });

  it('counts candidates beyond the candidate scan limit', () => {
    const notes = Array.from({ length: 5_001 }, (_, index) => note(`Candidate ${index}.md`));

    const graph = buildNoteGraph(notes, new Map());

    expect(graph.nodes).toHaveLength(240);
    expect(graph.stats.totalCandidateNodes).toBe(5_001);
    expect(graph.stats.nodesTruncated).toBe(true);
  });
});
