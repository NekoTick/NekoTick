import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  BATCH_EXPORT_SOURCE_VIRTUALIZATION_THRESHOLD,
  BatchNoteExportSourceList,
} from './BatchNoteExportSourceList';

const mocks = vi.hoisted(() => ({
  measureElement: vi.fn(),
  useVirtualizer: vi.fn(({ count }: { count: number }) => ({
    getTotalSize: () => count * 42,
    getVirtualItems: () => [
      { index: 0, start: 0 },
      { index: count - 1, start: (count - 1) * 42 },
    ],
    measureElement: vi.fn(),
  })),
}));

vi.mock('@tanstack/react-virtual', () => ({ useVirtualizer: mocks.useVirtualizer }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/Notes/features/Sidebar/SidebarNoteFileIcon', () => ({
  SidebarLiveNoteFileIcon: ({ notePath }: { notePath: string }) => <span>{notePath}</span>,
}));

describe('BatchNoteExportSourceList', () => {
  it('renders only virtual rows when the source count crosses the threshold', () => {
    const sources = Array.from(
      { length: BATCH_EXPORT_SOURCE_VIRTUALIZATION_THRESHOLD + 1 },
      (_value, index) => ({ id: `${index}`, name: `Note ${index}`, path: `note-${index}.md` }),
    );

    render(
      <BatchNoteExportSourceList
        isExporting={false}
        notesPath="/notes"
        onPreviewSourceChange={vi.fn()}
        selectedIds={new Set()}
        sources={sources}
        toggleSelected={vi.fn()}
      />,
    );

    expect(mocks.useVirtualizer).toHaveBeenCalledWith(expect.objectContaining({
      count: BATCH_EXPORT_SOURCE_VIRTUALIZATION_THRESHOLD + 1,
      enabled: true,
    }));
    expect(screen.getByText('Note 0')).toBeInTheDocument();
    expect(screen.getByText(`Note ${BATCH_EXPORT_SOURCE_VIRTUALIZATION_THRESHOLD}`)).toBeInTheDocument();
    expect(screen.queryByText('Note 50')).not.toBeInTheDocument();
  });
});
