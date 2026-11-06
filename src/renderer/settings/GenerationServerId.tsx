import { useState } from 'react';
import { Icon } from '../../shared/ui-icons';
import { useHostTranslation } from '../HostTranslation';
import { SettingsButton } from '../settings-ui/SettingsButton';
import { SettingsInput } from '../settings-ui/SettingsInput';
import { SettingsField, SettingsInputActions } from '../settings-ui/SettingsSections';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';

export function GenerationServerId({
  id,
  invoke,
}: {
  id: string;
  invoke(name: string, args: unknown[]): Promise<unknown>;
}) {
  const { t } = useHostTranslation();
  const title = t('settings.generation.serverId');
  const copyLabel = t('settings.generation.copyServerId');
  const [status, setStatus] = useState<'copied' | 'failed'>();
  const message = status === 'copied' ? t('settings.generation.serverIdCopied') : undefined;
  useSettingsFeedback({
    target: title,
    message,
    error: status === 'failed' ? t('settings.generation.serverIdCopyFailed') : undefined,
  });
  const copy = async () => {
    try {
      await invoke('generationCopyServerId', [id]);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  };
  return (
    <SettingsField settingKey="id" title={title}>
      <SettingsInputActions>
        <SettingsInput aria-label={title} value={id} readOnly spellCheck={false} />
        <SettingsButton
          icon
          title={message ?? copyLabel}
          aria-label={copyLabel}
          onClick={() => void copy()}
        >
          <Icon name={status === 'copied' ? 'check' : 'copy'} />
        </SettingsButton>
      </SettingsInputActions>
    </SettingsField>
  );
}
