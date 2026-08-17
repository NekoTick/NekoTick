import { describe, expect, it } from 'vitest';
import type { FileTreeNode } from '@/stores/notes/types';
import { resolveObsidianImagePath } from './obsidianImagePath';

const nodes: FileTreeNode[] = [
  {
    id: 'attachments',
    name: 'attachments',
    path: 'attachments',
    isFolder: true,
    expanded: false,
    children: [{
      id: 'attachments/1.png',
      name: '1.png',
      path: 'attachments/1.png',
      isFolder: false,
      kind: 'image',
    }],
  },
  {
    id: 'daily',
    name: 'daily',
    path: 'daily',
    isFolder: true,
    expanded: false,
    children: [{
      id: 'daily/1.png',
      name: '1.png',
      path: 'daily/1.png',
      isFolder: false,
      kind: 'image',
    }],
  },
];

describe('resolveObsidianImagePath', () => {
  it('resolves a bare image embed by filename and prefers the current note directory', () => {
    expect(resolveObsidianImagePath('1.png', nodes, 'daily/note.md')).toBe('daily/1.png');
    expect(resolveObsidianImagePath('1.png', nodes, 'notes/note.md')).toBe('attachments/1.png');
  });

  it('supports encoded filenames but leaves explicit paths to normal relative resolution', () => {
    expect(resolveObsidianImagePath('Pasted%20image.png', [{
      id: 'assets/Pasted image.png',
      name: 'Pasted image.png',
      path: 'assets/Pasted image.png',
      isFolder: false,
      kind: 'image',
    }])).toBe('assets/Pasted image.png');
    expect(resolveObsidianImagePath('attachments/1.png', nodes)).toBeNull();
  });
});
