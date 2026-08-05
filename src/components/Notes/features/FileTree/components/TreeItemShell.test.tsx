import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TreeItemShell } from './TreeItemShell';

describe('TreeItemShell', () => {
  it('uses background-only feedback for expanded folder drag targets', () => {
    const { container } = render(
      <TreeItemShell
        itemPath="docs"
        itemKind="folder"
        depth={0}
        leading={<span />}
        main={<span>docs</span>}
        isTreeDragOver
        showMenuButton={false}
        menuButtonLabel="Open folder menu"
        onMenuClick={vi.fn()}
      >
        <div>inside.md</div>
      </TreeItemShell>,
    );

    const shell = container.querySelector('[data-file-tree-path="docs"]');
    const classNames = shell?.className.split(/\s+/) ?? [];

    expect(shell).toHaveClass('bg-[var(--vlaina-sidebar-notes-row-drag)]');
    expect(classNames.some((className) => className.startsWith('ring-'))).toBe(false);
    expect(classNames.some((className) => className.startsWith('shadow-'))).toBe(false);
  });
});
