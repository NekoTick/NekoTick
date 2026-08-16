import React, { useState, useEffect } from 'react';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { useToastStore } from '@/stores/useToastStore';
import { themeUiFeedbackTokens } from '@/styles/themeTokens';

interface ImageToolbarProps {
    alignment: 'left' | 'center' | 'right';
    onAlign: (align: 'left' | 'center' | 'right') => void;
    onEdit: () => void;
    onCopy: () => boolean | Promise<boolean> | void | Promise<void>;
    onDownload: () => void;
    onDelete: () => void;
    isVisible: boolean;
    hideMediaActions?: boolean;
}

export const ImageToolbar: React.FC<ImageToolbarProps> = ({
    alignment,
    onAlign,
    onEdit,
    onCopy,
    onDownload,
    onDelete,
    isVisible,
    hideMediaActions = false,
}) => {
    const { t } = useI18n();
    const addToast = useToastStore((state) => state.addToast);
    const [copied, setCopied] = useState(false);
    const mountedRef = React.useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        if (copied) {
            const timer = setTimeout(
                () => setCopied(false),
                themeUiFeedbackTokens.imageToolbarCopyFeedbackDurationMs
            );
            return () => clearTimeout(timer);
        }
    }, [copied]);

    const handleCopy = () => {
        void Promise.resolve(onCopy()).then((didCopy) => {
            if (mountedRef.current && didCopy !== false) {
                setCopied(true);
            } else if (mountedRef.current) {
                addToast(t('chat.copyImageFailed'), 'error');
            }
        }, () => {
            if (mountedRef.current) {
                addToast(t('chat.copyImageFailed'), 'error');
            }
        });
    };

    return (
        <div className={cn(
            "absolute top-2 right-2 mt-0 z-[var(--vlaina-z-60)] transition-all duration-[var(--vlaina-duration-200)]",
            "floating-toolbar-inner image-toolbar !rounded-[var(--vlaina-notes-ui-radius-floating)]",
            raisedPillSurfaceClass,
            "transform origin-top-right",
            isVisible
                ? "opacity-[var(--vlaina-opacity-100)] scale-[var(--vlaina-scale-100)] translate-y-0"
                : "opacity-[var(--vlaina-opacity-0)] scale-[var(--vlaina-scale-95)] -translate-y-2 pointer-events-none"
        )}
            data-no-editor-drag-box="true"
        >
            <div className="flex items-center gap-0.5">
                <ToolbarButton
                    icon={<Icon size="md" name="editor.alignLeft" />}
                    onClick={() => onAlign('left')}
                    active={alignment === 'left'}
                    action="align-left"
                />
                <ToolbarButton
                    icon={<Icon size="md" name="editor.alignCenter" />}
                    onClick={() => onAlign('center')}
                    active={alignment === 'center'}
                    action="align-center"
                />
                <ToolbarButton
                    icon={<Icon size="md" name="editor.alignRight" />}
                    onClick={() => onAlign('right')}
                    active={alignment === 'right'}
                    action="align-right"
                />
            </div>

            {!hideMediaActions ? (
                <>
                    <div className="toolbar-divider" />

                    <div className="flex items-center gap-0.5">
                        <ToolbarButton icon={<Icon size="md" name="editor.crop" />} onClick={onEdit} action="edit" />
                        <ToolbarButton
                            icon={copied ? <Icon size="md" name="common.check" /> : <Icon size="md" name="common.copy" />}
                            onClick={handleCopy}
                            success={copied}
                            action="copy"
                        />
                        <ToolbarButton icon={<Icon size="md" name="common.download" />} onClick={onDownload} action="download" />
                    </div>
                </>
            ) : null}

            <div className="toolbar-divider" />

            <div className="flex items-center gap-0.5">
                <ToolbarButton icon={<Icon size="md" name="common.delete" />} onClick={onDelete} danger action="delete" />
            </div>
        </div>
    );
};

function ToolbarButton({
    icon,
    onClick,
    danger,
    success,
    active,
    action,
}: {
    icon: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
    success?: boolean;
    active?: boolean;
    action?: string;
}) {
    return (
        <button
            type="button"
            data-no-focus-input="true"
            data-image-toolbar-action={action}
            onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
            }}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onClick();
            }}
            className={cn(
                "toolbar-btn image-toolbar-btn",
                active && "active",
                danger && "hover:!text-[var(--vlaina-color-status-danger-fg)]",
                success && "active"
            )}
        >
            {icon}
        </button>
    );
}
