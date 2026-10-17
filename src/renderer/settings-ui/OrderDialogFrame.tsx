import { useId, type ReactNode } from 'react';
import { SettingsModal } from './SettingsModal';

/** Shared presentation for display-order and execution-order editors. */
export function OrderDialogFrame({
  title,
  eyebrow,
  children,
  footer,
  error,
  pending = false,
  applyDisabled = false,
  applyLabel = 'OK',
  closeLabel = 'ダイアログを閉じる',
  className = '',
  initialFocus,
  onReady,
  onError,
  onApply,
  onClose,
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  footer?: string;
  error?: string;
  pending?: boolean;
  applyDisabled?: boolean;
  applyLabel?: string;
  closeLabel?: string;
  className?: string;
  initialFocus?: string;
  onReady(ready: boolean): void;
  onError(error: string): void;
  onApply(): void;
  onClose(): void;
}) {
  const id = useId();
  return (
    <SettingsModal
      className={`order-dialog-frame ${className}`}
      labelledBy={id}
      onClose={onClose}
      onReady={onReady}
      onError={onError}
      closeDisabled={pending}
      initialFocus={initialFocus}
    >
      <header>
        <div>
          {eyebrow && <small>{eyebrow}</small>}
          <h2 id={id}>{title}</h2>
        </div>
        <button
          type="button"
          className="shortcut-dialog-close"
          aria-label={closeLabel}
          disabled={pending}
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="order-dialog-body" inert={pending} aria-busy={pending}>
        {children}
      </div>
      {error && (
        <p className="shortcut-dialog-error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <small>{pending ? '保存しています…' : footer}</small>
        <div>
          <button type="button" disabled={pending} onClick={onClose}>
            キャンセル
          </button>
          <button
            type="button"
            className="primary"
            disabled={pending || applyDisabled}
            onClick={onApply}
          >
            {applyLabel}
          </button>
        </div>
      </footer>
    </SettingsModal>
  );
}
