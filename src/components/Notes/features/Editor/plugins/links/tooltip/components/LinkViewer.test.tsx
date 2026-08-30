import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LinkViewer } from './LinkViewer';

vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('../hooks/useLinkTooltipContentWidth', () => ({
  useLinkTooltipContentWidth: () => ({ maxWidth: 320 }),
}));

function renderViewer(showCopied: boolean) {
  render(
    <LinkViewer
      displayUrl="https://example.test/docs"
      isAutolink={false}
      showCopied={showCopied}
      onOpen={vi.fn()}
      onCopy={vi.fn()}
      onEdit={vi.fn()}
      onUnlink={vi.fn()}
      onRemove={vi.fn()}
    />
  );
}

describe('LinkViewer', () => {
  it('marks copied feedback as active so selected-block toolbar colors remain intact', () => {
    renderViewer(true);

    expect(screen.getByTestId('icon-common.check').closest('button')).toHaveClass('active');
  });

  it('keeps the copy action inactive before copied feedback', () => {
    renderViewer(false);

    expect(screen.getByTestId('icon-common.copy').closest('button')).not.toHaveClass('active');
  });

  it('gives link actions accessible names', () => {
    renderViewer(false);

    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
  });
});
