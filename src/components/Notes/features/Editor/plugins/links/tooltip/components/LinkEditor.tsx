import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { Icon } from '@/components/ui/icons';
import {
    measureTextNaturalWidth,
    resolveElementTextLayoutMetrics,
} from '@/lib/text-layout';
import { usePredictedTextareaHeight } from '@/hooks/usePredictedTextareaHeight';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
    themeLinkTooltipTokens,
    themeMotionTokens,
    themeRenderingTokens,
    themeTextAreaTokens,
    themeUiFeedbackTokens,
} from '@/styles/themeTokens';
import {
    LINK_TOOLTIP_MIN_WIDTH,
    useLinkTooltipContentWidth,
} from '../hooks/useLinkTooltipContentWidth';
import { MAX_LINK_TOOLTIP_URL_CHARS } from '../hooks/useLinkState';
import {
    preventImageClipboardTextPaste,
    preventImageDataTransferTextDrop,
} from '@/lib/clipboardImagePayload';

interface LinkEditorProps {
    editUrl: string;
    setEditUrl: (url: string) => void;
    editText: string;
    setEditText: (text: string) => void;
    onSave: (shouldClose: boolean) => void;
    onCancel: () => void;
    isNewLink: boolean;
    autoFocus: boolean;
    initialText: string;
    invalidUrlAttempt: number;
    onCompositionChange?: (isComposing: boolean) => void;
}

