import { describe, expect, it } from 'vitest';
import { expectStableMarkdownRoundTrips } from './markdownRoundTripTestUtils';

interface GeneratedBlock {
  expected?: string;
  source: string;
}

type BlockFactory = (id: number) => GeneratedBlock;

const RANDOM_SEEDS = [
  0x13579bdf,
  0x2468ace0,
  0x5eed1234,
  0x7f4a7c15,
  0x9e3779b9,
  0xc0ffee42,
  0xdeadbeef,
  0xf00dbabe,
  0x0badf00d,
  0x10203040,
  0x31415926,
  0x55aa55aa,
  0x6a09e667,
  0x8badf00d,
  0xa5a5a5a5,
  0xd1b54a32,
] as const;
const CASES_PER_SEED = 128;

function stable(source: string): GeneratedBlock {
  return { source };
}

const blockFactories: readonly BlockFactory[] = [
  (id) => stable(`Paragraph ${id} with **bold**, *emphasis*, \`code\`, and [link](https://example.test/${id}).`),
  (id) => stable([
    `Ambiguous paragraph ${id}`,
    '2. item',
    '#tag',
    '[label]',
    '中文@文本',
    '价格 $ value',
    '路径_文件',
    '标签[文本]',
  ].join('\n')),
  (id) => stable([
    `[Docs ${id}](https://example.test/docs?a=${id}&b=${id + 1})`,
    `![Image ${id}](image-${id}.png?a=${id}&b=${id + 1})`,
  ].join('\n')),
  (id) => stable(`Authored escapes ${id}: left\\@right left\\#right left\\_right left\\&right left\\|right left\\!right.`),
  (id) => stable(`## ATX heading ${id}`),
  (id) => stable([`Setext heading ${id}`, '----------------'].join('\n')),
  (id) => stable([`7) Ordered ${id}`, `8) Ordered ${id + 1}`].join('\n')),
  (id) => stable([`* Bullet ${id}`, `  * Nested bullet ${id}`].join('\n')),
  (id) => stable([`- [ ] Task ${id}`, `- [x] Completed ${id}`].join('\n')),
  (id) => stable([`> Quote ${id}`, `> Continued quote ${id}`].join('\n')),
  (id) => stable([`> \u{1F4A1} Callout ${id}`, `> Callout body ${id}`].join('\n')),
  (id) => stable(id % 2 === 0 ? '***' : '___'),
  (id) => ({
    source: [
      `| Key ${id} | Value |`,
      '| :--- | ---: |',
      `| row | ${id} |`,
    ].join('\n'),
    expected: [
      `|Key ${id}|Value|`,
      '|:-|-:|',
      `|row|${id}|`,
    ].join('\n'),
  }),
  (id) => stable(['```ts', `const value${id} = ${id};`, '', `console.log(value${id});`, '```'].join('\n')),
  (id) => stable(['~~~text', `tilde fence ${id}`, '~~~'].join('\n')),
  (id) => stable(`    indented code ${id}`),
  (id) => stable(['$$', `x_${id} = y_${id}`, '', `z_${id} = 1`, '$$'].join('\n')),
  (id) => stable(['```mermaid', 'flowchart TD', '', `  A${id} --> B${id}`, '```'].join('\n')),
  (id) => stable([
    `Footnote ${id}[^note-${id}].`,
    '',
    `[^note-${id}]: Footnote body ${id}.`,
  ].join('\n')),
  (id) => stable([
    `Read [Docs ${id}][docs-${id}].`,
    '',
    `[docs-${id}]: https://example.test/docs/${id}`,
    '',
    '',
    `Reference tail ${id}.`,
  ].join('\n')),
  (id) => stable([`*[API${id}]: Application Interface ${id}`, '', `API${id} usage.`].join('\n')),
  (id) => stable([`Term ${id}`, '', `: Definition ${id}`].join('\n')),
  () => stable('[TOC]'),
  (id) => stable(`![video](https://example.test/video-${id}.mp4 "Video ${id}")`),
  (id) => stable(`![Image ${id}](image-${id}.png "Title ${id}")`),
  (id) => stable(`See [[Project ${id}|project alias ${id}]].`),
  (id) => ({
    source: `![[assets/image-${id}.png|Local image ${id}]]`,
    expected: `![Local image ${id}](assets/image-${id}.png)`,
  }),
  (id) => stable(`<!-- User comment ${id} -->`),
  (id) => stable(`<?note value-${id}?>`),
  (id) => stable(['<![CDATA[', `value ${id} < value ${id + 1}`, ']]>'].join('\n')),
  (id) => stable(['<pre>', `first raw line ${id}`, '', `second raw line ${id}`, '</pre>'].join('\n')),
  (id) => stable(['<style>', `.case-${id} { color: red; }`, '', `.next-${id} { color: blue; }`, '</style>'].join('\n')),
  (id) => stable(`<div data-case="${id}">Raw HTML ${id}</div>`),
  (id) => stable([
    `- <textarea data-case="${id}">`,
    `  nested list raw HTML ${id}`,
    '  </textarea>',
  ].join('\n')),
  (id) => stable([
    '- ```ts',
    `  nested list code ${id}`,
    '  ```',
  ].join('\n')),
  (id) => stable([
    '7. ~~~~md',
    `   ordered list code ${id}`,
    '   > ~~~~',
    '   ~~~~',
  ].join('\n')),
  (id) => stable([
    '> - ```md',
    `>   quote list code ${id}`,
    '>   ```',
  ].join('\n')),
  (id) => stable([
    '> ```md',
    `> quoted code ${id}`,
    '> ```',
  ].join('\n')),
  (id) => stable([
    '````md',
    '> ````',
    `protected pseudo close ${id}`,
    '````',
  ].join('\n')),
  (id) => stable([
    '- $$',
    `  x_${id} = y_${id}`,
    '  $$',
  ].join('\n')),
  (id) => stable([
    '- \\[',
    `  x_${id} = y_${id}`,
    '  \\]',
  ].join('\n')),
  (id) => stable([
    '7. \\[',
    `   x_${id} = y_${id}`,
    '   \\]',
  ].join('\n')),
  (id) => stable([
    '> - \\[',
    `>   x_${id} = y_${id}`,
    '>   \\]',
  ].join('\n')),
  (id) => stable(`- \\[x_${id} = y_${id}\\]`),
  (id) => stable(`7. $$x_${id} = y_${id}$$`),
  (id) => stable([
    '$$',
    '> $$',
    `x_${id} = y_${id}`,
    '$$',
  ].join('\n')),
  (id) => stable([
    '$$$',
    '$$',
    `x_${id} = y_${id}`,
    '$$$',
  ].join('\n')),
  (id) => stable([
    '$$$',
    `x_${id} = y_${id}`,
    '$$$$',
  ].join('\n')),
  (id) => stable([
    '* Parent',
    `  * Nested ${id}`,
    '- ```ts',
    `  adjacent marker code ${id}`,
    '  ```',
  ].join('\n')),
  (id) => stable([
    '- <textarea>',
    `  - protected html marker ${id}`,
    '  ```not-a-fence',
    '  </textarea>',
  ].join('\n')),
  (id) => stable([
    '> <svg>',
    `> nested quote raw HTML ${id}`,
    '> ```not-a-fence',
    '> </svg>',
  ].join('\n')),
  (id) => stable([
    `Footnote HTML ${id}[^html-${id}].`,
    '',
    `[^html-${id}]: <textarea>`,
    `    nested footnote raw HTML ${id}`,
    '    </textarea>',
  ].join('\n')),
  (id) => stable([
    `Term HTML ${id}`,
    ': <textarea>',
    `  nested definition raw HTML ${id}`,
    '  </textarea>',
  ].join('\n')),
  (id) => stable([`Aligned paragraph ${id}.`, '<!--align:center-->'].join('\n')),
  (id) => stable([`Hard break ${id}  `, `continued ${id}.`].join('\n')),
];

