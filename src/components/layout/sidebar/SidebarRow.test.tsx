import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SidebarRow } from './SidebarRow';

describe('SidebarRow', () => {
  it('keeps the active row surface when the row is also highlighted', () => {
    render(
      <SidebarRow
        main={<span>Selected item</span>}
        isActive
        isHighlighted
        activeClassName="active-surface"
        highlightClassName="highlight-surface"
        inactiveClassName="inactive-surface"
      />,
    );

    const rowSurface = screen.getByText('Selected item').closest('.active-surface');

    expect(rowSurface).toBeTruthy();
    expect(rowSurface).not.toHaveClass('highlight-surface');
  });

  it('keeps focus-based action visibility opt-in', () => {
    render(
      <SidebarRow
        main={<span>Shared row</span>}
        actions={<button type="button">More</button>}
        activeClassName="active-surface"
        inactiveClassName="inactive-surface"
      />,
    );

    expect(screen.getByRole('button', { name: 'More' }).parentElement?.className)
      .not.toContain('group-focus-within/sidebar-row');
  });

  it('centers row actions without a vertical transform', () => {
    render(
      <SidebarRow
        main={<span>Shared row</span>}
        actions={<button type="button">More</button>}
        activeClassName="active-surface"
        inactiveClassName="inactive-surface"
      />,
    );

    const actionContainer = screen.getByRole('button', { name: 'More' }).parentElement;

    expect(actionContainer).toHaveClass('inset-y-0', 'flex', 'items-center');
    expect(actionContainer).not.toHaveClass('top-1/2', '-translate-y-1/2');
  });

  it('centers trailing content without a vertical transform', () => {
    render(
      <SidebarRow
        main={<span>Shared row</span>}
        trailing={<span>Status</span>}
        activeClassName="active-surface"
        inactiveClassName="inactive-surface"
      />,
    );

    const trailingContainer = screen.getByText('Status').parentElement;

    expect(trailingContainer).toHaveClass('inset-y-0', 'flex', 'items-center');
    expect(trailingContainer).not.toHaveClass('top-1/2', '-translate-y-1/2');
  });
});
