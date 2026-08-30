import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { writeTextToClipboard } from '@/lib/clipboard';
import { MAX_LINK_TOOLTIP_URL_CHARS, useLinkState } from './useLinkState';

vi.mock('@/lib/clipboard', () => ({
    writeTextToClipboard: vi.fn(),
}));

const writeTextToClipboardMock = vi.mocked(writeTextToClipboard);

describe('useLinkState', () => {
    beforeEach(() => {
        writeTextToClipboardMock.mockReset();
        writeTextToClipboardMock.mockResolvedValue(true);
    });

    it('copies autolink URLs without markdown-escaped scheme separators', async () => {
        const { result } = renderHook(() => useLinkState({
            href: 'http\\://example.test:8317',
            initialText: 'http\\://example.test:8317',
            onEdit: vi.fn(),
            onClose: vi.fn(),
        }));

        await act(async () => {
            result.current.handleCopy();
        });

        expect(writeTextToClipboardMock).toHaveBeenCalledWith('http://example.test:8317');
    });

    it('displays the complete normalized href', () => {
        const { result } = renderHook(() => useLinkState({
            href: 'https\\://www.example.com/docs/page?tab=api#section',
            initialText: 'Example',
            onEdit: vi.fn(),
            onClose: vi.fn(),
        }));

        expect(result.current.displayUrl).toBe('https://www.example.com/docs/page?tab=api#section');
    });

    it('keeps the user-facing bare domain text for autolinks', () => {
        const { result } = renderHook(() => useLinkState({
            href: 'https://cati.me',
            initialText: 'cati.me',
            onEdit: vi.fn(),
            onClose: vi.fn(),
        }));

        expect(result.current.isAutolink).toBe(true);
        expect(result.current.displayUrl).toBe('cati.me');
        expect(result.current.editUrl).toBe('cati.me');
    });

    it('does not classify a Markdown image link as an autolink', () => {
        const { result } = renderHook(() => useLinkState({
            href: 'https://example.test',
            initialText: '',
            isAutolink: false,
            onEdit: vi.fn(),
            onClose: vi.fn(),
        }));

        expect(result.current.isAutolink).toBe(false);
    });

    it('copies autolinks using the user-facing text', async () => {
        const { result } = renderHook(() => useLinkState({
            href: 'https://cati.me',
            initialText: 'cati.me',
            onEdit: vi.fn(),
            onClose: vi.fn(),
        }));

        await act(async () => {
            result.current.handleCopy();
        });

        expect(writeTextToClipboardMock).toHaveBeenCalledWith('cati.me');
    });

    it('copies markdown links as normalized hrefs', async () => {
        const { result } = renderHook(() => useLinkState({
            href: 'https\\://example.com',
            initialText: 'Example',
            onEdit: vi.fn(),
            onClose: vi.fn(),
        }));

        await act(async () => {
            result.current.handleCopy();
        });

        expect(writeTextToClipboardMock).toHaveBeenCalledWith('https://example.com');
    });

    it('copies mailto email links as plain email addresses', async () => {
        const { result } = renderHook(() => useLinkState({
            href: 'mailto:v.lad.el.a.ina@gmail.com',
            initialText: 'v.lad.el.a.ina@gmail.com',
            onEdit: vi.fn(),
            onClose: vi.fn(),
        }));

        await act(async () => {
            result.current.handleCopy();
        });

        expect(writeTextToClipboardMock).toHaveBeenCalledWith('v.lad.el.a.ina@gmail.com');
    });

    it('bounds edited tooltip URLs before saving', () => {
        const onEdit = vi.fn();
        const { result } = renderHook(() => useLinkState({
            href: '',
            initialText: '',
            onEdit,
            onClose: vi.fn(),
        }));
        const oversizedUrl = `https://example.com/${'a'.repeat(MAX_LINK_TOOLTIP_URL_CHARS)}`;

        act(() => {
            result.current.setEditUrl(oversizedUrl);
        });

        expect(result.current.editUrl).toHaveLength(MAX_LINK_TOOLTIP_URL_CHARS);

        act(() => {
            result.current.handleSaveEdit(true);
        });

        expect(onEdit).toHaveBeenCalledWith(
            result.current.editUrl,
            result.current.editUrl,
            true,
        );
    });

    it('saves safe non-URL href text instead of blocking it', () => {
        const onEdit = vi.fn();
        const { result } = renderHook(() => useLinkState({
            href: '',
            initialText: 'Link target',
            onEdit,
            onClose: vi.fn(),
        }));

        act(() => {
            result.current.setEditUrl('me');
        });

        let didSave = true;
        act(() => {
            didSave = result.current.handleSaveEdit(true);
        });

        expect(didSave).toBe(true);
        expect(onEdit).toHaveBeenCalledWith('Link target', 'me', true);
        expect(result.current.invalidUrlAttempt).toBe(0);
    });

    it('keeps an unsafe href in edit mode instead of saving silently', () => {
        const onEdit = vi.fn();
        const { result } = renderHook(() => useLinkState({
            href: '',
            initialText: 'Link target',
            onEdit,
            onClose: vi.fn(),
        }));

        act(() => {
            result.current.setEditUrl('javascript:alert(1)');
        });

        let didSave = true;
        act(() => {
            didSave = result.current.handleSaveEdit(true);
        });

        expect(didSave).toBe(false);
        expect(onEdit).not.toHaveBeenCalled();
        expect(result.current.invalidUrlAttempt).toBe(1);
        expect(result.current.mode).toBe('edit');
    });

    it('closes a canceled edit without writing the draft', () => {
        const onEdit = vi.fn();
        const onClose = vi.fn();
        const { result } = renderHook(() => useLinkState({
            href: 'https://example.test/original',
            initialText: 'Docs',
            onEdit,
            onClose,
        }));

        act(() => {
            result.current.setMode('edit');
            result.current.setEditUrl('https://example.test/draft');
        });
        act(() => {
            result.current.handleCancelEdit();
        });

        expect(onEdit).not.toHaveBeenCalled();
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(result.current.editUrl).toBe('https://example.test/original');
    });
});
