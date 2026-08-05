import { describe, expect, it, vi } from 'vitest';
import { ACCOUNT_AUTH_INVALIDATED_EVENT } from '@/lib/account/sessionEvent';
import { parseErrorTag } from '@/lib/ai/errorTag';
import { buildChatErrorPayload, extractRawErrorMessage } from './errorHandling';

describe('buildChatErrorPayload', () => {
  it('preserves desktop custom provider transport failures for custom providers', () => {
    const result = buildChatErrorPayload(
      new Error(
        "Error invoking remote method 'desktop:ai-provider:request:start': Error: AI_PROVIDER_CONNECTION_FAILED"
      ),
      false,
    );

    expect(result.message).toBe(
      "Error invoking remote method 'desktop:ai-provider:request:start': Error: AI_PROVIDER_CONNECTION_FAILED",
    );
    expect(result.xml).toBe(
      '<error type="NETWORK_ERROR" code="ai_provider_connection_failed" source="custom_provider">Error invoking remote method \'desktop:ai-provider:request:start\': Error: AI_PROVIDER_CONNECTION_FAILED</error>',
    );
  });

  it('preserves custom provider error text without normalization or clipping', () => {
    const rawMessage = ` Custom provider\u202Eerror\n${'x'.repeat(9000)} `;
    const result = buildChatErrorPayload(new Error(rawMessage), false);

    expect(result.message).toBe(rawMessage);
    expect(parseErrorTag(result.xml)?.content).toBe(rawMessage);
  });

  it('preserves custom provider upstream messages', () => {
    const result = buildChatErrorPayload(new Error('Custom provider rejected the request'), false);

    expect(result).toEqual({
      message: 'Custom provider rejected the request',
      xml: '<error type="SERVER_ERROR" code="" source="custom_provider">Custom provider rejected the request</error>',
    });
  });

  it('fails closed when an error message getter throws', () => {
    const error = Object.defineProperty({}, 'message', {
      get() {
        throw new Error('hostile getter');
      },
    });

    expect(extractRawErrorMessage(error)).toBe('AI request failed.');
    expect(buildChatErrorPayload(error, false)).toEqual({
      message: 'Unknown error',
      xml: '<error type="SERVER_ERROR" code="" source="custom_provider">Unknown error</error>',
    });
  });

  it('propagates the device-limit reason when Electron only preserves the error text', () => {
    const invalidated = vi.fn();
    window.addEventListener(ACCOUNT_AUTH_INVALIDATED_EVENT, invalidated, { once: true });

    const result = buildChatErrorPayload(new Error(
      "Error invoking remote method 'desktop:managed:chat-completion': Session signed out because device limit was reached",
    ));

    expect(result.message).toContain('5-device limit');
    expect(invalidated).toHaveBeenCalledTimes(1);
    expect(invalidated.mock.calls[0]?.[0]).toBeInstanceOf(CustomEvent);
    expect((invalidated.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ reason: 'device_limit' });
  });
});
