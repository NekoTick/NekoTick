import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { filterCodeBlockLanguages, LanguageSelector } from './LanguageSelector';

vi.mock('@/components/ui/popover', () => ({
  Popover: ({ open, children }: { open: boolean; children?: ReactNode }) => (
    open ? <div>{children}</div> : null
  ),
  PopoverAnchor: ({ children, asChild: _asChild, ...props }: { children?: ReactNode; asChild?: boolean }) => (
    <div {...props}>{children}</div>
  ),
  PopoverContent: ({
    children,
    align: _align,
    sideOffset: _sideOffset,
    onOpenAutoFocus: _onOpenAutoFocus,
    ...props
  }: {
    children?: ReactNode;
    align?: string;
    sideOffset?: number;
    onOpenAutoFocus?: (event: Event) => void;
  }) => (
    <div data-testid="language-selector-content" {...props}>
      {children}
    </div>
  ),
}));

describe('LanguageSelector', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('trims accidental whitespace before filtering languages', () => {
    const languages = [
      { id: 'js', name: 'JavaScript', aliases: ['javascript'] },
      { id: 'ts', name: 'TypeScript', aliases: ['typescript'] },
    ];

    expect(filterCodeBlockLanguages('  ts  ', languages).map((language) => language.id)).toEqual(['ts']);
  });

  it('uses lowercase compact options inside the shared pill surface', () => {
    render(
      <LanguageSelector
        language="ts"
        displayName="typescript"
        getNodeText={() => 'const value: string = "ok";'}
        onLanguageChange={vi.fn()}
        isOpen
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('language-selector-content').className).toContain(raisedPillSurfaceClass);

    const javascriptOption = screen.getByRole('button', { name: 'javascript' });
    expect(javascriptOption.className).toContain('rounded-[var(--vlaina-notes-ui-radius-compact)]');
    expect(screen.queryByRole('button', { name: 'JavaScript' })).toBeNull();
  });

  it('matches the sidebar search field shell and keeps the full language trigger visible', () => {
    render(
      <LanguageSelector
        language="ts"
        displayName="shell"
        getNodeText={() => 'const value: string = "ok";'}
        onLanguageChange={vi.fn()}
        isOpen
        onOpenChange={vi.fn()}
      />,
    );

    const trigger = screen.getAllByRole('button', { name: 'shell' })[0];
    expect(trigger.className).toContain('inline-flex');
    expect(trigger.className).toContain('min-h-7');
    expect(trigger.className).not.toContain('size-7');
    expect(trigger.className).not.toContain('overflow-hidden');
    expect(trigger.className).toContain('rounded-full');
    expect(trigger.className).not.toContain('hover:bg-');
    expect(trigger.className).not.toContain('dark:hover:bg-');
    expect(trigger.className).not.toContain(raisedPillSurfaceClass);
    expect(trigger.querySelector('.code-block-chrome-language-label')?.className).toContain('whitespace-nowrap');
    expect(trigger.querySelector('.code-block-chrome-language-label')?.className).not.toContain('truncate');

    const searchInput = screen.getByPlaceholderText('Search language...');
    expect(searchInput.parentElement?.className).toContain('h-[var(--vlaina-size-40px)]');
    expect(searchInput.parentElement?.className).toContain('rounded-full');
    expect(searchInput.parentElement?.className).toContain(raisedPillSurfaceClass);

    const autoDetectButton = screen.getByRole('button', { name: 'Auto Detect Language' });
    expect(autoDetectButton.getAttribute('title')).toBeNull();
    expect(autoDetectButton.className).toContain('rounded-full');
    expect(autoDetectButton.className).toContain('hover:bg-[var(--vlaina-color-pill-surface-hover)]');
    expect(autoDetectButton.className).toContain('hover:shadow-[var(--vlaina-shadow-menu-hover)]');
    expect(autoDetectButton.className).toContain('hover:text-[var(--vlaina-accent)]');
  });

  it('does not select a language while an unmarked keydown belongs to an active composition', () => {
    const onLanguageChange = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <LanguageSelector
        language="ts"
        displayName="typescript"
        getNodeText={() => ''}
        onLanguageChange={onLanguageChange}
        isOpen
        onOpenChange={onOpenChange}
      />,
    );

    const searchInput = screen.getByPlaceholderText('Search language...');
    fireEvent.compositionStart(searchInput);
    fireEvent.keyDown(searchInput, { key: 'Enter', isComposing: false });

    expect(onLanguageChange).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('does not treat image clipboard companion text as a language search', () => {
    render(
      <LanguageSelector
        language="ts"
        displayName="typescript"
        getNodeText={() => ''}
        onLanguageChange={vi.fn()}
        isOpen
        onOpenChange={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText('Search language...');
    const file = new File(['image'], 'language.png', { type: 'image/png' });

    expect(fireEvent.paste(input, {
      clipboardData: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        files: [file],
        getData: () => 'https://example.test/companion',
      },
    })).toBe(false);
    expect(input).toHaveValue('');
  });
});
