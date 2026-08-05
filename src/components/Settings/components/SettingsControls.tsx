import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { ReactNode } from 'react';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { useI18n } from '@/lib/i18n';
import { themeDomStyleTokens, themeMotionTokens } from '@/styles/themeTokens';

interface SegmentedControlProps {
    options: { value: string; label: string; icon?: ReactNode }[];
    value: string;
    onChange: (value: string) => void;
}

export function SegmentedControl({ options, value, onChange }: SegmentedControlProps) {
    return (
        <div className="flex min-w-0 flex-wrap p-0.5 bg-[var(--vlaina-color-setting-control)] rounded-lg border border-[var(--vlaina-color-menu-border)]">
            {options.map((option) => {
                const isActive = value === option.value;
                return (
                    <button
                        key={option.value}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "relative z-[var(--vlaina-z-10)] flex min-w-0 flex-1 items-center justify-center gap-2 rounded-[var(--vlaina-radius-6px)] px-3 py-1.5 text-[var(--vlaina-font-13)] font-medium transition-all",
                            isActive
                                ? "text-[var(--vlaina-sidebar-row-selected-text)]"
                                : "text-[var(--vlaina-sidebar-chat-text)] hover:text-[var(--vlaina-sidebar-chat-text)]"
                        )}
                    >
                        {isActive && (
                            <motion.div
                                layoutId="segmented-bg"
                                className="absolute inset-0 bg-[var(--vlaina-color-setting-control-active)] rounded-[var(--vlaina-radius-6px)] shadow-[var(--vlaina-shadow-control-active)] border border-[var(--vlaina-color-menu-border)]"
                                transition={{
                                    type: "spring",
                                    bounce: themeMotionTokens.settingsSegmentedControlBounce,
                                    duration: themeMotionTokens.settingsSegmentedControlDuration,
                                }}
                                style={{ zIndex: themeDomStyleTokens.zIndexBehind }}
                            />
                        )}
                        <div className="flex items-center justify-center w-[var(--vlaina-size-18px)] h-[var(--vlaina-size-18px)]">
                            {option.icon}
                        </div>
                        <span>{option.label}</span>
                    </button>
                );
            })}
        </div>
    );
}

interface SettingsToggleProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
}

export function SettingsToggle({ checked, onChange }: SettingsToggleProps) {
    const { t } = useI18n();

    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            data-settings-toggle="true"
            onClick={() => onChange(!checked)}
            className={cn(
                "relative w-10 h-6 rounded-full transition-colors duration-[var(--vlaina-duration-200)] ease-in-out focus:outline-none",
                checked ? "bg-[var(--vlaina-accent)]" : "bg-[var(--vlaina-bg-tertiary)]"
            )}
        >
            <span className="sr-only">{t('common.toggleSetting')}</span>
            <span
                className={cn(
                    "inline-block w-[var(--vlaina-size-18px)] h-[var(--vlaina-size-18px)] bg-[var(--vlaina-color-white)] rounded-full shadow-[var(--vlaina-shadow-control-active)] transform transition-transform duration-[var(--vlaina-duration-200)] ease-in-out",
                    checked ? "translate-x-[var(--vlaina-translate-19px)]" : "translate-x-[var(--vlaina-translate-3px)]"
                )}
                style={{ marginTop: themeDomStyleTokens.marginTopSettingsToggle }}
            />
        </button>
    );
}

interface SettingsItemProps {
    title: string;
    description?: string;
    children: ReactNode;
    className?: string;
    'data-settings-item'?: string;
}

export function SettingsItem({
    title,
    description,
    children,
    className,
    'data-settings-item': dataSettingsItem,
}: SettingsItemProps) {
    const hasDescription = Boolean(description);

    return (
        <div
            data-settings-item={dataSettingsItem}
            className={cn("mb-3 flex min-w-0 flex-wrap items-center justify-between gap-4 rounded-[var(--vlaina-ui-radius-group)] px-6 py-4 max-[640px]:px-4", raisedPillSurfaceClass, className)}
        >
            <div
                className={cn(
                    hasDescription
                        ? "min-w-[var(--vlaina-width-settings-control-min)] flex-1"
                        : "min-w-max flex-[1_1_auto]",
                    "pr-4 max-[420px]:w-full max-[420px]:pr-0",
                )}
                data-settings-item-copy="true"
            >
                <div className={cn(
                    "mb-0.5 text-[var(--vlaina-font-sm)] font-semibold text-[var(--vlaina-sidebar-notes-text)]",
                    !hasDescription && "whitespace-nowrap",
                )}>
                    {title}
                </div>
                {description && (
                    <div className="max-w-[var(--vlaina-size-420px)] text-[var(--vlaina-font-xs)] leading-normal text-[var(--vlaina-sidebar-notes-text-soft)] max-[640px]:max-w-full">
                        {description}
                    </div>
                )}
            </div>
            <div
                className="min-w-0 flex-shrink-0 max-[420px]:w-full"
                data-settings-item-control="true"
            >
                {children}
            </div>
        </div>
    );
}

export function SettingsSectionHeader({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <div
            className={cn("mt-10 mb-4 px-2", className)}
            data-settings-section-header="true"
        >
            <h3 className="text-[var(--vlaina-font-sm)] font-bold text-[var(--vlaina-sidebar-notes-text-soft)] tracking-tight opacity-[var(--vlaina-opacity-80)]">
                {children}
            </h3>
        </div>
    );
}
