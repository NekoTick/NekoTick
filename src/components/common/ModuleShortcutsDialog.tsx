import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ShortcutKeys } from '@/components/ui/shortcut-keys';
import { DialogCloseIconButton } from '@/components/common/DialogCloseIconButton';
import { cn } from '@/lib/utils';
import { ModuleShortcutId, ModuleShortcutSection, getModuleShortcutPreset } from '@/lib/shortcuts/moduleShortcuts';
import { useDialogWindowDrag } from '@/hooks/useDialogWindowDrag';
import { useI18n } from '@/lib/i18n';
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { themeBackdropTokens, themeIconTokens } from '@/styles/themeTokens';

interface ModuleShortcutsDialogProps {
  module: ModuleShortcutId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  sections?: ModuleShortcutSection[];
}

const SHORTCUT_KEY_ALIASES: Record<string, string[]> = {
  Ctrl: ['ctrl', 'control', 'ctl', '^', '⌃', 'cmd', 'command', 'meta', '⌘'],
  Control: ['ctrl', 'control', 'ctl', '^', '⌃'],
  Meta: ['meta', 'cmd', 'command', '⌘'],
  Shift: ['shift', '⇧'],
  Alt: ['alt', 'option', 'opt', '⌥'],
  Option: ['option', 'opt', 'alt', '⌥'],
  '/': ['/', 'slash', '斜杠', 'スラッシュ', '슬래시'],
  '\\': ['\\', 'backslash', '反斜杠', 'バックスラッシュ', '백슬래시'],
  ',': [',', 'comma', '逗号', 'カンマ', '쉼표'],
  '.': ['.', 'period', 'dot', 'fullstop', '句号', 'ドット', '마침표'],
  '`': ['`', 'backtick', 'grave', '反引号'],
  '-': ['-', 'minus', 'dash', 'hyphen', '减号'],
  '=': ['=', 'equals', 'equal', '等号'],
  '[': ['[', 'left bracket', 'open bracket', '左括号'],
  ']': [']', 'right bracket', 'close bracket', '右括号'],
  Backspace: ['backspace', 'delete', 'del', '⌫', '退格'],
  Enter: ['enter', 'return', '回车'],
  Tab: ['tab', '制表'],
  Escape: ['escape', 'esc'],
};

function normalizeSearchValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '');
}

