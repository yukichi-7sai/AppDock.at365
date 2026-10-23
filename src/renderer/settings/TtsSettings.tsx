import { useHostTranslation } from '../HostTranslation';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { useState, useEffect, useRef } from 'react';
import type { SettingsControlEditor } from '../settings-ui/api';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';
import { defaultTtsSettings, type TtsSettings, type TtsVoice } from '../../shared/tts';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsInput, SettingsTextarea, SettingsUrlInput } from '../settings-ui/SettingsInput';
import { SettingsSection, SettingsField, SettingsActions } from '../settings-ui/SettingsSections';

export function TtsSettingsForm({
  editor,
  auxiliary,
  invoke,
  busy,
}: {
  editor: SettingsControlEditor;
  auxiliary?: SettingsPageAuxiliary['tts'];
  invoke(name: string, args?: unknown[]): Promise<any>;
  busy: boolean;
}) {
  const { t: translate } = useHostTranslation();
  const value = editor.value.tts ?? defaultTtsSettings();
  const [key, setKey] = useState('');
  const [text, setText] = useState('');
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [models, setModels] = useState<TtsVoice[]>([]);
  const [manual, setManual] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const operation = useRef(false);
  const signature = JSON.stringify([
    value.baseUrl,
    value.voicesSource,
    value.voicesPath,
    value.manualVoices,
    auxiliary?.apiKeyConfigured,
  ]);
  const current = useRef(signature);
  current.current = signature;
  useEffect(() => {
    setVoices([]);
    setModels([]);
  }, [signature]);
  useEffect(() => {
    setKey('');
  }, [value.baseUrl]);
  useEffect(() => {
    setManual(undefined);
  }, [JSON.stringify(value.manualVoices)]);
  const change = (patch: Partial<TtsSettings>) =>
    editor.edit({ ...editor.value, tts: { ...value, ...patch } });
  const run = async (action: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setPending(true);
    setError('');
    setMessage('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      operation.current = false;
      setPending(false);
    }
  };
  const load = (kind: 'models' | 'voices') =>
    void run(async () => {
      (kind === 'models' ? setModels : setVoices)([]);
      const started = current.current;
      const result = await invoke(kind === 'models' ? 'ttsModels' : 'ttsVoices');
      if (started !== current.current) return;
      const items = result[kind] as TtsVoice[];
      (kind === 'models' ? setModels : setVoices)(items);
      setMessage(
        items.length
          ? translate('settings.ttsSettings.loaded', {
              length: items.length,
              value:
                kind === 'models'
                  ? translate('settings.ttsSettings.model')
                  : translate('settings.ttsSettings.voice'),
            })
          : translate('settings.ttsSettings.empty'),
      );
    });
  const active = auxiliary?.jobs.some((j) =>
    ['queued', 'generating', 'waitingPlayback', 'playing'].includes(j.state),
  );
  const previewJob = auxiliary?.jobs.at(-1);
  const previewState =
    previewJob &&
    {
      queued: translate('settings.ttsSettings.queued'),
      generating: translate('settings.ttsSettings.generating'),
      waitingPlayback: translate('settings.ttsSettings.waitingPlayback'),
      playing: translate('settings.ttsSettings.playing'),
      completed: translate('settings.ttsSettings.completed'),
      failed: translate('settings.ttsSettings.failed'),
      canceled: translate('settings.ttsSettings.canceled'),
    }[previewJob.state];
  useSettingsFeedback({ busy: pending, error: error || auxiliary?.error, message });
  return (
    <div
      className="settings-sections tts-settings"
      aria-label={translate('settings.ttsSettings.title')}
    >
      <SettingsSection
        title={translate('settings.ttsSettings.connection')}
        hint={translate('settings.ttsSettings.connectionHint')}
      >
        <SettingsField
          title={translate('settings.ttsSettings.url')}
          hint={translate('settings.ttsSettings.urlHint')}
          {...settingAnchor('tts', 'baseUrl')}
        >
          <SettingsUrlInput
            aria-label={translate('settings.ttsSettings.url')}
            value={value.baseUrl}
            placeholder="http://host:8080/v1"
            spellCheck={false}
            onChange={(e) => change({ baseUrl: e.target.value })}
          />
        </SettingsField>
        <SettingsField
          title={translate('settings.ttsSettings.apiKey')}
          description={translate('settings.ttsSettings.apiKeyHint')}
          {...settingAnchor('tts', 'apiKey')}
        >
          <SettingsInput
            aria-label={translate('settings.ttsSettings.apiKey')}
            commitOn="input"
            type="password"
            autoComplete="off"
            value={key}
            placeholder={
              auxiliary?.apiKeyConfigured
                ? translate('settings.ttsSettings.storedKey')
                : translate('settings.ttsSettings.noKey')
            }
            onChange={(e) => setKey(e.target.value)}
          />
          <SettingsActions>
            <button
              disabled={busy || pending || !key || !value.baseUrl}
              onClick={() =>
                void run(async () => {
                  await invoke('ttsSetKey', [key]);
                  setKey('');
                  setModels([]);
                  setVoices([]);
                })
              }
            >
              {translate('settings.ttsSettings.setKey')}
            </button>
            <button
              disabled={busy || pending || (!auxiliary?.apiKeyConfigured && !auxiliary?.error)}
              onClick={() =>
                void run(async () => {
                  await invoke('ttsSetKey', ['']);
                  setKey('');
                  setModels([]);
                  setVoices([]);
                })
              }
            >
              {translate('settings.ttsSettings.deleteKey')}
            </button>
          </SettingsActions>
        </SettingsField>
      </SettingsSection>
      <SettingsSection
        title={translate('settings.ttsSettings.modelsAndVoices')}
        hint={translate('settings.ttsSettings.modelsAndVoicesHint')}
      >
        <SettingsField
          title={translate('settings.ttsSettings.modelLabel')}
          hint={translate('settings.ttsSettings.modelHint')}
          {...settingAnchor('tts', 'model')}
        >
          <SettingsInput
            aria-label={translate('settings.ttsSettings.modelLabel')}
            list="tts-models"
            value={value.model}
            placeholder={translate('settings.ttsSettings.modelId')}
            onChange={(e) => change({ model: e.target.value })}
          />
          <datalist id="tts-models">
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </datalist>
          {models.length > 0 && (
            <select
              aria-label={translate('settings.ttsSettings.fetchedModels')}
              value={models.some((m) => m.id === value.model) ? value.model : ''}
              onChange={(e) => {
                if (e.target.value) change({ model: e.target.value });
              }}
            >
              <option value="">{translate('settings.ttsSettings.select')}</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
          <SettingsActions>
            <button disabled={busy || pending || !value.baseUrl} onClick={() => load('models')}>
              {translate('settings.ttsSettings.refreshModels')}
            </button>
          </SettingsActions>
        </SettingsField>
        <SettingsField
          title={translate('settings.ttsSettings.defaultVoice')}
          hint={translate('settings.ttsSettings.defaultVoiceHint')}
          {...settingAnchor('tts', 'defaultVoice')}
        >
          <SettingsInput
            aria-label={translate('settings.ttsSettings.defaultVoice')}
            list="tts-voices"
            value={value.defaultVoice}
            placeholder={translate('settings.ttsSettings.voiceId')}
            onChange={(e) => change({ defaultVoice: e.target.value })}
          />
          <datalist id="tts-voices">
            {voices.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </datalist>
          {voices.length > 0 && (
            <select
              aria-label={translate('settings.ttsSettings.fetchedVoices')}
              value={voices.some((v) => v.id === value.defaultVoice) ? value.defaultVoice : ''}
              onChange={(e) => {
                if (e.target.value) change({ defaultVoice: e.target.value });
              }}
            >
              <option value="">{translate('settings.ttsSettings.select')}</option>
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          )}
          <SettingsActions>
            <button
              disabled={busy || pending || (value.voicesSource === 'endpoint' && !value.baseUrl)}
              onClick={() => load('voices')}
            >
              {translate('settings.ttsSettings.refreshVoices')}
            </button>
          </SettingsActions>
        </SettingsField>
        <SettingsField
          title={translate('settings.ttsSettings.speed')}
          hint={translate('settings.ttsSettings.speedHint')}
          {...settingAnchor('tts', 'defaultSpeed')}
        >
          <SettingsInput
            aria-label={translate('settings.ttsSettings.speed')}
            type="number"
            min={0.25}
            max={4}
            step={0.05}
            value={value.defaultSpeed}
            onChange={(e) =>
              change({ defaultSpeed: e.target.value.trim() ? Number(e.target.value) : NaN })
            }
          />
        </SettingsField>
      </SettingsSection>
      <SettingsSection
        title={translate('settings.ttsSettings.preview')}
        description={translate('settings.ttsSettings.previewHint')}
        {...settingAnchor('tts', 'preview')}
      >
        <SettingsField
          title={translate('settings.ttsSettings.text')}
          description={
            !value.baseUrl || !value.model || !value.defaultVoice
              ? translate('settings.ttsSettings.previewRequirements')
              : (previewState ?? translate('settings.ttsSettings.previewReady'))
          }
          error={previewJob?.error?.message}
        >
          <SettingsTextarea
            aria-label={translate('settings.ttsSettings.text')}
            commitOn="input"
            value={text}
            placeholder={translate('settings.ttsSettings.textPlaceholder')}
            onChange={(e) => setText(e.target.value)}
          />
          <SettingsActions>
            <button
              className="primary"
              disabled={
                busy ||
                pending ||
                active ||
                !text.trim() ||
                !value.baseUrl ||
                !value.model ||
                !value.defaultVoice
              }
              onClick={() =>
                void run(async () => {
                  await invoke('ttsPreview', [text, crypto.randomUUID()]);
                })
              }
            >
              {translate('settings.ttsSettings.play')}
            </button>
            <button
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  await invoke('ttsStop');
                })
              }
            >
              {translate('settings.ttsSettings.stop')}
            </button>
          </SettingsActions>
        </SettingsField>
      </SettingsSection>
      <SettingsSection
        title={translate('settings.ttsSettings.advanced')}
        hint={translate('settings.ttsSettings.advancedHint')}
        collapsible
      >
        <SettingsField
          title={translate('settings.ttsSettings.speedMode')}
          {...settingAnchor('tts', 'speedMode')}
        >
          <select
            aria-label={translate('settings.ttsSettings.speedMode')}
            value={value.speedMode}
            onChange={(e) => change({ speedMode: e.target.value as TtsSettings['speedMode'] })}
          >
            <option value="playback">{translate('settings.ttsSettings.localSpeed')}</option>
            <option value="server">{translate('settings.ttsSettings.serverSpeed')}</option>
          </select>
        </SettingsField>
        <SettingsField
          title={translate('settings.ttsSettings.voiceMode')}
          {...settingAnchor('tts', 'voicesSource')}
        >
          <select
            aria-label={translate('settings.ttsSettings.voiceMode')}
            value={value.voicesSource}
            onChange={(e) =>
              change({ voicesSource: e.target.value as TtsSettings['voicesSource'] })
            }
          >
            <option value="endpoint">{translate('settings.ttsSettings.serverVoices')}</option>
            <option value="manual">{translate('settings.ttsSettings.manualVoices')}</option>
          </select>
        </SettingsField>
        <SettingsField
          title={translate('settings.ttsSettings.voicePath')}
          hint={translate('settings.ttsSettings.voicePathHint')}
          {...settingAnchor('tts', 'voicesPath')}
        >
          <SettingsInput
            aria-label={translate('settings.ttsSettings.voicePath')}
            value={value.voicesPath}
            onChange={(e) => change({ voicesPath: e.target.value })}
          />
        </SettingsField>
        <SettingsField
          title={translate('settings.ttsSettings.manualList')}
          hint={translate('settings.ttsSettings.manualListHint')}
          {...settingAnchor('tts', 'manualVoices')}
        >
          <SettingsTextarea
            aria-label={translate('settings.ttsSettings.manualList')}
            value={manual ?? JSON.stringify(value.manualVoices, null, 2)}
            onChange={(e) => {
              const v = e.target.value;
              setManual(v);
              try {
                change({ manualVoices: JSON.parse(v) });
                setError('');
              } catch {
                setError(translate('settings.ttsSettings.manualListInvalid'));
              }
            }}
          />
        </SettingsField>
      </SettingsSection>
    </div>
  );
}
