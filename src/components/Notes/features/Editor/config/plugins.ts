import { gapCursorPlugin } from '@milkdown/kit/plugin/cursor';
import { floatingToolbarPlugin } from '../plugins/floating-toolbar/floatingToolbarPlugin';
import { colorMarksPlugin } from '../plugins/floating-toolbar/colorMarks';
import { blockAlignmentPlugin } from '../plugins/floating-toolbar/blockAlignmentMarkdown';
import { headingPlugin } from '../plugins/heading/headingPlugin';
import { collapsePlugin } from '../plugins/heading/collapse';
import { mathPlugin } from '../plugins/math/mathPlugin';
import { mathEditorPlugin } from '../plugins/math/mathEditorPlugin';
import { slashPlugin } from '../plugins/slash/slashPlugin';
import { slashEmojiPreviewPlugin } from '../plugins/slash/slashEmojiCommand';
import { emojiShortcutPlugin } from '../plugins/emoji-shortcut/emojiShortcutPlugin';
import { calloutPlugin } from '../plugins/callout/calloutPlugin';
import { tablePlugin } from '../plugins/table/tablePlugin';
import { selectAllPlugin } from '../plugins/select-all/selectAllPlugin';
import { highlightPlugin } from '../plugins/highlight/highlightPlugin';
import { footnotePlugin } from '../plugins/footnote/footnotePlugin';
import { deflistPlugin } from '../plugins/deflist/deflistPlugin';
import { autolinkPlugin } from '../plugins/links/autolink/autolinkPlugin';
import { linkTooltipPlugin } from '../plugins/links/tooltip/linkTooltipPlugin';
import { tocPlugin } from '../plugins/toc/tocPlugin';
import { mermaidPlugin } from '../plugins/mermaid/mermaidPlugin';
import { mermaidEditorPlugin } from '../plugins/mermaid/mermaidEditorPlugin';
import { htmlBlockEditorPlugin } from '../plugins/html-block/htmlBlockEditorPlugin';
import { remarkSourceTightHtmlBoundariesPlugin } from '../plugins/html-block/htmlBlockMarkdown';
import { htmlInlineSourceTextPlugin } from '../plugins/html-inline';
import { markdownSyntaxPlugin } from '../plugins/markdown-syntax';
import { backslashHardBreakTextPlugins } from '../plugins/hard-break';
import { codePlugin } from '../plugins/code/codePlugin';
import { codeBlockPlugins } from '../plugins/code/codeKeymap';
import { frontmatterPlugin } from '../plugins/frontmatter/frontmatterPlugin';
import { videoPlugin } from '../plugins/video/videoPlugin';
import {
  obsidianImageEmbedInputPlugin,
  obsidianImageEmbedPlugin,
} from '../theme-compatibility/obsidian/imageEmbedPlugin';
import { abbrPlugin } from '../plugins/abbr/abbrPlugin';
import { taskListClickPlugin } from '../plugins/task-list/taskListClickPlugin';
import { taskListCursorPlugin } from '../plugins/task-list/taskListCursorPlugin';
import { listTabIndentPlugin } from '../plugins/task-list/listTabIndentPlugin';
import { listCollapsePlugin } from '../plugins/collapse/listCollapse';
import { markdownLinkPlugin } from '../plugins/links/markdown-link/markdownLinkPlugin';
import { wikiLinkPlugin } from '../plugins/links/wiki-link';
import { imageBlockPlugin } from '../plugins/image-block';
import { imageUploadPlugin } from '../plugins/image-upload/imageUploadPlugin';
import { textSelectionOverlayPlugin } from '../plugins/selection/textSelectionOverlayPlugin';
import { nativeSelectedNodeClassesPlugin } from '../plugins/selection/nativeSelectedNodeClasses';
import { editorFindPlugin } from '../plugins/find/editorFindPlugin';
import { blankAreaDragBoxPlugin } from '../plugins/cursor/blankAreaDragBoxPlugin';
import { blockControlsPlugin } from '../plugins/cursor/blockControlsPlugin';
import { textBlockCaretOverlayPlugin } from '../plugins/cursor/textBlockCaretOverlayPlugin';
import { nestedListPointerCaretPlugin } from '../plugins/cursor/nestedListPointerCaretPlugin';
import { lazyScrollToSelectionPlugin } from '../plugins/cursor/lazyScrollToSelectionPlugin';
import { atomicBlockKeyboardNavigationPlugin } from '../plugins/cursor/atomicBlockKeyboardNavigationPlugin';
import { endBlankClickPlugin } from '../plugins/cursor/endBlankClickPlugin';
import { nativeDragGuardPlugin } from '../plugins/cursor/nativeDragGuard';
import { externalTextDropCursorPlugin } from '../plugins/cursor/externalTextDropCursorPlugin';
import { containerBoundaryShiftSelectionPlugin } from '../plugins/cursor/containerBoundaryShiftSelectionPlugin';
import { hrAutoParagraphPlugin } from '../plugins/hr/hrAutoParagraphPlugin';
import { autoPairPlugin } from '../plugins/pairs/autoPairPlugin';
import { titleNavigationPlugin } from '../plugins/cursor/titleNavigationPlugin';
import { typewriterModePlugin } from '../plugins/typewriter-mode';
import { editorShortcutsPlugin } from '../plugins/editorShortcutsPlugin';
import { tagTokenPlugin } from '../plugins/tags/tagTokenPlugin';
import { structuralStyleDecorationsPlugin } from '../plugins/structural/structuralStyleDecorations';
import { typoraCompatibilityDomClassesPlugin } from '../theme-compatibility/typora/domClassesPlugin';
import { themeCompatibilityDecorationsPlugin } from '../theme-compatibility/typora/decorationsPlugin';

