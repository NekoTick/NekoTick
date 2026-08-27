import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatEmbeddedSidebarOverlay } from './ChatEmbeddedSidebarOverlay';

vi.mock('@/components/Chat/features/Sidebar/ChatSidebar', () => ({
  ChatSidebar: () => <div>Embedded sidebar content</div>,
}));

vi.mock('@/components/Chat/hooks/useChatModalFocus', () => ({
  useChatModalFocus: () => undefined,
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe('ChatEmbeddedSidebarOverlay', () => {
  it('does not keep the open full-height sidebar on a dedicated transform layer', () => {
    render(<ChatEmbeddedSidebarOverlay isOpen onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveClass('transform-gpu');
    expect(dialog).not.toHaveClass('will-change-transform');
  });
});
