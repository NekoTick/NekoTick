import { readErrorField } from '../errorClassification'

export function isToolInputUnsupported(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const rawErrorCode = readErrorField(error, 'errorCode')
  const rawMessage = readErrorField(error, 'message')
  const rawStatusCode = readErrorField(error, 'statusCode')
  const rawStatus = readErrorField(error, 'status')
  const errorCode = typeof rawErrorCode === 'string'
    ? rawErrorCode.slice(0, 512).toLowerCase()
    : ''
  const message = typeof rawMessage === 'string'
    ? rawMessage.slice(0, 8192).trim().toLowerCase()
    : ''
  const statusCode = typeof rawStatusCode === 'number'
    ? rawStatusCode
    : typeof rawStatus === 'number'
      ? rawStatus
      : undefined
  const mentionsToolProtocol = message.includes('tool') || message.includes('function call')
  const rejectsToolProtocol = /(?:not support|unsupported|unavailable|disabled|unknown|unrecognized|unexpected|not permitted|no endpoints? found)/.test(message)
  return errorCode === 'unsupported_model_input' || errorCode === 'unsupported_message_content'
    || errorCode === 'unsupported_tool_calling'
    || message.includes('unsupported_model_input')
    || message.includes('unsupported_message_content')
    || message.includes('unsupported model input')
    || (statusCode === undefined || statusCode === 400 || statusCode === 404 || statusCode === 422)
      && mentionsToolProtocol
      && rejectsToolProtocol
}
