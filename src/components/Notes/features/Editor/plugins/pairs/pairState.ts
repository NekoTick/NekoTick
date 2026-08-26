import { PluginKey } from '@milkdown/kit/prose/state';

import { recoverSelectionAutoClosers } from './pairRecovery';
import { closePairSpecs } from './pairSpecs';
import type {
  AutoInsertedCloser,
  DocLike,
  EditorStateLike,
  TransactionLike,
} from './pairTypes';

export type { AutoInsertedCloser } from './pairTypes';

type PairStateMeta =
  | { type: 'add-auto-closers'; entries: AutoInsertedCloser[] }
  | { type: 'skip-auto-closer' };

export const autoPairPluginKey = new PluginKey<AutoInsertedCloser[]>('autoPair');

const HISTORY_META_KEY = 'history$';

function isHistoryTransaction(tr: { getMeta?: (key: string) => unknown }): boolean {
  return tr.getMeta?.(HISTORY_META_KEY) != null;
}

function isPairStateMeta(value: unknown): value is PairStateMeta {
  if (!value || typeof value !== 'object') return false;
  const meta = value as Partial<PairStateMeta>;
  if (meta.type !== 'add-auto-closers' || !Array.isArray(meta.entries)) return false;
  return meta.entries.every((entry) =>
    entry &&
    typeof entry === 'object' &&
    typeof (entry as AutoInsertedCloser).close === 'string' &&
    typeof (entry as AutoInsertedCloser).pos === 'number',
  );
}

function getDocCharAt(
  doc: DocLike,
  pos: number,
): string {
  if (pos < 0 || pos >= doc.content.size) return '';
  return doc.textBetween(pos, pos + 1, '', '');
}

function mapAutoInsertedClosers(
  entries: AutoInsertedCloser[],
  tr: TransactionLike,
  newDoc: DocLike,
): AutoInsertedCloser[] {
  const mapped = tr.docChanged
    ? entries.flatMap((entry) => {
        const result = tr.mapping.mapResult
          ? tr.mapping.mapResult(entry.pos, 1)
          : { pos: tr.mapping.map(entry.pos, 1), deleted: false };
        if (result.deleted) return [];
        return [{ ...entry, pos: result.pos }];
      })
    : entries;

  const nextEntries = mapped.filter((entry) => {
    if (!closePairSpecs.has(entry.close)) return false;
    return getDocCharAt(newDoc, entry.pos) === entry.close;
  });

  const deduped = new Map<string, AutoInsertedCloser>();
  nextEntries.forEach((entry) => {
    deduped.set(`${entry.pos}:${entry.close}`, entry);
  });

  return Array.from(deduped.values()).sort((a, b) => a.pos - b.pos);
}

export function getAutoInsertedClosers(state: {
  doc: DocLike;
}): AutoInsertedCloser[] {
  return autoPairPluginKey.getState(state as never) ?? [];
}

export function hasAutoInsertedCloserAt(
  state: {
    doc: DocLike;
  },
  pos: number,
  close: string,
): boolean {
  return getAutoInsertedClosers(state).some((entry) => entry.pos === pos && entry.close === close);
}

export function createAddAutoClosersMeta(entries: AutoInsertedCloser[]): PairStateMeta {
  return { type: 'add-auto-closers', entries };
}

export function createSkipAutoCloserMeta(): PairStateMeta {
  return { type: 'skip-auto-closer' };
}

export function transactionSkippedAutoCloser(tr: {
  getMeta?: (key: typeof autoPairPluginKey) => unknown;
}): boolean {
  const meta = tr.getMeta?.(autoPairPluginKey) as Partial<PairStateMeta> | undefined;
  return meta?.type === 'skip-auto-closer';
}

export { findRecoverableAutoCloserFromSelection } from './pairRecovery';

export const autoPairPluginState = {
  init(): AutoInsertedCloser[] {
    return [];
  },
  apply(
    tr: TransactionLike,
    value: AutoInsertedCloser[],
    _oldState: unknown,
    newState: EditorStateLike,
  ): AutoInsertedCloser[] {
    const mapped = mapAutoInsertedClosers(value, tr, newState.doc);
    const meta = tr.getMeta?.(autoPairPluginKey);

    if (isPairStateMeta(meta) && meta.type === 'add-auto-closers') {
      return mapAutoInsertedClosers([...mapped, ...meta.entries], {
        docChanged: false,
        mapping: tr.mapping,
      }, newState.doc);
    }

    const recovered = isHistoryTransaction(tr)
      ? recoverSelectionAutoClosers(newState)
      : tr.docChanged && value.length > 0
        ? recoverSelectionAutoClosers(newState)
        : [];

    return mapAutoInsertedClosers([...mapped, ...recovered], {
      docChanged: false,
      mapping: tr.mapping,
    }, newState.doc);
  },
};
