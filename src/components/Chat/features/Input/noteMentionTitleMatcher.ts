import {
  MAX_MENTION_TITLE_CHARS,
  MAX_MENTION_TITLE_SCAN_CHARS,
  MAX_MENTION_TITLE_SCAN_ITEMS,
} from './noteMentionHelpers';
import { hasMentionEndBoundary, hasMentionStartBoundary } from './noteMentionBoundaries';

interface MentionLabelTrieNode {
  children: Map<string, MentionLabelTrieNode>;
  titles?: string[];
}

export interface MentionTitleMatcher {
  findInValue: (value: string) => Set<string>;
}

function findMentionLabelIndex(value: string, label: string, fromIndex = 0): number {
  let index = value.indexOf(label, fromIndex);
  while (index >= 0) {
    const end = index + label.length;
    if (hasMentionStartBoundary(value, index) && hasMentionEndBoundary(value, end)) {
      return index;
    }
    index = value.indexOf(label, index + label.length);
  }
  return -1;
}

export function valueContainsMentionLabel(value: string, title: string): boolean {
  return findMentionLabelIndex(value, `@${title}`) >= 0;
}

function createMentionLabelTrie(titles: Iterable<string>): MentionLabelTrieNode {
  const root: MentionLabelTrieNode = { children: new Map() };
  const seenTitles = new Set<string>();
  let scannedTitles = 0;
  let scannedTitleChars = 0;

  for (const title of titles) {
    scannedTitles += 1;
    if (scannedTitles > MAX_MENTION_TITLE_SCAN_ITEMS) {
      break;
    }
    if (!title || seenTitles.has(title)) {
      continue;
    }
    if (title.length > MAX_MENTION_TITLE_CHARS) {
      continue;
    }
    scannedTitleChars += title.length;
    if (scannedTitleChars > MAX_MENTION_TITLE_SCAN_CHARS) {
      break;
    }
    seenTitles.add(title);

    const label = `@${title}`;
    let node = root;
    for (let index = 0; index < label.length; index += 1) {
      const character = label[index];
      let child = node.children.get(character);
      if (!child) {
        child = { children: new Map() };
        node.children.set(character, child);
      }
      node = child;
    }
    node.titles = [...(node.titles ?? []), title];
  }

  return root;
}

export function createMentionTitleMatcher(titles: Iterable<string>): MentionTitleMatcher {
  const root = createMentionLabelTrie(titles);
  return {
    findInValue(value) {
      const matches = new Set<string>();
      if (root.children.size === 0) {
        return matches;
      }

      for (let index = 0; index < value.length; index += 1) {
        if (value[index] !== '@' || !hasMentionStartBoundary(value, index)) {
          continue;
        }

        let node: MentionLabelTrieNode | undefined = root;
        for (let cursor = index; cursor < value.length; cursor += 1) {
          node = node.children.get(value[cursor]);
          if (!node) {
            break;
          }

          if (node.titles && hasMentionEndBoundary(value, cursor + 1)) {
            for (const title of node.titles) {
              matches.add(title);
            }
          }
        }
      }

      return matches;
    },
  };
}

export function findMentionTitlesInValue(value: string, titles: Iterable<string>): Set<string> {
  if (!value.includes('@')) {
    return new Set();
  }
  return createMentionTitleMatcher(titles).findInValue(value);
}
