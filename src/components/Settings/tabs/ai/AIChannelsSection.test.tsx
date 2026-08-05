import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AIChannelsSection } from './AIChannelsSection';

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe('AIChannelsSection', () => {
  it('does not render a click-through placeholder when there are no channels', () => {
    const { container } = render(
      <AIChannelsSection
        dragOverProviderId={null}
        draggingProviderId={null}
        hasCustomProviders={false}
        orderedCustomProviders={[]}
        providerDrafts={{}}
        providerModelCounts={new Map()}
        selectedProviderId={null}
        onAddCustomProvider={vi.fn()}
        onChannelClick={vi.fn()}
        onChannelDragEnd={vi.fn()}
        onChannelDragEnter={vi.fn()}
        onChannelDragOver={vi.fn()}
        onChannelDragStart={vi.fn()}
        onChannelDrop={vi.fn()}
        onDeleteCustomProvider={vi.fn()}
        onToggleProviderEnabled={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-settings-ai-action="new-channel"]')).toBeNull();
  });
});
