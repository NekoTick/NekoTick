import type { AIModel } from '@/lib/ai/types'

export type ModelSelectorTheme = 'chat' | 'notes'

export interface ModelSelectorAccessibility {
  activeOptionId?: string
  addFavoriteLabel: string
  enabled: boolean
  listboxId: string
  optionIdPrefix: string
  priceTierLabel: (tier: string) => string
  removeFavoriteLabel: string
  selectModelLabel: string
  settingsLabel: string
}

export interface ModelSelectorThemeStyles {
  triggerHover: string
  triggerText: string
  triggerTextActive: string
  sectionLabel: string
  divider: string
  inputText: string
  inputPlaceholder: string
  settingsButton: string
  categoryHover: string
  optionText: string
  optionTextActive: string
  emptyText: string
}

export type ModelSelectorListRow =
  | {
      type: 'label'
      id: string
      providerName: string
    }
  | {
      type: 'model'
      id: string
      model: AIModel
    }
