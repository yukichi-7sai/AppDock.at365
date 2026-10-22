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
      <p className="send-key-count">{entries.length} / 32 件のコマンド</p>
      {!entries.length && <p>「コマンドを追加」から、名前と送信するキーを登録できます。</p>}
      {entries.map((entry, index) => (
        <div className="send-key-entry" key={index}>
          <SettingsField title="ID">
            <SettingsInput
              aria-label={`${title} ${index + 1} ID`}
              placeholder="ID（例: new-tab）"
              value={entry.id}
              onChange={(event) => update(index, 'id', event.target.value)}
            />
          </SettingsField>
          <SettingsField title="名前">
            <SettingsInput
              aria-label={`${title} ${index + 1} 名前`}
              placeholder="名前（例: 新しいタブ）"
              value={entry.title}
              onChange={(event) => update(index, 'title', event.target.value)}
            />
          </SettingsField>
          <SettingsField title="送信するキー">
            <SettingsInput
              aria-label={`${title} ${index + 1} キー`}
              placeholder="Ctrl+T"
              value={entry.keys}
              aria-invalid={!validSendKeys(entry.keys)}
              onChange={(event) => update(index, 'keys', event.target.value)}
            />
          </SettingsField>
          <button
            type="button"
            aria-label={`${title} ${index + 1} 削除`}
            onClick={() => onChange(entries.filter((_, i) => i !== index))}
          >
            削除
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
            { id: `shortcut-${n}`, title: '新しいショートカット', keys: 'Ctrl+T' },
          ]);
        }}
      >
        コマンドを追加
      </button>
      <p>
        IDを変えると別のコマンドになります。キーは Ctrl+Shift+T、Alt+F4、Win+E
        などを指定できます。保存すると反映されます。
      </p>
    </div>
  );
}
