import type { ReactNode } from 'react';

interface MetadataFieldProps {
  label: string;
  isEditing: boolean;
  onStartEdit: () => void;
  children: ReactNode;
  displayValue: ReactNode;
  isEmpty?: boolean;
  className?: string;
}

/**
 * Reusable metadata field component for DetailModal
 * Handles edit/display mode switching with consistent styling
 */
export function MetadataField({
  label,
  isEditing,
  onStartEdit,
  children,
  displayValue,
  isEmpty = false,
  className = '',
}: MetadataFieldProps) {
  return (
    <div className={`flex flex-col items-center gap-1 group ${className}`}>
      <span className="text-[9px] font-bold uppercase text-zinc-300 dark:text-zinc-600 tracking-[0.25em]">
        {label}
      </span>
      {isEditing ? (
        children
      ) : (
        <span
          onClick={onStartEdit}
          className={`
            text-xl font-medium cursor-pointer transition-colors
            ${
              isEmpty
                ? 'text-zinc-200 dark:text-zinc-700 group-hover:text-zinc-400'
                : 'text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100'
            }
          `}
        >
          {displayValue}
        </span>
      )}
    </div>
  );
}

interface MetadataInputProps {
  type?: 'text' | 'number';
  value: string | number;
  onChange: (value: string | number) => void;
  onCommit: () => void;
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
}

/**
 * Input component for metadata fields with consistent styling
 */
export function MetadataInput({
  type = 'text',
  value,
  onChange,
  onCommit,
  autoFocus = false,
  placeholder,
  className = 'w-20',
}: MetadataInputProps) {
  return (
    <input
      autoFocus={autoFocus}
      type={type}
      value={value}
      onChange={(e) =>
        onChange(type === 'number' ? Number(e.target.value) : e.target.value)
      }
      className={`
        bg-transparent border-none outline-none text-center
        font-medium text-xl text-zinc-900 dark:text-zinc-100
        caret-zinc-400 p-0
        placeholder:text-zinc-200 dark:placeholder:text-zinc-700
        ${className}
      `}
      placeholder={placeholder}
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
