import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderDetail } from './ProviderDetail';
import type { Provider } from '@/lib/ai/types';

const storeMock = vi.hoisted(() => ({
  updateProvider: vi.fn(),
}));

vi.mock('@/stores/useAIStore', () => ({
  useAIStore: () => ({
    updateProvider: storeMock.updateProvider,
    models: [],
    benchmarkResults: {},
    fetchedModels: {},
    addModel: vi.fn(),
    addModels: vi.fn(),
    deleteModel: vi.fn(),
    refreshManagedProvider: vi.fn(),
    setProviderBenchmarkResults: vi.fn(),
    setProviderFetchedModels: vi.fn(),
  }),
}));

vi.mock('@/stores/accountSession', () => ({
  useAccountSessionStore: () => ({
    isConnected: false,
    isConnecting: false,
    error: null,
    signIn: vi.fn(),
    requestEmailCode: vi.fn(),
    verifyEmailCode: vi.fn(),
    signOut: vi.fn(),
  }),
}));

vi.mock('./provider-detail/ManagedProviderPanel', () => ({
  ManagedProviderPanel: () => null,
}));

vi.mock('./provider-detail/ProviderModelsPanel', () => ({
  ProviderModelsPanel: () => null,
}));

vi.mock('./provider-detail/ProviderConnectionFields', () => ({
  ProviderConnectionFields: (props: {
    name: string;
    onNameChange: (value: string) => void;
    onCompositionChange?: (isComposing: boolean) => void;
  }) => (
    <input
      aria-label="Provider name"
      value={props.name}
      onChange={(event) => props.onNameChange(event.currentTarget.value)}
      onCompositionStart={() => props.onCompositionChange?.(true)}
      onCompositionEnd={() => props.onCompositionChange?.(false)}
    />
  ),
}));

vi.mock('./provider-detail/useProviderBenchmark', () => ({
  useProviderBenchmark: () => ({
    resetBenchmarkState: vi.fn(),
    canBenchmarkAll: false,
    canBenchmarkSelected: false,
    canBenchmarkAvailable: false,
    isHealthChecking: false,
    benchmarkAllActive: false,
    selectedBenchmarkActive: false,
    availableBenchmarkActive: false,
    healthCheckOverall: 'idle',
    healthStatus: {},
    handleBenchmarkAllModels: vi.fn(),
    handleBenchmarkModels: vi.fn(),
    handleBenchmarkAvailableModels: vi.fn(),
  }),
}));

vi.mock('./provider-detail/useProviderModelActions', () => ({
  useProviderModelActions: () => ({
    fetchError: '',
    isFetchingModels: false,
    setFetchError: vi.fn(),
    handleFetchModels: vi.fn(),
    handleClearAllModels: vi.fn(),
    handleAddModel: vi.fn(),
    handleBatchAdd: vi.fn(),
  }),
}));

vi.mock('./provider-detail/useProviderModelFilters', () => ({
  useProviderModelFilters: () => ({
    sortedFetchedModels: [],
    filteredProviderModels: [],
    filteredFetchedModels: [],
    availableFetchedModels: [],
  }),
}));

const provider: Provider = {
  id: 'provider-1',
  name: 'Channel 1',
  type: 'newapi',
  apiHost: 'https://api.example.test',
  apiKey: 'sk-test-key',
  enabled: true,
  createdAt: 1,
  updatedAt: 1,
};

describe('ProviderDetail', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    storeMock.updateProvider.mockReset();
  });

  it('does not auto-save provider connection drafts while IME composition is active', () => {
    vi.useFakeTimers();
    render(<ProviderDetail provider={provider} />);
    const input = screen.getByRole('textbox', { name: 'Provider name' });

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: 'nihao' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(storeMock.updateProvider).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input);
    fireEvent.change(input, { target: { value: '你好' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(storeMock.updateProvider).toHaveBeenCalledWith('provider-1', expect.objectContaining({
      name: '你好',
    }));
  });

  it('does not write an unchanged provider when the detail closes', () => {
    const { unmount } = render(<ProviderDetail provider={provider} />);

    window.dispatchEvent(new Event('vlaina:settings-before-close'));
    unmount();

    expect(storeMock.updateProvider).not.toHaveBeenCalled();
  });
});
