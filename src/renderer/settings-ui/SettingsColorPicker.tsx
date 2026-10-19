import { useEffect, useId, useState } from 'react';
import { SettingsInput } from './SettingsInput';
import { parseRibbonColor } from '../../shared/ribbon';
import './settings-color-picker.css';

const colors = [
  ['赤', '#E5484D'],
  ['橙', '#F08C2E'],
  ['黄', '#D5AA16'],
  ['緑', '#30A46C'],
  ['青', '#3B82F6'],
  ['紫', '#8B5CF6'],
  ['桃', '#DB5CA1'],
  ['灰', '#87909E'],
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
  const description = useId();
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
  return (
    <div className="settings-color-picker">
      <div className="settings-color-swatches" role="group" aria-label="色見本">
        {allowNone && (
          <button type="button" aria-pressed={!value} onClick={() => choose(null)}>
            色なし
          </button>
        )}
        {colors.map(([name, color]) => (
          <button
            type="button"
            key={color}
            aria-label={name}
            title={name}
            aria-pressed={value === color}
            onClick={() => choose(color)}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <div className="settings-color-inputs">
        <label>
          自由な色
          <input
            aria-label="自由な色"
            type="color"
            value={value ?? '#30A46C'}
            onChange={(e) => choose(e.target.value.toUpperCase())}
          />
        </label>
        <label>
          HEX
          <SettingsInput
            aria-label="色のHEX値"
            value={raw}
            placeholder="#RRGGBB"
            maxLength={7}
            aria-invalid={!valid(raw)}
            aria-describedby={description}
            onChange={(e) => changeText(e.target.value)}
          />
        </label>
      </div>
      <small id={description}>
        {valid(raw) ? '6桁のHEX値を指定できます。' : '色を #RRGGBB の形式で指定してください。'}
      </small>
    </div>
  );
}
