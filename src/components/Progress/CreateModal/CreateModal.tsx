import { useRef, useEffect } from 'react';
import { Check } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getIconByName } from '../IconPicker';
import { CapsuleInput, CapsuleSelector } from './FormInputs';
import { useCreateForm } from './useCreateForm';
import { PreviewSection } from './PreviewSection';
import { CreateModalProps } from './types';

const appWindow = getCurrentWindow();

export function CreateModal({
  open,
  onClose,
  onCreateProgress,
  onCreateCounter,
}: CreateModalProps) {
  const {
    type, setType,
    isPickingIcon, setIsPickingIcon,
    progressForm, setProgressForm,
    counterForm, setCounterForm,
    previewItem, handlePreviewUpdate,
    handleSubmit, isValid
  } = useCreateForm(open, onCreateProgress, onCreateCounter, onClose);
  
  // Adaptive Scaling
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleResize = () => {
       if (!wrapperRef.current) return;
       const h = window.innerHeight;
       const targetH = 700; 
       const s = Math.min(1, (h - 60) / targetH);
       wrapperRef.current.style.transform = `scale(${s})`;
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
         if (isPickingIcon) setIsPickingIcon(false);
         else onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose, isPickingIcon, setIsPickingIcon]);

  // Icon for Input Button
  const DisplayIcon = previewItem.icon ? getIconByName(previewItem.icon) : null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed -inset-[50%] bg-zinc-100/60 dark:bg-black/60 backdrop-blur-2xl z-50"
            onClick={() => {
              if (isPickingIcon) {
                setIsPickingIcon(false);
              } else {
                onClose();
              }
            }}
          />

          {/* Virtual Title Bar */}
          <div 
            className="fixed top-0 inset-x-0 h-10 z-50 cursor-default"
            onMouseDown={(e) => {
              e.preventDefault();
              appWindow.startDragging();
            }}
          />

          {/* Creator Altar */}
          <div className="fixed inset-0 flex flex-col items-center justify-center z-50 pointer-events-none p-6">
            <div ref={wrapperRef} style={{ transformOrigin: 'center center' }} className="w-full flex flex-col items-center">
            
            {/* 1. Preview Section */}
            <PreviewSection 
                isPickingIcon={isPickingIcon}
                setIsPickingIcon={setIsPickingIcon}
                type={type}
                progressForm={progressForm}
                counterForm={counterForm}
                setProgressForm={setProgressForm}
                setCounterForm={setCounterForm}
                previewItem={previewItem}
                handlePreviewUpdate={handlePreviewUpdate}
            />

            {/* 2. The Input Ritual */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="w-full max-w-lg pointer-events-auto relative z-10"
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) {
                    appWindow.startDragging();
                }
              }}
            >
              
              {/* Type Switcher */}
              <motion.div 
                className="flex justify-center gap-8 mb-8"
                animate={{ opacity: isPickingIcon ? 0 : 1, pointerEvents: isPickingIcon ? 'none' : 'auto' }}
              >
                {(['progress', 'counter'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`relative px-4 py-2 text-sm font-medium transition-all duration-300 ${
                      type === t
                        ? 'text-zinc-900 dark:text-zinc-100'
                        : 'text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400'
                    }`}
                  >
                    {t === 'progress' ? 'Journey' : 'Counter'}
                    {type === t && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-zinc-900 dark:bg-zinc-100"
                      />
                    )}
                  </button>
                ))}
              </motion.div>

              <div className="flex flex-col items-center gap-6">
                {/* Main Input Group */}
                <div className="w-full relative group flex flex-row items-center justify-center gap-4 px-8">
                  
                  {/* Trigger Button - Totem */}
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setIsPickingIcon(!isPickingIcon)}
                    className={`
                        shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300
                        ${isPickingIcon 
                            ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-xl' 
                            : 'bg-white/40 dark:bg-zinc-800/40 text-zinc-400 dark:text-zinc-500 hover:bg-white/60 dark:hover:bg-zinc-800/60 hover:shadow-md'
                        }
                    `}
                  >
                     {DisplayIcon ? (
                         <DisplayIcon className="size-6" weight="duotone" />
                     ) : (
                         <div className="text-2xl font-light opacity-50">+</div>
                     )}
                  </motion.button>

                  <textarea
                    value={type === 'progress' ? progressForm.title : counterForm.title}
                    onChange={(e) => {
                      const val = e.target.value;
                      setProgressForm((prev: any) => ({ ...prev, title: val }));
                      setCounterForm((prev: any) => ({ ...prev, title: val }));
                    }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = `${target.scrollHeight}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.currentTarget.blur(); // Force blur to prevent rapid re-fire
                        handleSubmit();
                      }
                    }}
                    onFocus={() => setIsPickingIcon(false)}
                    placeholder="Name your goal..."
                    className="
                        bg-transparent text-center text-3xl font-light 
                        text-zinc-900 dark:text-zinc-100 
                        placeholder:text-zinc-300/50 dark:placeholder:text-zinc-700/50 
                        outline-none resize-none overflow-hidden min-h-[40px]
                        selection:bg-zinc-200 dark:selection:bg-zinc-800
                        flex-1 py-2
                    "
                    rows={1}
                    autoFocus
                  />
                </div>

                {/* Parameters */}
                <motion.div 
                    className="flex flex-wrap justify-center gap-4"
                    animate={{ opacity: isPickingIcon ? 0.3 : 1, filter: isPickingIcon ? 'blur(2px)' : 'blur(0px)' }}
                >
                  {type === 'progress' ? (
                    <>
                      <CapsuleInput 
                        label="Goal"
                        value={progressForm.total}
                        onChange={(v: string) => setProgressForm((prev: any) => ({ ...prev, total: Number(v) }))}
                        type="number"
                      />
                      <CapsuleInput 
                        label="Step"
                        value={progressForm.step}
                        onChange={(v: string) => setProgressForm((prev: any) => ({ ...prev, step: Number(v) }))}
                        type="number"
                        width="w-20"
                      />
                      <CapsuleInput 
                        label="Unit"
                        value={progressForm.unit}
                        onChange={(v: string) => setProgressForm((prev: any) => ({ ...prev, unit: v }))}
                        type="text"
                        width="w-24"
                      />
                      <CapsuleSelector
                        label="Reset"
                        value={progressForm.resetFrequency || 'none'}
                        options={[
                            { label: 'None', value: 'none' },
                            { label: 'Daily', value: 'daily' },
                        ]}
                        onChange={(v: 'daily' | 'weekly' | 'monthly' | 'none') => setProgressForm((prev: any) => ({ ...prev, resetFrequency: v }))}
                      />
                    </>
                  ) : (
                    <>
                       <CapsuleInput 
                        label="Step"
                        value={counterForm.step}
                        onChange={(v: string) => setCounterForm((prev: any) => ({ ...prev, step: Number(v) }))}
                        type="number"
                        width="w-20"
                      />
                      <CapsuleInput 
                        label="Unit"
                        value={counterForm.unit}
                        onChange={(v: string) => setCounterForm((prev: any) => ({ ...prev, unit: v }))}
                        type="text"
                        width="w-24"
                      />
                      <CapsuleSelector
                        label="Reset"
                        value={counterForm.resetFrequency || 'none'}
                        options={[
                            { label: 'None', value: 'none' },
                            { label: 'Daily', value: 'daily' },
                        ]}
                        onChange={(v: 'daily' | 'weekly' | 'monthly' | 'none') => setCounterForm((prev: any) => ({ ...prev, resetFrequency: v }))}
                      />
                    </>
                  )}
                </motion.div>

                {/* Launch Button */}
                <div className="pt-8">
                   <button
                     onClick={handleSubmit}
                     disabled={!isValid}
                     className="
                        group relative px-10 py-4 rounded-full
                        bg-zinc-900 dark:bg-zinc-100 
                        text-white dark:text-zinc-900 
                        font-medium tracking-wide
                        shadow-[0_10px_20px_-5px_rgba(0,0,0,0.15)]
                        hover:scale-105 active:scale-95 
                        disabled:opacity-0 disabled:scale-90
                        transition-all duration-300 ease-out
                     "
                   >
                     <span className="relative z-10 flex items-center gap-2">
                       Begin Journey
                       <Check weight="bold" className="size-4 opacity-50 group-hover:opacity-100 transition-opacity" />
                     </span>
                     
                     <div className="absolute inset-0 rounded-full bg-zinc-900 dark:bg-zinc-100 blur-lg opacity-0 group-hover:opacity-30 transition-opacity duration-300" />
                   </button>
                   
                   <button
                     onClick={onClose}
                     className="absolute bottom-8 right-0 text-xs font-medium text-zinc-300 hover:text-zinc-500 dark:text-zinc-700 dark:hover:text-zinc-500 transition-colors uppercase tracking-widest"
                   >
                     Cancel
                   </button>
                </div>

              </div>
            </motion.div>
            </div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
