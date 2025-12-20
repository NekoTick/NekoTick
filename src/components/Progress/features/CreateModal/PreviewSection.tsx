import { motion, AnimatePresence } from 'framer-motion';
import { IconSelectionView } from '../IconPicker';
import { ItemCard } from '../ItemCard';
import { CreateType, ProgressFormData, CounterFormData } from './types';

interface PreviewSectionProps {
  isPickingIcon: boolean;
  setIsPickingIcon: (v: boolean) => void;
  type: CreateType;
  progressForm: ProgressFormData;
  counterForm: CounterFormData;
  setProgressForm: (f: any) => void; // Using setter pattern
  setCounterForm: (f: any) => void;
  previewItem: any;
  handlePreviewUpdate: (id: string, delta: number) => void;
}

export function PreviewSection({
  isPickingIcon,
  setIsPickingIcon,
  type,
  progressForm,
  counterForm,
  setProgressForm,
  setCounterForm,
  previewItem,
  handlePreviewUpdate
}: PreviewSectionProps) {
  return (
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
                    e.stopPropagation(); 
                }}
            >
                <div className="flex-1 overflow-hidden p-6">
                    <IconSelectionView 
                        value={type === 'progress' ? progressForm.icon : counterForm.icon}
                        onChange={(icon: string | undefined) => {
                            // Sync icon across both forms
                            setProgressForm((prev: ProgressFormData) => ({ ...prev, icon }));
                            setCounterForm((prev: CounterFormData) => ({ ...prev, icon }));
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
            >
                <ItemCard 
                    item={previewItem} 
                    onUpdate={handlePreviewUpdate} 
                    onClick={() => setIsPickingIcon(true)}
                    onAutoArchive={() => {
                        // "Rebirth" Logic: Reset preview after shatter
                        setTimeout(() => {
                           handlePreviewUpdate('preview', -previewItem.total); // Reset to 0
                        }, 800);
                    }}
                    isDragging={false}
                />
            </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
