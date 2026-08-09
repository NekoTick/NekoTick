import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { checkBuildBudget } from './check-build-budget.mjs';
import { assertNotWsl } from './ensure-not-wsl.mjs';

let runSequence = 0;

function runPnpm(args) {
  return new Promise((resolve) => {
    mkdirSync('temp', { recursive: true });
    const runId = runSequence += 1;
    const stdoutPath = `temp/quality-gate-${runId}.stdout.log`;
    const stderrPath = `temp/quality-gate-${runId}.stderr.log`;
    const stdoutFd = openSync(stdoutPath, 'w');
    const stderrFd = openSync(stderrPath, 'w');
    let outputRead = false;
    const child =
      process.platform === 'win32'
        ? spawn('cmd.exe', ['/c', 'pnpm', ...args], { stdio: ['ignore', stdoutFd, stderrFd] })
        : spawn('pnpm', args, { stdio: ['ignore', stdoutFd, stderrFd] });

    const readOutput = () => {
      if (!outputRead) {
        closeSync(stdoutFd);
        closeSync(stderrFd);
        outputRead = true;
      }
      return {
        stdout: readFileSync(stdoutPath, 'utf8'),
        stderr: readFileSync(stderrPath, 'utf8'),
      };
    };

    child.on('error', (error) => {
      const { stdout, stderr } = readOutput();
      resolve({
        status: 1,
        stdout,
        stderr: `${stderr}${error.stack ?? error.message}`,
      });
    });

    child.on('close', (status) => {
      const { stdout, stderr } = readOutput();
      resolve({
        status: status ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

function startStep(label, args) {
  console.log(`[QualityGate] ${label}...`);
  return runPnpm(args).then((result) => ({
    label,
    ...result,
    output: `${result.stdout || ''}${result.stderr || ''}`,
  }));
}

async function main() {
  assertNotWsl('quality:gate');

  const results = await Promise.all([
    startStep('Electron-only guard', ['run', 'quality:electron-only']),
    startStep('Typecheck', ['exec', 'tsc', '--noEmit', '--pretty', 'false']),
    startStep('Production dependency audit', ['audit', '--prod', '--audit-level=high']),
    startStep('Build', ['build']),
  ]);

  for (const result of results) {
    process.stdout.write(result.output);
  }

  const failed = results.find((result) => result.status !== 0);
  if (failed) {
    throw new Error(`[QualityGate] ${failed.label} failed with code ${failed.status ?? 'unknown'}.`);
  }

  const buildLog = results.find((result) => result.label === 'Build')?.output ?? '';

  mkdirSync('temp', { recursive: true });
  const logPath = 'temp/build-quality-gate.log';
  writeFileSync(logPath, buildLog, 'utf8');

  const budgetResult = checkBuildBudget(buildLog);
  if (!budgetResult.ok) {
    for (const error of budgetResult.errors) {
      console.error(`[QualityGate][FAIL] ${error}`);
    }
    throw new Error('[QualityGate] Build budget check failed.');
  }

  const { mainIndexChunk, chunksOver500Kb, unresolvedWarnings } = budgetResult.stats;
  console.log(`[QualityGate] unresolved warnings: ${unresolvedWarnings}`);
  console.log(
    `[QualityGate] main index chunk: ${mainIndexChunk.file || 'N/A'} ${mainIndexChunk.sizeKb.toFixed(2)} kB`,
  );
  console.log(`[QualityGate] chunks >500k: ${chunksOver500Kb.length}`);
  console.log(`[QualityGate] build log saved: ${logPath}`);
  console.log('[QualityGate] PASS');
}

await main();
