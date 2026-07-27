import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LinkEditor } from './LinkEditor';
import { themeUiFeedbackTokens } from '@/styles/themeTokens';

vi.mock('@/lib/i18n', () => ({
    useI18n: () => ({
        t: () => 'URL...',
    }),
}));

const defaultProps = {
    editUrl: '',
    setEditUrl: vi.fn(),
    editText: '',
    setEditText: vi.fn(),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    isNewLink: true,
    autoFocus: true,
    initialText: 'Link target',
    invalidUrlAttempt: 0,
};

describe('LinkEditor', () => {
    afterEach(() => {
        document.body.replaceChildren();
        vi.clearAllMocks();
        vi.useRealTimers();
    });

    it('focuses the URL textarea as soon as an autofocus editor is mounted', () => {
        render(<LinkEditor {...defaultProps} />);

        expect(screen.getByPlaceholderText('URL...')).toBe(document.activeElement);
    });

    it('does not steal focus for a new link when autofocus is disabled', () => {
        const button = document.createElement('button');
        document.body.append(button);
        button.focus();

        render(<LinkEditor {...defaultProps} autoFocus={false} />);

        expect(document.activeElement).toBe(button);
    });

    it('submits the editor when the check button is clicked', () => {
        const onSave = vi.fn();

        render(
            <LinkEditor
                {...defaultProps}
                editUrl="https://example.com/docs"
                onSave={onSave}
            />
        );

        const button = screen.getByRole('button');
        fireEvent.mouseDown(button);
        fireEvent.click(button);

        expect(onSave).toHaveBeenCalledWith(true);
    });

    it('does not submit from the check button while IME composition is active', () => {
        const onSave = vi.fn();
        const onCompositionChange = vi.fn();

        render(
            <LinkEditor
                {...defaultProps}
                editUrl="nihao"
                onSave={onSave}
                onCompositionChange={onCompositionChange}
            />
        );

        const input = screen.getByPlaceholderText('URL...');
        const button = screen.getByRole('button');

        fireEvent.compositionStart(input);
        fireEvent.click(button);

        expect(onSave).not.toHaveBeenCalled();
        expect(onCompositionChange).toHaveBeenCalledWith(true);

        fireEvent.compositionEnd(input);
        fireEvent.click(button);

        expect(onSave).toHaveBeenCalledWith(true);
        expect(onCompositionChange).toHaveBeenCalledWith(false);
    });

    it('keeps focus in the URL textarea and shows validation feedback after an invalid save attempt', () => {
        vi.useFakeTimers();
        const { rerender } = render(
            <LinkEditor
                {...defaultProps}
                editUrl="me"
                invalidUrlAttempt={0}
            />
        );

        const input = screen.getByPlaceholderText('URL...');
        rerender(
            <LinkEditor
                {...defaultProps}
                editUrl="me"
                invalidUrlAttempt={1}
            />
        );

        expect(input).toBe(document.activeElement);
        expect(input).toHaveClass('error-shake');
        expect(input).toHaveAttribute('aria-invalid', 'true');

        act(() => {
            vi.advanceTimersByTime(themeUiFeedbackTokens.urlRailValidationErrorDurationMs);
        });

        expect(input).not.toHaveClass('error-shake');
        expect(input).not.toHaveAttribute('aria-invalid');
    });

    it('does not turn image-only HTML companion text into a link URL', () => {
        const setEditUrl = vi.fn();
        render(<LinkEditor {...defaultProps} editUrl="https://example.test/original" setEditUrl={setEditUrl} />);
        const input = screen.getByPlaceholderText('URL...');

        expect(fireEvent.paste(input, {
            clipboardData: {
                items: [],
                files: [],
                getData: (type: string) => type === 'text/html'
                    ? '<a href="https://example.test/companion"><img src="https://images.example.test/link.png"></a>'
                    : 'https://example.test/companion',
            },
        })).toBe(false);
        expect(fireEvent.paste(input, {
            clipboardData: {
                items: [],
                files: [],
                getData: () => 'https://example.test/ordinary',
            },
        })).toBe(true);
        expect(setEditUrl).not.toHaveBeenCalled();
    });
});
