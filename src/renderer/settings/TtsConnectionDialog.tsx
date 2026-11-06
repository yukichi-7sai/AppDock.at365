import { GenerationAuthentication } from './GenerationAuthentication';
import { GenerationMcpPermission } from './GenerationMcpPermission';
import { useId, useState } from 'react';
import { useHostTranslation } from '../HostTranslation';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { SettingsField, SettingsActions, SettingsSection } from '../settings-ui/SettingsSections';
import { SettingsInput, SettingsUrlInput } from '../settings-ui/SettingsInput';
import { TtsConnectionDetails } from './TtsConnectionDetails';
import { TtsSpeechFields } from './TtsSpeechFields';
import {
  applyTtsPreset,
  isTtsPresetCustomized,
  newTtsServer,
  ttsBaseUrl,
  ttsPresetIds,
  parseTtsServer,
  type TtsServer,
  type TtsPresetId,
} from '../../shared/tts';
import './tts-connection-editor.css';
import '../settings-ui/server-connection-editor.css';

const tabs = ['connection', 'speech', 'details'] as const;
type EditorTab = (typeof tabs)[number];

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
  const id = useId();
  const [tab, setTab] = useState<EditorTab>('connection');
  const [draft, setDraft] = useState(() =>
    structuredClone(
      original
        ? {
            ...original,
            authentication:
              original.authentication ??
              (status?.apiKeyConfigured ? ('bearer' as const) : ('none' as const)),
          }
        : newTtsServer(crypto.randomUUID()),
    ),
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
      className="tts-connection-dialog server-connection-dialog"
      onClose={onClose}
      error={error}
      message={message}
      errorAction={
        !detailsValid && tab !== 'details' ? (
          <button
            type="button"
            onClick={() => {
              setTab('details');
              document.getElementById(`${id}-tab-details`)?.focus();
            }}
          >
            {t('settings.ttsEditor.checkDetails')}
          </button>
        ) : undefined
      }
      valid={!!draft.name.trim() && !!draft.baseUrl.trim() && detailsValid}
      onApply={() => {
        try {
          parseTtsServer(draft);
        } catch (reason) {
          setTab(
            draft.model.length > 200 || draft.defaultVoice.length > 200 ? 'speech' : 'connection',
          );
          throw reason;
        }
        return invoke('ttsSaveConnection', [draft, original, apiKey, status?.keyRevision]);
      }}
    >
      <div
        className="tabs server-editor-tabs"
        role="tablist"
        aria-label={t('settings.ttsEditor.tabs')}
      >
        {tabs.map((item, index) => (
          <button
            key={item}
            type="button"
            role="tab"
            id={`${id}-tab-${item}`}
            aria-controls={`${id}-panel-${item}`}
            aria-selected={tab === item}
            tabIndex={tab === item ? 0 : -1}
            className={tab === item ? 'selected' : ''}
            onClick={() => setTab(item)}
            onKeyDown={(event) => {
              let next: number;
              if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
              else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
              else if (event.key === 'Home') next = 0;
              else if (event.key === 'End') next = tabs.length - 1;
              else return;
              event.preventDefault();
              setTab(tabs[next]);
              document.getElementById(`${id}-tab-${tabs[next]}`)?.focus();
            }}
          >
            {t(`settings.ttsEditor.tab.${item}`)}
          </button>
        ))}
      </div>
      <SettingsSection
        className="server-editor-panel"
        variant="group"
        id={`${id}-panel-connection`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-connection`}
        hidden={tab !== 'connection'}
      >
        <div className="server-editor-grid">
          <GenerationMcpPermission
            enabled={draft.mcpEnabled}
            onChange={(mcpEnabled) => change({ mcpEnabled })}
          />
          <SettingsField settingKey="name" title={t('settings.ttsServers.name')}>
            <SettingsInput
              data-initial-focus
              aria-label={t('settings.ttsServers.name')}
              maxLength={200}
              value={draft.name}
              onChange={(e) => change({ name: e.target.value })}
            />
          </SettingsField>
          <SettingsField
            settingKey="preset"
            title={t('settings.ttsEditor.preset')}
            hint={t('settings.ttsSettings.presetHint')}
            description={
              isTtsPresetCustomized(draft) ? t('settings.ttsSettings.customized') : undefined
            }
          >
            <select
              aria-label={t('settings.ttsEditor.preset')}
              value={draft.preset}
              onChange={(e) => change(applyTtsPreset(draft, e.target.value as TtsPresetId))}
            >
              {ttsPresetIds.map((id) => (
                <option key={id} value={id}>
                  {t(`settings.ttsSettings.preset.${id}`)}
                </option>
              ))}
            </select>
          </SettingsField>
          <SettingsField
            className="server-editor-full"
            settingKey="baseUrl"
            title={t('settings.ttsEditor.url')}
            hint={t('settings.ttsSettings.urlHint')}
          >
            <SettingsUrlInput
              aria-label={t('settings.ttsEditor.url')}
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
          <GenerationAuthentication
            authentication={draft.authentication ?? 'none'}
            onAuthenticationChange={(authentication) => change({ authentication })}
            apiKey={apiKey}
            savedKey={savedKey}
            onKeyChange={setApiKey}
          />
        </div>
      </SettingsSection>
      <SettingsSection
        className="server-editor-panel"
        variant="group"
        id={`${id}-panel-speech`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-speech`}
        hidden={tab !== 'speech'}
      >
        <TtsSpeechFields
          value={draft}
          change={change}
          discoveryRevision={JSON.stringify([status?.keyRevision, draft.authentication, apiKey])}
          onError={setError}
          onMessage={setMessage}
          discover={(kind) =>
            invoke(kind === 'models' ? 'ttsDraftModels' : 'ttsDraftVoices', [draft, apiKey])
          }
        />
      </SettingsSection>
      <SettingsSection
        className="server-editor-panel"
        variant="group"
        id={`${id}-panel-details`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-details`}
        hidden={tab !== 'details'}
      >
        <TtsConnectionDetails value={draft} change={change} onValidityChange={setDetailsValid} />
        {draft.preset !== 'custom' && (
          <SettingsActions>
            <button
              type="button"
              disabled={!isTtsPresetCustomized(draft)}
              onClick={() => change(applyTtsPreset(draft, draft.preset))}
            >
              {t('settings.ttsEditor.resetPreset')}
            </button>
          </SettingsActions>
        )}
      </SettingsSection>
    </SettingsDialog>
  );
}
