import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolveExternalFolderDropTargetPath,
  resolveInternalMoveDropTargetPath,
  resolveStarredDropTargetFromElements,
} from './dropTargetDom';

const originalElementsFromPoint = document.elementsFromPoint;

function setElementsFromPoint(elements: Element[]) {
  (document as Document & {
    elementsFromPoint: (x: number, y: number) => Element[];
  }).elementsFromPoint = vi.fn(() => elements);
}

function createDropTargetTree() {
  const root = document.createElement('div');
  root.dataset.fileTreeRootDropTarget = 'true';

  const rootRow = document.createElement('div');
  rootRow.dataset.fileTreeRootDropTarget = 'true';
  root.append(rootRow);

  const rootFile = document.createElement('div');
  rootFile.dataset.fileTreeKind = 'file';
  rootFile.dataset.fileTreePath = 'root.md';
  root.append(rootFile);

  const folder = document.createElement('div');
  folder.dataset.fileTreeKind = 'folder';
  folder.dataset.fileTreePath = 'docs';
  root.append(folder);

  const folderSpacer = document.createElement('div');
  folder.append(folderSpacer);

  const folderFile = document.createElement('div');
  folderFile.dataset.fileTreeKind = 'file';
  folderFile.dataset.fileTreePath = 'docs/a.md';
  folder.append(folderFile);

  const childFolder = document.createElement('div');
  childFolder.dataset.fileTreeKind = 'folder';
  childFolder.dataset.fileTreePath = 'docs/sub';
  folder.append(childFolder);

  const virtualizedFolderFile = document.createElement('div');
  virtualizedFolderFile.dataset.fileTreeKind = 'file';
  virtualizedFolderFile.dataset.fileTreePath = 'docs/virtualized.md';
  virtualizedFolderFile.dataset.fileTreeParentFolderPath = 'docs';
  const virtualizedFolderFileLabel = document.createElement('span');
  virtualizedFolderFile.append(virtualizedFolderFileLabel);
  root.append(virtualizedFolderFile);

  document.body.append(root);

  return {
    root,
    rootRow,
    rootFile,
    folder,
    folderSpacer,
    folderFile,
    childFolder,
    virtualizedFolderFileLabel,
  };
}

describe('dropTargetDom', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    (document as Document & {
      elementsFromPoint: typeof originalElementsFromPoint;
    }).elementsFromPoint = originalElementsFromPoint;
  });

  it('resolves root drops from the root row, root file rows, and root blank area', () => {
    const { root, rootRow, rootFile } = createDropTargetTree();

    setElementsFromPoint([rootRow]);
    expect(resolveExternalFolderDropTargetPath(1, 1)).toBe('');

    setElementsFromPoint([rootFile]);
    expect(resolveExternalFolderDropTargetPath(1, 1)).toBe('');

    setElementsFromPoint([root]);
    expect(resolveExternalFolderDropTargetPath(1, 1)).toBe('');
  });

  it('prefers nested folder targets over the root wrapper', () => {
    const { folder, folderSpacer, folderFile, childFolder } = createDropTargetTree();

    setElementsFromPoint([folder]);
    expect(resolveExternalFolderDropTargetPath(1, 1)).toBe('docs');

    setElementsFromPoint([folderSpacer]);
    expect(resolveExternalFolderDropTargetPath(1, 1)).toBe('docs');

    setElementsFromPoint([folderFile]);
    expect(resolveExternalFolderDropTargetPath(1, 1)).toBe('docs');

    setElementsFromPoint([childFolder]);
    expect(resolveExternalFolderDropTargetPath(1, 1)).toBe('docs/sub');
  });

  it('resolves flattened virtualized file rows to their recorded parent folder', () => {
    const { virtualizedFolderFileLabel } = createDropTargetTree();

    setElementsFromPoint([virtualizedFolderFileLabel]);
    expect(resolveExternalFolderDropTargetPath(1, 1)).toBe('docs');
    expect(resolveInternalMoveDropTargetPath(1, 1, 'archive/source.md')).toBe('docs');
    expect(resolveInternalMoveDropTargetPath(1, 1, 'docs/source.md')).toBe('docs');
  });

  it('keeps current parents as feedback targets while rejecting other invalid moves', () => {
    const { root, folder, childFolder } = createDropTargetTree();

    setElementsFromPoint([folder]);
    expect(resolveInternalMoveDropTargetPath(1, 1, 'docs/a.md')).toBe('docs');

    setElementsFromPoint([childFolder]);
    expect(resolveInternalMoveDropTargetPath(1, 1, 'docs')).toBeNull();

    setElementsFromPoint([root]);
    expect(resolveInternalMoveDropTargetPath(1, 1, 'docs/a.md')).toBe('');
  });

  it('resolves the starred target from an SVG icon descendant', () => {
    const starredTarget = document.createElement('div');
    starredTarget.dataset.fileTreeStarredDropTarget = 'true';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    starredTarget.appendChild(icon);
    document.body.appendChild(starredTarget);

    expect(resolveStarredDropTargetFromElements([icon])).toBe(true);
  });
});
