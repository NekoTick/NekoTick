import { useState, useEffect, useRef } from 'react';
import { Check } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { IconSelectionView, getIconByName } from './IconPicker';
import { ItemCard } from './ItemCard';

const appWindow = getCurrentWindow();

type CreateType = 'progress' | 'counter';

interface ProgressFormData {
  title: string;
  icon?: string;
  direction: 'increment' | 'decrement';
  total: number;
  step: number;
  unit: string;
  resetFrequency?: 'daily' | 'weekly' | 'monthly' | 'none'; // Added resetFrequency
}

interface CounterFormData {
  title: string;
  icon?: string;
  step: number;
  unit: string;
  frequency: 'daily' | 'weekly' | 'monthly';
  resetFrequency?: 'daily' | 'weekly' | 'monthly' | 'none'; // Added resetFrequency
}

interface CreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreateProgress: (data: ProgressFormData) => void;
  onCreateCounter: (data: CounterFormData) => void; // Updated to accept resetFrequency
}

/**
 * "Immersive Creator" - WYSIWYG Design
 */
export function CreateModal({
  open,
  onClose,
  onCreateProgress,
  onCreateCounter,
}: CreateModalProps) {
  const [type, setType] = useState<CreateType>('progress');
  const [isPickingIcon, setIsPickingIcon] = useState(false);

  // Forms
  const [progressForm, setProgressForm] = useState<ProgressFormData>({
    title: '',
    direction: 'increment',
    total: 100,
    step: 1,
    unit: '次',
    resetFrequency: 'none', // Initialize resetFrequency
  });

  const [counterForm, setCounterForm] = useState<CounterFormData>({
    title: '',
    step: 1,
    unit: '次',
    frequency: 'daily',
    resetFrequency: 'none', // Initialize resetFrequency
  });
  
  // Adaptive Scaling (Direct DOM)
  const wrapperRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handleResize = () => {
       if (!wrapperRef.current) return;
       const h = window.innerHeight;
       // Target height ~700px
       const targetH = 700; 
       const s = Math.min(1, (h - 60) / targetH);
       wrapperRef.current.style.transform = `scale(${s})`;
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Preview Interaction State
  const [previewCurrent, setPreviewCurrent] = useState(0);
  const [previewTodayCount, setPreviewTodayCount] = useState(1);

  // Update preview when total changes to keep a nice visual (approx 35%)
  useEffect(() => {
    if (type === 'progress') {
      setPreviewCurrent(Math.floor(progressForm.total * 0.35));
    } else {
      setPreviewCurrent(12); // Demo starting value for counter
    }
    setPreviewTodayCount(type === 'progress' ? 1 : 3);
  }, [type, progressForm.total]);

  // Handle preview updates
  const handlePreviewUpdate = (_: string, delta: number) => {
    setPreviewTodayCount(prev => Math.max(0, prev + (delta > 0 ? 1 : -1))); // Simple simulation
    
    if (type === 'progress') {
      setPreviewCurrent(prev => Math.max(0, Math.min(progressForm.total, prev + delta)));
    } else {
      setPreviewCurrent(prev => Math.max(0, prev + delta));
    }
  };

  // Reset on open
  useEffect(() => {
    if (open) {
      setType('progress');
      setIsPickingIcon(false); // Reset picker state
      setProgressForm({ title: '', direction: 'increment', total: 100, step: 1, unit: '次', resetFrequency: 'none' }); // Reset resetFrequency
      setCounterForm({ title: '', step: 1, unit: '次', frequency: 'daily', resetFrequency: 'none' }); // Reset resetFrequency
    }
  }, [open]);

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
  }, [open, onClose, isPickingIcon]);

  const handleSubmit = () => {
    if (type === 'progress') {
      if (!progressForm.title.trim()) return;
      onCreateProgress({ ...progressForm, title: progressForm.title.trim(), unit: progressForm.unit.trim() || '次', resetFrequency: progressForm.resetFrequency }); // Pass resetFrequency
    } else {
      if (!counterForm.title.trim()) return;
      onCreateCounter({ ...counterForm, title: counterForm.title.trim(), unit: counterForm.unit.trim() || '次', resetFrequency: counterForm.resetFrequency }); // Pass resetFrequency
    }
    onClose();
  };

  // Construct Preview Item
  const previewItem: any = type === 'progress' ? {
    id: 'preview',
    type: 'progress',
    title: progressForm.title || 'Untitled',
    icon: progressForm.icon,
    current: previewCurrent,
    total: progressForm.total,
    unit: progressForm.unit,
    todayCount: previewTodayCount,
    step: progressForm.step,
    direction: progressForm.direction,
    resetFrequency: progressForm.resetFrequency, // Pass resetFrequency to preview
  } : {
    id: 'preview',
    type: 'counter',
    title: counterForm.title || 'Untitled',
    icon: counterForm.icon,
    current: previewCurrent,
    unit: counterForm.unit,
    todayCount: previewTodayCount,
    step: counterForm.step,
    frequency: counterForm.frequency
  };

  const isValid = type === 'progress' ? progressForm.title.trim().length > 0 : counterForm.title.trim().length > 0;

  // Icon Display Component for the Input area
  const DisplayIcon = previewItem.icon ? getIconByName(previewItem.icon) : null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop - Blur & Dark - Click to Close */}
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

          {/* Virtual Title Bar - Drag Zone */}
          <div 
            className="fixed top-0 inset-x-0 h-10 z-50 cursor-default"
            onMouseDown={(e) => {
              e.preventDefault();
              appWindow.startDragging();
            }}
          />

          {/* Creator Altar */}
          <div className="
            fixed inset-0 flex flex-col items-center justify-center z-50 pointer-events-none p-6
          ">
            <div ref={wrapperRef} style={{ transformOrigin: 'center center' }} className="w-full flex flex-col items-center">
            
            {/* 1. The Morphing Vision (Preview / Icon Picker) */}
            <motion.div
              layout
              initial={{ opacity: 0, y: -20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 850, damping: 35, mass: 0.5 }}
              className="w-full max-w-lg mb-12 pointer-events-auto relative z-20"
            >
              <div className="text-center mb-6 text-[10px] font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.3em] opacity-50">
                {isPickingIcon ? 'Select Totem' : 'Manifestation Preview'}
              </div>
              
              <AnimatePresence mode="wait">
                {isPickingIcon ? (
                    <motion.div
                        key="icon-picker"
                        initial={{ opacity: 0, scale: 0.9, height: 128 }}
                        animate={{ opacity: 1, scale: 1, height: "min(400px, 55vh)" }}
                        exit={{ opacity: 0, scale: 0.9, height: 128 }}
                        transition={{ type: "spring", stiffness: 850, damping: 35, mass: 0.5 }}
                        className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white/20 dark:border-white/5 overflow-hidden flex flex-col"
                        onClick={(e) => {
                            // Prevent click from propagating to the backdrop (which closes the modal)
                            e.stopPropagation(); 
                        }}
                    >
                        <div className="flex-1 overflow-hidden p-6">
                            <IconSelectionView 
                                value={type === 'progress' ? progressForm.icon : counterForm.icon}
                                onChange={(icon: string | undefined) => {
                                    // Sync icon across both forms for seamless switching
                                    setProgressForm(prev => ({ ...prev, icon }));
                                    setCounterForm(prev => ({ ...prev, icon }));
                                    setIsPickingIcon(false);
                                }}
                                onCancel={() => setIsPickingIcon(false)}
                            />
                        </div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="preview-card"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        className="transform transition-all duration-300 hover:scale-[1.02] hover:-translate-y-2 cursor-pointer"
                        onClick={() => setIsPickingIcon(true)}
                    >
                        <ItemCard 
                            item={previewItem} 
                            onUpdate={handlePreviewUpdate} 
                            isDragging={false}
                        />
                    </motion.div>
                )}
              </AnimatePresence>
            </motion.div>

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
              
              {/* Type Switcher - Minimalist (Hidden when picking icons to reduce noise) */}
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
                      // Sync title across both forms
                      setProgressForm(prev => ({ ...prev, title: val }));
                      setCounterForm(prev => ({ ...prev, title: val }));
                    }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = `${target.scrollHeight}px`;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSubmit();
                      }
                    }}
                    onFocus={() => setIsPickingIcon(false)} // Close picker when typing
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

                {/* Parameters - The Capsules (Hidden when picking icons) */}
                <motion.div 
                    className="flex flex-wrap justify-center gap-4"
                    animate={{ opacity: isPickingIcon ? 0.3 : 1, filter: isPickingIcon ? 'blur(2px)' : 'blur(0px)' }}
                >
                  {type === 'progress' ? (
                    <>
                      <CapsuleInput 
                        label="Goal"
                        value={progressForm.total}
                        onChange={(v: string) => setProgressForm({ ...progressForm, total: Number(v) })}
                        type="number"
                      />
                      <CapsuleInput 
                        label="Step"
                        value={progressForm.step}
                        onChange={(v: string) => setProgressForm({ ...progressForm, step: Number(v) })}
                        type="number"
                        width="w-20"
                      />
                      <CapsuleInput 
                        label="Unit"
                        value={progressForm.unit}
                        onChange={(v: string) => setProgressForm({ ...progressForm, unit: v })}
                        type="text"
                        width="w-24"
                      />
                      {/* New CapsuleSelector for Reset Frequency */}
                      <CapsuleSelector
                        label="Reset"
                        value={progressForm.resetFrequency || 'none'}
                        options={[
                            { label: 'None', value: 'none' },
                            { label: 'Daily', value: 'daily' },
                        ]}
                        onChange={(v: 'daily' | 'weekly' | 'monthly' | 'none') => setProgressForm({ ...progressForm, resetFrequency: v })}
                      />
                    </>
                  ) : (
                    <>
                       <CapsuleInput 
                        label="Step"
                        value={counterForm.step}
                        onChange={(v: string) => setCounterForm({ ...counterForm, step: Number(v) })}
                        type="number"
                        width="w-20"
                      />
                      <CapsuleInput 
                        label="Unit"
                        value={counterForm.unit}
                        onChange={(v: string) => setCounterForm({ ...counterForm, unit: v })}
                        type="text"
                        width="w-24"
                      />
                      {/* New CapsuleSelector for Reset Frequency */}
                      <CapsuleSelector
                        label="Reset"
                        value={counterForm.resetFrequency || 'none'}
                        options={[
                            { label: 'None', value: 'none' },
                            { label: 'Daily', value: 'daily' },
                            // Add weekly/monthly options later if needed
                        ]}
                        onChange={(v: 'daily' | 'weekly' | 'monthly' | 'none') => setCounterForm({ ...counterForm, resetFrequency: v })}
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
                     
                     {/* Button Glow */}
                     <div className="absolute inset-0 rounded-full bg-zinc-900 dark:bg-zinc-100 blur-lg opacity-0 group-hover:opacity-30 transition-opacity duration-300" />
                   </button>
                   
                   {/* Cancel (Subtle) */}
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

function CapsuleInput({ label, value, onChange, type, width = "w-28" }: any) {
  return (
    <div className={`
        relative flex flex-col items-center justify-center
        ${width} h-16 rounded-2xl
        bg-white/40 dark:bg-zinc-800/40 backdrop-blur-sm
        border border-white/20 dark:border-white/5
        shadow-sm hover:shadow-md hover:bg-white/60 dark:hover:bg-zinc-800/60
        transition-all duration-300 group
        cursor-text
    `}>
        <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-0.5 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 transition-colors">
            {label}
        </span>
        <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-transparent text-center font-medium text-lg text-zinc-800 dark:text-zinc-200 outline-none p-0"
        />
    </div>
  );
}

// New CapsuleSelector component
interface CapsuleSelectorOption {
    label: string;
    value: string;
}

interface CapsuleSelectorProps {
    label: string;
    value: string;
    options: CapsuleSelectorOption[];
    onChange: (value: any) => void;
    width?: string;
}

function CapsuleSelector({ label, value, options, onChange, width = "w-28" }: CapsuleSelectorProps) {
    const selectedOption = options.find(o => o.value === value) || options[0];

    const handleClick = () => {
        const currentIndex = options.findIndex(o => o.value === value);
        const nextIndex = (currentIndex + 1) % options.length;
        onChange(options[nextIndex].value);
    };

    return (
        <div 
            className={`
                relative flex flex-col items-center justify-center
                ${width} h-16 rounded-2xl
                bg-white/40 dark:bg-zinc-800/40 backdrop-blur-sm
                border border-white/20 dark:border-white/5
                shadow-sm hover:shadow-md hover:bg-white/60 dark:hover:bg-zinc-800/60
                transition-all duration-300 group
                cursor-pointer select-none
            `}
            onClick={handleClick}
        >
            <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-0.5 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 transition-colors">
                {label}
            </span>
            <span className="w-full bg-transparent text-center font-medium text-lg text-zinc-800 dark:text-zinc-200 outline-none p-0">
                {selectedOption.label}
            </span>
        </div>
    );
}

