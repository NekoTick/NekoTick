import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProviderQuickAdd } from './ProviderQuickAdd';

vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span aria-hidden="true" data-testid={`icon-${name}`} />,
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}));

describe('ProviderQuickAdd', () => {
  it('names the model quick-add field', () => {
    render(
      <ProviderQuickAdd
        value=""
        error=""
        sortedFetchedModels={[]}
        providerModelIdSet={new Set()}
        onValueChange={vi.fn()}
        onAddAllVisible={vi.fn()}
        onSetError={vi.fn()}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'settings.ai.addModelId' })).toBeInTheDocument();
  });

  it('does not submit a model id while IME composition is active', () => {
    const onAddAllVisible = vi.fn();
    const onValueChange = vi.fn();

    render(
      <ProviderQuickAdd
        value="nihon"
        error=""
        sortedFetchedModels={[]}
        providerModelIdSet={new Set()}
        onValueChange={onValueChange}
        onAddAllVisible={onAddAllVisible}
        onSetError={vi.fn()}
      />,
    );

    const input = screen.getByDisplayValue('nihon');
    const addButton = screen.getByRole('button', { name: 'settings.ai.addModels' });

    fireEvent.compositionStart(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(addButton);

    expect(onAddAllVisible).not.toHaveBeenCalled();
  });

  it('exposes suggestions as a combobox and dismisses them with Escape', () => {
    render(
      <ProviderQuickAdd
        value="gm"
        error=""
        sortedFetchedModels={['gpt-4o-mini', 'gemini-pro']}
        providerModelIdSet={new Set()}
        onValueChange={vi.fn()}
        onAddAllVisible={vi.fn()}
        onSetError={vi.fn()}
      />,
    );

    const input = screen.getByRole('combobox', { name: 'settings.ai.addModelId' });
    act(() => input.focus());

    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');

    fireEvent.keyDown(input, { key: 'Escape' });

    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
