import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChatErrorNotice } from './ChatErrorNotice';

describe('ChatErrorNotice', () => {
  it('announces the error and lets the user dismiss it', () => {
    const onDismiss = vi.fn();

    render(
      <ChatErrorNotice
        closeLabel="Close"
        message="The chat could not be saved."
        onDismiss={onDismiss}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('The chat could not be saved.');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
