'use client';
import {
  forwardRef,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type TextareaHTMLAttributes,
} from 'react';
import { useAICompletion } from './use-ai-completion.js';
import type { WritingConfig } from './types.js';
export type AIInlineTextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'defaultValue' | 'onChange'
> & {
  value: string;
  onValueChange(value: string): void;
  ai?: WritingConfig;
  maxInputCharacters?: number;
};
export const AIInlineTextarea = forwardRef<HTMLTextAreaElement, AIInlineTextareaProps>(
  function AIInlineTextarea({ value, onValueChange, ai, maxInputCharacters, ...props }, ref) {
    const element = useRef<HTMLTextAreaElement | null>(null);
    const [focused, setFocused] = useState(false),
      [composing, setComposing] = useState(false);
    const [selection, setSelection] = useState({ start: value.length, end: value.length });
    const [point, setPoint] = useState({
      left: 0,
      top: 0,
      width: 0,
      lineHeight: 20,
      font: '',
      letterSpacing: '',
    });
    const pendingCaret = useRef<{ value: string; caret: number } | null>(null);
    const id = useId();
    const completion = useAICompletion({
      value,
      selection,
      focused,
      composing,
      ai,
      maxInputCharacters,
      enabled: !props.disabled && !props.readOnly,
    });
    const select = () => {
      const node = element.current;
      if (node) setSelection({ start: node.selectionStart, end: node.selectionEnd });
    };
    function measure() {
      const node = element.current;
      if (!node) return;
      const style = getComputedStyle(node),
        mirror = document.createElement('div'),
        marker = document.createElement('span');
      Object.assign(mirror.style, {
        position: 'absolute',
        visibility: 'hidden',
        pointerEvents: 'none',
        left: '-100000px',
        top: '0',
        width: `${node.clientWidth}px`,
        boxSizing: 'border-box',
        whiteSpace: node.wrap === 'off' ? 'pre' : 'pre-wrap',
        overflowWrap: 'break-word',
      });
      for (const property of [
        'font',
        'fontSize',
        'fontFamily',
        'fontWeight',
        'fontStyle',
        'fontVariant',
        'lineHeight',
        'letterSpacing',
        'wordSpacing',
        'textIndent',
        'textTransform',
        'tabSize',
        'paddingTop',
        'paddingRight',
        'paddingBottom',
        'paddingLeft',
      ] as const)
        mirror.style[property] = style[property];
      mirror.textContent = value.slice(0, node.selectionStart);
      marker.textContent = '\u200b';
      mirror.append(marker);
      document.body.append(mirror);
      const left = node.clientLeft + marker.offsetLeft - node.scrollLeft;
      const top = node.clientTop + marker.offsetTop - node.scrollTop;
      setPoint({
        left,
        top,
        width: Math.max(
          0,
          node.clientWidth + node.clientLeft - parseFloat(style.paddingRight || '0') - left,
        ),
        lineHeight: parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2,
        font: style.font,
        letterSpacing: style.letterSpacing,
      });
      mirror.remove();
    }
    useLayoutEffect(() => {
      const node = element.current;
      const pending = pendingCaret.current;
      if (node && pending?.value === value) {
        node.setSelectionRange(pending.caret, pending.caret);
        pendingCaret.current = null;
        select();
      }
      measure();
    }, [value, selection.start, selection.end, completion.suggestion]);
    useLayoutEffect(() => {
      const node = element.current;
      if (!node) return;
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
      observer?.observe(node);
      window.addEventListener('resize', measure);
      return () => {
        observer?.disconnect();
        window.removeEventListener('resize', measure);
      };
    }, [value]);
    return (
      <div className="aic-inline-textarea">
        <textarea
          {...props}
          ref={(node) => {
            element.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
          }}
          value={value}
          aria-describedby={[props['aria-describedby'], id].filter(Boolean).join(' ')}
          onChange={(event) => {
            setSelection({
              start: event.currentTarget.selectionStart,
              end: event.currentTarget.selectionEnd,
            });
            onValueChange(event.target.value);
          }}
          onFocus={(event) => {
            setFocused(true);
            select();
            props.onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            props.onBlur?.(event);
          }}
          onSelect={(event) => {
            select();
            props.onSelect?.(event);
          }}
          onKeyUp={(event) => {
            select();
            props.onKeyUp?.(event);
          }}
          onScroll={(event) => {
            measure();
            props.onScroll?.(event);
          }}
          onCompositionStart={(event) => {
            setComposing(true);
            completion.dismiss();
            props.onCompositionStart?.(event);
          }}
          onCompositionEnd={(event) => {
            setComposing(false);
            select();
            props.onCompositionEnd?.(event);
          }}
          onKeyDown={(event) => {
            props.onKeyDown?.(event);
            if (event.defaultPrevented || event.nativeEvent.isComposing || composing) return;
            if (event.key === 'Escape' && completion.suggestion) {
              event.preventDefault();
              completion.dismiss();
            }
            if (
              event.key === 'Tab' &&
              !event.shiftKey &&
              completion.suggestion &&
              event.currentTarget.selectionStart === selection.start &&
              event.currentTarget.selectionEnd === selection.end
            ) {
              const accepted = completion.accept();
              if (!accepted) return;
              event.preventDefault();
              pendingCaret.current = accepted;
              onValueChange(accepted.value);
            }
          }}
        />
        {completion.suggestion && point.width > 0 && point.top >= 0 && (
          <span
            className="aic-inline-ghost"
            aria-hidden="true"
            style={{
              left: point.left,
              top: point.top,
              maxWidth: point.width,
              height: point.lineHeight,
              lineHeight: `${point.lineHeight}px`,
              font: point.font,
              letterSpacing: point.letterSpacing,
            }}
          >
            {completion.suggestion}
          </span>
        )}
        <span id={id} className="aic-visually-hidden" role="status" aria-live="polite">
          {completion.error ||
            (completion.suggestion
              ? `Suggestion available: ${completion.suggestion}. Press Tab to accept or Escape to dismiss.`
              : '')}
        </span>
      </div>
    );
  },
);
