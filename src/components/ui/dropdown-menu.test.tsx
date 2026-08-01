import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from './dropdown-menu';

describe('dropdown-menu', () => {
  it('stays open when the application window loses focus', async () => {
    render(
      <DropdownMenu defaultOpen>
        <DropdownMenuContent>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <span>Menu content</span>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    fireEvent.pointerMove(screen.getByText('Export'), { pointerType: 'mouse' });
    await waitFor(() => {
      expect(screen.getByText('Menu content')).toBeInTheDocument();
    });

    fireEvent(window, new Event('blur'));

    expect(screen.getByText('Menu content')).toBeInTheDocument();
    await Promise.resolve();

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByText('Menu content')).not.toBeInTheDocument();
    });
  });

  it('renders submenu content in a portal', () => {
    const { container } = render(
      <DropdownMenu open>
        <DropdownMenuContent forceMount>
          <DropdownMenuSub open>
            <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
            <DropdownMenuSubContent forceMount>
              <button type="button">PDF</button>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    const submenuItem = screen.getByText('PDF');

    expect(submenuItem).toBeInTheDocument();
    expect(container).not.toContainElement(submenuItem);
  });
});
