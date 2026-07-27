import { describe, expect, it, vi } from 'vitest'
import { createAnthropicStreamAccumulator } from './anthropicStreamAccumulator'

describe('Anthropic tool stream accumulator', () => {
  it('preserves block order when a compatible stream omits indexes and delta types', () => {
    const accumulator = createAnthropicStreamAccumulator(vi.fn())
    accumulator.consume({
      type: 'content_block_delta',
      delta: { thinking: 'first' },
    })
    accumulator.consume({
      type: 'content_block_delta',
      delta: { text: 'visible' },
    })
    accumulator.consume({
      type: 'content_block_delta',
      delta: { thinking: 'second' },
    })

    const result = accumulator.finish()
    expect(result.content).toBe('<think>first</think>visible<think>second</think>')
    expect(result.blocks.map((block) => block.type)).toEqual(['thinking', 'text', 'thinking'])
  })

  it('preserves signed and redacted thinking blocks for tool continuation', () => {
    const accumulator = createAnthropicStreamAccumulator(vi.fn())
    accumulator.consume({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'thinking', thinking: '' },
    })
    accumulator.consume({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'thinking_delta', thinking: 'inspect first' },
    })
    accumulator.consume({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'signature_delta', signature: 'signed-thinking' },
    })
    accumulator.consume({
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'redacted_thinking', data: 'opaque-thinking' },
    })

    expect(accumulator.finish()).toEqual({
      content: '<think>inspect first</think>',
      blocks: [
        { type: 'thinking', thinking: 'inspect first', signature: 'signed-thinking' },
        { type: 'redacted_thinking', data: 'opaque-thinking' },
      ],
    })
  })

  it('keeps split tool input out of visible chunks', () => {
    const onChunk = vi.fn()
    const accumulator = createAnthropicStreamAccumulator(onChunk)
    accumulator.consume({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'tool-1', name: 'run_command', input: {} },
    })
    accumulator.consume({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{"command":"pwd",' },
    })
    accumulator.consume({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '"purpose":"Inspect cwd"}' },
    })

    expect(accumulator.finish().blocks).toEqual([{
      type: 'tool_use',
      id: 'tool-1',
      name: 'run_command',
      input: { command: 'pwd', purpose: 'Inspect cwd' },
    }])
    expect(onChunk).not.toHaveBeenCalled()
  })

  it('discards tool input after the aggregate argument limit is exceeded', () => {
    const accumulator = createAnthropicStreamAccumulator(vi.fn())
    accumulator.consume({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'tool-1', name: 'run_command', input: {} },
    })
    accumulator.consume({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: '{"command":"pwd"}' },
    })
    accumulator.consume({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: 'x'.repeat(64 * 1024) },
    })

    expect(accumulator.finish().blocks[0]).toMatchObject({ input: {} })
  })

  it('does not apply an out-of-range delta to the previous tool block', () => {
    const accumulator = createAnthropicStreamAccumulator(vi.fn())
    accumulator.consume({
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id: 'tool-1', name: 'run_command', input: {} },
    })
    accumulator.consume({
      type: 'content_block_delta',
      index: 32,
      delta: { type: 'input_json_delta', partial_json: '{"command":"pwd"}' },
    })

    expect(accumulator.finish().blocks[0]?.input).toEqual({})
  })
})
