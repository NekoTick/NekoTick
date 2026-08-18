import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchManagedBudget } from '@/lib/ai/managedService';
import {
  applyManagedQuotaExhaustedSnapshot,
  clearManagedBudgetUnlessQuotaExhausted,
  useManagedAIStore,
} from './useManagedAIStore';

vi.mock('@/lib/ai/managedService', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/managedService')>('@/lib/ai/managedService');
  return {
    ...actual,
    fetchManagedBudget: vi.fn(),
    getManagedServiceErrorMessage: vi.fn(() => 'Refresh failed'),
  };
});

const originalState = useManagedAIStore.getState();
const fetchManagedBudgetMock = vi.mocked(fetchManagedBudget);

afterEach(() => {
  fetchManagedBudgetMock.mockReset();
  useManagedAIStore.setState(originalState, true);
  localStorage.clear();
});

describe('useManagedAIStore', () => {
  it('reuses a fresh budget snapshot for ordinary refresh checks', async () => {
    useManagedAIStore.setState({
      ...originalState,
      budget: {
        active: true,
        usedPercent: 20,
        remainingPercent: 80,
        status: 'active',
      },
      lastBudgetSyncAt: Date.now(),
      lastBudgetAttemptAt: Date.now(),
    }, true);

    await useManagedAIStore.getState().refreshBudgetIfStale();

    expect(fetchManagedBudgetMock).not.toHaveBeenCalled();
  });

  it('coalesces concurrent forced budget refreshes', async () => {
    const budget = {
      active: true,
      usedPercent: 25,
      remainingPercent: 75,
      status: 'active',
    };
    let resolveBudget!: (value: typeof budget) => void;
    fetchManagedBudgetMock.mockReturnValueOnce(new Promise((resolve) => {
      resolveBudget = resolve;
    }));

    const firstRefresh = useManagedAIStore.getState().refreshBudget();
    const secondRefresh = useManagedAIStore.getState().refreshBudget();

    expect(fetchManagedBudgetMock).toHaveBeenCalledTimes(1);
    resolveBudget(budget);
    await Promise.all([firstRefresh, secondRefresh]);
    expect(useManagedAIStore.getState().budget).toEqual(budget);
  });

  it('applies the shared exhausted budget snapshot', () => {
    applyManagedQuotaExhaustedSnapshot();

    expect(useManagedAIStore.getState().budget).toEqual(expect.objectContaining({
      active: false,
      usedPercent: 100,
      remainingPercent: 0,
      status: 'exhausted',
    }));
  });

  it('keeps an exhausted budget when clearing non-authoritative state', () => {
    const exhaustedBudget = {
      active: false,
      usedPercent: 100,
      remainingPercent: 0,
      status: 'exhausted',
    };

    useManagedAIStore.setState({
      ...originalState,
      budget: exhaustedBudget,
      lastBudgetSyncAt: 1_700_000_000_000,
      lastBudgetAttemptAt: 1_700_000_000_000,
    }, true);

    clearManagedBudgetUnlessQuotaExhausted();

    expect(useManagedAIStore.getState().budget).toBe(exhaustedBudget);
    expect(useManagedAIStore.getState().lastBudgetSyncAt).toBe(1_700_000_000_000);
  });

  it('clears a non-exhausted budget from non-authoritative state', () => {
    useManagedAIStore.setState({
      ...originalState,
      budget: {
        active: true,
        usedPercent: 20,
        remainingPercent: 80,
        status: 'active',
      },
      lastBudgetSyncAt: 1_700_000_000_000,
      lastBudgetAttemptAt: 1_700_000_000_000,
    }, true);

    clearManagedBudgetUnlessQuotaExhausted();

    expect(useManagedAIStore.getState().budget).toBeNull();
    expect(useManagedAIStore.getState().lastBudgetSyncAt).toBeNull();
  });

  it('does not clear an exhausted budget with a non-exhausted snapshot that lacks remaining quota', () => {
    const exhaustedBudget = {
      active: false,
      usedPercent: 100,
      remainingPercent: 0,
      status: 'exhausted',
    };

    useManagedAIStore.setState({
      ...originalState,
      budget: exhaustedBudget,
      lastBudgetSyncAt: 1_700_000_000_000,
      lastBudgetAttemptAt: 1_700_000_000_000,
    }, true);

    useManagedAIStore.getState().applyBudgetSnapshot({
      active: true,
      usedPercent: 0,
      remainingPercent: Number.NaN,
      status: 'active',
    });

    expect(useManagedAIStore.getState().budget).toBe(exhaustedBudget);
    expect(useManagedAIStore.getState().lastBudgetSyncAt).toBe(1_700_000_000_000);
  });

  it('does not treat null remaining quota as an authoritative recovery snapshot', () => {
    const exhaustedBudget = {
      active: false,
      usedPercent: 100,
      remainingPercent: 0,
      status: 'exhausted',
    };

    useManagedAIStore.setState({
      ...originalState,
      budget: exhaustedBudget,
      lastBudgetSyncAt: 1_700_000_000_000,
      lastBudgetAttemptAt: 1_700_000_000_000,
    }, true);

    useManagedAIStore.getState().applyBudgetSnapshot({
      active: true,
      usedPercent: 0,
      remainingPercent: null,
      status: 'active',
    } as never);

    expect(useManagedAIStore.getState().budget).toBe(exhaustedBudget);
    expect(useManagedAIStore.getState().lastBudgetSyncAt).toBe(1_700_000_000_000);
  });

  it('clears an exhausted budget when the next snapshot has known remaining quota', () => {
    useManagedAIStore.setState({
      ...originalState,
      budget: {
        active: false,
        usedPercent: 100,
        remainingPercent: 0,
        status: 'exhausted',
      },
      lastBudgetSyncAt: 1_700_000_000_000,
      lastBudgetAttemptAt: 1_700_000_000_000,
    }, true);

    const activeBudget = {
      active: true,
      usedPercent: 20,
      remainingPercent: 80,
      status: 'active',
    };
    useManagedAIStore.getState().applyBudgetSnapshot(activeBudget);

    expect(useManagedAIStore.getState().budget).toEqual(activeBudget);
    expect(useManagedAIStore.getState().lastBudgetSyncAt).not.toBe(1_700_000_000_000);
  });

  it('keeps an exhausted budget when refresh returns an active snapshot without remaining quota', async () => {
    const exhaustedBudget = {
      active: false,
      usedPercent: 100,
      remainingPercent: 0,
      status: 'exhausted',
    };
    fetchManagedBudgetMock.mockResolvedValueOnce({
      active: true,
      usedPercent: 0,
      remainingPercent: Number.NaN,
      status: 'active',
    });
    useManagedAIStore.setState({
      ...originalState,
      budget: exhaustedBudget,
      isRefreshingBudget: false,
      budgetError: 'previous error',
      lastBudgetSyncAt: 1_700_000_000_000,
      lastBudgetAttemptAt: 1_700_000_000_000,
    }, true);

    await useManagedAIStore.getState().refreshBudget();

    expect(useManagedAIStore.getState().budget).toBe(exhaustedBudget);
    expect(useManagedAIStore.getState().isRefreshingBudget).toBe(false);
    expect(useManagedAIStore.getState().budgetError).toBeNull();
    expect(useManagedAIStore.getState().lastBudgetSyncAt).toBe(1_700_000_000_000);
  });

  it('ignores newer non-authoritative storage snapshots while the current budget is exhausted', () => {
    const exhaustedBudget = {
      active: false,
      usedPercent: 100,
      remainingPercent: 0,
      status: 'exhausted',
    };

    useManagedAIStore.setState({
      ...originalState,
      budget: exhaustedBudget,
      lastBudgetSyncAt: 1_700_000_000_000,
      lastBudgetAttemptAt: 1_700_000_000_000,
    }, true);

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'vlaina-managed-ai-budget',
      newValue: JSON.stringify({
        budget: {
          active: true,
          status: 'active',
        },
        syncedAt: 1_700_000_000_001,
      }),
    }));

    expect(useManagedAIStore.getState().budget).toBe(exhaustedBudget);
    expect(useManagedAIStore.getState().lastBudgetSyncAt).toBe(1_700_000_000_000);
  });

  it('keeps the previous budget when refresh fails', async () => {
    const previousBudget = {
      active: true,
      usedPercent: 67,
      remainingPercent: 33,
      status: 'active',
    };

    fetchManagedBudgetMock.mockRejectedValueOnce(new Error('Network error'));
    useManagedAIStore.setState({
      ...originalState,
      budget: previousBudget,
      isRefreshingBudget: false,
      budgetError: null,
      lastBudgetSyncAt: 1_700_000_000_000,
      lastBudgetAttemptAt: 1_700_000_000_000,
    }, true);

    await useManagedAIStore.getState().refreshBudget();

    expect(useManagedAIStore.getState().budget).toBe(previousBudget);
    expect(useManagedAIStore.getState().budgetError).toBe('Refresh failed');
    expect(useManagedAIStore.getState().lastBudgetSyncAt).toBe(1_700_000_000_000);
  });

  it('ignores an in-flight budget response after the budget is cleared', async () => {
    const nextBudget = {
      active: true,
      usedPercent: 10,
      remainingPercent: 90,
      status: 'active',
    };
    let resolveBudget!: (value: typeof nextBudget) => void;
    fetchManagedBudgetMock.mockReturnValueOnce(new Promise((resolve) => {
      resolveBudget = resolve;
    }));

    const refreshPromise = useManagedAIStore.getState().refreshBudget();
    useManagedAIStore.getState().clearBudget();
    resolveBudget(nextBudget);
    await refreshPromise;

    expect(useManagedAIStore.getState().budget).toBeNull();
    expect(useManagedAIStore.getState().isRefreshingBudget).toBe(false);
    expect(useManagedAIStore.getState().lastBudgetSyncAt).toBeNull();
  });

  it('allows a new budget refresh after clearing a stale in-flight refresh', async () => {
    const staleBudget = {
      active: true,
      usedPercent: 80,
      remainingPercent: 20,
      status: 'active',
    };
    const freshBudget = {
      active: true,
      usedPercent: 15,
      remainingPercent: 85,
      status: 'active',
    };
    let resolveStale!: (value: typeof staleBudget) => void;
    let resolveFresh!: (value: typeof freshBudget) => void;
    fetchManagedBudgetMock
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveStale = resolve;
      }))
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveFresh = resolve;
      }));

    const staleRefresh = useManagedAIStore.getState().refreshBudget();
    useManagedAIStore.getState().clearBudget();
    const freshRefresh = useManagedAIStore.getState().refreshBudget();
    resolveStale(staleBudget);
    resolveFresh(freshBudget);
    await Promise.all([staleRefresh, freshRefresh]);

    expect(fetchManagedBudgetMock).toHaveBeenCalledTimes(2);
    expect(useManagedAIStore.getState().budget).toEqual(freshBudget);
  });

  it('reloads a newer budget snapshot from another window', () => {
    const budget = {
      active: true,
      usedPercent: 20,
      remainingPercent: 80,
      status: 'active',
    };

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'vlaina-managed-ai-budget',
      newValue: JSON.stringify({
        budget,
        syncedAt: 1_700_000_000_000,
      }),
    }));

    expect(useManagedAIStore.getState().budget).toEqual(budget);
    expect(useManagedAIStore.getState().lastBudgetSyncAt).toBe(1_700_000_000_000);
  });

  it('normalizes a newer budget snapshot from another window', () => {
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'vlaina-managed-ai-budget',
      newValue: JSON.stringify({
        budget: {
          active: 'true',
          usedPercent: '20%',
          remainingPercent: '80%',
          status: 'active',
        },
        syncedAt: 1_700_000_000_000,
      }),
    }));

    expect(useManagedAIStore.getState().budget).toEqual({
      active: true,
      usedPercent: 20,
      remainingPercent: 80,
      status: 'active',
    });
    expect(useManagedAIStore.getState().lastBudgetSyncAt).toBe(1_700_000_000_000);
  });

  it('ignores malformed budget snapshots from another window', () => {
    const currentBudget = {
      active: true,
      usedPercent: 10,
      remainingPercent: 90,
      status: 'active',
    };

    useManagedAIStore.setState({
      ...originalState,
      budget: currentBudget,
      lastBudgetSyncAt: 1_700_000_000_000,
      lastBudgetAttemptAt: 1_700_000_000_000,
    }, true);

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'vlaina-managed-ai-budget',
      newValue: JSON.stringify({
        budget: ['bad'],
        syncedAt: 1_700_000_000_001,
      }),
    }));
    window.dispatchEvent(new StorageEvent('storage', {
      key: 'vlaina-managed-ai-budget',
      newValue: JSON.stringify({
        budget: { active: true },
        syncedAt: null,
      }),
    }));

    expect(useManagedAIStore.getState().budget).toEqual(currentBudget);
    expect(useManagedAIStore.getState().lastBudgetSyncAt).toBe(1_700_000_000_000);
  });

  it('ignores older budget snapshots from another window', () => {
    const currentBudget = {
      active: true,
      usedPercent: 10,
      remainingPercent: 90,
      status: 'active',
    };
    const staleBudget = {
      active: true,
      usedPercent: 80,
      remainingPercent: 20,
      status: 'active',
    };

    useManagedAIStore.setState({
      ...originalState,
      budget: currentBudget,
      lastBudgetSyncAt: 1_700_000_000_000,
      lastBudgetAttemptAt: 1_700_000_000_000,
    }, true);

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'vlaina-managed-ai-budget',
      newValue: JSON.stringify({
        budget: staleBudget,
        syncedAt: 1_699_999_999_999,
      }),
    }));

    expect(useManagedAIStore.getState().budget).toEqual(currentBudget);
  });

  it('ignores oversized budget snapshots from another window', () => {
    const currentBudget = {
      active: true,
      usedPercent: 10,
      remainingPercent: 90,
      status: 'active',
    };

    useManagedAIStore.setState({
      ...originalState,
      budget: currentBudget,
      lastBudgetSyncAt: 1_700_000_000_000,
      lastBudgetAttemptAt: 1_700_000_000_000,
    }, true);

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'vlaina-managed-ai-budget',
      newValue: 'x'.repeat(33 * 1024),
    }));

    expect(useManagedAIStore.getState().budget).toEqual(currentBudget);
  });

  it('clears the budget after another window clears the shared snapshot', () => {
    useManagedAIStore.setState({
      ...originalState,
      budget: {
        active: true,
        usedPercent: 10,
        remainingPercent: 90,
        status: 'active',
      },
      lastBudgetSyncAt: 1_700_000_000_000,
      lastBudgetAttemptAt: 1_700_000_000_000,
    }, true);

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'vlaina-managed-ai-budget',
      newValue: null,
    }));

    expect(useManagedAIStore.getState().budget).toBeNull();
    expect(useManagedAIStore.getState().lastBudgetSyncAt).toBeNull();
  });

  it('preserves an exhausted budget when another window clears the shared snapshot', () => {
    const exhaustedBudget = {
      active: false,
      usedPercent: 100,
      remainingPercent: 0,
      status: 'exhausted',
    };

    useManagedAIStore.setState({
      ...originalState,
      budget: exhaustedBudget,
      lastBudgetSyncAt: 1_700_000_000_000,
      lastBudgetAttemptAt: 1_700_000_000_000,
    }, true);

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'vlaina-managed-ai-budget',
      newValue: null,
    }));

    expect(useManagedAIStore.getState().budget).toBe(exhaustedBudget);
    expect(useManagedAIStore.getState().lastBudgetSyncAt).toBe(1_700_000_000_000);
  });
});
