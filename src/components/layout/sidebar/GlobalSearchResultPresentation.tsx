import { SidebarLiveNoteFileIcon } from '@/components/Notes/features/Sidebar/SidebarNoteFileIcon';
import { Icon } from '@/components/ui/icons';
import { useI18n } from '@/lib/i18n';
import { themeIconTokens } from '@/styles/themeTokens';
import type { GlobalSearchKind, GlobalSearchResult } from './globalSearchResults';

export function getGlobalSearchGroupLabel(
  kind: GlobalSearchKind,
  t: ReturnType<typeof useI18n>['t'],
) {
  return t(
    kind === 'notes'
      ? 'app.viewNotes'
      : kind === 'graph'
        ? 'app.viewGraph'
        : kind === 'chat' ? 'app.viewChat' : 'app.viewWhiteboard',
  );
}

export function GlobalSearchResultIcon({
  result,
  notesRootPath,
}: {
  result: GlobalSearchResult;
  notesRootPath: string;
}) {
  if (result.kind === 'notes') {
    return (
      <SidebarLiveNoteFileIcon
        notePath={result.note.path}
        notesRootPath={result.note.isExternal ? undefined : notesRootPath}
      />
    );
  }
  return (
    <Icon
      name={result.kind === 'graph'
        ? 'graph.network'
        : result.kind === 'chat' ? 'common.shootingStar' : 'editor.diagram'}
      size={themeIconTokens.sizeCompact}
      className="text-[var(--vlaina-accent)]"
    />
  );
}
