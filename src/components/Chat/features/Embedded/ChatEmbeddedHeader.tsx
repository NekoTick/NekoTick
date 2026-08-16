import { ModelSelector } from '@/components/Chat/features/Input/ModelSelector';
import { ghostIconButtonClass, raisedPillSurfaceClass } from '@/components/ui/surfaceStyles';
import { TemporaryChatToggle } from '@/components/Chat/features/Temporary/TemporaryChatToggle';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { themeIconTokens, themeStyleResetTokens } from '@/styles/themeTokens';

export function ChatEmbeddedHeader(props: {
  onCloseEmbeddedPanel?: () => void;
  onOpenEmbeddedSidebar: () => void;
  onPromoteEmbeddedPanel?: () => void;
  showEmbeddedTemporaryToggle: boolean;
  showInTitleBar: boolean;
}) {
  const {
    onCloseEmbeddedPanel,
    onOpenEmbeddedSidebar,
    onPromoteEmbeddedPanel,
    showEmbeddedTemporaryToggle,
    showInTitleBar,
  } = props;
  const { t } = useI18n();

  return (
    <div className="relative z-[var(--vlaina-z-20)] flex h-10 flex-none items-center gap-2 bg-transparent px-3">
      <button
        type="button"
        aria-label={t('chat.openChatSidebar')}
        onPointerDown={(event) => {
          event.preventDefault();
          onOpenEmbeddedSidebar();
        }}
        className={cn(
          "group flex h-8 w-8 cursor-pointer items-center justify-center text-[var(--vlaina-sidebar-chat-text)]",
          ghostIconButtonClass
        )}
      >
        {/* Sidebar glyph adapted from Lucide Icons (ISC). */}
        <svg
          aria-hidden="true"
          focusable="false"
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          fill={themeStyleResetTokens.fillNone}
          viewBox={themeIconTokens.viewBoxDefault}
          stroke={themeStyleResetTokens.currentColor}
          strokeWidth={themeIconTokens.strokeDefault}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="lucide lucide-text-align-start-icon lucide-text-align-start size-5 group-hover:hidden"
        >
          <path d="M21 5H3" />
          <path d="M15 12H3" />
          <path d="M17 19H3" />
        </svg>
        <Icon name="nav.expand" size="titlebarToggle" className="hidden group-hover:block" />
      </button>

      <div className="min-w-0">
        <ModelSelector
          dropdownPlacement="bottom"
          dropdownAlign="right"
          isEmbedded
        />
      </div>

      <div className="ml-auto flex h-8 items-center gap-1">
        {showEmbeddedTemporaryToggle && (
          <TemporaryChatToggle mode={showInTitleBar ? 'promote' : 'toggle'} />
        )}
        {onPromoteEmbeddedPanel && (
          <button
            type="button"
            aria-label={t('notes.rightChat')}
            onPointerDown={(event) => {
              event.preventDefault();
              onPromoteEmbeddedPanel();
            }}
            className={cn(
              "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-[var(--vlaina-sidebar-chat-text)] transition-colors hover:text-[var(--vlaina-accent)]",
              raisedPillSurfaceClass
            )}
          >
            <Icon name="nav.panelRight" size="md" />
          </button>
        )}
        {onCloseEmbeddedPanel && (
          <button
            type="button"
            aria-label={t('chat.closeChatPanel')}
            onPointerDown={(event) => {
              event.preventDefault();
              onCloseEmbeddedPanel();
            }}
            className={cn(
              "flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-[var(--vlaina-sidebar-chat-text)] transition-colors hover:text-[var(--vlaina-sidebar-row-selected-text)]",
              raisedPillSurfaceClass
            )}
          >
            <Icon name="nav.chevronRight" size="md" />
          </button>
        )}
      </div>
    </div>
  );
}
