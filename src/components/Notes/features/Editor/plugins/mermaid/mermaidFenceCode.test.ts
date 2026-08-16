import { describe, expect, it } from 'vitest';
import { MERMAID_FORMAT_FIXTURES } from '@/test/fixtures/mermaidFormatFixtures';
import { MERMAID_FENCE_LANGUAGE_ALIAS_LIST } from './mermaidLanguage';
import {
  createMermaidFenceStarterCode,
  normalizeMermaidCodeForRender,
  normalizeMermaidEditorCodeInput,
  normalizeMermaidFenceCode,
} from './mermaidFenceCode';

describe('normalizeMermaidFenceCode', () => {
  it('adds the Mermaid sequence directive for legacy sequence fenced content', () => {
    expect(normalizeMermaidFenceCode('sequence', 'Alice->Bob: Hello')).toBe(
      'sequenceDiagram\nAlice->Bob: Hello'
    );
  });

  it('does not duplicate an existing Mermaid diagram directive', () => {
    expect(normalizeMermaidFenceCode('sequence', 'sequenceDiagram\nAlice->>Bob: Hello')).toBe(
      'sequenceDiagram\nAlice->>Bob: Hello'
    );
  });

  it('does not duplicate directives for shared Mermaid format fixtures', () => {
    for (const fixture of MERMAID_FORMAT_FIXTURES) {
      const code = fixture.source.join('\n');

      expect(normalizeMermaidFenceCode('mermaid', code), fixture.label).toBe(code);
    }
  });

  it('normalizes short diagram directives already present in the pasted code', () => {
    expect(normalizeMermaidFenceCode('mermaid', 'sequence\nAlice->Bob: Hello')).toBe(
      'sequenceDiagram\nAlice->Bob: Hello'
    );
    expect(normalizeMermaidFenceCode('mermaid', 'radar\ntitle Skills')).toBe(
      'radar-beta\ntitle Skills'
    );
    expect(normalizeMermaidFenceCode('mermaid', 'treeView\nroot')).toBe(
      'treeView-beta\nroot'
    );
    expect(normalizeMermaidFenceCode('mermaid', 'wardley\ntitle Value Chain')).toBe(
      'wardley-beta\ntitle Value Chain'
    );
    expect(normalizeMermaidFenceCode('mermaid', 'zenuml\nAlice->Bob: Hi')).toBe(
      'zenuml\nAlice->Bob: Hi'
    );
    expect(normalizeMermaidFenceCode('mermaid', 'xyChart-beta\ntitle Velocity')).toBe(
      'xychart-beta\ntitle Velocity'
    );
  });

  it('normalizes short directives after Mermaid YAML frontmatter', () => {
    expect(normalizeMermaidFenceCode(
      'mermaid',
      ['---', 'title: Skills', '---', 'radar', 'axis A, B'].join('\n')
    )).toBe(['---', 'title: Skills', '---', 'radar-beta', 'axis A, B'].join('\n'));
  });

  it('normalizes short directives after Mermaid init directives', () => {
    expect(normalizeMermaidFenceCode(
      'mermaid',
      ['%%{init: {"theme": "default"}}%%', 'sequence', 'Alice->Bob: Hi'].join('\n')
    )).toBe(
      ['%%{init: {"theme": "default"}}%%', 'sequenceDiagram', 'Alice->Bob: Hi'].join('\n')
    );
  });

  it('normalizes short directives after Mermaid comments', () => {
    expect(normalizeMermaidFenceCode(
      'mermaid',
      ['%% keep this comment', 'flow LR', 'A --> B'].join('\n')
    )).toBe(
      ['%% keep this comment', 'flowchart LR', 'A --> B'].join('\n')
    );
  });

  it('does not duplicate directives after Mermaid init directives', () => {
    expect(normalizeMermaidFenceCode(
      'flow',
      ['%%{init: {"theme": "default"}}%%', 'flowchart LR', 'A --> B'].join('\n')
    )).toBe(
      ['%%{init: {"theme": "default"}}%%', 'flowchart LR', 'A --> B'].join('\n')
    );
  });

  it('leaves other Mermaid aliases unchanged', () => {
    expect(normalizeMermaidFenceCode('flowchart', 'flowchart TD\nA --> B')).toBe(
      'flowchart TD\nA --> B'
    );
  });

  it('does not rewrite explicit diagram direction or renderer directives', () => {
    expect(normalizeMermaidFenceCode('mermaid', 'flowchart LR\nA --> B')).toBe(
      'flowchart LR\nA --> B'
    );
    expect(normalizeMermaidFenceCode('mermaid', 'graph BT\nA --> B')).toBe(
      'graph BT\nA --> B'
    );
    expect(normalizeMermaidFenceCode('mermaid', 'flowchart-elk TD\nA --> B')).toBe(
      'flowchart-elk TD\nA --> B'
    );
  });

  it('adds standard directives for supported alias fences without directives', () => {
    expect(normalizeMermaidFenceCode('flow', 'A --> B')).toBe('flowchart TD\nA --> B');
    expect(normalizeMermaidFenceCode('flowchart-v2', 'A --> B')).toBe(
      'flowchart TD\nA --> B'
    );
    expect(normalizeMermaidFenceCode('state', '[*] --> Still')).toBe(
      'stateDiagram-v2\n[*] --> Still'
    );
    expect(normalizeMermaidFenceCode('c4', 'Person(customer, "Customer")')).toBe(
      'C4Context\nPerson(customer, "Customer")'
    );
    expect(normalizeMermaidFenceCode('radar', 'title Skills')).toBe(
      'radar-beta\ntitle Skills'
    );
    expect(normalizeMermaidFenceCode('venn', 'A,B')).toBe('venn-beta\nA,B');
    expect(normalizeMermaidFenceCode('treeView', 'root')).toBe('treeView-beta\nroot');
    expect(normalizeMermaidFenceCode('wardley', 'title Value Chain')).toBe(
      'wardley-beta\ntitle Value Chain'
    );
  });

  it('adds standard directives after frontmatter and Mermaid prefix lines', () => {
    expect(normalizeMermaidFenceCode(
      'flow',
      ['---', 'title: Flow', '---', 'A --> B'].join('\n')
    )).toBe(['---', 'title: Flow', '---', 'flowchart TD', 'A --> B'].join('\n'));

    expect(normalizeMermaidFenceCode(
      'flow',
      ['%% keep this comment', 'A --> B'].join('\n')
    )).toBe(['%% keep this comment', 'flowchart TD', 'A --> B'].join('\n'));

    expect(normalizeMermaidFenceCode(
      'sequence',
      ['%%{init: {"theme": "default"}}%%', 'Alice->Bob: Hi'].join('\n')
    )).toBe(
      ['%%{init: {"theme": "default"}}%%', 'sequenceDiagram', 'Alice->Bob: Hi'].join('\n')
    );
  });

  it('preserves classic flowchart node declarations in generic Mermaid fences', () => {
    const code = [
      'st=>start: 开始框',
      'op=>operation: 处理框',
      'cond=>condition: 判断框(是或否?)',
      'st->op->cond',
    ].join('\n');

    expect(normalizeMermaidFenceCode('mermaid', code)).toBe(code);
  });

  it('keeps every Mermaid-specific alias wired to no-directive content normalization', () => {
    for (const alias of MERMAID_FENCE_LANGUAGE_ALIAS_LIST) {
      if (alias === 'mermaid' || alias === 'mmd') {
        continue;
      }

      const starter = createMermaidFenceStarterCode(alias);
      expect(normalizeMermaidFenceCode(alias, 'payload'), alias).toBe(`${starter}payload`);
    }
  });
});

