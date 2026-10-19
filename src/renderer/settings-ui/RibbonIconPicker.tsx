import { ribbonGroupIcons, type RibbonBuiltinIcon } from '../../shared/ribbon';

const labels: Record<RibbonBuiltinIcon, string> = {
  folder: 'フォルダー',
  mail: 'メール',
  clock: '時計',
  image: '画像',
  extensions: 'アプレット',
  settings: '設定',
  bell: '通知',
};
/** Both ribbon editors share this fixed catalogue; registered assets can extend the selector later. */
export function RibbonIconPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: RibbonBuiltinIcon;
  onChange(value: RibbonBuiltinIcon): void;
}) {
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value as RibbonBuiltinIcon)}
      >
        {ribbonGroupIcons.map((icon) => (
          <option key={icon} value={icon}>
            {labels[icon]}
          </option>
        ))}
      </select>
    </label>
  );
}
