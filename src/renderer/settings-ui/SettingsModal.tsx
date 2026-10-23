import { useHostTranslation } from '../HostTranslation';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useSettingsControls } from './api';
import { SettingsInputMode } from './SettingsInput';
import { SettingsHintIcon } from './SettingsHintIcon';
import { SettingsStatusProvider, SettingsStatusArea } from './SettingsStatus';
import { SettingsButton } from './SettingsButton';
let activeSettingsModals = 0;

/** Shared settings modal: focus containment/return, IME-safe dismissal and input suspension. */
export function SettingsModal({
  children,
  header,
  footer,
  error,
  errorTarget,
  message,
  errorAction,
  busy = false,
  bodyClassName = 'settings-dialog-body',
  className = '',
  labelledBy,
  onClose,
  onReady,
  onError,
  closeDisabled = false,
  closeOnBackdrop = false,
  initialFocus = '[data-initial-focus], .shortcut-capture',
}: {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  error?: string;
  errorTarget?: string;
  message?: string;
  errorAction?: ReactNode;
  busy?: boolean;
  bodyClassName?: string;
  className?: string;
  labelledBy: string;
  onClose(): void;
  onReady?(ready: boolean): void;
  onError?(error: string): void;
  closeDisabled?: boolean;
  closeOnBackdrop?: boolean;
  initialFocus?: string;
}) {
  const settingsControls = useSettingsControls();
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropPressed = useRef(false);
  const [preparationError, setPreparationError] = useState('');
  const isBackdrop = (event: {
    target: EventTarget;
    currentTarget: HTMLDialogElement;
    clientX: number;
    clientY: number;
  }) => {
    if (event.target !== event.currentTarget) return false;
    const bounds = event.currentTarget.getBoundingClientRect();
    return (
      event.clientX < bounds.left ||
      event.clientX >= bounds.right ||
      event.clientY < bounds.top ||
      event.clientY >= bounds.bottom
    );
  };
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
      setPreparationError('');
      callbacks.current.onReady?.(false);
      void settingsControls
        .setShortcutRecording(true)
        .then(() => {
          if (active) callbacks.current.onReady?.(true);
        })
        .catch((e) => {
          if (active) {
            setPreparationError(String(e));
            callbacks.current.onError?.(String(e));
          }
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
    <SettingsStatusProvider
      error={error || preparationError}
      target={errorTarget}
      busy={busy}
      message={message}
    >
      <SettingsInputMode.Provider value="input">
        <dialog
          ref={dialog}
          className={`applet-shortcut-dialog settings-modal ${className}`}
          aria-labelledby={labelledBy}
          data-shortcut-recorder="true"
          onPointerDown={(event) => {
            backdropPressed.current =
              closeOnBackdrop &&
              !closeDisabled &&
              event.isPrimary &&
              event.button === 0 &&
              isBackdrop(event);
          }}
          onPointerCancel={() => {
            backdropPressed.current = false;
          }}
          onClick={(event) => {
            const dismiss = backdropPressed.current && isBackdrop(event);
            backdropPressed.current = false;
            if (closeOnBackdrop && !closeDisabled && dismiss) onClose();
          }}
          onCancel={(event) => {
            event.preventDefault();
            if (!closeDisabled) onClose();
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.defaultPrevented) return;
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
          {header}
          <div className={bodyClassName} inert={busy || undefined} aria-busy={busy || undefined}>
            {children}
          </div>
          <SettingsStatusArea action={errorAction} />
          {footer}
        </dialog>
      </SettingsInputMode.Provider>
    </SettingsStatusProvider>,
    document.body,
  );
}

/** Async grouped changes remain local until the primary action succeeds. */
export function SettingsDialog({
  title,
  description,
  hint,
  children,
  onClose,
  onApply,
  applyLabel = 'OK',
  valid = true,
  className = '',
  errorTarget,
  error: externalError,
  message,
  errorAction,
  cancelWhilePending = false,
}: {
  title: string;
  description?: ReactNode;
  hint?: string;
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
  errorTarget?: string;
  error?: string;
  message?: string;
  errorAction?: ReactNode;
  cancelWhilePending?: boolean;
}) {
  const { t } = useHostTranslation();
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
      setError(e instanceof Error ? e.message : t('common.saveFailed'));
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
      error={[error, externalError].filter(Boolean).join('\n')}
      errorTarget={errorTarget}
      message={message}
      errorAction={errorAction}
      busy={pending}
      header={
        <header>
          <div>
            <div className="settings-title-with-hint">
              <h2 id={id}>{title}</h2>
              <SettingsHintIcon title={title} hint={hint} />
            </div>
            {description && <p>{description}</p>}
          </div>
          <button
            className="shortcut-dialog-close"
            aria-label={t('common.closeDialog')}
            disabled={pending && !cancelWhilePending}
            onClick={onClose}
          >
            ×
          </button>
        </header>
      }
      footer={
        <footer>
          <div>
            <button disabled={pending && !cancelWhilePending} onClick={onClose}>
              {t('common.cancel')}
            </button>
            <SettingsButton
              className="primary"
              disabled={!ready || !valid}
              pending={pending}
              onClick={() => void apply()}
            >
              {applyLabel}
            </SettingsButton>
          </div>
        </footer>
      }
    >
      <fieldset className="settings-dialog-fields" disabled={pending}>
        {typeof children === 'function' ? children(ready, setError, { error, pending }) : children}
      </fieldset>
    </SettingsModal>
  );
}
