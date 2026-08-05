import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProviderConnectionFields, isDefaultChannelName } from './ProviderConnectionFields';
import { MAX_AI_MODEL_FIELD_CHARS } from '@/lib/storage/unifiedStorageSaveTypes';

function buildProps(overrides: Partial<Parameters<typeof ProviderConnectionFields>[0]> = {}) {
  const props: Parameters<typeof ProviderConnectionFields>[0] = {
    providerId: 'provider-1',
    name: 'Channel 1',
    apiHost: '',
    apiKey: 'sk-1234567890abcdef',
    showApiKey: false,
    apiKeyCopied: false,
    onNameChange: vi.fn(),
    onApiHostChange: vi.fn(),
    onApiKeyChange: vi.fn(),
    onToggleApiKey: vi.fn(),
    onCopyApiKey: vi.fn(),
    ...overrides,
  };

  return props;
}

function renderFields(overrides: Partial<Parameters<typeof ProviderConnectionFields>[0]> = {}) {
  const props = buildProps(overrides);
  render(<ProviderConnectionFields {...props} />);
  return props;
}

describe('ProviderConnectionFields API key input', () => {
  it('names every provider connection field', () => {
    renderFields({ apiHost: 'https://api.example.com' });

    expect(screen.getByRole('textbox', { name: 'Channel Name' })).toHaveValue('Channel 1');
    expect(screen.getByRole('textbox', { name: 'Base URL' })).toHaveValue('https://api.example.com');
    expect(screen.getByRole('textbox', { name: 'API Key' })).toBeInTheDocument();
  });

  it('matches provider text field limits to the persistence contract', () => {
    renderFields({ apiHost: 'https://api.example.com' });

    expect(screen.getByRole('textbox', { name: 'Channel Name' }))
      .toHaveAttribute('maxlength', String(MAX_AI_MODEL_FIELD_CHARS));
    expect(screen.getByRole('textbox', { name: 'Base URL' }))
      .toHaveAttribute('maxlength', String(MAX_AI_MODEL_FIELD_CHARS));
    expect(screen.getByRole('textbox', { name: 'API Key' }))
      .toHaveAttribute('maxlength', String(MAX_AI_MODEL_FIELD_CHARS));
  });

  it('shows a prefix and suffix mask for an existing key by default', () => {
    const props = renderFields();
    const input = screen.getByDisplayValue('sk-1234••••••cdef');

    expect(input).toHaveAttribute('type', 'text');
    expect(props.onToggleApiKey).not.toHaveBeenCalled();
  });

  it('reveals the key only when requested', () => {
    renderFields({ showApiKey: true });
    const input = screen.getByDisplayValue('sk-1234567890abcdef');

    expect(input).toHaveAttribute('type', 'text');
  });

  it('reveals a masked key on focus without forcing selection', () => {
    renderFields();
    const input = screen.getByDisplayValue('sk-1234••••••cdef') as HTMLInputElement;

    fireEvent.focus(input);

    const focusedInput = screen.getByDisplayValue('sk-1234567890abcdef') as HTMLInputElement;
    expect(focusedInput.selectionStart).toBe(focusedInput.selectionEnd);
  });

  it('selects the key body after sk- when double clicked', async () => {
    renderFields();
    const input = screen.getByDisplayValue('sk-1234••••••cdef') as HTMLInputElement;

    fireEvent.focus(input);
    const focusedInput = screen.getByDisplayValue('sk-1234567890abcdef') as HTMLInputElement;
    fireEvent.doubleClick(focusedInput);

    await waitFor(() => {
      expect(focusedInput.selectionStart).toBe(3);
      expect(focusedInput.selectionEnd).toBe('sk-1234567890abcdef'.length);
    });
  });

  it('keeps the full key visible after editing focus leaves', () => {
    renderFields();
    const input = screen.getByDisplayValue('sk-1234••••••cdef');

    fireEvent.focus(input);
    fireEvent.blur(screen.getByDisplayValue('sk-1234567890abcdef'));

    expect(screen.getByDisplayValue('sk-1234567890abcdef')).toBeInTheDocument();
  });

  it('asks the parent to toggle visibility when the eye button is clicked', () => {
    const props = renderFields();

    fireEvent.click(screen.getByLabelText('Show API Key'));

    expect(props.onToggleApiKey).toHaveBeenCalledTimes(1);
  });

  it('asks the parent to hide when parent-controlled visibility is already enabled', () => {
    const props = renderFields({ showApiKey: true });
    const input = screen.getByDisplayValue('sk-1234567890abcdef');

    fireEvent.focus(input);
    fireEvent.click(screen.getByLabelText('Hide API Key'));

    expect(props.onToggleApiKey).toHaveBeenCalledTimes(1);
  });

  it('hides a key revealed for editing without toggling parent visibility', () => {
    const props = renderFields();
    const input = screen.getByDisplayValue('sk-1234••••••cdef');

    fireEvent.focus(input);
    fireEvent.click(screen.getByLabelText('Hide API Key'));

    expect(props.onToggleApiKey).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('sk-1234••••••cdef')).toBeInTheDocument();
  });

  it('does not show native browser tooltips on visibility and copy buttons', () => {
    renderFields();

    expect(screen.getByLabelText('Show API Key')).not.toHaveAttribute('title');
    expect(screen.getByLabelText('Copy')).not.toHaveAttribute('title');
  });

  it('marks the copy button with the shared copied animation state', () => {
    renderFields({ apiKeyCopied: true });

    const copyButton = screen.getByLabelText('Copied');
    expect(copyButton).toHaveAttribute('data-action', 'copy');
    expect(copyButton).toHaveAttribute('data-copied', 'true');
    expect(copyButton).toHaveClass('settings-api-key-copy-button');
  });

  it('keeps an empty key editable while hidden', () => {
    const props = renderFields({ apiKey: '' });
    const input = screen.getByPlaceholderText('sk-...');

    expect(input).not.toHaveAttribute('readonly');
    expect(screen.getByLabelText('Show API Key')).toBeInTheDocument();

    fireEvent.focus(input);
    expect(screen.getByLabelText('Show API Key')).toBeInTheDocument();
    fireEvent.change(input, { target: { value: 's' } });
    expect(props.onApiKeyChange).toHaveBeenCalledWith('s');
  });

  it('keeps a newly entered key fully visible while editing from empty', () => {
    const props = buildProps({ apiKey: '' });
    const { rerender } = render(<ProviderConnectionFields {...props} />);
    const input = screen.getByPlaceholderText('sk-...');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'sk-new-key' } });
    rerender(<ProviderConnectionFields {...props} apiKey="sk-new-key" />);

    expect(screen.getByDisplayValue('sk-new-key')).toBeInTheDocument();
  });

  it('keeps an existing hidden key editable', () => {
    const props = renderFields();
    const input = screen.getByDisplayValue('sk-1234••••••cdef');

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'sk-partial-more' } });
    expect(props.onApiKeyChange).toHaveBeenCalledWith('sk-partial-more');
  });
});

