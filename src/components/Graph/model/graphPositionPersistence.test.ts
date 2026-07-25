import { describe, expect, it } from 'vitest';
import {
  collectLiveGraphPositionPaths,
  MAX_GRAPH_POSITION_ENTRIES,
  pruneGraphNodePositions,
} from './graphPositionPersistence';

function note(path: string) {
  return { id: path, isFolder: false as const, kind: 'note' as const, name: path, path };
}

describe('graph position persistence', () => {
  it('keeps only live note paths and does not invent missing priority positions', () => {
    const livePaths = collectLiveGraphPositionPaths([note('Alpha.md'), note('Beta.md')]);

    expect(pruneGraphNodePositions(
      {
        'Alpha.md': { x: 1, y: 2 },
        'Deleted.md': { x: 3, y: 4 },
      },
      livePaths,
      ['Missing.md', 'Beta.md'],
    )).toEqual({ 'Alpha.md': { x: 1, y: 2 } });
  });

  it('bounds persisted positions to the graph candidate limit', () => {
    const positions = Object.fromEntries(
      Array.from({ length: MAX_GRAPH_POSITION_ENTRIES + 1 }, (_, index) => [
        `Note ${index}.md`,
        { x: index, y: index },
      ]),
    );
    const livePaths = new Set(Object.keys(positions));

    const pruned = pruneGraphNodePositions(positions, livePaths);

    expect(Object.keys(pruned)).toHaveLength(MAX_GRAPH_POSITION_ENTRIES);
  });

  it('collects nested notes while ignoring image entries', () => {
    const livePaths = collectLiveGraphPositionPaths([
      {
        id: 'docs',
        isFolder: true,
        name: 'docs',
        path: 'docs',
        expanded: true,
        children: [note('docs/Guide.md'), {
          id: 'docs/cover.png',
          isFolder: false,
          kind: 'image',
          name: 'cover.png',
          path: 'docs/cover.png',
        }],
      },
    ]);

    expect([...livePaths]).toEqual(['docs/Guide.md']);
  });
});
