import { themeIconTokens, themeStyleResetTokens } from '@/styles/themeTokens'
import type { AIModel } from '@/lib/ai/types'
import { cn } from '@/lib/utils'
import {
  getModelPresentationName,
  type ModelFamily,
} from '../modelFamilyRegistry'
import { raisedPillSurfaceClass } from '@/components/ui/surfaceStyles'
import { CustomModelIcon, monochromeModelIconClass } from './ModelSelectorOption'
import type { ModelSelectorThemeStyles } from '../modelSelectorTypes'

interface ModelSelectorTriggerProps {
  selectedModel: AIModel | undefined
  selectedModelFamily: ModelFamily | null
  styles: ModelSelectorThemeStyles
  isOpen: boolean
  selectModelLabel: string
  onToggle: () => void
  popupId?: string
}

export function ModelSelectorTrigger({
  selectedModel,
  selectedModelFamily,
  styles,
  isOpen,
  selectModelLabel,
  onToggle,
  popupId,
}: ModelSelectorTriggerProps) {
  return (
      <button
        type={popupId ? 'button' : undefined}
        aria-controls={popupId}
        aria-expanded={popupId ? isOpen : undefined}
        aria-haspopup={popupId ? 'listbox' : undefined}
        data-model-selector-secondary-action={popupId ? 'true' : undefined}
        onClick={onToggle}
        className={cn(
          "flex h-8 cursor-pointer items-center gap-2 rounded-full px-2.5 transition-[background-color,color,box-shadow] duration-[var(--vlaina-duration-200)] group",
          raisedPillSurfaceClass,
          selectedModel ? styles.triggerTextActive : styles.triggerText,
          styles.triggerHover
        )}
      >
        {selectedModelFamily ? (
          <img
            src={selectedModelFamily.icon}
            alt=""
            className={cn(
              "h-[var(--vlaina-size-18px)] w-[var(--vlaina-size-18px)] flex-shrink-0 rounded-[var(--vlaina-radius-3px)] object-contain",
              selectedModelFamily.monochromeIcon && monochromeModelIconClass
            )}
            draggable={false}
          />
        ) : (
          <CustomModelIcon size={themeIconTokens.sizeCompact} />
        )}
        <span className="whitespace-nowrap text-[var(--vlaina-font-15)] font-semibold tracking-tight">
          {selectedModel ? getModelPresentationName(selectedModel) : selectModelLabel}
        </span>
        {/* Chevron glyph adapted from Lucide Icons (ISC). */}
        <svg
          aria-hidden="true"
          className={cn("h-4 w-4 flex-shrink-0 opacity-[var(--vlaina-opacity-60)] transition-transform duration-[var(--vlaina-duration-200)]", isOpen && "rotate-180")}
          focusable="false"
          fill={themeStyleResetTokens.fillNone}
          stroke={themeStyleResetTokens.currentColor}
          strokeWidth={themeIconTokens.strokeDefault}
          viewBox={themeIconTokens.viewBoxDefault}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
  )
}
