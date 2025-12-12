import { motion, AnimatePresence } from 'framer-motion';
import { Check } from '@phosphor-icons/react';
import type { ProgressOrCounter } from '@/stores/useProgressStore';
import { HistoryWaveform } from '../HistoryWaveform';
import { SPRING_SNAPPY } from '@/lib/animations';

interface DetailModalFooterProps {
  displayItem: ProgressOrCounter;
  isEditing: boolean;
  onCommit: () => void;
}

/**
 * Footer section of DetailModal
 * Shows history waveform or commit button based on editing state
 */
export function DetailModalFooter({
  displayItem,
  isEditing,
  onCommit,
}: DetailModalFooterProps) {
  return (
    <div className="relative z-20 pb-6 px-4 flex flex-col items-center justify-end h-40 w-full">
      <AnimatePresence mode="wait">
        {isEditing ? (
          <motion.button
            key="check-btn"
            initial={{ opacity: 0, y: 40, scale: 0.5 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.5 }}
            transition={SPRING_SNAPPY}
            onClick={onCommit}
            className="
              size-20 rounded-full
              bg-black dark:bg-white
              text-white dark:text-black
              shadow-2xl hover:scale-105 active:scale-95 hover:shadow-black/20
              flex items-center justify-center
              cursor-pointer z-50 mb-4
            "
          >
            <Check weight="bold" className="size-8" />
          </motion.button>
        ) : (
          <motion.div
            key="history-waveform"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="w-full h-full"
          >
            <HistoryWaveform item={displayItem} days={10} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
