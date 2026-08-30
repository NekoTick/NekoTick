import { act, cleanup, render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LinkTooltip from './LinkTooltip';
import { renderExistingLinkTooltip, renderNewLinkTooltip } from './linkTooltipRender';

const linkEditorMockState = vi.hoisted(() => ({
    lastProps: null as { onCompositionChange?: (isComposing: boolean) => void } | null,
}));

vi.mock('./components/LinkEditor', () => ({
    LinkEditor: (props: { onCompositionChange?: (isComposing: boolean) => void }) => {
        linkEditorMockState.lastProps = props;
        return <div data-testid="link-editor" />;
    },
}));

vi.mock('./components/LinkViewer', () => ({
    LinkViewer: () => <div data-testid="link-viewer" />,
}));

function renderInTooltipContainer(props: Partial<ComponentProps<typeof LinkTooltip>> = {}) {
    const container = document.createElement('div');
    container.className = 'link-tooltip-container';
    document.body.append(container);

    const onEdit = vi.fn();
    const onClose = vi.fn();
    const onOpen = vi.fn();
    const onUnlink = vi.fn();
    const onRemove = vi.fn();

    render(
        <LinkTooltip
            href=""
            initialText="Link target"
            onEdit={onEdit}
            onClose={onClose}
            onOpen={onOpen}
            onUnlink={onUnlink}
            onRemove={onRemove}
            containerElement={container}
            {...props}
        />,
        { container }
    );

    return {
        container,
        onClose,
        onEdit,
    };
}

function dispatchStoppedEditorMouseDown() {
    const editorBlank = document.createElement('div');
    document.body.append(editorBlank);
    editorBlank.addEventListener('mousedown', (event) => {
        event.stopPropagation();
    });

    editorBlank.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
    }));
}

describe('LinkTooltip', () => {
    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
        linkEditorMockState.lastProps = null;
        document.body.replaceChildren();
    });

    it('handles an editing tooltip before an editor blank click can stop propagation', () => {
        const { onEdit, onClose } = renderInTooltipContainer();

        dispatchStoppedEditorMouseDown();

        expect(onEdit).toHaveBeenCalledWith('Link target', '', true);
        expect(onClose).not.toHaveBeenCalled();
    });

    it('closes a viewing tooltip before an editor blank click can stop propagation', () => {
        const { onClose, onEdit } = renderInTooltipContainer({
            href: 'https://example.com/docs',
            initialText: 'Docs',
        });

        dispatchStoppedEditorMouseDown();

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(onEdit).not.toHaveBeenCalled();
    });

    it('keeps a viewing tooltip open when pressing editor link text', () => {
        const editorElement = document.createElement('div');
        const link = document.createElement('a');
        link.href = 'https://example.com/docs';
        link.textContent = 'hi';
        editorElement.append(link);
        document.body.append(editorElement);
        const { onClose, onEdit } = renderInTooltipContainer({
            editorElement,
            href: 'https://example.com/docs',
            initialText: 'hi',
        });
        const linkText = link.firstChild;

        linkText?.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
        }));
        linkText?.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
        }));

        expect(onClose).not.toHaveBeenCalled();
        expect(onEdit).not.toHaveBeenCalled();
    });

    it('treats a non-element event target outside the tooltip as an outside click', () => {
        const { onEdit } = renderInTooltipContainer();
        const textNode = document.createTextNode('outside text');
        document.body.append(textNode);

        textNode.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
        }));

        expect(onEdit).toHaveBeenCalledWith('Link target', '', true);
    });

    it('handles pointerdown outside before editor mousedown handlers can intercept the click', () => {
        const { onEdit } = renderInTooltipContainer();
        const editorBlank = document.createElement('div');
        document.body.append(editorBlank);

        editorBlank.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
        }));
        editorBlank.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
        }));

        expect(onEdit).toHaveBeenCalledTimes(1);
        expect(onEdit).toHaveBeenCalledWith('Link target', '', true);
    });

    it('ignores outside pointer events after the tooltip is hidden', () => {
        const { container, onClose, onEdit } = renderInTooltipContainer();
        const editorBlank = document.createElement('div');
        document.body.append(editorBlank);
        container.classList.add('hidden');

        editorBlank.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
        }));
        editorBlank.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
        }));

        expect(onEdit).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });

    it('replaces a previous tooltip session before making a reopened tooltip interactive', () => {
        vi.spyOn(Date, 'now').mockReturnValue(1);
        const container = document.createElement('div');
        container.className = 'link-tooltip-container hidden';
        const editorElement = document.createElement('div');
        const link = document.createElement('a');
        link.href = 'https://example.test/old';
        link.textContent = 'Old';
        editorElement.append(link);
        document.body.append(container, editorElement);
        const root = createRoot(container);
        const previousOnEdit = vi.fn();
        const nextOnEdit = vi.fn();

        act(() => {
            renderExistingLinkTooltip({
                root,
                view: { dom: editorElement } as never,
                containerElement: container,
                link,
                href: link.href,
                onEdit: previousOnEdit,
                onUnlink: vi.fn(),
                onRemove: vi.fn(),
                onClose: vi.fn(),
            });
        });
        expect(container.querySelector('[data-testid="link-viewer"]')).not.toBeNull();

        container.classList.add('hidden');
        act(() => {
            renderNewLinkTooltip({
                root,
                containerElement: container,
                selectedText: 'Next',
                autoFocus: false,
                onEdit: nextOnEdit,
                onRemove: vi.fn(),
                onClose: vi.fn(),
            });
        });
        container.classList.remove('hidden');

        expect(container.querySelector('[data-testid="link-editor"]')).not.toBeNull();
        act(() => {
            editorElement.dispatchEvent(new PointerEvent('pointerdown', {
                bubbles: true,
                cancelable: true,
            }));
            editorElement.dispatchEvent(new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
            }));
        });

        expect(previousOnEdit).not.toHaveBeenCalled();
        expect(nextOnEdit).toHaveBeenCalledTimes(1);
        expect(nextOnEdit).toHaveBeenCalledWith('Next', '', true);

        act(() => root.unmount());
    });

    it('does not save the editing tooltip from an outside click while IME composition is active', () => {
        const { onEdit } = renderInTooltipContainer();
        const editorBlank = document.createElement('div');
        document.body.append(editorBlank);

        act(() => {
            linkEditorMockState.lastProps?.onCompositionChange?.(true);
        });

        editorBlank.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
        }));

        expect(onEdit).not.toHaveBeenCalled();

        act(() => {
            linkEditorMockState.lastProps?.onCompositionChange?.(false);
        });

        editorBlank.dispatchEvent(new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
        }));

        expect(onEdit).toHaveBeenCalledWith('Link target', '', true);
    });

    it('uses its own tooltip container when another tooltip container is still in the document', () => {
        const staleContainer = document.createElement('div');
        staleContainer.className = 'link-tooltip-container';
        const staleBlank = document.createElement('div');
        staleContainer.append(staleBlank);
        document.body.append(staleContainer);

        const { container, onEdit } = renderInTooltipContainer();

        expect(staleContainer.hasAttribute('data-editing')).toBe(false);
        expect(container.getAttribute('data-editing')).toBe('true');

        staleBlank.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
        }));

        expect(onEdit).toHaveBeenCalledWith('Link target', '', true);
        expect(container.hasAttribute('data-editing')).toBe(false);
    });
});
