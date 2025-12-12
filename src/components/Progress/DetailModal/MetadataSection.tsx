import { ArrowsClockwise } from '@phosphor-icons/react';
import type { ProgressOrCounter, ProgressItem, CounterItem } from '@/stores/useProgressStore';
import { MetadataField, MetadataInput } from './MetadataField';
import type { FocusTarget } from './useDetailModal';

type DraftKey = keyof ProgressItem | keyof CounterItem;

interface MetadataSectionProps {
  displayItem: ProgressOrCounter;
  isEditing: boolean;
  focusTarget: FocusTarget;
  onStartEdit: (target: FocusTarget) => void;
  onCommit: () => void;
  onUpdateDraft: (key: DraftKey, value: unknown) => void;
  onDirectUpdate: (data: Partial<ProgressOrCounter>) => void;
}

/**
 * Metadata section that renders different layouts for Progress vs Counter
 */
export function MetadataSection({
  displayItem,
  isEditing,
  focusTarget,
  onStartEdit,
  onCommit,
  onUpdateDraft,
  onDirectUpdate,
}: MetadataSectionProps) {
  const isProgress = displayItem.type === 'progress';

  return (
    <div
      className={`mt-2 transition-all duration-300 ${
        isEditing
          ? 'opacity-100 translate-y-0'
          : 'opacity-40 hover:opacity-100 translate-y-2'
      }`}
    >
      {isProgress ? (
        <ProgressMetadata
          displayItem={displayItem as ProgressItem}
          isEditing={isEditing}
          focusTarget={focusTarget}
          onStartEdit={onStartEdit}
          onCommit={onCommit}
          onUpdateDraft={onUpdateDraft}
          onDirectUpdate={onDirectUpdate}
        />
      ) : (
        <CounterMetadata
          displayItem={displayItem}
          isEditing={isEditing}
          focusTarget={focusTarget}
          onStartEdit={onStartEdit}
          onCommit={onCommit}
          onUpdateDraft={onUpdateDraft}
          onDirectUpdate={onDirectUpdate}
        />
      )}
    </div>
  );
}

interface ProgressMetadataProps {
  displayItem: ProgressItem;
  isEditing: boolean;
  focusTarget: FocusTarget;
  onStartEdit: (target: FocusTarget) => void;
  onCommit: () => void;
  onUpdateDraft: (key: DraftKey, value: unknown) => void;
  onDirectUpdate: (data: Partial<ProgressOrCounter>) => void;
}

function ProgressMetadata({
  displayItem,
  isEditing,
  focusTarget,
  onStartEdit,
  onCommit,
  onUpdateDraft,
  onDirectUpdate,
}: ProgressMetadataProps) {
  return (
    <div className="grid grid-cols-2 gap-x-12 gap-y-6">
      {/* Target */}
      <MetadataField
        label="Target"
        isEditing={isEditing}
        onStartEdit={() => onStartEdit('total')}
        displayValue={displayItem.total}
      >
        <MetadataInput
          type="number"
          value={displayItem.total}
          onChange={(v) => onUpdateDraft('total', v)}
          onCommit={onCommit}
          autoFocus={focusTarget === 'total'}
        />
      </MetadataField>

      {/* Step */}
      <MetadataField
        label="Step"
        isEditing={isEditing}
        onStartEdit={() => onStartEdit('step')}
        displayValue={displayItem.step}
      >
        <MetadataInput
          type="number"
          value={displayItem.step}
          onChange={(v) => onUpdateDraft('step', v)}
          onCommit={onCommit}
          autoFocus={focusTarget === 'step'}
        />
      </MetadataField>

      {/* Unit */}
      <MetadataField
        label="Unit"
        isEditing={isEditing}
        onStartEdit={() => onStartEdit('unit')}
        displayValue={displayItem.unit || '—'}
        isEmpty={!displayItem.unit}
      >
        <MetadataInput
          type="text"
          value={displayItem.unit || ''}
          onChange={(v) => onUpdateDraft('unit', v)}
          onCommit={onCommit}
          autoFocus={focusTarget === 'unit'}
          placeholder="Unit"
        />
      </MetadataField>

      {/* Reset */}
      <ResetField
        resetFrequency={displayItem.resetFrequency}
        isEditing={isEditing}
        onUpdateDraft={onUpdateDraft}
        onDirectUpdate={onDirectUpdate}
      />
    </div>
  );
}

