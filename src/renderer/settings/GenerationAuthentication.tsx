import type { KeyboardEventHandler } from 'react';
import { useHostTranslation } from '../HostTranslation';
import { SettingsField } from '../settings-ui/SettingsSections';
import { SettingsInput } from '../settings-ui/SettingsInput';

export function GenerationAuthentication({
  authentication,
  onAuthenticationChange,
  apiKey,
  onKeyChange,
  savedKey,
  hint,
  onKeyDown,
}: {
  authentication: 'none' | 'bearer';
  onAuthenticationChange(value: 'none' | 'bearer'): void;
  apiKey?: string;
  onKeyChange(value: string | undefined): void;
  savedKey?: boolean;
  hint?: string;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
}) {
  const { t } = useHostTranslation();
  return (
    <SettingsField
      className="server-editor-full"
      settingKey="authentication"
      title={t('settings.aiConnectionDialog.auth')}
    >
      <select
        aria-label={t('settings.aiConnectionDialog.authLabel')}
        value={authentication}
        onChange={(e) => onAuthenticationChange(e.target.value as 'none' | 'bearer')}
      >
        <option value="none">{t('settings.aiConnectionDialog.noAuth')}</option>
        <option value="bearer">{t('settings.aiConnectionDialog.bearer')}</option>
      </select>
      {authentication === 'bearer' && (
        <>
          <SettingsInput
            aria-label={t('settings.aiConnectionDialog.apiKey')}
            type="password"
            autoComplete="off"
            maxLength={8192}
            value={apiKey ?? ''}
            placeholder={t(
              savedKey
                ? 'settings.aiConnectionDialog.storedKey'
                : 'settings.aiConnectionDialog.enterKey',
            )}
            onChange={(e) => onKeyChange(e.target.value || undefined)}
            onKeyDown={onKeyDown}
          />
          <small className="muted">{hint ?? t('settings.generation.keyHint')}</small>
        </>
      )}
    </SettingsField>
  );
}
