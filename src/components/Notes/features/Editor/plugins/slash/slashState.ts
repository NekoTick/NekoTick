import type { Selection, Transaction } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import { slashPluginKey } from './slashPluginKey';
import { getSlashMenuItems } from './slashItems';
import { filterSlashItems } from './slashQuery';
import type { SlashMenuState } from './types';

const LOOKBACK_LIMIT = 512;
const SLASH_MENU_OFFSET_Y = 4;

function getTextBeforeSelection(selection: Selection) {
  const $pos = selection.$from;
  const parent = $pos.parent as typeof $pos.parent & {
    isTextblock?: boolean;
    type?: { spec?: { code?: boolean } };
  };

  if (parent.isTextblock === false || parent.type?.spec?.code) {
    return null;
  }

  return parent.textBetween(
    Math.max(0, $pos.parentOffset - LOOKBACK_LIMIT),
    $pos.parentOffset,
    null,
    '\ufffc'
  );
}

function getCurrentToken(value: string) {
  return value.match(/(?:^|[\s([<{])(\S*)$/)?.[1] ?? '';
}

function isEscaped(value: string, index: number) {
  let backslashCount = 0;
  for (let current = index - 1; current >= 0 && value[current] === '\\'; current -= 1) {
    backslashCount += 1;
  }
  return backslashCount % 2 === 1;
}

function isInsideMarkdownLinkDestination(value: string) {
  let closingParenthesisDepth = 0;

  for (let index = value.length - 1; index >= 0; index -= 1) {
    if (isEscaped(value, index)) continue;

    const char = value[index];
    if (char === ')' || char === '）') {
      closingParenthesisDepth += 1;
      continue;
    }
    if (char !== '(' && char !== '（') continue;

    if (closingParenthesisDepth > 0) {
      closingParenthesisDepth -= 1;
      continue;
    }
    if (value[index - 1] === ']' || value[index - 1] === '】') {
      return true;
    }
  }

  return false;
}

function isSuppressedSlashContext(textBeforeSlash: string) {
  if (isInsideMarkdownLinkDestination(textBeforeSlash)) {
    return true;
  }

  const token = getCurrentToken(textBeforeSlash);
  if (!token) return false;

  if (/^(?:[a-z][a-z0-9+.-]*:\/?|www\.)\S*$/i.test(token)) {
    return true;
  }

  return /^[^\s/]*[a-z0-9-]+\.[a-z]{2,}(?:[/:?#]|$)\S*$/i.test(token);
}

export function createSlashState(): SlashMenuState {
  return {
    isOpen: false,
    query: '',
    selectedIndex: 0,
  };
}

export function createDismissedSlashState(selection: Selection): SlashMenuState {
  const slashRange = getSlashTextRangeFromSelection(selection);
  if (!slashRange) {
    return createSlashState();
  }

  return {
    ...createSlashState(),
    dismissedSlashFrom: slashRange.deleteFrom,
  };
}

function getSlashTextRangeFromSelection(selection: Selection) {
  const $pos = selection.$from;
  const textBefore = getTextBeforeSelection(selection);
  if (textBefore == null) {
    return null;
  }

  const slashIndex = textBefore.lastIndexOf('/');

  if (slashIndex === -1) {
    return null;
  }

  if (isSuppressedSlashContext(textBefore.slice(0, slashIndex))) {
    return null;
  }

  const query = textBefore.slice(slashIndex + 1);
  if (/\s/.test(query)) {
    return null;
  }

  return {
    query,
    deleteFrom: $pos.pos - (textBefore.length - slashIndex),
    deleteTo: $pos.pos,
  };
}

export function getSlashTextRange(view: EditorView) {
  return getSlashTextRangeFromSelection(view.state.selection);
}

export function canOpenSlashMenuFromSelection(selection: Selection) {
  if (selection.empty === false) {
    return false;
  }

  const textBefore = getTextBeforeSelection(selection);
  if (textBefore == null) {
    return false;
  }

  return !isSuppressedSlashContext(textBefore);
}

export function deriveSlashState(tr: Transaction, state: SlashMenuState) {
  const meta = tr.getMeta(slashPluginKey);
  if (meta) {
    return { ...state, ...meta };
  }

  if (!tr.docChanged && !tr.selectionSet) {
    return state;
  }

  if (!state.isOpen && !tr.docChanged) {
    return state;
  }

  const slashRange = getSlashTextRangeFromSelection(tr.selection);
  if (!slashRange) {
    return state.isOpen || state.dismissedSlashFrom !== undefined ? createSlashState() : state;
  }

  if (!state.isOpen && state.dismissedSlashFrom === slashRange.deleteFrom) {
    return {
      ...createSlashState(),
      dismissedSlashFrom: state.dismissedSlashFrom,
    };
  }

  const filtered = filterSlashItems(slashRange.query, getSlashMenuItems());
  if (filtered.length === 0) {
    return state.isOpen ? createSlashState() : state;
  }

  return {
    isOpen: true,
    query: slashRange.query,
    selectedIndex: slashRange.query === state.query
      ? Math.min(state.selectedIndex, filtered.length - 1)
      : 0,
  };
}

export function getSlashMenuPosition(view: EditorView) {
  const coords = view.coordsAtPos(view.state.selection.from);

  return {
    x: coords.left,
    y: coords.bottom + SLASH_MENU_OFFSET_Y,
  };
}
