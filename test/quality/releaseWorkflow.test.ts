import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('release workflow', () => {
  it('downloads only run-scoped GitHub Release artifacts for publishing', () => {
    const workflow = readFileSync('.github/workflows/build.yml', 'utf8');
    const publishJob = workflow.slice(workflow.indexOf('\n  publish:'));

    expect(publishJob).toContain('pattern: vlaina-*-run-${{ github.run_number }}');
  });
});
