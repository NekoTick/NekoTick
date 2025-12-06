import { useState, useEffect, useRef } from 'react';
import { X, Trash2, Activity, Calendar, Zap, Target, Footprints, Tag, Plus, Minus, Check, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ProgressOrCounter } from '@/stores/useProgressStore';
import { IconSelectionView, getIconByName } from './IconPicker';

interface DetailModalProps {
  item: ProgressOrCounter | null;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<ProgressOrCounter>) => void;
  onDelete: (id: string) => void;
  onPreviewChange?: (icon?: string, title?: string) => void;
}

/**
 * "Liquid Detail" - Immersive Control Deck
 */
export function DetailModal({ item, onClose, onUpdate, onDelete, onPreviewChange }: DetailModalProps) {
  const [title, setTitle] = useState('');
  const [icon, setIcon] = useState<string | undefined>();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingNumber, setIsEditingNumber] = useState(false);
  const [isPickingIcon, setIsPickingIcon] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Sync item data
  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setIcon(item.icon);
    }
  }, [item]);

  // Real-time preview sync
  useEffect(() => {
    if (item && onPreviewChange) {
      onPreviewChange(icon, title);
    }
  }, [icon, title, onPreviewChange]);

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [isEditingTitle]);

  const handleClose = () => {
    onPreviewChange?.(undefined, undefined);
    onClose();
    setIsEditingTitle(false);
    setIsPickingIcon(false);
  };

  const handleSave = () => {
    if (!item || !title.trim()) return;
    onUpdate(item.id, { title: title.trim(), icon });
    handleClose();
  };

  const handleIconChange = (newIcon: string | undefined) => {
    setIcon(newIcon);
    if (item) {
      onUpdate(item.id, { icon: newIcon });
    }
    setIsPickingIcon(false);
  };

  const handleDelete = () => {
    if (!item) return;
    onDelete(item.id);
    handleClose();
  };

  // Update helper
  const updateValue = (key: keyof ProgressOrCounter, value: any) => {
    if (!item) return;
    onUpdate(item.id, { [key]: value });
  };

  // Quick increment/decrement
  const handleQuickUpdate = (delta: number) => {
    if (!item) return;
    const step = item.type === 'progress' 
      ? (item.direction === 'increment' ? item.step : -item.step)
      : item.step;
    
    let newValue = item.current + (step * delta);
    if (item.type === 'progress') {
        newValue = Math.max(0, Math.min(item.total, newValue));
    } else {
        newValue = Math.max(0, newValue);
    }
    updateValue('current', newValue);
  };

  // Stats calculation
  const stats = item ? getStats(item) : null;
  const DisplayIcon = icon ? getIconByName(icon) : null;

  return (
    <AnimatePresence>
      {item && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-zinc-100/80 dark:bg-black/80 backdrop-blur-md z-50"
            onClick={handleSave}
          />

          {/* Modal - Levitating Control Deck */}
          <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
              className="bg-white dark:bg-zinc-900 rounded-[2rem] shadow-2xl w-[420px] max-w-full max-h-[85vh] pointer-events-auto overflow-hidden relative flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top Bar */}
              <div className="absolute top-5 right-5 z-20 flex gap-2">
                 <button
                  onClick={handleDelete}
                  className="p-2 rounded-full text-zinc-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="size-4" />
                </button>
                <button
                  onClick={handleSave}
                  className="p-2 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:scale-105 transition-all"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* --- Section 1: Identity --- */}
              <div className="pt-10 px-8 flex flex-col items-center relative shrink-0">
                 {/* Icon Trigger */}
                 <div className="relative mb-4 group">
                   <button 
                     onClick={() => setIsPickingIcon(true)}
                     className="size-16 rounded-2xl bg-zinc-50 dark:bg-zinc-800 flex items-center justify-center shadow-sm hover:scale-105 transition-transform duration-300 cursor-pointer ring-1 ring-zinc-100 dark:ring-zinc-700 group-hover:ring-zinc-200 dark:group-hover:ring-zinc-600"
                   >
                      {DisplayIcon ? (
                        <DisplayIcon className="size-7 text-zinc-700 dark:text-zinc-300 transition-colors group-hover:text-zinc-900 dark:group-hover:text-zinc-100" strokeWidth={1.5} />
                      ) : (
                        <div className="size-6 rounded-full border-2 border-dashed border-zinc-300 dark:border-zinc-600" />
                      )}
                   </button>
                 </div>

                 {/* Title */}
                 <div className="relative w-full flex justify-center">
                    {isEditingTitle ? (
                      <input
                        ref={titleInputRef}
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={handleTitleBlur}
                        onKeyDown={(e) => e.key === 'Enter' && handleTitleBlur()}
                        className="w-full text-center text-xl font-semibold bg-transparent border-b-2 border-zinc-900 dark:border-zinc-100 outline-none text-zinc-900 dark:text-zinc-100 pb-1"
                      />
                    ) : (
                      <h2 
                        onClick={() => setIsEditingTitle(true)}
                        className="text-xl font-semibold text-zinc-900 dark:text-zinc-100 cursor-text hover:opacity-70 transition-opacity pb-1 border-b-2 border-transparent"
                      >
                        {title}
                      </h2>
                    )}
                 </div>
              </div>

              {/* --- Section 2: Control Deck --- */}
              <div className="py-8 px-4 flex flex-col items-center justify-center shrink-0 relative">
                 {/* Background Ambience */}
                 <div className="absolute inset-0 bg-gradient-to-b from-zinc-50/50 to-transparent dark:from-zinc-800/20 pointer-events-none" />

                 {/* The Big Number */}
                 <div className="flex items-center justify-center gap-6 relative z-10 h-20">
                    {/* Minus Button */}
                    <AnimatePresence>
                      {!isEditingNumber && (
                        <motion.button 
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.2 }}
                          onClick={() => handleQuickUpdate(-1)}
                          className="p-3 rounded-full text-zinc-300 hover:text-zinc-600 hover:bg-zinc-100 dark:text-zinc-600 dark:hover:text-zinc-300 dark:hover:bg-zinc-800 transition-colors active:scale-90"
                        >
                          <Minus className="size-6" strokeWidth={2.5} />
                        </motion.button>
                      )}
                    </AnimatePresence>

                    <EditableBigNumber 
                      value={item.current} 
                      onSave={(val) => updateValue('current', val)} 
                      isEditing={isEditingNumber}
                      setIsEditing={setIsEditingNumber}
                    />

                    {/* Plus Button */}
                    <AnimatePresence>
                      {!isEditingNumber && (
                        <motion.button 
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.2 }}
                          onClick={() => handleQuickUpdate(1)}
                          className="p-3 rounded-full text-zinc-300 hover:text-zinc-600 hover:bg-zinc-100 dark:text-zinc-600 dark:hover:text-zinc-300 dark:hover:bg-zinc-800 transition-colors active:scale-90"
                        >
                          <Plus className="size-6" strokeWidth={2.5} />
                        </motion.button>
                      )}
                    </AnimatePresence>
                 </div>

                 {/* Parameter Pills */}
                 <motion.div 
                   layout 
                   layoutRoot 
                   className="flex items-center gap-3 mt-6 relative z-10"
                 >
                    {item.type === 'progress' && (
                      <EditablePill 
                        icon={<Target className="size-3" />}
                        label="Target"
                        value={item.total}
                        onSave={(val) => updateValue('total' as keyof ProgressOrCounter, val)}
                      />
                    )}
                    <EditablePill 
                      icon={<Footprints className="size-3" />}
                      label="Step"
                      value={item.step}
                      onSave={(val) => updateValue('step', val)}
                    />
                    <EditablePill 
                      icon={<Tag className="size-3" />}
                      label="Unit"
                      value={item.unit}
                      isText
                      onSave={(val) => updateValue('unit', val)}
                    />
                 </motion.div>
              </div>

              {/* --- Section 3: Insights --- */}
              {stats && (
                <div className="flex-1 overflow-y-auto px-8 pb-8 scrollbar-hide">
                  <div className="grid grid-cols-3 gap-3 mb-6">
                    <StatItem label="Total" value={stats.totalOps} icon={<Activity className="size-3" />} />
                    <StatItem label="Streak" value={stats.streak} icon={<Zap className="size-3" />} highlight={stats.streak > 2} />
                    <StatItem label="Active" value={stats.activeDays} icon={<Calendar className="size-3" />} />
                  </div>

                  {/* Activity Flow */}
                  <div className="space-y-3 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">
                        Activity Flow
                      </span>
                    </div>
                    <HeatMap history={item.history || {}} />
                  </div>
                  
                  {/* Creation Date */}
                  <div className="mt-6 text-center">
                    <span className="text-[10px] text-zinc-300 dark:text-zinc-600 font-medium">
                      Started on {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              )}

              {/* --- Full Screen Icon Picker Overlay --- */}
              <AnimatePresence>
                {isPickingIcon && (
                  <motion.div
                    initial={{ opacity: 0, y: '100%' }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: '100%' }}
                    transition={{ type: "spring", damping: 30, stiffness: 300 }}
                    className="absolute inset-0 z-50 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl flex flex-col p-6"
                  >
                    {/* Back Button */}
                    <div className="flex items-center mb-4 shrink-0">
                      <button
                        onClick={() => setIsPickingIcon(false)}
                        className="flex items-center gap-2 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
                      >
                        <ChevronLeft className="size-4" />
                        Back to Details
                      </button>
                    </div>
                    
                    {/* The Picker Grid */}
                    <div className="flex-1 overflow-hidden">
                      <IconSelectionView 
                        value={icon} 
                        onChange={handleIconChange} 
                        onCancel={() => setIsPickingIcon(false)}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </motion.div>
          </div>
        </> 
      )}
    </AnimatePresence>
  );
}

