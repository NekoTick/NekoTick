import React, { useState, useMemo, useRef, useEffect } from 'react';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n';
import { cn, ghostIconButtonStyles, iconButtonStyles } from '@/lib/utils';
import { guessLanguage } from '../../../utils/languageGuesser';
import { codeBlockLanguages } from '../codeBlockLanguageLoader';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { themeIconTokens } from '@/styles/themeTokens';
import {
    preventImageClipboardTextPaste,
    preventImageDataTransferTextDrop,
} from '@/lib/clipboardImagePayload';

interface LanguageSelectorProps {
    language: string;
    displayName: string;
    getNodeText: () => string;
    onLanguageChange: (lang: string) => void;
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

export function filterCodeBlockLanguages(searchTerm: string, languages = codeBlockLanguages) {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return languages;

    return languages.filter(l =>
        l.name.toLowerCase().includes(term) ||
        l.id.toLowerCase().includes(term) ||
        l.aliases?.some(a => a.toLowerCase().includes(term))
    );
}

export const LanguageSelector = React.memo(function LanguageSelector({
    language,
    displayName,
    getNodeText,
    onLanguageChange,
    isOpen,
    onOpenChange
}: LanguageSelectorProps) {
    const { t } = useI18n();
    const [searchTerm, setSearchTerm] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const isComposingRef = useRef(false);

    const filteredLanguages = useMemo(() => {
        return filterCodeBlockLanguages(searchTerm);
    }, [searchTerm]);

    useEffect(() => {
        setActiveIndex(0);
    }, [searchTerm]);

    useEffect(() => {
        if (!isOpen) setSearchTerm('');
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const timerId = window.setTimeout(() => {
            searchInputRef.current?.focus({ preventScroll: true });
        }, 90);

        return () => window.clearTimeout(timerId);
    }, [isOpen]);

    useEffect(() => {
        if (scrollRef.current) {
            const activeItem = scrollRef.current.children[activeIndex] as HTMLElement;
            if (activeItem) {
                activeItem.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [activeIndex]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.nativeEvent.isComposing || isComposingRef.current) {
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopPropagation();
            setActiveIndex(prev => Math.min(prev + 1, filteredLanguages.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            setActiveIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            e.stopPropagation();
            const selected = filteredLanguages[activeIndex];
            if (selected) {
                onLanguageChange(selected.id);
                onOpenChange(false);
            }
        } else {
            e.stopPropagation();
        }
    };

    const handleAutoDetect = () => {
        const guessed = guessLanguage(getNodeText());
        onLanguageChange(guessed || 'txt');
        onOpenChange(false);
    };

    return (
        <Popover open={isOpen} onOpenChange={onOpenChange}>
            <PopoverAnchor asChild>
                <button
                    type="button"
                    className="inline-flex min-h-7 cursor-pointer items-center justify-center rounded-full px-1 transition-colors duration-[var(--vlaina-duration-150)] select-none"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onOpenChange(!isOpen);
                    }}
                    onPointerDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                >
                    <span className="code-block-chrome-language-label code-block-flair whitespace-nowrap">
                        {displayName}
                    </span>
                </button>
            </PopoverAnchor>
            <PopoverContent
                align="start"
                sideOffset={8}
                className={cn(
                    "w-[var(--vlaina-size-220px)] overflow-hidden flex flex-col p-0 !rounded-[var(--vlaina-notes-ui-radius-panel)]",
                    raisedPillSurfaceClass,
                )}
                onOpenAutoFocus={(e) => e.preventDefault()}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="px-2 pt-2 pb-1">
                    <div
                        className={cn(
                            "relative flex h-[var(--vlaina-size-40px)] items-center gap-2 rounded-full pl-3 pr-1",
                            raisedPillSurfaceClass,
                        )}
                    >
                        <Icon size={themeIconTokens.sizeCompact} name="common.search" className="text-[var(--vlaina-color-text-soft)]" />
                        <input
                            ref={searchInputRef}
                            spellCheck={false}
                            className="h-8 min-w-0 flex-1 bg-transparent py-0 text-[var(--vlaina-font-base)] leading-5 text-[var(--vlaina-color-text-soft)] outline-none placeholder:text-[var(--vlaina-color-text-soft)]"
                            placeholder={t('editor.searchLanguage')}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onCompositionStart={() => {
                                isComposingRef.current = true;
                            }}
                            onCompositionEnd={() => {
                                isComposingRef.current = false;
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onPaste={preventImageClipboardTextPaste}
                            onDrop={preventImageDataTransferTextDrop}
                            onKeyDown={handleKeyDown}
                        />
                        <button
                            aria-label={t('editor.autoDetectLanguage')}
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleAutoDetect();
                            }}
                            className={cn(
                                "inline-flex h-6 w-6 items-center justify-center",
                                iconButtonStyles,
                                ghostIconButtonStyles,
                            )}
                        >
                            <Icon size="md" name="common.sparkle" />
                        </button>
                    </div>
                </div>

                <div ref={scrollRef} className="max-h-[var(--vlaina-size-240px)] overflow-y-auto p-1 app-scrollbar">
                    {filteredLanguages.length > 0 ? (
                        filteredLanguages.map((lang, index) => {
                            return (
                                <button
                                    type="button"
                                    key={lang.id} 
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onLanguageChange(lang.id);
                                        onOpenChange(false);
                                    }}
                                    className={cn(
                                        "flex w-full cursor-pointer items-center gap-2 rounded-[var(--vlaina-notes-ui-radius-compact)] px-3 py-2 text-left text-xs transition-colors",
                                        language === lang.id
                                            ? "bg-[var(--vlaina-sidebar-notes-row-active)] text-[var(--vlaina-sidebar-row-selected-text)] font-[var(--vlaina-font-weight-semibold-plus)]"
                                            : index === activeIndex
                                                ? "bg-[var(--vlaina-sidebar-notes-row-hover)] text-[var(--vlaina-sidebar-notes-text)]"
                                                : "text-[var(--vlaina-sidebar-notes-text-muted)] hover:bg-[var(--vlaina-sidebar-notes-row-hover)] hover:text-[var(--vlaina-sidebar-notes-text)]"
                                    )}
                                >
                                    <span>{lang.name.toLowerCase()}</span>
                                </button>
                            );
                        })
                    ) : (
                        <div className="px-4 py-8 text-center text-xs text-[var(--vlaina-text-tertiary)] italic">
                            {t('editor.noLanguagesFound')}
                        </div>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
});
