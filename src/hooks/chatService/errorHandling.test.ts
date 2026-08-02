import { describe, expect, it, vi } from 'vitest';
import { ACCOUNT_AUTH_INVALIDATED_EVENT } from '@/lib/account/sessionEvent';
import { buildChatErrorPayload, extractRawErrorMessage } from './errorHandling';

describe('buildChatErrorPayload', () => {
  it('localizes desktop custom provider transport failures for custom providers', () => {
    const result = buildChatErrorPayload(
      new Error(
        "Error invoking remote method 'desktop:ai-provider:request:start': Error: AI_PROVIDER_CONNECTION_FAILED"
      ),
      false,
    );

    expect(result.message).toBe(
      'The custom channel could not be reached. Check your network or the upstream service, then try again.',
    );
    expect(result.xml).toBe(
      '<error type="NETWORK_ERROR" code="ai_provider_connection_failed">The custom channel could not be reached. Check your network or the upstream service, then try again.</error>',
    );
  });

  it('does not expose custom provider error text', () => {
    const result = buildChatErrorPayload(
      new Error(`Custom provider\u202Eerror\n${'x'.repeat(9000)}`),
      false,
    );

    expect(result.message).toBe(
      '๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~',
    );
    expect(result.xml).not.toContain('Custom provider');
    expect(result.xml).not.toContain('x'.repeat(100));
  });

  it('maps custom provider upstream messages to local copy', () => {
    const result = buildChatErrorPayload(new Error('Custom provider rejected the request'), false);

    expect(result).toEqual({
      message: '๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~',
      xml: '<error type="SERVER_ERROR" code="">๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~</error>',
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
      message: '๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~',
      xml: '<error type="SERVER_ERROR" code="">๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~</error>',
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
