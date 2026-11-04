import { useHostTranslation } from '../HostTranslation';
import {
  accentChoices,
  allAccentPalettes,
  defaultAccentPalette,
  type AccentColor,
  type CustomAccentColors,
} from '../../shared/appearance';
import { SettingsColorPicker } from '../settings-ui/SettingsColorPicker';
import { SettingsField } from '../settings-ui/SettingsSections';
const paletteById = new Map(allAccentPalettes.map((preset) => [preset.id, preset]));
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
  const current = paletteById.get(value);
  return (
    <>
      {current?.hidden && (
        <p className="muted">{t('appearance.accent.current', { name: current.title })}</p>
      )}
      {!current && value !== 'custom' && (
        <p className="muted">
          {t('appearance.accent.unavailable', { id: value, name: defaultAccentPalette.title })}
        </p>
      )}
      <div className="accent-palettes" role="group" aria-label={t('appearance.accent.label')}>
        {accentChoices.map((palette) => {
          const colors =
            palette.id === 'custom'
              ? [custom.dark, custom.light]
              : paletteById.get(palette.id)!.light;
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
