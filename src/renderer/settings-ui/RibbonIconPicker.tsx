import { useId, useState } from 'react';
import { ribbonGroupIcons, type RibbonBuiltinIcon } from '../../shared/ribbon';
import { Icon } from '../Icon';
import { RegisteredImageInput } from './RegisteredImagePicker';
import type { RegisteredImageRef } from '../../shared/registered-images';
import { SettingsField } from './SettingsSections';

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
/** Only the active source is sent to the parent draft; inactive choices live until close. */
export function RibbonIconPicker({
  label,
  value,
  onChange,
  image,
  onImage,
  preferImage = false,
}: {
  label: string;
  value: RibbonBuiltinIcon;
  onChange(value: RibbonBuiltinIcon): void;
  image?: RegisteredImageRef | null;
  onImage?(image: RegisteredImageRef | null): void;
  preferImage?: boolean;
}) {
  const id = useId();
  const [mode, setMode] = useState<'image' | 'builtin'>(
    onImage && (image || preferImage) ? 'image' : 'builtin',
  );
  const [draftImage, setDraftImage] = useState(image ?? null);
  const chooseMode = (next: 'image' | 'builtin') => {
    setMode(next);
    onImage?.(next === 'image' ? draftImage : null);
  };
  return (
    <SettingsField title={label}>
      {onImage && (
        <div className="ribbon-icon-modes" role="group" aria-label="アイコンの種類">
          {(['image', 'builtin'] as const).map((source) => (
            <label key={source}>
              <input
                type="radio"
                name={`${id}-source`}
                value={source}
                checked={mode === source}
                onChange={() => chooseMode(source)}
              />
              <span>{source === 'image' ? '画像' : '既定のアイコン'}</span>
            </label>
          ))}
        </div>
      )}
      {mode === 'image' && onImage ? (
        <RegisteredImageInput
          label={label + 'の画像'}
          value={draftImage}
          onChange={(next) => {
            setDraftImage(next);
            onImage(next);
          }}
        />
      ) : (
        <div className="ribbon-builtin-icons" role="group" aria-label="既定のアイコン一覧">
          {ribbonGroupIcons.map((icon) => (
            <button
              type="button"
              key={icon}
              aria-label={labels[icon]}
              title={labels[icon]}
              aria-pressed={value === icon}
              onClick={() => onChange(icon)}
            >
              <Icon name={icon} size={24} />
              {value === icon && (
                <span className="ribbon-builtin-check">
                  <Icon name="check" size={12} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </SettingsField>
  );
}
