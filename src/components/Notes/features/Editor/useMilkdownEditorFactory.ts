import { useEffect, useRef } from 'react';
import { useEditor } from '@milkdown/react';
import {
  Editor,
  rootCtx,
  defaultValueCtx,
  prosePluginsCtx,
  remarkStringifyOptionsCtx,
  virtualizeEditorViewCtx,
} from '@milkdown/kit/core';
import { commonmark } from '@milkdown/kit/preset/commonmark';
import { gfm, remarkGFMPlugin } from '@milkdown/kit/preset/gfm';
import { history } from '@milkdown/kit/plugin/history';
import { tableBlock } from '@milkdown/kit/component/table-block';
import { clipboardPlugin } from './plugins/clipboard/clipboardPlugin';
import { configureTheme } from './theme';
import { customPlugins } from './config/plugins';
import { notesRemarkGfmOptions, notesRemarkStringifyOptions } from './config/stringifyOptions';
import { createDeferredMarkdownUpdatePlugin } from './utils/deferredMarkdownUpdatePlugin';
import { normalizeLeadingFrontmatterMarkdown } from './plugins/frontmatter/frontmatterMarkdown';
import {
  normalizeAlternativeMathBlockFences,
  preserveMarkdownBlankLinesForEditor,
} from '@/lib/notes/markdown/markdownSerializationUtils';
import {
  createLargePlainMarkdownDocJSON,
  shouldUseVirtualizedEditorView,
} from './milkdownLargePlainMarkdown';
import { logE2EMilkdownTiming } from './milkdownE2ETiming';
import type { ActiveMilkdownEditor, MilkdownDefaultValue } from './MilkdownEditorInnerTypes';
import type { MilkdownContext } from './hooks/pendingMarkdownAutosaveTypes';

export function useMilkdownEditorFactory(args: {
  activateEditor: (editor: ActiveMilkdownEditor) => void;
  cleanupActivatedEditor: () => void;
  configureMarkdownListener: (ctx: MilkdownContext, initialContent: string) => (markdown: string) => void;
  currentNotePath: string | undefined;
  currentNoteContent: string;
  initialContent: string;
  shouldSerializeEditorMarkdown: () => boolean;
  activatedEditorRef: React.MutableRefObject<ActiveMilkdownEditor | null>;
}) {
  const {
    activateEditor,
    cleanupActivatedEditor,
    configureMarkdownListener,
    currentNoteContent,
    currentNotePath,
    initialContent,
    shouldSerializeEditorMarkdown,
    activatedEditorRef,
  } = args;
  const configureMarkdownListenerRef = useRef(configureMarkdownListener);
  const currentNoteContentRef = useRef(currentNoteContent);
  const markdownListenerRef = useRef<((markdown: string) => void) | null>(null);
  const milkdownContextRef = useRef<MilkdownContext | null>(null);
  configureMarkdownListenerRef.current = configureMarkdownListener;
  currentNoteContentRef.current = currentNoteContent;

  useEffect(() => {
    const ctx = milkdownContextRef.current;
    if (!ctx) {
      return;
    }
    markdownListenerRef.current = configureMarkdownListenerRef.current(
      ctx,
      currentNoteContentRef.current,
    );
  }, [configureMarkdownListener]);

  const { get } = useEditor((root) => {
    const editorFactoryStartedAt = performance.now();
    const editor = Editor.make()
      .config((ctx) => {
        const configStartedAt = performance.now();
        const normalizedMath = normalizeAlternativeMathBlockFences(initialContent);
        logE2EMilkdownTiming('initial-content', {
          notePath: currentNotePath,
          inputLength: initialContent.length,
          durationMs: Math.round(performance.now() - configStartedAt),
        });
        const normalizedFrontmatter = normalizeLeadingFrontmatterMarkdown(normalizedMath);
        const blankLineStartedAt = performance.now();
        const defaultMarkdown = preserveMarkdownBlankLinesForEditor(
          normalizedFrontmatter
        );
        const defaultJsonStartedAt = performance.now();
        const defaultJson = createLargePlainMarkdownDocJSON(defaultMarkdown);
        const defaultValue: MilkdownDefaultValue = defaultJson
          ? { type: 'json', value: defaultJson }
          : defaultMarkdown;
        if (defaultJson) {
          logE2EMilkdownTiming('default-json', {
            notePath: currentNotePath,
            inputLength: defaultMarkdown.length,
            blockCount: defaultJson.content?.length ?? 0,
            durationMs: Math.round(performance.now() - defaultJsonStartedAt),
          });
        }
        logE2EMilkdownTiming('default-value', {
          notePath: currentNotePath,
          inputLength: initialContent.length,
          outputLength: defaultMarkdown.length,
          valueType: typeof defaultValue === 'string' ? 'markdown' : defaultValue.type,
          durationMs: Math.round(performance.now() - blankLineStartedAt),
        });

        ctx.set(rootCtx, root);
        ctx.set(defaultValueCtx, defaultValue as never);
        ctx.set(virtualizeEditorViewCtx, shouldUseVirtualizedEditorView(defaultMarkdown));
        ctx.update(remarkStringifyOptionsCtx, (prev) => ({
          ...prev,
          ...notesRemarkStringifyOptions,
        }));
        ctx.set(remarkGFMPlugin.options.key, notesRemarkGfmOptions);

        milkdownContextRef.current = ctx;
        markdownListenerRef.current = configureMarkdownListenerRef.current(ctx, normalizedMath);
        ctx.update(prosePluginsCtx, (plugins) => plugins.concat(
          createDeferredMarkdownUpdatePlugin(ctx, (markdown) => {
            markdownListenerRef.current?.(markdown);
          }, {
            shouldSerialize: shouldSerializeEditorMarkdown,
          })
        ));
        logE2EMilkdownTiming('config', {
          notePath: currentNotePath,
          durationMs: Math.round(performance.now() - configStartedAt),
        });
      })
      .use(clipboardPlugin)
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(configureTheme)
      .use(tableBlock)
      .use(customPlugins);

    const statusEditor = editor as unknown as ActiveMilkdownEditor;
    statusEditor.onStatusChange?.((status: string) => {
      if (status === 'Created') {
        logE2EMilkdownTiming('created', {
          notePath: currentNotePath,
          totalSinceFactoryMs: Math.round(performance.now() - editorFactoryStartedAt),
        });
        activateEditor(statusEditor);
      }
      if (status === 'OnDestroy' || status === 'Destroyed') {
        if (activatedEditorRef.current === statusEditor) {
          cleanupActivatedEditor();
        }
      }
    });

    return editor;
  }, []);


  return { get };
}
