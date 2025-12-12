import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus } from '@phosphor-icons/react';
import type { ProgressOrCounter, ProgressItem, CounterItem } from '@/stores/useProgressStore';
import { MetadataSection } from './MetadataSection';
import type { FocusTarget } from './useDetailModal';

type DraftKey = keyof ProgressItem | keyof CounterItem;

interface DetailModalContentProps {
  displayItem: ProgressOrCounter;
  isEditing: boolean;
  focusTarget: FocusTarget;
  onStartEdit: (target: FocusTarget) => void;
  onCommit: () => void;
  onQuickUpdate: (delta: number) => void;
  onUpdateDraft: (key: DraftKey, value: unknown) => void;
  onDirectUpdate: (data: Partial<ProgressOrCounter>) => void;
}

/**
 * Center content section of DetailModal
 * Contains title, main value display, and metadata fields
 */
export function DetailModalContent({
  displayItem,
  isEditing,
  focusTarget,
  onStartEdit,
  onCommit,
  onQuickUpdate,
  onUpdateDraft,
  onDirectUpdate,
}: DetailModalContentProps) {
  return (
    <div className="relative z-10 flex-1 flex flex-col items-center justify-center gap-8 -mt-8">
      {/* Title (The Crown - Borderless & Elegant) */}
      <TitleSection
        title={displayItem.title}
        isEditing={isEditing}
        autoFocus={focusTarget === 'title'}
        onStartEdit={() => onStartEdit('title')}
        onCommit={onCommit}
        onChange={(value) => onUpdateDraft('title', value)}
      />

      {/* Number & +/- Hotspots */}
      <div className="relative flex items-center justify-center w-full">
        {/* Left Hotspot (-1) */}
        <QuickUpdateButton
          direction="decrement"
          isEditing={isEditing}
          onClick={() => onQuickUpdate(-1)}
        />

        {/* Main Value Display/Input */}
        <div className="flex flex-col items-center gap-6 px-24 w-full mb-8">
          <ValueDisplay
            value={displayItem.current}
            isEditing={isEditing}
            autoFocus={focusTarget === 'current'}
            onStartEdit={() => onStartEdit('current')}
            onCommit={onCommit}
            onChange={(value) => onUpdateDraft('current', value)}
          />

          {/* Metadata Layout */}
          <MetadataSection
            displayItem={displayItem}
            isEditing={isEditing}
            focusTarget={focusTarget}
            onStartEdit={onStartEdit}
            onCommit={onCommit}
            onUpdateDraft={onUpdateDraft}
            onDirectUpdate={onDirectUpdate}
          />
        </div>

        {/* Right Hotspot (+1) */}
        <QuickUpdateButton
          direction="increment"
          isEditing={isEditing}
          onClick={() => onQuickUpdate(1)}
        />
      </div>
    </div>
  );
}

// Sub-components

interface TitleSectionProps {
  title: string;
  isEditing: boolean;
  autoFocus: boolean;
  onStartEdit: () => void;
  onCommit: () => void;
  onChange: (value: string) => void;
}

function TitleSection({
  title,
  isEditing,
  autoFocus,
  onStartEdit,
  onCommit,
  onChange,
}: TitleSectionProps) {
  return (
    <div className="relative z-20 w-full flex justify-center min-h-[40px]">
      {isEditing ? (
        <input
          autoFocus={autoFocus}
          value={title}
          onChange={(e) => onChange(e.target.value)}
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
              onCommit();
            }
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <h2
          onClick={onStartEdit}
          className="
            text-3xl font-medium tracking-tight
            text-zinc-900 dark:text-zinc-100
            cursor-pointer hover:opacity-70 transition-opacity
          "
        >
          {title}
        </h2>
      )}
    </div>
  );
}

interface ValueDisplayProps {
  value: number;
  isEditing: boolean;
  autoFocus: boolean;
  onStartEdit: () => void;
  onCommit: () => void;
  onChange: (value: number) => void;
}

function ValueDisplay({
  value,
  isEditing,
  autoFocus,
  onStartEdit,
  onCommit,
  onChange,
}: ValueDisplayProps) {
  if (isEditing) {
    return (
      <input
        autoFocus={autoFocus}
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
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
            onCommit();
          }
        }}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  return (
    <motion.span
      layout
      onClick={onStartEdit}
      className="
        text-9xl font-thin tracking-tighter
        text-zinc-900 dark:text-zinc-50
        cursor-pointer hover:scale-105 transition-transform duration-300
        tabular-nums select-none
        drop-shadow-sm
      "
    >
      {value}
    </motion.span>
  );
}

interface QuickUpdateButtonProps {
  direction: 'increment' | 'decrement';
  isEditing: boolean;
  onClick: () => void;
}

function QuickUpdateButton({
  direction,
  isEditing,
  onClick,
}: QuickUpdateButtonProps) {
  const isLeft = direction === 'decrement';
  const Icon = isLeft ? Minus : Plus;

  return (
    <AnimatePresence>
      {isEditing && (
        <motion.button
          initial={{ opacity: 0, x: isLeft ? 20 : -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: isLeft ? 20 : -20 }}
          className={`
            absolute ${isLeft ? 'left-0' : 'right-0'} top-1/2 -translate-y-1/2
            h-32 w-24 flex items-center justify-center
            text-zinc-200/50 dark:text-zinc-800/50
            hover:text-zinc-400 dark:hover:text-zinc-500
            transition-colors duration-300
            cursor-pointer
            outline-none
          `}
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          tabIndex={-1}
        >
          <Icon weight="thin" className="size-10" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
