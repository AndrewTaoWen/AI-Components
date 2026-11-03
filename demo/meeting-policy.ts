import {
  defineAIContext,
  fromContext,
  type AIActionProposal,
  type AIMemoryValue,
} from '../src/index.js';
export type MeetingTask = {
  text: string;
  targetId: string;
  revision: number;
  sourceRevision: number;
};
export const meetingRecipe = defineAIContext({
  name: 'meeting.followup',
  purpose: 'Find reviewable follow-up tasks in the selected meeting note.',
  borrow: {
    note: fromContext('note'),
    target: fromContext('target'),
    sourceRevision: fromContext('sourceRevision'),
  },
});
/** Offline fixture exercises asynchronous plumbing. It is not model quality evidence. */
export async function offlineMeetingGenerator({
  borrowed,
  signal,
}: {
  borrowed: Readonly<Record<string, AIMemoryValue>>;
  signal: AbortSignal;
}): Promise<unknown> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 350);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
  const note = String(borrowed.note ?? '');
  const target = borrowed.target as { id: string; revision: number } | null;
  if (!target || !/recap|circulate|what we agreed/i.test(note)) return [];
  return [
    {
      id: `recap:${JSON.stringify([note, target.id, target.revision])}`,
      title: 'Share the meeting recap',
      steps: [
        {
          id: 'recap',
          label: 'Send meeting recap',
          payload: {
            text: 'Send meeting recap',
            targetId: target.id,
            revision: target.revision,
            sourceRevision: Number(borrowed.sourceRevision),
          },
        },
      ],
    },
  ] satisfies AIActionProposal<MeetingTask>[];
}
