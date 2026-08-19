import { $node, $nodeAttr, $prose } from '@milkdown/kit/utils';
import type { Ctx } from '@milkdown/kit/ctx';
import { blockquoteSchema } from '@milkdown/kit/preset/commonmark';
import { Plugin, TextSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';
import type { CalloutBlockAttrs, IconData } from './types';
import { DEFAULT_CALLOUT_ICON } from './types';
import { CalloutNodeView } from './CalloutNodeView';
import {
  getCalloutIconValue,
  normalizeCalloutBackgroundColor,
  normalizeCalloutIcon,
  parseCalloutIconDatasetValue,
} from './calloutIconUtils';
import {
  getCalloutCompatibilityAttrs,
  getCalloutCompatibilityClassName,
  getCalloutTitleCompatibilityClassName,
} from './calloutThemeCompatibility';
import {
  type MdastBlockquote,
  isCalloutMarkdownBlockquote,
  runCalloutMarkdownParser,
  serializeCalloutToMarkdown,
} from './calloutMarkdown';
import { updateSchemaFactory } from '../../themeSchemaUtils';
import { markEditorUserInput } from '../shared/userInputEvents';
import { handleCalloutShortcutEnter } from './calloutShortcutEnter';
import { handleCalloutPointerSelection } from './calloutPointerSelection';

export { serializeCalloutToMarkdown } from './calloutMarkdown';

export const calloutIdAttr = $nodeAttr('callout', () => ({
  icon: {
    default: DEFAULT_CALLOUT_ICON,
    get: (dom: HTMLElement) => parseCalloutIconDatasetValue(dom.dataset.icon),
    set: (value: IconData) => ({ 'data-icon': JSON.stringify(normalizeCalloutIcon(value)) })
  },
  backgroundColor: {
    default: 'yellow',
    get: (dom: HTMLElement) => normalizeCalloutBackgroundColor(dom.dataset.bg),
    set: (value: string) => ({ 'data-bg': normalizeCalloutBackgroundColor(value) })
  }
}));

export const calloutSchema = $node('callout', () => ({
  content: 'block+',
  group: 'block',
  defining: true,
  isolating: true,
  attrs: {
    icon: { default: DEFAULT_CALLOUT_ICON },
    backgroundColor: { default: 'yellow' }
  },
  parseDOM: [{
    tag: 'div[data-type="callout"]',
    getAttrs: (dom) => {
      const el = dom as HTMLElement;
      return {
        icon: parseCalloutIconDatasetValue(el.dataset.icon),
        backgroundColor: normalizeCalloutBackgroundColor(el.dataset.bg)
      };
    }
  }],
  toDOM: (node) => {
    const attrs = node.attrs as CalloutBlockAttrs;
    const icon = normalizeCalloutIcon(attrs.icon);
    const backgroundColor = normalizeCalloutBackgroundColor(attrs.backgroundColor);
    const iconValue = getCalloutIconValue(icon);
    return [
      'div',
      {
        'data-type': 'callout',
        'data-icon': JSON.stringify(icon),
        'data-bg': backgroundColor,
        ...getCalloutCompatibilityAttrs({ ...attrs, icon, backgroundColor }),
        class: getCalloutCompatibilityClassName(backgroundColor)
      },
      [
        'div',
        { class: getCalloutTitleCompatibilityClassName(attrs.backgroundColor), contenteditable: 'false' },
        ['div', { class: 'callout-icon', contenteditable: 'false' }, iconValue],
        ['div', { class: 'callout-title-inner', 'aria-hidden': 'true' }]
      ],
      ['div', { class: 'callout-content' }, 0]
    ];
  },
  parseMarkdown: {
    match: (node) => {
      return isCalloutMarkdownBlockquote(node as MdastBlockquote);
    },
    runner: (state, node, type) => runCalloutMarkdownParser(state, node as MdastBlockquote, type)
  },
  toMarkdown: {
    match: (node) => node.type.name === 'callout',
    runner: (state, node) => serializeCalloutToMarkdown(state, node)
  }
}));

export const calloutBlockquoteSchemaOverride = (ctx: Ctx) => {
  updateSchemaFactory(ctx, blockquoteSchema.key, (prev: any) => ({
    ...prev,
    parseMarkdown: {
      ...prev.parseMarkdown,
      match: (node: MdastBlockquote) => {
        if (isCalloutMarkdownBlockquote(node)) {
          return false;
        }

        return prev.parseMarkdown?.match?.(node) ?? node.type === 'blockquote';
      },
    },
  }));
};

function findCalloutDepth(view: EditorView): number | null {
  const { $from } = view.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'callout') {
      return depth;
    }
  }

  return null;
}

