import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useManagedAIStore } from '@/stores/useManagedAIStore';
import { useAccountSessionStore } from '@/stores/accountSession';
import { initialAccountSessionState } from '@/stores/accountSession/state';
import { ManagedQuotaMeter } from './ManagedQuotaMeter';

const originalState = useManagedAIStore.getState();

afterEach(() => {
  act(() => {
    useManagedAIStore.setState(originalState, true);
    useAccountSessionStore.setState(initialAccountSessionState);
  });
});

describe('ManagedQuotaMeter', () => {
  it('shows a loading meter and refreshes when budget is missing', async () => {
    const refreshBudgetIfStale = vi.fn().mockResolvedValue(undefined);
    act(() => {
      useManagedAIStore.setState({
        ...originalState,
        budget: null,
        isRefreshingBudget: true,
        budgetError: null,
        lastBudgetSyncAt: null,
        lastBudgetAttemptAt: null,
        refreshBudgetIfStale,
      }, true);
      useAccountSessionStore.setState({
        ...initialAccountSessionState,
        isLoading: false,
        hasCheckedStatus: true,
        isConnected: true,
      });
    });

    render(<ManagedQuotaMeter />);

    expect(screen.getByLabelText('Managed AI quota loading')).toBeInTheDocument();
    expect(screen.getByTestId('managed-quota-loading-bar')).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    await waitFor(() => expect(refreshBudgetIfStale).toHaveBeenCalledTimes(1));
  });

  it('does not refresh budget while the account is signed out', () => {
    const refreshBudgetIfStale = vi.fn().mockResolvedValue(undefined);
    act(() => {
      useManagedAIStore.setState({
        ...originalState,
        budget: null,
        isRefreshingBudget: false,
        budgetError: null,
        lastBudgetSyncAt: null,
        lastBudgetAttemptAt: null,
        refreshBudgetIfStale,
      }, true);
      useAccountSessionStore.setState({
        ...initialAccountSessionState,
        isLoading: false,
        hasCheckedStatus: true,
        isConnected: false,
      });
    });

    render(<ManagedQuotaMeter />);

    expect(refreshBudgetIfStale).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/Managed AI quota/)).not.toBeInTheDocument();
  });

  it.each([
    ['NaN', Number.NaN],
    ['null', null],
  ])('shows a loading meter when the budget remaining percentage is %s', async (_label, remainingPercent) => {
    const refreshBudgetIfStale = vi.fn().mockResolvedValue(undefined);
    act(() => {
      useManagedAIStore.setState({
        ...originalState,
        budget: {
          active: true,
          usedPercent: 58,
          remainingPercent,
          status: 'active',
        } as never,
        isRefreshingBudget: false,
        budgetError: null,
        lastBudgetSyncAt: Date.now(),
        lastBudgetAttemptAt: Date.now(),
        refreshBudgetIfStale,
      }, true);
      useAccountSessionStore.setState({
        ...initialAccountSessionState,
        isLoading: false,
        hasCheckedStatus: true,
        isConnected: true,
      });
    });

    render(<ManagedQuotaMeter />);

    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Managed AI quota loading')).toBeInTheDocument();
    expect(screen.getByTestId('managed-quota-loading-bar')).toBeInTheDocument();
    await waitFor(() => expect(refreshBudgetIfStale).toHaveBeenCalledTimes(1));
  });

  it('keeps native hover text empty and reveals the percentage from the meter on hover', () => {
    const refreshBudgetIfStale = vi.fn().mockResolvedValue(undefined);
    act(() => {
      useManagedAIStore.setState({
        ...originalState,
        budget: {
          active: true,
          usedPercent: 58,
          remainingPercent: 42,
          status: 'active',
        },
        isRefreshingBudget: false,
        budgetError: null,
        lastBudgetSyncAt: Date.now(),
        lastBudgetAttemptAt: Date.now(),
        refreshBudgetIfStale,
      }, true);
      useAccountSessionStore.setState({
        ...initialAccountSessionState,
        isLoading: false,
        hasCheckedStatus: true,
        isConnected: true,
      });
    });

    render(<ManagedQuotaMeter />);

    const meter = screen.getByLabelText('Managed AI quota remaining 42%');
    expect(meter).not.toHaveAttribute('title');
    expect(screen.getByText('42%')).toHaveAttribute('aria-hidden', 'true');
    expect(meter.querySelector('.bg-\\[var\\(--vlaina-color-quota-fill\\)\\]')).toBeInTheDocument();
  });

  it('keeps the previous budget visible while a refresh is in flight', () => {
    const refreshBudgetIfStale = vi.fn().mockResolvedValue(undefined);
    act(() => {
      useManagedAIStore.setState({
        ...originalState,
        budget: {
          active: true,
          usedPercent: 67,
          remainingPercent: 33,
          status: 'active',
        },
        isRefreshingBudget: true,
        budgetError: null,
        lastBudgetSyncAt: Date.now() - 120_000,
        lastBudgetAttemptAt: Date.now(),
        refreshBudgetIfStale,
      }, true);
      useAccountSessionStore.setState({
        ...initialAccountSessionState,
        isLoading: false,
        hasCheckedStatus: true,
        isConnected: true,
      });
    });

    render(<ManagedQuotaMeter />);

    expect(screen.getByLabelText('Managed AI quota remaining 33%')).not.toHaveAttribute('title');
  });

  it('shows top-up carry-over above 100 percent while capping only the progress bar width', () => {
    const refreshBudgetIfStale = vi.fn().mockResolvedValue(undefined);
    act(() => {
      useManagedAIStore.setState({
        ...originalState,
        budget: {
          active: true,
          usedPercent: 80,
          remainingPercent: 120,
          status: 'active',
        },
        isRefreshingBudget: false,
        budgetError: null,
        lastBudgetSyncAt: Date.now(),
        lastBudgetAttemptAt: Date.now(),
        refreshBudgetIfStale,
      }, true);
      useAccountSessionStore.setState({
        ...initialAccountSessionState,
        isLoading: false,
        hasCheckedStatus: true,
        isConnected: true,
      });
    });

    render(<ManagedQuotaMeter />);

    const meter = screen.getByLabelText('Managed AI quota remaining 120%');
    expect(meter).not.toHaveAttribute('title');
    const quotaLabel = screen.getByText('120%');
    expect(quotaLabel).toHaveAttribute('aria-hidden', 'true');
    expect(quotaLabel).toHaveClass('group-hover/quota:w-12', 'group-focus-within/quota:w-12');
    expect(meter.querySelector('[style="width: 100%;"]')).toBeInTheDocument();
  });

  it('waits for account session status before starting a separate budget refresh', async () => {
    const refreshBudgetIfStale = vi.fn().mockResolvedValue(undefined);
    act(() => {
      useManagedAIStore.setState({
        ...originalState,
        budget: null,
        isRefreshingBudget: false,
        budgetError: null,
        lastBudgetSyncAt: null,
        lastBudgetAttemptAt: null,
        refreshBudgetIfStale,
      }, true);
      useAccountSessionStore.setState({
        ...initialAccountSessionState,
        isLoading: true,
        hasCheckedStatus: false,
        isConnected: true,
      });
    });

    render(<ManagedQuotaMeter />);

    expect(refreshBudgetIfStale).not.toHaveBeenCalled();

    act(() => {
      useAccountSessionStore.setState({ isLoading: false });
    });

    expect(refreshBudgetIfStale).not.toHaveBeenCalled();

    act(() => {
      useAccountSessionStore.setState({ hasCheckedStatus: true });
    });

    await waitFor(() => expect(refreshBudgetIfStale).toHaveBeenCalledTimes(1));
  });
});
