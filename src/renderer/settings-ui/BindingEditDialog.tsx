import { useId, useState, type ReactNode } from 'react';
import { SettingsModal } from './SettingsModal';
export function BindingEditDialog({
  title,
  adding,
  valid,
  onApply,
  onClose,
  children,
  className = '',
  error: validationError,
  errorTarget,
}: {
  title: string;
  adding: boolean;
  valid: boolean;
  onApply(): void;
  onClose(): void;
  children(ready: boolean, setError: (error: string) => void): ReactNode;
  className?: string;
  error?: string;
  errorTarget?: string;
}) {
  const [error, setError] = useState('');
  const [recordingReady, setRecordingReady] = useState(false);
  const id = useId();

  const apply = () => {
    if (!valid || !recordingReady) return;
    try {
      onApply();
    } catch (reason) {
      setError(String(reason));
    }
  };
  return (
    <SettingsModal
      className={className}
      labelledBy={`${id}-title`}
      onClose={onClose}
      onReady={setRecordingReady}
      onError={setError}
      error={[error, validationError].filter(Boolean).join('\n')}
      errorTarget={errorTarget}
      header={
        <header>
          <div>
            <small>{adding ? '割り当てを追加' : '割り当てを編集'}</small>
            <h2 id={`${id}-title`}>{title}</h2>
          </div>
          <button className="shortcut-dialog-close" aria-label="編集をキャンセル" onClick={onClose}>
            ×
          </button>
        </header>
      }
      footer={
        <footer>
          <div>
            <button onClick={onClose}>キャンセル</button>
            <button className="primary" disabled={!valid || !recordingReady} onClick={apply}>
              {adding ? '追加' : '適用'}
            </button>
          </div>
        </footer>
      }
    >
      {children(recordingReady, setError)}
    </SettingsModal>
  );
}
