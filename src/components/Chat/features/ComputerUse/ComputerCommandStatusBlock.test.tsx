import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ComputerCommandPhase, ComputerCommandStatus } from '@/lib/ai/computerUse/types';
import { ComputerCommandStatusBlock } from './ComputerCommandStatusBlock';

function status(id: string, phase: ComputerCommandPhase): ComputerCommandStatus {
  return {
    id,
    phase,
    command: `printf ${id}`,
    cwd: '/tmp/project',
    purpose: `Run ${id}`,
    stdout: '',
    stderr: '',
    updatedAt: 0,
  };
}

describe('ComputerCommandStatusBlock', () => {
  it('collapses as one stable group and shows completed only once', () => {
    const initial = [
      status('one', 'completed'),
      status('two', 'completed'),
      status('three', 'failed'),
    ];
    const view = render(<ComputerCommandStatusBlock isLoading statuses={initial} />);
    const toggle = screen.getByRole('button', { name: 'Execution mode' });

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveClass('select-none');
    expect(screen.getAllByText('Completed')).toHaveLength(1);
    expect(screen.getByText('Completed').parentElement).toHaveClass('select-none');
    expect(screen.getByText('Completed').parentElement)
      .toHaveAttribute('data-chat-selection-excluded', 'true');
    expect(screen.getByText('Failed')).toBeInTheDocument();
    expect(screen.getByText('printf one')).toBeInTheDocument();
    expect(screen.getByText('printf two')).toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('printf one')).not.toBeInTheDocument();
    expect(screen.queryByText('Failed')).not.toBeInTheDocument();

    view.rerender(
      <ComputerCommandStatusBlock
        isLoading
        statuses={[...initial, status('four', 'running')]}
      />,
    );
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('printf four')).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByText('Completed')).toHaveLength(1);
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('printf four')).toBeInTheDocument();
  });

  it('collapses after every command completes and reopens for later activity', () => {
    const first = status('one', 'completed');
    const view = render(<ComputerCommandStatusBlock isLoading statuses={[first]} />);
    const toggle = screen.getByRole('button', { name: 'Execution mode' });

    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    view.rerender(<ComputerCommandStatusBlock isLoading={false} statuses={[first]} />);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('printf one')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const secondRunning = status('two', 'running');
    view.rerender(
      <ComputerCommandStatusBlock isLoading statuses={[first, secondRunning]} />,
    );
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Running')).toBeInTheDocument();

    view.rerender(
      <ComputerCommandStatusBlock
        isLoading={false}
        statuses={[first, status('two', 'completed')]}
      />,
    );
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('printf two')).not.toBeInTheDocument();
  });

  it('keeps unsuccessful command groups expanded after the response ends', () => {
    render(
      <ComputerCommandStatusBlock
        isLoading={false}
        statuses={[status('one', 'completed'), status('two', 'failed')]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Execution mode' }))
      .toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Failed')).toBeInTheDocument();
  });
});
