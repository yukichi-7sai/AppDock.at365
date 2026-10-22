import { useId, type ReactNode } from 'react';
import { SettingsModal } from './SettingsModal';
import { SettingsHintIcon } from './SettingsHintIcon';
import { SettingsButton } from './SettingsButton';

/** Shared presentation for display-order and execution-order editors. */
export function OrderDialogFrame({
  title,
  eyebrow,
  children,
  description,
  hint,
  message,
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
  description?: ReactNode;
  hint?: string;
  message?: string;
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
      busy={pending}
      error={error}
      message={message}
      bodyClassName="order-dialog-body"
      header={
        <header>
          <div>
            {eyebrow && <small>{eyebrow}</small>}
            <div className="settings-title-with-hint">
              <h2 id={id}>{title}</h2>
              <SettingsHintIcon title={title} hint={hint} />
            </div>
            {description && <p>{description}</p>}
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
      }
      footer={
        <footer>
          <div>
            <button type="button" disabled={pending} onClick={onClose}>
              キャンセル
            </button>
            <SettingsButton
              type="button"
              className="primary"
              pending={pending}
              disabled={pending || applyDisabled}
              onClick={onApply}
            >
              {applyLabel}
            </SettingsButton>
          </div>
        </footer>
      }
    >
      {children}
    </SettingsModal>
  );
}
