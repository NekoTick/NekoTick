import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatInputActions } from './ChatInputActions';

const useI18nMock = vi.hoisted(() => vi.fn(() => ({ t: (key: string) => key })));

vi.mock('@/lib/i18n', () => ({
  useI18n: useI18nMock,
}));

function renderActions(overrides: Partial<Parameters<typeof ChatInputActions>[0]> = {}) {
  const noop = vi.fn();
  return render(
    <ChatInputActions
      onTriggerFileSelect={noop}
      onTriggerMentionSelect={noop}
      hasMentionCandidates={true}
      isLoading={false}
      canSend={false}
      canSubmit={false}
      webSearchEnabled={false}
      onToggleWebSearch={noop}
      onRequestComposerFocus={noop}
      onStop={noop}
      onSend={noop}
      {...overrides}
    />
  );
}

describe('ChatInputActions', () => {
  beforeEach(() => {
    useI18nMock.mockClear();
  });

  it('skips static action rendering when the composer text changes without changing action props', () => {
    const noop = vi.fn();
    const props: Parameters<typeof ChatInputActions>[0] = {
      onTriggerFileSelect: noop,
      onTriggerMentionSelect: noop,
      hasMentionCandidates: true,
      isLoading: false,
      canSend: true,
      canSubmit: true,
      webSearchEnabled: false,
      onToggleWebSearch: noop,
      onRequestComposerFocus: noop,
      onStop: noop,
      onSend: noop,
    };
    const view = render(<ChatInputActions {...props} />);
    const renderCount = useI18nMock.mock.calls.length;

    view.rerender(<ChatInputActions {...props} />);

    expect(useI18nMock).toHaveBeenCalledTimes(renderCount);
  });

  it('shows the add actions button background only on hover', () => {
    renderActions();

    const addButton = screen.getByRole('button', { name: 'chat.openActions' });

    expect(addButton.className).toContain('!bg-transparent');
    expect(addButton.className).toContain('!shadow-none');
    expect(addButton.className).toContain('hover:!bg-[var(--vlaina-color-pill-surface-hover)]');
    expect(addButton.className).toContain('hover:!shadow-[var(--vlaina-shadow-menu-hover)]');
    expect(addButton.className).toContain('text-[var(--vlaina-accent)]');
    expect(addButton.className).toContain('hover:text-[var(--vlaina-accent-hover)]');
  });

  it('keeps the empty send button in the app accent treatment instead of gray', () => {
    renderActions();

    const sendButton = screen.getByRole('button', { name: 'common.send' });

    expect(sendButton).toBeDisabled();
    expect(sendButton.className).toContain('bg-[var(--vlaina-color-pill-surface-hover)]');
    expect(sendButton.className).toContain('text-[var(--vlaina-accent)]');
    expect(sendButton.className).toContain('opacity-[var(--vlaina-opacity-45)]');
    expect(sendButton.className).toContain('shadow-[var(--vlaina-shadow-menu-hover)]');
    expect(sendButton.className).not.toContain('text-[var(--vlaina-color-text-soft)]');
  });

  it('can keep send visually inactive even when the composer has sendable content', () => {
    renderActions({
      canSend: true,
      canSubmit: false,
      showSendReadyState: false,
    });

    const sendButton = screen.getByRole('button', { name: 'common.send' });

    expect(sendButton).toBeDisabled();
    expect(sendButton.className).toContain('opacity-[var(--vlaina-opacity-45)]');
    expect(sendButton.className).not.toContain('opacity-[var(--vlaina-opacity-60)]');
  });

  it('hides the mention action when there are no mention candidates', () => {
    renderActions({ hasMentionCandidates: false });

    fireEvent.click(screen.getByRole('button', { name: 'chat.openActions' }));

    expect(screen.queryByRole('button', { name: '@chat.mentionFileOrFolder' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'chat.uploadFile' })).toBeInTheDocument();
  });

  it('shows the mention action when a mention candidate is available', () => {
    renderActions({ hasMentionCandidates: true });

    fireEvent.click(screen.getByRole('button', { name: 'chat.openActions' }));

    expect(screen.getByRole('button', { name: '@chat.mentionFileOrFolder' })).toBeInTheDocument();
  });

  it('restores composer focus after the upload action closes', async () => {
    const onRequestComposerFocus = vi.fn();
    renderActions({ onRequestComposerFocus });

    fireEvent.click(screen.getByRole('button', { name: 'chat.openActions' }));
    fireEvent.click(screen.getByRole('button', { name: 'chat.uploadFile' }));

    await waitFor(() => {
      expect(onRequestComposerFocus).toHaveBeenCalledTimes(1);
    });
  });

  it('hides computer control outside the desktop runtime', () => {
    renderActions({ computerUseAvailable: false });

    fireEvent.click(screen.getByRole('button', { name: 'chat.openActions' }));

    expect(screen.queryByRole('button', { name: 'chat.computerUse' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'chat.computerUse.disable' })).not.toBeInTheDocument();
  });

  it('requests confirmation before enabling desktop computer control', () => {
    const onRequestEnableComputerUse = vi.fn();
    renderActions({
      computerUseAvailable: true,
      computerUseEnabled: false,
      onRequestEnableComputerUse,
    });

    fireEvent.click(screen.getByRole('button', { name: 'chat.openActions' }));
    fireEvent.click(screen.getByRole('button', { name: 'chat.computerUse' }));

    expect(onRequestEnableComputerUse).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'chat.computerUse' })).not.toBeInTheDocument();
  });

  it('shows an active desktop control button that disables the feature directly', () => {
    const onDisableComputerUse = vi.fn();
    const onRequestComposerFocus = vi.fn();
    renderActions({
      computerUseAvailable: true,
      computerUseEnabled: true,
      onDisableComputerUse,
      onRequestComposerFocus,
    });

    const activeButton = screen.getByRole('button', { name: 'chat.computerUse.disable' });
    expect(activeButton).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(activeButton);

    expect(onDisableComputerUse).toHaveBeenCalledTimes(1);
    expect(onRequestComposerFocus).toHaveBeenCalledTimes(1);
  });
});
