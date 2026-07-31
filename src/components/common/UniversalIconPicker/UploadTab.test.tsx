import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ButtonHTMLAttributes } from 'react';
import { UploadTab, type CustomIcon } from './UploadTab';

const mocks = vi.hoisted(() => ({
  lastDropzoneOptions: null as null | { onDrop: (files: File[]) => void },
}));

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 52,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        size: 52,
        start: index * 52,
      })),
    measure: vi.fn(),
  }),
}));

vi.mock('react-dropzone', () => ({
  useDropzone: (options: { onDrop: (files: File[]) => void }) => ({
    getRootProps: () => ({ 'data-testid': 'dropzone-root' }),
    getInputProps: () => {
      mocks.lastDropzoneOptions = options;
      return {};
    },
    isDragActive: false,
    open: vi.fn(),
  }),
}));

vi.mock('react-easy-crop', () => ({
  default: ({ image }: { image: string }) => <div data-testid="cropper" data-image={image} />,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

vi.mock('@/components/ui/premium-slider', () => ({
  PremiumSlider: () => <div data-testid="premium-slider" />,
}));

vi.mock('@/components/common/AppIcon', () => ({
  AppIcon: ({
    icon,
    allowLegacyImageScheme,
  }: {
    icon: string;
    allowLegacyImageScheme?: boolean;
  }) => (
    <img
      alt={`icon-${icon}`}
      data-allow-legacy-image-scheme={allowLegacyImageScheme ? 'true' : 'false'}
      src={icon}
    />
  ),
}));

function buildIcon(id: string): CustomIcon {
  return {
    id,
    url: `https://example.com/${id}.png`,
    name: id,
  };
}

describe('UploadTab', () => {
  beforeEach(() => {
    mocks.lastDropzoneOptions = null;
  });

  it('does not show an empty-state message when there are no saved icons', () => {
    const { container } = render(<UploadTab onSelect={() => {}} onPreview={() => {}} onClose={() => {}} customIcons={[]} />);

    expect(container.querySelector('.app-scrollbar')?.textContent).toBe('');
  });

  it('sanitizes SVG uploads before passing them to the cropper preview', async () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">',
      '<script>alert(1)</script>',
      '<foreignObject><iframe src="javascript:alert(1)"></iframe></foreignObject>',
      '<image href="https://example.test/a.png" xlink:href="https://example.test/b.png"></image>',
      '<rect filter="url(https://example.test/filter.svg#drop)" fill="url(#local-fill)"></rect>',
      '<circle cx="1" cy="1" r="1"></circle>',
      '</svg>',
    ].join('');
    const svgBytes = new TextEncoder().encode(svg);
    const file = {
      name: 'icon.svg',
      type: 'image/svg+xml',
      size: svgBytes.byteLength,
      arrayBuffer: vi.fn(async () => svgBytes.buffer),
    } as unknown as File;

    render(<UploadTab onSelect={() => {}} onPreview={() => {}} onClose={() => {}} customIcons={[]} />);
    expect(mocks.lastDropzoneOptions).not.toBeNull();

    await act(async () => {
      mocks.lastDropzoneOptions?.onDrop([file]);
    });

    const cropper = await screen.findByTestId('cropper');
    const image = cropper.getAttribute('data-image') ?? '';
    const decoded = decodeURIComponent(image.slice(image.indexOf(',') + 1));

    expect(image.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(decoded).toContain('<svg');
    expect(decoded).toContain('<circle');
    expect(decoded).toContain('url(#local-fill)');
    expect(decoded).not.toContain('<script');
    expect(decoded).not.toContain('foreignObject');
    expect(decoded).not.toContain('javascript:');
    expect(decoded).not.toContain('example.test');
    expect(decoded).not.toContain('onload');
  });

  it('loads an image pasted from the clipboard into the upload preview', async () => {
    const file = new File(['image'], 'pasted.png', { type: 'image/png' });

    render(<UploadTab onSelect={() => {}} onPreview={() => {}} onClose={() => {}} customIcons={[]} />);

    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
        files: [file],
      },
    });

    await act(async () => {
      document.dispatchEvent(pasteEvent);
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId('cropper')).toHaveAttribute('data-image', expect.stringContaining('data:image/png')));
    expect(pasteEvent.defaultPrevented).toBe(true);
  });

  it('leaves non-image clipboard content untouched', () => {
    render(<UploadTab onSelect={() => {}} onPreview={() => {}} onClose={() => {}} customIcons={[]} />);

    const pasteEvent = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
    Object.defineProperty(pasteEvent, 'clipboardData', {
      value: {
        items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }],
        files: [],
      },
    });

    document.dispatchEvent(pasteEvent);

    expect(pasteEvent.defaultPrevented).toBe(false);
    expect(screen.queryByTestId('cropper')).not.toBeInTheDocument();
  });

  it('supports preview, selection, and context-menu deletion from the custom icon library', async () => {
    const onSelect = vi.fn();
    const onPreview = vi.fn();
    const onClose = vi.fn();
    const onDeleteCustomIcon = vi.fn();

    render(
      <UploadTab
        onSelect={onSelect}
        onPreview={onPreview}
        onClose={onClose}
        onDeleteCustomIcon={onDeleteCustomIcon}
        customIcons={[buildIcon('first'), buildIcon('second')]}
      />,
    );

    const icon = screen.getByAltText('icon-https://example.com/first.png');
    const clickableArea = icon.parentElement;
    expect(clickableArea).not.toBeNull();

    fireEvent.mouseEnter(clickableArea!);
    expect(onPreview).toHaveBeenCalledWith('https://example.com/first.png');

    fireEvent.mouseLeave(clickableArea!);
    expect(onPreview).toHaveBeenLastCalledWith(null);

    fireEvent.click(clickableArea!);
    expect(onSelect).toHaveBeenCalledWith('https://example.com/first.png');
    expect(onClose).toHaveBeenCalledTimes(1);

    expect(screen.queryByTestId('delete-second')).not.toBeInTheDocument();
    expect(onDeleteCustomIcon).not.toHaveBeenCalled();

    const secondIcon = screen.getByAltText('icon-https://example.com/second.png');
    const secondClickableArea = secondIcon.parentElement;
    expect(secondClickableArea).not.toBeNull();

    fireEvent.contextMenu(secondClickableArea!, { clientX: 24, clientY: 32 });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    expect(onPreview).toHaveBeenLastCalledWith(null);
    await waitFor(() => {
      expect(onDeleteCustomIcon).toHaveBeenCalledWith('second');
    });
  });

  it('renders legacy global image-scheme custom icons through the app icon renderer', () => {
    render(
      <UploadTab
        onSelect={() => {}}
        onPreview={() => {}}
        onClose={() => {}}
        allowLegacyImageScheme
        customIcons={[
          {
            id: '/app/.vlaina/app/assets/icons/custom.png',
            url: 'img:/app/.vlaina/app/assets/icons/custom.png',
            name: 'custom.png',
          },
        ]}
      />,
    );

    expect(screen.getByAltText('icon-img:/app/.vlaina/app/assets/icons/custom.png'))
      .toHaveAttribute('data-allow-legacy-image-scheme', 'true');
  });
});
