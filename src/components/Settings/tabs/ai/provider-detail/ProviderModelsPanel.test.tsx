import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type {
  ChangeEventHandler,
  ComponentProps,
  FocusEventHandler,
  KeyboardEventHandler,
} from 'react';
import { ProviderModelsPanel } from './ProviderModelsPanel';
import type { AIModel } from '@/lib/ai/types';
import type { HealthStatus } from '../components/ModelListItem';

const clipboardMocks = vi.hoisted(() => ({ writeTextToClipboard: vi.fn() }));

vi.mock('@/lib/clipboard', () => ({
  writeTextToClipboard: clipboardMocks.writeTextToClipboard,
}));

vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('@/components/Settings/components/SettingsFields', () => ({
  SettingsTextInput: ({
    value,
    onChange,
    placeholder,
    'aria-label': ariaLabel,
    onFocus,
    onBlur,
    onKeyDown,
  }: {
    value?: string;
    onChange?: ChangeEventHandler<HTMLInputElement>;
    placeholder?: string;
    'aria-label'?: string;
    onFocus?: FocusEventHandler<HTMLInputElement>;
    onBlur?: FocusEventHandler<HTMLInputElement>;
    onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  }) => (
    <input
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    />
  ),
}));

function buildModel(id: string, apiModelId = id): AIModel {
  return {
    id,
    apiModelId,
    name: apiModelId,
    providerId: 'provider-1',
    enabled: true,
    createdAt: 1,
  };
}

function buildProps(overrides: Partial<ComponentProps<typeof ProviderModelsPanel>> = {}) {
  return {
    providerId: 'provider-1',
    providerModels: [buildModel('model-alpha', 'alpha')],
    filteredProviderModels: [buildModel('model-alpha', 'alpha')],
    sortedFetchedModels: ['alpha', 'beta'],
    filteredFetchedModels: ['alpha', 'beta'],
    providerModelIdSet: new Set(['alpha']),
    modelQuery: '',
    quickAddModelId: '',
    quickAddError: '',
    fetchError: '' as const,
    isFetchingModels: false,
    canUseConnectionActions: true,
    canBenchmark: true,
    canBenchmarkSelected: true,
    canBenchmarkAvailable: true,
    isHealthChecking: false,
    benchmarkAllActive: false,
    benchmarkAllQueued: false,
    selectedBenchmarkActive: false,
    availableBenchmarkActive: false,
    queuedBenchmarkModelIds: [],
    healthCheckOverall: 'idle' as const,
    healthStatus: {} as Record<string, HealthStatus>,
    onQuickAddModelIdChange: vi.fn(),
    onModelQueryChange: vi.fn(),
    onFetchModels: vi.fn(),
    onBenchmark: vi.fn(),
    onBenchmarkSelected: vi.fn(),
    onBenchmarkAvailable: vi.fn(),
    onBenchmarkModel: vi.fn(),
    onClearAllModels: vi.fn(),
    onDeleteModel: vi.fn(),
    onAddModel: vi.fn(() => true),
    onAddAllVisible: vi.fn(),
    onSetQuickAddError: vi.fn(),
    ...overrides,
  };
}

function setScrollMetrics(
  element: HTMLElement,
  metrics: { clientHeight: number; scrollHeight: number; scrollTop?: number },
) {
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    get: () => metrics.clientHeight,
  });
  Object.defineProperty(element, 'scrollHeight', {
    configurable: true,
    get: () => metrics.scrollHeight,
  });

  let currentScrollTop = metrics.scrollTop ?? 0;
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => currentScrollTop,
    set: (value: number) => {
      currentScrollTop = value;
    },
  });
}

