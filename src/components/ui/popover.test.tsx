import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

function ControlledPopover({
  dismissOnWindowPointerDown,
  onOpenChange,
}: {
  dismissOnWindowPointerDown?: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        onOpenChange(nextOpen);
      }}
      dismissOnWindowPointerDown={dismissOnWindowPointerDown}
    >
      <PopoverTrigger asChild>
        <button type="button">trigger</button>
      </PopoverTrigger>
      <PopoverContent>content</PopoverContent>
    </Popover>
  );
}

describe('Popover', () => {
  it('closes on window pointer down before document handlers can intercept the editor blank area', () => {
    const onOpenChange = vi.fn();
    const stopAtDocumentCapture = (event: PointerEvent) => event.stopImmediatePropagation();
    document.addEventListener('pointerdown', stopAtDocumentCapture, true);

    try {
      render(
        <>
          <div data-testid="editor-bottom-blank">blank</div>
          <ControlledPopover onOpenChange={onOpenChange} />
        </>,
      );

      fireEvent.pointerDown(screen.getByTestId('editor-bottom-blank'));

      expect(onOpenChange).toHaveBeenCalledWith(false);
      expect(screen.queryByText('content')).not.toBeInTheDocument();
    } finally {
      document.removeEventListener('pointerdown', stopAtDocumentCapture, true);
    }
  });

  it('keeps the popover open for its trigger and content interactions', () => {
    const onOpenChange = vi.fn();
    render(<ControlledPopover onOpenChange={onOpenChange} />);

    fireEvent.pointerDown(screen.getByText('trigger'));
    fireEvent.pointerDown(screen.getByText('content'));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('allows popovers with custom outside interaction rules to opt out', () => {
    const onOpenChange = vi.fn();
    render(
      <>
        <div data-testid="outside">outside</div>
        <ControlledPopover
          dismissOnWindowPointerDown={false}
          onOpenChange={onOpenChange}
        />
      </>,
    );

    fireEvent.pointerDown(screen.getByTestId('outside'));

    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByText('content')).toBeInTheDocument();
  });
});
