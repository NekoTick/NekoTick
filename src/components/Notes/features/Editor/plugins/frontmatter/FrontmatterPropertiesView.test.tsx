import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { parse } from 'yaml';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '@/stores/uiSlice';
import { FrontmatterPropertiesView } from './FrontmatterPropertiesView';
import { readFrontmatterProperties } from './frontmatterPropertiesModel';

const RAW_TEXT = [
  'title: Notes syntax',
  'published: true',
  'tags:',
  '  - notes-syntax',
  '  - manual-check',
].join('\n');

function StatefulView({ onChange = () => {} }: { onChange?: (rawText: string) => void }) {
  const [rawText, setRawText] = useState(RAW_TEXT);
  const [sourceMode, setSourceMode] = useState(false);
  return (
    <FrontmatterPropertiesView
      editable
      rawText={rawText}
      result={readFrontmatterProperties(rawText)}
      sourceMode={sourceMode}
      onChange={(nextRawText) => {
        onChange(nextRawText);
        setRawText(nextRawText);
      }}
      onSourceModeChange={setSourceMode}
    />
  );
}

describe('FrontmatterPropertiesView', () => {
  beforeEach(() => {
    useUIStore.setState({ languagePreference: 'en' });
  });

  it('renders scalar, boolean, and list properties as focused controls', () => {
    const { container } = render(<StatefulView />);

    expect(container.querySelector('.frontmatter-properties-heading')).toBeNull();
    expect(screen.queryByText('Properties')).not.toBeInTheDocument();
    expect(container.querySelector('.frontmatter-properties-count')).toBeNull();
    expect(container.querySelector('.frontmatter-property-icon')).toBeNull();
    expect(screen.getByDisplayValue('Notes syntax')).toBeVisible();
    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByText('notes-syntax')).toBeVisible();
    expect(screen.getByText('manual-check')).toBeVisible();
  });

  it('updates a text value and safely quotes YAML-sensitive content', () => {
    const onChange = vi.fn();
    render(<StatefulView onChange={onChange} />);
    const title = screen.getByDisplayValue('Notes syntax');

    fireEvent.change(title, { target: { value: '@biva/1' } });
    fireEvent.blur(title);

    expect(parse(onChange.mock.lastCall?.[0])).toMatchObject({ title: '@biva/1' });
    expect(onChange.mock.lastCall?.[0]).toContain('title: "@biva/1"');
  });

  it('does not rewrite unchanged scalar values on blur', () => {
    const onChange = vi.fn();
    render(<StatefulView onChange={onChange} />);

    fireEvent.blur(screen.getByDisplayValue('Notes syntax'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('adds and removes list values through chips', () => {
    const onChange = vi.fn();
    render(<StatefulView onChange={onChange} />);
    const tagInput = screen.getByLabelText('tags');

    fireEvent.change(tagInput, { target: { value: 'design' } });
    fireEvent.keyDown(tagInput, { key: 'Enter', ctrlKey: true });
    expect(parse(onChange.mock.lastCall?.[0]).tags).toEqual([
      'notes-syntax',
      'manual-check',
      'design',
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove notes-syntax' }));
    expect(parse(onChange.mock.lastCall?.[0]).tags).toEqual(['manual-check', 'design']);
  });

  it('keeps an empty-list draft uncommitted until Ctrl or Cmd Enter', () => {
    const onChange = vi.fn();
    render(<StatefulView onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove notes-syntax' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove manual-check' }));
    expect(parse(onChange.mock.lastCall?.[0]).tags).toEqual([]);

    const tagInput = screen.getByLabelText('tags');
    fireEvent.change(tagInput, { target: { value: 'draft' } });
    fireEvent.keyDown(tagInput, { key: 'Enter' });
    fireEvent.keyDown(tagInput, { key: ',' });
    fireEvent.blur(tagInput);

    expect(onChange).toHaveBeenCalledTimes(2);
    expect(parse(onChange.mock.lastCall?.[0]).tags).toEqual([]);

    fireEvent.keyDown(tagInput, { key: 'Enter', metaKey: true });
    expect(parse(onChange.mock.lastCall?.[0]).tags).toEqual(['draft']);
  });

  it('creates a property from the inline add row', () => {
    const onChange = vi.fn();
    render(<StatefulView onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const keyInput = screen.getByPlaceholderText('Property name');
    fireEvent.change(keyInput, { target: { value: 'description' } });
    fireEvent.keyDown(keyInput, { key: 'Enter' });

    expect(parse(onChange.mock.lastCall?.[0])).toMatchObject({ description: '' });
    expect(screen.getByLabelText('description')).toHaveFocus();
  });

  it('shows and focuses the new property input on primary mouse down', () => {
    render(<StatefulView />);
    const addButton = screen.getByRole('button', { name: 'Add' });

    fireEvent.mouseDown(addButton, { button: 0 });

    expect(screen.getByPlaceholderText('Property name')).toHaveFocus();
  });

  it('keeps keyboard activation and ignores non-primary mouse down', () => {
    render(<StatefulView />);
    const addButton = screen.getByRole('button', { name: 'Add' });

    fireEvent.mouseDown(addButton, { button: 2 });
    expect(screen.queryByPlaceholderText('Property name')).not.toBeInTheDocument();

    fireEvent.click(addButton, { detail: 0 });
    expect(screen.getByPlaceholderText('Property name')).toHaveFocus();
  });

  it('commits on ordinary blur without stealing focus to the value', () => {
    const onChange = vi.fn();
    render(<StatefulView onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const keyInput = screen.getByPlaceholderText('Property name');
    fireEvent.change(keyInput, { target: { value: 'summary' } });
    fireEvent.blur(keyInput);

    expect(parse(onChange.mock.lastCall?.[0])).toMatchObject({ summary: '' });
    expect(screen.getByLabelText('summary')).not.toHaveFocus();
  });

  it('rejects managed and duplicate property names without rewriting YAML', () => {
    const onChange = vi.fn();
    render(<StatefulView onChange={onChange} />);

    const titleKey = screen.getByDisplayValue('title');
    fireEvent.change(titleKey, { target: { value: 'tags' } });
    fireEvent.blur(titleKey);
    expect(titleKey).toHaveValue('title');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const keyInput = screen.getByPlaceholderText('Property name');
    fireEvent.change(keyInput, { target: { value: 'vlaina_custom' } });
    fireEvent.keyDown(keyInput, { key: 'Tab' });
    expect(keyInput).toHaveAttribute('aria-invalid', 'true');
    expect(keyInput).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does not submit property inputs while an IME composition is active', () => {
    const onChange = vi.fn();
    render(<StatefulView onChange={onChange} />);

    const titleKey = screen.getByDisplayValue('title');
    titleKey.focus();
    fireEvent.compositionStart(titleKey);
    fireEvent.keyDown(titleKey, { key: 'Enter' });
    expect(titleKey).toHaveFocus();
    fireEvent.compositionEnd(titleKey);

    const tagInput = screen.getByLabelText('tags');
    fireEvent.compositionStart(tagInput);
    fireEvent.change(tagInput, { target: { value: 'draft-tag' } });
    fireEvent.keyDown(tagInput, { key: 'Enter', ctrlKey: true });
    expect(screen.queryByText('draft-tag')).not.toBeInTheDocument();
    fireEvent.compositionEnd(tagInput);
    fireEvent.change(tagInput, { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const newKeyInput = screen.getByPlaceholderText('Property name');
    fireEvent.compositionStart(newKeyInput);
    fireEvent.change(newKeyInput, { target: { value: 'draft-key' } });
    fireEvent.keyDown(newKeyInput, { key: 'Enter' });
    expect(newKeyInput).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.compositionEnd(newKeyInput);
  });

  it('defers scalar value blur commits until composition ends', () => {
    const onChange = vi.fn();
    render(<StatefulView onChange={onChange} />);
    const title = screen.getByDisplayValue('Notes syntax');

    fireEvent.compositionStart(title);
    fireEvent.change(title, { target: { value: 'romanized draft' } });
    fireEvent.blur(title);

    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(title, { target: { value: 'committed title' } });
    fireEvent.compositionEnd(title);

    expect(parse(onChange.mock.lastCall?.[0])).toMatchObject({ title: 'committed title' });
    expect(onChange.mock.lastCall?.[0]).not.toContain('romanized draft');
  });

  it('defers existing property name blur commits until composition ends', () => {
    const onChange = vi.fn();
    render(<StatefulView onChange={onChange} />);
    const titleKey = screen.getByDisplayValue('title');

    fireEvent.compositionStart(titleKey);
    fireEvent.change(titleKey, { target: { value: 'draft_key' } });
    fireEvent.blur(titleKey);

    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(titleKey, { target: { value: 'final_title' } });
    fireEvent.compositionEnd(titleKey);

    expect(parse(onChange.mock.lastCall?.[0])).toMatchObject({ final_title: 'Notes syntax' });
    expect(onChange.mock.lastCall?.[0]).not.toContain('draft_key');
  });

  it('defers new property blur commits until composition ends', () => {
    const onChange = vi.fn();
    render(<StatefulView onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const keyInput = screen.getByPlaceholderText('Property name');
    fireEvent.compositionStart(keyInput);
    fireEvent.change(keyInput, { target: { value: 'draft_key' } });
    fireEvent.blur(keyInput);

    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(keyInput, { target: { value: 'final_key' } });
    fireEvent.compositionEnd(keyInput);

    expect(parse(onChange.mock.lastCall?.[0])).toMatchObject({ final_key: '' });
    expect(onChange.mock.lastCall?.[0]).not.toContain('draft_key');
  });

  it('moves from a new property name to its value and builds a list with Ctrl+Enter', () => {
    const onChange = vi.fn();
    render(<StatefulView onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const keyInput = screen.getByPlaceholderText('Property name');
    fireEvent.change(keyInput, { target: { value: 'topics' } });
    fireEvent.keyDown(keyInput, { key: 'Tab' });

    const valueInput = screen.getByLabelText('topics');
    expect(valueInput).toHaveFocus();
    fireEvent.change(valueInput, { target: { value: 'notes-syntax' } });
    fireEvent.keyDown(valueInput, { key: 'Enter', ctrlKey: true });

    expect(parse(onChange.mock.lastCall?.[0])).toMatchObject({ topics: ['notes-syntax'] });
    expect(screen.getByLabelText('topics')).toHaveFocus();
  });

  it('focuses the title end when clicking non-editable property-list space', () => {
    const titleInput = document.createElement('textarea');
    titleInput.dataset.noteTitleInput = 'true';
    titleInput.value = 'Notes title';
    document.body.appendChild(titleInput);
    const { container } = render(<StatefulView />);
    const propertyList = container.querySelector('.frontmatter-properties-list');

    expect(propertyList).not.toBeNull();
    fireEvent.mouseDown(propertyList!, { button: 0 });

    expect(titleInput).toHaveFocus();
    expect(titleInput.selectionStart).toBe(titleInput.value.length);
    expect(titleInput.selectionEnd).toBe(titleInput.value.length);
    titleInput.remove();
  });

  it('switches between the property list and YAML source modes', () => {
    render(<StatefulView />);

    expect(screen.getAllByRole('button', { name: 'YAML source' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'YAML source' }), { detail: 0 });
    expect(screen.queryByDisplayValue('Notes syntax')).not.toBeInTheDocument();

    expect(screen.getAllByRole('button', { name: 'Properties' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Properties' }), { detail: 0 });
    expect(screen.getByDisplayValue('Notes syntax')).toBeVisible();
  });

  it('switches modes on primary mouse down without toggling again on click', () => {
    render(<StatefulView />);
    const sourceButton = screen.getByRole('button', { name: 'YAML source' });

    fireEvent.mouseDown(sourceButton, { button: 2 });
    expect(screen.getByRole('button', { name: 'YAML source' })).toBeInTheDocument();
    fireEvent.mouseDown(sourceButton, { button: 0 });
    const propertiesButton = screen.getByRole('button', { name: 'Properties' });
    expect(screen.queryByDisplayValue('Notes syntax')).not.toBeInTheDocument();

    fireEvent.click(propertiesButton, { detail: 1 });
    expect(screen.getByRole('button', { name: 'Properties' })).toBeInTheDocument();
    fireEvent.mouseDown(propertiesButton, { button: 0 });
    expect(screen.getByDisplayValue('Notes syntax')).toBeVisible();
  });

  it('keeps invalid YAML in source mode and disables the visual mode control', () => {
    render(
      <FrontmatterPropertiesView
        editable
        rawText={'vlaina_cover: "image.png" x=50'}
        result={readFrontmatterProperties('vlaina_cover: "image.png" x=50')}
        sourceMode
        onChange={() => {}}
        onSourceModeChange={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Properties' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'YAML source' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
  });
});
