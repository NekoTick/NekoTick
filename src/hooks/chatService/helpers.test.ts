import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_ATTACHMENT_IMAGE_BYTES, type Attachment } from '@/lib/storage/attachmentStorage';
import {
  MAX_NOTE_MENTION_PATH_CHARS,
  MAX_NOTE_MENTION_SCAN_ITEMS,
  MAX_NOTE_MENTION_TITLE_CHARS,
  type NoteMentionReference,
} from '@/lib/ai/noteMentions';
import {
  authorizeExternalNoteMentionPath,
  clearAuthorizedExternalNoteMentionPaths,
} from '@/lib/ai/authorizedExternalNoteMentions';
import {
  buildMessageFileAttachmentContext,
  buildMessageFileAttachmentMentionText,
  buildMessageImageSources,
  buildMentionedNotesContext,
  buildStoredUserMessageContent,
  MAX_CHAT_MENTION_LOAD_CONCURRENCY,
  MAX_CHAT_MESSAGE_IMAGE_ATTACHMENTS,
  MAX_MENTIONED_NOTES_CONTEXT_CHARS,
  limitChatMessageImageAttachments,
  loadMentionedFolderImageAttachments,
  loadMentionedNotes,
  normalizeNoteMentions,
  refreshManagedBudgetIfNeeded,
} from './helpers';
import { buildSendMessageStorageContent } from './sendMessagePayloads';

const MAX_NOTE_MENTION_READ_BYTES = 512 * 1024;

const mocks = vi.hoisted(() => ({
  isConnected: false,
  refreshBudget: vi.fn().mockResolvedValue(undefined),
  refreshBudgetIfStale: vi.fn().mockResolvedValue(undefined),
  flushCurrentPendingEditorMarkdown: vi.fn(),
  rasterizeSvgDataUrlToPng: vi.fn(),
  storage: {
    listDir: vi.fn(),
    stat: vi.fn(),
    readFile: vi.fn(),
  },
  notesState: {
    currentNote: null as { path: string; content: string } | null,
    noteContentsCache: new Map<string, { content: string; modifiedAt?: number | null; size?: number | null }>(),
    notesPath: '/notesRoot',
    rootFolder: null as null | { children: unknown[] },
    starredEntries: [] as Array<{
      id: string;
      kind: 'note' | 'folder';
      notesRootPath: string;
      relativePath: string;
      addedAt: number;
    }>,
    getDisplayName: vi.fn((path: string) => path.split('/').pop()?.replace(/\.md$/i, '') ?? path),
  },
}));

vi.mock('@/stores/accountSession', () => ({
  useAccountSessionStore: {
    getState: () => ({
      isConnected: mocks.isConnected,
    }),
  },
}));

vi.mock('@/stores/useManagedAIStore', () => ({
  useManagedAIStore: {
    getState: () => ({
      refreshBudget: mocks.refreshBudget,
      refreshBudgetIfStale: mocks.refreshBudgetIfStale,
    }),
  },
}));

vi.mock('@/stores/notes/useNotesStore', () => ({
  useNotesStore: {
    getState: () => mocks.notesState,
  },
}));

vi.mock('@/stores/notes/pendingEditorMarkdownFlusher', () => ({
  flushCurrentPendingEditorMarkdown: mocks.flushCurrentPendingEditorMarkdown,
}));

vi.mock('@/lib/markdown/svgRasterize', () => ({
  isSvgDataUrl: (value: string) => value.trim().toLowerCase().startsWith('data:image/svg+xml'),
  rasterizeSvgDataUrlToPng: mocks.rasterizeSvgDataUrlToPng,
}));

