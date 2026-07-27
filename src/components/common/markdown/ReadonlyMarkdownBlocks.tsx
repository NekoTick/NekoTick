import { Children, isValidElement, type HTMLAttributes, type ImgHTMLAttributes, type ReactNode } from 'react';
import { parseVideoUrl } from '@/lib/markdown/videoUrl';
import { ReadOnlyMermaidBlock } from './ReadOnlyMermaidBlock';
import { isMermaidFenceLanguage } from './mermaidLanguage';

export interface ReadonlyMarkdownImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  node?: unknown;
}

export interface ReadonlyMarkdownParagraphProps extends HTMLAttributes<HTMLParagraphElement> {
  children?: ReactNode;
  node?: unknown;
}

export interface ReadonlyMarkdownPreProps extends HTMLAttributes<HTMLPreElement> {
  children?: ReactNode;
  node?: unknown;
}

const BLOCK_LEVEL_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'details',
  'dialog',
  'div',
  'dl',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
]);

function hasBlockLevelChild(children: ReactNode): boolean {
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;

    const props = child.props as {
      children?: ReactNode;
      node?: { tagName?: unknown };
      src?: unknown;
    };
    const tagName = typeof child.type === 'string'
      ? child.type.toLowerCase()
      : typeof props.node?.tagName === 'string'
        ? props.node.tagName.toLowerCase()
        : '';
    if (BLOCK_LEVEL_TAGS.has(tagName)) return true;
    if (tagName === 'img' && parseVideoUrl(props.src)) return true;
    if (props.children && hasBlockLevelChild(props.children)) return true;
  }

  return false;
}

export function ReadonlyMarkdownParagraph({
  children,
  node: _node,
  ...props
}: ReadonlyMarkdownParagraphProps) {
  return hasBlockLevelChild(children)
    ? <div {...props}>{children}</div>
    : <p {...props}>{children}</p>;
}

export function ReadonlyMarkdownPre({
  children,
  node: _node,
  ...props
}: ReadonlyMarkdownPreProps) {
  if (isValidElement(children)) {
    const codeProps = children.props as { children?: ReactNode; className?: string };
    const language = codeProps.className?.match(/language-([\w+-]+)/)?.[1] ?? '';
    if (isMermaidFenceLanguage(language)) {
      return <ReadOnlyMermaidBlock code={String(codeProps.children ?? '')} />;
    }
  }

  return <pre {...props}>{children}</pre>;
}
