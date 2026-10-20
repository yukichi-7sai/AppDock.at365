import React from 'react';
import { accentPalettes, type AccentColor } from '../../shared/appearance';
export function AccentColorPicker({
  value,
  onChange,
}: {
  value: AccentColor;
  onChange(value: AccentColor): void;
}) {
  return (
    <div className="accent-palettes" role="group" aria-label="アクセントカラー">
      {accentPalettes.map((palette) => (
        <button
          key={palette.id}
          type="button"
          className="accent-palette"
          aria-pressed={value === palette.id}
          onClick={() => onChange(palette.id)}
        >
          <span className="accent-palette-swatches" aria-hidden="true">
            <i style={{ background: palette.light[0] }} />
            <i style={{ background: palette.light[1] }} />
          </span>
          <span>{palette.title}</span>
        </button>
      ))}
    </div>
  );
}
