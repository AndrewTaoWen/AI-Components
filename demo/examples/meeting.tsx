import { useRef, useState } from 'react';
import {
  AIActionRejectedError,
  AIActionReview,
  AIContextInspector,
  useAIAction,
  useAIAsyncPrediction,
  type AIAsyncPredictionOptions,
} from '../../src/index.js';
import { meetingRecipe, offlineMeetingGenerator, type MeetingTask } from '../meeting-policy.js';
import type { ComponentExample } from './registry.js';
function Example() {
  const [note, setNote] = useState('Could someone circulate what we agreed today?');
  const [target, setTarget] = useState({ id: 'launch', revision: 1, tasks: [] as string[] });
  const sourceRevision = useRef(1);
  const latest = useRef({ target, sourceRevision: sourceRevision.current });
  latest.current = { target, sourceRevision: sourceRevision.current };
  const [live, setLive] = useState(false);
  const [review, setReview] = useState<
    ReturnType<typeof useAIAsyncPrediction<MeetingTask>>['predictions'][number] | null
  >(null);
  const generator: AIAsyncPredictionOptions<MeetingTask>['generate'] = live
    ? async ({ borrowed, signal, limits }) => {
        const response = await fetch('/api/predict-meeting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ context: borrowed, maxOutputTokens: limits.maxOutputTokens }),
          signal,
        });
        if (!response.ok)
          throw new Error('Configure an authenticated prediction backend before using this mode.');
        return response.json();
      }
    : offlineMeetingGenerator;
  const prediction = useAIAsyncPrediction<MeetingTask>({
    ...meetingRecipe,
    actionType: 'meeting.tasks',
    context: {
      note,
      sourceRevision: sourceRevision.current,
      target: { id: target.id, revision: target.revision },
    },
    evidence: [
      { label: 'Selected meeting note', reference: 'meeting-note' },
      { label: 'Launch checklist', reference: target.id, revision: target.revision },
    ],
    generate: generator,
    validatePayload(value) {
      if (
        typeof value.text !== 'string' ||
        !value.text.trim() ||
        value.targetId !== target.id ||
        value.revision !== target.revision ||
        value.sourceRevision !== sourceRevision.current
      )
        throw new Error('The proposal references an unapproved target or revision.');
    },
  });
  const action = useAIAction<MeetingTask, { previous: string[]; revision: number }>({
    type: 'meeting.tasks',
    feedback: {
      policyId: meetingRecipe.name,
      sourceRevisions: { checklist: target.revision, note: sourceRevision.current },
    },
    validate(proposal) {
      if (
        proposal.steps.some(
          (step) =>
            step.payload.revision !== latest.current.target.revision ||
            step.payload.sourceRevision !== latest.current.sourceRevision,
        )
      )
        throw new AIActionRejectedError('Source or checklist changed. Generate a fresh proposal.');
    },
    async execute(proposal, selected) {
      const previous = latest.current.target.tasks;
      const revision = latest.current.target.revision + 1;
      setTarget({
        ...target,
        revision,
        tasks: [
          ...previous,
          ...proposal.steps
            .filter((step) => selected.includes(step.id))
            .map((step) => step.payload.text),
        ],
      });
      return { previous, revision };
    },
  });
  return (
    <>
      <p className="description">
        Compare an explicit keyword rule with an asynchronous generator on a paraphrased meeting
        action. The default generator is an offline fixture, not a live model.
      </p>
      <label>
        Meeting note
        <textarea
          aria-label="Prediction meeting note"
          value={note}
          onChange={(event) => {
            sourceRevision.current++;
            setNote(event.target.value);
          }}
        />
      </label>
      <p>
        Rule baseline:{' '}
        {/^Action:/i.test(note) ? 'Send meeting recap' : 'No explicit Action: marker found'}
      </p>
      <label>
        <input
          type="checkbox"
          checked={live}
          onChange={(event) => {
            prediction.cancel();
            setLive(event.target.checked);
          }}
        />{' '}
        Use my prediction backend
      </label>
      <button
        type="button"
        disabled={!prediction.enabled || prediction.status === 'loading'}
        onClick={() => void prediction.predict()}
      >
        Generate meeting follow-up
      </button>
      <button type="button" onClick={prediction.cancel}>
        Cancel prediction
      </button>
      {prediction.error && <p role="alert">{prediction.error}</p>}
      {prediction.predictions.map((candidate) => (
        <button
          type="button"
          key={candidate.proposal.id}
          onClick={() => {
            if (action.review(candidate.proposal)) setReview(candidate);
          }}
        >
          Review meeting proposal
        </button>
      ))}
      <AIActionReview
        proposal={action.proposal}
        onAccept={action.accept}
        onDismiss={action.dismiss}
        busy={['validating', 'executing'].includes(action.status)}
        error={action.error}
      />
      <AIContextInspector
        inspection={review?.inspection ?? prediction.predictions[0]?.inspection ?? null}
      />
      <ul aria-label="Meeting follow-up tasks">
        {target.tasks.map((text, index) => (
          <li key={index}>{text}</li>
        ))}
      </ul>
    </>
  );
}
export default {
  label: 'Async meeting',
  eyebrow: '14 / PREDICT',
  title: 'Find the follow-through',
  icon: '↗',
  Component: Example,
} satisfies ComponentExample;