describe('createMermaidFenceStarterCode', () => {
  it('returns an editable starter directive for diagram fence aliases', () => {
    expect(createMermaidFenceStarterCode('sequence')).toBe('sequenceDiagram\n');
    expect(createMermaidFenceStarterCode('flow')).toBe('flowchart TD\n');
    expect(createMermaidFenceStarterCode('eventmodeling')).toBe('eventmodeling\n');
    expect(createMermaidFenceStarterCode('radar')).toBe('radar-beta\n');
    expect(createMermaidFenceStarterCode('zenuml')).toBe('zenuml\n');
  });

  it('does not add starter text for generic Mermaid fences', () => {
    expect(createMermaidFenceStarterCode('mermaid')).toBe('');
    expect(createMermaidFenceStarterCode('mmd')).toBe('');
  });

  it('keeps every Mermaid-specific fence alias wired to a starter directive', () => {
    for (const alias of MERMAID_FENCE_LANGUAGE_ALIAS_LIST) {
      if (alias === 'mermaid' || alias === 'mmd') {
        continue;
      }

      expect(createMermaidFenceStarterCode(alias), alias).not.toBe('');
    }
  });
});

describe('normalizeMermaidEditorCodeInput', () => {
  it('normalizes short leading directives in direct editor input', () => {
    expect(normalizeMermaidEditorCodeInput('sequence\nAlice->Bob: Hello')).toBe(
      'sequenceDiagram\nAlice->Bob: Hello'
    );
    expect(normalizeMermaidEditorCodeInput('flow LR\nA --> B')).toBe(
      'flowchart LR\nA --> B'
    );
    expect(normalizeMermaidEditorCodeInput('flowchart-v2 RL\nA --> B')).toBe(
      'flowchart RL\nA --> B'
    );
    expect(normalizeMermaidEditorCodeInput('flowchartelk BT\nA --> B')).toBe(
      'flowchart-elk BT\nA --> B'
    );
    expect(normalizeMermaidEditorCodeInput('flowchart LR\nA --> B')).toBe(
      'flowchart LR\nA --> B'
    );
    expect(normalizeMermaidEditorCodeInput('A --> B')).toBe('A --> B');
  });

  it('preserves shared Mermaid format fixtures during editor input normalization', () => {
    for (const fixture of MERMAID_FORMAT_FIXTURES) {
      const code = fixture.source.join('\n');

      expect(normalizeMermaidEditorCodeInput(code), fixture.label).toBe(code);
    }
  });

  it('preserves classic flowchart syntax pasted directly into the diagram editor', () => {
    const code = [
      'st=>start: 开始框',
      'op=>operation: 处理框',
      'cond=>condition: 判断框(是或否?)',
      'sub1=>subroutine: 子流程',
      'io=>inputoutput: 输入输出框',
      'e=>end: 结束框',
      'st->op->cond',
      'cond(yes)->io->e',
      'cond(no)->sub1(right)->op',
    ].join('\n');

    expect(normalizeMermaidEditorCodeInput(code)).toBe(code);
  });

  it('converts classic flowchart syntax only for rendering', () => {
    const code = [
      'st=>start: 开始框',
      'op=>operation: 处理框',
      'cond=>condition: 判断框(是或否?)',
      'sub1=>subroutine: 子流程',
      'io=>inputoutput: 输入输出框',
      'e=>end: 结束框',
      'st->op->cond',
      'cond(yes)->io->e',
      'cond(no)->sub1(right)->op',
    ].join('\n');

    expect(normalizeMermaidCodeForRender(code)).toBe([
      'graph TD',
      'st(["开始框"])',
      'op["处理框"]',
      'cond{"判断框(是或否?)"}',
      'sub1[["子流程"]]',
      'io[/"输入输出框"/]',
      'e(["结束框"])',
      'st --> op',
      'op --> cond',
      'cond -- "yes" --> io',
      'io --> e',
      'cond -- "no" --> sub1',
      'sub1 --> op',
    ].join('\n'));
  });

  it('converts flowchart TD classic syntax only for rendering', () => {
    const code = [
      'flowchart TD',
      'st=>start: 开始框',
      'op=>operation: 处理框',
      'cond=>condition: 判断框(是或否?)',
      'st(right)->op(right)->cond',
      'cond(yes)->op',
    ].join('\n');

    expect(normalizeMermaidCodeForRender(code)).toBe([
      'flowchart TD',
      'st(["开始框"])',
      'op["处理框"]',
      'cond{"判断框(是或否?)"}',
      'st --> op',
      'op --> cond',
      'cond -- "yes" --> op',
    ].join('\n'));
  });

  it('converts the full classic flowchart sample after a flowchart directive for rendering', () => {
    const code = [
      'flowchart TD',
      'st=>start: 开始框',
      'op=>operation: 处理框',
      'cond=>condition: 判断框(是或否?)',
      'sub1=>subroutine: 子流程',
      'io=>inputoutput: 输入输出框',
      'e=>end: 结束框',
      'st(right)->op(right)->cond',
      'cond(yes)->io(bottom)->e',
      'cond(no)->sub1(right)->op',
    ].join('\n');

    expect(normalizeMermaidCodeForRender(code)).toBe([
      'flowchart TD',
      'st(["开始框"])',
      'op["处理框"]',
      'cond{"判断框(是或否?)"}',
      'sub1[["子流程"]]',
      'io[/"输入输出框"/]',
      'e(["结束框"])',
      'st --> op',
      'op --> cond',
      'cond -- "yes" --> io',
      'io --> e',
      'cond -- "no" --> sub1',
      'sub1 --> op',
    ].join('\n'));
  });

  it('does not rewrite normal Mermaid flowchart syntax during render normalization', () => {
    const code = [
      'flowchart TD',
      'A["Start"] --> B{"Ready?"}',
      'B -- "yes" --> C[/Input/]',
      'B -- "no" --> D[Stop]',
    ].join('\n');

    expect(normalizeMermaidCodeForRender(code)).toBe(code);
  });

  it('strips a pasted Mermaid fence from the editor input and normalizes the code', () => {
    expect(normalizeMermaidEditorCodeInput(
      [
        '```sequence',
        'Alice->Bob: Hello Bob, how are you?',
        'Note right of Bob: Bob thinks',
        'Bob-->Alice: I am good thanks!',
        '```',
      ].join('\n')
    )).toBe([
      'sequenceDiagram',
      'Alice->Bob: Hello Bob, how are you?',
      'Note right of Bob: Bob thinks',
      'Bob-->Alice: I am good thanks!',
    ].join('\n'));
  });

  it('strips a pasted Mermaid fence with Markdown metadata', () => {
    expect(normalizeMermaidEditorCodeInput(
      ['```mermaid title="Flow"', 'flow', 'A --> B', '```'].join('\n')
    )).toBe(['flowchart TD', 'A --> B'].join('\n'));
  });

  it('strips pasted Mermaid fences and normalizes aliases after init directives', () => {
    expect(normalizeMermaidEditorCodeInput(
      [
        '```mermaid',
        '%%{init: {"theme": "default"}}%%',
        'sequence',
        'Alice->Bob: Hi',
        '```',
      ].join('\n')
    )).toBe(
      [
        '%%{init: {"theme": "default"}}%%',
        'sequenceDiagram',
        'Alice->Bob: Hi',
      ].join('\n')
    );
  });

  it('strips pasted Mermaid fences and normalizes aliases after comments', () => {
    expect(normalizeMermaidEditorCodeInput(
      [
        '```mermaid',
        '%% keep this comment',
        'flow',
        'A --> B',
        '```',
      ].join('\n')
    )).toBe(
      [
        '%% keep this comment',
        'flowchart TD',
        'A --> B',
      ].join('\n')
    );
  });

  it('keeps ZenUML pasted into the diagram editor as Mermaid diagram code', () => {
    expect(normalizeMermaidEditorCodeInput(
      [
        'zenuml',
        '    title Declare participant (optional)',
        '    Bob',
        '    Alice',
        '    Alice->Bob: Hi Bob',
        '    Bob->Alice: Hi Alice',
      ].join('\n')
    )).toBe([
      'zenuml',
      '    title Declare participant (optional)',
      '    Bob',
      '    Alice',
      '    Alice->Bob: Hi Bob',
      '    Bob->Alice: Hi Alice',
    ].join('\n'));
  });

  it('strips pasted Mermaid fences surrounded by blank edge lines without trimming code whitespace', () => {
    expect(normalizeMermaidEditorCodeInput(
      [' ', '```mermaid', '  flow', '  A --> B', '```', ''].join('\n')
    )).toBe(['  flowchart TD', '  A --> B'].join('\n'));
  });

  it('strips pasted Mermaid fences when the closing fence is longer than the opening fence', () => {
    expect(normalizeMermaidEditorCodeInput(
      ['```sequence', 'Alice->Bob: Hello', '````'].join('\n')
    )).toBe(['sequenceDiagram', 'Alice->Bob: Hello'].join('\n'));

    expect(normalizeMermaidEditorCodeInput(
      ['~~~flow', 'A --> B', '~~~~'].join('\n')
    )).toBe(['flowchart TD', 'A --> B'].join('\n'));
  });

  it('does not strip multiple pasted Mermaid fences as one outer fence', () => {
    const input = [
      '```sequence',
      'Alice->Bob: Hello',
      '```',
      '',
      '```sequence',
      'Bob->Alice: Hi',
      '```',
    ].join('\n');

    expect(normalizeMermaidEditorCodeInput(input)).toBe(input);
  });

  it('keeps shorter same-marker fence lines inside pasted Mermaid code', () => {
    expect(normalizeMermaidEditorCodeInput(
      ['````sequence', '```', 'Alice->Bob: Hello', '````'].join('\n')
    )).toBe(['sequenceDiagram', '```', 'Alice->Bob: Hello'].join('\n'));
  });

  it('does not strip pasted Mermaid fences when the closing fence is shorter or uses the wrong marker', () => {
    expect(normalizeMermaidEditorCodeInput(
      ['````sequence', 'Alice->Bob: Hello', '```'].join('\n')
    )).toBe(['````sequence', 'Alice->Bob: Hello', '```'].join('\n'));

    expect(normalizeMermaidEditorCodeInput(
      ['```sequence', 'Alice->Bob: Hello', '~~~'].join('\n')
    )).toBe(['```sequence', 'Alice->Bob: Hello', '~~~'].join('\n'));
  });

  it('does not strip pasted Mermaid fences indented as code blocks', () => {
    expect(normalizeMermaidEditorCodeInput(
      ['    ```sequence', 'Alice->Bob: Hello', '    ```'].join('\n')
    )).toBe(['    ```sequence', 'Alice->Bob: Hello', '    ```'].join('\n'));
  });

  it('does not strip pasted backtick Mermaid fences with invalid info strings', () => {
    expect(normalizeMermaidEditorCodeInput(
      ['```mermaid `title`', 'flow', 'A --> B', '```'].join('\n')
    )).toBe(['```mermaid `title`', 'flow', 'A --> B', '```'].join('\n'));
  });

  it('leaves non-Mermaid fenced editor input untouched', () => {
    expect(normalizeMermaidEditorCodeInput('```ts\nconst x = 1;\n```')).toBe(
      '```ts\nconst x = 1;\n```'
    );
  });
});
