import { useEffect, useRef } from 'react';
import { useLinkState, UseLinkStateProps } from './hooks/useLinkState';
import { LinkEditor } from './components/LinkEditor';
import { LinkViewer } from './components/LinkViewer';

export interface LinkTooltipProps extends UseLinkStateProps {
    editorElement?: HTMLElement;
    onOpen: () => void;
    onUnlink: () => void;
    onRemove: () => void;
}

function resolveEventElement(target: EventTarget | null): Element | null {
    return target instanceof Element
        ? target
        : target instanceof Node
            ? target.parentElement
            : null;
}

function isEditorLinkTarget(target: EventTarget | null, editorElement?: HTMLElement): boolean {
    if (!editorElement) return false;

    const targetElement = resolveEventElement(target);
    if (!targetElement || !editorElement.contains(targetElement)) return false;

    return targetElement.closest('a[href], .autolink') !== null;
}

const LinkTooltip = (props: LinkTooltipProps) => {
    const skipNextMouseDownRef = useRef(false);
    const isEditorComposingRef = useRef(false);
    const {
        mode, setMode,
        isAutolink,
        editUrl, setEditUrl,
        editText, setEditText,
        handleSaveEdit,
        handleCancelEdit,
        handleCopy,
        showCopied,
        displayUrl,
        isNewLink,
        autoFocus,
        invalidUrlAttempt
    } = useLinkState(props);

    useEffect(() => {
        const handlePressOutside = (event: MouseEvent | PointerEvent) => {
            if (event.type === 'mousedown' && skipNextMouseDownRef.current) {
                skipNextMouseDownRef.current = false;
                return;
            }

            const container = props.containerElement ?? document.querySelector('.link-tooltip-container');
            if (container?.classList.contains('hidden')) {
                return;
            }
            if (container && container.contains(event.target as Node)) {
                return;
            }

            if (mode !== 'edit' && isEditorLinkTarget(event.target, props.editorElement)) {
                return;
            }

            const target = resolveEventElement(event.target);

            if (target?.closest('[data-radix-popper-content-wrapper]') || target?.closest('[role="menu"]')) {
                return;
            }

            if (event.type === 'pointerdown') {
                skipNextMouseDownRef.current = true;
            }

            if (mode === 'edit') {
                if (isEditorComposingRef.current) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
                const didSave = handleSaveEdit(true);
                if (!didSave) {
                    event.preventDefault();
                    event.stopPropagation();
                }
            } else {
                props.onClose();
            }
        };

        document.addEventListener('pointerdown', handlePressOutside, true);
        document.addEventListener('mousedown', handlePressOutside, true);
        return () => {
            document.removeEventListener('pointerdown', handlePressOutside, true);
            document.removeEventListener('mousedown', handlePressOutside, true);
        };
    }, [mode, handleSaveEdit, props.containerElement, props.editorElement, props.onClose]);


    if (mode === 'edit') {
        return (
            <LinkEditor
                editUrl={editUrl}
                setEditUrl={setEditUrl}
                editText={editText}
                setEditText={setEditText}
                onSave={handleSaveEdit}
                onCancel={handleCancelEdit}
                isNewLink={isNewLink}
                autoFocus={autoFocus}
                initialText={props.initialText || ''}
                invalidUrlAttempt={invalidUrlAttempt}
                onCompositionChange={(isComposing) => {
                    isEditorComposingRef.current = isComposing;
                }}
            />
        );
    }

    return (
        <LinkViewer
            displayUrl={displayUrl}
            isAutolink={isAutolink}
            showCopied={showCopied}
            onOpen={props.onOpen}
            onCopy={handleCopy}
            onEdit={() => setMode('edit')}
            onUnlink={props.onUnlink}
            onRemove={props.onRemove}
        />
    );
};

export default LinkTooltip;
