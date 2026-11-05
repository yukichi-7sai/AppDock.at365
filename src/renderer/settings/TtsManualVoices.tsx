import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useHostTranslation } from '../HostTranslation';
import { parseTtsVoices, type TtsVoice } from '../../shared/tts';
import { SettingsInput, SettingsTextarea } from '../settings-ui/SettingsInput';
import { SettingsActions, SettingsField } from '../settings-ui/SettingsSections';
import { settingAnchor } from '../settings-ui/setting-anchor';

type VoiceRow = TtsVoice & { key: string };
const rowsFor = (voices: TtsVoice[]): VoiceRow[] =>
  voices.map((voice) => ({ ...voice, key: crypto.randomUUID() }));

/** Incomplete rows remain in this dialog; only a valid list becomes a voice candidate source. */
export function TtsManualVoices({
  value,
  onChange,
  onValidityChange,
  visible,
}: {
  value: TtsVoice[];
  onChange(voices: TtsVoice[]): void;
  onValidityChange(valid: boolean): void;
  visible: boolean;
}) {
  const { t } = useHostTranslation();
  const [rows, setRows] = useState(() => rowsFor(value));
  const [jsonMode, setJsonMode] = useState(false);
  const [json, setJson] = useState<string>();
  const previous = useRef(JSON.stringify(value));
  const container = useRef<HTMLDivElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const serialized = JSON.stringify(value);
    if (serialized !== previous.current) {
      previous.current = serialized;
      setRows(rowsFor(value));
      setJson(undefined);
    }
  }, [value]);
  let error = '';
  try {
    parseTtsVoices(
      jsonMode && json !== undefined
        ? JSON.parse(json.trim() ? json : '[]')
        : rows.map(({ id, name }) => ({ id, name: name || id })),
    );
  } catch {
    error = t(
      jsonMode ? 'settings.ttsSettings.manualListInvalid' : 'settings.ttsEditor.invalidVoices',
    );
  }
  useLayoutEffect(() => onValidityChange(!error), [error, onValidityChange]);
  const update = (next: VoiceRow[]) => {
    setRows(next);
    try {
      const voices = parseTtsVoices(next.map(({ id, name }) => ({ id, name: name || id })));
      previous.current = JSON.stringify(voices);
      onChange(voices);
    } catch {
      // Keep the last valid candidates while the row is incomplete or duplicated.
    }
  };
  const add = () => {
    update([...rows, { key: crypto.randomUUID(), id: '', name: '' }]);
    requestAnimationFrame(() => {
      container.current
        ?.querySelectorAll<HTMLInputElement>('input[data-voice-id]')
        .item(rows.length)
        ?.focus();
    });
  };
  return (
    <SettingsField
      className="tts-editor-full"
      title={t('settings.ttsSettings.manualList')}
      hint={t('settings.ttsEditor.manualHint')}
      error={error}
      hidden={!visible && !error}
      {...settingAnchor('tts', 'manualVoices')}
    >
      <div className="tts-manual-voices">
        {jsonMode ? (
          <SettingsTextarea
            aria-label={t('settings.ttsSettings.manualList')}
            data-testid="tts-manual-voices"
            spellCheck={false}
            value={json ?? JSON.stringify(value, null, 2)}
            onChange={(event) => {
              const text = event.target.value;
              setJson(text);
              try {
                const voices = parseTtsVoices(JSON.parse(text.trim() ? text : '[]'));
                // JSON editing retains names exactly as supplied, including an empty name.
                previous.current = JSON.stringify(voices);
                setRows(rowsFor(voices));
                onChange(voices);
              } catch {
                // Invalid JSON stays in this editor and cannot be saved.
              }
            }}
          />
        ) : (
          <div ref={container} className="tts-manual-voices" data-testid="tts-manual-voice-rows">
            {rows.length > 0 && (
              <div className="tts-voice-row tts-voice-headings" aria-hidden="true">
                <span>{t('settings.ttsEditor.voiceId')}</span>
                <span>{t('settings.ttsEditor.voiceName')}</span>
                <span>{t('settings.aiSettings.actions')}</span>
              </div>
            )}
            {rows.map((row, index) => (
              <div className="tts-voice-row" key={row.key}>
                <SettingsInput
                  data-voice-id
                  aria-label={t('settings.ttsEditor.voiceIdRow', { index: index + 1 })}
                  value={row.id}
                  onChange={(event) =>
                    update(
                      rows.map((item) =>
                        item.key === row.key ? { ...item, id: event.target.value } : item,
                      ),
                    )
                  }
                />
                <SettingsInput
                  aria-label={t('settings.ttsEditor.voiceNameRow', { index: index + 1 })}
                  value={row.name}
                  placeholder={row.id}
                  onChange={(event) =>
                    update(
                      rows.map((item) =>
                        item.key === row.key ? { ...item, name: event.target.value } : item,
                      ),
                    )
                  }
                />
                <button
                  type="button"
                  aria-label={t('settings.ttsEditor.removeVoice', { index: index + 1 })}
                  onClick={() => {
                    update(rows.filter((item) => item.key !== row.key));
                    addButton.current?.focus();
                  }}
                >
                  {t('common.delete')}
                </button>
              </div>
            ))}
          </div>
        )}
        <SettingsActions>
          {!jsonMode && (
            <button type="button" ref={addButton} onClick={add}>
              {t('settings.ttsEditor.addVoice')}
            </button>
          )}
          <button
            type="button"
            disabled={!!error}
            onClick={() => {
              setJson(undefined);
              setJsonMode(!jsonMode);
            }}
          >
            {t(jsonMode ? 'settings.ttsEditor.editRows' : 'settings.ttsEditor.editJson')}
          </button>
        </SettingsActions>
      </div>
    </SettingsField>
  );
}
