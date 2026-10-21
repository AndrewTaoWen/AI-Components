export interface AIOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

/** Reuse existing option values; never accept invented or disabled choices. */
export function parseOptionValues(data: unknown, options: readonly AIOption[]): string[] {
  if (!data || typeof data !== 'object' || !('values' in data) || !Array.isArray(data.values)) {
    throw new Error('Expected a list of option values.');
  }
  const allowed = new Set(
    options.filter((option) => !option.disabled).map((option) => option.value),
  );
  const values: string[] = [];
  for (const value of data.values) {
    if (typeof value !== 'string' || !allowed.has(value))
      throw new Error('The model suggested an unavailable option.');
    if (!values.includes(value)) values.push(value);
  }
  return values;
}
