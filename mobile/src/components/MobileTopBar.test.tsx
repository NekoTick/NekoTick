import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileTopBar } from './MobileTopBar';

const controls = vi.hoisted(() => ({
  modelSelectorProps: vi.fn(),
}));

vi.mock('@/components/Chat/features/Input/ModelSelector', () => ({
  ModelSelector: (props: Record<string, unknown>) => {
    controls.modelSelectorProps(props);
    return <div data-testid="model-selector" />;
  },
}));
vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe('MobileTopBar', () => {
  it('exposes the Notes title and all Notes actions', () => {
    const onCreateNote = vi.fn();
    const onOpenMore = vi.fn();
    const onOpenSidebar = vi.fn();

    render(
      <MobileTopBar
        activeView="notes"
        onCreateNote={onCreateNote}
        onOpenMore={onOpenMore}
        onOpenSidebar={onOpenSidebar}
      />,
    );

    expect(screen.getByRole('heading', { name: 'app.viewNotes' })).toBeInTheDocument();
    expect(document.querySelector('[data-icon="file.text"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'sidebar.mobileTitle' }));
    fireEvent.click(screen.getByRole('button', { name: 'sidebar.newNote' }));
    fireEvent.click(screen.getByRole('button', { name: 'sidebar.more' }));

    expect(onOpenSidebar).toHaveBeenCalledOnce();
    expect(onCreateNote).toHaveBeenCalledOnce();
    expect(onOpenMore).toHaveBeenCalledOnce();
  });

  it.each([
    ['whiteboard', 'app.viewWhiteboard', 'editor.diagram'],
    ['graph', 'app.viewGraph', 'graph.network'],
  ] as const)('shows the %s workspace without a create-note action', (
    activeView,
    label,
    icon,
  ) => {
    render(
      <MobileTopBar
        activeView={activeView}
        onCreateNote={vi.fn()}
        onOpenMore={vi.fn()}
        onOpenSidebar={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: label })).toBeInTheDocument();
    expect(document.querySelector(`[data-icon="${icon}"]`)).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'sidebar.newNote' })).not.toBeInTheDocument();
  });

  it('embeds the model selector in the Chat title area', () => {
    render(
      <MobileTopBar
        activeView="chat"
        onCreateNote={vi.fn()}
        onOpenMore={vi.fn()}
        onOpenSidebar={vi.fn()}
      />,
    );

    expect(screen.getByTestId('model-selector')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'sidebar.newNote' })).not.toBeInTheDocument();
    expect(controls.modelSelectorProps).toHaveBeenLastCalledWith(expect.objectContaining({
      dropdownPlacement: 'bottom',
      dropdownAlign: 'left',
      isEmbedded: true,
      focusSearchOnOpen: false,
      restoreComposerFocusOnClose: false,
    }));
  });
});
