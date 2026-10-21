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
  return (
    <>
      {value === legacyAccentPalette.id && (
        <p className="muted">現在の配色: {legacyAccentPalette.title}</p>
      )}
      <div className="accent-palettes" role="group" aria-label="アクセントカラー">
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
              <span>{palette.title}</span>
            </button>
          );
        })}
      </div>
      {value === 'custom' && (
        <div className="accent-custom-colors">
          {(['dark', 'light'] as const).map((tone) => {
            const title = tone === 'dark' ? '濃い色' : '淡い色';
            return (
              <SettingsField
                key={tone}
                role="group"
                aria-label={title}
                title={title}
                hint="明暗テーマに合わせて、表示する色の明るさを自動調整します。入力した色はそのまま保存します。"
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
