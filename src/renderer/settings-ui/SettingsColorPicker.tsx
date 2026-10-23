import { useHostTranslation } from '../HostTranslation';
import { useEffect, useState } from 'react';
import { SettingsInput } from './SettingsInput';
import { Icon } from '../Icon';
import { parseRibbonColor } from '../../shared/ribbon';
import './settings-color-picker.css';

const colorNames = [
  'color.red',
  'color.orange',
  'color.yellow',
  'color.green',
  'color.blue',
  'color.purple',
  'color.pink',
  'color.gray',
] as const;
const palettes = [
  {
    name: 'color.pastel',
    colors: [
      '#F2AAAA',
      '#F6C397',
      '#EDDEA4',
      '#A8D5BA',
      '#A9C9ED',
      '#C6B4E3',
      '#E7B3D1',
      '#C7CBD4',
    ],
  },
  {
    name: 'color.muted',
    colors: [
      '#CC8F95',
      '#D8AF88',
      '#C9BB86',
      '#91B5A1',
      '#91ABC9',
      '#B1A0C7',
      '#C89EB6',
      '#A7AFBE',
    ],
  },
  {
    name: 'color.basic',
    colors: [
      '#E5484D',
      '#F08C2E',
      '#D5AA16',
      '#30A46C',
      '#3B82F6',
      '#8B5CF6',
      '#DB5CA1',
      '#87909E',
    ],
  },
] as const;

/** Controlled color value; unfinished text remains local and blocks the caller's confirmation. */
export function SettingsColorPicker({
  value,
  allowNone = false,
  onChange,
  onValidityChange,
}: {
  value: string | null;
  allowNone?: boolean;
  onChange(value: string | null): void;
  onValidityChange?(valid: boolean): void;
}) {
  const { t } = useHostTranslation();
  const [raw, setRaw] = useState(value ?? '');
  const [paletteIndex, setPaletteIndex] = useState(0);
  const palette = palettes[paletteIndex];
  useEffect(() => {
    setRaw(value ?? '');
    onValidityChange?.(true);
  }, [value]);
  const choose = (color: string | null) => {
    setRaw(color ?? '');
    onValidityChange?.(true);
    onChange(color);
  };
  const valid = (text: string) => /^#[a-fA-F0-9]{6}$/.test(text) || (allowNone && !text);
  const changeText = (text: string) => {
    setRaw(text);
    const ready = valid(text);
    onValidityChange?.(ready);
    if (ready) choose(text ? parseRibbonColor(text) : null);
  };
  const invalid = !valid(raw);
  return (
    <div className="settings-color-picker">
      <div className="settings-color-toolbar">
        <span className="settings-color-palette-name" role="status" aria-atomic="true">
          {t(palette.name)}
        </span>
        <button
          type="button"
          className="settings-color-cycle"
          aria-label={t('color.cycle')}
          title={t('color.nextPalette', {
            name: t(palettes[(paletteIndex + 1) % palettes.length].name),
          })}
          onClick={() => setPaletteIndex((current) => (current + 1) % palettes.length)}
        >
          <Icon name="refresh" size={16} />
        </button>
      </div>
      <div className="settings-color-swatches" role="group" aria-label={t('color.swatches')}>
        {palette.colors.map((color, index) => (
          <button
            type="button"
            className="settings-color-swatch"
            key={color}
            aria-label={t(colorNames[index])}
            title={`${t(colorNames[index])} ${color}`}
            aria-pressed={value === color}
            onClick={() => choose(color)}
            style={{ backgroundColor: color }}
          >
            {value === color && <Icon name="check" size={16} />}
          </button>
        ))}
      </div>
      <div className="settings-color-inputs">
        {allowNone && (
          <button
            type="button"
            className="settings-color-none"
            aria-pressed={!value}
            onClick={() => choose(null)}
          >
            <span className="settings-color-none-mark" aria-hidden="true" />
            {t('color.none')}
          </button>
        )}
        <div className={`settings-color-custom${invalid ? ' is-invalid' : ''}`}>
          <input
            aria-label={t('color.custom')}
            title={t('color.choose')}
            className="settings-color-native"
            type="color"
            value={value ?? palettes[0].colors[3]}
            onChange={(e) => choose(e.target.value.toUpperCase())}
          />
          <SettingsInput
            aria-label={t('color.hex')}
            className="settings-color-hex"
            type="text"
            value={raw}
            placeholder="#RRGGBB"
            maxLength={7}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={invalid}
            onChange={(e) => changeText(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