describe('ProviderModelsPanel', () => {
  it('names the model filter field', () => {
    render(<ProviderModelsPanel {...buildProps()} />);

    expect(screen.getByRole('textbox', { name: 'Filter models...' })).toBeInTheDocument();
  });

  it('allows a model id to be added before a provider model catalog is fetched', () => {
    const onAddAllVisible = vi.fn();
    render(
      <ProviderModelsPanel
        {...buildProps({
          providerModels: [],
          filteredProviderModels: [],
          sortedFetchedModels: [],
          filteredFetchedModels: [],
          providerModelIdSet: new Set(),
          quickAddModelId: 'manual-model',
          onAddAllVisible,
        })}
      />,
    );

    fireEvent.keyDown(screen.getByPlaceholderText('Add a model ID'), { key: 'Enter' });

    expect(onAddAllVisible).toHaveBeenCalledWith(['manual-model']);
  });

  it('shows empty states when an active query matches nothing', () => {
    render(
      <ProviderModelsPanel
        {...buildProps({
          modelQuery: 'zzz',
          filteredProviderModels: [],
          filteredFetchedModels: [],
        })}
      />,
    );

    expect(screen.getByText('No selected models')).toBeInTheDocument();
    expect(screen.getByText('No available models')).toBeInTheDocument();
    expect(screen.queryByText('alpha')).not.toBeInTheDocument();
    expect(screen.queryByText('beta')).not.toBeInTheDocument();
  });

  it('updates expanded model lists when the filter query changes', () => {
    const { rerender } = render(<ProviderModelsPanel {...buildProps()} />);

    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();

    rerender(
      <ProviderModelsPanel
        {...buildProps({
          modelQuery: 'b',
          filteredProviderModels: [],
          filteredFetchedModels: ['beta'],
        })}
      />,
    );

    expect(screen.queryByText('alpha')).not.toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('adds an available model when its row is clicked', () => {
    const onAddModel = vi.fn(() => true);

    render(<ProviderModelsPanel {...buildProps({ onAddModel })} />);

    fireEvent.click(screen.getByText('beta'));

    expect(onAddModel).toHaveBeenCalledWith('beta');
  });

  it('benchmarks selected and available models without toggling their rows', () => {
    const onBenchmarkModel = vi.fn();
    const onAddModel = vi.fn(() => true);
    const onDeleteModel = vi.fn();

    render(<ProviderModelsPanel {...buildProps({ onBenchmarkModel, onAddModel, onDeleteModel })} />);

    const benchmarkButtons = screen.getAllByRole('button', { name: 'Benchmark All' });
    fireEvent.click(benchmarkButtons[1]);
    fireEvent.click(benchmarkButtons[2]);

    expect(onBenchmarkModel).toHaveBeenNthCalledWith(1, 'model-alpha');
    expect(onBenchmarkModel).toHaveBeenNthCalledWith(2, 'provider-1::beta');
    expect(onDeleteModel).not.toHaveBeenCalled();
    expect(onAddModel).not.toHaveBeenCalled();
  });

  it('names the selected and available section benchmark buttons', () => {
    render(<ProviderModelsPanel {...buildProps()} />);

    expect(screen.getByRole('button', { name: 'Benchmark All: Selected' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Benchmark All: Available' })).toBeInTheDocument();
  });

  it.each(['Enter', ' '])('does not toggle a model when a nested benchmark button handles %s', (key) => {
    const onAddModel = vi.fn(() => true);
    const onDeleteModel = vi.fn();

    render(<ProviderModelsPanel {...buildProps({ onAddModel, onDeleteModel })} />);

    const benchmarkButtons = screen.getAllByRole('button', { name: 'Benchmark All' });
    fireEvent.keyDown(benchmarkButtons[1], { key });
    fireEvent.keyDown(benchmarkButtons[2], { key });

    expect(onDeleteModel).not.toHaveBeenCalled();
    expect(onAddModel).not.toHaveBeenCalled();
  });

  it('keeps a completed model benchmark button available for retesting', () => {
    const onBenchmarkModel = vi.fn();
    render(
      <ProviderModelsPanel
        {...buildProps({
          healthStatus: { 'model-alpha': { status: 'success', latency: 120 } },
          onBenchmarkModel,
        })}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Benchmark All' })[1]);

    expect(onBenchmarkModel).toHaveBeenCalledWith('model-alpha');
  });

  it('retests a model when its failed result is clicked', () => {
    const onBenchmarkModel = vi.fn();
    render(
      <ProviderModelsPanel
        {...buildProps({
          healthStatus: { 'model-alpha': { status: 'error', error: 'Unavailable' } },
          onBenchmarkModel,
        })}
      />,
    );

    fireEvent.click(screen.getByText('Failed'));

    expect(onBenchmarkModel).toHaveBeenCalledWith('model-alpha');
  });

  it('copies a failed benchmark error from the info button without toggling the row', async () => {
    clipboardMocks.writeTextToClipboard.mockResolvedValue(true);
    const onDeleteModel = vi.fn();
    render(
      <ProviderModelsPanel
        {...buildProps({
          healthStatus: { 'model-alpha': { status: 'error', error: 'Request timed out' } },
          onDeleteModel,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Copy: Request timed out' }));

    await waitFor(() => {
      expect(clipboardMocks.writeTextToClipboard).toHaveBeenCalledWith('Request timed out');
    });
    expect(onDeleteModel).not.toHaveBeenCalled();
  });

  it('allows another model to be queued while a benchmark is running', () => {
    const onBenchmarkModel = vi.fn();
    render(
      <ProviderModelsPanel
        {...buildProps({
          isHealthChecking: true,
          healthStatus: { 'model-alpha': { status: 'loading' } },
          onBenchmarkModel,
        })}
      />,
    );

    fireEvent.click(screen.getAllByRole('button', { name: 'Benchmark All' })[2]);

    expect(onBenchmarkModel).toHaveBeenCalledWith('provider-1::beta');
  });

  it('keeps benchmark all available while a single model is running', () => {
    const onBenchmark = vi.fn();
    render(
      <ProviderModelsPanel
        {...buildProps({
          isHealthChecking: true,
          benchmarkAllActive: false,
          healthStatus: { 'model-alpha': { status: 'loading' } },
          onBenchmark,
        })}
      />,
    );

    const benchmarkAll = screen.getAllByRole('button', { name: 'Benchmark All' })[0];
    expect(benchmarkAll).toBeEnabled();
    fireEvent.click(benchmarkAll);

    expect(onBenchmark).toHaveBeenCalledTimes(1);
  });

  it('immediately marks every model as queued when benchmark all is queued', () => {
    render(<ProviderModelsPanel {...buildProps({ benchmarkAllActive: true, benchmarkAllQueued: true })} />);

    const selectedButton = screen.getByText('alpha').closest('[role="button"]')?.querySelector('button');
    const availableButton = screen.getByText('beta').closest('[role="button"]')?.querySelector('button');
    expect(selectedButton).toBeDisabled();
    expect(availableButton).toBeDisabled();
  });

  it('adds a model directly when a quick add suggestion is clicked', () => {
    const onAddAllVisible = vi.fn();
    const onQuickAddModelIdChange = vi.fn();

    render(
      <ProviderModelsPanel
        {...buildProps({
          quickAddModelId: 'gm',
          sortedFetchedModels: ['alpha', 'gpt-4o-mini'],
          filteredFetchedModels: ['alpha', 'gpt-4o-mini'],
          onAddAllVisible,
          onQuickAddModelIdChange,
        })}
      />,
    );

    fireEvent.focus(screen.getByPlaceholderText('Add a model ID'));
    fireEvent.click(screen.getByText('gpt-4o-mini'));

    expect(onAddAllVisible).toHaveBeenCalledWith(['gpt-4o-mini']);
    expect(onQuickAddModelIdChange).toHaveBeenCalledWith('');
  });

  it('leaves wheel scrolling on quick add suggestions to the browser', () => {
    render(
      <ProviderModelsPanel
        {...buildProps({
          quickAddModelId: 'g',
          sortedFetchedModels: ['gpt-4o', 'gpt-4o-mini', 'gemini-pro', 'grok-beta'],
          filteredFetchedModels: ['gpt-4o', 'gpt-4o-mini', 'gemini-pro', 'grok-beta'],
        })}
      />,
    );

    fireEvent.focus(screen.getByPlaceholderText('Add a model ID'));
    const scrollRoot = document.querySelector('[data-settings-scroll-root="ai-model-suggestions"]') as HTMLElement | null;
    expect(scrollRoot).not.toBeNull();

    setScrollMetrics(scrollRoot!, { clientHeight: 100, scrollHeight: 360, scrollTop: 0 });
    fireEvent.wheel(scrollRoot!, { deltaY: 90 });

    expect(scrollRoot!.scrollTop).toBe(0);
  });

  it('adds all visible available models from the available header', () => {
    const onAddAllVisible = vi.fn();

    render(
      <ProviderModelsPanel
        {...buildProps({
          sortedFetchedModels: ['alpha', 'beta', 'gamma'],
          filteredFetchedModels: ['alpha', 'beta', 'gamma'],
          onAddAllVisible,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add all' }));

    expect(onAddAllVisible).toHaveBeenCalledWith(['beta', 'gamma']);
  });

  it('removes all selected models from the selected header', () => {
    const onClearAllModels = vi.fn();

    render(<ProviderModelsPanel {...buildProps({ onClearAllModels })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove all' }));

    expect(onClearAllModels).toHaveBeenCalledTimes(1);
  });

  it('removes only visible selected models while filtering', () => {
    const onDeleteModel = vi.fn();
    const alpha = buildModel('model-alpha', 'alpha');
    const beta = buildModel('model-beta', 'beta');

    render(
      <ProviderModelsPanel
        {...buildProps({
          modelQuery: 'b',
          providerModels: [alpha, beta],
          filteredProviderModels: [beta],
          filteredFetchedModels: ['beta'],
          providerModelIdSet: new Set(['alpha', 'beta']),
          onDeleteModel,
        })}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remove visible' }));

    expect(onDeleteModel).toHaveBeenCalledWith('model-beta');
    expect(onDeleteModel).toHaveBeenCalledTimes(1);
  });
});
