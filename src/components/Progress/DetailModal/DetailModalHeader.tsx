import { motion } from 'framer-motion';
import {
  DotsThree,
  Prohibit,
  X,
  Trash,
  Archive,
  ArrowCounterClockwise,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';

interface DetailModalHeaderProps {
  displayIcon: Icon | null;
  isEditing: boolean;
  showMenu: boolean;
  isArchived: boolean;
  onIconClick: () => void;
  onMenuToggle: (show: boolean) => void;
  onArchive: () => void;
  onReset: () => void;
  onDelete: () => void;
}

/**
 * Header section of DetailModal
 * Contains icon button and action menu capsule
 */
export function DetailModalHeader({
  displayIcon: DisplayIcon,
  // isEditing, // Unused
  showMenu,
  isArchived,
  onIconClick,
  onMenuToggle,
  onArchive,
  onReset,
  onDelete,
}: DetailModalHeaderProps) {
  return (
    <div className="relative z-20 flex justify-between items-center p-6 px-8 h-20">
      {/* Left: Icon Trigger */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onIconClick();
        }}
        className={`
          group relative size-10 flex items-center justify-center rounded-full
          bg-white/40 dark:bg-zinc-800/40 hover:bg-white/80 dark:hover:bg-zinc-700/80
          transition-all duration-300 backdrop-blur-md
          shadow-sm ring-1 ring-white/50 dark:ring-zinc-700/50
          opacity-100
        `}
      >
        {DisplayIcon ? (
          <DisplayIcon
            weight="duotone"
            className="size-5 text-zinc-600 dark:text-zinc-300 group-hover:scale-110 transition-transform duration-300"
          />
        ) : (
          <Prohibit
            weight="bold"
            className="size-5 text-zinc-300 dark:text-zinc-600 group-hover:scale-110 transition-transform duration-300"
          />
        )}
      </button>

      {/* Right: The Morphing Settings Capsule */}
      <div className="relative h-10 flex items-center justify-end z-50">
        <motion.div
          layout
          className={`
            relative flex items-center justify-end
            overflow-hidden 
            bg-zinc-100/50 dark:bg-zinc-800/50 backdrop-blur-md
            hover:bg-zinc-100/80 dark:hover:bg-zinc-800/80
            shadow-sm
          `}
          initial={false}
          animate={{
            width: showMenu ? 'auto' : 40,
            height: 40,
            borderRadius: 9999,
            backgroundColor: showMenu 
                ? (document.documentElement.classList.contains('dark') ? 'rgba(39, 39, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)')
                : (document.documentElement.classList.contains('dark') ? 'rgba(39, 39, 42, 0.4)' : 'rgba(244, 244, 245, 0.4)')
          }}
          transition={{
            type: 'spring',
            stiffness: 700,
            damping: 35,
            mass: 0.8,
          }}
        >
          {/* State A: The Totem (Dots) */}
          <motion.button
            className="absolute inset-0 flex items-center justify-center text-zinc-500 dark:text-zinc-400 transition-colors"
            onClick={() => onMenuToggle(true)}
            animate={{
              opacity: showMenu ? 0 : 1,
              scale: showMenu ? 0.5 : 1,
              pointerEvents: showMenu ? 'none' : 'auto',
              filter: showMenu ? 'blur(4px)' : 'blur(0px)', // Blur out effect
            }}
            transition={{ duration: 0.15 }}
          >
            <DotsThree weight="bold" className="size-6" />
          </motion.button>

          {/* State B: The Panel (Actions) */}
          <motion.div
            className="flex items-center gap-1 pl-1 pr-1 h-full min-w-max"
            animate={{
              opacity: showMenu ? 1 : 0,
              filter: showMenu ? 'blur(0px)' : 'blur(4px)', // Blur in effect
              pointerEvents: showMenu ? 'auto' : 'none',
              x: showMenu ? 0 : 20, 
            }}
            transition={{ 
                type: "spring",
                stiffness: 700,
                damping: 35,
                mass: 0.8
            }}
          >


            {/* Reset */}
            <button
              onClick={onReset}
              className="p-2 rounded-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-700/50 transition-colors"
              title="Reset"
            >
              <ArrowCounterClockwise weight="bold" className="size-5" />
            </button>

            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700/50 mx-1" />

            {/* Delete */}
            <button
              onClick={onDelete}
              className="p-2 rounded-full text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:text-zinc-400 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors"
              title="Delete"
            >
              <Trash weight="duotone" className="size-5" />
            </button>

            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700/50 mx-1" />

            {/* Close */}
            <button
              onClick={() => onMenuToggle(false)}
              className="p-2 rounded-full text-zinc-300 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
            >
              <X weight="bold" className="size-4" />
            </button>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
