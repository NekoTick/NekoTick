import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import {
  clearDiagnosticsLog,
  getDiagnosticsLogText,
  logDiagnostic,
} from '@/lib/diagnostics/diagnosticsLog';

const mocks = vi.hoisted(() => ({
  writeTextToClipboard: vi.fn(),
}));

vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span aria-hidden="true" data-testid={`icon-${name}`} />,
}));

vi.mock('@/lib/clipboard', () => ({
  writeTextToClipboard: (...args: unknown[]) => mocks.writeTextToClipboard(...args),
}));

describe('DiagnosticsPanel', () => {
  afterEach(() => {
    cleanup();
    clearDiagnosticsLog();
    vi.clearAllMocks();
  });

  it('lets the user copy and clear explicit diagnostics', async () => {
    mocks.writeTextToClipboard.mockResolvedValue(true);
    const { container } = render(<DiagnosticsPanel />);

    expect(screen.getByLabelText('0 diagnostics entries')).toBeInTheDocument();
    expect(container.querySelector('[data-diagnostics-panel="true"]')).toHaveClass('pointer-events-none');
    expect(container.querySelector('[data-diagnostics-panel="true"]')).toHaveClass('top-[var(--vlaina-size-56px)]');
    expect(container.querySelector('[data-diagnostics-panel="true"]')).not.toHaveClass('bottom-4');
    expect(screen.getByRole('button', { name: 'Copy diagnostics' })).toHaveClass('pointer-events-auto');
    expect(screen.getByRole('button', { name: 'Clear diagnostics' })).toHaveClass('pointer-events-auto');

    act(() => {
      logDiagnostic('test', 'diagnostic-event', { value: 1 });
    });

    expect(screen.getByLabelText('1 diagnostics entries')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy diagnostics' }));
    });

    expect(mocks.writeTextToClipboard).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument();
    expect(screen.getByTestId('icon-common.check')).toBeInTheDocument();
    expect(mocks.writeTextToClipboard.mock.calls[0]?.[0]).toContain('"diagnostic": "vlaina"');
    expect(mocks.writeTextToClipboard.mock.calls[0]?.[0]).toContain('"channel": "test"');
    expect(mocks.writeTextToClipboard.mock.calls[0]?.[0]).toContain('"diagnostic-event"');

    fireEvent.click(screen.getByRole('button', { name: 'Clear diagnostics' }));

    expect(screen.getByLabelText('0 diagnostics entries')).toBeInTheDocument();
    expect(getDiagnosticsLogText()).toContain('"entries": []');
  });

  it('does not evaluate throttled diagnostic details', () => {
    const performanceNowSpy = vi.spyOn(performance, 'now');
    const acceptedDetails = vi.fn(() => ({ value: 1 }));
    const throttledDetails = vi.fn(() => ({ value: 2 }));
    performanceNowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1100);

    logDiagnostic('test', 'accepted', acceptedDetails, {
      throttleKey: 'lazy-details',
      throttleMs: 250,
    });
    logDiagnostic('test', 'throttled', throttledDetails, {
      throttleKey: 'lazy-details',
      throttleMs: 250,
    });

    expect(acceptedDetails).toHaveBeenCalledTimes(1);
    expect(throttledDetails).not.toHaveBeenCalled();
    expect(getDiagnosticsLogText()).toContain('"event": "accepted"');
    expect(getDiagnosticsLogText()).not.toContain('"event": "throttled"');
    performanceNowSpy.mockRestore();
  });
});
