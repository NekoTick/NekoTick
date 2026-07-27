import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalImage, MAX_CONCURRENT_LOCAL_IMAGE_ATTACHMENT_READS } from './LocalImage';

const MAX_ATTACHMENT_IMAGE_BYTES = 10 * 1024 * 1024;

const mocks = vi.hoisted(() => ({
  getBasePath: vi.fn().mockResolvedValue('/appdata'),
  joinPath: vi.fn(),
  rasterizeSvgDataUrlToPng: vi.fn(),
  readBinaryFile: vi.fn(),
  stat: vi.fn(),
}));

vi.mock('@/lib/storage/adapter', () => ({
  getStorageAdapter: () => ({
    getBasePath: mocks.getBasePath,
    readBinaryFile: mocks.readBinaryFile,
    stat: mocks.stat,
  }),
  joinPath: mocks.joinPath,
}));

vi.mock('./svgRasterize', () => ({
  isSvgDataUrl: (value: string) => value.trim().toLowerCase().startsWith('data:image/svg+xml'),
  rasterizeSvgDataUrlToPng: mocks.rasterizeSvgDataUrlToPng,
}));

describe('LocalImage', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    mocks.getBasePath.mockClear();
    mocks.joinPath.mockReset();
    mocks.joinPath.mockImplementation(async (...segments: string[]) => segments.join('/'));
    mocks.rasterizeSvgDataUrlToPng.mockReset();
    mocks.rasterizeSvgDataUrlToPng.mockResolvedValue('data:image/png;base64,RASTER');
    mocks.readBinaryFile.mockReset();
    mocks.readBinaryFile.mockResolvedValue(new Uint8Array([60, 115, 118, 103, 62]));
    mocks.stat.mockReset();
    mocks.stat.mockResolvedValue({
      name: 'diagram.svg',
      path: '/appdata/.vlaina/chat/attachments/diagram.svg',
      isDirectory: false,
      isFile: true,
      size: 5,
    });
  });

  it('rasterizes inline SVG data before rendering', async () => {
    render(<LocalImage src="data:image/svg+xml;base64,PHN2Zz4=" alt="diagram" />);

    const image = await screen.findByAltText('diagram');
    expect(image).toHaveAttribute('src', 'data:image/png;base64,RASTER');
    expect(mocks.rasterizeSvgDataUrlToPng).toHaveBeenCalledWith('data:image/svg+xml;base64,PHN2Zz4=');
  });

  it('uses native button semantics only when the rendered image is interactive', async () => {
    const onClick = vi.fn();
    const view = render(
      <LocalImage
        src="data:image/png;base64,AQI="
        alt="Open diagram"
        onClick={onClick}
      />,
    );

    const button = await screen.findByRole('button', { name: 'Open diagram' });
    const image = screen.getByAltText('Open diagram');
    expect(image).toBe(button.firstElementChild);
    fireEvent.click(image);
    expect(onClick).toHaveBeenCalledTimes(1);

    view.rerender(<LocalImage src="data:image/png;base64,AQI=" alt="Static diagram" />);
    expect(await screen.findByAltText('Static diagram')).not.toHaveRole('button');
    expect(screen.queryByRole('button', { name: 'Static diagram' })).not.toBeInTheDocument();
  });

  it('rasterizes stored SVG attachments before rendering', async () => {
    render(<LocalImage src="attachment://diagram.svg" alt="diagram" />);

    const image = await screen.findByAltText('diagram');
    expect(mocks.joinPath).toHaveBeenCalledWith('/appdata', '.vlaina', 'chat', 'attachments', 'diagram.svg');
    expect(mocks.rasterizeSvgDataUrlToPng).toHaveBeenCalledWith('data:image/svg+xml;base64,PHN2Zz4=');
    expect(image).toHaveAttribute('src', 'data:image/png;base64,RASTER');
  });

  it('blocks relative image paths with directories instead of browser-loading them', async () => {
    render(<LocalImage src="images/demo.png" alt="relative" />);

    await waitFor(() => {
      expect(screen.getByText('Image unavailable')).toBeInTheDocument();
    });
    expect(screen.queryByAltText('relative')).not.toBeInTheDocument();
    expect(mocks.getBasePath).not.toHaveBeenCalled();
    expect(mocks.readBinaryFile).not.toHaveBeenCalled();
  });

  it('loads public remote images only after explicit user action', async () => {
    render(<LocalImage src="HTTPS://example.com/demo.png" alt="remote" />);

    expect(screen.queryByAltText('remote')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Load remote content' }));

    const image = await screen.findByAltText('remote');
    expect(image).toHaveAttribute('src', 'HTTPS://example.com/demo.png');
    expect(image).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(mocks.getBasePath).not.toHaveBeenCalled();
    expect(mocks.readBinaryFile).not.toHaveBeenCalled();
  });

  it('normalizes case-insensitive inline raster data before rendering', async () => {
    render(<LocalImage src="DATA:IMAGE/WEBP;BASE64,AQI=" alt="inline" />);

    const image = await screen.findByAltText('inline');
    expect(image).toHaveAttribute('src', 'data:image/webp;base64,AQI=');
    expect(mocks.getBasePath).not.toHaveBeenCalled();
    expect(mocks.readBinaryFile).not.toHaveBeenCalled();
  });

  it('blocks local-network remote image sources at the component boundary', async () => {
    render(<LocalImage src="http://127.0.0.1:3000/secret.png" alt="local" />);

    await waitFor(() => {
      expect(screen.getByText('Image unavailable')).toBeInTheDocument();
    });
    expect(screen.queryByAltText('local')).not.toBeInTheDocument();
    expect(mocks.getBasePath).not.toHaveBeenCalled();
    expect(mocks.readBinaryFile).not.toHaveBeenCalled();
  });

  it('blocks unsupported inline data image sources at the component boundary', async () => {
    render(<LocalImage src="data:text/html;base64,PHNjcmlwdD4=" alt="html" />);

    await waitFor(() => {
      expect(screen.getByText('Image unavailable')).toBeInTheDocument();
    });
    expect(screen.queryByAltText('html')).not.toBeInTheDocument();
    expect(mocks.getBasePath).not.toHaveBeenCalled();
    expect(mocks.readBinaryFile).not.toHaveBeenCalled();
  });

  it('does not map bare image filenames to stored attachments', async () => {
    render(<LocalImage src="demo.png" alt="attachment" />);

    await waitFor(() => {
      expect(screen.getByText('Image unavailable')).toBeInTheDocument();
    });
    expect(screen.queryByAltText('attachment')).not.toBeInTheDocument();
    expect(mocks.joinPath).not.toHaveBeenCalledWith('/appdata', '.vlaina', 'chat', 'attachments', 'demo.png');
    expect(mocks.readBinaryFile).not.toHaveBeenCalled();
  });

  it('rejects non-image stored attachment filenames before reading storage', async () => {
    render(<LocalImage src="attachment://secret.txt" alt="secret" />);

    await waitFor(() => {
      expect(screen.getByText('Image unavailable')).toBeInTheDocument();
    });
    expect(screen.queryByAltText('secret')).not.toBeInTheDocument();
    expect(mocks.getBasePath).not.toHaveBeenCalled();
    expect(mocks.readBinaryFile).not.toHaveBeenCalled();
  });

  it('shows unavailable state for oversized stored attachments before reading them', async () => {
    mocks.stat.mockResolvedValueOnce({ size: 10 * 1024 * 1024 + 1 });

    render(<LocalImage src="attachment://huge.png" alt="huge" />);

    await waitFor(() => {
      expect(screen.getByText('Image unavailable')).toBeInTheDocument();
    });
    expect(mocks.stat).toHaveBeenCalledWith('/appdata/.vlaina/chat/attachments/huge.png');
    expect(mocks.readBinaryFile).not.toHaveBeenCalled();
    expect(screen.queryByAltText('huge')).not.toBeInTheDocument();
  });

  it('shows unavailable state for stored attachments with invalid known stat sizes before reading them', async () => {
    mocks.stat.mockResolvedValueOnce({ size: -1 });

    render(<LocalImage src="attachment://invalid.png" alt="invalid" />);

    await waitFor(() => {
      expect(screen.getByText('Image unavailable')).toBeInTheDocument();
    });
    expect(mocks.stat).toHaveBeenCalledWith('/appdata/.vlaina/chat/attachments/invalid.png');
    expect(mocks.readBinaryFile).not.toHaveBeenCalled();
    expect(screen.queryByAltText('invalid')).not.toBeInTheDocument();
  });

  it('reads stored attachments when stat has no size but bounded read succeeds', async () => {
    mocks.stat.mockResolvedValueOnce(null);

    render(<LocalImage src="attachment://missing-size.png" alt="missing" />);

    const image = await screen.findByAltText('missing');
    expect(mocks.stat).toHaveBeenCalledWith('/appdata/.vlaina/chat/attachments/missing-size.png');
    expect(mocks.readBinaryFile).toHaveBeenCalledWith(
      '/appdata/.vlaina/chat/attachments/missing-size.png',
      MAX_ATTACHMENT_IMAGE_BYTES,
    );
    expect(image).toHaveAttribute('src', 'data:image/png;base64,PHN2Zz4=');
  });

  it('shows unavailable state when SVG rasterization fails', async () => {
    mocks.rasterizeSvgDataUrlToPng.mockResolvedValueOnce(null);

    render(<LocalImage src="data:image/svg+xml;base64,PHN2Zz4=" alt="diagram" />);

    await waitFor(() => {
      expect(screen.getByText('Image unavailable')).toBeInTheDocument();
    });
    expect(screen.queryByAltText('diagram')).not.toBeInTheDocument();
  });

  it('shows unavailable state when inline SVG rasterization rejects', async () => {
    mocks.rasterizeSvgDataUrlToPng.mockRejectedValueOnce(new Error('raster failed'));

    render(<LocalImage src="data:image/svg+xml;base64,PHN2Zz4=" alt="diagram" />);

    await waitFor(() => {
      expect(screen.getByText('Image unavailable')).toBeInTheDocument();
    });
    expect(screen.queryByAltText('diagram')).not.toBeInTheDocument();
  });

  it('limits concurrent stored attachment reads and cancels queued reads after unmount', async () => {
    const pendingReads: Array<() => void> = [];
    mocks.readBinaryFile.mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        pendingReads.push(resolve);
      });
      return new Uint8Array([1, 2, 3]);
    });

    const renderedImages = Array.from(
      { length: MAX_CONCURRENT_LOCAL_IMAGE_ATTACHMENT_READS + 3 },
      (_, index) => render(
        <LocalImage
          src={`attachment://image-${index}.png`}
          alt={`image-${index}`}
        />,
      ),
    );

    await waitFor(() => {
      expect(mocks.readBinaryFile).toHaveBeenCalledTimes(MAX_CONCURRENT_LOCAL_IMAGE_ATTACHMENT_READS);
    });

    renderedImages.forEach((rendered) => rendered.unmount());
    await act(async () => {
      pendingReads.splice(0).forEach((resolve) => resolve());
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.readBinaryFile).toHaveBeenCalledTimes(MAX_CONCURRENT_LOCAL_IMAGE_ATTACHMENT_READS);
  });

  it('releases active read slots when stored attachment reads stall', async () => {
    vi.useFakeTimers();
    mocks.readBinaryFile.mockImplementation(() => new Promise(() => {}));

    Array.from({ length: MAX_CONCURRENT_LOCAL_IMAGE_ATTACHMENT_READS + 1 }, (_value, index) => render(
      <LocalImage src={`attachment://stalled-${index}.png`} alt={`stalled-${index}`} />,
    ));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.readBinaryFile).toHaveBeenCalledTimes(MAX_CONCURRENT_LOCAL_IMAGE_ATTACHMENT_READS);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
      await Promise.resolve();
    });

    expect(mocks.readBinaryFile).toHaveBeenCalledTimes(MAX_CONCURRENT_LOCAL_IMAGE_ATTACHMENT_READS + 1);
  });
});
