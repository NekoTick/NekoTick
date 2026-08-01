import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convertToBase64 } from '@/lib/storage/attachmentStorage';
import { MAX_CHAT_MESSAGE_IMAGE_SOURCES } from '@/components/Chat/common/messageClipboard';
import {
  dialogActionIconButtonClassName,
  dialogCloseIconButtonClassName,
} from '@/components/common/DialogCloseIconButton';
import {
  ChatImageViewer,
  RESOLVED_VIEWER_IMAGE_CACHE_CHAR_LIMIT,
} from './ChatImageViewer';

const svgMocks = vi.hoisted(() => ({
  rasterizeSvgDataUrlToPng: vi.fn(),
}));

const imageResolutionMocks = vi.hoisted(() => ({
  actualResolveSafeChatImageSource: null as null | ((src: string, id?: string) => Promise<string | null>),
  resolveSafeChatImageSource: vi.fn(),
}));
const imageActionMocks = vi.hoisted(() => ({
  copyImageSourceToClipboard: vi.fn(async () => true),
  downloadImageWithPrompt: vi.fn(async () => undefined),
}));
const TRANSPARENT_IMAGE_DATA_URL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

vi.mock('react-easy-crop', () => ({
  default: (props: { image?: string; setImageRef?: (ref: { current: HTMLImageElement | null }) => void }) => {
    const setImageNode = (node: HTMLImageElement | null) => {
      if (!node) {
        return;
      }
      Object.defineProperty(node, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          x: 300,
          y: 200,
          left: 300,
          top: 200,
          right: 500,
          bottom: 400,
          width: 200,
          height: 200,
          toJSON: () => ({}),
        }),
      });
      props.setImageRef?.({ current: node });
    };

    return (
      <>
        <img ref={setImageNode} alt="" data-testid="mock-cropper-image" src={props.image} />
        <div
          data-testid="mock-cropper"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        />
      </>
    );
  },
}));

vi.mock('@/lib/storage/attachmentStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/storage/attachmentStorage')>();
  return {
    ...actual,
    convertToBase64: vi.fn(),
  };
});

vi.mock('@/components/Chat/common/svgRasterize', () => ({
  isSvgDataUrl: (value: string) => value.trim().toLowerCase().startsWith('data:image/svg+xml'),
  rasterizeSvgDataUrlToPng: svgMocks.rasterizeSvgDataUrlToPng,
}));

vi.mock('@/components/Chat/common/messageClipboard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/Chat/common/messageClipboard')>();
  return {
    ...actual,
    copyImageSourceToClipboard: imageActionMocks.copyImageSourceToClipboard,
  };
});

vi.mock('@/components/Chat/common/imageDownload', () => ({
  downloadImageWithPrompt: imageActionMocks.downloadImageWithPrompt,
}));

vi.mock('@/components/Chat/common/chatImageSourceResolution', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/Chat/common/chatImageSourceResolution')>();
  imageResolutionMocks.actualResolveSafeChatImageSource = actual.resolveSafeChatImageSource;
  return {
    ...actual,
    resolveSafeChatImageSource: imageResolutionMocks.resolveSafeChatImageSource,
  };
});

