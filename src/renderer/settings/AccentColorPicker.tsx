import { useHostTranslation } from '../HostTranslation';
import React from 'react';
import {
  accentChoices,
  accentPalettes,
  legacyAccentPalette,
  type AccentColor,
  type CustomAccentColors,
} from '../../shared/appearance';
import { SettingsColorPicker } from '../settings-ui/SettingsColorPicker';
import { SettingsField } from '../settings-ui/SettingsSections';
export function AccentColorPicker({
  value,
  custom,
  onChange,
  onCustomChange,
}: {
  value: AccentColor;
  custom: CustomAccentColors;
  onChange(value: AccentColor): void;
  onCustomChange(tone: keyof CustomAccentColors, color: string): void;
}) {
  const { t } = useHostTranslation();
  return (
    <>
      {value === legacyAccentPalette.id && (
        <p className="muted">
          {t('appearance.accent.current', { name: t('appearance.accent.palette.sky-blue') })}
        </p>
      )}
      <div className="accent-palettes" role="group" aria-label={t('appearance.accent.label')}>
        {accentChoices.map((palette) => {
          const colors =
            palette.id === 'custom'
              ? [custom.dark, custom.light]
              : accentPalettes.find((p) => p.id === palette.id)!.light;
          return (
            <button
              key={palette.id}
              type="button"
              className="accent-palette"
              aria-pressed={value === palette.id}
              onClick={() => onChange(palette.id)}
            >
              <span className="accent-palette-swatches" aria-hidden="true">
                <i style={{ background: colors[0] }} />
                <i style={{ background: colors[1] }} />
              </span>
              <span>{t(`appearance.accent.palette.${palette.id}`)}</span>
            </button>
          );
        })}
      </div>
      {value === 'custom' && (
        <div className="accent-custom-colors">
          {(['dark', 'light'] as const).map((tone) => {
            const title =
              tone === 'dark' ? t('appearance.accent.dark') : t('appearance.accent.light');
            return (
              <SettingsField
                key={tone}
                role="group"
                aria-label={title}
                title={title}
                hint={t('appearance.accent.customHint')}
              >
                <SettingsColorPicker
                  value={custom[tone]}
                  onChange={(color) => {
                    if (color !== null) onCustomChange(tone, color);
                  }}
                />
              </SettingsField>
            );
          })}
        </div>
      )}
    </>
  );
}
