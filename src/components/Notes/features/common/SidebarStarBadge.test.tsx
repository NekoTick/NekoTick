import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SidebarStarBadge } from './SidebarStarBadge';

describe('SidebarStarBadge', () => {
  it('centers itself without a vertical transform', () => {
    render(
      <div className="relative h-5">
        <SidebarStarBadge ariaLabel="Star note" />
      </div>,
    );

    const badge = screen.getByRole('button', { name: 'Star note' });

    expect(badge).toHaveClass('inset-y-0', 'my-auto');
    expect(badge).not.toHaveClass('top-1/2', '-translate-y-1/2');
  });
});
