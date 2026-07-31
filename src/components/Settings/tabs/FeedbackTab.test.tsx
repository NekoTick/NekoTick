import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackTab } from './FeedbackTab';

const mocks = vi.hoisted(() => ({
  submitFeedback: vi.fn().mockResolvedValue({ success: true }),
  addToast: vi.fn(),
}));

vi.mock('@/lib/electron/bridge', () => ({
  getElectronBridge: () => ({
    account: {
      submitFeedback: mocks.submitFeedback,
    },
  }),
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('@/stores/useToastStore', () => ({
  useToastStore: (selector: (state: { addToast: typeof mocks.addToast }) => unknown) =>
    selector({ addToast: mocks.addToast }),
}));

describe('FeedbackTab', () => {
  beforeEach(() => {
    mocks.submitFeedback.mockClear();
    mocks.addToast.mockClear();
  });

  it('names the feedback field independently of its placeholder', () => {
    render(<FeedbackTab />);

    expect(screen.getByRole('textbox', { name: 'settings.feedback.title' })).toBeInTheDocument();
  });

  it('does not submit feedback while IME composition is active', async () => {
    render(<FeedbackTab />);

    const textarea = screen.getByPlaceholderText('settings.feedback.placeholder');
    const submitButton = screen.getByText('settings.feedback.submit');

    fireEvent.compositionStart(textarea);
    fireEvent.change(textarea, { target: { value: 'nihon' } });
    fireEvent.click(submitButton);

    expect(mocks.submitFeedback).not.toHaveBeenCalled();

    fireEvent.compositionEnd(textarea);
    fireEvent.change(textarea, { target: { value: '日本' } });
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(mocks.submitFeedback).toHaveBeenCalledWith('日本');
    });
  });

  it('never submits feedback beyond the declared character limit', async () => {
    render(<FeedbackTab />);

    const textarea = screen.getByPlaceholderText('settings.feedback.placeholder');
    fireEvent.change(textarea, { target: { value: 'x'.repeat(2200) } });
    expect(textarea).toHaveValue('x'.repeat(2000));
    fireEvent.click(screen.getByText('settings.feedback.submit'));

    await waitFor(() => {
      expect(mocks.submitFeedback).toHaveBeenCalledWith('x'.repeat(2000));
    });
    expect(textarea).toHaveAttribute('maxlength', '2000');
  });
});
