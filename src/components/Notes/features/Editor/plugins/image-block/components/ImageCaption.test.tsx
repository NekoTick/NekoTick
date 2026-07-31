import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ImageCaption } from './ImageCaption';

vi.mock('@/lib/i18n', () => ({
    useI18n: () => ({ t: (key: string) => key }),
}));

describe('ImageCaption', () => {
    it('keeps the displayed caption out of editor text selections', () => {
        render(
            <ImageCaption
                originalAlt="Caption"
                value="Caption"
                isEditing={false}
                isVisible
                onChange={() => {}}
                onSubmit={() => {}}
                onCancel={() => {}}
                onEditStart={() => {}}
            />,
        );

        expect(screen.getByRole('button').closest('.image-caption-toolbar')).toHaveClass('select-none');
    });

    it('keeps caption editing active when the application window loses focus', async () => {
        const onSubmit = vi.fn();
        const hasFocus = vi.spyOn(document, 'hasFocus').mockReturnValue(true);

        render(
            <ImageCaption
                originalAlt="Caption"
                value="Draft caption"
                isEditing
                isVisible
                onChange={() => {}}
                onSubmit={onSubmit}
                onCancel={() => {}}
                onEditStart={() => {}}
            />,
        );

        const input = screen.getByRole('textbox');
        await waitFor(() => expect(input).toHaveFocus());

        hasFocus.mockReturnValue(false);
        fireEvent.blur(input);

        expect(onSubmit).not.toHaveBeenCalled();

        hasFocus.mockReturnValue(true);
        fireEvent.focus(window);

        expect(input).toHaveFocus();
    });

    it('does not turn image clipboard companion text into a caption', () => {
        const onChange = vi.fn();
        render(
            <ImageCaption
                originalAlt="Caption"
                value="Caption"
                isEditing
                isVisible
                onChange={onChange}
                onSubmit={() => {}}
                onCancel={() => {}}
                onEditStart={() => {}}
            />,
        );
        const input = screen.getByRole('textbox');
        const file = new File(['image'], 'caption.png', { type: 'image/png' });

        expect(fireEvent.paste(input, {
            clipboardData: {
                items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }],
                files: [file],
                getData: () => 'https://example.test/companion',
            },
        })).toBe(false);
        expect(fireEvent.paste(input, {
            clipboardData: {
                items: [],
                files: [],
                getData: () => 'ordinary caption',
            },
        })).toBe(true);
        expect(onChange).not.toHaveBeenCalled();
    });
});
