import { useEffect, useRef, useState } from 'react';
import { useHostTranslation } from '../HostTranslation';
import { SettingsTextarea } from '../settings-ui/SettingsInput';
import { SettingsField, SettingsInputActions } from '../settings-ui/SettingsSections';
import { SettingsCombobox } from '../settings-ui/SettingsCombobox';
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
    <div className="server-editor-grid">
      <SettingsField
        title={translate('settings.ttsEditor.model')}
        hint={translate('settings.ttsSettings.modelHint')}
        {...settingAnchor('tts', 'model')}
      >
        <SettingsInputActions wrap>
          <SettingsCombobox
            label={translate('settings.ttsEditor.model')}
            value={value.model}
            options={models}
            onChange={(model) => change({ model })}
          />
          <button
            type="button"
            disabled={busy || pending || !value.baseUrl}
            aria-label={translate('settings.ttsSettings.refreshModels')}
            onClick={() => load('models')}
          >
            {translate('settings.ttsEditor.fetchOptions')}
          </button>
        </SettingsInputActions>
      </SettingsField>
      <SettingsField
        title={translate('settings.ttsEditor.voice')}
        hint={translate('settings.ttsSettings.defaultVoiceHint')}
        {...settingAnchor('tts', 'defaultVoice')}
      >
        <SettingsInputActions wrap>
          <SettingsCombobox
            label={translate('settings.ttsEditor.voice')}
            value={value.defaultVoice}
            options={voiceOptions}
            onChange={(defaultVoice) => change({ defaultVoice })}
          />
          {value.voicesSource === 'endpoint' && (
            <button
              type="button"
              disabled={busy || pending || !value.baseUrl}
              aria-label={translate('settings.ttsSettings.refreshVoices')}
              onClick={() => load('voices')}
            >
              {translate('settings.ttsEditor.fetchOptions')}
            </button>
          )}
        </SettingsInputActions>
      </SettingsField>
      <SettingsField
        className="server-editor-full"
        title={translate('settings.ttsEditor.alwaysInstructions')}
        hint={translate('settings.ttsSettings.alwaysInstructionsHint')}
        description={
          value.instructionsMode === 'none'
            ? translate('settings.ttsSettings.instructionsDisabled')
            : undefined
        }
        {...settingAnchor('tts', 'alwaysInstructions')}
      >
        <SettingsTextarea
          aria-label={translate('settings.ttsEditor.alwaysInstructions')}
          rows={2}
          value={value.alwaysInstructions}
          onChange={(e) => change({ alwaysInstructions: e.target.value })}
        />
      </SettingsField>
      <SettingsField
        className="server-editor-full"
        title={translate('settings.ttsEditor.defaultInstructions')}
        hint={translate('settings.ttsSettings.defaultInstructionsHint')}
        {...settingAnchor('tts', 'defaultInstructions')}
      >
        <SettingsTextarea
          aria-label={translate('settings.ttsEditor.defaultInstructions')}
          rows={2}
          value={value.defaultInstructions}
          placeholder={translate('settings.ttsSettings.instructionsPlaceholder')}
          onChange={(e) => change({ defaultInstructions: e.target.value })}
        />
      </SettingsField>
    </div>
  );
}
