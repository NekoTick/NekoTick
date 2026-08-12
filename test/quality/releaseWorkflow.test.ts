import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('release workflow', () => {
  it('runs tag publishing after skipped non-release dependencies', () => {
    const workflow = readFileSync('.github/workflows/build.yml', 'utf8');
    const packageReleaseJob = workflow.slice(
      workflow.indexOf('\n  package-release:'),
      workflow.indexOf('\n  publish:'),
    );
    const publishJob = workflow.slice(workflow.indexOf('\n  publish:'));

    expect(packageReleaseJob).toContain("if: always() && (startsWith(github.ref, 'refs/tags/')");
    expect(packageReleaseJob).toContain("needs.checks.result == 'success'");
    expect(publishJob).toContain("if: always() && (startsWith(github.ref, 'refs/tags/')");
    expect(publishJob).toContain("needs.package-release.result == 'success'");
  });

  it('downloads only run-scoped GitHub Release artifacts for publishing', () => {
    const workflow = readFileSync('.github/workflows/build.yml', 'utf8');
    const publishJob = workflow.slice(workflow.indexOf('\n  publish:'));

    expect(publishJob).toContain('pattern: vlaina-*-run-${{ github.run_number }}');
  });
});
