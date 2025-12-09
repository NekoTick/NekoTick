import { useState, useRef, useEffect } from 'react';
import {
  // Activity
  Barbell, Target, TrendUp, Lightning, Trophy, Medal, Flag, Pulse, Fire,
  // Health & Mind
  Heart, Brain, Moon, Sun, Coffee, Smiley, Sparkle,
  // Work & Study
  Briefcase, GraduationCap, Book, Pen, Code, Laptop,
  // Life
  House, MusicNote, Camera, GameController, ShoppingBag, ForkKnife, Gift, Ticket,
  // Travel
  Airplane, Car, Bicycle, MapTrifold, Compass, Globe,
  // Finance
  CurrencyDollar, PiggyBank,
  // Nature
  Plant, Flower, Drop,
  // Tools
  Clock, CalendarBlank,
  type Icon as PhosphorIcon,
  X,
} from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';

// Categorized Icons
const ICON_CATEGORIES = [
  {
    name: 'Activity',
    icons: [
      { name: 'dumbbell', icon: Barbell },
      { name: 'activity', icon: Pulse },
      { name: 'flame', icon: Fire },
      { name: 'target', icon: Target },
      { name: 'trending-up', icon: TrendUp },
      { name: 'trophy', icon: Trophy },
      { name: 'award', icon: Medal },
      { name: 'flag', icon: Flag },
      { name: 'zap', icon: Lightning },
    ]
  },
  {
    name: 'Life',
    icons: [
      { name: 'home', icon: House },
      { name: 'coffee', icon: Coffee },
      { name: 'music', icon: MusicNote },
      { name: 'gamepad', icon: GameController },
      { name: 'camera', icon: Camera },
      { name: 'shopping', icon: ShoppingBag },
      { name: 'utensils', icon: ForkKnife },
      { name: 'gift', icon: Gift },
      { name: 'ticket', icon: Ticket },
    ]
  },
  {
    name: 'Growth',
    icons: [
      { name: 'book', icon: Book },
      { name: 'brain', icon: Brain },
      { name: 'graduation', icon: GraduationCap },
      { name: 'briefcase', icon: Briefcase },
      { name: 'code', icon: Code },
      { name: 'laptop', icon: Laptop },
      { name: 'pen', icon: Pen },
      { name: 'sparkles', icon: Sparkle },
      { name: 'dollar', icon: CurrencyDollar },
      { name: 'piggy-bank', icon: PiggyBank },
    ]
  },
  {
    name: 'Health',
    icons: [
      { name: 'heart', icon: Heart },
      { name: 'smile', icon: Smiley },
      { name: 'moon', icon: Moon },
      { name: 'sun', icon: Sun },
      { name: 'droplets', icon: Drop },
      { name: 'leaf', icon: Plant },
      { name: 'flower', icon: Flower },
    ]
  },
  {
    name: 'Travel',
    icons: [
      { name: 'plane', icon: Airplane },
      { name: 'car', icon: Car },
      { name: 'bike', icon: Bicycle },
      { name: 'map', icon: MapTrifold },
      { name: 'compass', icon: Compass },
      { name: 'globe', icon: Globe },
      { name: 'clock', icon: Clock },
      { name: 'calendar', icon: CalendarBlank },
    ]
  }
];

// Flatten for quick lookup
const ALL_ICONS = ICON_CATEGORIES.flatMap(c => c.icons);

export function getIconByName(name: string): PhosphorIcon | null {
  const found = ALL_ICONS.find(i => i.name === name);
  return found?.icon || null;
}

