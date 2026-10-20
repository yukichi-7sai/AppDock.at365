import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSettingsControls } from './api';
import { SettingsInputMode } from './SettingsInput';
import { SettingsHint } from './SettingsHint';
import { SettingsError } from './SettingsError';
let activeSettingsModals = 0;

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
    activeSettingsModals++;
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
      activeSettingsModals = Math.max(0, activeSettingsModals - 1);
      if (activeSettingsModals === 0)
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
    <SettingsInputMode.Provider value="input">
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
      </dialog>
    </SettingsInputMode.Provider>,
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
  errorLayout = 'inline',
  cancelWhilePending = false,
}: {
  title: string;
  description?: string;
  children:
    | ReactNode
    | ((
        ready: boolean,
        setError: (error: string) => void,
        state: { error: string; pending: boolean },
      ) => ReactNode);
  onClose(): void;
  onApply(): Promise<unknown>;
  applyLabel?: string;
  valid?: boolean;
  className?: string;
  footer?: string;
  errorLayout?: 'inline' | 'reserved';
  cancelWhilePending?: boolean;
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
      closeDisabled={pending && !cancelWhilePending}
    >
      <header>
        <div>
          <h2 id={id}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button
          className="shortcut-dialog-close"
          aria-label="ダイアログを閉じる"
          disabled={pending && !cancelWhilePending}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="settings-dialog-body">
        <fieldset className="settings-dialog-fields" disabled={pending}>
          {typeof children === 'function'
            ? children(ready, setError, { error, pending })
            : children}
        </fieldset>
      </div>
      {errorLayout === 'reserved' ? (
        <SettingsError error={error} />
      ) : (
        error && (
          <p className="shortcut-dialog-error" role="alert">
            {error}
          </p>
        )
      )}
      <footer>
        <SettingsHint as="small">{footer}</SettingsHint>
        <div>
          <button disabled={pending && !cancelWhilePending} onClick={onClose}>
            キャンセル
          </button>
          <button
            className="primary"
            disabled={!ready || !valid || pending}
            aria-busy={pending || undefined}
            onClick={() => void apply()}
          >
            {applyLabel}
          </button>
        </div>
      </footer>
    </SettingsModal>
  );
}
