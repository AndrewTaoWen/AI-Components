import { readFile } from 'node:fs/promises';
import { evaluateWorkflowCase } from '../dist/evaluation.js';
import { workflowCases, baseline } from '../evaluation/fixtures.mjs';
const file = process.argv[2];
if (!file) {
  console.error('Supply externally generated proposal JSON. This command does not call a model.');
  process.exit(1);
}
const outputs = JSON.parse(await readFile(file, 'utf8'));
if (
  Object.keys(outputs).some((id) => !workflowCases.some((item) => item.id === id)) ||
  workflowCases.some((item) => !Object.hasOwn(outputs, item.id) || !Array.isArray(outputs[item.id]))
)
  throw new Error('Results must cover exactly the fixture IDs.');
console.log(
  JSON.stringify(
    workflowCases.map((fixture) => ({
      id: fixture.id,
      baseline: evaluateWorkflowCase(fixture, baseline(fixture)),
      candidate: evaluateWorkflowCase(fixture, outputs[fixture.id]),
    })),
    null,
    2,
  ),
);
