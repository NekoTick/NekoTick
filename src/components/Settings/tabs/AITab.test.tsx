import { StrictMode } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AITab } from './AITab';
import type { Provider } from '@/lib/ai/types';
import { SETTINGS_BEFORE_CLOSE_EVENT } from '../settingsEvents';

const aiStoreMock = vi.hoisted(() => ({
  providers: [] as Provider[],
  addProvider: vi.fn(),
}));

vi.mock('@/stores/useAIStore', () => ({
  useAIProviders: () => aiStoreMock.providers,
  useAIModels: () => [],
  actions: {
    addProvider: aiStoreMock.addProvider,
    updateProvider: vi.fn(),
    deleteProvider: vi.fn(),
    reorderCustomProviders: vi.fn(),
  },
}));

vi.mock('./ai/AIBehaviorSettings', () => ({
  AIBehaviorSettings: () => null,
}));

vi.mock('./ai/AIChannelsSection', () => ({
  AIChannelsSection: () => null,
}));

vi.mock('./ai/ProviderDetail', () => ({
  ProviderDetail: ({ provider }: { provider: Provider }) => (
    <div data-testid="provider-detail">{provider.name}</div>
  ),
}));

vi.mock('./ai/AIChannelOrder', () => ({
  useAIChannelOrder: (providers: Provider[]) => ({
    dragOverProviderId: null,
    draggingProviderId: null,
    handleChannelDragEnd: vi.fn(),
    handleChannelDragEnter: vi.fn(),
    handleChannelDragOver: vi.fn(),
    handleChannelDragStart: vi.fn(),
    handleChannelDrop: vi.fn(),
    isChannelClickSuppressed: () => false,
    orderedCustomProviders: providers,
  }),
}));

vi.mock('@/components/common/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe('AITab', () => {
  afterEach(() => {
    cleanup();
    aiStoreMock.providers = [];
    aiStoreMock.addProvider.mockReset();
  });

  it('shows a new channel detail immediately when no custom channel exists', async () => {
    aiStoreMock.addProvider.mockImplementation((provider: Omit<Provider, 'id' | 'createdAt' | 'updatedAt'>) => {
      const id = 'provider-auto';
      aiStoreMock.providers = [{ ...provider, id, createdAt: 1, updatedAt: 1 }];
      return id;
    });

    render(
      <StrictMode>
        <AITab />
      </StrictMode>,
    );

    await waitFor(() => expect(aiStoreMock.addProvider).toHaveBeenCalledWith({
      name: 'Channel 1',
      type: 'newapi',
      apiHost: '',
      apiKey: '',
      enabled: true,
    }));
    expect(await screen.findByTestId('provider-detail')).toHaveTextContent('Channel 1');
    expect(aiStoreMock.addProvider).toHaveBeenCalledTimes(1);
  });

  it('does not recreate an empty channel while settings are closing', async () => {
    aiStoreMock.providers = [{
      id: 'provider-existing',
      name: 'Channel 1',
      type: 'newapi',
      apiHost: '',
      apiKey: '',
      enabled: true,
      createdAt: 1,
      updatedAt: 1,
    }];
    const { rerender } = render(
      <StrictMode>
        <AITab />
      </StrictMode>,
    );

    window.dispatchEvent(new Event(SETTINGS_BEFORE_CLOSE_EVENT));
    aiStoreMock.providers = [];
    rerender(
      <StrictMode>
        <AITab />
      </StrictMode>,
    );

    await waitFor(() => expect(aiStoreMock.addProvider).not.toHaveBeenCalled());
  });
});
