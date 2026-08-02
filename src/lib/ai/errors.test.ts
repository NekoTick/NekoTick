import { describe, expect, it } from 'vitest';
import {
  getUserFacingAIError,
  MAX_USER_FACING_AI_ERROR_CODE_CHARS,
  MAX_USER_FACING_AI_ERROR_MESSAGE_CHARS,
  parseAPIError,
  parseHTTPError,
} from './errors';
import {
  getManagedServiceErrorMessage,
  MAX_MANAGED_SERVICE_ERROR_MESSAGE_CHARS,
  parseManagedError,
} from './managed/errors';
import { AIErrorType } from './types';
import { isErrorNamed } from './errorClassification';

describe('getUserFacingAIError', () => {
  it('explains managed session eviction caused by the device limit', () => {
    const error = new Error('Session signed out because device limit was reached') as Error & {
      errorCode?: string;
      statusCode?: number;
    };
    error.errorCode = 'session_device_limit';
    error.statusCode = 401;

    expect(getUserFacingAIError(error)).toEqual({
      type: AIErrorType.AUTH_ERROR,
      code: 'session_device_limit',
      message: '๑ᵒᯅᵒ๑ This device was signed out because your account reached the 5-device limit. Sign in again to continue.',
    });

    expect(getUserFacingAIError(new Error(
      "Error invoking remote method 'desktop:managed:get-budget': Session signed out because device limit was reached",
    ))).toEqual({
      type: AIErrorType.AUTH_ERROR,
      code: 'session_device_limit',
      message: '๑ᵒᯅᵒ๑ This device was signed out because your account reached the 5-device limit. Sign in again to continue.',
    });
  });

  it('maps fetch failures to the network error message', () => {
    const result = getUserFacingAIError(new TypeError('Failed to fetch'));

    expect(result).toEqual({
      type: AIErrorType.NETWORK_ERROR,
      code: '',
      message: 'Network connection error. Please check your connection and try again.',
    });
  });

  it('does not expose detailed direct provider transport failures', () => {
    const result = getUserFacingAIError({
      type: AIErrorType.NETWORK_ERROR,
      message: 'Failed to fetch',
      details: 'OpenAI-compatible chat request to https://api.example.com/v1/chat/completions failed: fetch failed: certificate has expired',
    });

    expect(result).toEqual({
      type: AIErrorType.NETWORK_ERROR,
      code: '',
      message: 'Network connection error. Please check your connection and try again.',
    });
  });

  it('maps timeout failures to the timeout message', () => {
    const result = getUserFacingAIError(new Error('The AI request timed out.'));

    expect(result).toEqual({
      type: AIErrorType.TIMEOUT,
      code: '',
      message: 'The request timed out. Please try again later.',
    });
  });

  it('does not treat DOM abort exceptions as structured AI errors', () => {
    expect(parseAPIError(new DOMException('provider stream aborted', 'AbortError'))).toEqual({
      type: AIErrorType.SERVER_ERROR,
      message: 'provider stream aborted',
      details: undefined,
      statusCode: undefined,
    });
  });

  it('does not coerce unknown object errors', () => {
    const hostileError = {
      toString: () => {
        throw new Error('error should not be coerced');
      },
      [Symbol.toPrimitive]: () => {
        throw new Error('error should not be coerced');
      },
    };

    expect(parseAPIError(hostileError)).toMatchObject({
      type: AIErrorType.UNKNOWN,
      message: 'Unknown error',
    });
    expect(getUserFacingAIError(hostileError)).toEqual({
      type: AIErrorType.SERVER_ERROR,
      code: '',
      message: '๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~',
    });
  });

  it('checks error names without invoking hostile getters', () => {
    const error = Object.defineProperty({}, 'name', {
      get: () => { throw new Error('hostile name getter'); },
    });

    expect(() => isErrorNamed(error, 'AbortError')).not.toThrow();
    expect(isErrorNamed(error, 'AbortError')).toBe(false);
    expect(isErrorNamed(new DOMException('Aborted', 'AbortError'), 'AbortError')).toBe(true);
  });

  it('fails closed when error field getters throw', () => {
    const hostileError = new Proxy({}, {
      get() {
        throw new Error('hostile getter');
      },
    });

    expect(parseAPIError(hostileError)).toMatchObject({
      type: AIErrorType.UNKNOWN,
      message: 'Unknown error',
    });
    expect(getUserFacingAIError(hostileError)).toEqual({
      type: AIErrorType.SERVER_ERROR,
      code: '',
      message: '๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~',
    });
  });

  it('maps managed auth failures to the auth message', () => {
    const result = getUserFacingAIError(new Error('vlaina sign-in required'), { managed: true });

    expect(result).toEqual({
      type: AIErrorType.AUTH_ERROR,
      code: '',
      message: 'Your sign-in session has expired. Please sign in again and try again.',
    });
  });

  it('maps rate limit responses to the rate limit message', () => {
    const result = getUserFacingAIError({ statusCode: 429, message: 'Too many requests' });

    expect(result).toEqual({
      type: AIErrorType.RATE_LIMIT,
      code: '429',
      message: '๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~',
    });
  });

  it('does not expose channel failure details', () => {
    const result = getUserFacingAIError(new Error('No available channel for model test'));

    expect(result).toEqual({
      type: AIErrorType.SERVER_ERROR,
      code: '',
      message: '๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~',
    });
  });

  it('does not expose invalid request details', () => {
    const result = getUserFacingAIError(
      new Error('Managed chat currently supports text-only messages'),
      { managed: true },
    );

    expect(result).toEqual({
      type: AIErrorType.INVALID_REQUEST,
      code: '',
      message: 'Invalid request. Check your input and try again.',
    });
  });

  it('bounds provider error fields without exposing messages', () => {
    const result = getUserFacingAIError({
      type: AIErrorType.INVALID_REQUEST,
      message: 'x'.repeat(MAX_USER_FACING_AI_ERROR_MESSAGE_CHARS + 1),
      code: 'c'.repeat(MAX_USER_FACING_AI_ERROR_CODE_CHARS + 1),
    });

    expect(result.type).toBe(AIErrorType.INVALID_REQUEST);
    expect(result.message).toBe('Invalid request. Check your input and try again.');
    expect(result.code).toBe('');
  });

  it('does not map overlong provider error codes after trimming', () => {
    const result = getUserFacingAIError({
      errorCode: `${' '.repeat(MAX_USER_FACING_AI_ERROR_CODE_CHARS + 1)}upstream_unavailable`,
      message: 'opaque failure',
    });

    expect(result).toEqual({
      type: AIErrorType.SERVER_ERROR,
      code: '',
      message: '๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~',
    });
  });

  it('drops provider error codes with unsafe characters', () => {
    const result = getUserFacingAIError({
      code: 'safe\u202Ecode',
      message: 'opaque failure',
    });

    expect(result.code).toBe('');
  });

  it('maps managed unsupported input codes to a clear model capability message', () => {
    const error = new Error('UNSUPPORTED_MODEL_INPUT') as Error & { errorCode?: string; statusCode?: number };
    error.errorCode = 'unsupported_model_input';
    error.statusCode = 400;

    const result = getUserFacingAIError(error, { managed: true });

    expect(result).toEqual({
      type: AIErrorType.INVALID_REQUEST,
      code: 'unsupported_model_input',
      message: 'The current model does not support this input. Remove unsupported files or switch models and try again.',
    });
  });

  it('localizes web search model capability failures', () => {
    const result = getUserFacingAIError(new Error('Web search is unavailable for this model.'));

    expect(result).toEqual({
      type: AIErrorType.INVALID_REQUEST,
      code: '',
      message: 'Web search is unavailable for this model.',
    });
  });

  it('keeps low-signal server messages normalized to the upstream fallback copy', () => {
    const result = getUserFacingAIError(new Error('Internal server error'));

    expect(result).toEqual({
      type: AIErrorType.SERVER_ERROR,
      code: '',
      message: '๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~',
    });
  });

  it('maps desktop transport failures to the network error message', () => {
    const result = getUserFacingAIError('Managed API request failed: error sending request for url (https://api.vlaina.com/v1/models)');

    expect(result).toEqual({
      type: AIErrorType.NETWORK_ERROR,
      code: '',
      message: 'Network connection error. Please check your connection and try again.',
    });
  });

  it('classifies Electron direct provider fetch failures as network errors', () => {
    const result = getUserFacingAIError(
      new Error(
        "Error invoking remote method 'desktop:ai-provider:request:start': Error: AI_PROVIDER_CONNECTION_FAILED"
      )
    );

    expect(result).toEqual({
      type: AIErrorType.NETWORK_ERROR,
      code: 'ai_provider_connection_failed',
      message: 'The custom channel could not be reached. Check your network or the upstream service, then try again.',
    });
  });

  it('localizes wrapped Electron direct provider fetch failure details', () => {
    const result = getUserFacingAIError({
      type: AIErrorType.NETWORK_ERROR,
      message:
        "Error invoking remote method 'desktop:ai-provider:request:start': Error: AI_PROVIDER_CONNECTION_FAILED",
      details:
        "Error invoking remote method 'desktop:ai-provider:request:start': Error: AI_PROVIDER_CONNECTION_FAILED",
    });

    expect(result).toEqual({
      type: AIErrorType.NETWORK_ERROR,
      code: 'ai_provider_connection_failed',
      message: 'The custom channel could not be reached. Check your network or the upstream service, then try again.',
    });
  });

  it('maps managed upstream 403 proxy failures to the upstream fallback copy', () => {
    const result = getUserFacingAIError(
      new Error(
        'Managed API failed with status 403: {"error":{"message":"openai_error","type":"bad_response_status_code","param":"","code":"bad_response_status_code"}}'
      ),
      { managed: true },
    );

    expect(result).toEqual({
      type: AIErrorType.SERVER_ERROR,
      code: '403',
      message: '๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~',
    });
  });

  it('maps managed session expiry failures to the auth message', () => {
    const result = getUserFacingAIError(new Error('Managed API session expired'), { managed: true });

    expect(result).toEqual({
      type: AIErrorType.AUTH_ERROR,
      code: '',
      message: 'Your sign-in session has expired. Please sign in again and try again.',
    });
  });

  it('localizes managed upstream machine errors', () => {
    const result = getUserFacingAIError(new Error('UPSTREAM_UNAVAILABLE'), { managed: true });

    expect(result).toEqual({
      type: AIErrorType.SERVER_ERROR,
      code: 'upstream_unavailable',
      message: '๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~',
    });
  });

  it('does not expose Electron managed invalid request IPC wrappers', () => {
    const result = getUserFacingAIError(
      new Error("Error invoking remote method 'desktop:managed:chat-completion': Error: INVALID_REQUEST"),
      { managed: true },
    );

    expect(result).toEqual({
      type: AIErrorType.INVALID_REQUEST,
      code: 'invalid_request',
      message: 'Invalid request. Check your input and try again.',
    });
  });

  it('uses structured managed error codes before falling back to messages', () => {
    const result = getUserFacingAIError(
      {
        errorCode: 'upstream_unavailable',
        statusCode: 502,
        message: 'Managed API request failed',
      },
      { managed: true },
    );

    expect(result).toEqual({
      type: AIErrorType.SERVER_ERROR,
      code: 'upstream_unavailable',
      message: '๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~',
    });
  });

  it('localizes managed upstream rate limit machine errors', () => {
    const result = getUserFacingAIError(new Error('UPSTREAM_RATE_LIMITED'), { managed: true });

    expect(result).toEqual({
      type: AIErrorType.RATE_LIMIT,
      code: 'upstream_rate_limited',
      message: '๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~',
    });
  });

  it('preserves managed business 403 reasons instead of treating them as auth failures', () => {
    const result = getUserFacingAIError(
      new Error('Managed API failed with status 403: Points exhausted'),
      { managed: true },
    );

    expect(result).toEqual({
      type: AIErrorType.QUOTA_EXHAUSTED,
      code: '403',
      message: 'Points exhausted',
    });
  });

  it('preserves direct business 403 reasons instead of treating them as auth failures', () => {
    const result = getUserFacingAIError(
      {
        statusCode: 403,
        message: 'No active points balance',
      },
      { managed: true },
    );

    expect(result).toEqual({
      type: AIErrorType.QUOTA_EXHAUSTED,
      code: '403',
      message: 'Points exhausted',
    });
  });

  it('maps managed quota error codes even if the message changes', () => {
    const result = getUserFacingAIError(
      {
        errorCode: 'points_exhausted',
        statusCode: 403,
        message: 'Monthly allowance is empty',
      },
      { managed: true },
    );

    expect(result).toEqual({
      type: AIErrorType.QUOTA_EXHAUSTED,
      code: 'points_exhausted',
      message: 'Points exhausted',
    });
  });

  it('maps insufficient managed points from desktop stream errors to the billing prompt', () => {
    const error = new Error('Insufficient remaining points') as Error & {
      statusCode: number;
      errorCode: string;
    };
    error.statusCode = 403;
    error.errorCode = 'insufficient_points';

    const result = getUserFacingAIError(error, { managed: true });

    expect(result).toEqual({
      type: AIErrorType.QUOTA_EXHAUSTED,
      code: 'insufficient_points',
      message: 'Points exhausted',
    });
  });

  it('does not let custom providers claim managed auth state', () => {
    const result = getUserFacingAIError({
      type: AIErrorType.AUTH_ERROR,
      statusCode: 401,
      message: 'Sign in to Vlaina to continue',
    });

    expect(result).toEqual({
      type: AIErrorType.SERVER_ERROR,
      code: '401',
      message: 'Authentication failed. Check your API key or sign in again.',
    });
  });

  it('does not let custom providers claim managed quota state', () => {
    const result = getUserFacingAIError({
      type: AIErrorType.QUOTA_EXHAUSTED,
      errorCode: 'points_exhausted',
      message: 'Points exhausted',
    });

    expect(result).toEqual({
      type: AIErrorType.RATE_LIMIT,
      code: 'points_exhausted',
      message: '๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~',
    });
  });
});