function isEmptySingleParagraphCallout(view: EditorView, calloutDepth: number): boolean {
  const { $from } = view.state.selection;
  const calloutNode = $from.node(calloutDepth);
  return (
    calloutNode.childCount === 1 &&
    calloutNode.firstChild?.type === view.state.schema.nodes.paragraph &&
    calloutNode.firstChild.content.size === 0
  );
}

export function handleEmptyCalloutExit(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const paragraphType = state.schema.nodes.paragraph;
  if (!selection.empty || !paragraphType) {
    return false;
  }

  const calloutDepth = findCalloutDepth(view);
  if (calloutDepth === null || !isEmptySingleParagraphCallout(view, calloutDepth)) {
    return false;
  }

  const calloutPos = selection.$from.before(calloutDepth);
  let tr = state.tr.replaceWith(calloutPos, calloutPos + selection.$from.node(calloutDepth).nodeSize, paragraphType.create());
  tr = tr.setSelection(TextSelection.create(tr.doc, calloutPos + 1)).scrollIntoView();
  markEditorUserInput(view);
  view.dispatch(tr);
  return true;
}

export function handleCalloutModEnterExit(view: EditorView): boolean {
  const { state } = view;
  const { selection } = state;
  const paragraphType = state.schema.nodes.paragraph;
  if (!selection.empty || !paragraphType) {
    return false;
  }

  const calloutDepth = findCalloutDepth(view);
  if (calloutDepth === null) {
    return false;
  }

  const calloutPos = selection.$from.before(calloutDepth);
  const calloutNode = selection.$from.node(calloutDepth);
  const insertPos = calloutPos + calloutNode.nodeSize;
  let tr = state.tr.insert(insertPos, paragraphType.create());
  tr = tr.setSelection(TextSelection.create(tr.doc, insertPos + 1)).scrollIntoView();
  markEditorUserInput(view);
  view.dispatch(tr);
  return true;
}

export const calloutKeymapPlugin = $prose(() => {
  return new Plugin({
    props: {
      handleDOMEvents: {
        mousedown(view, event) {
          return event instanceof MouseEvent && handleCalloutPointerSelection(view, event);
        },
      },
      handleKeyDown(view, event) {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && !event.isComposing) {
          if (!handleCalloutModEnterExit(view)) {
            return false;
          }

          event.preventDefault();
          return true;
        }

        if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.isComposing) {
          return false;
        }

        if (event.key !== 'Enter' && event.key !== 'Backspace' && event.key !== 'Delete') {
          return false;
        }

        if (event.key === 'Enter' && handleCalloutShortcutEnter(view)) {
          event.preventDefault();
          return true;
        }

        if (!handleEmptyCalloutExit(view)) {
          return false;
        }

        event.preventDefault();
        return true;
      },
      nodeViews: {
        callout: (node, view, getPos) => new CalloutNodeView(node, view, getPos as () => number | undefined),
      },
    },
  });
});

export const calloutPlugin = [
  calloutBlockquoteSchemaOverride,
  calloutIdAttr,
  calloutSchema,
  calloutKeymapPlugin
];
