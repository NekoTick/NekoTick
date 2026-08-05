import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SettingsItem, SettingsSectionHeader, SettingsToggle } from './SettingsControls';

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

describe('SettingsControls', () => {
  it('exposes stable hooks for item copy, controls, and section headers', () => {
    const { container } = render(
      <>
        <SettingsSectionHeader>Editing</SettingsSectionHeader>
        <SettingsItem title="Typewriter mode" description="Keep the cursor centered.">
          <button type="button">Configure</button>
        </SettingsItem>
      </>,
    );

    const copy = container.querySelector('[data-settings-item-copy="true"]');
    const control = container.querySelector('[data-settings-item-control="true"]');
    const sectionHeader = container.querySelector('[data-settings-section-header="true"]');

    expect(copy).toHaveTextContent('Typewriter mode');
    expect(copy).toHaveTextContent('Keep the cursor centered.');
    expect(control).toContainElement(screen.getByRole('button', { name: 'Configure' }));
    expect(sectionHeader).toHaveTextContent('Editing');
  });

  it('exposes checked state and toggles with switch semantics', () => {
    const onChange = vi.fn();
    const { rerender } = render(<SettingsToggle checked={false} onChange={onChange} />);

    const toggle = screen.getByRole('switch', { name: 'common.toggleSetting' });
    expect(toggle).toHaveAttribute('type', 'button');
    expect(toggle).toHaveAttribute('data-settings-toggle', 'true');
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    fireEvent.click(toggle);
    expect(onChange).toHaveBeenLastCalledWith(true);

    rerender(<SettingsToggle checked onChange={onChange} />);
    expect(screen.getByRole('switch', { name: 'common.toggleSetting' }))
      .toHaveAttribute('aria-checked', 'true');

    fireEvent.click(screen.getByRole('switch', { name: 'common.toggleSetting' }));
    expect(onChange).toHaveBeenLastCalledWith(false);
  });
});
