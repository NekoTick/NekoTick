import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { EditorOutlineRail } from './EditorOutlineRail';

const mocks = vi.hoisted(() => ({
  activeId: 'overview' as string | null,
  headings: [
    { id: 'intro', level: 1, text: 'Introduction', from: 0, to: 12 },
    { id: 'overview', level: 2, text: 'Overview', from: 13, to: 21 },
    { id: 'details', level: 3, text: 'Details', from: 22, to: 29 },
  ],
  jumpToHeading: vi.fn(),
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

vi.mock('../Sidebar/Outline/useNotesOutline', () => ({
  useNotesOutline: () => ({
    activeId: mocks.activeId,
    headings: mocks.headings,
    jumpToHeading: mocks.jumpToHeading,
  }),
}));

describe('EditorOutlineRail', () => {
  beforeEach(() => {
    mocks.activeId = 'overview';
    mocks.headings = [
      { id: 'intro', level: 1, text: 'Introduction', from: 0, to: 12 },
      { id: 'overview', level: 2, text: 'Overview', from: 13, to: 21 },
      { id: 'details', level: 3, text: 'Details', from: 22, to: 29 },
    ];
    mocks.jumpToHeading.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a toolbar-anchored hierarchy and jumps to a selected heading', () => {
    const { container } = render(<EditorOutlineRail enabled />);
    const rail = container.querySelector<HTMLElement>('[data-editor-outline-rail="true"]');
    const panel = container.querySelector<HTMLElement>('[data-editor-outline-panel="true"]');

    expect(rail).not.toBeNull();
    expect(rail).toHaveAttribute('data-editor-outline-toolbar-anchor', 'true');
    expect(panel).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'notes.documentOutline' }));
    const outline = screen.getByRole('navigation', { name: 'notes.documentOutline' });
    const overview = screen.getByRole('button', { name: 'Overview' });

    expect(panel).toBeVisible();
    expect(panel?.className).toContain(raisedPillSurfaceClass);
    expect(outline).toBeVisible();
    expect(panel).toHaveTextContent('notes.documentOutline');
    expect(overview).toHaveAttribute('data-level', '2');
    expect(overview).toHaveAttribute('aria-current', 'location');

    fireEvent.click(screen.getByRole('button', { name: 'Details' }));

    expect(mocks.jumpToHeading).toHaveBeenCalledWith('details');
  });

  it('keeps every outline row keyboard focusable', () => {
    const { container } = render(<EditorOutlineRail enabled />);
    const rows = Array.from(container.querySelectorAll<HTMLButtonElement>('.editor-outline-row'));

    expect(rows).toHaveLength(3);
    rows.forEach((row) => expect(row).not.toHaveAttribute('tabindex', '-1'));
  });

  it('starts collapsed and toggles from the same toolbar control', () => {
    const { container } = render(<EditorOutlineRail enabled />);
    const toggle = screen.getByRole('button', { name: 'notes.documentOutline' });
    const rail = container.querySelector<HTMLElement>('[data-editor-outline-rail="true"]');
    const panel = container.querySelector<HTMLElement>('[data-editor-outline-panel="true"]');
    const outline = container.querySelector<HTMLElement>('.editor-outline-list');

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(rail).toHaveAttribute('data-collapsed', 'true');
    expect(panel).not.toBeVisible();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(toggle).toHaveClass('bg-transparent');
    expect(toggle).toHaveClass('shadow-none');
    expect(toggle).toHaveClass('hover:bg-[var(--vlaina-color-pill-surface-hover)]');
    expect(toggle).toHaveClass('hover:shadow-[var(--vlaina-shadow-menu-hover)]');
    expect(toggle).toHaveClass('text-[var(--vlaina-sidebar-row-selected-text)]');
    expect(rail).toHaveAttribute('data-collapsed', 'false');
    expect(panel).toBeVisible();
    expect(outline).toHaveAttribute('aria-hidden', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(outline).toHaveAttribute('aria-hidden', 'true');
  });

  it('preserves its expanded state while the toolbar temporarily hides it', () => {
    const { rerender } = render(<EditorOutlineRail enabled />);
    fireEvent.click(screen.getByRole('button', { name: 'notes.documentOutline' }));

    rerender(<EditorOutlineRail enabled={false} />);
    expect(screen.queryByRole('button', { name: 'notes.documentOutline' })).not.toBeInTheDocument();

    rerender(<EditorOutlineRail enabled />);
    expect(screen.getByRole('button', { name: 'notes.documentOutline' }))
      .toHaveAttribute('aria-expanded', 'true');
  });

  it('does not render without an editable outline', () => {
    const { container, rerender } = render(<EditorOutlineRail enabled={false} />);

    expect(container).toBeEmptyDOMElement();

    mocks.headings = [];
    rerender(<EditorOutlineRail enabled />);

    expect(container).toBeEmptyDOMElement();
  });

  it('keeps the complete long outline visible with its active section marked', () => {
    mocks.headings = Array.from({ length: 30 }, (_, index) => ({
      id: `heading-${index}`,
      level: (index % 4) + 1,
      text: `Heading ${index}`,
      from: index,
      to: index + 1,
    }));
    mocks.activeId = 'heading-22';

    render(<EditorOutlineRail enabled />);
    fireEvent.click(screen.getByRole('button', { name: 'notes.documentOutline' }));

    expect(document.querySelectorAll('.editor-outline-row')).toHaveLength(30);
    expect(screen.getByRole('button', { name: 'Heading 22' })).toHaveAttribute(
      'aria-current',
      'location',
    );
  });
});
