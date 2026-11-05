import { useState } from 'react';
import { useHostTranslation } from '../HostTranslation';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { SettingsField, SettingsSection, SettingsActions } from '../settings-ui/SettingsSections';
import { SettingsInput, SettingsUrlInput } from '../settings-ui/SettingsInput';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { TtsConnectionDetails } from './TtsConnectionDetails';
import { TtsSpeechFields } from './TtsSpeechFields';
import {
  applyTtsPreset,
  isTtsPresetCustomized,
  newTtsServer,
  ttsBaseUrl,
  ttsPresetIds,
  type TtsServer,
  type TtsPresetId,
} from '../../shared/tts';

export function TtsConnectionDialog({
  original,
  status,
  invoke,
  onClose,
}: {
  original: TtsServer | null;
  status?: { apiKeyConfigured: boolean; keyRevision: string };
  invoke(name: string, args?: unknown[]): Promise<any>;
  onClose(): void;
}) {
  const { t } = useHostTranslation();
  const [draft, setDraft] = useState(() =>
    structuredClone(original ?? newTtsServer(crypto.randomUUID())),
  );
  const [apiKey, setApiKey] = useState<string | undefined>();
  const [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [detailsValid, setDetailsValid] = useState(true);
  const change = (patch: Partial<TtsServer>) => setDraft((current) => ({ ...current, ...patch }));
  const savedKey = status?.apiKeyConfigured && original?.baseUrl === draft.baseUrl;
  return (
    <SettingsDialog
      title={t(original ? 'settings.ttsServers.edit' : 'settings.ttsServers.add')}
      className="ai-connection-dialog"
      onClose={onClose}
      error={error}
      message={message}
      valid={!!draft.name.trim() && !!draft.baseUrl.trim() && detailsValid}
      onApply={() => invoke('ttsSaveConnection', [draft, original, apiKey, status?.keyRevision])}
    >
      <SettingsField settingKey="name" title={t('settings.ttsServers.name')}>
        <SettingsInput
          data-initial-focus
          aria-label={t('settings.ttsServers.name')}
          maxLength={200}
          value={draft.name}
          onChange={(e) => change({ name: e.target.value })}
        />
      </SettingsField>
      <SettingsSection title={t('settings.ttsSettings.connection')}>
        <SettingsField
          settingKey="preset"
          title={t('settings.ttsSettings.preset')}
          description={
            isTtsPresetCustomized(draft) ? t('settings.ttsSettings.customized') : undefined
          }
        >
          <select
            aria-label={t('settings.ttsSettings.preset')}
            value={draft.preset}
            onChange={(e) => change(applyTtsPreset(draft, e.target.value as TtsPresetId))}
          >
            {ttsPresetIds.map((id) => (
              <option key={id} value={id}>
                {t(`settings.ttsSettings.preset.${id}`)}
              </option>
            ))}
          </select>
          {draft.preset !== 'custom' && (
            <SettingsActions>
              <button
                disabled={!isTtsPresetCustomized(draft)}
                onClick={() => change(applyTtsPreset(draft, draft.preset))}
              >
                {t('settings.ttsSettings.presetReset')}
              </button>
            </SettingsActions>
          )}
        </SettingsField>
        <SettingsField
          settingKey="baseUrl"
          title={t('settings.ttsSettings.url')}
          hint={t('settings.ttsSettings.urlHint')}
        >
          <SettingsUrlInput
            aria-label={t('settings.ttsSettings.url')}
            value={draft.baseUrl}
            spellCheck={false}
            placeholder="http://server:8001/v1"
            onChange={(e) => {
              try {
                change({ baseUrl: ttsBaseUrl(e.target.value.trim()) });
                setError('');
              } catch (reason) {
                change({ baseUrl: e.target.value });
                setError((reason as Error).message);
              }
            }}
          />
        </SettingsField>
        <SettingsField
          title={t('settings.ttsSettings.apiKey')}
          {...settingAnchor('tts', 'apiKey')}
          description={t('settings.ttsSettings.apiKeyHint')}
        >
          <SettingsInput
            aria-label={t('settings.ttsSettings.apiKey')}
            type="password"
            autoComplete="off"
            value={apiKey ?? ''}
            maxLength={8192}
            placeholder={t(
              savedKey && apiKey === undefined
                ? 'settings.ttsSettings.storedKey'
                : 'settings.ttsSettings.noKey',
            )}
            onChange={(e) => setApiKey(e.target.value || undefined)}
          />
          <SettingsActions>
            <button disabled={!savedKey && !apiKey} onClick={() => setApiKey('')}>
              {t('settings.ttsServers.removeKey')}
            </button>
          </SettingsActions>
          {apiKey === '' && (
            <small className="muted">{t('settings.ttsServers.keyWillBeRemoved')}</small>
          )}
        </SettingsField>
        <TtsConnectionDetails
          value={draft}
          change={change}
          setError={setError}
          onValidityChange={setDetailsValid}
        />
      </SettingsSection>
      <SettingsSection title={t('settings.ttsSettings.modelsAndVoices')}>
        <TtsSpeechFields
          value={draft}
          change={change}
          discoveryRevision={JSON.stringify([status?.keyRevision, apiKey])}
          onError={setError}
          onMessage={setMessage}
          discover={(kind) =>
            invoke(kind === 'models' ? 'ttsDraftModels' : 'ttsDraftVoices', [draft, apiKey])
          }
        />
      </SettingsSection>
    </SettingsDialog>
  );
}
