import { useEffect, useId, useRef, useState } from 'react';
import { useHostTranslation } from '../HostTranslation';
import { SettingsInput, SettingsTextarea } from '../settings-ui/SettingsInput';
import { SettingsField, SettingsActions } from '../settings-ui/SettingsSections';
import { settingAnchor } from '../settings-ui/setting-anchor';
import type { TtsSettings, TtsVoice } from '../../shared/tts';

export function TtsSpeechFields({
  value,
  change,
  discover,
  busy = false,
  discoveryRevision = '',
  onError,
  onMessage,
}: {
  value: TtsSettings;
  change(patch: Partial<TtsSettings>): void;
  discover(kind: 'models' | 'voices'): Promise<any>;
  busy?: boolean;
  discoveryRevision?: string;
  onError(error: string): void;
  onMessage?(message: string): void;
}) {
  const { t: translate } = useHostTranslation();
  const [models, setModels] = useState<TtsVoice[]>([]),
    [voices, setVoices] = useState<TtsVoice[]>([]);
  const [pending, setPending] = useState(false);
  const modelsId = useId(),
    voicesId = useId();
  const signature = JSON.stringify([value, discoveryRevision]),
    current = useRef(signature),
    mounted = useRef(true),
    operation = useRef(false);
  current.current = signature;
  useEffect(() => {
    setModels([]);
  }, [value.baseUrl, discoveryRevision]);
  useEffect(() => {
    setVoices([]);
  }, [value.baseUrl, value.model, value.voicesSource, value.voicesPath, discoveryRevision]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const voiceOptions = value.voicesSource === 'manual' ? value.manualVoices : voices;
  const load = async (kind: 'models' | 'voices') => {
    if (operation.current) return;
    operation.current = true;
    setPending(true);
    onError('');
    const started = current.current;
    try {
      const result = await discover(kind);
      if (!mounted.current || started !== current.current) return;
      const items = result[kind] as TtsVoice[];
      (kind === 'models' ? setModels : setVoices)(items);
      onMessage?.(
        items.length
          ? translate('settings.ttsSettings.loaded', {
              length: items.length,
              value: translate(
                kind === 'models' ? 'settings.ttsSettings.model' : 'settings.ttsSettings.voice',
              ),
            })
          : translate('settings.ttsSettings.empty'),
      );
    } catch (e) {
      if (mounted.current && started === current.current)
        onError(e instanceof Error ? e.message : String(e));
    } finally {
      operation.current = false;
      if (mounted.current) setPending(false);
    }
  };
  return (
    <>
      <SettingsField
        title={translate('settings.ttsSettings.modelLabel')}
        hint={translate('settings.ttsSettings.modelHint')}
        {...settingAnchor('tts', 'model')}
      >
        <SettingsInput
          aria-label={translate('settings.ttsSettings.modelLabel')}
          list={modelsId}
          value={value.model}
          placeholder={translate('settings.ttsSettings.modelId')}
          onChange={(e) => change({ model: e.target.value })}
        />
        <datalist id={modelsId}>
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
          list={voicesId}
          value={value.defaultVoice}
          placeholder={translate('settings.ttsSettings.voiceId')}
          onChange={(e) => change({ defaultVoice: e.target.value })}
        />
        <datalist id={voicesId}>
          {voiceOptions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </datalist>
        {voiceOptions.length > 0 && (
          <select
            aria-label={translate('settings.ttsSettings.fetchedVoices')}
            value={voiceOptions.some((v) => v.id === value.defaultVoice) ? value.defaultVoice : ''}
            onChange={(e) => {
              if (e.target.value) change({ defaultVoice: e.target.value });
            }}
          >
            <option value="">{translate('settings.ttsSettings.select')}</option>
            {voiceOptions.map((v) => (
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
      <SettingsField
        title={translate('settings.ttsSettings.alwaysInstructions')}
        hint={translate('settings.ttsSettings.alwaysInstructionsHint')}
        description={
          value.instructionsMode === 'none'
            ? translate('settings.ttsSettings.instructionsDisabled')
            : undefined
        }
        {...settingAnchor('tts', 'alwaysInstructions')}
      >
        <SettingsTextarea
          aria-label={translate('settings.ttsSettings.alwaysInstructions')}
          value={value.alwaysInstructions}
          onChange={(e) => change({ alwaysInstructions: e.target.value })}
        />
      </SettingsField>
      <SettingsField
        title={translate('settings.ttsSettings.defaultInstructions')}
        hint={translate('settings.ttsSettings.defaultInstructionsHint')}
        description={
          value.instructionsMode === 'none'
            ? translate('settings.ttsSettings.instructionsDisabled')
            : undefined
        }
        {...settingAnchor('tts', 'defaultInstructions')}
      >
        <SettingsTextarea
          aria-label={translate('settings.ttsSettings.defaultInstructions')}
          value={value.defaultInstructions}
          placeholder={translate('settings.ttsSettings.instructionsPlaceholder')}
          onChange={(e) => change({ defaultInstructions: e.target.value })}
        />
      </SettingsField>
    </>
  );
}