export function IconSelectionView({ value, onChange, onCancel }: { value?: string, onChange: (icon: string | undefined) => void, onCancel?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-between items-center mb-6 px-2 shrink-0">
        <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">
          Select Icon
        </span>
        <div className="flex gap-2">
          {value && (
            <button
              onClick={() => onChange(undefined)}
              className="px-3 py-1.5 text-xs font-medium text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
            >
              Remove
            </button>
          )}
          {onCancel && (
            <button
              onClick={onCancel}
              className="p-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg transition-colors"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="
        flex-1 overflow-y-auto pb-8
        [&::-webkit-scrollbar]:w-1.5
        [&::-webkit-scrollbar-track]:bg-transparent
        [&::-webkit-scrollbar-thumb]:bg-zinc-200
        [&::-webkit-scrollbar-thumb]:rounded-full
        [&::-webkit-scrollbar-thumb]:hover:bg-zinc-300
        dark:[&::-webkit-scrollbar-thumb]:bg-zinc-800
        dark:[&::-webkit-scrollbar-thumb]:hover:bg-zinc-700
      ">
        <div className="space-y-8">
          {ICON_CATEGORIES.map((category) => (
            <div key={category.name}>
              <div className="text-[10px] font-bold text-zinc-300 dark:text-zinc-600 uppercase tracking-widest mb-4 pl-2 sticky top-0 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm py-2 z-10">
                {category.name}
              </div>
              <div className="grid grid-cols-5 sm:grid-cols-6 gap-3 px-1">
                {category.icons.map(({ name, icon: Icon }) => (
                  <button
                    key={name}
                    onClick={() => onChange(name)}
                    className={`
                      group relative aspect-square rounded-2xl flex items-center justify-center transition-all duration-300
                      ${value === name 
                        ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-lg scale-105 ring-2 ring-zinc-200 dark:ring-zinc-700' 
                        : 'bg-zinc-50 dark:bg-zinc-800/50 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-900 dark:hover:text-zinc-200 hover:scale-105 hover:shadow-md'
                      }
                    `}
                  >
                    <Icon 
                      className="size-6 transition-transform duration-300 group-hover:scale-110" 
                      weight={value === name ? "duotone" : "light"}
                    />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface IconPickerProps {
  value?: string;
  onChange: (icon: string | undefined) => void;
}

export function IconPicker({ value, onChange }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const SelectedIcon = value ? getIconByName(value) : null;

  return (
    <div className="relative z-50">
      {/* Trigger Button */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen(!open)}
        className={`
          relative w-14 h-14 flex items-center justify-center rounded-full transition-all duration-500
          ${SelectedIcon 
            ? 'bg-white dark:bg-zinc-800 shadow-[0_8px_16px_-4px_rgba(0,0,0,0.1)] ring-1 ring-black/5 dark:ring-white/10' 
            : 'bg-white/50 dark:bg-zinc-800/50 hover:bg-white dark:hover:bg-zinc-700 shadow-sm hover:shadow-md'
          }
        `}
      >
        {SelectedIcon ? (
          <div className="text-zinc-900 dark:text-zinc-100">
             <SelectedIcon className="size-6" weight="duotone" />
          </div>
        ) : (
          <Sparkle className="size-6 text-zinc-400 dark:text-zinc-500 opacity-80" weight="light" />
        )}
        
        {open && (
           <motion.div 
             layoutId="active-ring"
             className="absolute -inset-1 rounded-full border border-zinc-900/20 dark:border-zinc-100/20 opacity-100 pointer-events-none"
             initial={{ opacity: 0, scale: 0.8 }}
             animate={{ opacity: 1, scale: 1 }}
             exit={{ opacity: 0, scale: 0.8 }}
           />
        )}
      </motion.button>

      {/* Center Stage Icon Panel (Fixed Overlay) */}
      <AnimatePresence>
        {open && (
          <>
            {/* Invisible Backdrop to catch clicks */}
            <div 
                className="fixed inset-0 z-[60]" 
                onClick={() => setOpen(false)}
            />

            {/* The Floating Palette */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", duration: 0.5, bounce: 0.3 }}
              className="
                fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[70]
                w-[380px] max-h-[500px] 
                bg-white/90 dark:bg-zinc-900/90 backdrop-blur-2xl 
                rounded-[2.5rem] shadow-[0_40px_80px_-20px_rgba(0,0,0,0.2)] 
                border border-white/40 dark:border-white/10
                overflow-hidden
                flex flex-col
              "
            >
              <div className="p-6 h-full overflow-hidden flex flex-col">
                 <IconSelectionView value={value} onChange={(v) => { onChange(v); setOpen(false); }} onCancel={() => setOpen(false)} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

