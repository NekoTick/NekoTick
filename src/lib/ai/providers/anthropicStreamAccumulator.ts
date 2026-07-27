import { createStreamAccumulator } from '@/lib/ai/streaming'

const MAX_ANTHROPIC_STREAM_BLOCKS = 32
const MAX_ANTHROPIC_STREAM_TEXT_CHARS = 1024 * 1024
const MAX_ANTHROPIC_STREAM_TOOL_ARGUMENT_CHARS = 64 * 1024
const MAX_ANTHROPIC_STREAM_METADATA_CHARS = 1024 * 1024

export interface AnthropicStreamResult {
  blocks: Array<Record<string, unknown>>
  content: string
}

type AnthropicStreamBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'redacted_thinking'; data: string }
  | {
    type: 'tool_use'
    id: string
    name: string
    input: unknown
    inputJson: string
    inputOverflowed: boolean
  }

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

export function createAnthropicTextStreamAccumulator(onChunk: (chunk: string) => void) {
  const rendered = createStreamAccumulator(onChunk)
  return {
    consume(payload: Record<string, unknown>) {
      if (payload.type === 'content_block_start') {
        const block = isRecord(payload.content_block) ? payload.content_block : null
        if (block?.type === 'thinking' && typeof block.thinking === 'string') {
          rendered.pushDelta({ reasoning: block.thinking })
        } else if (block?.type === 'text' && typeof block.text === 'string') {
          rendered.pushDelta({ content: block.text })
        }
        return
      }
      if (payload.type !== 'content_block_delta') return
      const delta = isRecord(payload.delta) ? payload.delta : null
      if (typeof delta?.thinking === 'string') {
        rendered.pushDelta({ reasoning: delta.thinking })
      } else if (typeof delta?.text === 'string') {
        rendered.pushDelta({ content: delta.text })
      }
    },
    finish(): AnthropicStreamResult {
      return { content: rendered.finish(), blocks: [] }
    },
  }
}

function getExplicitBlockIndex(payload: Record<string, unknown>): number | null {
  if (!Object.prototype.hasOwnProperty.call(payload, 'index')) return null
  const rawIndex = payload.index
  const index = Number.isInteger(rawIndex)
    ? Number(rawIndex)
    : typeof rawIndex === 'string' && /^\d{1,16}$/.test(rawIndex.trim())
      ? Number.parseInt(rawIndex, 10)
      : -1
  return index >= 0 && index < MAX_ANTHROPIC_STREAM_BLOCKS ? index : -1
}

