import { useHostTranslation } from '../HostTranslation';
import { useId, useRef, useState, type ReactNode } from 'react';
import { SettingsModal } from './SettingsModal';
import { SettingsMcpScope } from './SettingsMcpAccess';
import { settingsItemId } from '../../shared/settings-catalog';
export function BindingEditDialog({
  title,
  adding,
  valid,
  onApply,
  onApplyAndEdit,
  onClose,
  children,
  className = '',
  error: validationError,
  errorTarget,
  footerStart,
}: {
  title: string;
  adding: boolean;
  valid: boolean;
  onApply(): void | Promise<unknown>;
  onApplyAndEdit?(): void | Promise<unknown>;
  onClose(): void;
  children(ready: boolean, setError: (error: string) => void): ReactNode;
  className?: string;
  error?: string;
  errorTarget?: string;
  footerStart?: ReactNode;
}) {
  const { t: translate } = useHostTranslation();
  const [error, setError] = useState('');
  const [recordingReady, setRecordingReady] = useState(false);
  const [pending, setPending] = useState(false);
  const running = useRef(false);
  const id = useId();

  const apply = async (action = onApply) => {
    if (!valid || !recordingReady || running.current) return;
    running.current = true;
    setPending(true);
    setError('');
    try {
      await action();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      running.current = false;
      setPending(false);
    }
  };
  return (
    <SettingsMcpScope itemId={settingsItemId('command-triggers', 'bindings')}>
      <SettingsModal
        className={className}
        labelledBy={`${id}-title`}
        onClose={onClose}
        busy={pending}
        closeDisabled={pending}
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
              disabled={pending}
            >
              ×
            </button>
          </header>
        }
        footer={
          <footer>
            {footerStart}
            <div>
              <button data-testid="binding-cancel" onClick={onClose} disabled={pending}>
                {translate('settings.bindingEditDialog.cancel')}
              </button>
              {adding && onApplyAndEdit && (
                <button
                  data-testid="binding-apply-and-edit"
                  disabled={!valid || !recordingReady || pending}
                  onClick={() => void apply(onApplyAndEdit)}
                >
                  {translate('settings.bindingEditDialog.addAndEditTrigger')}
                </button>
              )}
              <button
                data-testid="binding-apply"
                aria-keyshortcuts="Control+Enter"
                className="primary"
                disabled={!valid || !recordingReady || pending}
                onClick={() => void apply()}
              >
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
    </SettingsMcpScope>
  );
}
