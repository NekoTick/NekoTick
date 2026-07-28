import { describe, expect, it, vi } from 'vitest';
import { ACCOUNT_AUTH_INVALIDATED_EVENT } from '@/lib/account/sessionEvent';
import { buildChatErrorPayload } from './errorHandling';

describe('buildChatErrorPayload', () => {
  it('localizes desktop custom provider transport failures for custom providers', () => {
    const result = buildChatErrorPayload(
      new Error(
        "Error invoking remote method 'desktop:ai-provider:request:start': Error: AI provider request to https://api.example.com/v1/chat/completions failed before an HTTP response was received: TypeError: fetch failed"
      ),
      false,
    );

    expect(result.message).toBe(
      'The custom channel still could not be reached after automatic retries. Check your network or the upstream service, then try again.',
    );
    expect(result.xml).toBe(
      '<error type="NETWORK_ERROR" code="">The custom channel still could not be reached after automatic retries. Check your network or the upstream service, then try again.</error>',
    );
  });

  it('preserves custom provider upstream messages', () => {
    const result = buildChatErrorPayload(new Error('Custom provider rejected the request'), false);

    expect(result).toEqual({
      message: 'Custom provider rejected the request',
      xml: '<error type="custom_provider" code="">Custom provider rejected the request</error>',
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
