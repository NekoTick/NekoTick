import { useState, useEffect, useRef } from 'react';
import { 
  X, Trash, Archive, Check, Plus, Minus,
  DotsThree, ArrowCounterClockwise, Prohibit
} from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { ProgressOrCounter, ProgressItem, CounterItem } from '../../stores/useProgressStore';
import { IconSelectionView, getIconByName } from './IconPicker';

const appWindow = getCurrentWindow();

interface DetailModalProps {
  item: ProgressOrCounter | null;
  onClose: () => void;
  onUpdate: (id: string, data: Partial<ProgressOrCounter>) => void;
  onDelete: (id: string) => void;
  onPreviewChange?: (icon?: string, title?: string) => void;
}

/**
 * "Liquid Hero" - Global Tuning Edition
 * Concept: One Check to Rule Them All.
 */
export function DetailModal({ item, onClose, onUpdate, onDelete, onPreviewChange }: DetailModalProps) {
  // Global Edit State
  const [isEditing, setIsEditing] = useState(false);
  const [focusTarget, setFocusTarget] = useState<'title' | 'current' | 'total' | 'step' | 'unit'>('title');
  const [draft, setDraft] = useState<Partial<ProgressOrCounter>>({});
  
  const [isPickingIcon, setIsPickingIcon] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  
  // Adaptive Scaling Logic (Direct DOM for Performance)
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => {
       if (!wrapperRef.current) return;
       
       const h = window.innerHeight;
       const w = window.innerWidth;
       // Target Card Size: 360x520 + 40px padding
       const scaleH = Math.min(1, (h - 40) / 520);
       const scaleW = Math.min(1, (w - 40) / 360);
       const s = Math.min(scaleH, scaleW);
       
       wrapperRef.current.style.transform = `scale(${s})`;
    };
    
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial calculation
    
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Refs
  const prevItemId = useRef<string | null>(null);

  // Init Draft & State Management
  useEffect(() => {
    if (item) {
      if (item.id !== prevItemId.current) {
        // New Item Opened: Reset everything
        setDraft(item);
        setIsEditing(false); 
        prevItemId.current = item.id;
      } else {
        // Same Item Updated:
        // If NOT editing, sync draft to keep it fresh.
        // If IS editing, do NOT touch draft to avoid overwriting user input.
        if (!isEditing) {
            setDraft(item);
        }
      }
    }
  }, [item, isEditing]);

  // Global Keyboard Shortcuts (Enter to Close when not editing)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !isEditing && item && !isPickingIcon) {
            handleClose();
        }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, item, isPickingIcon]);

  // Visual Computation
  // Display based on DRAFT if editing, else ITEM
  const displayItem = isEditing ? { ...item, ...draft } as ProgressOrCounter : item;
  
  // Prepare preview values
  const previewIcon = displayItem?.icon;
  const previewTitle = displayItem?.title;

  // Real-time preview sync (using draft if editing, else item)
  // FIX: Only fire when actual VALUES change, not when item reference changes.
  useEffect(() => {
    if (onPreviewChange) {
      onPreviewChange(previewIcon, previewTitle);
    }
  }, [previewIcon, previewTitle, onPreviewChange]);
  
  if (!displayItem) return null;

  const DisplayIcon = displayItem.icon ? getIconByName(displayItem.icon) : null;
  const percentage = displayItem.type === 'progress' 
    ? Math.min(100, Math.max(0, (displayItem.current / displayItem.total) * 100))
    : 0;
  const fillHeight = displayItem.type === 'progress' ? `${percentage}%` : '0%';

  // Handlers for logic
  const handleClose = () => {
    onPreviewChange?.(undefined, undefined);
    onClose();
    setIsEditing(false);
    setIsPickingIcon(false);
    setShowMenu(false);
  };

  // The "One Check" Action
  const handleCommit = () => {
    if (!item) return;
    // Commit draft to store
    onUpdate(item.id, draft);
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    if (!item) return;
    // Revert draft
    setDraft(item);
    setIsEditing(false);
  };

  const handleIconChange = (newIcon: string | undefined) => {
    if (item) {
      onUpdate(item.id, { icon: newIcon });
    }
    setIsPickingIcon(false);
  };

  // Helper to update draft
  const updateDraft = (key: keyof ProgressItem | keyof CounterItem, val: any) => {
    setDraft(prev => ({ ...prev, [key]: val }));
  };

  const handleArchive = () => {
    if (!item) return;
    onUpdate(item.id, { archived: !item.archived, current: item.archived ? 0 : item.current });
    handleClose();
  };

  const handleDelete = () => {
    if (!item) return;
    onDelete(item.id);
    handleClose();
  };

  const handleQuickUpdate = (delta: number) => {
    if (!item) return;
    
    const step = item.type === 'progress' 
      ? (item.direction === 'increment' ? item.step : -item.step)
      : item.step;
    
    // Calculate new value based on DRAFT if editing, or item if not
    const baseValue = isEditing ? (draft.current ?? item.current) : item.current;
    
    let newValue = baseValue + (step * delta);
    if (item.type === 'progress') {
        const total = isEditing ? ((draft as any).total ?? (item as any).total) : (item as any).total;
        newValue = Math.max(0, Math.min(total, newValue));
    } else {
        newValue = Math.max(0, newValue);
    }

    if (isEditing) {
        // If editing, update draft
        updateDraft('current', newValue);
    } else {
        // Instant update (fallback for safety, though UI hides buttons)
        onUpdate(item.id, { current: newValue });
    }
  };

  return (
    <AnimatePresence>
      {item && (
        <>
          {/* Backdrop - Blur & Dim */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed -inset-[50%] bg-zinc-100/60 dark:bg-black/80 backdrop-blur-xl z-50"
            onClick={(e) => {
                e.stopPropagation();
                // Layered Dismissal: Peel the onion
                if (isPickingIcon) {
                  setIsPickingIcon(false);
                  return;
                }
                if (isEditing) {
                  handleCancelEdit();
                  return;
                }
                // Only close modal if no sub-states are active
                handleClose();
            }}
          />

          {/* Draggable Header Zone */}
          <div 
            className="fixed top-0 inset-x-0 h-12 z-50 cursor-default"
            onMouseDown={(e) => {
              e.preventDefault();
              appWindow.startDragging();
            }}
          />

          {/* The Hero Card */}
          <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none p-4">
            {/* Responsive Wrapper - Instant Scale, No Lag */}
            <div ref={wrapperRef} className="origin-center">
                <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: "spring", stiffness: 850, damping: 35, mass: 0.5 }}
                className="
                    relative w-[360px] h-[520px] 
                    bg-white dark:bg-zinc-900 
                    rounded-[3rem] 
                    shadow-2xl shadow-zinc-200/50 dark:shadow-black/80
                    overflow-hidden
                    pointer-events-auto
                    select-none
                    flex flex-col
                "
                onClick={(e) => {
                    e.stopPropagation();
                    // Auto-collapse menu when clicking empty space
                    if (showMenu) setShowMenu(false);
                    
                    // Commit changes if clicking empty space while editing
                    if (isEditing) handleCommit();
                }}
                >
                {/* --- 1. The Liquid Soul (Background Fill) --- */}
                <div className="absolute inset-0 pointer-events-none z-0">
                    {/* Base with Radial Glow */}
                    <div className="absolute inset-0 bg-white dark:bg-zinc-900" />
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-zinc-50/80 via-transparent to-transparent dark:from-zinc-800/30 dark:to-transparent opacity-60" />
                    
                    {/* Liquid Level */}
                    <motion.div 
                    className="absolute bottom-0 left-0 right-0 bg-zinc-50/50 dark:bg-zinc-800/50 backdrop-blur-[2px]"
                    animate={{ height: fillHeight }}
                    transition={{ type: "spring", stiffness: 100, damping: 20 }}
                    />
                    
                    {/* The Watermark Icon - Deeper & Larger */}
                    {DisplayIcon && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-[0.04] dark:opacity-[0.06] pointer-events-none scale-125 mix-blend-multiply dark:mix-blend-overlay">
                        <DisplayIcon weight="fill" className="size-80 text-zinc-900 dark:text-zinc-100" />
                    </div>
                    )}
                </div>

                {/* --- 2. Top Bar --- */}
                <div className="relative z-20 flex justify-between items-center p-6 px-8 h-20">
                    {/* Left: Icon Trigger */}
                    <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsPickingIcon(true);
                        setShowMenu(false);
                    }}
                    className={`group relative size-10 flex items-center justify-center rounded-full 
                        bg-white/40 dark:bg-zinc-800/40 hover:bg-white/80 dark:hover:bg-zinc-700/80
                        transition-all duration-300 backdrop-blur-md
                        shadow-sm ring-1 ring-white/50 dark:ring-zinc-700/50
                        opacity-100
                    `}
                    >
                    {DisplayIcon ? (
                        <DisplayIcon weight="duotone" className="size-5 text-zinc-600 dark:text-zinc-300 group-hover:scale-110 transition-transform duration-300" />
                    ) : (
                        <Prohibit weight="bold" className="size-5 text-zinc-300 dark:text-zinc-600 group-hover:scale-110 transition-transform duration-300" />
                    )}
                    </button>

                    {/* Right: Menu Trigger / Expanded Capsule */}
                    <div className="relative h-10 flex items-center justify-end min-w-[40px]">
                    <AnimatePresence mode="popLayout">
                        {!isEditing && !showMenu && (
                        <motion.button 
                            key="menu-trigger"
                            layoutId="menu-pill"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ type: "spring", stiffness: 850, damping: 35, mass: 0.5 }}
                            onClick={() => setShowMenu(true)}
                            className="absolute right-0 p-2 rounded-full text-zinc-400 hover:text-zinc-900 dark:text-zinc-500 dark:hover:text-zinc-100 transition-colors bg-zinc-100 dark:bg-zinc-800"
                        >
                            <DotsThree weight="bold" className="size-6" />
                        </motion.button>
                        )}
                    
                        {showMenu && !isEditing && (
                        <motion.div
                            key="menu-capsule"
                            layoutId="menu-pill"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ type: "spring", stiffness: 850, damping: 35, mass: 0.5 }}
                            className="
                            absolute right-0 flex items-center gap-1 p-1 pr-2 rounded-full 
                            bg-zinc-100 dark:bg-zinc-800 
                            ring-1 ring-black/5 dark:ring-white/10
                            overflow-hidden
                            "
                        >
                            {/* Actions Container - Staggered */}
                            <motion.div 
                                className="flex items-center gap-1"
                                initial="hidden"
                                animate="visible"
                                variants={{
                                    visible: { transition: { staggerChildren: 0.03, delayChildren: 0.02 } },
                                    hidden: {}
                                }}
                            >
                                {/* Archive */}
                                <motion.button
                                    variants={{
                                        hidden: { opacity: 0, x: 10 },
                                        visible: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 850, damping: 35, mass: 0.5 } }
                                    }}
                                    onClick={handleArchive}
                                    className="p-2 rounded-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                                    title={item.archived ? "Unarchive" : "Archive"}
                                >
                                    <Archive weight="duotone" className="size-5" />
                                </motion.button>

                                {/* Reset */}
                                <motion.button
                                    variants={{
                                        hidden: { opacity: 0, x: 10 },
                                        visible: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 850, damping: 35, mass: 0.5 } }
                                    }}
                                    onClick={() => onUpdate(item.id, { current: 0 })}
                                    className="p-2 rounded-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                                    title="Reset Progress"
                                >
                                    <ArrowCounterClockwise weight="bold" className="size-5" />
                                </motion.button>
                                
                                {/* Divider */}
                                <motion.div 
                                    variants={{
                                        hidden: { scaleY: 0, opacity: 0 },
                                        visible: { scaleY: 1, opacity: 1, transition: { type: "spring", stiffness: 850, damping: 35, mass: 0.5 } }
                                    }}
                                    className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1 origin-center" 
                                />

                                {/* Delete */}
                                <motion.button
                                    variants={{
                                        hidden: { opacity: 0, x: 10 },
                                        visible: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 850, damping: 35, mass: 0.5 } }
                                    }}
                                    onClick={handleDelete}
                                    className="p-2 rounded-full text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:text-zinc-400 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                                    title="Delete"
                                >
                                    <Trash weight="duotone" className="size-5" />
                                </motion.button>

                                {/* Divider */}
                                <motion.div 
                                    variants={{
                                        hidden: { scaleY: 0, opacity: 0 },
                                        visible: { scaleY: 1, opacity: 1, transition: { type: "spring", stiffness: 850, damping: 35, mass: 0.5 } }
                                    }}
                                    className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1 origin-center" 
                                />

                                {/* Close */}
                                <motion.button
                                    variants={{
                                        hidden: { opacity: 0, rotate: -90 },
                                        visible: { opacity: 1, rotate: 0, transition: { type: "spring", stiffness: 850, damping: 35, mass: 0.5 } }
                                    }}
                                    onClick={() => setShowMenu(false)}
                                    className="p-2 rounded-full text-zinc-300 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                                >
                                    <X weight="bold" className="size-4" />
                                </motion.button>
                            </motion.div>
                        </motion.div>
                        )}
                    </AnimatePresence>
                    </div>
                </div>

                {/* --- 3. Center Zone (The Tuning Engine) --- */}
                <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-8 -mt-8">
                    
                    {/* 3.1 Title (The Crown - Borderless & Elegant) */}
                    <div className="relative z-20 w-full flex justify-center min-h-[40px]">
                    {isEditing ? (
                        <input
                            autoFocus={focusTarget === 'title'}
                            value={displayItem.title}
                            onChange={(e) => updateDraft('title', e.target.value)}
                            className="
                            text-center text-3xl font-medium 
                            bg-transparent border-none outline-none p-0
                            text-zinc-900 dark:text-zinc-100 
                            w-full max-w-[280px]
                            placeholder:text-zinc-200 dark:placeholder:text-zinc-700
                            caret-zinc-400
                            "
                            placeholder="Untitled"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.stopPropagation();
                                    handleCommit();
                                }
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <h2 
                            onClick={() => { setFocusTarget('title'); setIsEditing(true); setShowMenu(false); }}
                            className="
                            text-3xl font-medium tracking-tight
                            text-zinc-900 dark:text-zinc-100 
                            cursor-pointer hover:opacity-70 transition-opacity
                            "
                        >
                            {displayItem.title}
                        </h2>
                    )}
                    </div>

                    {/* 3.2 Number & +/- Hotspots */}
                    <div className="relative flex items-center justify-center w-full">
                    
                    {/* Left Hotspot (-1) - Invisible Touch */}
                    <AnimatePresence>
                        {isEditing && (
                        <motion.button 
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="
                            absolute left-0 top-1/2 -translate-y-1/2
                            h-32 w-24 flex items-center justify-center
                            text-zinc-200/50 dark:text-zinc-800/50 
                            hover:text-zinc-400 dark:hover:text-zinc-500
                            transition-colors duration-300
                            cursor-pointer
                            outline-none
                            "
                            onClick={(e) => { e.stopPropagation(); handleQuickUpdate(-1); }}
                            tabIndex={-1}
                        >
                            <Minus weight="thin" className="size-10" />
                        </motion.button>
                        )}
                    </AnimatePresence>

                    {/* Main Value Display/Input */}
                    <div className="flex flex-col items-center gap-6 px-24 w-full">
                        {isEditing ? (
                        <input
                            autoFocus={focusTarget === 'current'}
                            type="number"
                            value={displayItem.current}
                            onChange={(e) => updateDraft('current', Number(e.target.value))}
                            className="
                            w-full text-center text-9xl font-thin tracking-tighter 
                            bg-transparent outline-none border-none p-0 m-0 tabular-nums 
                            text-zinc-900 dark:text-zinc-50 
                            caret-zinc-400
                            [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none
                            "
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.stopPropagation();
                                    handleCommit();
                                }
                            }}
                            onClick={(e) => e.stopPropagation()}
                        />
                        ) : (
                        <motion.span 
                            layout
                            onClick={() => { setFocusTarget('current'); setIsEditing(true); setShowMenu(false); }}
                            className="
                            text-9xl font-thin tracking-tighter 
                            text-zinc-900 dark:text-zinc-50 
                            cursor-pointer hover:scale-105 transition-transform duration-300
                            tabular-nums select-none
                            drop-shadow-sm
                            "
                        >
                            {displayItem.current}
                        </motion.span>
                        )}

                        {/* Metadata Row (Borderless & Minimal) */}
                        <div className={`flex items-center gap-6 transition-all duration-300 ${isEditing ? 'opacity-100 translate-y-0' : 'opacity-40 hover:opacity-100 translate-y-2'}`}>
                            {/* Target */}
                            {displayItem.type === 'progress' && (
                            <div className="flex flex-col items-center gap-1 group">
                                <span className="text-[9px] font-bold uppercase text-zinc-300 dark:text-zinc-600 tracking-[0.25em]">Target</span>
                                {isEditing ? (
                                <input 
                                    autoFocus={focusTarget === 'total'}
                                    type="number" 
                                    value={displayItem.total}
                                    onChange={(e) => updateDraft('total', Number(e.target.value))}
                                    className="w-16 bg-transparent border-none outline-none text-center font-medium text-xl text-zinc-900 dark:text-zinc-100 caret-zinc-400 p-0"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.stopPropagation();
                                            handleCommit();
                                        }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                />
                                ) : (
                                <span onClick={() => { setFocusTarget('total'); setIsEditing(true); setShowMenu(false); }} className="text-xl font-medium text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors cursor-pointer">
                                    {displayItem.total}
                                </span>
                                )}
                            </div>
                            )}

                            {/* Divider */}
                            {displayItem.type === 'progress' && <div className="w-px h-8 bg-zinc-100 dark:bg-zinc-800" />}

                            {/* Step */}
                            <div className="flex flex-col items-center gap-1 group">
                                <span className="text-[9px] font-bold uppercase text-zinc-300 dark:text-zinc-600 tracking-[0.25em]">Step</span>
                                {isEditing ? (
                                <input 
                                    autoFocus={focusTarget === 'step'}
                                    type="number" 
                                    value={displayItem.step}
                                    onChange={(e) => updateDraft('step', Number(e.target.value))}
                                    className="w-16 bg-transparent border-none outline-none text-center font-medium text-xl text-zinc-900 dark:text-zinc-100 caret-zinc-400 p-0"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.stopPropagation();
                                            handleCommit();
                                        }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                />
                                ) : (
                                <span onClick={() => { setFocusTarget('step'); setIsEditing(true); setShowMenu(false); }} className="text-xl font-medium text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors cursor-pointer">
                                    {displayItem.step}
                                </span>
                                )}
                            </div>

                            {/* Unit - Always Render for Editability */}
                            <>
                            <div className="w-px h-8 bg-zinc-100 dark:bg-zinc-800" />
                            <div className="flex flex-col items-center gap-1 group">
                                <span className="text-[9px] font-bold uppercase text-zinc-300 dark:text-zinc-600 tracking-[0.25em]">Unit</span>
                                {isEditing ? (
                                <input 
                                    autoFocus={focusTarget === 'unit'}
                                    type="text" 
                                    value={displayItem.unit || ''}
                                    onChange={(e) => updateDraft('unit', e.target.value)}
                                    className="w-16 bg-transparent border-none outline-none text-center font-medium text-xl text-zinc-900 dark:text-zinc-100 caret-zinc-400 p-0 placeholder:text-zinc-200 dark:placeholder:text-zinc-700"
                                    placeholder="Unit"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.stopPropagation();
                                            handleCommit();
                                        }
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                />
                                ) : (
                                <span 
                                    onClick={() => { setFocusTarget('unit'); setIsEditing(true); setShowMenu(false); }}
                                    className={`
                                    text-xl font-medium cursor-pointer transition-colors
                                    ${displayItem.unit 
                                        ? 'text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100' 
                                        : 'text-zinc-200 dark:text-zinc-700 group-hover:text-zinc-400'
                                    }
                                    `}
                                >
                                    {displayItem.unit || '—'}
                                </span>
                                )}
                            </div>
                            </>
                        </div>
                    </div>

                    {/* Right Hotspot (+1) - Invisible Touch */}
                    <AnimatePresence>
                        {isEditing && (
                        <motion.button 
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="
                            absolute right-0 top-1/2 -translate-y-1/2
                            h-32 w-24 flex items-center justify-center
                            text-zinc-200/50 dark:text-zinc-800/50 
                            hover:text-zinc-400 dark:hover:text-zinc-500
                            transition-colors duration-300
                            cursor-pointer
                            outline-none
                            "
                            onClick={(e) => { e.stopPropagation(); handleQuickUpdate(1); }}
                            tabIndex={-1}
                        >
                            <Plus weight="thin" className="size-10" />
                        </motion.button>
                        )}
                    </AnimatePresence>
                    </div>
                </div>

                {/* --- 4. Footer: Stats or Check --- */}
                <div className="relative z-20 pb-12 px-8 flex flex-col items-center justify-end h-32">
                    
                    <AnimatePresence mode="wait">
                    {isEditing ? (
                        <motion.button
                        key="check-btn"
                        initial={{ opacity: 0, y: 40, scale: 0.5 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 40, scale: 0.5 }}
                        transition={{ type: "spring", stiffness: 850, damping: 35, mass: 0.5 }}
                        onClick={handleCommit}
                        className="
                            size-20 rounded-full 
                            bg-black dark:bg-white 
                            text-white dark:text-black 
                            shadow-2xl hover:scale-105 active:scale-95 hover:shadow-black/20
                            flex items-center justify-center
                            cursor-pointer z-50
                        "
                        >
                        <Check weight="bold" className="size-8" />
                        </motion.button>
                    ) : (
                        <motion.div
                        key="stats-footer"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="flex flex-col items-center gap-6 w-full"
                        >
                            {/* Micro Stats - Simplified */}
                            <div className="flex items-center gap-12 opacity-50 hover:opacity-100 transition-opacity duration-300">
                            {(() => {
                                const stats = getStats(displayItem);
                                return (
                                <>
                                    <div className="flex flex-col items-center gap-1">
                                    <span className="text-3xl font-thin text-zinc-900 dark:text-zinc-100">{stats.streak}</span>
                                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-400">Streak</span>
                                    </div>
                                    <div className="w-px h-8 bg-zinc-200 dark:bg-zinc-700" />
                                    <div className="flex flex-col items-center gap-1">
                                    <span className="text-3xl font-thin text-zinc-900 dark:text-zinc-100">{stats.activeDays}</span>
                                    <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-400">Days</span>
                                    </div>
                                </>
                                )
                            })()}
                            </div>
                        </motion.div>
                    )}
                    </AnimatePresence>
                </div>

                {/* Icon Picker Overlay */}
                <AnimatePresence>
                    {isPickingIcon && (
                    <motion.div
                        initial={{ opacity: 0, y: '100%' }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: '100%' }}
                        transition={{ type: "spring", stiffness: 850, damping: 35, mass: 0.5 }}
                        className="absolute inset-0 z-50 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl flex flex-col p-6"
                        onClick={(e) => {
                            e.stopPropagation();
                        }}
                    >
                        <div className="flex-1 overflow-hidden">
                        <IconSelectionView 
                            value={displayItem.icon} 
                            onChange={handleIconChange} 
                            onCancel={() => setIsPickingIcon(false)}
                        />
                        </div>
                    </motion.div>
                    )}
                </AnimatePresence>

                </motion.div>
            </div>
          </div>
        </> 
      )}
    </AnimatePresence>
  );
}

// Stats helper
function getStats(item: ProgressOrCounter) {
  const history = item.history || {};
  const dates = Object.keys(history).sort();
  const totalOps = Object.values(history).reduce((a: number, b: number) => a + b, 0);
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
