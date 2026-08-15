import type { MilkdownPlugin } from '@milkdown/ctx'

import {
  emphasisAttr,
  emphasisSchema,
  inlineCodeAttr,
  inlineCodeSchema,
  linkAttr,
  linkSchema,
  markdownSyntaxSchema,
  strongAttr,
  strongSchema,
} from '../mark'
import {
  blockquoteAttr,
  blockquoteSchema,
  bulletListAttr,
  bulletListSchema,
  codeBlockAttr,
  codeBlockSchema,
  docSchema,
  hardbreakAttr,
  hardbreakSchema,
  headingAttr,
  headingIdGenerator,
  headingSchema,
  hrAttr,
  hrSchema,
  htmlAttr,
  htmlBlockSchema,
  htmlSchema,
  imageAttr,
  imageSchema,
  listItemAttr,
  listItemSchema,
  orderedListAttr,
  orderedListSchema,
  paragraphAttr,
  paragraphSchema,
  textSchema,
} from '../node'

/// @internal
export const schema: MilkdownPlugin[] = [
  docSchema,

  paragraphAttr,
  paragraphSchema,

  headingIdGenerator,
  headingAttr,
  headingSchema,

  hardbreakAttr,
  hardbreakSchema,

  blockquoteAttr,
  blockquoteSchema,

  codeBlockAttr,
  codeBlockSchema,

  hrAttr,
  hrSchema,

  imageAttr,
  imageSchema,

  bulletListAttr,
  bulletListSchema,

  orderedListAttr,
  orderedListSchema,

  listItemAttr,
  listItemSchema,

  markdownSyntaxSchema,

  emphasisAttr,
  emphasisSchema,

  strongAttr,
  strongSchema,

  inlineCodeAttr,
  inlineCodeSchema,

  linkAttr,
  linkSchema,

  htmlAttr,
  htmlBlockSchema,
  htmlSchema,

  textSchema,
].flat()