/* --- Sub-components for Liquid Detail --- */

function EditableBigNumber({ 
  value, 
  onSave, 
  isEditing, 
  setIsEditing 
}: { 
  value: number, 
  onSave: (val: number) => void,
  isEditing: boolean,
  setIsEditing: (val: boolean) => void
}) {
  const [tempVal, setTempVal] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync only when NOT editing to avoid fighting with user input
  useEffect(() => {
    if (!isEditing) {
      setTempVal(value.toString());
    }
  }, [value, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleCancel = () => {
    setIsEditing(false);
    setTempVal(value.toString()); // Revert
  };

  const handleConfirm = () => {
    const num = parseInt(tempVal, 10);
    if (!isNaN(num)) {
      onSave(num);
      setIsEditing(false);
    } else {
      setTempVal(value.toString()); // Revert if invalid
      setIsEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') handleCancel();
  };

  // Important: We use onBlur to CANCEL, not save. 
  // But we need to be careful: clicking the "Check" button will trigger blur on input first.
  // Solution: Use mousedown on the check button to prevent blur, OR don't use onBlur for cancel directly.
  // A common pattern: Clicking outside closes. But clicking the button is "outside" the input.
  // We can use a small timeout or rely on the fact that if we click the button, the action fires.
  // Actually, the cleanest way for "Click Outside = Cancel" is using a transparent backdrop or a hook.
  // For simplicity here, let's try: onBlur cancels, BUT clicking the check button works because we use onMouseDown which fires before blur.
  
  const handleInputBlur = () => {
    // Small delay to allow button click to register if that was the target
    // But actually, if we use onMouseDown for the button, it prevents focus loss? No.
    // Standard "Click outside" logic is best.
    // Let's just simply auto-revert on blur for now.
    // To allow clicking the check button, we need the check button to be PART of the focus group or handle it carefully.
    // Hack: onMouseDown={(e) => e.preventDefault()} on the button prevents the input from losing focus!
    handleCancel();
  };

  if (isEditing) {
    return (
      <div className="flex items-center relative">
        <input
          ref={inputRef}
          type="number"
          value={tempVal}
          onChange={(e) => setTempVal(e.target.value)}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          className="
            w-32 text-center text-5xl font-light tracking-tighter 
            bg-transparent outline-none border-none p-0 m-0 tabular-nums
            text-zinc-900 dark:text-zinc-50 
            caret-zinc-900 dark:caret-zinc-100
            selection:bg-zinc-200 dark:selection:bg-zinc-700
            [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
          "
        />
        {/* Floating Confirm Button */}
        <motion.button
          initial={{ opacity: 0, x: -10, scale: 0.8 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          className="absolute -right-12 p-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-full shadow-lg hover:scale-110 transition-transform"
          onMouseDown={(e) => {
            e.preventDefault(); // Prevent input blur
            handleConfirm();
          }}
        >
          <Check className="size-4" strokeWidth={3} />
        </motion.button>
      </div>
    );
  }

  return (
    <motion.span 
      layout
      onClick={() => setIsEditing(true)}
      className="text-5xl font-light tracking-tighter text-zinc-900 dark:text-zinc-50 cursor-text hover:opacity-50 transition-opacity tabular-nums select-none"
    >
      {value}
    </motion.span>
  );
}

function EditablePill({ icon, label, value, onSave, isText = false }: { icon: React.ReactNode, label: string, value: string | number, onSave: (val: any) => void, isText?: boolean }) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempVal, setTempVal] = useState(value.toString());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isEditing) {
      setTempVal(value.toString());
    }
  }, [value, isEditing]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleCancel = () => {
    setIsEditing(false);
    setTempVal(value.toString());
  };

  const handleConfirm = () => {
    if (isText) {
      if (tempVal.trim()) onSave(tempVal.trim());
      else setTempVal(value.toString());
    } else {
      const num = parseInt(tempVal, 10);
      if (!isNaN(num)) onSave(num);
      else setTempVal(value.toString());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleConfirm();
    if (e.key === 'Escape') handleCancel();
  };

  const handleInputBlur = () => {
    // Delay cancel to allow click on confirm button
    // But since confirm button is inside, we can just use onMouseDown to prevent blur
    handleCancel();
  };

  return (
    <motion.div 
      layout
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      onClick={() => !isEditing && setIsEditing(true)}
      className={`
        group flex items-center gap-2 px-3 py-1.5 rounded-full 
        cursor-pointer select-none relative overflow-hidden
        ${isEditing 
          ? 'bg-white dark:bg-zinc-800 shadow-lg shadow-zinc-200/50 dark:shadow-black/50 ring-1 ring-zinc-100 dark:ring-zinc-700 pr-9' 
          : 'bg-zinc-100 dark:bg-zinc-800/50 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
        }
      `}
    >
      <motion.span layout="position" className="opacity-50 group-hover:opacity-100 transition-opacity flex items-center">
        {icon}
      </motion.span>
      
      <motion.span layout="position" className="opacity-70 group-hover:opacity-100 uppercase tracking-wide text-[10px] font-bold flex items-center">
        {label}
      </motion.span>
      
      {isEditing ? (
        <>
          <input
            ref={inputRef}
            type={isText ? "text" : "number"}
            value={tempVal}
            onChange={(e) => setTempVal(e.target.value)}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            className="
              w-16 bg-transparent outline-none border-none p-0 m-0
              text-zinc-900 dark:text-zinc-100 font-bold text-sm
              caret-zinc-900 dark:caret-zinc-100
              selection:bg-zinc-200 dark:selection:bg-zinc-600
              [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
            "
            onClick={(e) => e.stopPropagation()}
          />
          <motion.button
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="absolute right-1.5 p-1 text-zinc-400 hover:text-emerald-500 dark:text-zinc-500 dark:hover:text-emerald-400 transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleConfirm();
            }}
          >
            <Check className="size-3.5" strokeWidth={3} />
          </motion.button>
        </>
      ) : (
        <motion.span layout="position" className="text-zinc-900 dark:text-zinc-200 font-bold text-sm ml-0.5">
          {value}
        </motion.span>
      )}
    </motion.div>
  );
}

function StatItem({ label, value, icon, highlight = false }: { label: string, value: number, icon: React.ReactNode, highlight?: boolean }) {
  return (
    <div className={`
      flex flex-col items-center justify-center p-3 rounded-2xl 
      transition-colors duration-300
      ${highlight 
        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-lg shadow-zinc-200 dark:shadow-none' 
        : 'bg-zinc-50 text-zinc-600 dark:bg-zinc-800/50 dark:text-zinc-400'
      }
    `}>
      <div className="text-xl font-bold mb-1 tracking-tight">{value}</div>
      <div className="flex items-center gap-1.5 opacity-80">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-wide">{label}</span>
      </div>
    </div>
  )
}

// ... (Keep HeatMap and getStats as is, they are good)
/**
 * Organic Activity Flow (Heatmap)
 */
function HeatMap({ history }: { history: Record<string, number> }) {
  // Generate last 12 weeks
  const weeks = 12;
  const today = new Date();
  const days: { date: string; count: number; dayOfWeek: number }[] = [];
  
  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().split('T')[0];
    days.push({
      date: dateKey,
      count: history[dateKey] || 0,
      dayOfWeek: d.getDay(),
    });
  }

  const weekGroups: typeof days[] = [];
  let currentWeek: typeof days = [];
  
  for (const day of days) {
    currentWeek.push(day);
    if (day.dayOfWeek === 6) {
      weekGroups.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    weekGroups.push(currentWeek);
  }

  const getOpacity = (count: number) => {
    if (count === 0) return 'bg-zinc-100 dark:bg-zinc-800/50';
    if (count <= 2) return 'bg-zinc-300 dark:bg-zinc-600';
    if (count <= 5) return 'bg-zinc-500 dark:bg-zinc-500';
    return 'bg-zinc-800 dark:bg-zinc-300 shadow-sm'; // Highlight
  };

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-hide justify-center">
      {weekGroups.map((week, weekIndex) => (
        <div key={weekIndex} className="flex flex-col gap-1.5">
          {weekIndex === 0 && week[0]?.dayOfWeek > 0 && (
            Array.from({ length: week[0].dayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="size-2" />
            ))
          )}
          {week.map((day) => (
            <div
              key={day.date}
              className={`size-2 rounded-full transition-colors duration-300 ${getOpacity(day.count)}`}
              title={`${day.date}: ${day.count}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function getStats(item: ProgressOrCounter) {
  const history = item.history || {};
  const dates = Object.keys(history).sort();
  const totalOps = Object.values(history).reduce((a, b) => a + b, 0);
  const activeDays = dates.filter(d => history[d] > 0).length;
  
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateKey = d.toISOString().split('T')[0];
    if (history[dateKey] && history[dateKey] > 0) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  
  return { totalOps, activeDays, streak };
}

// Export for external use
export { getIconByName };