export function createAnthropicStreamAccumulator(onChunk: (chunk: string) => void) {
  const rendered = createStreamAccumulator(onChunk)
  const blocks = new Map<number, AnthropicStreamBlock>()
  let remainingTextChars = MAX_ANTHROPIC_STREAM_TEXT_CHARS
  let remainingMetadataChars = MAX_ANTHROPIC_STREAM_METADATA_CHARS
  let implicitBlockIndex: number | null = null

  const nextBlockIndex = () => {
    for (let index = 0; index < MAX_ANTHROPIC_STREAM_BLOCKS; index += 1) {
      if (!blocks.has(index)) return index
    }
    return null
  }
  const appendText = (value: string): string => {
    const text = value.slice(0, remainingTextChars)
    remainingTextChars -= text.length
    return text
  }
  const appendMetadata = (value: string): string => {
    if (value.length > remainingMetadataChars) {
      throw new Error('Anthropic stream metadata is too large')
    }
    remainingMetadataChars -= value.length
    return value
  }

  const consumeBlockStart = (payload: Record<string, unknown>) => {
    const explicitIndex = getExplicitBlockIndex(payload)
    if (explicitIndex === -1) return
    const index = explicitIndex ?? nextBlockIndex()
    const rawBlock = isRecord(payload.content_block) ? payload.content_block : null
    if (index === null || !rawBlock || blocks.has(index)) return
    implicitBlockIndex = index
    if (rawBlock.type === 'text') {
      const text = appendText(typeof rawBlock.text === 'string' ? rawBlock.text : '')
      blocks.set(index, { type: 'text', text })
      if (text) rendered.pushDelta({ content: text })
    } else if (rawBlock.type === 'thinking') {
      const thinking = appendText(typeof rawBlock.thinking === 'string' ? rawBlock.thinking : '')
      const signature = appendMetadata(typeof rawBlock.signature === 'string' ? rawBlock.signature : '')
      blocks.set(index, { type: 'thinking', thinking, signature })
      if (thinking) rendered.pushDelta({ reasoning: thinking })
    } else if (rawBlock.type === 'redacted_thinking') {
      const data = appendMetadata(typeof rawBlock.data === 'string' ? rawBlock.data : '')
      blocks.set(index, { type: 'redacted_thinking', data })
    } else if (rawBlock.type === 'tool_use') {
      blocks.set(index, {
        type: 'tool_use',
        id: typeof rawBlock.id === 'string' ? rawBlock.id.slice(0, 512) : '',
        name: typeof rawBlock.name === 'string' ? rawBlock.name.slice(0, 128) : '',
        input: rawBlock.input,
        inputJson: '',
        inputOverflowed: false,
      })
    }
  }

  const consumeBlockDelta = (payload: Record<string, unknown>) => {
    const delta = isRecord(payload.delta) ? payload.delta : null
    if (!delta) return
    const expectedType = delta.type === 'text_delta'
      ? 'text'
      : delta.type === 'thinking_delta' || typeof delta.thinking === 'string'
        ? 'thinking'
        : typeof delta.text === 'string' ? 'text' : null
    const explicitIndex = getExplicitBlockIndex(payload)
    if (explicitIndex === -1) return
    let index = explicitIndex ?? implicitBlockIndex
    let block = index === null ? undefined : blocks.get(index)
    if (block && expectedType && block.type !== expectedType && explicitIndex === null) {
      block = undefined
      index = null
    }
    if (!block && expectedType) {
      index ??= nextBlockIndex()
      if (index === null) return
      block = expectedType === 'text'
        ? { type: 'text', text: '' }
        : { type: 'thinking', thinking: '', signature: '' }
      blocks.set(index, block)
      if (explicitIndex === null) implicitBlockIndex = index
    }
    if (!block) return
    if (block.type === 'text' && expectedType === 'text' && typeof delta.text === 'string') {
      const text = appendText(delta.text)
      block.text += text
      if (text) rendered.pushDelta({ content: text })
    } else if (
      block.type === 'thinking' &&
      expectedType === 'thinking' &&
      typeof delta.thinking === 'string'
    ) {
      const thinking = appendText(delta.thinking)
      block.thinking += thinking
      if (thinking) rendered.pushDelta({ reasoning: thinking })
    } else if (
      block.type === 'tool_use' &&
      delta.type === 'input_json_delta' &&
      typeof delta.partial_json === 'string'
    ) {
      const remainingChars = Math.max(
        0,
        MAX_ANTHROPIC_STREAM_TOOL_ARGUMENT_CHARS - block.inputJson.length,
      )
      if (delta.partial_json.length > remainingChars) block.inputOverflowed = true
      block.inputJson += delta.partial_json.slice(0, remainingChars)
    } else if (
      block.type === 'thinking' &&
      delta.type === 'signature_delta' &&
      typeof delta.signature === 'string'
    ) {
      block.signature += appendMetadata(delta.signature)
    }
  }

  const buildToolInput = (block: Extract<AnthropicStreamBlock, { type: 'tool_use' }>) => {
    if (block.inputOverflowed) return {}
    if (!block.inputJson) return isRecord(block.input) ? block.input : {}
    try {
      const input = JSON.parse(block.inputJson)
      return isRecord(input) ? input : {}
    } catch {
      return {}
    }
  }

  return {
    consume(payload: Record<string, unknown>) {
      if (payload.type === 'content_block_start') consumeBlockStart(payload)
      else if (payload.type === 'content_block_delta') consumeBlockDelta(payload)
    },
    finish(): AnthropicStreamResult {
      const content = rendered.finish()
      const orderedBlocks = [...blocks.entries()].sort(([left], [right]) => left - right)
      return {
        content,
        blocks: orderedBlocks.map(([, block]) => block.type === 'tool_use'
          ? { type: 'tool_use', id: block.id, name: block.name, input: buildToolInput(block) }
          : block.type === 'thinking'
            ? {
              type: 'thinking',
              thinking: block.thinking,
              ...(block.signature ? { signature: block.signature } : {}),
            }
            : { ...block }),
      }
    },
  }
}
