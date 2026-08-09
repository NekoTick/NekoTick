import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import {
  addFrontmatterProperty,
  appendFrontmatterListValue,
  deleteFrontmatterProperty,
  readFrontmatterProperties,
  removeFrontmatterListValue,
  renameFrontmatterProperty,
  setFrontmatterPropertyList,
  setFrontmatterPropertyValue,
} from './frontmatterPropertiesModel';

const YAML = [
  '# note metadata',
  'title: Notes syntax',
  'published: true',
  'priority: 2',
  'tags:',
  '  - notes-syntax',
  '  - manual-check',
  'author:',
  '  name: Ada',
].join('\n');

describe('frontmatter properties model', () => {
  it('classifies editable scalar values and preserves complex values for source editing', () => {
    expect(readFrontmatterProperties(YAML)).toEqual({
      valid: true,
      properties: [
        { key: 'title', kind: 'text', value: 'Notes syntax' },
        { key: 'published', kind: 'boolean', value: true },
        { key: 'priority', kind: 'number', value: 2 },
        { key: 'tags', kind: 'list', value: ['notes-syntax', 'manual-check'] },
        { key: 'author', kind: 'complex', value: '{"name":"Ada"}' },
      ],
    });
  });

  it('rejects invalid and non-mapping YAML without rewriting it', () => {
    expect(readFrontmatterProperties('vlaina_cover: "image.png" x=50')).toEqual({
      valid: false,
      properties: [],
    });
    expect(readFrontmatterProperties('- first\n- second')).toEqual({
      valid: false,
      properties: [],
    });
  });

  it('keeps unsupported scalar values in source editing', () => {
    expect(readFrontmatterProperties([
      'empty: null',
      'nan: .nan',
      'large: 9007199254740993',
      'binary: !!binary SGVsbG8=',
    ].join('\n'))).toEqual({
      valid: true,
      properties: [
        { key: 'empty', kind: 'complex', value: 'null' },
        { key: 'nan', kind: 'complex', value: '.nan' },
        { key: 'large', kind: 'complex', value: '9007199254740993' },
        { key: 'binary', kind: 'complex', value: 'SGVsbG8=' },
      ],
    });
  });

  it('keeps unsupported scalar values inside lists in source editing', () => {
    const result = readFrontmatterProperties([
      'values:',
      '  - .nan',
      '  - .inf',
      '  - 9007199254740993',
    ].join('\n'));

    expect(result.valid).toBe(true);
    expect(result.properties[0]).toMatchObject({ key: 'values', kind: 'complex' });
  });

  it('updates values with YAML-safe quoting and keeps comments and order', () => {
    const updated = setFrontmatterPropertyValue(YAML, 'title', '@biva/1');

    expect(updated).toContain('# note metadata');
    expect(updated).toContain('title: "@biva/1"');
    expect(Object.keys(parse(updated!))).toEqual(['title', 'published', 'priority', 'tags', 'author']);
  });

  it('renames, adds, and deletes properties without disturbing the remaining values', () => {
    const renamed = renameFrontmatterProperty(YAML, 'priority', 'rank');
    const added = addFrontmatterProperty(renamed!, 'description');
    const deleted = deleteFrontmatterProperty(added!, 'published');

    expect(parse(deleted!)).toEqual({
      title: 'Notes syntax',
      rank: 2,
      tags: ['notes-syntax', 'manual-check'],
      author: { name: 'Ada' },
      description: '',
    });
  });

  it('rejects managed and duplicate property names without rewriting YAML', () => {
    const formatted = 'title:    Notes syntax\ntags: []';

    expect(addFrontmatterProperty(formatted, 'vlaina_custom')).toBeNull();
    expect(addFrontmatterProperty(formatted, 'tags')).toBe(formatted);
    expect(renameFrontmatterProperty(formatted, 'title', 'vlaina_custom')).toBeNull();
    expect(renameFrontmatterProperty(formatted, 'title', 'tags')).toBeNull();
    expect(renameFrontmatterProperty(formatted, 'title', 'title')).toBe(formatted);
  });

  it('adds and removes list values while preserving scalar values already in the list', () => {
    const withNumber = 'tags:\n  - alpha\n  - 3';
    const appended = appendFrontmatterListValue(withNumber, 'tags', 'beta');
    const removed = removeFrontmatterListValue(appended!, 'tags', 0);

    expect(parse(removed!)).toEqual({ tags: [3, 'beta'] });
  });

  it('keeps a list multiline after adding its first value back', () => {
    const emptied = removeFrontmatterListValue('tags:\n  - alpha', 'tags', 0);
    const restored = appendFrontmatterListValue(emptied!, 'tags', 'beta');

    expect(restored).toContain('tags:\n  - beta');
  });

  it('converts a scalar property into a YAML list', () => {
    expect(parse(setFrontmatterPropertyList('tags: notes-syntax', 'tags', 'notes-syntax')!))
      .toEqual({ tags: ['notes-syntax'] });
    expect(parse(setFrontmatterPropertyList('tags: ""', 'tags', '')!))
      .toEqual({ tags: [] });
  });

  it('creates the first property in empty frontmatter', () => {
    expect(parse(addFrontmatterProperty('', 'title')!)).toEqual({ title: '' });
  });

  it('treats comment-only frontmatter as an empty editable mapping', () => {
    const rawText = '# note metadata';

    expect(readFrontmatterProperties(rawText)).toEqual({ valid: true, properties: [] });
    const updated = addFrontmatterProperty(rawText, 'title');

    expect(updated).toContain('# note metadata');
    expect(parse(updated!)).toEqual({ title: '' });
  });
});
