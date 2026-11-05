import { useEffect, useState } from 'react';
import { useHostTranslation } from '../HostTranslation';
import { parseTtsExtraBody, parseTtsVoices, type TtsConnectionSettings } from '../../shared/tts';
import { SettingsInput, SettingsTextarea } from '../settings-ui/SettingsInput';
import { SettingsSection, SettingsField } from '../settings-ui/SettingsSections';
import { settingAnchor } from '../settings-ui/setting-anchor';

/** Connection-only fields, reusable in a future connection registration dialog. */
export function TtsConnectionDetails({
  value,
  change,
  setError,
}: {
  value: TtsConnectionSettings;
  change(patch: Partial<TtsConnectionSettings>): void;
  setError(message: string): void;
}) {
  const { t } = useHostTranslation();
  const [manual, setManual] = useState<string>();
  const [extra, setExtra] = useState<string>();
  useEffect(() => setManual(undefined), [JSON.stringify(value.manualVoices)]);
  useEffect(() => setExtra(undefined), [JSON.stringify(value.extraBody)]);
  return (
    <SettingsSection
      title={t('settings.ttsSettings.advanced')}
      hint={t('settings.ttsSettings.advancedHint')}
      variant="row"
      collapsible
    >
      <SettingsField
        title={t('settings.ttsSettings.speechPath')}
        hint={t('settings.ttsSettings.speechPathHint')}
        {...settingAnchor('tts', 'speechPath')}
      >
        <SettingsInput
          aria-label={t('settings.ttsSettings.speechPath')}
          value={value.speechPath}
          onChange={(e) => change({ speechPath: e.target.value })}
        />
      </SettingsField>
      <SettingsField
        title={t('settings.ttsSettings.speedMode')}
        {...settingAnchor('tts', 'speedMode')}
      >
        <select
          aria-label={t('settings.ttsSettings.speedMode')}
          value={value.speedMode}
          onChange={(e) =>
            change({ speedMode: e.target.value as TtsConnectionSettings['speedMode'] })
          }
        >
          <option value="playback">{t('settings.ttsSettings.localSpeed')}</option>
          <option value="server">{t('settings.ttsSettings.serverSpeed')}</option>
        </select>
      </SettingsField>
      <SettingsField
        title={t('settings.ttsSettings.instructionsMode')}
        {...settingAnchor('tts', 'instructionsMode')}
      >
        <select
          aria-label={t('settings.ttsSettings.instructionsMode')}
          value={value.instructionsMode}
          onChange={(e) =>
            change({
              instructionsMode: e.target.value as TtsConnectionSettings['instructionsMode'],
            })
          }
        >
          <option value="none">{t('settings.ttsSettings.instructionsNone')}</option>
          <option value="json">{t('settings.ttsSettings.instructionsJson')}</option>
        </select>
      </SettingsField>
      <SettingsField
        title={t('settings.ttsSettings.instructionsParameter')}
        hint={t('settings.ttsSettings.instructionsParameterHint')}
        {...settingAnchor('tts', 'instructionsParameter')}
      >
        <SettingsInput
          aria-label={t('settings.ttsSettings.instructionsParameter')}
          value={value.instructionsParameter}
          onChange={(e) => change({ instructionsParameter: e.target.value })}
        />
      </SettingsField>
      <SettingsField
        title={t('settings.ttsSettings.extraBody')}
        hint={t('settings.ttsSettings.extraBodyHint')}
        {...settingAnchor('tts', 'extraBody')}
      >
        <SettingsTextarea
          aria-label={t('settings.ttsSettings.extraBody')}
          value={extra ?? JSON.stringify(value.extraBody, null, 2)}
          placeholder={'{"language":"Japanese"}'}
          spellCheck={false}
          onChange={(e) => {
            setExtra(e.target.value);
            try {
              const extraBody = parseTtsExtraBody(
                JSON.parse(e.target.value),
                value.instructionsParameter,
              );
              change({ extraBody });
              setError('');
            } catch {
              setError(t('settings.tts.extraBodyInvalid'));
            }
          }}
        />
      </SettingsField>
      <SettingsField
        title={t('settings.ttsSettings.voiceMode')}
        {...settingAnchor('tts', 'voicesSource')}
      >
        <select
          aria-label={t('settings.ttsSettings.voiceMode')}
          value={value.voicesSource}
          onChange={(e) =>
            change({ voicesSource: e.target.value as TtsConnectionSettings['voicesSource'] })
          }
        >
          <option value="endpoint">{t('settings.ttsSettings.serverVoices')}</option>
          <option value="manual">{t('settings.ttsSettings.manualVoices')}</option>
        </select>
      </SettingsField>
      <SettingsField
        title={t('settings.ttsSettings.voicePath')}
        hint={t('settings.ttsSettings.voicePathHint')}
        {...settingAnchor('tts', 'voicesPath')}
      >
        <SettingsInput
          aria-label={t('settings.ttsSettings.voicePath')}
          value={value.voicesPath}
          onChange={(e) => change({ voicesPath: e.target.value })}
        />
      </SettingsField>
      <SettingsField
        title={t('settings.ttsSettings.manualList')}
        description={t('settings.ttsSettings.manualListExample')}
        hint={t('settings.ttsSettings.manualListHint')}
        {...settingAnchor('tts', 'manualVoices')}
      >
        <SettingsTextarea
          aria-label={t('settings.ttsSettings.manualList')}
          data-testid="tts-manual-voices"
          value={manual ?? JSON.stringify(value.manualVoices, null, 2)}
          onChange={(e) => {
            const text = e.target.value.trim() ? e.target.value : '[]';
            setManual(text);
            try {
              change({ manualVoices: parseTtsVoices(JSON.parse(text)) });
              setError('');
            } catch {
              setError(t('settings.ttsSettings.manualListInvalid'));
            }
          }}
        />
      </SettingsField>
    </SettingsSection>
  );
}