export const LinkEditor = ({
    editUrl,
    setEditUrl,
    onSave,
    onCancel,
    isNewLink,
    autoFocus,
    invalidUrlAttempt,
    onCompositionChange,
}: LinkEditorProps) => {
    const { t } = useI18n();
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const isComposingRef = useRef(false);
    const { maxWidth, minWidth } = useLinkTooltipContentWidth(containerRef);
    const [editorWidth, setEditorWidth] = useState(LINK_TOOLTIP_MIN_WIDTH);
    const [hasValidationError, setHasValidationError] = useState(false);

    usePredictedTextareaHeight(inputRef, {
        value: editUrl,
        minHeight: themeTextAreaTokens.minHeightPx,
        maxHeight: themeTextAreaTokens.unboundedMaxHeightPx,
    });

    useLayoutEffect(() => {
        const input = inputRef.current;
        if (!input) {
            return;
        }

        const text = editUrl.trim().length > 0 ? editUrl : input.placeholder;
        const metrics = resolveElementTextLayoutMetrics(input);
        const naturalWidth = measureTextNaturalWidth(text, {
            font: metrics.font,
            prepareOptions: {
                whiteSpace: 'pre-wrap',
            },
        });

        const shellPadding = themeLinkTooltipTokens.editorShellPaddingPx;
        const actionWidth = editUrl.length > 0 ? themeLinkTooltipTokens.editorActionWidthPx : 0;
        const nextWidth = Math.min(
            maxWidth,
            Math.max(minWidth, naturalWidth + shellPadding + actionWidth)
        );

        setEditorWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
    }, [editUrl, maxWidth, minWidth]);

    useLayoutEffect(() => {
        if (!autoFocus && isNewLink) {
            return;
        }

        const input = inputRef.current;
        if (!input) {
            return;
        }

        input.focus({ preventScroll: true });
        input.select();

        const focusFrame = window.requestAnimationFrame(() => {
            if (!input.isConnected) {
                return;
            }
            input.focus({ preventScroll: true });
            if (document.activeElement === input) {
                input.select();
            }
        });

        return () => {
            window.cancelAnimationFrame(focusFrame);
        };
    }, [autoFocus, isNewLink]);

    useEffect(() => {
        if (invalidUrlAttempt <= 0) {
            return;
        }

        const input = inputRef.current;
        if (!input) {
            return;
        }

        setHasValidationError(true);
        input.classList.remove('error-shake');
        void input.offsetWidth;
        input.classList.add('error-shake');
        input.focus({ preventScroll: true });

        const timer = window.setTimeout(() => {
            if (!input.isConnected) {
                return;
            }
            input.classList.remove('error-shake');
            setHasValidationError(false);
        }, themeUiFeedbackTokens.urlRailValidationErrorDurationMs);

        return () => {
            window.clearTimeout(timer);
            input.classList.remove('error-shake');
        };
    }, [invalidUrlAttempt]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing || isComposingRef.current) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            onSave(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
        }
    };

    const handleCompositionStart = () => {
        isComposingRef.current = true;
        onCompositionChange?.(true);
    };

    const handleCompositionEnd = () => {
        isComposingRef.current = false;
        onCompositionChange?.(false);
    };

    const handleSaveClick = () => {
        if (isComposingRef.current) {
            return;
        }
        onSave(true);
    };

    return (
        <motion.div
            ref={containerRef}
            initial={{
                opacity: themeMotionTokens.opacityHidden,
                y: themeMotionTokens.linkEditorY,
                scale: themeMotionTokens.linkEditorInitialScale,
            }}
            animate={{
                opacity: themeMotionTokens.opacityVisible,
                y: themeMotionTokens.linkEditorVisibleY,
                scale: themeMotionTokens.linkEditorVisibleScale,
            }}
            style={{
                width: `${editorWidth}px`,
            }}
            className={cn(
                'floating-toolbar-inner link-tooltip-editor !rounded-[var(--vlaina-notes-ui-radius-floating)] z-[var(--vlaina-z-100)]',
                raisedPillSurfaceClass
            )}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <div className="relative flex-1 px-2">
                <textarea
                    ref={inputRef}
                    value={editUrl}
                    onChange={(e) => {
                        if (hasValidationError) {
                            setHasValidationError(false);
                        }
                        setEditUrl(e.target.value);
                    }}
                    onCompositionStart={handleCompositionStart}
                    onCompositionEnd={handleCompositionEnd}
                    onKeyDown={handleKeyDown}
                    onPaste={preventImageClipboardTextPaste}
                    onDrop={preventImageDataTransferTextDrop}
                    rows={1}
                    maxLength={MAX_LINK_TOOLTIP_URL_CHARS}
                    aria-invalid={hasValidationError || undefined}
                    className="block w-full resize-none overflow-hidden bg-transparent border-none outline-none text-sm font-mono text-[var(--vlaina-text-primary)] placeholder:text-[var(--vlaina-text-tertiary)] placeholder:font-light leading-6 py-1.5"
                    placeholder={t('editor.linkPlaceholder')}
                    spellCheck={false}
                    autoComplete="off"
                    style={{ overflowWrap: themeRenderingTokens.overflowWrapAnywhere }}
                />
            </div>

            <AnimatePresence>
                {editUrl.length > 0 && (
                    <motion.button
                        initial={{
                            opacity: themeMotionTokens.opacityHidden,
                            x: themeMotionTokens.linkEditorActionInitialX,
                            scale: themeMotionTokens.linkEditorActionInitialScale,
                        }}
                        animate={{
                            opacity: themeMotionTokens.opacityVisible,
                            x: themeMotionTokens.linkEditorActionVisibleX,
                            scale: themeMotionTokens.linkEditorActionVisibleScale,
                        }}
                        exit={{
                            opacity: themeMotionTokens.opacityHidden,
                            x: themeMotionTokens.linkEditorActionExitX,
                            scale: themeMotionTokens.linkEditorActionInitialScale,
                        }}
                        whileTap={{ scale: themeMotionTokens.linkEditorActionTapScale }}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                        }}
                        onClick={handleSaveClick}
                        className="toolbar-btn link-tooltip-action-btn active shrink-0"
                    >
                        <Icon size="md" name="common.check" />
                    </motion.button>
                )}
            </AnimatePresence>
        </motion.div>
    );
};
