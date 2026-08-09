import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  ModelSelector,
  compareModelSelectorProviderIds,
  createModelSelectorProviderOrder,
} from './ModelSelector';
import { useUnifiedStore } from '@/stores/unified/useUnifiedStore';
import { MANAGED_PROVIDER_ID } from '@/lib/ai/managedService';

function readModelSelectorThemeSource(): string {
  return readFileSync(resolve(process.cwd(), 'src/components/Chat/features/Input/modelSelectorTheme.ts'), 'utf8');
}

function readModelSelectorOptionSource(): string {
  return readFileSync(resolve(process.cwd(), 'src/components/Chat/features/Input/components/ModelSelectorOption.tsx'), 'utf8');
}

function readModelSelectorDropdownSource(): string {
  return readFileSync(resolve(process.cwd(), 'src/components/Chat/features/Input/components/ModelSelectorDropdown.tsx'), 'utf8');
}

function readModelSelectorEmbeddedPositionSource(): string {
  return readFileSync(resolve(process.cwd(), 'src/components/Chat/features/Input/hooks/useModelSelectorEmbeddedPosition.ts'), 'utf8');
}

const mocks = vi.hoisted(() => ({
  refreshManagedProviderInBackground: vi.fn(),
  selectModel: vi.fn(),
  updateModel: vi.fn(),
}));

vi.mock('@/stores/useAIStore', () => ({
  actions: {
    refreshManagedProviderInBackground: mocks.refreshManagedProviderInBackground,
    selectModel: mocks.selectModel,
    updateModel: mocks.updateModel,
  },
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({
    count,
    estimateSize,
  }: {
    count: number;
    estimateSize: (index: number) => number;
  }) => {
    const sizes = Array.from({ length: count }, (_, index) => estimateSize(index));
    return {
      getTotalSize: () => sizes.reduce((total, size) => total + size, 0),
      getVirtualItems: () => sizes.map((size, index) => ({
        index,
        size,
        start: sizes.slice(0, index).reduce((total, previousSize) => total + previousSize, 0),
      })),
      measure: vi.fn(),
      scrollToIndex: vi.fn(),
    };
  },
}));

