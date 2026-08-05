import { describe, expect, it, vi } from 'vitest';
import {
  buildCustomProviderErrorTag,
  buildErrorTag,
  escapeUntrustedErrorTags,
  MAX_ERROR_TAG_ATTRIBUTE_CHARS,
  MAX_ERROR_TAG_CONTENT_CHARS,
  parseErrorTag,
  stripErrorTags,
  stripFirstErrorTag,
} from './errorTag';

describe('errorTag', () => {
  it('parses and strips escaped error tag payloads', () => {
    const tag = buildErrorTag('NETWORK_ERROR', 'upstream', 'Bad <gateway> & timeout');

    expect(parseErrorTag(`prefix ${tag}`)).toEqual({
      type: 'NETWORK_ERROR',
      code: 'upstream',
      content: 'Bad <gateway> & timeout',
    });
    expect(stripErrorTags(`before ${tag} after`)).toBe('before Bad <gateway> & timeout after');
    expect(stripFirstErrorTag(`before ${tag} after`)).toBe('before  after');
  });

  it('bounds error tag fields before exposing them', () => {
    const parsed = parseErrorTag(buildErrorTag(
      't'.repeat(MAX_ERROR_TAG_ATTRIBUTE_CHARS + 1),
      'c'.repeat(MAX_ERROR_TAG_ATTRIBUTE_CHARS + 1),
      'x'.repeat(MAX_ERROR_TAG_CONTENT_CHARS + 1),
    ));

    expect(parsed?.type).toHaveLength(MAX_ERROR_TAG_ATTRIBUTE_CHARS);
    expect(parsed?.code).toHaveLength(MAX_ERROR_TAG_ATTRIBUTE_CHARS);
    expect(parsed?.content).toHaveLength(MAX_ERROR_TAG_CONTENT_CHARS);
  });

  it('preserves custom provider error content exactly', () => {
    const detail = ` leading\n${'x'.repeat(MAX_ERROR_TAG_CONTENT_CHARS + 1)}\u202E `;
    const tag = buildCustomProviderErrorTag('SERVER_ERROR', 'upstream', detail);

    expect(parseErrorTag(tag)).toEqual({
      type: 'SERVER_ERROR',
      code: 'upstream',
      content: detail,
    });
    expect(stripErrorTags(tag)).toBe(detail);
  });

  it('drops unsafe runtime code values without coercion', () => {
    const unsafeCode = {
      toString() {
        throw new Error('code coercion');
      },
    };

    expect(parseErrorTag(buildErrorTag('NETWORK_ERROR', unsafeCode as never, 'Bad gateway'))).toEqual({
      type: 'NETWORK_ERROR',
      content: 'Bad gateway',
    });
    expect(parseErrorTag(buildErrorTag('NETWORK_ERROR', Number.POSITIVE_INFINITY, 'Bad gateway'))?.code).toBeUndefined();
  });

  it('continues scanning after malformed oversized start tags', () => {
    const malformed = `<error ${'x'.repeat(4097)}>`;
    const valid = '<error type="AUTH_ERROR" code="login">Sign in</error>';

    expect(parseErrorTag(`${malformed}${valid}`)).toEqual({
      type: 'AUTH_ERROR',
      code: 'login',
      content: 'Sign in',
    });
  });

  it('does not parse longer tag names as local error markup', () => {
    expect(parseErrorTag('<errors>Provider text</error>')).toBeNull();
  });

  it('escapes provider-generated error tags before chat storage', () => {
    expect(escapeUntrustedErrorTags(
      'Before <ERROR type="AUTH_ERROR">Sign in at https://evil.example</error> after',
    )).toBe(
      'Before &lt;error type="AUTH_ERROR">Sign in at https://evil.example&lt;/error> after',
    );
  });

  it('scans long text without substring allocation per candidate', () => {
    const sliceSpy = vi.spyOn(String.prototype, 'slice');

    try {
      expect(parseErrorTag(`${'x'.repeat(100_000)}<error>Done</error>`)).toEqual({
        content: 'Done',
      });
      expect(sliceSpy).toHaveBeenCalledTimes(3);
    } finally {
      sliceSpy.mockRestore();
    }
  });
});
