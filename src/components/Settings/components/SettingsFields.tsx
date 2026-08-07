import { forwardRef, useRef } from 'react';
import type { ComponentPropsWithoutRef, ReactNode, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { usePredictedTextareaHeight } from '@/hooks/usePredictedTextareaHeight';
import { themeTextAreaTokens } from '@/styles/themeTokens';

const fieldShellClassName =
  'rounded-[var(--vlaina-ui-radius-group)] border border-[var(--vlaina-border)] bg-[var(--vlaina-color-setting-field)] shadow-[var(--vlaina-shadow-control-active)] transition-colors focus-within:border-[var(--vlaina-accent)]';

interface SettingsTextInputProps extends ComponentPropsWithoutRef<'input'> {
  leading?: ReactNode;
  trailing?: ReactNode;
  shellClassName?: string;
  inputClassName?: string;
}

export const SettingsTextInput = forwardRef<HTMLInputElement, SettingsTextInputProps>(
  function SettingsTextInput(
    { leading, trailing, shellClassName, inputClassName, className, ...props },
    ref
  ) {
    return (
      <div className={cn(fieldShellClassName, 'relative flex min-w-0 items-center', shellClassName, className)}>
        {leading ? <div className="pointer-events-none absolute left-4 top-1/2 z-[var(--vlaina-z-10)] -translate-y-1/2">{leading}</div> : null}
        <input
          ref={ref}
          spellCheck={false}
          className={cn(
            'block h-11 w-full min-w-0 rounded-[var(--vlaina-ui-radius-group)] border-0 bg-transparent px-4 text-[var(--vlaina-font-sm)] text-[var(--vlaina-sidebar-chat-text)] outline-none placeholder:text-[var(--vlaina-sidebar-chat-text-soft)] focus:ring-0',
            leading && 'pl-11',
            trailing && 'pr-20',
            inputClassName
          )}
          {...props}
        />
        {trailing ? <div className="absolute inset-y-0 right-2 flex items-center gap-1">{trailing}</div> : null}
      </div>
    );
  }
);

interface SettingsTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  shellClassName?: string;
  textareaClassName?: string;
  autoGrow?: boolean;
}

export const SettingsTextarea = forwardRef<HTMLTextAreaElement, SettingsTextareaProps>(
  function SettingsTextarea(
    { shellClassName, textareaClassName, className, autoGrow = false, value, onChange, ...props },
    ref
  ) {
    const innerRef = useRef<HTMLTextAreaElement | null>(null);
    const textareaValue = typeof value === 'string'
      ? value
      : Array.isArray(value)
        ? value.join('\n')
        : '';

    const attachRef = (node: HTMLTextAreaElement | null) => {
      innerRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    };

    usePredictedTextareaHeight(innerRef, {
      value: textareaValue,
      minHeight: themeTextAreaTokens.minHeightPx,
      maxHeight: autoGrow ? themeTextAreaTokens.unboundedMaxHeightPx : themeTextAreaTokens.collapsedMaxHeightPx,
    });

    return (
      <div className={cn(fieldShellClassName, 'min-w-0', shellClassName, className)}>
        <textarea
          ref={attachRef}
          value={value}
          onChange={onChange}
          spellCheck={false}
          className={cn(
        'block w-full min-w-0 rounded-[var(--vlaina-ui-radius-group)] border-0 bg-transparent px-4 py-3 text-[var(--vlaina-font-sm)] leading-6 text-[var(--vlaina-sidebar-chat-text)] outline-none placeholder:text-[var(--vlaina-sidebar-chat-text-soft)] focus:ring-0',
            autoGrow && 'min-h-0 resize-none overflow-y-auto',
            textareaClassName
          )}
          {...props}
        />
      </div>
    );
  }
);

interface SettingsSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  'aria-label'?: string;
  'data-settings-control'?: string;
  activeColor?: string;
}

export function SettingsSwitch({
  checked,
  onChange,
  className,
  'aria-label': ariaLabel,
  'data-settings-control': dataSettingsControl,
  activeColor,
}: SettingsSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      data-settings-control={dataSettingsControl}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-[var(--vlaina-duration-200)] focus:outline-none',
        checked ? (activeColor || 'bg-[var(--vlaina-color-success)]') : 'bg-[var(--vlaina-bg-tertiary)]',
        className
      )}
    >
      <span
        className={cn(
          'inline-block h-5 w-5 rounded-full bg-[var(--vlaina-color-white)] shadow-[var(--vlaina-shadow-sm)] transition-transform duration-[var(--vlaina-duration-200)]',
          checked ? 'translate-x-[var(--vlaina-translate-22px)]' : 'translate-x-[var(--vlaina-translate-2px)]'
        )}
      />
    </button>
  );
}
