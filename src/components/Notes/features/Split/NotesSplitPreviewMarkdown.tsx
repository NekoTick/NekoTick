import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  READONLY_MARKDOWN_REMARK_PLUGINS,
} from '@/components/common/markdown/markdownPipeline';
import {
  ReadonlyMarkdownParagraph,
  ReadonlyMarkdownPre,
  type ReadonlyMarkdownImageProps,
} from '@/components/common/markdown/ReadonlyMarkdownBlocks';
import { ReadOnlyVideoBlock } from '@/components/common/markdown/ReadOnlyVideoBlock';
import { remarkObsidianImageEmbeds } from '@/components/common/markdown/theme-compatibility/obsidian/imageEmbed';
import { normalizeLeadingFrontmatterMarkdown } from '@/components/Notes/features/Editor/plugins/frontmatter/frontmatterMarkdown';
import { remarkReadonlyWikiLinks } from '@/components/Notes/features/Editor/plugins/links/wiki-link/wikiLinkMarkdown';
import { parseVideoUrl } from '@/lib/markdown/videoUrl';
import { normalizeAlternativeMathBlockFences } from '@/lib/notes/markdown/markdownSerializationUtils';

type MarkdownAstNode = {
  children?: MarkdownAstNode[];
  position?: {
    start?: { line?: number };
    end?: { line?: number };
  };
  type?: string;
  value?: string;
};

const READONLY_MARKDOWN_BLANK_LINE_HTML = '<div class="notes-readonly-markdown-blank-line"></div>';

function remarkReadonlyMarkdownBlankLines() {
  return (tree: MarkdownAstNode) => {
    const children = tree.children;
    if (!Array.isArray(children) || children.length < 2) {
      return;
    }

    const nextChildren: MarkdownAstNode[] = [];
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index];
      nextChildren.push(child);

      const nextChild = children[index + 1];
      const currentEndLine = child?.position?.end?.line;
      const nextStartLine = nextChild?.position?.start?.line;
      if (
        typeof currentEndLine !== 'number' ||
        typeof nextStartLine !== 'number' ||
        nextStartLine <= currentEndLine + 1
      ) {
        continue;
      }

      for (let line = currentEndLine + 1; line < nextStartLine; line += 1) {
        nextChildren.push({
          type: 'html',
          value: READONLY_MARKDOWN_BLANK_LINE_HTML,
        });
      }
    }

    tree.children = nextChildren;
  };
}

export const SPLIT_PREVIEW_REMARK_PLUGINS = [
  remarkReadonlyWikiLinks,
  remarkObsidianImageEmbeds,
  ...READONLY_MARKDOWN_REMARK_PLUGINS,
  remarkReadonlyMarkdownBlankLines,
] as any[];

export function prepareSplitPreviewMarkdown(content: string) {
  return normalizeLeadingFrontmatterMarkdown(normalizeAlternativeMathBlockFences(content));
}

function isAlreadyRenderableImageSrc(src: string): boolean {
  return /^(?:https?:|data:|blob:|attachment:|app-file:|asset:)/i.test(src);
}

export type ReactMarkdownImageProps = ReadonlyMarkdownImageProps;

interface SplitPreviewMarkdownImageProps extends ReactMarkdownImageProps {
  loadImage: (src: string) => Promise<string>;
}

export function SplitPreviewMarkdownImage({
  alt,
  className,
  loadImage,
  node: _node,
  src,
  ...props
}: SplitPreviewMarkdownImageProps) {
  const originalSrc = typeof src === 'string' ? src : '';
  const [resolvedSrc, setResolvedSrc] = useState(originalSrc);

  useEffect(() => {
    let cancelled = false;

    if (!originalSrc || isAlreadyRenderableImageSrc(originalSrc)) {
      setResolvedSrc(originalSrc);
      return () => {
        cancelled = true;
      };
    }

    setResolvedSrc('');
    void loadImage(originalSrc)
      .then((url) => {
        if (!cancelled) {
          setResolvedSrc(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedSrc(originalSrc);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadImage, originalSrc]);

  const imageBlockAttrs = originalSrc
    ? {
        'data-src': originalSrc,
        'data-inject-url': originalSrc,
        src: originalSrc,
      }
    : {};

  return (
    <span
      {...imageBlockAttrs}
      className="image-block-container md-image image-embed block w-full max-w-full"
      data-alt={alt || undefined}
    >
      <img
        {...props}
        alt={alt ?? ''}
        className={cn('block h-auto max-w-full select-none', className)}
        data-inject-url={originalSrc || undefined}
        data-src={originalSrc || undefined}
        draggable={false}
        referrerPolicy="no-referrer"
        src={resolvedSrc || originalSrc}
      />
    </span>
  );
}

export function createSplitPreviewMarkdownComponents(
  loadImage: (src: string) => Promise<string>,
) {
  return {
    img(props: ReactMarkdownImageProps) {
      const src = typeof props.src === 'string' ? props.src : '';
      if (parseVideoUrl(src)) {
        return <ReadOnlyVideoBlock src={src} title={props.alt ?? ''} />;
      }

      return <SplitPreviewMarkdownImage {...props} loadImage={loadImage} />;
    },
    p: ReadonlyMarkdownParagraph,
    pre: ReadonlyMarkdownPre,
  };
}
