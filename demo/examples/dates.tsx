import { useState } from 'react';
import { AIDateInput, type AIDateValue } from '../../src/index.js';
import type { ComponentExample } from './registry.js';
function Example() {
  const [value, setValue] = useState<AIDateValue | null>(null);
  return (
    <>
      <p className="description">
        Review the exact date, local time, and timezone before accepting.
      </p>
      <AIDateInput
        value={value}
        onValueChange={setValue}
        timeZone="America/Toronto"
        referenceDate="2026-10-20T12:00:00Z"
      />
      <p className="footnote">
        The mock interprets “next Friday afternoon” as October 23 at 15:00, using a fixed reference
        of October 20, 2026. These are local calendar values; DST disambiguation is owned by your
        app.
      </p>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </>
  );
}
export default {
  label: 'Date input',
  eyebrow: '09 / SCHEDULE',
  title: 'Turn a phrase into a date',
  icon: '◷',
  Component: Example,
} satisfies ComponentExample;
