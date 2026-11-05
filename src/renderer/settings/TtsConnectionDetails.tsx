import { useEffect, useLayoutEffect, useState } from 'react';
import { useHostTranslation } from '../HostTranslation';
import {
  parseTtsExtraBody,
  ttsInstructionsPath,
  ttsVoicesPath,
  type TtsConnectionSettings,
} from '../../shared/tts';
import { SettingsInput, SettingsTextarea } from '../settings-ui/SettingsInput';
import { SettingsField } from '../settings-ui/SettingsSections';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { TtsManualVoices } from './TtsManualVoices';

/** Connection-only fields for the server registration dialog. */
export function TtsConnectionDetails({
  value,
  change,
  onValidityChange,
}: {
  value: TtsConnectionSettings;
  change(patch: Partial<TtsConnectionSettings>): void;
  onValidityChange?(valid: boolean): void;
}) {
  const { t } = useHostTranslation();
  const [manualValid, setManualValid] = useState(true);
  const [extra, setExtra] = useState<string>();
  useEffect(() => setExtra(undefined), [JSON.stringify(value.extraBody)]);
  const validationError = (validate: () => unknown) => {
    try {
      validate();
      return '';
    } catch (reason) {
      return reason instanceof Error ? reason.message : String(reason);
    }
  };
  const speechPathError = validationError(() => ttsVoicesPath(value.speechPath));
  const voicePathError = validationError(() => ttsVoicesPath(value.voicesPath));
  const parameterError = validationError(() => ttsInstructionsPath(value.instructionsParameter));
  const extraError = validationError(() => {
    try {
      return parseTtsExtraBody(
        extra === undefined ? value.extraBody : JSON.parse(extra),
        value.instructionsParameter,
      );
    } catch {
      throw Error(t('settings.tts.extraBodyInvalid'));
    }
  });
  const valid =
    manualValid && !speechPathError && !voicePathError && !parameterError && !extraError;
  useLayoutEffect(() => onValidityChange?.(valid), [valid, onValidityChange]);
  return (
    <div className="tts-editor-grid">
      <SettingsField
        error={speechPathError}
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
        error={parameterError}
        hidden={value.instructionsMode !== 'json' && !parameterError}
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
        error={voicePathError}
        hidden={value.voicesSource !== 'endpoint' && !voicePathError}
        hint={t('settings.ttsSettings.voicePathHint')}
        {...settingAnchor('tts', 'voicesPath')}
      >
        <SettingsInput
          aria-label={t('settings.ttsSettings.voicePath')}
          value={value.voicesPath}
          onChange={(e) => change({ voicesPath: e.target.value })}
        />
      </SettingsField>
      <TtsManualVoices
        value={value.manualVoices}
        onChange={(manualVoices) => change({ manualVoices })}
        onValidityChange={setManualValid}
        visible={value.voicesSource === 'manual'}
      />
      <SettingsField
        className="tts-editor-full"
        title={t('settings.ttsSettings.extraBody')}
        error={extraError}
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
            } catch {
              // Invalid JSON stays local until corrected; the common field reports the error.
            }
          }}
        />
      </SettingsField>
    </div>
  );
}
