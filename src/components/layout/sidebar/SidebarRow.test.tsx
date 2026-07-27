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
});
