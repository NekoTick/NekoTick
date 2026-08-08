import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MobileTopBar } from './MobileTopBar';

const controls = vi.hoisted(() => ({
  modelSelectorProps: vi.fn(),
}));

vi.mock('@/components/layout/AccountAvatarImage', () => ({
  AccountAvatarImage: ({ alt }: { alt: string }) => <img alt={alt} data-testid="avatar" />,
}));
vi.mock('@/hooks/useUserAvatar', () => ({
  useUserAvatar: () => null,
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
  it('renders the view navigation and opens the sidebar', () => {
    const onOpenSidebar = vi.fn();
    const onViewChange = vi.fn();

    render(
      <MobileTopBar
        activeView="notes"
        onOpenSidebar={onOpenSidebar}
        onViewChange={onViewChange}
      />,
    );

    const notesButton = screen.getByRole('button', { name: 'app.viewNotes' });
    expect(notesButton).toHaveAttribute('aria-current', 'page');
    expect(document.querySelector('[data-icon="file.text"]')).not.toBeNull();
    expect(screen.getByText('app.viewNotes')).toBeInTheDocument();
    expect(screen.getAllByRole('button', {
      name: /app\.viewNotes|app\.viewGraph|app\.viewWhiteboard|app\.viewChat/,
    }).map((button) => button.getAttribute('aria-label'))).toEqual([
      'app.viewNotes',
      'app.viewGraph',
      'app.viewWhiteboard',
      'app.viewChat',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'sidebar.mobileTitle' }));
    fireEvent.click(screen.getByRole('button', { name: 'app.viewGraph' }));

    expect(onOpenSidebar).toHaveBeenCalledOnce();
    expect(onViewChange).toHaveBeenCalledWith('graph');
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
        onOpenSidebar={vi.fn()}
        onViewChange={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-current', 'page');
    expect(document.querySelector(`[data-icon="${icon}"]`)).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'sidebar.newNote' })).not.toBeInTheDocument();
  });

  it('embeds the model selector in the Chat title area', () => {
    render(
      <MobileTopBar
        activeView="chat"
        onOpenSidebar={vi.fn()}
        onViewChange={vi.fn()}
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
