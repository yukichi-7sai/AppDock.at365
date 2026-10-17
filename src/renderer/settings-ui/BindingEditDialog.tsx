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
}: {
  title: string;
  adding: boolean;
  valid: boolean;
  onApply(): void;
  onClose(): void;
  children(ready: boolean, setError: (error: string) => void): ReactNode;
  className?: string;
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
    >
      <header>
        <div>
          <small>{adding ? '割り当てを追加' : '割り当てを編集'}</small>
          <h2 id={`${id}-title`}>{title}</h2>
        </div>
        <button className="shortcut-dialog-close" aria-label="編集をキャンセル" onClick={onClose}>
          ×
        </button>
      </header>
      {children(recordingReady, setError)}
      {error && (
        <p className="shortcut-dialog-error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <small>適用すると設定に反映されます。</small>
        <div>
          <button onClick={onClose}>キャンセル</button>
          <button className="primary" disabled={!valid || !recordingReady} onClick={apply}>
            {adding ? '追加' : '適用'}
          </button>
        </div>
      </footer>
    </SettingsModal>
  );
}
