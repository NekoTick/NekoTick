import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AIModel, Provider } from '@/lib/ai/types';
import { useAIUIStore } from './ai/chatState';
import { useUnifiedStore } from './unified/useUnifiedStore';
import {
  useAIBenchmarkResults,
  useAICustomSystemPrompt,
  useAIFetchedModels,
  useAIModels,
  useAIProviders,
} from './useAIStore';

const provider: Provider = {
  id: 'settings-provider',
  name: 'Settings provider',
  type: 'newapi',
  apiHost: 'https://example.invalid/v1',
  apiKey: 'sk-settings',
  enabled: true,
  createdAt: 1,
  updatedAt: 1,
};

const model: AIModel = {
  id: 'settings-provider::model',
  apiModelId: 'model',
  name: 'Model',
  providerId: provider.id,
  enabled: true,
  createdAt: 1,
};

describe('AI settings selectors', () => {
  let previousData: ReturnType<typeof useUnifiedStore.getState>['data'];
  let previousLoaded: boolean;
  let previousUndoStack: ReturnType<typeof useUnifiedStore.getState>['undoStack'];
  let previousUIState: ReturnType<typeof useAIUIStore.getState>;

  beforeEach(() => {
    const unifiedState = useUnifiedStore.getState();
    previousData = unifiedState.data;
    previousLoaded = unifiedState.loaded;
    previousUndoStack = unifiedState.undoStack;
    previousUIState = useAIUIStore.getState();

    act(() => {
      useUnifiedStore.setState((state) => ({
        data: {
          ...state.data,
          ai: {
            ...state.data.ai!,
            providers: [provider],
            models: [model],
            benchmarkResults: {},
            fetchedModels: { [provider.id]: ['model'] },
            customSystemPrompt: 'prompt',
            messages: {},
          },
        },
        loaded: true,
      }));
      useAIUIStore.setState({ generatingSessions: {}, error: null });
    });
  });

  afterEach(() => {
    act(() => {
      useUnifiedStore.setState({
        data: previousData,
        loaded: previousLoaded,
        undoStack: previousUndoStack,
      });
      useAIUIStore.setState(previousUIState);
    });
  });

  it('does not rerender settings subscribers for chat stream or UI-only updates', () => {
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount += 1;
      return {
        providers: useAIProviders(),
        models: useAIModels(),
        benchmarkResults: useAIBenchmarkResults(),
        fetchedModels: useAIFetchedModels(),
        customSystemPrompt: useAICustomSystemPrompt(),
      };
    });
    const renderCountBeforeUnrelatedUpdate = renderCount;
    const initialResult = result.current;

    act(() => {
      useUnifiedStore.getState().updateAIData({
        messages: {
          'stream-session': [{
            id: 'stream-message',
            role: 'assistant',
            content: 'streaming',
            modelId: model.id,
            timestamp: 2,
            versions: [{
              content: 'streaming',
              createdAt: 2,
              kind: 'original',
              subsequentMessages: [],
            }],
            currentVersionIndex: 0,
          }],
        },
      }, true);
      useAIUIStore.setState({ generatingSessions: { 'stream-session': true } });
    });

    expect(renderCount).toBe(renderCountBeforeUnrelatedUpdate);
    expect(result.current).toEqual(initialResult);
  });

  it('rerenders when a settings-owned AI field changes', () => {
    let renderCount = 0;
    const { result } = renderHook(() => {
      renderCount += 1;
      return useAIModels();
    });
    const renderCountBeforeUpdate = renderCount;

    act(() => {
      useUnifiedStore.getState().updateAIData({ models: [model, { ...model, id: 'settings-provider::second' }] }, true);
    });

    expect(renderCount).toBeGreaterThan(renderCountBeforeUpdate);
    expect(result.current).toHaveLength(2);
  });
});