function compactSearchValue(value: string) {
  return normalizeSearchValue(value)
    .replace(/\\/g, ' backslash ')
    .replace(/\//g, ' slash ')
    .replace(/,/g, ' comma ')
    .replace(/\./g, ' period ')
    .replace(/`/g, ' backtick ')
    .replace(/-/g, ' minus ')
    .replace(/\[/g, ' leftbracket ')
    .replace(/\]/g, ' rightbracket ')
    .replace(/[+_(){}]+/g, ' ')
    .replace(/\s+/g, '');
}

function getShortcutSearchCandidates(keys: string[]) {
  const keyAliases = keys.map((key) => SHORTCUT_KEY_ALIASES[key] ?? [key]);
  const orderedPhrases = keyAliases.reduce<string[]>((phrases, aliases) => {
    if (phrases.length === 0) {
      return aliases;
    }

    return phrases.flatMap((phrase) => aliases.map((alias) => `${phrase} ${alias}`));
  }, []);

  return [
    keys.join(' '),
    keys.join('+'),
    ...keys,
    ...keyAliases.flat(),
    ...orderedPhrases,
    ...orderedPhrases.map((phrase) => phrase.replace(/\s+/g, '+')),
    ...orderedPhrases.map((phrase) => phrase.replace(/\s+/g, '-')),
  ];
}

export function ModuleShortcutsDialog({
  module,
  open,
  onOpenChange,
  title,
  sections,
}: ModuleShortcutsDialogProps) {
  const { t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const isMac = typeof window !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const preset = getModuleShortcutPreset(module, { isMac, t });
  const resolvedTitle = title ?? preset.title;
  const resolvedDescription = preset.description;
  const resolvedSections = sections ?? preset.sections;
  const shortcutKeyClassName = 'rounded-md bg-[var(--vlaina-sidebar-chat-row-hover)] text-[var(--vlaina-sidebar-chat-text)] shadow-[var(--vlaina-shadow-none)]';
  const normalizedSearchQuery = normalizeSearchValue(searchQuery);
  const compactSearchQuery = compactSearchValue(searchQuery);
  const filteredSections = useMemo(() => {
    if (!normalizedSearchQuery) {
      return resolvedSections;
    }
    if (normalizedSearchQuery === '+') {
      return [];
    }

    return resolvedSections
      .map((section) => ({
        ...section,
        shortcuts: section.shortcuts.filter((shortcut) => {
          const searchCandidates = [
            section.title,
            shortcut.action,
            ...getShortcutSearchCandidates(shortcut.keys),
          ];

          return searchCandidates.some((candidate) => {
            const normalizedCandidate = normalizeSearchValue(candidate);
            return normalizedCandidate.includes(normalizedSearchQuery)
              || (compactSearchQuery.length > 0 && compactSearchValue(candidate).includes(compactSearchQuery));
          });
        }),
      }))
      .filter((section) => section.shortcuts.length > 0);
  }, [compactSearchQuery, normalizedSearchQuery, resolvedSections]);
  const {
    handleDragHandleMouseDown,
    handleInteractOutside,
    handlePointerDownOutside,
  } = useDialogWindowDrag({
    open,
    onOpenChange,
    errorLabel: 'shortcuts dialog drag',
  });

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        useBlurBackdrop
        blurBackdropProps={{
          overlayClassName: 'bg-[var(--vlaina-color-drop-overlay)]',
          zIndex: 120,
          blurPx: themeBackdropTokens.moduleShortcutsBlurPx,
          duration: themeBackdropTokens.moduleShortcutsDurationSeconds,
        }}
        containerClassName="z-[var(--vlaina-z-121)]"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
        }}
        onPointerDownOutside={handlePointerDownOutside}
        onInteractOutside={handleInteractOutside}
        className="sm:max-w-lg rounded-[var(--vlaina-ui-radius-panel)] border border-[var(--vlaina-color-panel-border)] bg-[var(--vlaina-color-setting-field)] p-4 shadow-[var(--vlaina-shadow-floating-panel)] overflow-hidden duration-[var(--vlaina-duration-75)]"
      >
        <div
          className="app-drag-region flex min-w-0 items-center justify-between gap-3 px-1 pb-4 cursor-grab active:cursor-grabbing select-none"
          onMouseDown={handleDragHandleMouseDown}
        >
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <DialogTitle className="min-w-0 truncate text-[var(--vlaina-font-20)] font-semibold tracking-[var(--vlaina-tracking-tight-display)] text-[var(--vlaina-color-text-strong)]">
                {resolvedTitle}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {resolvedDescription}
              </DialogDescription>
              <ShortcutKeys
                keys={['Ctrl', 'Shift', '/']}
                className="shrink-0"
                keyClassName={shortcutKeyClassName}
              />
              <div
                className="app-no-drag relative ml-1 flex h-[var(--vlaina-size-34px)] min-w-[var(--vlaina-size-96px)] max-w-[var(--vlaina-size-240px)] flex-1 items-center gap-2 rounded-full px-3 cursor-auto select-text"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <div className={cn('absolute inset-0 rounded-full', raisedPillSurfaceClass)} />
                <Icon
                  name="common.search"
                  size={themeIconTokens.sizeRow}
                  className="relative z-[var(--vlaina-z-1)] shrink-0 text-[var(--vlaina-color-text-soft)]"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  role="searchbox"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t('sidebar.search')}
                  aria-label={`${t('sidebar.search')} ${resolvedTitle}`}
                  spellCheck={false}
                  className="relative z-[var(--vlaina-z-1)] h-full min-w-0 flex-1 bg-transparent py-0 text-[var(--vlaina-font-13)] leading-normal text-[var(--vlaina-sidebar-chat-text)] outline-none placeholder:text-[var(--vlaina-color-text-soft)]"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      searchInputRef.current?.focus({ preventScroll: true });
                    }}
                    aria-label={t('common.close')}
                    className="relative z-[var(--vlaina-z-1)] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--vlaina-color-text-soft)] transition-colors hover:bg-[var(--vlaina-sidebar-chat-row-hover)] hover:text-[var(--vlaina-sidebar-chat-text)]"
                  >
                    <Icon name="common.close" size="sm" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <DialogClose asChild>
            <DialogCloseIconButton
              label={t('common.close')}
              onMouseDown={(event) => {
                event.stopPropagation();
              }}
            />
          </DialogClose>
        </div>

        <div
          className="max-h-[var(--vlaina-size-65vh)] overflow-y-auto space-y-3 pr-1"
          data-module-shortcuts-scroll-root="true"
        >
          {filteredSections.length > 0 ? filteredSections.map((section) => (
            <section key={section.title} className="rounded-[var(--vlaina-radius-16px)]">
              <h3 className="px-3 pb-2 text-[var(--vlaina-font-11)] font-semibold uppercase tracking-[var(--vlaina-tracking-label-xl)] text-[var(--vlaina-color-text-soft)]">
                {section.title}
              </h3>

              <div className="space-y-1">
                {section.shortcuts.map((shortcut, index) => (
                  <div
                    key={`${section.title}-${shortcut.action}-${index}`}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors',
                      'hover:bg-[var(--vlaina-hover)]'
                    )}
                  >
                    <span className="min-w-0 flex-1 text-[var(--vlaina-font-sm)] font-medium text-[var(--vlaina-sidebar-chat-text)]">
                      {shortcut.action}
                    </span>
                    <ShortcutKeys
                      keys={shortcut.keys}
                      className="shrink-0"
                      keyClassName={shortcutKeyClassName}
                    />
                  </div>
                ))}
              </div>
            </section>
          )) : (
            <div className="px-3 py-8 text-center text-[var(--vlaina-font-13)] font-medium text-[var(--vlaina-color-text-soft)]">
              {t('shortcut.noResults')}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
