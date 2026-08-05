import { describe, expect, it } from 'vitest';
import { parseMobileDeepLink } from './mobileDeepLinks';

describe('parseMobileDeepLink', () => {
  it('accepts only the supported app navigation routes', () => {
    expect(parseMobileDeepLink('vlaina://open/notes')).toEqual({ view: 'notes' });
    expect(parseMobileDeepLink('vlaina://open/whiteboard')).toEqual({ view: 'whiteboard' });
    expect(parseMobileDeepLink('vlaina://open/settings')).toBeNull();
  });

  it('rejects URLs with credentials, parameters, or untrusted origins', () => {
    expect(parseMobileDeepLink('vlaina://user:secret@open/notes')).toBeNull();
    expect(parseMobileDeepLink('vlaina://open/notes?token=example')).toBeNull();
    expect(parseMobileDeepLink('https://vlaina.com/open/notes')).toBeNull();
  });
});
