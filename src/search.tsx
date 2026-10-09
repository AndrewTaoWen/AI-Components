'use client';
import {
  useEffect,
  useId,
  useState,
  type ChangeEvent,
  type FormEvent,
  type InputHTMLAttributes,
} from 'react';
import { useAITask } from './use-ai-task.js';
import type { AIConfig } from './types.js';

export interface AISearchProps<T> extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'onSearch' | 'value' | 'defaultValue'
> {
  value: string;
  onValueChange(value: string): void;
  /** Validate unknown model output into your application's filter type. */
  parse(data: unknown): T;
  onSearch(filters: T, query: string): void;
  ai?: AIConfig;
  /** Called with the raw query when AI is disabled. */
  onPlainSearch?(query: string): void;
  buttonLabel?: string;
}
export function AISearch<T>({
  value,
  onValueChange,
  parse,
  onSearch,
  ai = {},
  onPlainSearch,
  buttonLabel = 'Search',
  ...props
}: AISearchProps<T>) {
  const task = useAITask(ai);

  const [validationError, setValidationError] = useState('');

  const id = useId();
  const isLoading = task.status === 'loading';
  const cannotSubmit = props.disabled || props.readOnly || !value.trim();
  const describedBy = [props['aria-describedby'], id].filter(Boolean).join(' ');

  useEffect(() => {
    task.cancel();
    setValidationError('');
  }, [value, props.disabled, props.readOnly, task.cancel]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cannotSubmit) return;

    if (!task.enabled) {
      onPlainSearch?.(value);
      return;
    }

    setValidationError('');
    const result = await task.run({ action: 'search', text: value });
    if (!result) return;

    let filters: T;
    try {
      filters = parse(result.data);
    } catch (cause) {
      setValidationError(cause instanceof Error ? cause.message : 'Invalid search filters.');
      return;
    }

    onSearch(filters, value);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    task.cancel();
    setValidationError('');
    onValueChange(event.target.value);
  }

  return (
    <div className="aic-search">
      <form role="search" onSubmit={handleSubmit}>
        <input
          {...props}
          type="search"
          value={value}
          aria-describedby={describedBy}
          onChange={handleChange}
        />
        <button type="submit" disabled={Boolean(cannotSubmit || isLoading)}>
          {isLoading ? 'Interpreting…' : buttonLabel}
        </button>
      </form>
      <div id={id} role="status" className="aic-status">
        {validationError || task.error?.message}
      </div>
    </div>
  );
}
