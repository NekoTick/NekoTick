import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNotesRootStore } from '@/stores/useNotesRootStore';
import { openDialog, hasNativeDialogs } from '@/lib/storage/dialog';
import { joinPath, isWeb } from '@/lib/storage/adapter';
import { BlurBackdrop } from '@/components/common/BlurBackdrop';
import { useI18n } from '@/lib/i18n';
import { normalizeUserFacingErrorMessage } from '@/lib/i18n/userFacingErrors';
import { themeBackdropTokens, themeDomStyleTokens, themeMotionTokens } from '@/styles/themeTokens';
import { requestNativeCaretOverlayRefresh } from '@/hooks/useNativeCaretOverlay';

interface CreateNotesRootModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateNotesRootModal({ isOpen, onClose }: CreateNotesRootModalProps) {
  const { t } = useI18n();
  const createNotesRoot = useNotesRootStore((state) => state.createNotesRoot);
  const isLoading = useNotesRootStore((state) => state.isLoading);
  const error = useNotesRootStore((state) => state.error);
  const clearError = useNotesRootStore((state) => state.clearError);
  const [name, setName] = useState('');
  const [parentPath, setParentPath] = useState('');
  const pathInputRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);
  const isWebPlatform = isWeb();

  useEffect(() => {
    if (isOpen) {
      setName('');
      setParentPath(isWebPlatform ? '/notes-roots' : '');
      clearError();
    }
  }, [isOpen, clearError, isWebPlatform]);

  useEffect(() => {
    if (pathInputRef.current && document.activeElement !== pathInputRef.current) {
      pathInputRef.current.scrollLeft = pathInputRef.current.scrollWidth;
    }
  }, [parentPath, isOpen]);

  const handleBrowse = async () => {
    if (!hasNativeDialogs()) {
      pathInputRef.current?.focus();
      return;
    }

    const selected = await openDialog({
      directory: true,
      multiple: false,
      title: t('notesRoot.selectParentFolderTitle'),
    });

    if (selected && typeof selected === 'string') {
      setParentPath(selected);
      requestAnimationFrame(() => {
        if (pathInputRef.current) {
          pathInputRef.current.focus();
          pathInputRef.current.scrollLeft = pathInputRef.current.scrollWidth;
        }
      });
    }
  };

  const handleCreate = async () => {
    if (isComposingRef.current) return;
    if (!name.trim() || !parentPath.trim()) return;

    const notesRootPath = await joinPath(parentPath.trim(), name.trim());
    const success = await createNotesRoot(name.trim(), notesRootPath);
    if (success) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const native = e.nativeEvent as KeyboardEvent & { isComposing?: boolean; keyCode?: number };
    if (native.isComposing || native.keyCode === 229 || isComposingRef.current) {
      return;
    }

    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'Enter' && name.trim() && parentPath.trim()) {
      handleCreate();
    }
  };

  const canCreate = name.trim() && parentPath.trim() && !isLoading;
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <BlurBackdrop
            onClick={onClose}
            overlayClassName="bg-[var(--vlaina-color-backdrop-soft)]"
            zIndex={themeBackdropTokens.createNotesRootZIndex}
            blurPx={themeBackdropTokens.createNotesRootBlurPx}
            duration={themeBackdropTokens.createNotesRootDurationSeconds}
          />
          <div
            className="fixed inset-0 z-[var(--vlaina-z-modal-max)] flex items-center justify-center"
            onKeyDown={handleKeyDown}
          >
            <motion.div
              className="notes-root-modal"
              onClick={(e) => e.stopPropagation()}
              initial={{
                opacity: themeMotionTokens.opacityHidden,
                scale: themeMotionTokens.notesRootModalInitialScale,
                y: themeMotionTokens.notesRootModalY,
              }}
              animate={{
                opacity: themeMotionTokens.opacityVisible,
                scale: themeMotionTokens.notesRootModalVisibleScale,
                y: themeMotionTokens.notesRootModalVisibleY,
              }}
              exit={{
                opacity: themeMotionTokens.opacityHidden,
                scale: themeMotionTokens.notesRootModalInitialScale,
                y: themeMotionTokens.notesRootModalY,
              }}
              transition={{
                duration: themeMotionTokens.notesRootModalDuration,
                ease: themeMotionTokens.notesRootModalEase,
              }}
              onUpdate={() => queueMicrotask(requestNativeCaretOverlayRefresh)}
              onAnimationComplete={requestNativeCaretOverlayRefresh}
            >
              <h2 className="notes-root-modal__title">{t('notesRoot.createNewNotesRoot')}</h2>

              <div className="notes-root-modal__field">
                <label className="notes-root-modal__label">{t('notesRoot.name')}</label>
                <input
                  type="text"
                  spellCheck={false}
                  className="notes-root-modal__input"
                  placeholder={t('notesRoot.myNotesPlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onCompositionStart={() => {
                    isComposingRef.current = true;
                  }}
                  onCompositionEnd={() => {
                    isComposingRef.current = false;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Tab' && !e.shiftKey && !parentPath && hasNativeDialogs()) {
                      e.preventDefault();
                      pathInputRef.current?.focus();
                      handleBrowse();
                    }
                  }}
                  autoFocus
                />
              </div>

              <div className="notes-root-modal__field">
                <label className="notes-root-modal__label">
                  {isWebPlatform ? t('notesRoot.path') : t('notesRoot.parentFolder')}
                </label>
                <div className="notes-root-modal__path-input">
                  <input
                    ref={pathInputRef}
                    type="text"
                    spellCheck={false}
                    className="notes-root-modal__input"
                    placeholder={isWebPlatform ? t('notesRoot.pathPlaceholder') : t('notesRoot.selectFolderPlaceholder')}
                    value={parentPath}
                    onChange={(e) => setParentPath(e.target.value)}
                    onCompositionStart={() => {
                      isComposingRef.current = true;
                    }}
                    onCompositionEnd={() => {
                      isComposingRef.current = false;
                    }}
                    onBlur={(e) => {
                      const target = e.target;
                      requestAnimationFrame(() => {
                        target.scrollLeft = target.scrollWidth;
                      });
                    }}
                    title={parentPath}
                    onClick={() => !parentPath && !isWebPlatform && handleBrowse()}
                    readOnly={!parentPath && !isWebPlatform}
                    style={{
                      cursor: !parentPath && !isWebPlatform
                        ? themeDomStyleTokens.cursorPointer
                        : themeDomStyleTokens.cursorText,
                    }}
                  />
                  {hasNativeDialogs() && (
                    <button className="notes-root-modal__browse-btn" onClick={handleBrowse}>
                      {t('common.browse')}
                    </button>
                  )}
                </div>
                {isWebPlatform && (
                  <p className="notes-root-modal__hint">
                    {t('notesRoot.localStorageHint')}
                  </p>
                )}
              </div>

              {error && <div className="notes-root-modal__error">{normalizeUserFacingErrorMessage(error)}</div>}

              <div className="notes-root-modal__actions">
                <button className="notes-root-modal__btn notes-root-modal__btn--cancel" onClick={onClose}>
                  {t('common.cancel')}
                </button>

                <button
                  className="notes-root-modal__btn notes-root-modal__btn--create"
                  onClick={handleCreate}
                  disabled={!canCreate}
                >
                  {isLoading ? t('common.creating') : t('notesRoot.createNotesRoot')}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