describe('ProviderConnectionFields channel name input', () => {
  it('recognizes generated channel labels with and without spaces', () => {
    expect(isDefaultChannelName('Channel 1')).toBe(true);
    expect(isDefaultChannelName('channel1')).toBe(true);
    expect(isDefaultChannelName('My channel1')).toBe(false);
  });

  it('selects an unchanged generated channel name when clicked', async () => {
    renderFields({ name: 'channel1' });
    const input = screen.getByDisplayValue('channel1') as HTMLInputElement;

    fireEvent.click(input);

    await waitFor(() => {
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe('channel1'.length);
    });
  });

  it('does not auto-select a custom channel name when clicked', async () => {
    renderFields({ name: 'Work API' });
    const input = screen.getByDisplayValue('Work API') as HTMLInputElement;

    input.setSelectionRange(4, 4);
    fireEvent.click(input);

    await new Promise((resolve) => window.setTimeout(resolve, 0));
    expect(input.selectionStart).toBe(4);
    expect(input.selectionEnd).toBe(4);
  });

  it('reports composition state changes for provider text fields', () => {
    const onCompositionChange = vi.fn();
    renderFields({ onCompositionChange });
    const nameInput = screen.getByDisplayValue('Channel 1');

    fireEvent.compositionStart(nameInput);
    fireEvent.compositionEnd(nameInput);

    expect(onCompositionChange).toHaveBeenNthCalledWith(1, true);
    expect(onCompositionChange).toHaveBeenNthCalledWith(2, false);
  });
});

describe('ProviderConnectionFields base URL input', () => {
  it('associates a mobile HTTPS validation error with the base URL field', () => {
    renderFields({
      apiHost: 'http://localhost:11434',
      apiHostError: 'Mobile providers require an HTTPS Base URL.',
    });

    const input = screen.getByRole('textbox', { name: 'Base URL' });
    const error = screen.getByRole('alert');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', error.id);
    expect(error).toHaveTextContent('Mobile providers require an HTTPS Base URL.');
  });

  it('focuses the base URL field when requested on mount', async () => {
    const onBaseUrlAutoFocusComplete = vi.fn();
    renderFields({
      apiHost: 'https://api.example.com',
      autoFocusBaseUrl: true,
      onBaseUrlAutoFocusComplete,
    });
    const input = screen.getByDisplayValue('https://api.example.com') as HTMLInputElement;

    await waitFor(() => {
      expect(document.activeElement).toBe(input);
    });

    expect(input.selectionStart).toBe('https://api.example.com'.length);
    expect(input.selectionEnd).toBe('https://api.example.com'.length);
    expect(onBaseUrlAutoFocusComplete).toHaveBeenCalledTimes(1);
  });
});
