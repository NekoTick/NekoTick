import { useRef } from 'react';
import { Icon } from '@/components/ui/icons';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { useLinkTooltipContentWidth } from '../hooks/useLinkTooltipContentWidth';

interface LinkViewerProps {
    displayUrl: string;
    isAutolink: boolean;
    showCopied: boolean;
    onOpen: () => void;
    onCopy: () => void;
    onEdit: () => void;
    onUnlink: () => void;
    onRemove: () => void;
}

export const LinkViewer = ({
    displayUrl,
    isAutolink,
    showCopied,
    onOpen,
    onCopy,
    onEdit,
    onUnlink,
    onRemove
}: LinkViewerProps) => {
    const { t } = useI18n();
    const containerRef = useRef<HTMLDivElement>(null);
    const { maxWidth } = useLinkTooltipContentWidth(containerRef);

    const actionButtonClass = 'toolbar-btn link-tooltip-action-btn';

    return (
        <div
            ref={containerRef}
            style={{
                maxWidth: `${maxWidth}px`,
            }}
            className={cn(
                'floating-toolbar-inner link-tooltip-viewer !rounded-[var(--vlaina-notes-ui-radius-floating)] animate-in fade-in duration-[var(--vlaina-duration-100)]',
                raisedPillSurfaceClass
            )}
            onMouseDown={(e) => e.stopPropagation()}
        >
            <button
                onClick={onOpen}
                aria-label={t('common.open')}
                className="toolbar-btn link-tooltip-open-btn group"
            >
                <span className="flex size-5 shrink-0 items-center justify-center rounded transition-colors">
                    <Icon size="md" name="nav.external" />
                </span>
                <span className="min-w-0 flex-1 whitespace-normal break-all text-left text-[var(--vlaina-font-13)] font-medium leading-5 text-[var(--vlaina-text-tertiary)] transition-colors group-hover:text-[var(--vlaina-sidebar-row-selected-text)]">
                    {displayUrl}
                </span>
            </button>

            <div className="toolbar-divider" />

            <div className="flex items-center gap-0.5">
                <button aria-label={t('common.copy')} onClick={onCopy} className={cn(actionButtonClass, showCopied && 'active')}>
                    {showCopied
                        ? <Icon size="md" name="common.check" className="text-[var(--vlaina-accent)] scale-[var(--vlaina-scale-110)]" />
                        : <Icon size="md" name="common.copy" />}
                </button>

                <button aria-label={t('shortcut.action.link')} onClick={onEdit} className={actionButtonClass}>
                    <Icon size="md" name="common.compose" />
                </button>
            </div>

            <div className="toolbar-divider" />

            <div className="flex items-center gap-0.5">
                {!isAutolink && (
                    <button aria-label={t('common.remove')} onClick={onUnlink} className={actionButtonClass}>
                        <Icon size="md" name="common.unlink" />
                    </button>
                )}

                <button aria-label={t('common.delete')} onClick={onRemove} className={actionButtonClass}>
                    <Icon size="md" name="common.delete" />
                </button>
            </div>
        </div>
    );
};
