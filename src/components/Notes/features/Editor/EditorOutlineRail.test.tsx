import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSidebarIdleRowSurfaceClass,
  getSidebarSelectedRowSurfaceClass,
} from '@/components/layout/sidebar/sidebarLabelStyles';
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
  sourceHeadings: [
    { id: 'source-heading', level: 2, text: 'Source heading', from: 4, to: 20 },
  ],
  jumpToSourceHeading: vi.fn(),
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

vi.mock('./sourceMode/useSourceNotesOutline', () => ({
  useSourceNotesOutline: () => ({
    activeId: 'source-heading',
    headings: mocks.sourceHeadings,
    jumpToHeading: mocks.jumpToSourceHeading,
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
    mocks.jumpToSourceHeading.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders a right-edge hierarchy and jumps to a selected heading', () => {
    const { container } = render(<EditorOutlineRail enabled />);
    const rail = container.querySelector<HTMLElement>('[data-editor-outline-rail="true"]');
    const panel = container.querySelector<HTMLElement>('[data-editor-outline-panel="true"]');
    const outline = screen.getByRole('navigation', { name: 'notes.documentOutline' });
    const overview = screen.getByRole('button', { name: 'Overview' });

    expect(rail).not.toBeNull();
    expect(panel).toBeVisible();
    expect(outline).toBeVisible();
    expect(rail).toHaveAttribute('data-expanded', 'false');
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

  it('uses source headings while source mode is active', () => {
    render(<EditorOutlineRail enabled sourceMode />);

    fireEvent.click(screen.getByRole('button', { name: 'Source heading' }));

    expect(screen.queryByRole('button', { name: 'Introduction' })).not.toBeInTheDocument();
    expect(mocks.jumpToSourceHeading).toHaveBeenCalledWith('source-heading');
  });

  it('expands on hover and keyboard focus, then collapses after leaving', async () => {
    const { container } = render(<EditorOutlineRail enabled />);
    const rail = container.querySelector<HTMLElement>('[data-editor-outline-rail="true"]')!;
    const panel = container.querySelector<HTMLElement>('[data-editor-outline-panel="true"]');
    const scrollArea = container.querySelector<HTMLElement>('.editor-outline-scroll-area')!;
    const overview = screen.getByRole('button', { name: 'Overview' });

    expect(rail).toHaveAttribute('data-expanded', 'false');

    fireEvent.mouseEnter(scrollArea);
    await waitFor(() => expect(rail).toHaveAttribute('data-expanded', 'true'));
    expect(panel?.className).toContain(raisedPillSurfaceClass);
    expect(screen.getByRole('button', { name: 'Introduction' }).className)
      .toContain(getSidebarIdleRowSurfaceClass('notes'));
    expect(overview.className).toContain(getSidebarSelectedRowSurfaceClass('notes'));

    fireEvent.mouseLeave(scrollArea);
    await waitFor(() => expect(rail).toHaveAttribute('data-expanded', 'false'));
    expect(panel?.className).not.toContain(raisedPillSurfaceClass);

    fireEvent.focus(overview);
    await waitFor(() => expect(rail).toHaveAttribute('data-expanded', 'true'));

    fireEvent.blur(overview, { relatedTarget: document.body });
    await waitFor(() => expect(rail).toHaveAttribute('data-expanded', 'false'));
  });

  it('returns collapsed after the toolbar temporarily hides it', async () => {
    const { container, rerender } = render(<EditorOutlineRail enabled />);
    const rail = document.querySelector<HTMLElement>('[data-editor-outline-rail="true"]')!;
    const scrollArea = container.querySelector<HTMLElement>('.editor-outline-scroll-area')!;
    fireEvent.mouseEnter(scrollArea);
    await waitFor(() => expect(rail).toHaveAttribute('data-expanded', 'true'));

    rerender(<EditorOutlineRail enabled={false} />);
    expect(screen.queryByRole('navigation', { name: 'notes.documentOutline' })).not.toBeInTheDocument();

    rerender(<EditorOutlineRail enabled />);
    expect(document.querySelector('[data-editor-outline-rail="true"]'))
      .toHaveAttribute('data-expanded', 'false');
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

    expect(document.querySelectorAll('.editor-outline-row')).toHaveLength(30);
    expect(screen.getByRole('button', { name: 'Heading 22' })).toHaveAttribute(
      'aria-current',
      'location',
    );
  });

  it('only rerenders outline rows whose active state changes', () => {
    let textReads = 0;
    mocks.headings = Array.from({ length: 30 }, (_, index) => {
      const heading = {
        id: `heading-${index}`,
        level: (index % 4) + 1,
        text: '',
        from: index,
        to: index + 1,
      };
      Object.defineProperty(heading, 'text', {
        enumerable: true,
        get: () => {
          textReads += 1;
          return `Heading ${index}`;
        },
      });
      return heading;
    });
    mocks.activeId = 'heading-22';
    const { rerender } = render(<EditorOutlineRail enabled />);
    textReads = 0;

    mocks.activeId = 'heading-23';
    rerender(<EditorOutlineRail enabled />);

    expect(textReads).toBe(2);
  });
});
