import { describe, expect, it } from 'vitest';
import { shouldRenderTocContentUpdate } from './tocViewPlugin';

describe('TOC view updates', () => {
  it('skips TOC DOM writes when document edits leave headings and TOC blocks unchanged', () => {
    expect(shouldRenderTocContentUpdate({
      force: false,
      headingSignature: '1:2:Heading',
      lastHeadingSignature: '1:2:Heading',
      lastTocCount: 2,
      tocCount: 2,
    })).toBe(false);
  });

  it('renders when headings, TOC blocks, or localized content change', () => {
    const unchanged = {
      force: false,
      headingSignature: '1:2:Heading',
      lastHeadingSignature: '1:2:Heading',
      lastTocCount: 2,
      tocCount: 2,
    };

    expect(shouldRenderTocContentUpdate({ ...unchanged, headingSignature: '1:2:Renamed' })).toBe(true);
    expect(shouldRenderTocContentUpdate({ ...unchanged, tocCount: 3 })).toBe(true);
    expect(shouldRenderTocContentUpdate({ ...unchanged, force: true })).toBe(true);
  });
});
