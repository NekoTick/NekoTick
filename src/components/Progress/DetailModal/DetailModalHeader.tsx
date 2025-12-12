import { motion, AnimatePresence } from 'framer-motion';
import {
  DotsThree,
  Prohibit,
  X,
  Trash,
  Archive,
  ArrowCounterClockwise,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import {
  SPRING_SNAPPY,
  STAGGER_CONTAINER,
  STAGGER_ITEM,
  STAGGER_DIVIDER,
} from '@/lib/animations';

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
  isEditing,
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
              transition={SPRING_SNAPPY}
              onClick={() => onMenuToggle(true)}
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
              transition={SPRING_SNAPPY}
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
                variants={STAGGER_CONTAINER}
              >
                {/* Archive */}
                <motion.button
                  variants={STAGGER_ITEM}
                  onClick={onArchive}
                  className="p-2 rounded-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                  title={isArchived ? 'Unarchive' : 'Archive'}
                >
                  <Archive weight="duotone" className="size-5" />
                </motion.button>

                {/* Reset */}
                <motion.button
                  variants={STAGGER_ITEM}
                  onClick={onReset}
                  className="p-2 rounded-full text-zinc-400 hover:text-zinc-900 hover:bg-zinc-200 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                  title="Reset Progress"
                >
                  <ArrowCounterClockwise weight="bold" className="size-5" />
                </motion.button>

                {/* Divider */}
                <motion.div
                  variants={STAGGER_DIVIDER}
                  className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1 origin-center"
                />

                {/* Delete */}
                <motion.button
                  variants={STAGGER_ITEM}
                  onClick={onDelete}
                  className="p-2 rounded-full text-zinc-400 hover:text-red-600 hover:bg-red-50 dark:text-zinc-400 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors"
                  title="Delete"
                >
                  <Trash weight="duotone" className="size-5" />
                </motion.button>

                {/* Divider */}
                <motion.div
                  variants={STAGGER_DIVIDER}
                  className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1 origin-center"
                />

                {/* Close */}
                <motion.button
                  variants={{
                    hidden: { opacity: 0, rotate: -90 },
                    visible: {
                      opacity: 1,
                      rotate: 0,
                      transition: SPRING_SNAPPY,
                    },
                  }}
                  onClick={() => onMenuToggle(false)}
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
  );
}
