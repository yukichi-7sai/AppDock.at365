import { useHostTranslation } from '../HostTranslation';
import { SettingsField } from './SettingsSections';
import { SettingsInput } from './SettingsInput';
import { validSendKeys } from '../../shared/setting-definitions';

type Entry = { id: string; title: string; keys: string };
export function ShortcutListSetting({
  title,
  value,
  onChange,
}: {
  title: string;
  value: unknown;
  onChange(value: Entry[]): void;
}) {
  const { t: translate } = useHostTranslation();
  const entries: Entry[] = Array.isArray(value)
    ? value.map((entry) => ({
        id: typeof entry?.id === 'string' ? entry.id : '',
        title: typeof entry?.title === 'string' ? entry.title : '',
        keys: typeof entry?.keys === 'string' ? entry.keys : '',
      }))
    : [];
  const update = (index: number, field: keyof Entry, text: string) =>
    onChange(entries.map((entry, i) => (i === index ? { ...entry, [field]: text } : entry)));
  return (
    <div className="send-key-list" role="group" aria-label={title}>
      <p className="send-key-count">
        {translate('settings.shortcutListSetting.entryCount', { count: entries.length })}
      </p>
      {!entries.length && <p>{translate('settings.shortcutListSetting.empty')}</p>}
      {entries.map((entry, index) => (
        <div className="send-key-entry" key={index}>
          <SettingsField title="ID">
            <SettingsInput
              aria-label={`${title} ${index + 1} ID`}
              placeholder={translate('settings.shortcutListSetting.id')}
              value={entry.id}
              onChange={(event) => update(index, 'id', event.target.value)}
            />
          </SettingsField>
          <SettingsField title={translate('settings.shortcutListSetting.name')}>
            <SettingsInput
              aria-label={translate('settings.shortcutListSetting.nameLabel', {
                title: title,
                value: index + 1,
              })}
              placeholder={translate('settings.shortcutListSetting.namePlaceholder')}
              value={entry.title}
              onChange={(event) => update(index, 'title', event.target.value)}
            />
          </SettingsField>
          <SettingsField title={translate('settings.shortcutListSetting.keys')}>
            <SettingsInput
              aria-label={translate('settings.shortcutListSetting.keysLabel', {
                title: title,
                value: index + 1,
              })}
              placeholder="Ctrl+T"
              value={entry.keys}
              aria-invalid={!validSendKeys(entry.keys)}
              onChange={(event) => update(index, 'keys', event.target.value)}
            />
          </SettingsField>
          <button
            type="button"
            aria-label={translate('settings.shortcutListSetting.deleteLabel', {
              title: title,
              value: index + 1,
            })}
            onClick={() => onChange(entries.filter((_, i) => i !== index))}
          >
            {translate('settings.shortcutListSetting.delete')}
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={entries.length >= 32}
        onClick={() => {
          let n = 1;
          while (entries.some((entry) => entry.id === `shortcut-${n}`)) n++;
          onChange([
            ...entries,
            {
              id: `shortcut-${n}`,
              title: translate('settings.shortcutListSetting.new'),
              keys: 'Ctrl+T',
            },
          ]);
        }}
      >
        {translate('settings.shortcutListSetting.add')}
      </button>
      <p>{translate('settings.shortcutListSetting.hint')}</p>
    </div>
  );
}
