import { hostText } from '../../shared/i18n';
import { useHostTranslation } from '../HostTranslation';
import { useId, useState } from 'react';
import { ribbonGroupIcons, type RibbonBuiltinIcon } from '../../shared/ribbon';
import { Icon } from '../Icon';
import { RegisteredImageInput } from './RegisteredImagePicker';
import type { RegisteredImageRef } from '../../shared/registered-images';
import { SettingsField } from './SettingsSections';

const labels: Record<RibbonBuiltinIcon, string> = {
  folder: hostText('settings.ribbonIconPicker.folder'),
  mail: hostText('settings.ribbonIconPicker.mail'),
  clock: hostText('settings.ribbonIconPicker.clock'),
  image: hostText('settings.ribbonIconPicker.image'),
  extensions: hostText('settings.ribbonIconPicker.applet'),
  settings: hostText('settings.ribbonIconPicker.settings'),
  bell: hostText('settings.ribbonIconPicker.notifications'),
  user: hostText('settings.ribbonIconPicker.user'),
  home: hostText('settings.ribbonIconPicker.home'),
  globe: hostText('settings.ribbonIconPicker.globe'),
  logs: hostText('settings.ribbonIconPicker.logs'),
  terminal: hostText('settings.ribbonIconPicker.terminal'),
  command: hostText('settings.ribbonIconPicker.command'),
  keyboard: hostText('settings.ribbonIconPicker.keyboard'),
  mouse: hostText('settings.ribbonIconPicker.mouse'),
  touchpad: hostText('settings.ribbonIconPicker.touchpad'),
  bolt: hostText('settings.ribbonIconPicker.bolt'),
  lock: hostText('settings.ribbonIconPicker.lock'),
  search: hostText('settings.ribbonIconPicker.search'),
  play: hostText('settings.ribbonIconPicker.play'),
  refresh: hostText('settings.ribbonIconPicker.refresh'),
  power: hostText('settings.ribbonIconPicker.power'),
  sun: hostText('settings.ribbonIconPicker.sun'),
  moon: hostText('settings.ribbonIconPicker.moon'),
  chevron: hostText('settings.ribbonIconPicker.chevron'),
  'chevron-left': hostText('settings.ribbonIconPicker.chevronLeft'),
  calendar: hostText('settings.ribbonIconPicker.calendar'),
  star: hostText('settings.ribbonIconPicker.star'),
  heart: hostText('settings.ribbonIconPicker.heart'),
  file: hostText('settings.ribbonIconPicker.file'),
  link: hostText('settings.ribbonIconPicker.link'),
  download: hostText('settings.ribbonIconPicker.download'),
  upload: hostText('settings.ribbonIconPicker.upload'),
  music: hostText('settings.ribbonIconPicker.music'),
  volume: hostText('settings.ribbonIconPicker.volume'),
  video: hostText('settings.ribbonIconPicker.video'),
  edit: hostText('settings.ribbonIconPicker.edit'),
  trash: hostText('settings.ribbonIconPicker.trash'),
  info: hostText('settings.ribbonIconPicker.info'),
  help: hostText('settings.ribbonIconPicker.help'),
};
/** Only the active source is sent to the parent draft; inactive choices live until close. */
export function RibbonIconPicker({
  label,
  settingKey = 'icon',
  value,
  onChange,
  image,
  onImage,
  preferImage = false,
}: {
  label: string;
  settingKey?: string;
  value: RibbonBuiltinIcon;
  onChange(value: RibbonBuiltinIcon): void;
  image?: RegisteredImageRef | null;
  onImage?(image: RegisteredImageRef | null): void;
  preferImage?: boolean;
}) {
  const { t: translate } = useHostTranslation();
  const id = useId();
  const [mode, setMode] = useState<'image' | 'builtin'>(
    onImage && (image || preferImage) ? 'image' : 'builtin',
  );
  const [draftImage, setDraftImage] = useState(image ?? null);
  const chooseMode = (next: 'image' | 'builtin') => {
    setMode(next);
    onImage?.(next === 'image' ? draftImage : null);
    if (next === 'builtin') onChange(value);
  };
  return (
    <SettingsField title={label} settingKey={settingKey}>
      <div className="ribbon-icon-picker" data-testid="ribbon-icon-picker">
        {onImage && (
          <div
            className="ribbon-icon-modes"
            role="group"
            aria-label={translate('settings.ribbonIconPicker.kind')}
          >
            {(['image', 'builtin'] as const).map((source) => (
              <label key={source}>
                <input
                  type="radio"
                  name={`${id}-source`}
                  value={source}
                  checked={mode === source}
                  onChange={() => chooseMode(source)}
                />
                <span>
                  {source === 'image'
                    ? translate('settings.ribbonIconPicker.image')
                    : translate('settings.ribbonIconPicker.default')}
                </span>
              </label>
            ))}
          </div>
        )}
        <div className="ribbon-icon-content" data-testid="ribbon-icon-content">
          {mode === 'image' && onImage ? (
            <RegisteredImageInput
              label={translate('settings.ribbonIconPicker.imageLabel', { label })}
              value={draftImage}
              onChange={(next) => {
                setDraftImage(next);
                onImage(next);
              }}
            />
          ) : (
            <div
              className="ribbon-builtin-icons"
              role="group"
              data-testid="ribbon-builtin-icons"
              aria-label={translate('settings.ribbonIconPicker.defaultList')}
            >
              {ribbonGroupIcons.map((icon) => (
                <button
                  type="button"
                  key={icon}
                  aria-label={labels[icon]}
                  title={labels[icon]}
                  aria-pressed={value === icon}
                  onClick={() => onChange(icon)}
                  onFocus={(event) =>
                    event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
                  }
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
        </div>
      </div>
    </SettingsField>
  );
}