export const customPluginGroups = [
  {
    name: 'floating-toolbar',
    plugins: [
      floatingToolbarPlugin,
      ...colorMarksPlugin,
      ...blockAlignmentPlugin,
    ],
  },
  {
    name: 'headings',
    plugins: [
      ...headingPlugin,
      collapsePlugin,
    ],
  },
  {
    name: 'math',
    plugins: [
      ...mathPlugin,
      mathEditorPlugin,
    ],
  },
  {
    name: 'blocks',
    plugins: [
      slashPlugin,
      slashEmojiPreviewPlugin,
      emojiShortcutPlugin,
      ...calloutPlugin,
      ...tablePlugin,
      selectAllPlugin,
      ...highlightPlugin,
      ...footnotePlugin,
      ...deflistPlugin,
    ],
  },
  {
    name: 'links',
    plugins: [
      autolinkPlugin,
      linkTooltipPlugin,
      markdownLinkPlugin,
      ...wikiLinkPlugin,
    ],
  },
  {
    name: 'generated-blocks',
    plugins: [
      ...tocPlugin,
      ...mermaidPlugin,
      mermaidEditorPlugin,
      remarkSourceTightHtmlBoundariesPlugin,
      htmlBlockEditorPlugin,
      htmlInlineSourceTextPlugin,
      ...backslashHardBreakTextPlugins,
      ...frontmatterPlugin,
      ...codePlugin,
      ...codeBlockPlugins,
      obsidianImageEmbedPlugin,
      obsidianImageEmbedInputPlugin,
      ...videoPlugin,
      ...abbrPlugin,
    ],
  },
  {
    name: 'lists-clipboard-images',
    plugins: [
      taskListClickPlugin,
      taskListCursorPlugin,
      listTabIndentPlugin,
      listCollapsePlugin,
      structuralStyleDecorationsPlugin,
      themeCompatibilityDecorationsPlugin,
      typoraCompatibilityDomClassesPlugin,
      imageUploadPlugin,
      ...imageBlockPlugin,
    ],
  },
  {
    name: 'interaction-overlays',
    plugins: [
      textSelectionOverlayPlugin,
      markdownSyntaxPlugin,
      nativeSelectedNodeClassesPlugin,
      editorFindPlugin,
      tagTokenPlugin,
      nativeDragGuardPlugin,
      externalTextDropCursorPlugin,
      blockControlsPlugin,
      nestedListPointerCaretPlugin,
      lazyScrollToSelectionPlugin,
      blankAreaDragBoxPlugin,
      textBlockCaretOverlayPlugin,
      atomicBlockKeyboardNavigationPlugin,
      containerBoundaryShiftSelectionPlugin,
      autoPairPlugin,
      hrAutoParagraphPlugin,
      endBlankClickPlugin,
      titleNavigationPlugin,
      typewriterModePlugin,
      editorShortcutsPlugin,
      gapCursorPlugin,
    ],
  },
];

export const customPlugins = customPluginGroups.flatMap((group) => group.plugins);
