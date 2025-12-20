import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import { useModalBehavior } from './hooks/useModalBehavior';
import { useShortcutEditor } from './hooks/useShortcutEditor';
import { AboutTab } from './tabs/AboutTab';
import { AppearanceTab } from './tabs/AppearanceTab';
import { ShortcutsTab } from './tabs/ShortcutsTab';
import { StorageTab } from './tabs/StorageTab';
import { LoginDialog } from './LoginDialog';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

type SettingsTab = 'appearance' | 'shortcuts' | 'storage' | 'about';

const tabs: { id: SettingsTab; label: string }[] = [
  { id: 'about', label: 'About' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'storage', label: 'Storage' },
];

/**
 * Settings modal with tabs for About, Appearance, and Shortcuts
 */
export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('about');
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  // Shortcut editor state
  const {
    shortcuts,
    editingId,
    recordingKeys,
    startEditing,
    clearShortcut,
    handleKeyDown,
    resetState: resetShortcutState,
  } = useShortcutEditor();

  // Modal behavior (ESC, scroll lock)
  useModalBehavior({
    open,
    onClose,
    isEditing: editingId !== null,
    onCancelEdit: () => resetShortcutState(),
  });

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setActiveTab('about');
      resetShortcutState();
    }
  }, [open, resetShortcutState]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Title bar overlay - semi-transparent but doesn't block drag */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed top-0 left-0 right-0 h-9 bg-black/5 dark:bg-black/30 z-[100] pointer-events-none"
          />
          
          {/* Backdrop - starts below title bar */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed top-9 left-0 right-0 bottom-0 bg-black/5 dark:bg-black/30 z-[100]"
            onClick={onClose}
          />

          {/* Modal */}
          <div className="fixed top-9 left-0 right-0 bottom-0 flex items-center justify-center z-[100] pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="rounded-lg shadow-xl w-[700px] max-w-[90vw] h-[500px] max-h-[85vh] flex overflow-hidden pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={handleKeyDown}
              tabIndex={-1}
            >
              {/* Left Navigation */}
              <div className="w-48 border-r border-zinc-300 dark:border-zinc-700 flex flex-col bg-[#F6F6F6] dark:bg-zinc-900 rounded-l-lg">
                <nav className="flex-1 p-3 pt-4 space-y-1">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
                        activeTab === tab.id
                          ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                          : 'text-zinc-700 dark:text-zinc-300 hover:bg-white/50 dark:hover:bg-zinc-800/50'
                      }`}
                    >
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </nav>
              </div>

              {/* Right Content */}
              <div className="flex-1 flex flex-col bg-white dark:bg-zinc-900 rounded-r-lg relative">
                {/* Close Button */}
                <div className="absolute top-2 right-2 z-10">
                  <button
                    onClick={onClose}
                    className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-4">
                  {activeTab === 'about' && (
                    <AboutTab onShowLogin={() => setShowLoginDialog(true)} />
                  )}
                  {activeTab === 'appearance' && <AppearanceTab />}
                  {activeTab === 'shortcuts' && (
                    <ShortcutsTab
                      shortcuts={shortcuts}
                      editingId={editingId}
                      recordingKeys={recordingKeys}
                      onStartEditing={startEditing}
                      onClearShortcut={clearShortcut}
                      onClearRecording={() => resetShortcutState()}
                    />
                  )}
                  {activeTab === 'storage' && <StorageTab />}
                </div>
              </div>
            </motion.div>
          </div>

          {/* Login Dialog */}
          <LoginDialog
            open={showLoginDialog}
            onClose={() => setShowLoginDialog(false)}
          />
        </>
      )}
    </AnimatePresence>
  );
}
