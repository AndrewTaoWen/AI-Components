// @vitest-environment node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, expect, it } from 'vitest';
const directory = mkdtempSync(join(tmpdir(), 'workflow-cli-'));
const results = join(directory, 'results.json');
beforeAll(() => {
  const build = spawnSync('npm', ['run', 'build'], { encoding: 'utf8' });
  if (build.status !== 0) throw new Error(build.stdout + build.stderr);
}, 15000);
afterAll(() => rmSync(directory, { recursive: true, force: true }));
function run(script: string, ...args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
}
it('reports the reproducible baseline and fails the optional quality gate', () => {
  const report = run('scripts/evaluate-workflows.mjs');
  expect(report.status).toBe(0);
  expect(JSON.parse(report.stdout)).toMatchObject({ passed: 4, total: 5, mode: 'rule-baseline' });
  expect(run('scripts/evaluate-workflows.mjs', '--require-pass').status).toBe(1);
});
it('rejects incomplete or unknown fixture results', () => {
  writeFileSync(results, JSON.stringify({ unknown: [] }));
  const report = run('scripts/evaluate-workflows.mjs', '--results', results);
  expect(report.status).toBe(1);
  expect(report.stderr).toContain('exactly the fixture IDs');
  expect(run('scripts/compare-meeting-policies.mjs', results).status).toBe(1);
});
it('accepts a complete grounded candidate suite and compares it to the rule baseline', () => {
  const proposal = {
    id: 'recap',
    title: 'Follow-up',
    evidence: [{ label: 'Checklist', reference: 'launch', revision: 2 }],
    steps: [{ id: 'send', label: 'Send meeting recap', payload: null }],
  };
  writeFileSync(
    results,
    JSON.stringify({
      'explicit-action': [proposal],
      'paraphrased-action': [proposal],
      'irrelevant-note': [],
      'no-eligible-target': [],
      'other-workspace': [],
    }),
  );
  const report = run('scripts/evaluate-workflows.mjs', '--results', results, '--require-pass');
  expect(report.status).toBe(0);
  expect(JSON.parse(report.stdout)).toMatchObject({ passed: 5, total: 5 });
  const comparison = run('scripts/compare-meeting-policies.mjs', results);
  expect(comparison.status).toBe(0);
  expect(
    JSON.parse(comparison.stdout).find((item: { id: string }) => item.id === 'paraphrased-action'),
  ).toMatchObject({ baseline: { passed: false }, candidate: { passed: true } });
});
