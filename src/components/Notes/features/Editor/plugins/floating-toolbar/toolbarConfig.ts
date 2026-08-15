import { EDITOR_ICONS } from '@/components/ui/icons/editor-svgs';
import type { MessageKey } from '@/lib/i18n';

export interface ToolbarButtonConfig {
  action: string;
  icon: string;
  tooltipKey: MessageKey;
  shortcut?: string;
  mark?: string;
}

export type ToolbarLayout = 'default' | 'heading' | 'codeBlock';
export type ToolbarGroupKey = 'ai' | 'block' | 'alignment' | 'format' | 'linkColor' | 'copyDelete';

export const FORMAT_BUTTONS: ToolbarButtonConfig[] = [
  { action: 'bold', icon: EDITOR_ICONS.bold, tooltipKey: 'shortcut.action.bold', shortcut: 'Ctrl+B', mark: 'strong' },
  { action: 'italic', icon: EDITOR_ICONS.italic, tooltipKey: 'shortcut.action.italic', shortcut: 'Ctrl+I', mark: 'emphasis' },
  { action: 'underline', icon: EDITOR_ICONS.underline, tooltipKey: 'shortcut.action.underline', shortcut: 'Ctrl+U', mark: 'underline' },
  { action: 'strike', icon: EDITOR_ICONS.strike, tooltipKey: 'shortcut.action.strikethrough', shortcut: 'Ctrl+Shift+5', mark: 'strike_through' },
  { action: 'code', icon: EDITOR_ICONS.code, tooltipKey: 'shortcut.action.inlineCode', shortcut: 'Ctrl+Shift+`', mark: 'inlineCode' },
  { action: 'highlight', icon: EDITOR_ICONS.highlight, tooltipKey: 'editor.highlight', shortcut: 'Ctrl+H', mark: 'highlight' },
];

export const EXTRA_BUTTONS: ToolbarButtonConfig[] = [
  { action: 'link', icon: EDITOR_ICONS.link, tooltipKey: 'editor.addLink', shortcut: 'Ctrl+K' },
  { action: 'color', icon: EDITOR_ICONS.color, tooltipKey: 'editor.textColor' },
  { action: 'copy', icon: EDITOR_ICONS.copy, tooltipKey: 'common.copy' },
  { action: 'delete', icon: EDITOR_ICONS.trash, tooltipKey: 'common.delete' },
];

export const TOOLBAR_LAYOUTS: Record<ToolbarLayout, ToolbarGroupKey[]> = {
  default: ['ai', 'block', 'alignment', 'format', 'linkColor', 'copyDelete'],
  heading: ['ai', 'block', 'alignment', 'linkColor', 'copyDelete'],
  codeBlock: ['block', 'copyDelete'],
};
