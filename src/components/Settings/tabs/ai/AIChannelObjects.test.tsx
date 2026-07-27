import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChannelObject } from './AIChannelObjects';

vi.mock('@/components/ui/icons', () => ({
  Icon: ({ name }: { name: string }) => <span aria-hidden="true">{name}</span>,
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, string>) => {
      if (key === 'settings.ai.modelCount') return '1 model';
      if (key === 'settings.ai.deleteChannelNamed') return `Delete ${values?.name}`;
      return key;
    },
  }),
}));

describe('ChannelObject', () => {
  it('exposes selection and enabled state with distinct names', () => {
    render(
      <ChannelObject
        providerId="provider-1"
        name="Channel 1"
        baseUrl="https://api.example.test"
        enabled
        modelCount={1}
        active
      />,
    );

    expect(document.querySelector('[data-settings-ai-channel-card="provider-1"]'))
      .toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('switch', { name: 'common.toggleSetting: Channel 1' }))
      .toHaveAttribute('aria-checked', 'true');
  });
});
