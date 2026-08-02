import React, { isValidElement } from 'react';
import { getExternalLinkProps } from '@/lib/navigation/externalLinks';
import { cn } from '@/lib/utils';
import { normalizeRenderableImageSrc } from '@/components/common/markdown/imagePolicy';
import { normalizeChatMessageImageSource } from '@/lib/ai/chatImageSourcePolicy';
import { ReadOnlyMermaidBlock } from '@/components/common/markdown/ReadOnlyMermaidBlock';
import { isMermaidFenceLanguage } from '@/components/common/markdown/mermaidLanguage';
import { parseVideoUrl } from '@/lib/markdown/videoUrl';
import { translate } from '@/lib/i18n';
import { resolveCompactedChatImageSrc } from './chatInlineImageTokens';
import { MAX_CHAT_MESSAGE_IMAGE_SOURCES } from '@/components/Chat/common/messageClipboard';
import { MarkdownImage, type ImageGalleryItem } from './MarkdownImage';
import { ChatRemoteIframe } from './ChatRemoteIframe';
import { ChatRemoteVideoBlock } from './ChatRemoteVideoBlock';

const ReadOnlyCodeBlock = React.lazy(async () => {
  const mod = await import('@/components/common/code-block');
  return { default: mod.ReadOnlyCodeBlock };
});

type CreateMarkdownComponentsOptions = {
  codeBlockIndexOffset?: number;
  codeBlockIdBase?: string;
  copiedCodeBlockId?: string | null;
  getImageGallery?: () => ImageGalleryItem[];
  imageIndexOffset?: number;
  imageGallery?: ImageGalleryItem[];
  imageIdBase?: string;
  imageSrcByToken?: Map<string, string>;
  onCopyCodeBlock?: (blockId: string) => void;
  unavailableImageLabel?: string;
};

type MarkdownAnchorProps = React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  children?: React.ReactNode;
  href?: string;
};

type MarkdownCodeProps = React.HTMLAttributes<HTMLElement> & {
  children?: React.ReactNode;
  className?: string;
};

type MarkdownPreProps = Omit<MarkdownCodeProps, 'onCopy'>;

type MarkdownParagraphProps = React.HTMLAttributes<HTMLParagraphElement> & {
  children?: React.ReactNode;
};

type MarkdownTableProps = React.TableHTMLAttributes<HTMLTableElement> & {
  children?: React.ReactNode;
};

type MarkdownImageProps = {
  align?: string;
  alt?: string;
  'data-vlaina-crop'?: string;
  dataVlainaCrop?: string;
  src?: string;
  width?: string | number;
};

type MarkdownIframeProps = React.IframeHTMLAttributes<HTMLIFrameElement> & {
  node?: unknown;
};

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

function hasBlockLevelChild(children: React.ReactNode): boolean {
  const nodes = React.Children.toArray(children);
  for (const node of nodes) {
    if (!isValidElement(node)) {
      continue;
    }

    if (typeof node.type === 'string' && BLOCK_LEVEL_TAGS.has(node.type.toLowerCase())) {
      return true;
    }

    const nodeProps = node.props as {
      children?: React.ReactNode;
      node?: { tagName?: unknown };
      src?: unknown;
    };
    const renderedTagName = typeof node.type === 'string'
      ? node.type.toLowerCase()
      : typeof nodeProps.node?.tagName === 'string'
        ? nodeProps.node.tagName.toLowerCase()
        : '';
    if (renderedTagName === 'img' && parseVideoUrl(String(nodeProps.src ?? ''))) {
      return true;
    }

    const nestedChildren = nodeProps.children;
    if (nestedChildren && hasBlockLevelChild(nestedChildren)) {
      return true;
    }
  }

  return false;
}

function resolvePreCodePayload(children: React.ReactNode): {
  className?: string;
  content: React.ReactNode;
} {
  if (isValidElement(children)) {
    const props = children.props as { children?: React.ReactNode; className?: string };
    return {
      className: props.className,
      content: props.children,
    };
  }

  return {
    className: undefined,
    content: children,
  };
}

function ReadOnlyCodeBlockFallback({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <pre className={cn('my-4 overflow-x-auto rounded-2xl p-4', className)}>
      <code className="font-mono text-[length:inherit] leading-[inherit]">
        {children}
      </code>
    </pre>
  );
}

function isInternalHashHref(href: unknown): href is string {
  return typeof href === 'string' && /^#[A-Za-z0-9_-]+$/.test(href);
}

