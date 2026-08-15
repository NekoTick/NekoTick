import { useCallback, useEffect, useMemo, useState } from 'react';
import { stripMarkdownInline } from '@/components/common/markdown/plainText';
import { useNotesStore } from '@/stores/useNotesStore';
import type { NotesOutlineHeading } from '../../Sidebar/Outline/types';
import { createOutlineHeadingId } from '../../Sidebar/Outline/outlineUtils';

const ATX_HEADING_PATTERN = /^ {0,3}(#{1,6})(?:[ \t]+(.*?)\s*|[ \t]*)$/;
const ATX_CLOSING_SEQUENCE_PATTERN = /[ \t]+#+[ \t]*$/;
const SETEXT_HEADING_PATTERN = /^ {0,3}(=+|-+)[ \t]*$/;
const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})/;

export function parseSourceOutline(markdown: string): NotesOutlineHeading[] {
  const lines = markdown.split(/\r?\n/);
  const headings: NotesOutlineHeading[] = [];
  let offset = 0;
  let fence: { marker: string; length: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const fenceMatch = line.match(FENCE_PATTERN);
    if (fenceMatch) {
      const sequence = fenceMatch[1] ?? '';
      if (!fence) {
        fence = { marker: sequence[0] ?? '', length: sequence.length };
      } else if (sequence[0] === fence.marker && sequence.length >= fence.length) {
        fence = null;
      }
      offset += line.length + 1;
      continue;
    }

    if (fence) {
      offset += line.length + 1;
      continue;
    }

    const atxMatch = line.match(ATX_HEADING_PATTERN);
    if (atxMatch) {
      const level = atxMatch[1]?.length ?? 1;
      const rawText = (atxMatch[2] ?? '').replace(ATX_CLOSING_SEQUENCE_PATTERN, '').trim();
      const text = stripMarkdownInline(rawText).trim();
      headings.push({
        id: createOutlineHeadingId(headings.length, level, text),
        level,
        text,
        from: offset,
        to: offset + line.length,
      });
      offset += line.length + 1;
      continue;
    }

    const setextMatch = line.match(SETEXT_HEADING_PATTERN);
    const previousLine = lines[index - 1] ?? '';
    if (setextMatch && previousLine.trim() && !/^ {4}/.test(previousLine)) {
      const text = stripMarkdownInline(previousLine.trim()).trim();
      const from = offset - previousLine.length - 1;
      const level = setextMatch[1]?.startsWith('=') ? 1 : 2;
      headings.push({
        id: createOutlineHeadingId(headings.length, level, text),
        level,
        text,
        from,
        to: offset + line.length,
      });
    }

    offset += line.length + 1;
  }

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
