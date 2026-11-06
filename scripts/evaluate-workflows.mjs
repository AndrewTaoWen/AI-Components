import { readFile } from 'node:fs/promises';
import { evaluateWorkflowCase } from '../dist/evaluation.js';
import { workflowCases, baseline } from '../evaluation/fixtures.mjs';
try {
  const args = process.argv.slice(2);
  const pathIndex = args.indexOf('--results');
  const external = pathIndex < 0 ? null : JSON.parse(await readFile(args[pathIndex + 1], 'utf8'));
  if (
    external &&
    (Object.keys(external).some((id) => !workflowCases.some((fixture) => fixture.id === id)) ||
      workflowCases.some(
        (fixture) => !Object.hasOwn(external, fixture.id) || !Array.isArray(external[fixture.id]),
      ))
  )
    throw new Error(
      'Results must contain exactly the fixture IDs, each mapped to a proposal array.',
    );
  const results = workflowCases.map((fixture) =>
    evaluateWorkflowCase(fixture, external ? external[fixture.id] : baseline(fixture)),
  );
  const report = {
    version: 1,
    mode: external ? 'supplied-results' : 'rule-baseline',
    passed: results.filter((item) => item.passed).length,
    total: results.length,
    results,
  };
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  if (args.includes('--require-pass') && report.passed !== report.total) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
