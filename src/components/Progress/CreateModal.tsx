import { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { IconPicker } from './IconPicker';
import { ItemCard } from './ItemCard';

type CreateType = 'progress' | 'counter';

interface ProgressFormData {
  title: string;
  icon?: string;
  direction: 'increment' | 'decrement';
  total: number;
  step: number;
  unit: string;
}

interface CounterFormData {
  title: string;
  icon?: string;
  step: number;
  unit: string;
  frequency: 'daily' | 'weekly' | 'monthly';
}

interface CreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreateProgress: (data: ProgressFormData) => void;
  onCreateCounter: (data: CounterFormData) => void;
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
  
  // Forms
  const [progressForm, setProgressForm] = useState<ProgressFormData>({
    title: '',
    direction: 'increment',
    total: 100,
    step: 1,
    unit: '次',
  });
  
  const [counterForm, setCounterForm] = useState<CounterFormData>({
    title: '',
    step: 1,
    unit: '次',
    frequency: 'daily',
  });

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
      setProgressForm({ title: '', direction: 'increment', total: 100, step: 1, unit: '次' });
      setCounterForm({ title: '', step: 1, unit: '次', frequency: 'daily' });
      // Reset preview state handled by the dependency effect above
    }
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleSubmit = () => {
    if (type === 'progress') {
      if (!progressForm.title.trim()) return;
      onCreateProgress({ ...progressForm, title: progressForm.title.trim(), unit: progressForm.unit.trim() || '次' });
    } else {
      if (!counterForm.title.trim()) return;
      onCreateCounter({ ...counterForm, title: counterForm.title.trim(), unit: counterForm.unit.trim() || '次' });
    }
    onClose();
  };

  // Construct Preview Item
  const previewItem: any = type === 'progress' ? {
    id: 'preview',
    type: 'progress',
    title: progressForm.title || 'Untitled',
    icon: progressForm.icon || 'Circle', // Default icon
    current: previewCurrent,
    total: progressForm.total,
    unit: progressForm.unit,
    todayCount: previewTodayCount,
    step: progressForm.step,
    direction: progressForm.direction
  } : {
    id: 'preview',
    type: 'counter',
    title: counterForm.title || 'Untitled',
    icon: counterForm.icon || 'Circle',
    current: previewCurrent,
    unit: counterForm.unit,
    todayCount: previewTodayCount,
    step: counterForm.step,
    frequency: counterForm.frequency
  };

  const isValid = type === 'progress' ? progressForm.title.trim().length > 0 : counterForm.title.trim().length > 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop - Blur & Dark */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-zinc-100/30 dark:bg-black/40 backdrop-blur-xl z-50"
            onClick={onClose}
          />

          {/* Creator Container */}
          <div className="fixed inset-0 flex flex-col items-center justify-center z-50 pointer-events-none p-6">
            
            {/* 1. Real-time Preview Section */}
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-md mb-8 pointer-events-auto"
            >
              <div className="text-center mb-4 text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
                Preview
              </div>
              <div className="transform transition-all duration-500 hover:scale-[1.02]">
                 {/* Interactive Preview */}
                 <ItemCard 
                   item={previewItem} 
                   onUpdate={handlePreviewUpdate} 
                   isDragging={false}
                 />
              </div>
            </motion.div>

            {/* 2. Controls Section */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-md bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md rounded-3xl shadow-2xl border border-white/20 dark:border-white/5 pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Type Switcher - Segmented */}
              <div className="flex p-2 bg-zinc-100/50 dark:bg-zinc-900/50 border-b border-zinc-200/50 dark:border-zinc-800/50 rounded-t-3xl">
                {(['progress', 'counter'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={`flex-1 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 ${
                      type === t
                        ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm scale-100'
                        : 'text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400 scale-95'
                    }`}
                  >
                    {t === 'progress' ? 'Progress' : 'Counter'}
                  </button>
                ))}
              </div>

              <div className="p-8 space-y-8">
                {/* Main Input: Title & Icon */}
                <div className="flex items-center gap-4">
                  <div className="shrink-0">
                     <IconPicker
                        value={type === 'progress' ? progressForm.icon : counterForm.icon}
                        onChange={(icon) => type === 'progress' 
                          ? setProgressForm({ ...progressForm, icon }) 
                          : setCounterForm({ ...counterForm, icon })
                        }
                     />
                  </div>
                  <textarea
                    value={type === 'progress' ? progressForm.title : counterForm.title}
                    onChange={(e) => type === 'progress'
                      ? setProgressForm({ ...progressForm, title: e.target.value })
                      : setCounterForm({ ...counterForm, title: e.target.value })
                    }
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
                    placeholder="What do you want to track?"
                    className="w-full bg-transparent text-2xl font-semibold text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-300 dark:placeholder:text-zinc-700 outline-none resize-none overflow-hidden min-h-[40px]"
                    rows={1}
                    autoFocus
                  />
                </div>

                {/* Natural Language Parameters */}
                <div className="text-lg text-zinc-500 dark:text-zinc-400 font-light leading-relaxed">
                  {type === 'progress' ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span>Goal is</span>
                      <InlineInput 
                        type="number"
                        value={progressForm.total}
                        onChange={(v: string) => setProgressForm({ ...progressForm, total: Number(v) })}
                        className="w-20 text-zinc-900 dark:text-zinc-100 font-medium border-b border-zinc-300 dark:border-zinc-700 focus:border-zinc-900 dark:focus:border-zinc-100"
                      />
                      <InlineInput 
                        type="text"
                        value={progressForm.unit}
                        onChange={(v: string) => setProgressForm({ ...progressForm, unit: v })}
                        className="w-16 text-zinc-900 dark:text-zinc-100 font-medium border-b border-zinc-300 dark:border-zinc-700"
                      />
                      <span>, step by</span>
                      <InlineInput 
                        type="number"
                        value={progressForm.step}
                        onChange={(v: string) => setProgressForm({ ...progressForm, step: Number(v) })}
                        className="w-12 text-zinc-900 dark:text-zinc-100 font-medium border-b border-zinc-300 dark:border-zinc-700"
                      />
                      <span>.</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <span>Track</span>
                      <InlineInput 
                        type="text"
                        value={counterForm.unit}
                        onChange={(v: string) => setCounterForm({ ...counterForm, unit: v })}
                        className="w-20 text-zinc-900 dark:text-zinc-100 font-medium border-b border-zinc-300 dark:border-zinc-700"
                      />
                      <span>, step by</span>
                      <InlineInput 
                        type="number"
                        value={counterForm.step}
                        onChange={(v: string) => setCounterForm({ ...counterForm, step: Number(v) })}
                        className="w-12 text-zinc-900 dark:text-zinc-100 font-medium border-b border-zinc-300 dark:border-zinc-700"
                      />
                      <span>every day.</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-4">
                   <button
                     onClick={onClose}
                     className="text-zinc-400 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-400 transition-colors font-medium"
                   >
                     Cancel
                   </button>
                   <button
                     onClick={handleSubmit}
                     disabled={!isValid}
                     className="h-12 px-8 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-full font-semibold shadow-lg shadow-zinc-900/10 dark:shadow-zinc-100/10 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 transition-all duration-200 flex items-center gap-2"
                   >
                     <span>Create</span>
                     <Check className="size-4" />
                   </button>
                </div>

              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

function InlineInput({ value, onChange, type, className }: any) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`bg-transparent outline-none text-center p-0 m-0 ${className}`}
    />
  );
}

