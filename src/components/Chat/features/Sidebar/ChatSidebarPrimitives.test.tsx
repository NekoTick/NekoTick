import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatSidebarHoverEmptyHint, ChatSidebarRow } from './ChatSidebarPrimitives';

describe('ChatSidebarPrimitives', () => {
  it('centers the empty hint within its sidebar positioning container', () => {
    render(<ChatSidebarHoverEmptyHint title="No conversations" />);

    expect(screen.getByText('No conversations').parentElement).toHaveClass(
      'absolute',
      'inset-0',
      'items-center',
      'justify-center',
    );
  });

  it('keeps inactive action fades transparent while the row is hovered', () => {
    render(
      <ChatSidebarRow
        main={<span>Alpha chat</span>}
        actions={<button type="button">More</button>}
      />,
    );

    const fade = screen.getByRole('button', { name: 'More' }).parentElement?.firstElementChild;

    expect(fade).toHaveClass('from-transparent');
    expect(fade).toHaveClass('group-hover/sidebar-row:from-transparent');
    expect(fade?.className).not.toContain('from-[var(--vlaina-sidebar-chat-fade)]');
  });

  it('reveals Chat row actions while focus is inside the row', () => {
    render(
      <ChatSidebarRow
        main={<span>Keyboard chat</span>}
        actions={<button type="button">More actions</button>}
      />,
    );

    expect(screen.getByRole('button', { name: 'More actions' }).parentElement)
      .toHaveClass('group-focus-within/sidebar-row:pointer-events-auto');
    expect(screen.getByRole('button', { name: 'More actions' }).parentElement)
      .toHaveClass('group-focus-within/sidebar-row:opacity-[var(--vlaina-opacity-100)]');
  });
});
