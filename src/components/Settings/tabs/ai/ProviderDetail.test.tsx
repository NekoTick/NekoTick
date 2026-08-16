import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderDetail } from './ProviderDetail';
import type { Provider } from '@/lib/ai/types';

const storeMock = vi.hoisted(() => ({
  updateProvider: vi.fn(),
}));
const runtimeMock = vi.hoisted(() => ({ isNative: false }));

vi.mock('@/lib/account/capacitorRuntime', () => ({
  isNativeCapacitorRuntime: () => runtimeMock.isNative,
}));

vi.mock('@/stores/useAIStore', () => ({
  useAIModels: () => [],
  useAIBenchmarkResults: () => ({}),
  useAIFetchedModels: () => ({}),
  actions: {
    updateProvider: storeMock.updateProvider,
    addModel: vi.fn(),
    addModels: vi.fn(),
    deleteModel: vi.fn(),
    refreshManagedProvider: vi.fn(),
    setProviderBenchmarkResults: vi.fn(),
    setProviderFetchedModels: vi.fn(),
  },
}));

vi.mock('@/stores/accountSession', () => {
  const state = {
    isConnected: false,
    isConnecting: false,
    error: null,
    signIn: vi.fn(),
    requestEmailCode: vi.fn(),
    verifyEmailCode: vi.fn(),
    signOut: vi.fn(),
  };
  return {
    useAccountSessionStore: (selector: (accountState: typeof state) => unknown) => selector(state),
  };
});

vi.mock('./provider-detail/ManagedProviderPanel', () => ({
  ManagedProviderPanel: () => null,
}));

vi.mock('./provider-detail/ProviderModelsPanel', () => ({
  ProviderModelsPanel: () => null,
}));

vi.mock('./provider-detail/ProviderConnectionFields', () => ({
  ProviderConnectionFields: (props: {
    apiHost: string;
    apiHostError?: string;
    name: string;
    onApiHostChange: (value: string) => void;
    onNameChange: (value: string) => void;
    onCompositionChange?: (isComposing: boolean) => void;
  }) => (
    <>
      <input
        aria-label="Provider name"
        value={props.name}
        onChange={(event) => props.onNameChange(event.currentTarget.value)}
        onCompositionStart={() => props.onCompositionChange?.(true)}
        onCompositionEnd={() => props.onCompositionChange?.(false)}
      />
      <input
        aria-label="Base URL"
        value={props.apiHost}
        onChange={(event) => props.onApiHostChange(event.currentTarget.value)}
      />
      {props.apiHostError ? <p role="alert">{props.apiHostError}</p> : null}
    </>
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
    runtimeMock.isNative = false;
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

  it('shows and does not persist an HTTP provider URL on native mobile', () => {
    vi.useFakeTimers();
    runtimeMock.isNative = true;
    render(<ProviderDetail provider={provider} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Base URL' }), {
      target: { value: 'http://localhost:11434' },
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Mobile providers require an HTTPS Base URL.'
    );
    expect(storeMock.updateProvider).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('vlaina:settings-before-close'));
    expect(storeMock.updateProvider).not.toHaveBeenCalled();
  });

  it('keeps HTTP provider URLs available on desktop', () => {
    vi.useFakeTimers();
    render(<ProviderDetail provider={provider} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Base URL' }), {
      target: { value: 'http://localhost:11434' },
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(storeMock.updateProvider).toHaveBeenCalledWith(
      'provider-1',
      expect.objectContaining({ apiHost: 'http://localhost:11434' }),
    );
  });
});
