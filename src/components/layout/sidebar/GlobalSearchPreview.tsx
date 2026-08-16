import { MessageItem } from '@/components/Chat/features/Messages/components/MessageItem';
import { NotesSplitPreviewPane } from '@/components/Notes/features/Split/NotesSplitPreviewPane';
import type { WhiteboardSnapshot } from '@/components/Whiteboard/model/document';
import type { ChatMessage } from '@/lib/ai/types';
import {
  GlobalSearchGraphPreviewButton,
  GlobalSearchLocalGraphPreview,
} from './GlobalSearchGraphPreview';
import type { GlobalSearchResult } from './globalSearchResults';
import { GlobalWhiteboardSearchPreview } from './GlobalWhiteboardSearchPreview';

const MAX_CHAT_PREVIEW_MESSAGES = 8;
const MAX_CHAT_PREVIEW_MESSAGE_CHARS = 8_000;
const MAX_CHAT_PREVIEW_IMAGES = 4;
const MAX_CHAT_PREVIEW_WEB_SEARCH_STATUSES = 4;
const MAX_NOTE_PREVIEW_CHARS = 80_000;
const noop = () => {};
const declineCopy = () => false;

function createChatPreviewMessage(message: ChatMessage): ChatMessage {
  return {
    ...message,
    apiTranscript: undefined,
    content: message.content.slice(0, MAX_CHAT_PREVIEW_MESSAGE_CHARS),
    currentVersionIndex: 0,
    imageSources: message.imageSources?.slice(0, MAX_CHAT_PREVIEW_IMAGES),
    versions: [],
    webSearchStatuses: message.webSearchStatuses?.slice(-MAX_CHAT_PREVIEW_WEB_SEARCH_STATUSES),
  };
}

export function GlobalSearchPreview({
  activeBoardId,
  activeSnapshot,
  chatMessages,
  notesRootPath,
  noteContent,
  onOpenGraph,
  result,
}: {
  activeBoardId: string | null;
  activeSnapshot: WhiteboardSnapshot | null;
  chatMessages: ChatMessage[];
  notesRootPath: string;
  noteContent: string;
  onOpenGraph: (path: string) => void;
  result: GlobalSearchResult;
}) {
  if (result.kind === 'graph') {
    return (
      <GlobalSearchLocalGraphPreview
        focusPath={result.node.id}
        onOpenPath={onOpenGraph}
      />
    );
  }

  if (result.kind === 'notes') {
    const path = result.note.openPath ?? result.note.path;
    return (
      <div className="relative h-full min-h-0">
        <NotesSplitPreviewPane
          content={noteContent.slice(0, MAX_NOTE_PREVIEW_CHARS)}
          path={path}
          title={result.title}
          interactive={false}
          showChrome={false}
          onActivate={() => undefined}
          onClose={() => undefined}
        />
        {!result.note.isExternal ? (
          <GlobalSearchGraphPreviewButton focusPath={path} onOpenGraph={onOpenGraph} />
        ) : null}
      </div>
    );
  }

  if (result.kind === 'whiteboard') {
    return (
      <GlobalWhiteboardSearchPreview
        activeBoardId={activeBoardId}
        activeSnapshot={activeSnapshot}
        board={result.board}
        notesRootPath={notesRootPath}
      />
    );
  }

  const visibleMessages = chatMessages.slice(-MAX_CHAT_PREVIEW_MESSAGES);
  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <h3 className="mb-5 text-[length:var(--vlaina-font-15)] font-semibold text-[var(--vlaina-text-primary)]">
        {result.title}
      </h3>
      <div className="pointer-events-none mx-auto w-full max-w-[var(--vlaina-size-850px)] space-y-8 px-4 [&_[data-chat-message-actions]]:hidden">
        {visibleMessages.map((message, index) => {
          const previewMessage = createChatPreviewMessage(message);
          return (
            <MessageItem
              key={message.id}
              msg={previewMessage}
              isLoading={false}
              isLastMessage={index === visibleMessages.length - 1}
              onCopy={declineCopy}
              onRegenerate={noop}
              onSwitchVersion={noop}
            />
          );
        })}
      </div>
    </div>
  );
}
