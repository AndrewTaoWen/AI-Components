'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { useAIProposal } from './use-ai-proposal.js';
import type { AIConfig } from './types.js';

export interface AIDateValue {
  date: string;
  time?: string;
  timeZone: string;
}
export interface AIDateInputProps {
  value: AIDateValue | null;
  onValueChange(value: AIDateValue | null): void;
  /** Explicit ISO reference instant for phrases such as "next Friday". */
  referenceDate: string;
  timeZone: string;
  disabled?: boolean;
  ai?: AIConfig;
  label?: string;
}

/** Calendar date and local time, not an instant or automatic timezone conversion. */
export function AIDateInput({
  value,
  onValueChange,
  referenceDate,
  timeZone,
  disabled,
  ai = {},
  label = 'Describe a date',
}: AIDateInputProps) {
  const id = useId();
  const [query, setQuery] = useState('');
  const validZone = isTimeZone(timeZone);
  const context = useMemo(
    () => ({ ...ai.context, dateInput: { referenceDate, timeZone } }),
    [ai.context, referenceDate, timeZone],
  );
  const parse = useCallback((data: unknown) => parseDateValue(data, timeZone), [timeZone]);
  const { task, proposal, propose, reset, error } = useAIProposal({ ...ai, context }, parse);
  const invalidReference =
    !Number.isFinite(Date.parse(referenceDate)) || !/(?:Z|[+-]\d{2}:\d{2})$/.test(referenceDate);
  useEffect(reset, [query, value, referenceDate, timeZone, disabled, reset]);

  function interpretDate() {
    if (disabled || !validZone || invalidReference || !query.trim()) return;
    void propose({
      action: 'extract',
      text: query,
      instruction:
        'Interpret the date relative to context.dateInput.referenceDate in context.dateInput.timeZone. Return data as { date: "YYYY-MM-DD", time?: "HH:mm", timeZone: string }. Use the supplied timezone exactly; do not convert to UTC. Omit time when unspecified.',
    });
  }

  return (
    <div className="aic-field">
      <div className="aic-control-row aic-wrap">
        <label>
          Date
          <input
            aria-label="Date"
            type="date"
            disabled={disabled || !validZone}
            value={value?.date ?? ''}
            onChange={(event) => {
              reset();
              if (!event.target.value) onValueChange(null);
              else if (isCalendarDate(event.target.value))
                onValueChange({ date: event.target.value, time: value?.time, timeZone });
            }}
          />
        </label>
        <label>
          Time (optional)
          <input
            aria-label="Time"
            type="time"
            disabled={disabled || !validZone || !value}
            value={value?.time ?? ''}
            onChange={(event) => {
              reset();
              if (value)
                onValueChange({ ...value, time: event.target.value || undefined, timeZone });
            }}
          />
        </label>
      </div>
      <p>Timezone: {timeZone}</p>
      {task.enabled && (
        <>
          <label htmlFor={id}>{label}</label>
          <input
            id={id}
            value={query}
            disabled={disabled}
            aria-describedby={`${id}-status`}
            placeholder="Next Friday afternoon"
            onChange={(event) => {
              reset();
              setQuery(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault();
                interpretDate();
              }
            }}
          />
          <button
            type="button"
            disabled={
              disabled ||
              !query.trim() ||
              !validZone ||
              invalidReference ||
              task.status === 'loading'
            }
            onClick={interpretDate}
          >
            {task.status === 'loading' ? 'Interpreting…' : 'Interpret date'}
          </button>
        </>
      )}
      {task.enabled && !disabled && proposal && (
        <section aria-label="Proposed date" className="aic-proposal">
          <p>
            {proposal.date}
            {proposal.time ? ` at ${proposal.time}` : ''} ({proposal.timeZone})
          </p>
          <button
            type="button"
            onClick={() => {
              onValueChange(proposal);
              reset();
            }}
          >
            Use date
          </button>
          <button type="button" onClick={reset}>
            Discard
          </button>
        </section>
      )}
      <div role="status" id={`${id}-status`} className="aic-status">
        {!validZone
          ? 'Provide a valid IANA timezone.'
          : invalidReference
            ? 'Provide a reference instant with a timezone offset.'
            : error}
      </div>
    </div>
  );
}

function isTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}
function isCalendarDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
function parseDateValue(data: unknown, timeZone: string): AIDateValue {
  if (
    !data ||
    typeof data !== 'object' ||
    !('date' in data) ||
    typeof data.date !== 'string' ||
    !isCalendarDate(data.date)
  )
    throw new Error('The model returned an invalid calendar date.');
  if (!('timeZone' in data) || data.timeZone !== timeZone)
    throw new Error('The model changed the requested timezone.');
  const time = 'time' in data ? data.time : undefined;
  if (time !== undefined && (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)))
    throw new Error('The model returned an invalid time.');
  return { date: data.date, ...(time === undefined ? {} : { time: time as string }), timeZone };
}
