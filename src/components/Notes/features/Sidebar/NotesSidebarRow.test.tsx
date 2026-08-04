import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NotesSidebarRow } from './NotesSidebarRow';

describe('NotesSidebarRow', () => {
  it('keeps inactive action fades transparent while the row is hovered', () => {
    render(
      <NotesSidebarRow
        main={<span>alpha.md</span>}
        actions={<button type="button">More</button>}
      />,
    );

    const fade = screen.getByRole('button', { name: 'More' }).parentElement?.firstElementChild;

    expect(fade).toHaveClass('from-transparent');
    expect(fade).toHaveClass('group-hover/sidebar-row:from-transparent');
    expect(fade?.className).not.toContain('from-[var(--vlaina-sidebar-notes-fade)]');
  });

  it('uses background-only feedback for drag targets', () => {
    render(
      <NotesSidebarRow
        main={<span>target</span>}
        isDragOver
      />,
    );

    const row = screen.getByText('target').parentElement?.parentElement;
    const classNames = row?.className.split(/\s+/) ?? [];

    expect(row).toHaveClass('bg-[var(--vlaina-sidebar-notes-row-drag)]');
    expect(classNames.some((className) => className.startsWith('ring-'))).toBe(false);
    expect(classNames.filter((className) => className.startsWith('shadow-'))).toEqual([
      'shadow-[var(--vlaina-shadow-none)]',
    ]);
  });
});