function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

function joinBlocks(blocks: readonly GeneratedBlock[], gaps: readonly number[], field: 'source' | 'expected'): string {
  return blocks.map((block, index) => {
    const value = field === 'expected' ? block.expected ?? block.source : block.source;
    return index === 0 ? value : `${'\n'.repeat((gaps[index - 1] ?? 0) + 1)}${value}`;
  }).join('');
}

function createRandomizedCases() {
  return RANDOM_SEEDS.flatMap((seed) => {
    const random = createRandom(seed);
    return Array.from({ length: CASES_PER_SEED }, (_, caseIndex) => {
      const blocks: GeneratedBlock[] = [];
      if (random() % 3 === 0) {
        blocks.push(stable([
          '---',
          `title: Random ${seed.toString(16)}-${caseIndex}`,
          '',
          `case: ${caseIndex}`,
          '---',
        ].join('\n')));
      }

      const blockCount = 4 + (random() % 6);
      for (let blockIndex = 0; blockIndex < blockCount; blockIndex += 1) {
        const id = caseIndex * 100 + blockIndex;
        blocks.push(blockFactories[random() % blockFactories.length]!(id));
      }

      const gaps = Array.from({ length: blocks.length - 1 }, () => random() % 3);
      const seedLabel = seed.toString(16).padStart(8, '0');
      return {
        name: `seed=${seedLabel} case=${caseIndex} gaps=${gaps.join(',')}`,
        independentParts: blocks.map((block) => block.source),
        markdown: joinBlocks(blocks, gaps, 'source'),
        expected: joinBlocks(blocks, gaps, 'expected'),
      };
    });
  });
}

describe('randomized markdown syntax persistence', () => {
  it('keeps valid randomized syntax sequences byte-stable across repeated production saves', { timeout: 300_000 }, async () => {
    const cases = createRandomizedCases();
    const result = await expectStableMarkdownRoundTrips(cases);

    expect(cases).toHaveLength(RANDOM_SEEDS.length * CASES_PER_SEED);
    expect(result.checked).toBeGreaterThanOrEqual(320);
    expect(result.checked + result.skipped).toBe(cases.length);
  });
});
