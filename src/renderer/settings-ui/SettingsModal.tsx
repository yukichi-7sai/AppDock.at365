import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSettingsControls } from './api';

/** Shared settings modal: focus containment/return, IME-safe dismissal and input suspension. */
export function SettingsModal({
  children,
  className = '',
  labelledBy,
  onClose,
  onReady,
  onError,
  closeDisabled = false,
  initialFocus = '[data-initial-focus], .shortcut-capture',
}: {
  children: ReactNode;
  className?: string;
  labelledBy: string;
  onClose(): void;
  onReady?(ready: boolean): void;
  onError?(error: string): void;
  closeDisabled?: boolean;
  initialFocus?: string;
}) {
  const settingsControls = useSettingsControls();
  const dialog = useRef<HTMLDialogElement>(null);
  const callbacks = useRef({ onReady, onError });
  callbacks.current = { onReady, onError };
  const [returnFocus] = useState(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  useLayoutEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLElement>(initialFocus)?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    let active = true;
    const suspend = () => {
      callbacks.current.onReady?.(false);
      void settingsControls
        .setShortcutRecording(true)
        .then(() => {
          if (active) callbacks.current.onReady?.(true);
        })
        .catch((e) => {
          if (active) callbacks.current.onError?.(String(e));
        });
    };
    suspend();
    window.addEventListener('focus', suspend);
    return () => {
      active = false;
      window.removeEventListener('focus', suspend);
      void settingsControls.setShortcutRecording(false).catch(() => {});
      queueMicrotask(() => {
        if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
        else
          document
            .querySelector<HTMLElement>('[data-dialog-focus-fallback]')
            ?.focus({ preventScroll: true });
      });
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className={`applet-shortcut-dialog settings-modal ${className}`}
      aria-labelledby={labelledBy}
      data-shortcut-recorder="true"
      onCancel={(event) => {
        event.preventDefault();
        if (!closeDisabled) onClose();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
          if (event.key === 'Escape') event.preventDefault();
          return;
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          if (!closeDisabled) onClose();
        }
      }}
    >
      {children}
    </dialog>,
    document.body,
  );
}

/** Async grouped changes remain local until the primary action succeeds. */
export function SettingsDialog({
  title,
  description,
  children,
  onClose,
  onApply,
  applyLabel = 'OK',
  valid = true,
  className = '',
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode | ((ready: boolean, setError: (error: string) => void) => ReactNode);
  onClose(): void;
  onApply(): Promise<unknown>;
  applyLabel?: string;
  valid?: boolean;
  className?: string;
  footer?: string;
}) {
  const settingsControls = useSettingsControls();
  const [id] = useState(() => `dialog-${crypto.randomUUID()}`);
  const [ready, setReady] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const running = useRef(false);
  const apply = async () => {
    if (running.current || !ready || !valid) return;
    running.current = true;
    setPending(true);
    setError('');
    try {
      await onApply();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存できませんでした。');
    } finally {
      running.current = false;
      setPending(false);
    }
  };
  return (
    <SettingsModal
      className={`settings-group-dialog ${className}`}
      labelledBy={id}
      onClose={onClose}
      onReady={setReady}
      onError={setError}
      closeDisabled={pending}
    >
      <header>
        <div>
          <h2 id={id}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button
          className="shortcut-dialog-close"
          aria-label="ダイアログを閉じる"
          disabled={pending}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="settings-dialog-body">
        <fieldset className="settings-dialog-fields" disabled={pending}>
          {typeof children === 'function' ? children(ready, setError) : children}
        </fieldset>
      </div>
      {error && (
        <p className="shortcut-dialog-error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <small>{pending ? '保存しています…' : footer}</small>
        <div>
          <button disabled={pending} onClick={onClose}>
            キャンセル
          </button>
          <button
            className="primary"
            disabled={!ready || !valid || pending}
            onClick={() => void apply()}
          >
            {applyLabel}
          </button>
        </div>
      </footer>
    </SettingsModal>
  );
}
