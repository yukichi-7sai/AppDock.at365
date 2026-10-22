import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SyntheticEvent,
} from 'react';

type CommitOn = 'blur-or-enter' | 'input';
type Confirmation = { commitOn?: CommitOn; confirmation?: { value: string } };
/** Grouped dialogs edit a local record; only their OK action writes settings. */
export const SettingsInputMode = createContext<CommitOn>('blur-or-enter');

type TextElement = HTMLInputElement | HTMLTextAreaElement;
function useConfirmedText<T extends TextElement>(
  props: (InputHTMLAttributes<T> | TextareaHTMLAttributes<T>) & Confirmation,
  multiline = false,
) {
  const mode = useContext(SettingsInputMode);
  const input = props as InputHTMLAttributes<T>;
  const search = input.type === 'search';
  const numeric = input.type === 'number';
  const deferred = (props.commitOn ?? (search ? 'input' : mode)) === 'blur-or-enter';
  const initial = String(props.value ?? props.defaultValue ?? '');
  const [raw, setRaw] = useState(initial);
  const composing = useRef(false);
  const focused = useRef(false);
  const changed = useRef(false);
  const confirmed = useRef(initial);
  const previousValue = useRef(props.value);
  const previousConfirmation = useRef(props.confirmation);
  useEffect(() => {
    if (props.confirmation && previousConfirmation.current !== props.confirmation) {
      previousConfirmation.current = props.confirmation;
      previousValue.current = props.value;
      confirmed.current = props.confirmation.value;
      changed.current = false;
      setRaw(props.confirmation.value);
      return;
    }
    if (previousValue.current === props.value) return;
    previousValue.current = props.value;
    const next = String(props.value ?? '');
    // A local dialog echoes typing. Keep its confirmation point until Enter/blur.
    if (!deferred && focused.current && changed.current) {
      const sameNumber = numeric && raw.trim() !== '' && Number(raw) === Number(props.value);
      if (next !== raw && !sameNumber) setRaw(next);
      return;
    }
    confirmed.current = next;
    changed.current = false;
    if (!composing.current) setRaw(next);
  }, [props.value, props.confirmation]);
  const commit = (event: SyntheticEvent<T>) => {
    if (!changed.current || composing.current || props.readOnly) return;
    changed.current = false;
    confirmed.current = event.currentTarget.value;
    if (deferred) props.onChange?.(event as any);
  };
  return {
    value:
      search && !composing.current
        ? props.value
        : props.value !== undefined || props.defaultValue !== undefined
          ? raw
          : undefined,
    onFocus(event: React.FocusEvent<T>) {
      focused.current = true;
      confirmed.current = event.currentTarget.value;
      changed.current = false;
      setRaw(event.currentTarget.value);
      props.onFocus?.(event);
    },
    onBlur(event: React.FocusEvent<T>) {
      focused.current = false;
      commit(event);
      props.onBlur?.(event);
    },
    onCompositionStart(event: React.CompositionEvent<T>) {
      composing.current = true;
      props.onCompositionStart?.(event);
    },
    onCompositionEnd(event: React.CompositionEvent<T>) {
      composing.current = false;
      setRaw(event.currentTarget.value);
      changed.current = event.currentTarget.value !== confirmed.current;
      props.onCompositionEnd?.(event);
      if (!deferred) props.onChange?.(event as any);
      if (!focused.current) commit(event);
    },
    onChange(event: React.ChangeEvent<T>) {
      setRaw(event.currentTarget.value);
      changed.current = event.currentTarget.value !== confirmed.current;
      if (!deferred && !composing.current) props.onChange?.(event);
    },
    onKeyDown(event: React.KeyboardEvent<T>) {
      const ime =
        composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229;
      if (!ime && !search && !props.readOnly && event.key === 'Escape' && changed.current) {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.value = confirmed.current;
        setRaw(confirmed.current);
        changed.current = false;
        // Only local, explicitly live inputs need their caller's value restored.
        if (!deferred) props.onChange?.(event as any);
        props.onKeyDown?.(event);
        return;
      }
      props.onKeyDown?.(event);
      if (ime || props.readOnly || event.defaultPrevented) return;
      if (event.key === 'Enter' && (!multiline || !event.shiftKey) && !search) {
        event.preventDefault();
        commit(event);
      } else if (numeric && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const step = Number(input.step) || 1;
        const current = Number(event.currentTarget.value) || 0;
        const next = String(
          Math.min(
            input.max === undefined ? Infinity : Number(input.max),
            Math.max(
              input.min === undefined ? -Infinity : Number(input.min),
              current + (event.key === 'ArrowUp' ? step : -step),
            ),
          ),
        );
        event.currentTarget.value = next;
        setRaw(next);
        changed.current = next !== confirmed.current;
        if (!deferred) props.onChange?.(event as any);
      }
    },
  };
}

export const SettingsInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & Confirmation
>(function SettingsInput(props, ref) {
  const { commitOn, confirmation, ...inputProps } = props;
  const text = useConfirmedText<HTMLInputElement>(props);
  const numeric = props.type === 'number';
  const editable =
    !props.type ||
    ['text', 'number', 'password', 'search', 'url', 'email', 'tel'].includes(props.type);
  if (!editable) return <input {...inputProps} ref={ref} />;
  return (
    <input
      {...inputProps}
      {...text}
      ref={ref}
      type={numeric ? 'text' : props.type}
      inputMode={numeric ? 'decimal' : props.inputMode}
      role={numeric ? 'spinbutton' : props.role}
      aria-valuemin={numeric && props.min !== undefined ? Number(props.min) : undefined}
      aria-valuemax={numeric && props.max !== undefined ? Number(props.max) : undefined}
    />
  );
});

export const SettingsTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & Confirmation
>(function SettingsTextarea(props, ref) {
  const { commitOn, confirmation, ...textareaProps } = props;
  const text = useConfirmedText<HTMLTextAreaElement>(props, true);
  return <textarea {...textareaProps} {...text} ref={ref} />;
});
/** URL normalization waits for confirmation even inside a grouped dialog. */
export const SettingsUrlInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & Pick<Confirmation, 'confirmation'>
>((props, ref) => <SettingsInput {...props} ref={ref} commitOn="blur-or-enter" />);
export const SettingsUrlTextarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>((props, ref) => <SettingsTextarea {...props} ref={ref} commitOn="blur-or-enter" />);
/** Incomplete numbers remain text, never NaN; validation runs on confirmation. */
export function numberInput(text: string): number {
  return (
    /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(text) &&
    !text.endsWith('.') &&
    Number.isFinite(Number(text))
      ? Number(text)
      : text
  ) as number;
}