describe('ChatImageViewer', () => {
  beforeEach(() => {
    vi.mocked(convertToBase64).mockReset();
    imageResolutionMocks.resolveSafeChatImageSource.mockReset();
    imageResolutionMocks.resolveSafeChatImageSource.mockImplementation((src: string, id?: string) => {
      if (!imageResolutionMocks.actualResolveSafeChatImageSource) {
        throw new Error('resolveSafeChatImageSource mock is not initialized');
      }
      return imageResolutionMocks.actualResolveSafeChatImageSource(src, id);
    });
    svgMocks.rasterizeSvgDataUrlToPng.mockReset();
    svgMocks.rasterizeSvgDataUrlToPng.mockResolvedValue('data:image/png;base64,RASTER');
    imageActionMocks.copyImageSourceToClipboard.mockClear();
    imageActionMocks.copyImageSourceToClipboard.mockResolvedValue(true);
    imageActionMocks.downloadImageWithPrompt.mockClear();
    imageActionMocks.downloadImageWithPrompt.mockResolvedValue(undefined);
  });

  it('closes when the blank area is pressed even if the cropper stops bubbling events', async () => {
    const onOpenChange = vi.fn();

    render(
      <ChatImageViewer
        open
        src="https://example.com/image.png"
        alt="preview"
        onOpenChange={onOpenChange}
      />,
    );

    const cropper = await screen.findByTestId('mock-cropper');
    fireEvent.pointerDown(cropper, { button: 0, clientX: 10, clientY: 10 });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the viewer open when the image area is pressed', async () => {
    const onOpenChange = vi.fn();

    render(
      <ChatImageViewer
        open
        src="https://example.com/image.png"
        alt="preview"
        onOpenChange={onOpenChange}
      />,
    );

    const image = await screen.findByTestId('mock-cropper-image');
    fireEvent.pointerDown(image, { button: 0, clientX: 350, clientY: 250 });

    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('uses the shared dialog close button treatment for image viewer controls', async () => {
    render(
      <ChatImageViewer
        open
        src="https://example.com/image.png"
        alt="preview"
        onOpenChange={() => {}}
      />,
    );

    const closeButton = await screen.findByRole('button', { name: 'Close preview' });

    expect(closeButton).toHaveClass('top-[var(--vlaina-size-72px)]');
    expect(closeButton).toHaveClass(
      'bg-transparent',
      'hover:bg-transparent',
      'hover:text-[var(--vlaina-accent)]',
    );
    expect(closeButton.querySelector('svg')).toHaveStyle({ width: '24px', height: '24px' });
    for (const className of dialogCloseIconButtonClassName.split(' ')) {
      expect(closeButton).toHaveClass(className);
    }
    for (const buttonName of ['Zoom out', 'Zoom in', 'Copy image', 'Download image']) {
      const button = screen.getByRole('button', { name: buttonName });
      for (const className of dialogActionIconButtonClassName.split(' ')) {
        expect(button).toHaveClass(className);
      }
    }
  });

  it('does not rebind the document blank-area listener when zoom changes', async () => {
    const addEventListenerSpy = vi.spyOn(document, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(document, 'removeEventListener');

    render(
      <ChatImageViewer
        open
        src="https://example.com/image.png"
        alt="preview"
        onOpenChange={() => {}}
      />,
    );

    await screen.findByRole('button', { name: 'Zoom in' });
    addEventListenerSpy.mockClear();
    removeEventListenerSpy.mockClear();

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));

    expect(removeEventListenerSpy).not.toHaveBeenCalledWith('pointerdown', expect.any(Function), true);
    expect(addEventListenerSpy).not.toHaveBeenCalledWith('pointerdown', expect.any(Function), true);

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it('resolves stored attachment sources before rendering the cropper image', async () => {
    vi.mocked(convertToBase64).mockResolvedValue('data:image/jpeg;base64,VIEWER');
    const onOpenChange = vi.fn();

    render(
      <ChatImageViewer
        open
        src="attachment://demo.jpg"
        alt="preview"
        onOpenChange={onOpenChange}
      />,
    );

    const image = await screen.findByTestId('mock-cropper-image');
    await waitFor(() => {
      expect(image).toHaveAttribute('src', 'data:image/jpeg;base64,VIEWER');
    });
    expect(convertToBase64).toHaveBeenCalledWith(expect.objectContaining({
      previewUrl: 'attachment://demo.jpg',
      assetUrl: 'attachment://demo.jpg',
      name: 'demo.jpg',
      type: 'image/jpeg',
    }));
  });

  it('rasterizes stored SVG attachments before rendering the cropper image', async () => {
    vi.mocked(convertToBase64).mockResolvedValue('data:image/svg+xml;base64,PHN2Zz4=');
    const onOpenChange = vi.fn();

    render(
      <ChatImageViewer
        open
        src="attachment://diagram.svg"
        alt="preview"
        onOpenChange={onOpenChange}
      />,
    );

    const image = await screen.findByTestId('mock-cropper-image');
    await waitFor(() => {
      expect(image).toHaveAttribute('src', 'data:image/png;base64,RASTER');
    });
    expect(svgMocks.rasterizeSvgDataUrlToPng).toHaveBeenCalledWith('data:image/svg+xml;base64,PHN2Zz4=');
  });

  it('does not pass unsafe direct sources to the cropper image', async () => {
    const onOpenChange = vi.fn();

    render(
      <ChatImageViewer
        open
        src="javascript:alert(1)"
        alt="preview"
        onOpenChange={onOpenChange}
      />,
    );

    const image = await screen.findByTestId('mock-cropper-image');
    expect(image).toHaveAttribute(
      'src',
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
    );
  });

  it('does not pass inline SVG data directly to the cropper image while rasterizing', async () => {
    const onOpenChange = vi.fn();
    const svgSrc = 'data:image/svg+xml;base64,PHN2Zz4=';
    svgMocks.rasterizeSvgDataUrlToPng.mockReturnValueOnce(new Promise(() => {}));

    render(
      <ChatImageViewer
        open
        src={svgSrc}
        alt="preview"
        onOpenChange={onOpenChange}
      />,
    );

    const image = await screen.findByTestId('mock-cropper-image');
    expect(image).toHaveAttribute('src', TRANSPARENT_IMAGE_DATA_URL);
    expect(image).not.toHaveAttribute('src', svgSrc);
    await waitFor(() => {
      expect(svgMocks.rasterizeSvgDataUrlToPng).toHaveBeenCalledWith(svgSrc);
    });
  });

  it('does not pass relative directory image sources to the cropper image', async () => {
    const onOpenChange = vi.fn();

    render(
      <ChatImageViewer
        open
        src="images/demo.png"
        alt="preview"
        onOpenChange={onOpenChange}
      />,
    );

    const image = await screen.findByTestId('mock-cropper-image');
    await waitFor(() => {
      expect(imageResolutionMocks.resolveSafeChatImageSource).toHaveBeenCalledTimes(1);
    });
    expect(image).toHaveAttribute(
      'src',
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
    );
    expect(image).not.toHaveAttribute('src', 'images/demo.png');
  });

  it('does not pass bare image filenames to the cropper image', async () => {
    const onOpenChange = vi.fn();

    render(
      <ChatImageViewer
        open
        src="demo.png"
        alt="preview"
        onOpenChange={onOpenChange}
      />,
    );

    const image = await screen.findByTestId('mock-cropper-image');
    await waitFor(() => {
      expect(imageResolutionMocks.resolveSafeChatImageSource).toHaveBeenCalledTimes(1);
    });
    expect(image).toHaveAttribute(
      'src',
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
    );
    expect(image).not.toHaveAttribute('src', 'demo.png');
    expect(convertToBase64).not.toHaveBeenCalled();
  });

  it('uses the original image source for viewer copy and download while showing a preview source', async () => {
    const onOpenChange = vi.fn();
    const originalSrc = 'https://example.com/cover.jpg#w=72%25';

    render(
      <ChatImageViewer
        open
        src={originalSrc}
        alt="cover"
        previewSrc="blob:cached-preview"
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Copy image' }));
    await waitFor(() => {
      expect(imageActionMocks.copyImageSourceToClipboard).toHaveBeenCalledWith(originalSrc);
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Download image' }));
    expect(imageActionMocks.downloadImageWithPrompt).toHaveBeenCalledWith(originalSrc, 'cover');
  });

  it('uses a custom image copy handler when provided', async () => {
    const onOpenChange = vi.fn();
    const onCopyImage = vi.fn(async () => true);

    render(
      <ChatImageViewer
        open
        src="blob:notes-preview"
        alt="cover"
        onCopyImage={onCopyImage}
        onOpenChange={onOpenChange}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Copy image' }));

    await waitFor(() => {
      expect(onCopyImage).toHaveBeenCalledWith('blob:notes-preview');
    });
    expect(imageActionMocks.copyImageSourceToClipboard).not.toHaveBeenCalled();
  });

  it('still matches short decoded gallery image sources', async () => {
    const onOpenChange = vi.fn();

    render(
      <ChatImageViewer
        open
        src="https://example.com/demo%20image.png"
        alt="preview"
        gallery={[
          { id: 'current', src: 'https://example.com/demo image.png' },
          { id: 'next', src: 'https://example.com/next.png' },
        ]}
        onOpenChange={onOpenChange}
      />,
    );

    await screen.findByRole('dialog', { name: 'preview' });
    expect(await screen.findByRole('button', { name: 'Next image' })).toBeInTheDocument();
  });

  it('does not decode oversized gallery image sources for comparison', async () => {
    const onOpenChange = vi.fn();
    const encodedTail = `${'a'.repeat(4100)}%20image.png`;

    render(
      <ChatImageViewer
        open
        src={`https://example.com/${encodedTail}`}
        alt="preview"
        gallery={[
          { id: 'current', src: `https://example.com/${encodedTail.replace('%20', ' ')}` },
          { id: 'next', src: 'https://example.com/next.png' },
        ]}
        onOpenChange={onOpenChange}
      />,
    );

    await screen.findByRole('dialog', { name: 'preview' });
    expect(screen.queryByRole('button', { name: 'Next image' })).not.toBeInTheDocument();
  });

  it('does not inspect gallery sources while the viewer is closed', () => {
    const decodeURIComponentSpy = vi.spyOn(window, 'decodeURIComponent');

    render(
      <ChatImageViewer
        open={false}
        src="https://example.com/demo%20image.png"
        alt="preview"
        gallery={[
          { id: 'current', src: 'https://example.com/demo image.png' },
          { id: 'next', src: 'https://example.com/next.png' },
        ]}
        onOpenChange={() => {}}
      />,
    );

    expect(decodeURIComponentSpy).not.toHaveBeenCalled();
    decodeURIComponentSpy.mockRestore();
  });

  it('does not navigate to gallery entries beyond the message image bound', async () => {
    const gallery = Array.from(
      { length: MAX_CHAT_MESSAGE_IMAGE_SOURCES + 1 },
      (_, index) => ({
        id: `image-${index}`,
        src: `https://example.com/${index}.png`,
      }),
    );

    render(
      <ChatImageViewer
        open
        src={`https://example.com/${MAX_CHAT_MESSAGE_IMAGE_SOURCES}.png`}
        alt="preview"
        currentImageId={`image-${MAX_CHAT_MESSAGE_IMAGE_SOURCES}`}
        gallery={gallery}
        onOpenChange={() => {}}
      />,
    );

    await screen.findByRole('dialog', { name: 'preview' });
    expect(screen.queryByRole('button', { name: 'Previous image' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Next image' })).not.toBeInTheDocument();
  });

  it('does not keep direct data image sources in the resolved attachment cache', async () => {
    const onOpenChange = vi.fn();
    const src = 'data:image/png;base64,AAAA';
    const view = render(
      <ChatImageViewer
        open
        src={src}
        alt="preview"
        onOpenChange={onOpenChange}
      />,
    );

    await waitFor(() => {
      expect(imageResolutionMocks.resolveSafeChatImageSource).toHaveBeenCalledTimes(1);
    });

    view.rerender(
      <ChatImageViewer
        open={false}
        src={src}
        alt="preview"
        onOpenChange={onOpenChange}
      />,
    );
    view.rerender(
      <ChatImageViewer
        open
        src={src}
        alt="preview"
        onOpenChange={onOpenChange}
      />,
    );

    await waitFor(() => {
      expect(imageResolutionMocks.resolveSafeChatImageSource).toHaveBeenCalledTimes(2);
    });
  });

  it('keeps stored attachment resolutions cached across reopen', async () => {
    vi.mocked(convertToBase64).mockResolvedValue('data:image/jpeg;base64,CACHED');
    const onOpenChange = vi.fn();
    const view = render(
      <ChatImageViewer
        open
        src="attachment://cache-demo.jpg"
        alt="preview"
        onOpenChange={onOpenChange}
      />,
    );

    await waitFor(() => {
      expect(imageResolutionMocks.resolveSafeChatImageSource).toHaveBeenCalledTimes(1);
    });

    view.rerender(
      <ChatImageViewer
        open={false}
        src="attachment://cache-demo.jpg"
        alt="preview"
        onOpenChange={onOpenChange}
      />,
    );
    view.rerender(
      <ChatImageViewer
        open
        src="attachment://cache-demo.jpg"
        alt="preview"
        onOpenChange={onOpenChange}
      />,
    );

    await waitFor(() => {
      expect(imageResolutionMocks.resolveSafeChatImageSource).toHaveBeenCalledTimes(1);
    });
    expect(convertToBase64).toHaveBeenCalledTimes(1);
  });

  it('does not keep oversized stored attachment resolutions cached across reopen', async () => {
    const oversizedDataUrl = `data:image/jpeg;base64,${'A'.repeat(RESOLVED_VIEWER_IMAGE_CACHE_CHAR_LIMIT + 1)}`;
    vi.mocked(convertToBase64).mockResolvedValue(oversizedDataUrl);
    const onOpenChange = vi.fn();
    const view = render(
      <ChatImageViewer
        open
        src="attachment://oversized-cache-demo.jpg"
        alt="preview"
        onOpenChange={onOpenChange}
      />,
    );

    await waitFor(() => {
      expect(convertToBase64).toHaveBeenCalledTimes(1);
    });

    view.rerender(
      <ChatImageViewer
        open={false}
        src="attachment://oversized-cache-demo.jpg"
        alt="preview"
        onOpenChange={onOpenChange}
      />,
    );
    view.rerender(
      <ChatImageViewer
        open
        src="attachment://oversized-cache-demo.jpg"
        alt="preview"
        onOpenChange={onOpenChange}
      />,
    );

    await waitFor(() => {
      expect(convertToBase64).toHaveBeenCalledTimes(2);
    });
  });

  it('does not subscribe to viewport resize while closed', () => {
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    const view = render(
      <ChatImageViewer
        open={false}
        src="https://example.com/image.png"
        alt="preview"
        onOpenChange={() => {}}
      />,
    );

    expect(addEventListenerSpy).not.toHaveBeenCalledWith('resize', expect.any(Function));

    view.rerender(
      <ChatImageViewer
        open
        src="https://example.com/image.png"
        alt="preview"
        onOpenChange={() => {}}
      />,
    );

    expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    view.unmount();
    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it('warms adjacent stored attachment images while the gallery viewer is open', async () => {
    vi.mocked(convertToBase64).mockImplementation(async (attachment) =>
      `data:${attachment.type};base64,${attachment.name}`,
    );

    render(
      <ChatImageViewer
        open
        src="attachment://current.jpg"
        alt="preview"
        currentImageId="current"
        gallery={[
          { id: 'previous', src: 'attachment://previous.jpg' },
          { id: 'current', src: 'attachment://current.jpg' },
          { id: 'next', src: 'attachment://next.jpg' },
        ]}
        onOpenChange={() => {}}
      />,
    );

    await waitFor(() => {
      expect(imageResolutionMocks.resolveSafeChatImageSource).toHaveBeenCalledTimes(3);
    });
    expect(imageResolutionMocks.resolveSafeChatImageSource).toHaveBeenCalledWith('attachment://current.jpg', 'viewer-image');
    expect(imageResolutionMocks.resolveSafeChatImageSource).toHaveBeenCalledWith('attachment://previous.jpg', 'viewer-image');
    expect(imageResolutionMocks.resolveSafeChatImageSource).toHaveBeenCalledWith('attachment://next.jpg', 'viewer-image');
  });
});
