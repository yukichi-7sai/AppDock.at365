import { useHostTranslation } from '../HostTranslation';
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
  const { t: translate } = useHostTranslation();
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
            <small>
              {adding
                ? translate('settings.bindingEditDialog.add')
                : translate('settings.bindingEditDialog.edit')}
            </small>
            <h2 id={`${id}-title`}>{title}</h2>
          </div>
          <button
            className="shortcut-dialog-close"
            aria-label={translate('settings.bindingEditDialog.cancelEdit')}
            onClick={onClose}
          >
            ×
          </button>
        </header>
      }
      footer={
        <footer>
          <div>
            <button onClick={onClose}>{translate('settings.bindingEditDialog.cancel')}</button>
            <button className="primary" disabled={!valid || !recordingReady} onClick={apply}>
              {adding
                ? translate('settings.bindingEditDialog.addAction')
                : translate('settings.bindingEditDialog.apply')}
            </button>
          </div>
        </footer>
      }
    >
      {children(recordingReady, setError)}
    </SettingsModal>
  );
}
