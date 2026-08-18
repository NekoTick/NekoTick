import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Heading, PhrasingContent, Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { useNotesStore } from '@/stores/useNotesStore';
import type { NotesOutlineHeading } from '../../Sidebar/Outline/types';
import {
  createOutlineHeadingId,
  normalizeHeadingText,
} from '../../Sidebar/Outline/outlineUtils';
import { maskLeadingFrontmatterMarkdown } from '../plugins/frontmatter/frontmatterMarkdown';

const sourceOutlineProcessor = unified().use(remarkParse).use(remarkGfm);

function readHeadingText(nodes: readonly PhrasingContent[]): string {
  let text = '';
  const append = (node: PhrasingContent) => {
    if (node.type === 'text' || node.type === 'inlineCode') {
      text += node.value;
      return;
    }
    if (node.type === 'break') {
      text += ' ';
      return;
    }
    if (node.type === 'image' || node.type === 'imageReference') {
      text += node.alt ?? '';
      return;
    }
    if ('children' in node) {
      node.children.forEach(append);
    }
  };
  nodes.forEach(append);
  return normalizeHeadingText(text);
}

export function parseSourceOutline(markdown: string): NotesOutlineHeading[] {
  const headings: NotesOutlineHeading[] = [];
  const tree = sourceOutlineProcessor.parse(maskLeadingFrontmatterMarkdown(markdown)) as Root;
  visit(tree, 'heading', (node: Heading) => {
    const from = node.position?.start.offset;
    const to = node.position?.end.offset;
    if (from === undefined || to === undefined) return;
    const text = readHeadingText(node.children);
    headings.push({
      id: createOutlineHeadingId(headings.length, node.depth, text),
      level: node.depth,
      text,
      from,
      to,
    });
  });

  return headings;
}

function getSourceTextarea(): HTMLTextAreaElement | null {
  return document.querySelector<HTMLTextAreaElement>('[data-note-source-editor="true"]');
}

export function useSourceNotesOutline(enabled: boolean) {
  const markdown = useNotesStore((state) => enabled ? state.currentNote?.content ?? '' : '');
  const headings = useMemo(() => enabled ? parseSourceOutline(markdown) : [], [enabled, markdown]);
  const [selectionOffset, setSelectionOffset] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setSelectionOffset(0);
      return;
    }

    const textarea = getSourceTextarea();
    if (!textarea) return;
    const syncSelection = () => setSelectionOffset(textarea.selectionStart);
    syncSelection();
    textarea.addEventListener('click', syncSelection);
    textarea.addEventListener('keyup', syncSelection);
    textarea.addEventListener('select', syncSelection);
    textarea.addEventListener('input', syncSelection);
    return () => {
      textarea.removeEventListener('click', syncSelection);
      textarea.removeEventListener('keyup', syncSelection);
      textarea.removeEventListener('select', syncSelection);
      textarea.removeEventListener('input', syncSelection);
    };
  }, [enabled]);

  const activeId = useMemo(() => {
    let activeHeading: NotesOutlineHeading | null = null;
    for (const heading of headings) {
      if (heading.from > selectionOffset) break;
      activeHeading = heading;
    }
    return activeHeading?.id ?? null;
  }, [headings, selectionOffset]);

  const jumpToHeading = useCallback((headingId: string) => {
    const heading = headings.find((candidate) => candidate.id === headingId);
    const textarea = getSourceTextarea();
    if (!heading || !textarea) return;

    const scrollRoot = textarea.closest<HTMLElement>('[data-note-scroll-root="true"]');
    if (scrollRoot) {
      const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 24;
      const lineIndex = markdown.slice(0, heading.from).split('\n').length - 1;
      const headingTop = textarea.getBoundingClientRect().top + lineIndex * lineHeight;
      const rootTop = scrollRoot.getBoundingClientRect().top;
      const targetScrollTop = Math.max(0, scrollRoot.scrollTop + headingTop - rootTop - 72);
      scrollRoot.scrollTo({ top: targetScrollTop, behavior: 'auto' });
    }

    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(heading.from, heading.to);
    setSelectionOffset(heading.from);
  }, [headings, markdown]);

  return useMemo(() => ({ headings, activeId, jumpToHeading }), [activeId, headings, jumpToHeading]);
}