vi.mock('@/lib/storage/adapter', () => ({
  getStorageAdapter: () => mocks.storage,
  isAbsolutePath: (path: string) =>
    path.startsWith('/') ||
    /^\\\\[^\\]+\\[^\\]+/.test(path) ||
    /^[A-Za-z]:[\\/]/.test(path),
  joinPath: async (...segments: string[]) => {
    const filtered = segments.filter(Boolean);
    if (filtered.length === 0) {
      return '';
    }
    return filtered
      .map((segment, index) => {
        if (index > 0) {
          return segment.replace(/^[/\\]+/, '');
        }
        return segment.replace(/[/\\]+$/, '');
      })
      .join('/');
  },
  normalizeAbsolutePath: (path: string) => {
    const normalized = path.replace(/\\/g, '/');
    const uncMatch = normalized.match(/^(\/\/[^/]+\/[^/]+)(?:\/|$)/);
    const root = uncMatch?.[1] ?? (/^[A-Za-z]:\//.test(normalized) ? normalized.slice(0, 3) : normalized.startsWith('/') ? '/' : '');
    if (!root) {
      return path;
    }
    const rest = normalized.slice(root.length).replace(/^\/+/, '');
    const parts: string[] = [];
    for (const part of rest.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') {
        parts.pop();
        continue;
      }
      parts.push(part);
    }
    const nextPath = parts.length > 0 ? `${root}${root.endsWith('/') ? '' : '/'}${parts.join('/')}` : root;
    return path.includes('\\') ? nextPath.replace(/\//g, '\\') : nextPath;
  },
}));

function createAttachment(overrides: Partial<Attachment> = {}): Attachment {
  return {
    id: 'attachment-1',
    path: '/home/user/.vlaina/chat/attachments/demo image.png',
    previewUrl: 'data:image/png;base64,PREVIEW',
    assetUrl: 'file:///home/user/.vlaina/chat/attachments/demo%20image.png',
    name: 'demo image.png',
    type: 'image/png',
    size: 123,
    ...overrides,
  };
}

describe('chat service helpers', () => {
  beforeEach(() => {
    mocks.isConnected = false;
    mocks.refreshBudget.mockClear();
    mocks.refreshBudgetIfStale.mockClear();
    mocks.flushCurrentPendingEditorMarkdown.mockReset();
    mocks.rasterizeSvgDataUrlToPng.mockReset();
    mocks.rasterizeSvgDataUrlToPng.mockResolvedValue('data:image/png;base64,RASTER');
    mocks.storage.listDir.mockReset();
    mocks.storage.stat.mockReset();
    mocks.storage.readFile.mockReset();
    mocks.notesState.currentNote = null;
    mocks.notesState.noteContentsCache = new Map();
    mocks.notesState.notesPath = '/notesRoot';
    mocks.notesState.rootFolder = null;
    mocks.notesState.starredEntries = [];
    mocks.notesState.getDisplayName.mockClear();
  });

  it('does not refresh budget for custom providers', () => {
    mocks.isConnected = true;

    refreshManagedBudgetIfNeeded('provider-1');

    expect(mocks.refreshBudgetIfStale).not.toHaveBeenCalled();
  });

  it('does not refresh budget for managed providers after sign-out', () => {
    mocks.isConnected = false;

    refreshManagedBudgetIfNeeded('vlaina-managed');

    expect(mocks.refreshBudgetIfStale).not.toHaveBeenCalled();
  });

  it('refreshes budget for managed providers while signed in', () => {
    mocks.isConnected = true;

    refreshManagedBudgetIfNeeded('vlaina-managed');

    expect(mocks.refreshBudgetIfStale).toHaveBeenCalledTimes(1);
  });

  it('limits combined chat image attachments at the message cap', () => {
    const attachments = Array.from(
      { length: MAX_CHAT_MESSAGE_IMAGE_ATTACHMENTS + 8 },
      (_value, index) => createAttachment({
        id: `attachment-${index}`,
        path: `/home/user/.vlaina/chat/attachments/attachment-${index}.png`,
        name: `attachment-${index}.png`,
      }),
    );

    const limited = limitChatMessageImageAttachments(attachments);

    expect(limited).toHaveLength(MAX_CHAT_MESSAGE_IMAGE_ATTACHMENTS);
    expect(limited.at(0)?.id).toBe('attachment-0');
    expect(limited.at(-1)?.id).toBe(`attachment-${MAX_CHAT_MESSAGE_IMAGE_ATTACHMENTS - 1}`);
  });

  it('preserves user attachments before folder mention images when applying the message cap', () => {
    const userAttachments = Array.from(
      { length: MAX_CHAT_MESSAGE_IMAGE_ATTACHMENTS - 1 },
      (_value, index) => createAttachment({
        id: `user-${index}`,
        path: `/home/user/.vlaina/chat/attachments/user-${index}.png`,
        name: `user-${index}.png`,
      }),
    );
    const folderAttachments = [
      createAttachment({ id: 'folder-0', path: '/notesRoot/assets/folder-0.png', name: 'folder-0.png' }),
      createAttachment({ id: 'folder-1', path: '/notesRoot/assets/folder-1.png', name: 'folder-1.png' }),
    ];

    const limited = limitChatMessageImageAttachments([
      ...userAttachments,
      ...folderAttachments,
    ]);

    expect(limited).toHaveLength(MAX_CHAT_MESSAGE_IMAGE_ATTACHMENTS);
    expect(limited.at(-2)?.id).toBe(`user-${MAX_CHAT_MESSAGE_IMAGE_ATTACHMENTS - 2}`);
    expect(limited.at(-1)?.id).toBe('folder-0');
    expect(limited.some((attachment) => attachment.id === 'folder-1')).toBe(false);
  });

  it('ignores managed budget refresh failures', async () => {
    mocks.isConnected = true;
    mocks.refreshBudgetIfStale.mockRejectedValueOnce(new Error('refresh failed'));

    refreshManagedBudgetIfNeeded('vlaina-managed');
    await Promise.resolve();

    expect(mocks.refreshBudgetIfStale).toHaveBeenCalledTimes(1);
  });

  it('stores local attachment references without exposing file URLs in chat content', async () => {
    const result = await buildMessageImageSources([createAttachment()]);

    expect(result.imageSources).toEqual(['attachment://demo%20image.png']);
    expect(result.content).toBe('![image](<attachment://demo%20image.png>)');
    expect(result.content).not.toContain('file://');
  });

  it('builds text file attachment context for chat messages', async () => {
    const context = await buildMessageFileAttachmentContext([
      createAttachment({
        id: 'notes',
        path: '/home/user/.vlaina/chat/attachments/notes.md',
        previewUrl: '',
        assetUrl: 'file:///home/user/.vlaina/chat/attachments/notes.md',
        name: 'notes.md',
        type: 'text/markdown',
        textContent: '# Notes\n\nRemember this.',
      }),
      createAttachment(),
    ]);

    expect(context).toBe([
      'Attached files:',
      '',
      '<attached_file name="notes.md">',
      '# Notes',
      '',
      'Remember this.',
      '</attached_file>',
    ].join('\n'));
  });

  it('finds text attachments after the leading image attachment slots', async () => {
    const images = Array.from({ length: MAX_CHAT_MESSAGE_IMAGE_ATTACHMENTS }, (_value, index) =>
      createAttachment({ id: `image-${index}` })
    );
    const textAttachment = createAttachment({
      id: 'late-text',
      path: '/home/user/.vlaina/chat/attachments/late.txt',
      previewUrl: '',
      assetUrl: '',
      name: 'late.txt',
      type: 'text/plain',
      textContent: 'Late but still included.',
    });

    const context = await buildMessageFileAttachmentContext([...images, textAttachment]);
    const mentionText = buildMessageFileAttachmentMentionText([...images, textAttachment]);

    expect(context).toContain('Late but still included.');
    expect(mentionText).toBe('@late.txt');
  });

  it('builds @ references for text files stored in user messages', () => {
    const mentionText = buildMessageFileAttachmentMentionText([
      createAttachment({
        id: 'notes',
        previewUrl: '',
        assetUrl: 'file:///home/user/.vlaina/chat/attachments/Untitled%202.md',
        name: 'Untitled 2.md',
        type: 'text/markdown',
        textContent: '# Notes',
      }),
      createAttachment(),
    ]);

    expect(mentionText).toBe('@Untitled 2.md');
  });

  it('stores attached text files like @ file references instead of inline file context', async () => {
    const result = await buildSendMessageStorageContent({
      requestAttachments: [
        createAttachment({
          id: 'notes',
          previewUrl: '',
          assetUrl: 'file:///home/user/.vlaina/chat/attachments/Untitled%202.md',
          name: 'Untitled 2.md',
          type: 'text/markdown',
          textContent: '# Notes',
        }),
      ],
      userMessageText: 'Summarize this',
      mentionText: '',
      noteMentions: [],
    });

    expect(result.storageContent).toBe('@Untitled 2.md\n\nSummarize this');
    expect(result.storageContent).not.toContain('Attached files:');
  });

  it('loads persisted text file attachment content from trusted chat attachment paths', async () => {
    mocks.storage.readFile.mockResolvedValueOnce('Persisted file body.');

    const context = await buildMessageFileAttachmentContext([
      createAttachment({
        id: 'persisted-text',
        path: '/home/user/.vlaina/chat/attachments/persisted.txt',
        previewUrl: '',
        assetUrl: 'file:///home/user/.vlaina/chat/attachments/persisted.txt',
        name: 'persisted.txt',
        type: 'text/plain',
      }),
    ]);

    expect(mocks.storage.readFile).toHaveBeenCalledWith(
      '/home/user/.vlaina/chat/attachments/persisted.txt',
      120000,
    );
    expect(context).toContain('Persisted file body.');
  });

  it('does not resolve file attachment asset URLs without a trusted attachment path', async () => {
    const result = await buildMessageImageSources([
      createAttachment({
        path: '',
        assetUrl: 'file:///home/user/.vlaina/chat/attachments/demo%20image.png?cache=1',
        previewUrl: 'blob:preview',
      }),
    ]);

    expect(result).toEqual({ content: '', imageSources: [] });
    expect(result.content).not.toContain('file://');
  });

  it('does not rewrite remote attachment-looking asset URLs as stored attachment sources', async () => {
    const result = await buildMessageImageSources([
      createAttachment({
        path: '',
        assetUrl: 'https://example.test/attachments/demo.png',
        previewUrl: 'blob:preview',
      }),
    ]);

    expect(result.imageSources).toEqual(['https://example.test/attachments/demo.png']);
    expect(result.content).toBe('![image](<https://example.test/attachments/demo.png>)');
  });

  it('stores image sources using the same escaped markdown target as the message content', async () => {
    const result = await buildMessageImageSources([
      createAttachment({
        path: '',
        assetUrl: 'https://example.test/a>b.png',
        previewUrl: 'blob:preview',
      }),
    ]);

    expect(result.imageSources).toEqual(['https://example.test/a%3Eb.png']);
    expect(result.content).toBe('![image](<https://example.test/a%3Eb.png>)');
  });

  it('falls back to inline preview data when no persisted attachment path exists', async () => {
    const result = await buildMessageImageSources([
      createAttachment({
        path: '',
        assetUrl: '',
        previewUrl: 'data:image/png;base64,INLINE',
      }),
    ]);

    expect(result.imageSources).toEqual(['data:image/png;base64,INLINE']);
    expect(result.content).toBe('![image](<data:image/png;base64,INLINE>)');
  });

  it('falls back to case-insensitive inline preview data when no persisted attachment path exists', async () => {
    const result = await buildMessageImageSources([
      createAttachment({
        path: '',
        assetUrl: '',
        previewUrl: 'DATA:IMAGE/WEBP;BASE64,INLINE',
        type: '',
        name: 'inline.webp',
      }),
    ]);

    expect(result.imageSources).toEqual(['data:image/webp;base64,INLINE']);
    expect(result.content).toBe('![image](<data:image/webp;base64,INLINE>)');
  });

  it('drops oversized inline preview data before storing user message image markdown', async () => {
    const oversizedPayload = 'A'.repeat(Math.ceil((MAX_ATTACHMENT_IMAGE_BYTES + 1) / 3) * 4);

    const result = await buildMessageImageSources([
      createAttachment({
        path: '',
        assetUrl: '',
        previewUrl: `data:image/png;base64,${oversizedPayload}`,
      }),
    ]);

    expect(result).toEqual({ content: '', imageSources: [] });
  });

  it('stores persisted SVG attachments by attachment reference instead of inline SVG data', async () => {
    const result = await buildMessageImageSources([
      createAttachment({
        path: '/home/user/.vlaina/chat/attachments/diagram.svg',
        assetUrl: 'file:///home/user/.vlaina/chat/attachments/diagram.svg',
        previewUrl: 'data:image/svg+xml;base64,PHN2Zz4=',
        name: 'diagram.svg',
        type: 'image/svg+xml',
      }),
    ]);

    expect(result.imageSources).toEqual(['attachment://diagram.svg']);
    expect(result.content).toBe('![image](<attachment://diagram.svg>)');
    expect(result.content).not.toContain('data:image/svg+xml');
    expect(mocks.rasterizeSvgDataUrlToPng).not.toHaveBeenCalled();
  });

  it('rasterizes temporary SVG attachments before storing user message image markdown', async () => {
    const result = await buildMessageImageSources([
      createAttachment({
        path: '',
        assetUrl: '',
        previewUrl: 'data:image/svg+xml;base64,PHN2Zz4=',
        name: 'diagram.svg',
        type: 'image/svg+xml',
      }),
    ]);

    expect(mocks.rasterizeSvgDataUrlToPng).toHaveBeenCalledWith('data:image/svg+xml;base64,PHN2Zz4=');
    expect(result.imageSources).toEqual(['data:image/png;base64,RASTER']);
    expect(result.content).toBe('![image](<data:image/png;base64,RASTER>)');
  });

  it('rasterizes case-insensitive temporary SVG data attachments even when metadata is missing', async () => {
    const result = await buildMessageImageSources([
      createAttachment({
        path: '',
        assetUrl: '',
        previewUrl: 'DATA:IMAGE/SVG+XML;BASE64,PHN2Zz4=',
        name: 'diagram',
        type: '',
      }),
    ]);

    expect(mocks.rasterizeSvgDataUrlToPng).toHaveBeenCalledWith('DATA:IMAGE/SVG+XML;BASE64,PHN2Zz4=');
    expect(result.imageSources).toEqual(['data:image/png;base64,RASTER']);
    expect(result.content).toBe('![image](<data:image/png;base64,RASTER>)');
  });

  it('drops temporary SVG attachments when rasterization fails', async () => {
    mocks.rasterizeSvgDataUrlToPng.mockResolvedValueOnce(null);

    const result = await buildMessageImageSources([
      createAttachment({
        path: '',
        assetUrl: '',
        previewUrl: 'data:image/svg+xml;base64,PHN2Zz4=',
        name: 'diagram.svg',
        type: 'image/svg+xml',
      }),
    ]);

    expect(result).toEqual({ content: '', imageSources: [] });
  });

  it('bounds stored user message image attachment processing', async () => {
    const result = await buildMessageImageSources(
      Array.from({ length: MAX_CHAT_MESSAGE_IMAGE_ATTACHMENTS + 1 }, (_, index) =>
        createAttachment({
          id: `attachment-${index}`,
          path: '',
          assetUrl: `https://example.test/image-${index}.png`,
          previewUrl: 'blob:preview',
          name: `image-${index}.png`,
        })
      ),
    );

    expect(result.imageSources).toHaveLength(MAX_CHAT_MESSAGE_IMAGE_ATTACHMENTS);
    expect(result.imageSources.at(-1)).toBe(`https://example.test/image-${MAX_CHAT_MESSAGE_IMAGE_ATTACHMENTS - 1}.png`);
    expect(result.content).not.toContain(`image-${MAX_CHAT_MESSAGE_IMAGE_ATTACHMENTS}.png`);
  });

  it('converts stored user image markdown into vision message parts for resend paths', async () => {
    const content = '![image](<data:image/png;base64,INLINE>)\n\nDescribe this';

    await expect(buildStoredUserMessageContent(content)).resolves.toEqual([
      { type: 'text', text: 'Describe this' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,INLINE' } },
    ]);
  });

  it('converts case-insensitive stored user image markdown into vision message parts', async () => {
    const content = '![image](<DATA:IMAGE/PNG;BASE64,INLINE>)\n\nDescribe this';

    await expect(buildStoredUserMessageContent(content)).resolves.toEqual([
      { type: 'text', text: 'Describe this' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,INLINE' } },
    ]);
  });

  it('does not convert oversized inline image markdown into vision message parts', async () => {
    const oversizedPayload = 'A'.repeat(Math.ceil((MAX_ATTACHMENT_IMAGE_BYTES + 1) / 3) * 4);
    const content = `![image](<data:image/png;base64,${oversizedPayload}>)\n\nDescribe this`;

    await expect(buildStoredUserMessageContent(content)).resolves.toEqual([
      { type: 'text', text: 'Describe this' },
    ]);
  });

  it('keeps referenced note titles on one prompt line', () => {
    const context = buildMentionedNotesContext([
      {
        path: 'docs/alpha.md',
        title: 'Alpha\n## Injected heading',
        content: 'safe body',
      },
    ]);

    expect(context).toContain('## Alpha ## Injected heading\nsafe body');
    expect(context).not.toContain('\n## Injected heading');
  });

  it('bounds the total referenced notes prompt context', () => {
    const context = buildMentionedNotesContext(
      Array.from({ length: 40 }, (_value, index) => ({
        path: `docs/${index}.md`,
        title: `Note ${index}`,
        content: `content ${index} ${'x'.repeat(12_000)}`,
      })),
    );

    expect(context.length).toBeLessThanOrEqual(MAX_MENTIONED_NOTES_CONTEXT_CHARS);
    expect(context).toContain('## Note 0\ncontent 0');
    expect(context).not.toContain('## Note 39');
  });
});

describe('loadMentionedNotes', () => {
  beforeEach(() => {
    mocks.flushCurrentPendingEditorMarkdown.mockReset();
    mocks.notesState.currentNote = null;
    mocks.notesState.noteContentsCache = new Map();
    mocks.notesState.notesPath = '/notesRoot';
    mocks.notesState.rootFolder = null;
    mocks.notesState.starredEntries = [];
    mocks.notesState.getDisplayName.mockReset();
    mocks.notesState.getDisplayName.mockImplementation((path: string) =>
      path.split('/').pop()?.replace(/\.md$/i, '') ?? path,
    );
    mocks.storage.listDir.mockReset();
    mocks.storage.listDir.mockResolvedValue([]);
    mocks.storage.stat.mockReset();
    mocks.storage.stat.mockResolvedValue(null);
    mocks.storage.readFile.mockReset();
    mocks.storage.readFile.mockResolvedValue('');
    clearAuthorizedExternalNoteMentionPaths();
  });

  it('flushes pending editor markdown before reading the current note mention', async () => {
    mocks.notesState.currentNote = { path: 'docs/alpha.md', content: '# old' };
    mocks.notesState.noteContentsCache = new Map([
      ['docs/alpha.md', { content: '# old' }],
    ]);
    mocks.flushCurrentPendingEditorMarkdown.mockImplementation(() => {
      mocks.notesState.currentNote = {
        path: 'docs/alpha.md',
        content: '# pending edit',
      };
      mocks.notesState.noteContentsCache = new Map([
        ['docs/alpha.md', { content: '# pending edit' }],
      ]);
      return true;
    });

    const notes = await loadMentionedNotes([
      { path: 'docs/alpha.md', title: 'Alpha' },
    ]);

    expect(mocks.flushCurrentPendingEditorMarkdown).toHaveBeenCalledTimes(1);
    expect(notes).toEqual([
      { path: 'docs/alpha.md', title: 'Alpha', content: '# pending edit' },
    ]);
  });

  it('ignores malformed non-array note mentions at runtime', async () => {
    const notes = await loadMentionedNotes({ path: 'docs/alpha.md', title: 'Alpha' });

    expect(notes).toEqual([]);
    expect(mocks.storage.stat).not.toHaveBeenCalled();
    expect(mocks.storage.readFile).not.toHaveBeenCalled();
  });

  it('loads authorized external markdown note mentions', async () => {
    authorizeExternalNoteMentionPath('/outside/Untitled.md');
    mocks.storage.stat.mockResolvedValue({
      isFile: true,
      isDirectory: false,
      size: 15,
    });
    mocks.storage.readFile.mockResolvedValue('# external note');

    const notes = await loadMentionedNotes([
      { path: '/outside/Untitled.md', title: 'Untitled', kind: 'note' },
    ]);

    expect(notes).toEqual([
      {
        path: '/outside/Untitled.md',
        title: 'Untitled',
        kind: 'note',
        content: '# external note',
      },
    ]);
    expect(mocks.storage.readFile).toHaveBeenCalledWith('/outside/Untitled.md', MAX_NOTE_MENTION_READ_BYTES);
  });

  it('does not load unauthorized external markdown note mentions', async () => {
    const notes = await loadMentionedNotes([
      { path: '/outside/Untitled.md', title: 'Untitled', kind: 'note' },
    ]);

    expect(notes).toEqual([]);
    expect(mocks.storage.stat).not.toHaveBeenCalled();
    expect(mocks.storage.readFile).not.toHaveBeenCalled();
  });

  it('normalizes and caps note mentions before loading references', async () => {
    mocks.storage.stat.mockResolvedValue({
      isFile: true,
      isDirectory: false,
      size: 8,
    });
    mocks.storage.readFile.mockImplementation(async (path: string) => `# ${path.split('/').pop()}`);

    const notes = await loadMentionedNotes([
      { path: 'docs/a.md', title: 'A' },
      { path: 'docs/a.md', title: 'A duplicate' },
      { path: 'docs/b.md', title: 'B' },
      { path: 'docs/c.md', title: 'C' },
      { path: 'docs/d.md', title: 'D' },
    ]);

    expect(notes.map((note) => note.path)).toEqual([
      'docs/a.md',
      'docs/b.md',
      'docs/c.md',
    ]);
    expect(mocks.storage.readFile).toHaveBeenCalledTimes(3);
    expect(mocks.storage.readFile).not.toHaveBeenCalledWith('/notesRoot/docs/d.md', MAX_NOTE_MENTION_READ_BYTES);
  });

  it('drops unloadable note mentions before accepting them as message references', () => {
    expect(normalizeNoteMentions([
      { path: '../secret.md', title: 'Outside' },
      { path: 'https://example.com/secret.md', title: 'Remote' },
      { path: 'https:example.com/secret.md', title: 'Remote shorthand' },
      { path: 'mailto:secret.md', title: 'Mailto' },
      { path: String.raw`https\://example.com/secret.md`, title: 'Remote escaped' },
      { path: 'docs/.vlaina/config.md', title: 'Internal' },
      { path: 'docs/plain.txt', title: 'Text', kind: 'note' },
      { path: 'assets', title: 'assets/', kind: 'folder' },
      { path: 'docs/alpha.mdown', title: 'Alpha' },
    ])).toEqual([
      { path: 'assets', title: 'assets/', kind: 'folder' },
      { path: 'docs/alpha.mdown', title: 'Alpha', kind: 'note' },
    ]);
  });

  it('does not let unloadable mentions spend the note mention limit before valid markdown', async () => {
    mocks.storage.stat.mockResolvedValue({
      isFile: true,
      isDirectory: false,
      size: 8,
    });
    mocks.storage.readFile.mockImplementation(async (path: string) => `# ${path.split('/').pop()}`);

    const notes = await loadMentionedNotes([
      { path: null, title: 'Malformed' } as unknown as NoteMentionReference,
      { path: 'docs/bad-title.md', title: null } as unknown as NoteMentionReference,
      { path: '../secret.md', title: 'Outside' },
      { path: 'docs/.vlaina/config.md', title: 'Internal' },
      { path: 'mailto:secret.md', title: 'Mailto' },
      { path: 'https:example.com/secret.md', title: 'Remote shorthand' },
      { path: 'docs/not-note.txt', title: 'Text', kind: 'note' },
      { path: 'docs/alpha.md', title: 'Alpha' },
      { path: 'docs/beta.md', title: 'Beta' },
      { path: 'docs/gamma.md', title: 'Gamma' },
      { path: 'docs/delta.md', title: 'Delta' },
    ]);

    expect(notes.map((note) => note.path)).toEqual([
      'docs/bad-title.md',
      'docs/alpha.md',
      'docs/beta.md',
    ]);
    expect(mocks.storage.readFile).not.toHaveBeenCalledWith('/notesRoot/docs/not-note.txt', MAX_NOTE_MENTION_READ_BYTES);
    expect(mocks.storage.readFile).not.toHaveBeenCalledWith('/notesRoot/docs/delta.md', MAX_NOTE_MENTION_READ_BYTES);
  });

  it('bounds note mention metadata before loading references', async () => {
    mocks.storage.stat.mockResolvedValue({
      isFile: true,
      isDirectory: false,
      size: 8,
    });
    mocks.storage.readFile.mockResolvedValue('# Alpha');
    const mentions: NoteMentionReference[] = [
      {
        path: `${'x'.repeat(MAX_NOTE_MENTION_PATH_CHARS + 1)}.md`,
        title: 'Too long',
      },
      {
        path: 'docs/alpha.md',
        title: 'A'.repeat(MAX_NOTE_MENTION_TITLE_CHARS + 32),
      },
      ...Array.from({ length: MAX_NOTE_MENTION_SCAN_ITEMS }, (_value, index) => ({
        path: `docs/ignored-${index}.md`,
        title: `Ignored ${index}`,
      })),
      {
        path: 'docs/beyond-scan.md',
        title: 'Beyond scan',
      },
    ];

    const notes = await loadMentionedNotes(mentions);

    expect(notes).toHaveLength(3);
    expect(notes[0]?.path).toBe('docs/alpha.md');
    expect(notes[0]?.title).toHaveLength(MAX_NOTE_MENTION_TITLE_CHARS);
    expect(mocks.storage.readFile).not.toHaveBeenCalledWith('/notesRoot/docs/beyond-scan.md', MAX_NOTE_MENTION_READ_BYTES);
  });

  it('limits concurrent folder markdown note reads', async () => {
    mocks.notesState.rootFolder = {
      children: [
        {
          id: 'docs',
          name: 'docs',
          path: 'docs',
          isFolder: true,
          expanded: true,
          children: Array.from({ length: 12 }, (_, index) => ({
            id: `docs/${index}.md`,
            name: `${index}.md`,
            path: `docs/${index}.md`,
            isFolder: false,
          })),
        },
      ],
    };
    mocks.storage.listDir.mockResolvedValue([]);
    mocks.storage.stat.mockResolvedValue({
      isFile: true,
      isDirectory: false,
      size: 8,
    });
    let activeReads = 0;
    let maxActiveReads = 0;
    mocks.storage.readFile.mockImplementation(async (path: string) => {
      activeReads += 1;
      maxActiveReads = Math.max(maxActiveReads, activeReads);
      await Promise.resolve();
      activeReads -= 1;
      return `# ${path.split('/').pop()}`;
    });

    const notes = await loadMentionedNotes([
      { path: 'docs', title: 'Docs', kind: 'folder' },
    ]);

    expect(notes).toHaveLength(13);
    expect(maxActiveReads).toBeLessThanOrEqual(MAX_CHAT_MENTION_LOAD_CONCURRENCY);
  });

  it('includes folder listing and markdown notes for mixed folder mentions', async () => {
    mocks.notesState.rootFolder = {
      children: [
        {
          id: 'docs',
          name: 'docs',
          path: 'docs',
          isFolder: true,
          expanded: true,
          children: [
            { id: 'docs/a.md', name: 'a.md', path: 'docs/a.md', isFolder: false },
            { id: 'docs/skip.txt', name: 'skip.txt', path: 'docs/skip.txt', isFolder: false },
            {
              id: 'docs/nested',
              name: 'nested',
              path: 'docs/nested',
              isFolder: true,
              expanded: true,
              children: [
                { id: 'docs/nested/b.md', name: 'b.md', path: 'docs/nested/b.md', isFolder: false },
              ],
            },
          ],
        },
      ],
    };
    mocks.notesState.noteContentsCache = new Map([
      ['docs/a.md', { content: '# A' }],
      ['docs/nested/b.md', { content: '# B' }],
    ]);
    mocks.storage.listDir.mockResolvedValue([
      {
        name: 'a.md',
        path: '/notesRoot/docs/a.md',
        isDirectory: false,
        isFile: true,
        size: 32,
      },
      {
        name: 'cover.png',
        path: '/notesRoot/docs/cover.png',
        isDirectory: false,
        isFile: true,
        size: 4096,
      },
      {
        name: 'nested',
        path: '/notesRoot/docs/nested',
        isDirectory: true,
        isFile: false,
      },
    ]);
    mocks.notesState.getDisplayName.mockImplementation((path: string) =>
      path === 'docs/a.md' ? 'A' : path === 'docs/nested/b.md' ? 'B' : path,
    );

    const notes = await loadMentionedNotes([
      { path: 'docs', title: 'Docs', kind: 'folder' },
    ]);

    expect(notes).toHaveLength(3);
    expect(notes[0]).toMatchObject({
      path: 'docs',
      title: 'Docs',
      kind: 'folder',
    });
    expect(notes[0]?.content).toContain('Directory listing:');
    expect(notes[0]?.content).toContain('- cover.png (file, 4.0 KB)');
    expect(notes.slice(1)).toEqual([
      { path: 'docs/a.md', title: 'Docs/A', kind: 'note', content: '# A' },
      { path: 'docs/nested/b.md', title: 'Docs/B', kind: 'note', content: '# B' },
    ]);
  });

  it('includes non-md markdown notes when loading folder mentions', async () => {
    mocks.notesState.rootFolder = {
      children: [
        {
          id: 'docs',
          name: 'docs',
          path: 'docs',
          isFolder: true,
          expanded: true,
          children: [
            { id: 'docs/alpha.markdown', name: 'alpha.markdown', path: 'docs/alpha.markdown', isFolder: false },
            { id: 'docs/beta.mdown', name: 'beta.mdown', path: 'docs/beta.mdown', isFolder: false },
            { id: 'docs/gamma.mkd', name: 'gamma.mkd', path: 'docs/gamma.mkd', isFolder: false },
            { id: 'docs/skip.txt', name: 'skip.txt', path: 'docs/skip.txt', isFolder: false },
          ],
        },
      ],
    };
    mocks.notesState.noteContentsCache = new Map([
      ['docs/alpha.markdown', { content: '# Alpha' }],
      ['docs/beta.mdown', { content: '# Beta' }],
      ['docs/gamma.mkd', { content: '# Gamma' }],
    ]);

    const notes = await loadMentionedNotes([
      { path: 'docs', title: 'Docs', kind: 'folder' },
    ]);

    expect(notes.slice(1)).toEqual([
      { path: 'docs/alpha.markdown', title: 'Docs/alpha.markdown', kind: 'note', content: '# Alpha' },
      { path: 'docs/beta.mdown', title: 'Docs/beta.mdown', kind: 'note', content: '# Beta' },
      { path: 'docs/gamma.mkd', title: 'Docs/gamma.mkd', kind: 'note', content: '# Gamma' },
    ]);
  });

  it('scans a mentioned folder for markdown notes when the file tree is unavailable', async () => {
    mocks.notesState.rootFolder = null;
    mocks.storage.listDir.mockImplementation(async (path: string) => {
      if (path === '/notesRoot/docs') {
        return [
          { name: 'alpha.markdown', path: '/outside/ignored.markdown', isDirectory: false, isFile: true, size: 32 },
          { name: 'nested', path: '/outside/ignored', isDirectory: true, isFile: false },
          { name: 'skip.txt', path: '/notesRoot/docs/skip.txt', isDirectory: false, isFile: true, size: 16 },
        ];
      }
      if (path === '/notesRoot/docs/nested') {
        return [
          { name: 'beta.mdown', path: '/notesRoot/docs/nested/beta.mdown', isDirectory: false, isFile: true },
          { name: 'gamma.mkd', path: '/notesRoot/docs/nested/gamma.mkd', isDirectory: false, isFile: true },
          { name: 'huge.md', path: '/notesRoot/docs/nested/huge.md', isDirectory: false, isFile: true },
        ];
      }
      return [];
    });
    mocks.storage.stat.mockImplementation(async (path: string) => ({
      isFile: true,
      isDirectory: false,
      size: path.endsWith('/huge.md') ? 600 * 1024 : 64,
    }));
    mocks.storage.readFile.mockImplementation(async (path: string) => {
      if (path === '/notesRoot/docs/alpha.markdown') return '# Alpha';
      if (path === '/notesRoot/docs/nested/beta.mdown') return '# Beta';
      if (path === '/notesRoot/docs/nested/gamma.mkd') return '# Gamma';
      return '# Unexpected';
    });

    const notes = await loadMentionedNotes([
      { path: 'docs', title: 'Docs', kind: 'folder' },
    ]);

    expect(notes[0]).toMatchObject({
      path: 'docs',
      title: 'Docs',
      kind: 'folder',
    });
    expect(notes.slice(1)).toEqual([
      { path: 'docs/alpha.markdown', title: 'Docs/alpha', kind: 'note', content: '# Alpha' },
      { path: 'docs/nested/beta.mdown', title: 'Docs/nested/beta', kind: 'note', content: '# Beta' },
      { path: 'docs/nested/gamma.mkd', title: 'Docs/nested/gamma', kind: 'note', content: '# Gamma' },
    ]);
    expect(mocks.storage.readFile).not.toHaveBeenCalledWith('/outside/ignored.markdown', MAX_NOTE_MENTION_READ_BYTES);
    expect(mocks.storage.readFile).not.toHaveBeenCalledWith('/notesRoot/docs/nested/huge.md', MAX_NOTE_MENTION_READ_BYTES);
  });

  it('prioritizes markdown entries before applying the folder mention scan cap', async () => {
    mocks.notesState.rootFolder = null;
    mocks.storage.listDir.mockResolvedValue([
      ...Array.from({ length: 5000 }, (_value, index) => ({
        name: `asset-${String(index).padStart(4, '0')}.txt`,
        path: `/notesRoot/docs/asset-${String(index).padStart(4, '0')}.txt`,
        isDirectory: false,
        isFile: true,
        size: 16,
      })),
      {
        name: 'late.mdown',
        path: '/notesRoot/docs/late.mdown',
        isDirectory: false,
        isFile: true,
        size: 32,
      },
    ]);
    mocks.storage.stat.mockResolvedValue({ isFile: true, isDirectory: false, size: 32 });
    mocks.storage.readFile.mockResolvedValue('# Late');

    const notes = await loadMentionedNotes([
      { path: 'docs', title: 'Docs', kind: 'folder' },
    ]);

    expect(notes.map((note) => note.path)).toContain('docs/late.mdown');
    expect(mocks.storage.readFile).toHaveBeenCalledWith('/notesRoot/docs/late.mdown', MAX_NOTE_MENTION_READ_BYTES);
    expect(mocks.storage.readFile).toHaveBeenCalledTimes(1);
  });

  it('scans starred external folder mentions for markdown notes', async () => {
    mocks.notesState.rootFolder = null;
    mocks.notesState.starredEntries = [{
      id: 'external-folder',
      kind: 'folder',
      notesRootPath: '/external',
      relativePath: 'docs',
      addedAt: 1,
    }];
    mocks.storage.listDir.mockImplementation(async (path: string) => {
      if (path === '/external/docs') {
        return [
          { name: 'alpha.md', path: '/external/docs/alpha.md', isDirectory: false, isFile: true, size: 32 },
        ];
      }
      return [];
    });
    mocks.storage.stat.mockResolvedValue({ isFile: true, isDirectory: false, size: 32 });
    mocks.storage.readFile.mockResolvedValue('# External Alpha');

    const notes = await loadMentionedNotes([
      { path: '/external/docs', title: 'External Docs/', kind: 'folder' },
    ]);

    expect(notes.slice(1)).toEqual([
      {
        path: '/external/docs/alpha.md',
        title: 'External Docs/alpha',
        kind: 'note',
        content: '# External Alpha',
      },
    ]);
  });

  it('does not read note mention files when stat is unavailable', async () => {
    mocks.storage.stat.mockResolvedValue(null);
    mocks.storage.readFile.mockResolvedValue('# Unexpected');

    const notes = await loadMentionedNotes([
      { path: 'docs/alpha.md', title: 'Alpha' },
    ]);

    expect(notes).toEqual([]);
    expect(mocks.storage.stat).toHaveBeenCalledWith('/notesRoot/docs/alpha.md');
    expect(mocks.storage.readFile).not.toHaveBeenCalled();
  });

  it('loads note mention files with bounded reads when stat has no size', async () => {
    mocks.storage.stat.mockResolvedValue({ isFile: true, isDirectory: false });
    mocks.storage.readFile.mockResolvedValue('# Alpha');

    const notes = await loadMentionedNotes([
      { path: 'docs/alpha.md', title: 'Alpha' },
    ]);

    expect(notes).toEqual([
      { path: 'docs/alpha.md', title: 'Alpha', content: '# Alpha' },
    ]);
    expect(mocks.storage.readFile).toHaveBeenCalledWith('/notesRoot/docs/alpha.md', MAX_NOTE_MENTION_READ_BYTES);
  });

  it('does not read note mention files with invalid known stat sizes', async () => {
    mocks.storage.stat.mockResolvedValue({ isFile: true, isDirectory: false, size: -1 });
    mocks.storage.readFile.mockResolvedValue('# Unexpected');

    const notes = await loadMentionedNotes([
      { path: 'docs/alpha.md', title: 'Alpha' },
    ]);

    expect(notes).toEqual([]);
    expect(mocks.storage.readFile).not.toHaveBeenCalled();
  });

  it('does not load note mention content that exceeds the byte limit after read', async () => {
    mocks.storage.stat.mockResolvedValue({ isFile: true, isDirectory: false });
    mocks.storage.readFile.mockResolvedValue('你'.repeat(Math.floor(MAX_NOTE_MENTION_READ_BYTES / 3) + 1));

    const notes = await loadMentionedNotes([
      { path: 'docs/alpha.md', title: 'Alpha' },
    ]);

    expect(notes).toEqual([]);
    expect(mocks.storage.readFile).toHaveBeenCalledWith('/notesRoot/docs/alpha.md', MAX_NOTE_MENTION_READ_BYTES);
  });

  it('does not load oversized current or cached note mention content', async () => {
    const oversizedContent = 'x'.repeat(512 * 1024 + 1);
    mocks.notesState.currentNote = {
      path: 'docs/current.md',
      content: oversizedContent,
    };
    mocks.notesState.noteContentsCache = new Map([
      ['docs/cached.md', { content: oversizedContent }],
    ]);
    mocks.storage.stat.mockResolvedValue({
      isFile: true,
      isDirectory: false,
      size: 16,
    });
    mocks.storage.readFile.mockResolvedValue('# Unexpected');

    const notes = await loadMentionedNotes([
      { path: 'docs/current.md', title: 'Current' },
      { path: 'docs/cached.md', title: 'Cached' },
    ]);

    expect(notes).toEqual([]);
    expect(mocks.storage.readFile).not.toHaveBeenCalled();
  });

  it('trusts empty cached note mention content instead of reading stale disk content', async () => {
    mocks.notesState.noteContentsCache = new Map([
      ['docs/empty.md', { content: '', modifiedAt: 7 }],
      ['docs/blank.md', { content: '   \n', modifiedAt: 8 }],
    ]);
    mocks.storage.stat.mockResolvedValue({
      isFile: true,
      isDirectory: false,
      size: 16,
    });
    mocks.storage.readFile.mockResolvedValue('# Stale disk content');

    const notes = await loadMentionedNotes([
      { path: 'docs/empty.md', title: 'Empty' },
      { path: 'docs/blank.md', title: 'Blank' },
    ]);

    expect(notes).toEqual([]);
    expect(mocks.storage.stat).not.toHaveBeenCalled();
    expect(mocks.storage.readFile).not.toHaveBeenCalled();
  });

  it('does not use cached note mention content when cache has size but no modified time', async () => {
    mocks.notesState.noteContentsCache = new Map([
      ['docs/alpha.md', { content: '# Old', modifiedAt: null, size: 7 }],
      ['docs/beta.md', { content: '# Old beta', modifiedAt: null, size: null }],
    ]);
    mocks.storage.stat.mockImplementation(async (path: string) => {
      if (path.endsWith('/beta.md')) {
        return null;
      }
      return {
        isFile: true,
        isDirectory: false,
        size: 7,
      };
    });
    mocks.storage.readFile.mockResolvedValue('# New!');

    const notes = await loadMentionedNotes([
      { path: 'docs/alpha.md', title: 'Alpha' },
      { path: 'docs/beta.md', title: 'Beta' },
    ]);

    expect(notes).toEqual([
      { path: 'docs/alpha.md', title: 'Alpha', content: '# New!' },
    ]);
    expect(mocks.storage.readFile).toHaveBeenCalledWith('/notesRoot/docs/alpha.md', MAX_NOTE_MENTION_READ_BYTES);
  });

  it('includes a directory listing for folder mentions without markdown notes', async () => {
    mocks.notesState.rootFolder = {
      children: [
        {
          id: 'assets',
          name: 'assets',
          path: 'assets',
          isFolder: true,
          expanded: true,
          children: [],
        },
      ],
    };
    mocks.storage.listDir.mockImplementation(async (path: string) => {
      if (path === '/notesRoot/assets') {
        return [
          {
            name: 'cover.png',
            path: '/notesRoot/assets/cover.png',
            isDirectory: false,
            isFile: true,
            size: 2048,
          },
          {
            name: 'icons',
            path: '/notesRoot/assets/icons',
            isDirectory: true,
            isFile: false,
          },
        ];
      }

      return [];
    });

    const notes = await loadMentionedNotes([
      { path: 'assets', title: 'assets/', kind: 'folder' },
    ]);

    expect(mocks.storage.listDir).toHaveBeenCalledWith('/notesRoot/assets', { includeHidden: true });
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({
      path: 'assets',
      title: 'assets/',
      kind: 'folder',
    });
    expect(notes[0]?.content).toContain('Directory listing:');
    expect(notes[0]?.content).toContain('- icons (folder)');
    expect(notes[0]?.content).toContain('- cover.png (file, 2.0 KB)');
  });

  it('skips folder listing names with control characters', async () => {
    mocks.notesState.rootFolder = null;
    mocks.storage.listDir.mockResolvedValue([
      {
        name: 'cover.md',
        path: '/notesRoot/assets/cover.md',
        isDirectory: false,
        isFile: true,
        size: 12,
      },
      {
        name: 'cover\n## Injected.md',
        path: '/notesRoot/assets/cover.md',
        isDirectory: false,
        isFile: true,
        size: 12,
      },
    ]);

    const notes = await loadMentionedNotes([
      { path: 'assets', title: 'assets/', kind: 'folder' },
    ]);

    expect(notes[0]?.content).toContain('Folder: assets');
    expect(notes[0]?.content).toContain('- cover.md (file, 12 B)');
    expect(notes[0]?.content).not.toContain('cover ## Injected.md');
    expect(notes[0]?.content).not.toContain('\n## Injected');
  });

  it('skips folder listing and scan entries with unsafe path characters', async () => {
    mocks.notesState.rootFolder = null;
    mocks.storage.listDir.mockImplementation(async (path: string) => {
      if (path === '/notesRoot/assets') {
        return [
          {
            name: 'alpha.md',
            path: '/notesRoot/assets/alpha.md',
            isDirectory: false,
            isFile: true,
            size: 12,
          },
          {
            name: 'secret\u202Egnp.md',
            path: '/notesRoot/assets/secret.md',
            isDirectory: false,
            isFile: true,
            size: 12,
          },
          {
            name: 'broken\uFFFD.md',
            path: '/notesRoot/assets/broken.md',
            isDirectory: false,
            isFile: true,
            size: 12,
          },
        ];
      }
      return [];
    });
    mocks.storage.stat.mockResolvedValue({ isFile: true, isDirectory: false, size: 12 });
    mocks.storage.readFile.mockResolvedValue('# Alpha');

    const notes = await loadMentionedNotes([
      { path: 'assets', title: 'assets/', kind: 'folder' },
    ]);

    expect(notes.map((note) => note.path)).toEqual(['assets', 'assets/alpha.md']);
    expect(notes[0]?.content).not.toContain('secret');
    expect(notes[0]?.content).not.toContain('broken');
    expect(mocks.storage.readFile).toHaveBeenCalledWith('/notesRoot/assets/alpha.md', MAX_NOTE_MENTION_READ_BYTES);
    expect(mocks.storage.readFile).not.toHaveBeenCalledWith('/notesRoot/assets/secret\u202Egnp.md', MAX_NOTE_MENTION_READ_BYTES);
    expect(mocks.storage.readFile).not.toHaveBeenCalledWith('/notesRoot/assets/broken\uFFFD.md', MAX_NOTE_MENTION_READ_BYTES);
  });
});

describe('loadMentionedFolderImageAttachments', () => {
  beforeEach(() => {
    mocks.storage.listDir.mockReset();
    mocks.storage.stat.mockReset();
    mocks.notesState.notesPath = '/notesRoot';
    mocks.notesState.rootFolder = null;
  });

  it('creates image attachments from selected folder mentions', async () => {
    mocks.storage.listDir.mockResolvedValue([
      {
        name: 'cover.png',
        path: '/notesRoot/assets/cover.png',
        isDirectory: false,
        isFile: true,
        size: 2048,
      },
      {
        name: 'diagram.webp',
        path: '/notesRoot/assets/diagram.webp',
        isDirectory: false,
        isFile: true,
        size: 4096,
      },
      {
        name: 'readme.md',
        path: '/notesRoot/assets/readme.md',
        isDirectory: false,
        isFile: true,
        size: 128,
      },
    ]);

    const attachments = await loadMentionedFolderImageAttachments([
      { path: 'assets', title: 'assets/', kind: 'folder' },
    ]);

    expect(mocks.storage.listDir).toHaveBeenCalledWith('/notesRoot/assets');
    expect(attachments).toEqual([
      {
        id: 'folder-image:/notesRoot/assets/cover.png',
        path: '/notesRoot/assets/cover.png',
        previewUrl: '',
        assetUrl: '',
        name: 'cover.png',
        type: 'image/png',
        size: 2048,
      },
      {
        id: 'folder-image:/notesRoot/assets/diagram.webp',
        path: '/notesRoot/assets/diagram.webp',
        previewUrl: '',
        assetUrl: '',
        name: 'diagram.webp',
        type: 'image/webp',
        size: 4096,
      },
    ]);
  });

  it('normalizes and caps folder mentions before loading image attachments', async () => {
    mocks.storage.listDir.mockResolvedValue([
      {
        name: 'cover.png',
        path: '/notesRoot/assets/cover.png',
        isDirectory: false,
        isFile: true,
        size: 2048,
      },
    ]);

    const attachments = await loadMentionedFolderImageAttachments([
      { path: 'assets-a', title: 'assets-a/', kind: 'folder' },
      { path: 'assets-a', title: 'assets-a duplicate/', kind: 'folder' },
      { path: 'assets-b', title: 'assets-b/', kind: 'folder' },
      { path: 'assets-c', title: 'assets-c/', kind: 'folder' },
      { path: 'assets-d', title: 'assets-d/', kind: 'folder' },
    ]);

    expect(mocks.storage.listDir).toHaveBeenCalledTimes(3);
    expect(mocks.storage.listDir).toHaveBeenCalledWith('/notesRoot/assets-a');
    expect(mocks.storage.listDir).toHaveBeenCalledWith('/notesRoot/assets-b');
    expect(mocks.storage.listDir).toHaveBeenCalledWith('/notesRoot/assets-c');
    expect(mocks.storage.listDir).not.toHaveBeenCalledWith('/notesRoot/assets-d');
    expect(attachments.map((attachment) => attachment.path)).toEqual([
      '/notesRoot/assets-a/cover.png',
      '/notesRoot/assets-b/cover.png',
      '/notesRoot/assets-c/cover.png',
    ]);
  });

  it('skips hidden and oversized folder images', async () => {
    mocks.storage.listDir.mockResolvedValue([
      {
        name: '.hidden.png',
        path: '/notesRoot/assets/.hidden.png',
        isDirectory: false,
        isFile: true,
        size: 1024,
      },
      {
        name: 'huge.jpg',
        path: '/notesRoot/assets/huge.jpg',
        isDirectory: false,
        isFile: true,
        size: 9 * 1024 * 1024,
      },
      {
        name: 'small.jpg',
        path: '/notesRoot/assets/small.jpg',
        isDirectory: false,
        isFile: true,
        size: 1024,
      },
    ]);

    const attachments = await loadMentionedFolderImageAttachments([
      { path: 'assets', title: 'assets/', kind: 'folder' },
    ]);

    expect(attachments).toHaveLength(1);
    expect(attachments[0]?.name).toBe('small.jpg');
  });

  it('skips folder image names with unsafe path characters', async () => {
    mocks.storage.listDir.mockResolvedValue([
      {
        name: 'cover.png',
        path: '/notesRoot/assets/cover.png',
        isDirectory: false,
        isFile: true,
        size: 2048,
      },
      {
        name: 'secret\u202Egnp.png',
        path: '/notesRoot/assets/secret.png',
        isDirectory: false,
        isFile: true,
        size: 2048,
      },
      {
        name: 'broken\uFFFD.webp',
        path: '/notesRoot/assets/broken.webp',
        isDirectory: false,
        isFile: true,
        size: 2048,
      },
    ]);

    const attachments = await loadMentionedFolderImageAttachments([
      { path: 'assets', title: 'assets/', kind: 'folder' },
    ]);

    expect(attachments).toEqual([
      {
        id: 'folder-image:/notesRoot/assets/cover.png',
        path: '/notesRoot/assets/cover.png',
        previewUrl: '',
        assetUrl: '',
        name: 'cover.png',
        type: 'image/png',
        size: 2048,
      },
    ]);
  });

  it('prioritizes folder images before applying the image attachment scan cap', async () => {
    const entries = Array.from({ length: 5000 }, (_value, index) => ({
      name: `doc-${String(index).padStart(4, '0')}.txt`,
      path: `/notesRoot/assets/doc-${String(index).padStart(4, '0')}.txt`,
      isDirectory: false,
      isFile: true,
      size: 1024,
    }));
    entries.push({
      name: 'late.png',
      path: '/notesRoot/assets/late.png',
      isDirectory: false,
      isFile: true,
      size: 2048,
    });
    mocks.storage.listDir.mockResolvedValue(entries);

    const attachments = await loadMentionedFolderImageAttachments([
      { path: 'assets', title: 'assets/', kind: 'folder' },
    ]);

    expect(attachments).toEqual([
      {
        id: 'folder-image:/notesRoot/assets/late.png',
        path: '/notesRoot/assets/late.png',
        previewUrl: '',
        assetUrl: '',
        name: 'late.png',
        type: 'image/png',
        size: 2048,
      },
    ]);
    expect(mocks.storage.stat).not.toHaveBeenCalled();
  });

  it('checks file size with stat when folder entries do not include size', async () => {
    mocks.storage.listDir.mockResolvedValue([
      {
        name: 'cover.png',
        path: '/notesRoot/assets/cover.png',
        isDirectory: false,
        isFile: true,
      },
    ]);
    mocks.storage.stat.mockResolvedValue({
      name: 'cover.png',
      path: '/notesRoot/assets/cover.png',
      isDirectory: false,
      isFile: true,
      size: 4096,
    });

    const attachments = await loadMentionedFolderImageAttachments([
      { path: 'assets', title: 'assets/', kind: 'folder' },
    ]);

    expect(mocks.storage.stat).toHaveBeenCalledWith('/notesRoot/assets/cover.png');
    expect(attachments[0]).toMatchObject({
      path: '/notesRoot/assets/cover.png',
      name: 'cover.png',
      size: 4096,
    });
  });

  it('skips folder image candidates when stat shows they are not files', async () => {
    mocks.storage.listDir.mockResolvedValue([
      {
        name: 'cover.png',
        path: '/notesRoot/assets/cover.png',
        isDirectory: false,
        isFile: true,
      },
    ]);
    mocks.storage.stat.mockResolvedValue({
      name: 'cover.png',
      path: '/notesRoot/assets/cover.png',
      isDirectory: true,
      isFile: false,
      size: 4096,
    });

    const attachments = await loadMentionedFolderImageAttachments([
      { path: 'assets', title: 'assets/', kind: 'folder' },
    ]);

    expect(mocks.storage.stat).toHaveBeenCalledWith('/notesRoot/assets/cover.png');
    expect(attachments).toEqual([]);
  });

  it('keeps folder image candidates when size is unavailable', async () => {
    mocks.storage.listDir.mockResolvedValue([
      {
        name: 'cover.png',
        path: '/notesRoot/assets/cover.png',
        isDirectory: false,
        isFile: true,
      },
    ]);
    mocks.storage.stat.mockResolvedValue(null);

    const attachments = await loadMentionedFolderImageAttachments([
      { path: 'assets', title: 'assets/', kind: 'folder' },
    ]);

    expect(mocks.storage.stat).toHaveBeenCalledWith('/notesRoot/assets/cover.png');
    expect(attachments).toEqual([
      {
        id: 'folder-image:/notesRoot/assets/cover.png',
        path: '/notesRoot/assets/cover.png',
        previewUrl: '',
        assetUrl: '',
        name: 'cover.png',
        type: 'image/png',
        size: 0,
      },
    ]);
  });

  it('builds folder image paths from the resolved folder path instead of entry paths', async () => {
    mocks.storage.listDir.mockResolvedValue([
      {
        name: 'cover.png',
        path: '/outside/cover.png',
        isDirectory: false,
        isFile: true,
        size: 2048,
      },
    ]);

    const attachments = await loadMentionedFolderImageAttachments([
      { path: 'assets', title: 'assets/', kind: 'folder' },
    ]);

    expect(attachments[0]?.path).toBe('/notesRoot/assets/cover.png');
    expect(attachments[0]?.id).toBe('folder-image:/notesRoot/assets/cover.png');
  });

  it('does not attach images for note mentions', async () => {
    const attachments = await loadMentionedFolderImageAttachments([
      { path: 'docs/a.md', title: 'A', kind: 'note' },
    ]);

    expect(attachments).toEqual([]);
    expect(mocks.storage.listDir).not.toHaveBeenCalled();
  });

  it('treats file tree folder matches as folder mentions when kind is absent', async () => {
    mocks.notesState.rootFolder = {
      children: [
        {
          id: 'assets',
          name: 'assets',
          path: 'assets',
          isFolder: true,
          expanded: true,
          children: [],
        },
      ],
    };
    mocks.storage.listDir.mockResolvedValue([
      {
        name: 'cover.png',
        path: '/notesRoot/assets/cover.png',
        isDirectory: false,
        isFile: true,
        size: 2048,
      },
    ]);

    const attachments = await loadMentionedFolderImageAttachments([
      { path: 'assets', title: 'assets/' },
    ]);

    expect(attachments[0]?.name).toBe('cover.png');
  });
});