interface CounterMetadataProps {
  displayItem: ProgressOrCounter;
  isEditing: boolean;
  focusTarget: FocusTarget;
  onStartEdit: (target: FocusTarget) => void;
  onCommit: () => void;
  onUpdateDraft: (key: DraftKey, value: unknown) => void;
  onDirectUpdate: (data: Partial<ProgressOrCounter>) => void;
}

function CounterMetadata({
  displayItem,
  isEditing,
  focusTarget,
  onStartEdit,
  onCommit,
  onUpdateDraft,
  onDirectUpdate,
}: CounterMetadataProps) {
  return (
    <div className="flex items-center justify-center gap-6">
      {/* Step */}
      <MetadataField
        label="Step"
        isEditing={isEditing}
        onStartEdit={() => onStartEdit('step')}
        displayValue={displayItem.step}
      >
        <MetadataInput
          type="number"
          value={displayItem.step}
          onChange={(v) => onUpdateDraft('step', v)}
          onCommit={onCommit}
          autoFocus={focusTarget === 'step'}
          className="w-16"
        />
      </MetadataField>

      {/* Unit */}
      <MetadataField
        label="Unit"
        isEditing={isEditing}
        onStartEdit={() => onStartEdit('unit')}
        displayValue={displayItem.unit || '—'}
        isEmpty={!displayItem.unit}
      >
        <MetadataInput
          type="text"
          value={displayItem.unit || ''}
          onChange={(v) => onUpdateDraft('unit', v)}
          onCommit={onCommit}
          autoFocus={focusTarget === 'unit'}
          placeholder="Unit"
          className="w-16"
        />
      </MetadataField>

      {/* Reset */}
      <ResetField
        resetFrequency={displayItem.resetFrequency}
        isEditing={isEditing}
        onUpdateDraft={onUpdateDraft}
        onDirectUpdate={onDirectUpdate}
      />
    </div>
  );
}

interface ResetFieldProps {
  resetFrequency?: 'daily' | 'weekly' | 'monthly' | 'none';
  isEditing: boolean;
  onUpdateDraft: (key: DraftKey, value: unknown) => void;
  onDirectUpdate: (data: Partial<ProgressOrCounter>) => void;
}

function ResetField({
  resetFrequency,
  isEditing,
  onUpdateDraft,
  onDirectUpdate,
}: ResetFieldProps) {
  const toggleReset = (e: React.MouseEvent) => {
    e.stopPropagation();
    const current = resetFrequency || 'none';
    const next = current === 'none' ? 'daily' : 'none';
    if (isEditing) {
      onUpdateDraft('resetFrequency', next);
    } else {
      onDirectUpdate({ resetFrequency: next });
    }
  };

  return (
    <div className="flex flex-col items-center gap-1 group">
      <span className="text-[9px] font-bold uppercase text-zinc-300 dark:text-zinc-600 tracking-[0.25em]">
        Reset
      </span>
      {isEditing ? (
        <div
          className="flex items-center justify-center h-[28px] cursor-pointer"
          onClick={toggleReset}
        >
          <span className="text-xl font-medium text-zinc-900 dark:text-zinc-100 select-none">
            {resetFrequency === 'daily' ? 'Daily' : 'None'}
          </span>
        </div>
      ) : (
        <div
          onClick={toggleReset}
          className="flex items-center justify-center gap-1 cursor-pointer group/reset"
        >
          {resetFrequency === 'daily' ? (
            <ArrowsClockwise
              weight="duotone"
              className="size-5 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors"
            />
          ) : (
            <span className="text-xl font-medium text-zinc-200 dark:text-zinc-700 group-hover:text-zinc-400 transition-colors">
              —
            </span>
          )}
        </div>
      )}
    </div>
  );
}