function renderUnavailableImage(unavailableImageLabel = translate('chat.imageUnavailable')) {
  return (
    <span
      className="inline-block rounded-md bg-[var(--vlaina-color-unavailable-bg)] px-2 py-1 text-[length:var(--vlaina-font-075em)] text-[var(--vlaina-color-unavailable-fg)]"
      data-chat-markdown-unavailable="true"
      data-chat-selection-excluded="true"
    >
      [{unavailableImageLabel}]
    </span>
  );
}

export function createMarkdownComponents({
  codeBlockIndexOffset = 0,
  codeBlockIdBase,
  copiedCodeBlockId,
  getImageGallery,
  imageIndexOffset = 0,
  imageGallery,
  imageIdBase,
  imageSrcByToken,
  onCopyCodeBlock,
  unavailableImageLabel,
}: CreateMarkdownComponentsOptions) {
  let imageRenderIndex = imageIndexOffset;
  let codeBlockRenderIndex = codeBlockIndexOffset;

  return {
    audio() {
      return null;
    },
    a({ href, children, ...props }: MarkdownAnchorProps) {
      if (isInternalHashHref(href)) {
        return (
          <a
            {...props}
            href={href}
            className={cn(
              props.className,
              (href.startsWith('#heading-') || href.startsWith('#user-content-heading-')) && 'toc-link'
            )}
            data-no-focus-input="true"
          >
            {children}
          </a>
        );
      }

      return (
        <a
          {...props}
          {...getExternalLinkProps(typeof href === 'string' ? href : null)}
          data-no-focus-input="true"
        >
          {children}
        </a>
      );
    },
    code({ className, children, ...props }: MarkdownCodeProps) {
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    pre({ children, ...props }: MarkdownPreProps) {
      const { className, content } = resolvePreCodePayload(children);
      const language = typeof className === 'string'
        ? className.match(/language-([\w+-]+)/)?.[1] ?? ''
        : '';
      if (isMermaidFenceLanguage(language)) {
        return <ReadOnlyMermaidBlock code={String(content ?? '')} />;
      }

      const blockId = `${codeBlockIdBase || 'code'}:${codeBlockRenderIndex}`;
      codeBlockRenderIndex += 1;

      return (
        <React.Suspense
          fallback={(
            <ReadOnlyCodeBlockFallback className={className}>
              {content}
            </ReadOnlyCodeBlockFallback>
          )}
        >
          <ReadOnlyCodeBlock
            className={className}
            blockId={blockId}
            copied={copiedCodeBlockId === blockId}
            onCopy={onCopyCodeBlock}
            {...props}
          >
            {content}
          </ReadOnlyCodeBlock>
        </React.Suspense>
      );
    },
    p({ children, ...props }: MarkdownParagraphProps) {
      if (hasBlockLevelChild(children)) {
        return <div {...props}>{children}</div>;
      }

      return <p {...props}>{children}</p>;
    },
    table({ children, ...props }: MarkdownTableProps) {
      return (
        <div className="markdown-table-scroll" data-markdown-table-scroll="true">
          <table {...props}>{children}</table>
        </div>
      );
    },
    iframe({ node: _node, ...props }: MarkdownIframeProps) {
      return <ChatRemoteIframe {...props} />;
    },
    img({ src, alt, align, width, dataVlainaCrop: cropDataProp, 'data-vlaina-crop': cropDataAttr }: MarkdownImageProps) {
      const rawSrc = typeof src === 'string' ? src : null;
      const normalizedRawSrc = normalizeRenderableImageSrc(rawSrc);
      if (!normalizedRawSrc) {
        return renderUnavailableImage(unavailableImageLabel);
      }

      const resolvedSrc = resolveCompactedChatImageSrc(normalizedRawSrc, imageSrcByToken);
      if (parseVideoUrl(resolvedSrc)) {
        return <ChatRemoteVideoBlock src={resolvedSrc} title={typeof alt === 'string' ? alt : ''} />;
      }

      const safeSrc = normalizeChatMessageImageSource(resolvedSrc);
      if (!safeSrc) {
        return renderUnavailableImage(unavailableImageLabel);
      }

      if (imageRenderIndex >= MAX_CHAT_MESSAGE_IMAGE_SOURCES) {
        imageRenderIndex += 1;
        return null;
      }

      const currentImageId = imageIdBase ? `${imageIdBase}:${imageRenderIndex}` : undefined;
      imageRenderIndex += 1;

      return (
        <MarkdownImage
          src={safeSrc}
          alt={typeof alt === 'string' ? alt : 'image'}
          align={align}
          width={typeof width === 'number' ? `${width}px` : width}
          crop={cropDataProp ?? cropDataAttr ?? null}
          imageGallery={imageGallery}
          getImageGallery={getImageGallery}
          currentImageId={currentImageId}
        />
      );
    },
    source() {
      return null;
    },
    track() {
      return null;
    },
    video() {
      return null;
    },
  };
}
