import { applyAbbrDefinitionsToTree } from './abbrMarkdown';
import { applyAlignmentCommentsToTree } from './blockAlignment';
import { applyDefinitionListsToTree } from './definitionListMarkdown';
import { applyTocShortcutsToTree } from './tocMarkdown';
import { replaceUnderlineMarkdown } from './colorMarkdown';
import {
  canTransformMarkdownAst,
  createMarkdownAstGrowthBudget,
} from './markdownAstBudget';
import { transformCalloutBlockquotes } from './remarkCalloutTransforms';
import {
  replaceDelimitedTextMark,
  replaceSingleTildeDeleteMark,
} from './remarkDelimitedMarks';
import { MAX_INLINE_HTML_CONTAINER_CHILDREN } from './remarkHtmlConstants';
import {
  replaceInlineColorHtmlContainerMark,
  replaceInlineColorHtmlMark,
  replaceInlineHtmlContainerMark,
  replaceInlineHtmlMark,
} from './remarkInlineHtmlMarks';
import { applyPlainHtmlBlockTextToTree } from './remarkPlainHtmlBlocks';
import type { MdastNode, RemarkNotesInlineExtensionsOptions } from './remarkNotesTypes';

export type { MdastNode, RemarkNotesInlineExtensionsOptions };
export { MAX_INLINE_HTML_CONTAINER_CHILDREN };

export function remarkNotesInlineExtensions(options: RemarkNotesInlineExtensionsOptions = {}) {
  return (tree: MdastNode, file?: { value?: unknown }) => {
    if (!canTransformMarkdownAst(tree)) {
      return;
    }

    const markdown = typeof file?.value === 'string' ? file.value : '';
    const growthBudget = createMarkdownAstGrowthBudget(tree);
    applyPlainHtmlBlockTextToTree(tree);
    applyDefinitionListsToTree(tree, markdown, growthBudget);
    applyTocShortcutsToTree(tree, markdown, growthBudget);
    applyAbbrDefinitionsToTree(tree, {
      markdown,
      stripDefinitions: options.stripAbbrDefinitions,
      growthBudget,
    });
    applyAlignmentCommentsToTree(tree, markdown);
    transformCalloutBlockquotes(tree, markdown, growthBudget);
    replaceDelimitedTextMark(tree, 'highlight', /==([^=]+)==/g, markdown, 2, growthBudget);
    replaceDelimitedTextMark(
      tree,
      'superscript',
      /(?<!\^)\^([^^\s](?:[^^]*?[^^\s])?)\^(?!\^)/g,
      markdown,
      1,
      growthBudget
    );
    replaceDelimitedTextMark(
      tree,
      'subscript',
      /(?<!~)~([^~\s](?:[^~]*?[^~\s])?)~(?!~)/g,
      markdown,
      1,
      growthBudget
    );
    if (markdown) {
      replaceSingleTildeDeleteMark(tree, markdown);
    }
    replaceUnderlineMarkdown(tree, markdown, growthBudget);
    replaceInlineColorHtmlMark(tree, growthBudget);
    replaceInlineHtmlMark(tree, 'highlight', /^<mark>([\s\S]*?)<\/mark>$/i, growthBudget);
    replaceInlineHtmlMark(tree, 'superscript', /^<sup>([\s\S]*?)<\/sup>$/i, growthBudget);
    replaceInlineHtmlMark(tree, 'subscript', /^<sub>([\s\S]*?)<\/sub>$/i, growthBudget);
    replaceInlineHtmlMark(tree, 'underline', /^<u>([\s\S]*?)<\/u>$/i, growthBudget);
    replaceInlineColorHtmlContainerMark(tree);
    replaceInlineHtmlContainerMark(tree, 'highlight', 'mark', false);
    replaceInlineHtmlContainerMark(tree, 'superscript', 'sup');
    replaceInlineHtmlContainerMark(tree, 'subscript', 'sub');
    replaceInlineHtmlContainerMark(tree, 'underline', 'u', false);
  };
}
