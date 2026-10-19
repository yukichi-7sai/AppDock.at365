import { useEffect, useState } from 'react';
import { SettingsInput } from './SettingsInput';
import { Icon } from '../Icon';
import { parseRibbonColor } from '../../shared/ribbon';
import './settings-color-picker.css';

const colorNames = ['赤', '橙', '黄', '緑', '青', '紫', '桃', '灰'] as const;
const palettes = [
  {
    name: 'パステル',
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
    name: 'くすみ',
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
    name: 'ベーシック',
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
          {palette.name}
        </span>
        <button
          type="button"
          className="settings-color-cycle"
          aria-label="パレットを切り替え"
          title={`次のパレット: ${palettes[(paletteIndex + 1) % palettes.length].name}`}
          onClick={() => setPaletteIndex((current) => (current + 1) % palettes.length)}
        >
          <Icon name="refresh" size={16} />
        </button>
      </div>
      <div className="settings-color-swatches" role="group" aria-label="色見本">
        {palette.colors.map((color, index) => (
          <button
            type="button"
            className="settings-color-swatch"
            key={color}
            aria-label={colorNames[index]}
            title={`${colorNames[index]} ${color}`}
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
            色なし
          </button>
        )}
        <div className={`settings-color-custom${invalid ? ' is-invalid' : ''}`}>
          <input
            aria-label="自由な色"
            title="色を選択"
            className="settings-color-native"
            type="color"
            value={value ?? palettes[0].colors[3]}
            onChange={(e) => choose(e.target.value.toUpperCase())}
          />
          <SettingsInput
            aria-label="色のHEX値"
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