describe('parseManagedError', () => {
  it('bounds managed service error messages before storing them', () => {
    expect(getManagedServiceErrorMessage(
      new Error('x'.repeat(MAX_MANAGED_SERVICE_ERROR_MESSAGE_CHARS + 1))
    )).toHaveLength(MAX_MANAGED_SERVICE_ERROR_MESSAGE_CHARS);
  });

  it('does not coerce unknown managed service errors', () => {
    const hostileError = {
      toString: () => {
        throw new Error('managed error should not be coerced');
      },
      [Symbol.toPrimitive]: () => {
        throw new Error('managed error should not be coerced');
      },
    };

    expect(getManagedServiceErrorMessage(hostileError)).toBe('');
  });

  it('fails closed when a managed error message getter throws', () => {
    const hostileError = Object.defineProperty({}, 'message', {
      get() {
        throw new Error('hostile getter');
      },
    });

    expect(getManagedServiceErrorMessage(hostileError)).toBe('');
  });

  it('preserves managed HTTP status and public error code', async () => {
    const error = await parseManagedError(new Response(JSON.stringify({
      success: false,
      error: 'UPSTREAM_UNAVAILABLE',
      errorCode: 'upstream_unavailable',
    }), { status: 502 }));

    expect(error).toMatchObject({
      message: 'UPSTREAM_UNAVAILABLE',
      statusCode: 502,
      errorCode: 'upstream_unavailable',
    });
  });

  it('does not expose managed backend messages when a public code exists', async () => {
    const error = await parseManagedError(new Response(JSON.stringify({
      success: false,
      error: 'Model is not available for this user',
      errorCode: 'points_exhausted',
    }), { status: 403 }));

    expect(error).toMatchObject({
      message: 'MANAGED_QUOTA_EXHAUSTED',
      statusCode: 403,
      errorCode: 'points_exhausted',
    });
  });

  it('preserves managed unsupported input status and public error code', async () => {
    const error = await parseManagedError(new Response(JSON.stringify({
      success: false,
      error: 'UNSUPPORTED_MODEL_INPUT',
      errorCode: 'unsupported_model_input',
    }), { status: 400 }));

    expect(error).toMatchObject({
      message: 'UNSUPPORTED_MODEL_INPUT',
      statusCode: 400,
      errorCode: 'unsupported_model_input',
    });
  });

  it('does not map overlong managed public error codes', async () => {
    const error = await parseManagedError(new Response(JSON.stringify({
      success: false,
      error: 'Points exhausted',
      errorCode: `${' '.repeat(513)}points_exhausted`,
    }), { status: 403 }));

    expect(error).toMatchObject({
      message: 'Managed API request failed: HTTP 403',
      statusCode: 403,
    });
    expect((error as Error & { errorCode?: string }).errorCode).toBeUndefined();
  });

  it('falls back to a generic managed HTTP message for unknown payloads', async () => {
    const error = await parseManagedError(new Response(JSON.stringify({
      success: false,
      error: 'Channel secret is not configured in Worker secrets',
    }), { status: 503 }));

    expect(error).toMatchObject({
      message: 'Managed API request failed: HTTP 503',
      statusCode: 503,
    });
  });

  it('does not expose unknown managed error codes', async () => {
    const error = await parseManagedError(new Response(JSON.stringify({
      error: 'fake-upstream-message',
      errorCode: 'fake_upstream_secret',
    }), { status: 503 }));

    expect(error).toMatchObject({
      message: 'Managed API request failed: HTTP 503',
      statusCode: 503,
    });
    expect(error).not.toHaveProperty('errorCode');
  });

  it('bounds managed HTTP error body reads', async () => {
    let cancelCount = 0;
    const encoder = new TextEncoder();
    const error = await parseManagedError(new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('x'.repeat(64 * 1024 + 1)));
        },
        cancel() {
          cancelCount += 1;
        },
      }),
      { status: 502 },
    ));

    expect(error).toMatchObject({
      message: 'Managed API request failed: HTTP 502',
      statusCode: 502,
    });
    expect(cancelCount).toBe(1);
  });
});