function createRect({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function setModelFixture() {
  useUnifiedStore.setState((state) => ({
    loaded: true,
    data: {
      ...state.data,
      ai: {
        ...state.data.ai!,
        providers: [
          {
            id: 'provider-a',
            name: 'Provider A',
            type: 'newapi',
            apiHost: 'https://example.com/v1',
            apiKey: 'key',
            enabled: true,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        models: [
          {
            id: 'model-alpha',
            apiModelId: 'model-alpha',
            name: 'Model Alpha',
            providerId: 'provider-a',
            enabled: true,
            createdAt: 1,
          },
        ],
        selectedModelId: 'model-alpha',
      },
    },
  }));
}

function setProviderOrderFixture() {
  useUnifiedStore.setState((state) => ({
    loaded: true,
    data: {
      ...state.data,
      ai: {
        ...state.data.ai!,
        providers: [
          {
            id: 'provider-b',
            name: 'Provider B',
            type: 'newapi',
            apiHost: 'https://b.example.com/v1',
            apiKey: 'key-b',
            enabled: true,
            createdAt: 2,
            updatedAt: 2,
          },
          {
            id: 'provider-a',
            name: 'Provider A',
            type: 'newapi',
            apiHost: 'https://a.example.com/v1',
            apiKey: 'key-a',
            enabled: true,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        models: [
          {
            id: 'model-a',
            apiModelId: 'zzz-custom',
            name: 'Model A',
            providerId: 'provider-a',
            enabled: true,
            createdAt: 1,
          },
          {
            id: 'model-b',
            apiModelId: 'aaa-custom',
            name: 'Model B',
            providerId: 'provider-b',
            enabled: true,
            createdAt: 2,
          },
        ],
        selectedModelId: 'model-b',
      },
    },
  }));
}

function setManagedModelFixture() {
  useUnifiedStore.setState((state) => ({
    loaded: true,
    data: {
      ...state.data,
      ai: {
        ...state.data.ai!,
        providers: [
          {
            id: MANAGED_PROVIDER_ID,
            name: 'vlaina',
            type: 'newapi',
            apiHost: 'https://api.vlaina.com/v1',
            apiKey: '',
            enabled: true,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        models: [
          {
            id: `${MANAGED_PROVIDER_ID}::model-alpha`,
            apiModelId: 'model-alpha',
            name: 'Model Alpha',
            providerId: MANAGED_PROVIDER_ID,
            enabled: true,
            createdAt: 1,
          },
        ],
        selectedModelId: `${MANAGED_PROVIDER_ID}::model-alpha`,
      },
    },
  }));
}

describe('ModelSelector', () => {
  let rectSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    setModelFixture();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });

    rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
      if (this.getAttribute('data-model-selector-dropdown') === 'true') {
        return createRect({ left: 0, top: 0, width: 432, height: 360 });
      }

      const className = this.getAttribute('class') ?? '';
      if (className.includes('relative select-none w-fit')) {
        return createRect({ left: 620, top: 520, width: 120, height: 32 });
      }

      if (className.includes('relative min-h-0 overflow-hidden min-w-0 flex-1')) {
        return createRect({ left: 0, top: 0, width: 360, height: 386 });
      }

      return createRect({ left: 0, top: 0, width: 0, height: 0 });
    });
  });

  afterEach(() => {
    cleanup();
    rectSpy.mockRestore();
  });

  it('ports embedded top dropdowns to the body above the trigger with the requested layer', async () => {
    render(
      <ModelSelector
        dropdownLayerClassName="z-[var(--vlaina-z-120)]"
        dropdownPlacement="top"
        isEmbedded
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Model Alpha/ }));

    await waitFor(() => {
      const dropdown = document.querySelector<HTMLElement>('[data-model-selector-dropdown="true"]');
      expect(dropdown).not.toBeNull();
      expect(dropdown!.parentElement).toBe(document.body);
      expect(dropdown!.className).toContain('fixed');
      expect(dropdown!.className).toContain('z-[var(--vlaina-z-120)]');
      expect(dropdown!.className).not.toContain('z-[var(--vlaina-z-50)]');
      expect(Number.parseFloat(dropdown!.style.left)).toBe(308);
      expect(Number.parseFloat(dropdown!.style.top)).toBe(156);
    });

    expect(mocks.refreshManagedProviderInBackground).toHaveBeenCalledWith({ force: true });
  });

  it('refreshes managed models when opening on the managed channel', async () => {
    setManagedModelFixture();

    render(<ModelSelector />);

    fireEvent.click(screen.getByRole('button', { name: /Model Alpha/ }));

    await waitFor(() => {
      expect(document.querySelector('[data-model-selector-dropdown="true"]')).not.toBeNull();
    });

    expect(mocks.refreshManagedProviderInBackground).toHaveBeenCalledWith({ force: true });
  });

  it('labels free models in the trigger and model list', async () => {
    useUnifiedStore.setState((state) => ({
      data: {
        ...state.data,
        ai: {
          ...state.data.ai!,
          models: state.data.ai!.models.map((model) => ({ ...model, isFree: true })),
        },
      },
    }));

    render(<ModelSelector />);
    expect(document.querySelectorAll('[data-model-free-badge="true"]')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: /Model Alpha/ }));
    await waitFor(() => {
      expect(document.querySelectorAll('[data-model-free-badge="true"]')).toHaveLength(2);
    });
    expect(screen.getAllByText('Free')).toHaveLength(2);
  });

  it('exposes an owned combobox and listbox relationship in Chat', async () => {
    render(<ModelSelector />);
    const trigger = screen.getByRole('button', { name: /Model Alpha/ });

    expect(trigger).toHaveAttribute('type', 'button');
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const listboxId = trigger.getAttribute('aria-controls');
    expect(listboxId).toBeTruthy();

    fireEvent.click(trigger);
    const combobox = await screen.findByRole('combobox', { name: 'Find model...' });
    const listbox = screen.getByRole('listbox', { name: 'Select Model' });
    const option = screen.getByRole('option', { name: /Model Alpha/ });

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(listbox).toHaveAttribute('id', listboxId);
    expect(combobox).toHaveAttribute('aria-controls', listboxId);
    expect(combobox).toHaveAttribute('aria-activedescendant', option.id);
    expect(option).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Open settings' })).toHaveAttribute('type', 'button');
    expect(trigger).toHaveAttribute('data-model-selector-secondary-action', 'true');
    expect(screen.getByRole('button', { name: 'Custom models' }))
      .toHaveAttribute('data-model-selector-secondary-action', 'true');

    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Custom models' }), { key: 'Enter' });
    expect(mocks.selectModel).not.toHaveBeenCalled();
  });

  it('coalesces embedded dropdown scroll repositioning into one frame', async () => {
    let pendingFrame: FrameRequestCallback | null = null;

    render(
      <ModelSelector
        dropdownPlacement="top"
        isEmbedded
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Model Alpha/ }));

    await waitFor(() => {
      expect(document.querySelector('[data-model-selector-dropdown="true"]')).not.toBeNull();
    });

    const requestAnimationFrameSpy = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback: FrameRequestCallback) => {
        pendingFrame = callback;
        return 12;
      });
    const cancelAnimationFrameSpy = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation(() => { });

    try {
      fireEvent.scroll(window);
      fireEvent.scroll(window);
      fireEvent.scroll(window);

      expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(1);

      act(() => {
        pendingFrame?.(16);
      });
    } finally {
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  it('shows the custom model box icon for the trigger and custom category only', async () => {
    render(<ModelSelector />);

    fireEvent.click(screen.getByRole('button', { name: /Model Alpha/ }));

    await waitFor(() => {
      expect(document.querySelector('[data-model-selector-dropdown="true"]')).not.toBeNull();
      expect(document.querySelectorAll('[data-model-selector-custom-icon="true"]')).toHaveLength(2);
    });
  });

  it('orders custom provider sections by the saved provider order', () => {
    setProviderOrderFixture();
    const providers = useUnifiedStore.getState().data.ai?.providers ?? [];
    const providerOrder = createModelSelectorProviderOrder(providers);

    expect(
      ['provider-a', 'provider-b'].sort((leftProviderId, rightProviderId) =>
        compareModelSelectorProviderIds(providerOrder, leftProviderId, rightProviderId)
      )
    ).toEqual(['provider-b', 'provider-a']);
  });

  it('keeps managed provider sections after user providers', () => {
    const providerOrder = createModelSelectorProviderOrder([
      { id: MANAGED_PROVIDER_ID },
      { id: 'provider-b' },
      { id: 'provider-a' },
    ]);

    expect(
      ['provider-a', MANAGED_PROVIDER_ID, 'provider-b'].sort((leftProviderId, rightProviderId) =>
        compareModelSelectorProviderIds(providerOrder, leftProviderId, rightProviderId)
      )
    ).toEqual(['provider-b', 'provider-a', MANAGED_PROVIDER_ID]);
  });

  it('uses transparent hover surfaces with blue emphasis in the model selector', () => {
    const source = readModelSelectorThemeSource();
    const optionSource = readModelSelectorOptionSource();
    const dropdownSource = readModelSelectorDropdownSource();

    expect(source).toContain("triggerHover: 'hover:bg-transparent hover:text-[var(--vlaina-sidebar-row-selected-text)]'");
    expect(source).toContain("categoryHover: 'hover:bg-transparent hover:text-[var(--vlaina-sidebar-row-selected-text)]'");
    expect(optionSource).toContain('isSelected || isFocused');
    expect(dropdownSource).toContain('group-hover/model-category:text-[var(--vlaina-sidebar-row-selected-text)]');
    expect(source).not.toContain('hover:bg-[var(--vlaina-sidebar-chat-row-hover)]');
    expect(source).not.toContain('hover:bg-[var(--vlaina-sidebar-notes-row-hover)]');
  });

  it('guards embedded dropdown style updates against equal layout measurements', () => {
    const source = readModelSelectorEmbeddedPositionSource();

    expect(source).toContain('areEmbeddedDropdownStylesEqual(currentStyle, nextStyle) ? currentStyle : nextStyle');
    expect(source).toContain('setEmbeddedDropdownStyle((currentStyle) => (currentStyle === null ? currentStyle : null))');
  });
});
