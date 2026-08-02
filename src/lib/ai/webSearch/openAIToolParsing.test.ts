import { describe, expect, it } from 'vitest';
import {
  MAX_DSML_TOOL_MARKUP_CHARS,
  MAX_OPENAI_PAYLOAD_LINE_CHARS,
  MAX_OPENAI_PAYLOAD_TEXT_CHARS,
  MAX_OPENAI_TOOL_ARGUMENT_CHARS,
  extractOpenAIText,
  extractOpenAIToolCalls,
  extractOpenAIMessageFromJson,
  parseOpenAIPayloadText,
  stripDsmlToolCallMarkup,
} from './openAIToolParsing';
import type { OpenAIToolCall } from './openAIToolTypes';

describe('openAIToolParsing', () => {
  it('extracts DeepSeek DSML tool calls from bounded assistant content', () => {
    const content = [
      'intro',
      '<｜｜DSML｜｜tool_calls>',
      '<｜｜DSML｜｜invoke name="web_search">',
      '<｜｜DSML｜｜parameter name="query">vlaina</｜｜DSML｜｜parameter>',
      '</｜｜DSML｜｜invoke>',
      '</｜｜DSML｜｜tool_calls>',
      'answer',
    ].join('\n');

    const message = extractOpenAIMessageFromJson({
      choices: [{ message: { content } }],
    });

    expect(message.content).toBe('intro\n\nanswer');
    expect(message.toolCalls).toEqual([{
      id: 'dsml_0',
      type: 'function',
      function: {
        name: 'web_search',
        arguments: '{"query":"vlaina"}',
      },
    }]);
  });

  it('preserves typed DSML numbers and arrays', () => {
    const content = [
      '<｜｜DSML｜｜tool_calls>',
      '<｜｜DSML｜｜invoke name="run_command">',
      '<｜｜DSML｜｜parameter name="command">printf ok</｜｜DSML｜｜parameter>',
      '<｜｜DSML｜｜parameter name="purpose">Print output</｜｜DSML｜｜parameter>',
      '<｜｜DSML｜｜parameter name="timeout_seconds">30</｜｜DSML｜｜parameter>',
      '</｜｜DSML｜｜invoke>',
      '<｜｜DSML｜｜invoke name="read_web_pages">',
      '<｜｜DSML｜｜parameter name="urls">["https://example.test/a","https://example.test/b"]</｜｜DSML｜｜parameter>',
      '<｜｜DSML｜｜parameter name="contentLimit">1250</｜｜DSML｜｜parameter>',
      '</｜｜DSML｜｜invoke>',
      '</｜｜DSML｜｜tool_calls>',
    ].join('');

    const message = extractOpenAIMessageFromJson({ choices: [{ message: { content } }] });

    expect(JSON.parse(message.toolCalls[0]?.function.arguments || '{}')).toMatchObject({
      command: 'printf ok',
      timeout_seconds: 30,
    });
    expect(JSON.parse(message.toolCalls[1]?.function.arguments || '{}')).toEqual({
      urls: ['https://example.test/a', 'https://example.test/b'],
      contentLimit: 1250,
    });
  });

  it('skips DSML regex extraction for overlong assistant content', () => {
    const content = `${'a'.repeat(MAX_DSML_TOOL_MARKUP_CHARS + 1)}<｜｜DSML｜｜tool_calls>`;
    const message = extractOpenAIMessageFromJson({
      choices: [{ message: { content } }],
    });

    expect(stripDsmlToolCallMarkup(content)).toBe(content);
    expect(message.content).toBe(content);
    expect(message.toolCalls).toEqual([]);
  });

  it('skips over-deep text arrays without recursive extraction', () => {
    let value: unknown = 'hidden';
    for (let index = 0; index < 2001; index += 1) {
      value = [value];
    }

    expect(extractOpenAIText(value)).toBe('');
  });

  it('skips overlong OpenAI payload text before JSON parsing', () => {
    expect(parseOpenAIPayloadText(`data: {"payload":"${'x'.repeat(MAX_OPENAI_PAYLOAD_TEXT_CHARS)}"}`)).toBeNull();
  });

  it('skips overlong OpenAI payload lines before trimming', () => {
    expect(parseOpenAIPayloadText(`${' '.repeat(MAX_OPENAI_PAYLOAD_LINE_CHARS + 1)}{"ok":true}`)).toBeNull();
  });

  it('ignores OpenAI payload values that are not objects', () => {
    for (const value of ['null', 'true', '1', '"text"', '[]']) {
      expect(parseOpenAIPayloadText(`data: ${value}`)).toBeNull();
    }
    expect(parseOpenAIPayloadText('data: {"ok":true}')).toEqual({ ok: true });
  });

  it('ignores loosely formatted or overlong tool call indexes', () => {
    const toolCalls: OpenAIToolCall[] = [];

    extractOpenAIToolCalls({
      choices: [{
        delta: {
          tool_calls: [
            {
              index: '0x1',
              function: { name: 'web_search', arguments: '{"query":"first"}' },
            },
            {
              index: `${' '.repeat(17)}1`,
              function: { name: 'web_search', arguments: '{"query":"second"}' },
            },
          ],
        },
      }],
    }, toolCalls);

    expect(toolCalls).toEqual([
      {
        id: '',
        type: 'function',
        function: { name: 'web_search', arguments: '{"query":"first"}' },
      },
      {
        id: '',
        type: 'function',
        function: { name: 'web_search', arguments: '{"query":"second"}' },
      },
    ]);
  });

  it('normalizes object tool arguments without stringifying the original object', () => {
    const argumentsObject = {
      query: 'vlaina',
      padding: 'x'.repeat(MAX_OPENAI_TOOL_ARGUMENT_CHARS * 2),
      toJSON() {
        throw new Error('original arguments object should not be stringified');
      },
    };

    const message = extractOpenAIMessageFromJson({
      choices: [{
        message: {
          tool_calls: [{
            id: 'call-1',
            type: 'function',
            function: {
              name: 'web_search',
              arguments: argumentsObject,
            },
          }],
        },
      }],
    });

    expect(message.toolCalls).toHaveLength(1);
    expect(message.toolCalls[0].function.arguments.length).toBeLessThanOrEqual(MAX_OPENAI_TOOL_ARGUMENT_CHARS);
    expect(JSON.parse(message.toolCalls[0].function.arguments)).toMatchObject({
      query: 'vlaina',
      padding: 'x'.repeat(4096),
    });
  });

  it('drops duplicate and control-character tool call identifiers', () => {
    const message = extractOpenAIMessageFromJson({
      choices: [{
        message: {
          tool_calls: [
            { id: 'call-1', function: { name: 'run_command', arguments: '{}' } },
            { id: 'call-1', function: { name: 'run_command', arguments: '{}' } },
            { id: 'call-2\u202E', function: { name: 'run_command', arguments: '{}' } },
          ],
        },
      }],
    });

    expect(message.toolCalls.map((call) => call.id)).toEqual(['call-1']);
  });
});
