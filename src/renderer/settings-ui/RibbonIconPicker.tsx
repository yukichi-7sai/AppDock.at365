import { ribbonGroupIcons, type RibbonBuiltinIcon } from '../../shared/ribbon';
import { RegisteredImageInput } from './RegisteredImagePicker';
import type { RegisteredImageRef } from '../../shared/registered-images';

const labels: Record<RibbonBuiltinIcon, string> = {
  folder: 'フォルダー',
  mail: 'メール',
  clock: '時計',
  image: '画像',
  extensions: 'アプレット',
  settings: '設定',
  bell: '通知',
  user: 'ユーザー',
};
/** Ribbon editors share fixed icons and the common registered-image selector. */
export function RibbonIconPicker({
  label,
  value,
  onChange,
  image,
  onImage,
}: {
  label: string;
  value: RibbonBuiltinIcon;
  onChange(value: RibbonBuiltinIcon): void;
  image?: RegisteredImageRef | null;
  onImage?(image: RegisteredImageRef | null): void;
}) {
  return (
    <div>
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
      {onImage && (
        <RegisteredImageInput label={label + 'の画像'} value={image} onChange={onImage} />
      )}
    </div>
  );
}