describe('parseHTTPError', () => {
  it('extracts provider messages from common HTTP error body shapes', () => {
    expect(parseHTTPError(400, { error: 'bad tool call' })).toMatchObject({
      type: AIErrorType.INVALID_REQUEST,
      message: 'bad tool call',
      statusCode: 400,
    });
    expect(parseHTTPError(429, { msg: 'quota reached' })).toMatchObject({
      type: AIErrorType.RATE_LIMIT,
      message: 'quota reached',
      statusCode: 429,
    });
    expect(parseHTTPError(503, { detail: 'maintenance window' })).toMatchObject({
      type: AIErrorType.SERVER_ERROR,
      message: 'maintenance window',
      statusCode: 503,
    });
    expect(parseHTTPError(500, 'raw upstream failure')).toMatchObject({
      type: AIErrorType.SERVER_ERROR,
      message: 'raw upstream failure',
      statusCode: 500,
    });
  });

  it('does not expose HTML error documents as provider messages', () => {
    expect(parseHTTPError(524, '<!DOCTYPE html><html><head><title>nekotick.org | 524: A timeout occurred</title></head><body>Cloudflare Error code 524</body></html>')).toMatchObject({
      type: AIErrorType.UNKNOWN,
      message: '๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~',
      statusCode: 524,
    });

    expect(getUserFacingAIError(parseHTTPError(524, '<!DOCTYPE html><html><body>Cloudflare Error code 524</body></html>')).message)
      .toBe('๑ᵒᯅᵒ๑ My brain needs a breather. Try again in a moment, or switch models first~');
  });

  it('uses localized fallback messages when HTTP errors have no readable body', () => {
    expect(parseHTTPError(401)).toMatchObject({
      type: AIErrorType.AUTH_ERROR,
      message: 'Authentication failed. Check your API key or sign in again.',
      statusCode: 401,
    });
    expect(parseHTTPError(400)).toMatchObject({
      type: AIErrorType.INVALID_REQUEST,
      message: 'Invalid request. Check your input and try again.',
      statusCode: 400,
    });
  });
});
