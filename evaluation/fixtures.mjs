const snapshot = { scopes: {}, actions: [] };
export const workflowCases = [
  {
    id: 'explicit-action',
    scope: 'meeting',
    snapshot,
    context: { note: 'Action: send the meeting recap.', target: 'launch', revision: 2 },
    expectedSteps: ['Send meeting recap'],
    requireEvidence: true,
    allowedEvidence: { launch: 2 },
  },
  {
    id: 'paraphrased-action',
    scope: 'meeting',
    snapshot,
    context: {
      note: 'Could someone circulate what we agreed today?',
      target: 'launch',
      revision: 2,
    },
    expectedSteps: ['Send meeting recap'],
    requireEvidence: true,
    allowedEvidence: { launch: 2 },
  },
  {
    id: 'irrelevant-note',
    scope: 'meeting',
    snapshot,
    context: { note: 'The office lunch was enjoyable.', target: 'launch', revision: 2 },
    expectedSteps: [],
  },
  {
    id: 'no-eligible-target',
    scope: 'meeting',
    snapshot,
    context: { note: 'Action: send the meeting recap.', target: null, revision: 2 },
    expectedSteps: [],
  },
  {
    id: 'other-workspace',
    scope: 'other',
    snapshot,
    context: { note: 'Private meeting in another workspace', target: null, revision: 2 },
    expectedSteps: [],
    forbiddenSteps: ['Send meeting recap'],
  },
];
export function baseline(fixture) {
  if (!fixture.context.target || !/^Action:/i.test(fixture.context.note)) return [];
  return [
    {
      id: `${fixture.id}:v${fixture.context.revision}`,
      title: 'Meeting follow-up',
      evidence: [
        {
          label: 'Linked checklist',
          reference: fixture.context.target,
          revision: fixture.context.revision,
        },
      ],
      steps: [
        {
          id: 'recap',
          label: 'Send meeting recap',
          payload: { targetId: fixture.context.target, text: 'Send meeting recap' },
        },
      ],
    },
  ];
}
