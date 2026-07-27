import { useRef } from 'react';
import { motion } from 'framer-motion';
import { ChatSidebar } from '@/components/Chat/features/Sidebar/ChatSidebar';
import { useChatModalFocus } from '@/components/Chat/hooks/useChatModalFocus';
import { useI18n } from '@/lib/i18n';
import { themeChatLayoutTokens, themeMotionTokens } from '@/styles/themeTokens';

export function ChatEmbeddedSidebarOverlay(props: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { isOpen, onClose } = props;
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useChatModalFocus({
    modalRef: dialogRef,
    onClose,
    open: isOpen,
    restoreFocus: false,
  });

  return (
    <div
      className="absolute inset-0 z-[var(--vlaina-z-40)]"
      aria-hidden={!isOpen}
      onMouseDownCapture={(event) => event.stopPropagation()}
    >
      <motion.button
        type="button"
        aria-label={t('chat.closeChatSidebar')}
        className="absolute inset-0 h-full w-full bg-[var(--vlaina-color-overlay-weak)]"
        initial={{ opacity: themeMotionTokens.opacityHidden }}
        animate={{ opacity: themeMotionTokens.opacityVisible }}
        exit={{ opacity: themeMotionTokens.opacityHidden }}
        transition={{
          duration: themeMotionTokens.chatEmbeddedOverlayDuration,
          ease: themeMotionTokens.standardEase,
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          onClose();
        }}
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('app.viewChat')}
        tabIndex={-1}
        className="relative h-full transform-gpu overflow-hidden rounded-r-[var(--vlaina-chat-embedded-sidebar-radius)] shadow-[var(--vlaina-shadow-none)] outline-none will-change-transform"
        style={{ width: themeChatLayoutTokens.embeddedSidebarWidth }}
        initial={{ x: themeMotionTokens.chatEmbeddedSidebarHiddenX }}
        animate={{ x: themeMotionTokens.chatEmbeddedSidebarVisibleX }}
        exit={{ x: themeMotionTokens.chatEmbeddedSidebarHiddenX }}
        transition={{
          type: 'spring',
          stiffness: themeMotionTokens.chatEmbeddedSidebarSpringStiffness,
          damping: themeMotionTokens.chatEmbeddedSidebarSpringDamping,
          mass: themeMotionTokens.chatEmbeddedSidebarSpringMass,
        }}
      >
        <ChatSidebar embedded onRequestClose={onClose} />
      </motion.div>
    </div>
  );
}
