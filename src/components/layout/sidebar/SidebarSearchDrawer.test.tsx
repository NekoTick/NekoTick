import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createRef, useRef } from 'react';
import { SidebarSearchDrawer, useSidebarSearchDrawerState } from './SidebarSearchDrawer';

function SearchControlsHarness({
  attachScope = true,
  onClose,
}: {
  attachScope?: boolean;
  onClose: () => void;
}) {
  const scopeRef = useRef<HTMLDivElement | null>(null);
  const {
    inputRef,
    scrollRootRef,
  } = useSidebarSearchDrawerState({
    isOpen: true,
    query: 'alpha',
    onClose,
    scopeRef,
  });

  return (
    <>
      {attachScope ? (
        <div ref={scopeRef}>
          <div ref={scrollRootRef}>
            <input ref={inputRef} aria-label="Search" />
          </div>
        </div>
      ) : null}
      <textarea aria-label="Outside editor" />
      <div role="dialog">
        <button type="button">Dialog action</button>
      </div>
    </>
  );
}

describe('SidebarSearchDrawer', () => {
  it('only exposes the search popup relationship when results exist', () => {
    const { rerender } = render(
      <SidebarSearchDrawer
        isSearchOpen
        shouldShowTopActions={false}
        searchQuery=""
        setSearchQuery={() => {}}
        inputRef={createRef<HTMLInputElement>()}
        hideSearch={() => {}}
        canSubmit={false}
        onSubmit={() => {}}
        placeholder="Search"
        ariaLabel="Search"
        activeDescendant="search-result-0"
        closeLabel="Close search"
        resultsId="search-results"
        hasSearchResults={false}
        topActions={null}
      />,
    );

    const input = screen.getByRole('combobox', { name: 'Search' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-controls');
    expect(input).not.toHaveAttribute('aria-activedescendant');

    rerender(
      <SidebarSearchDrawer
        isSearchOpen
        shouldShowTopActions={false}
        searchQuery="missing"
        setSearchQuery={() => {}}
        inputRef={createRef<HTMLInputElement>()}
        hideSearch={() => {}}
        canSubmit={false}
        onSubmit={() => {}}
        placeholder="Search"
        ariaLabel="Search"
        activeDescendant="search-result-0"
        closeLabel="Close search"
        resultsId="search-results"
        hasSearchResults={false}
        topActions={null}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Search' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('combobox', { name: 'Search' })).not.toHaveAttribute('aria-controls');

    rerender(
      <SidebarSearchDrawer
        isSearchOpen
        shouldShowTopActions={false}
        searchQuery="match"
        setSearchQuery={() => {}}
        inputRef={createRef<HTMLInputElement>()}
        hideSearch={() => {}}
        canSubmit
        onSubmit={() => {}}
        placeholder="Search"
        ariaLabel="Search"
        activeDescendant="search-result-0"
        closeLabel="Close search"
        resultsId="search-results"
        hasSearchResults
        topActions={null}
      />,
    );

    const resultInput = screen.getByRole('combobox', { name: 'Search' });
    expect(resultInput).toHaveAttribute('aria-expanded', 'true');
    expect(resultInput).toHaveAttribute('aria-controls', 'search-results');
    expect(resultInput).toHaveAttribute('aria-activedescendant', 'search-result-0');
  });

  it('handles arrow key selection before submit', () => {
    const onSelectPrevious = vi.fn();
    const onSelectNext = vi.fn();
    const onSubmit = vi.fn();

    render(
      <SidebarSearchDrawer
        isSearchOpen
        shouldShowTopActions={false}
        searchQuery="alpha"
        setSearchQuery={() => {}}
        inputRef={createRef<HTMLInputElement>()}
        hideSearch={() => {}}
        canSubmit
        onSubmit={onSubmit}
        canSelectPrevious
        canSelectNext
        onSelectPrevious={onSelectPrevious}
        onSelectNext={onSelectNext}
        placeholder=""
        closeLabel="Close search"
        topActions={null}
      />,
    );

    const input = screen.getByRole('textbox');
    const downEvent = fireEvent.keyDown(input, { key: 'ArrowDown' });
    const upEvent = fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(downEvent).toBe(false);
    expect(upEvent).toBe(false);
    expect(onSelectNext).toHaveBeenCalledTimes(1);
    expect(onSelectPrevious).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not navigate, submit, or close while IME composition is active', () => {
    const hideSearch = vi.fn();
    const onSelectNext = vi.fn();
    const onSubmit = vi.fn();

    render(
      <SidebarSearchDrawer
        isSearchOpen
        shouldShowTopActions={false}
        searchQuery="hao"
        setSearchQuery={() => {}}
        inputRef={createRef<HTMLInputElement>()}
        hideSearch={hideSearch}
        canSubmit
        onSubmit={onSubmit}
        canSelectNext
        onSelectNext={onSelectNext}
        placeholder=""
        closeLabel="Close search"
        topActions={null}
      />,
    );

    const input = screen.getByRole('textbox');
    const enterEvent = fireEvent.keyDown(input, {
      key: 'Enter',
      nativeEvent: { isComposing: true },
      isComposing: true,
    });
    fireEvent.keyDown(input, { key: 'ArrowDown', isComposing: true });
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true });

    expect(enterEvent).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onSelectNext).not.toHaveBeenCalled();
    expect(hideSearch).not.toHaveBeenCalled();
  });

  it('leaves arrow keys alone when there is no selectable result', () => {
    const onSelectNext = vi.fn();

    render(
      <SidebarSearchDrawer
        isSearchOpen
        shouldShowTopActions={false}
        searchQuery="missing"
        setSearchQuery={() => {}}
        inputRef={createRef<HTMLInputElement>()}
        hideSearch={() => {}}
        canSubmit={false}
        onSubmit={() => {}}
        canSelectNext={false}
        onSelectNext={onSelectNext}
        placeholder=""
        closeLabel="Close search"
        topActions={null}
      />,
    );

    const input = screen.getByRole('textbox');
    const downEvent = fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(downEvent).toBe(true);
    expect(onSelectNext).not.toHaveBeenCalled();
  });

  it('does not paste image clipboard companion text into search', () => {
    render(
      <SidebarSearchDrawer
        isSearchOpen
        shouldShowTopActions={false}
        searchQuery=""
        setSearchQuery={() => {}}
        inputRef={createRef<HTMLInputElement>()}
        hideSearch={() => {}}
        canSubmit={false}
        onSubmit={() => {}}
        placeholder="Search"
        ariaLabel="Search"
        closeLabel="Close search"
        topActions={null}
      />,
    );
    const image = new File(['image'], 'search.png', { type: 'image/png' });
    const input = screen.getByRole('textbox');

    expect(fireEvent.paste(input, {
      clipboardData: {
        items: [{ kind: 'file', type: image.type, getAsFile: () => image }],
        files: [image],
        getData: () => 'https://example.test/companion',
      },
    })).toBe(false);
    expect(fireEvent.paste(input, {
      clipboardData: {
        items: [],
        files: [],
        getData: () => 'https://example.test/plain',
      },
    })).toBe(true);
  });

  it('closes search from an outside editor even when an unrelated dialog exists', () => {
    const onClose = vi.fn();
    render(<SearchControlsHarness onClose={onClose} />);

    screen.getByLabelText('Outside editor').focus();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes search from an outside editor even if Escape carries stale modifiers', () => {
    const onClose = vi.fn();
    render(<SearchControlsHarness onClose={onClose} />);

    screen.getByLabelText('Outside editor').focus();
    fireEvent.keyDown(document, { key: 'Escape', ctrlKey: true, shiftKey: true });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes search even if the interaction scope is not attached yet', () => {
    const onClose = vi.fn();
    render(<SearchControlsHarness attachScope={false} onClose={onClose} />);

    screen.getByLabelText('Outside editor').focus();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close search when Escape starts inside a dialog', () => {
    const onClose = vi.fn();
    render(<SearchControlsHarness onClose={onClose} />);

    screen.getByRole('button', { name: 'Dialog action' }).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });
});
