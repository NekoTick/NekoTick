import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { ShortcutKeys } from '@/components/ui/shortcut-keys';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { OPEN_SETTINGS_EVENT } from '@/components/Settings/settingsEvents';
import { cn, iconButtonStyles } from '@/lib/utils';
import { useI18n } from '@/lib/i18n';
import { isMacOS } from '@/lib/desktop/platform';
import { useUIStore } from '@/stores/uiSlice';

const WorkspaceSwitcher = lazy(async () => {
    const mod = await import('./WorkspaceSwitcher');
    return { default: mod.WorkspaceSwitcher };
});

interface SidebarUserHeaderProps {
    toggleSidebar: () => void;
    interactionSuppressed?: boolean;
}

function WorkspaceSwitcherFallback() {
    return (
        <div className="app-no-drag flex h-full w-[var(--vlaina-width-minus-titlebar-actions)] min-w-0 items-center justify-start">
            <span className="relative flex size-[var(--vlaina-size-26px)] shrink-0 overflow-hidden rounded-[var(--vlaina-radius-8px)]">
                <img src={`${import.meta.env.BASE_URL}logo.png?v=20260327`} alt="vlaina" className="h-full w-full object-cover shadow-[var(--vlaina-shadow-sm)]" />
            </span>
            <span className="ml-2 min-w-0 truncate text-[length:var(--vlaina-font-15)] font-semibold leading-none text-[var(--vlaina-color-brand-wordmark)]">
                vlaina
            </span>
            <Icon name="nav.chevronDown" size="sm" className="ml-1 shrink-0 text-[var(--vlaina-color-brand-wordmark)] opacity-[var(--vlaina-opacity-0)]" />
        </div>
    );
}

export function SidebarUserHeader({ toggleSidebar, interactionSuppressed = false }: SidebarUserHeaderProps) {
    const { t } = useI18n();
    const headerRef = useRef<HTMLDivElement>(null);
    const [isHovered, setIsHovered] = useState(false);
    const devPlatformPreview = useUIStore((state) => state.devPlatformPreview);
    const shouldReserveMacTrafficLightSpace = isMacOS(devPlatformPreview);

    const clearHeaderInteraction = useCallback(() => {
        setIsHovered(false);

        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement && headerRef.current?.contains(activeElement)) {
            activeElement.blur();
        }
    }, []);

    const handleOpenSettings = useCallback(() => {
        clearHeaderInteraction();
        window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
    }, [clearHeaderInteraction]);

    const handleToggleSidebar = useCallback(() => {
        clearHeaderInteraction();
        toggleSidebar();
    }, [clearHeaderInteraction, toggleSidebar]);

    useEffect(() => {
        if (!interactionSuppressed) return;
        clearHeaderInteraction();
    }, [clearHeaderInteraction, interactionSuppressed]);

    useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            if (interactionSuppressed) {
                setIsHovered(false);
                return;
            }

            const rect = headerRef.current?.getBoundingClientRect();
            if (!rect) return;

            setIsHovered(
                event.clientX >= rect.left &&
                event.clientX <= rect.right &&
                event.clientY >= rect.top &&
                event.clientY <= rect.bottom
            );
        };

        const handleMouseLeaveWindow = () => clearHeaderInteraction();
        const handleMouseOutWindow = (event: MouseEvent) => {
            if (event.relatedTarget === null) {
                clearHeaderInteraction();
            }
        };

        window.addEventListener('mousemove', handleMouseMove, true);
        window.addEventListener('mouseleave', handleMouseLeaveWindow);
        window.addEventListener('mouseout', handleMouseOutWindow, true);
        window.addEventListener('blur', handleMouseLeaveWindow);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove, true);
            window.removeEventListener('mouseleave', handleMouseLeaveWindow);
            window.removeEventListener('mouseout', handleMouseOutWindow, true);
            window.removeEventListener('blur', handleMouseLeaveWindow);
        };
    }, [clearHeaderInteraction, interactionSuppressed]);

    return (
        <div
            ref={headerRef}
            className={cn(
                'app-drag-region sidebar-user-header group/sidebar-user-header relative flex h-10 w-full items-center pr-3',
                shouldReserveMacTrafficLightSpace ? 'pl-[var(--vlaina-space-76px)]' : 'pl-3'
            )}
            data-hovered={!interactionSuppressed && isHovered ? 'true' : undefined}
            data-interaction-suppressed={interactionSuppressed ? 'true' : undefined}
        >
            <div
                className={cn(
                    'sidebar-user-header-pill flex h-8 w-full items-center justify-between rounded-full border border-transparent bg-transparent px-1 transition-[background-color,box-shadow]',
                )}
            >
                <Suspense fallback={<WorkspaceSwitcherFallback />}>
                    <WorkspaceSwitcher
                        className="h-full w-[var(--vlaina-width-minus-titlebar-actions)] min-w-0 justify-start"
                        onOpenSettings={handleOpenSettings}
                    />
                </Suspense>
                <div
                    className="app-drag-region h-full min-w-12 flex-1 cursor-grab active:cursor-grabbing"
                    aria-hidden="true"
                />
                <Tooltip>
                    <TooltipTrigger asChild>
                        <button
                            type="button"
                            onClick={handleToggleSidebar}
                            aria-label={t('common.collapseSidebar')}
                            className={cn(
                                'sidebar-user-header-collapse pointer-events-none flex h-7 w-7 items-center justify-center rounded-full bg-transparent opacity-[var(--vlaina-opacity-0)] transition-[color,opacity]',
                                iconButtonStyles,
                                'hover:text-[var(--vlaina-accent)]'
                            )}
                        >
                            <Icon name="nav.collapse" size="md" />
                        </button>
                    </TooltipTrigger>
                    <TooltipContent
                        side="bottom"
                        sideOffset={6}
                        showArrow={false}
                        className={cn(
                            'flex items-center gap-1.5 rounded-[var(--vlaina-ui-radius-tooltip)] px-3 py-2 text-xs text-[var(--vlaina-sidebar-chat-text)]',
                            raisedPillSurfaceClass
                        )}
                    >
                        <ShortcutKeys
                            keys={['Ctrl', '\\']}
                            keyClassName="rounded-md bg-[var(--vlaina-sidebar-chat-row-hover)] text-[var(--vlaina-sidebar-chat-text)]"
                        />
                    </TooltipContent>
                </Tooltip>
            </div>
        </div>
    );
}
