import {
  cloneAIMemoryValue,
  readMemory,
  type AIMemorySnapshot,
  type AIMemoryStore,
} from './memory.js';
import { readAIFeedback } from './feedback.js';
export type AIPolicyPreference = {
  frequency: 'normal' | 'less' | 'off';
  cooldownMs: number;
  blockedProposalIds: readonly string[];
  preferredTone: string;
  defaultTarget: string;
  feedbackSince: number;
};
const key = 'aiPolicyPreferences';
const defaults: AIPolicyPreference = {
  frequency: 'normal',
  cooldownMs: 15 * 60_000,
  blockedProposalIds: [],
  preferredTone: '',
  defaultTarget: '',
  feedbackSince: 0,
};
function validate(value: AIPolicyPreference) {
  if (
    !['normal', 'less', 'off'].includes(value.frequency) ||
    !Number.isSafeInteger(value.cooldownMs) ||
    value.cooldownMs < 0 ||
    !Array.isArray(value.blockedProposalIds) ||
    value.blockedProposalIds.some((id) => typeof id !== 'string' || !id.trim()) ||
    typeof value.preferredTone !== 'string' ||
    typeof value.defaultTarget !== 'string' ||
    !Number.isFinite(value.feedbackSince)
  )
    throw new Error('Invalid policy preference.');
  return value;
}
export function getAIPolicyPreference(
  snapshot: AIMemorySnapshot,
  scope: string,
  policyId: string,
): AIPolicyPreference {
  const map = readMemory(snapshot, scope)[key] as Record<string, unknown> | undefined;
  return cloneAIMemoryValue(
    validate({
      ...defaults,
      ...(map && Object.hasOwn(map, policyId)
        ? (map[policyId] as Partial<AIPolicyPreference>)
        : {}),
    }),
  ) as unknown as AIPolicyPreference;
}
export function setAIPolicyPreference(
  memory: AIMemoryStore,
  scope: string,
  policyId: string,
  patch: Partial<AIPolicyPreference>,
) {
  if (
    !policyId.trim() ||
    ['__proto__', 'prototype', 'constructor'].includes(policyId) ||
    Object.keys(patch).some((field) => !Object.hasOwn(defaults, field))
  )
    throw new Error('Invalid preference key.');
  const current = getAIPolicyPreference(memory.getSnapshot(), scope, policyId);
  const next = validate({ ...current, ...patch });
  const map = readMemory(memory.getSnapshot(), scope)[key] as
    Record<string, AIPolicyPreference> | undefined;
  memory.update(scope, { [key]: { ...map, [policyId]: next } });
}
export function resetAIPolicyPreference(
  memory: AIMemoryStore,
  scope: string,
  policyId: string,
  now = Date.now(),
) {
  setAIPolicyPreference(memory, scope, policyId, { ...defaults, feedbackSince: now });
}
export function evaluateAIPreferenceGate(
  snapshot: AIMemorySnapshot,
  scope: string,
  policyId: string,
  proposalId?: string,
  now = Date.now(),
): { allowed: boolean; reason?: string; retryAt?: number } {
  const preference = getAIPolicyPreference(snapshot, scope, policyId);
  if (preference.frequency === 'off')
    return { allowed: false, reason: 'Suggestions disabled for this policy.' };
  if (proposalId && preference.blockedProposalIds.includes(proposalId))
    return { allowed: false, reason: 'You chose not to see this proposal again.' };
  const feedback = readAIFeedback(snapshot, scope, policyId).filter(
    (event) => Date.parse(event.timestamp) > preference.feedbackSince,
  );
  let negatives = 0;
  for (const event of [...feedback].reverse()) {
    if (event.outcome === 'accepted') break;
    if (event.outcome === 'dismissed' || event.outcome === 'undone') negatives++;
  }
  const last = [...feedback]
    .reverse()
    .find(
      (event) =>
        event.outcome === 'dismissed' ||
        event.outcome === 'undone' ||
        (preference.frequency === 'less' && event.outcome === 'shown'),
    );
  const delay =
    preference.frequency === 'less'
      ? Math.max(60 * 60_000, preference.cooldownMs)
      : preference.cooldownMs * Math.min(negatives, 4);
  const retryAt = last ? Date.parse(last.timestamp) + delay : 0;
  return retryAt > now
    ? {
        allowed: false,
        reason: 'Cooling down after recent feedback or reduced frequency.',
        retryAt,
      }
    : { allowed: true };
}
