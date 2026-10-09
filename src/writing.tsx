'use client';
import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type ForwardedRef,
} from 'react';
import { useAITask } from './use-ai-task.js';
import type { WritingConfig } from './types.js';

interface WritingProps {
  value: string;
  onValueChange(value: string): void;
  ai?: WritingConfig;
  wrapperClassName?: string;
}
type WritingElement = HTMLInputElement | HTMLTextAreaElement;
type ControlledAttributes = 'value' | 'defaultValue' | 'onChange';

export type AIInputProps = WritingProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, ControlledAttributes>;
export type AITextareaProps = WritingProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, ControlledAttributes>;

type WritingFieldProps = WritingProps & {
  multiline: boolean;
  forwardedRef: ForwardedRef<WritingElement>;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, ControlledAttributes>;

const DEFAULT_DEBOUNCE_MS = 600;
const DEFAULT_MIN_LENGTH = 3;

function WritingField({
  multiline,
  forwardedRef,
  value,
  onValueChange,
  ai = {},
  wrapperClassName,
  ...props
}: WritingFieldProps) {
  const task = useAITask(ai);
  const element = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [focused, setFocused] = useState(false);
  const [atEnd, setAtEnd] = useState(true);
  const [composing, setComposing] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [draft, setDraft] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const id = useId();
  const available = task.enabled && !props.disabled && !props.readOnly;
  const isLoading = task.status === 'loading';
  const statusMessage = task.error?.message ?? (isLoading ? 'Generating suggestion…' : '');
  const latest = useRef(value);
  latest.current = value;
  useEffect(() => {
    task.cancel();
    setSuggestion('');
    setDraft(null);
    if (
      !available ||
      !ai.autocomplete ||
      !focused ||
      !atEnd ||
      composing ||
      editorOpen ||
      value.length < (ai.minLength ?? DEFAULT_MIN_LENGTH)
    ) {
      return;
    }
    const timer = setTimeout(() => {
      void task.run({ action: 'complete', text: value }).then((result) => {
        if (result && latest.current === value) setSuggestion(result.text);
      });
    }, ai.debounceMs ?? DEFAULT_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      task.cancel();
    };
    // run intentionally captures the configuration associated with this timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    value,
    focused,
    atEnd,
    composing,
    editorOpen,
    available,
    ai.autocomplete,
    ai.debounceMs,
    ai.minLength,
    ai.prompt,
    ai.context,
    task.environment,
  ]);

  function acceptCompletion() {
    if (!suggestion) return;
    onValueChange(value + suggestion);
    setSuggestion('');
    task.cancel();
  }

  function toggleWritingEditor() {
    task.cancel();
    setSuggestion('');
    setEditorOpen(!editorOpen);
  }

  async function generateDraft() {
    setDraft(null);
    const result = await task.run({
      action: value ? 'rewrite' : 'write',
      text: value,
      instruction,
    });
    if (result) setDraft(result.text);
  }

  function acceptDraft() {
    if (draft === null) return;
    onValueChange(draft);
    setDraft(null);
    setEditorOpen(false);
    element.current?.focus();
  }

  function dismissAssistance() {
    task.cancel();
    setSuggestion('');
    setEditorOpen(false);
    setDraft(null);
  }

  const fieldProps = {
    ...props,
    value,
    ref: (node: HTMLInputElement | HTMLTextAreaElement | null) => {
      element.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    'aria-describedby': [props['aria-describedby'], `${id}-status`].filter(Boolean).join(' '),
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      task.cancel();
      setSuggestion('');
      setDraft(null);
      onValueChange(event.target.value);
    },
    onFocus: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFocused(true);
      props.onFocus?.(event as React.FocusEvent<HTMLTextAreaElement>);
    },
    onBlur: (event: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setFocused(false);
      props.onBlur?.(event as React.FocusEvent<HTMLTextAreaElement>);
    },
    onSelect: (event: React.SyntheticEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setAtEnd(
        event.currentTarget.selectionStart === value.length &&
          event.currentTarget.selectionEnd === value.length,
      );
      props.onSelect?.(event as React.SyntheticEvent<HTMLTextAreaElement>);
    },
    onCompositionStart: (event: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setComposing(true);
      props.onCompositionStart?.(event as React.CompositionEvent<HTMLTextAreaElement>);
    },
    onCompositionEnd: (event: React.CompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setComposing(false);
      props.onCompositionEnd?.(event as React.CompositionEvent<HTMLTextAreaElement>);
    },
    onKeyDown: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      props.onKeyDown?.(event as React.KeyboardEvent<HTMLTextAreaElement>);
      if (event.defaultPrevented || event.nativeEvent.isComposing) return;
      if (event.key === 'Tab' && !event.shiftKey && suggestion && available) {
        event.preventDefault();
        acceptCompletion();
      }
      if (event.key === 'Escape') {
        dismissAssistance();
      }
    },
  };
  return (
    <div className={`aic-field ${wrapperClassName ?? ''}`}>
      {multiline ? (
        <textarea {...fieldProps} />
      ) : (
        <input {...(fieldProps as InputHTMLAttributes<HTMLInputElement>)} ref={fieldProps.ref} />
      )}
      {available && suggestion && (
        <div className="aic-completion">
          <span>{suggestion}</span>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={acceptCompletion}
          >
            Accept ↹
          </button>
        </div>
      )}
      {available && ai.helpMeWrite && (
        <button type="button" className="aic-help" onClick={toggleWritingEditor}>
          ✦ Help me write
        </button>
      )}
      {available && editorOpen && (
        <div className="aic-assistant">
          <label htmlFor={`${id}-instruction`}>Writing instructions</label>
          <input
            id={`${id}-instruction`}
            value={instruction}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="Make it friendlier, shorten it…"
          />
          <button type="button" disabled={isLoading} onClick={generateDraft}>
            {isLoading ? 'Working…' : 'Generate draft'}
          </button>
          {draft !== null && (
            <>
              <p className="aic-draft">{draft}</p>
              <button type="button" onClick={acceptDraft}>
                Use draft
              </button>
              <button type="button" onClick={() => setDraft(null)}>
                Discard
              </button>
            </>
          )}
        </div>
      )}
      <div id={`${id}-status`} role="status" className="aic-status">
        {statusMessage}
      </div>
    </div>
  );
}
export const AIInput = forwardRef<HTMLInputElement, AIInputProps>((props, ref) => (
  <WritingField
    {...(props as AITextareaProps)}
    multiline={false}
    forwardedRef={ref as ForwardedRef<HTMLInputElement | HTMLTextAreaElement>}
  />
));
AIInput.displayName = 'AIInput';
export const AITextarea = forwardRef<HTMLTextAreaElement, AITextareaProps>((props, ref) => (
  <WritingField
    {...props}
    multiline
    forwardedRef={ref as ForwardedRef<HTMLInputElement | HTMLTextAreaElement>}
  />
));
AITextarea.displayName = 'AITextarea';
