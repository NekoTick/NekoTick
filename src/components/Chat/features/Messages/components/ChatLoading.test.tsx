import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatLoading } from './ChatLoading';

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe('ChatLoading', () => {
  it('announces the waiting state without exposing animated dots', () => {
    render(<ChatLoading />);

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('chat.waitingForResponse');
    expect(status.querySelectorAll('[aria-hidden="true"]')).toHaveLength(3);
  });
});
