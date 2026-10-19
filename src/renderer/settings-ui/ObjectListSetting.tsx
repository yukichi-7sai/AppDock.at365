import { SettingsInput, numberInput } from './SettingsInput';
import { useSettingsControls } from './api';
import { useState } from 'react';
import { SettingsField } from './SettingsSections';
import type { SettingDefinition } from '../../shared/contracts';
import { readObjectList, objectFieldValue, normalizeObject } from '../../shared/object-list';

export function ObjectListSetting({
  definition,
  value,
  onChange,
}: {
  definition: SettingDefinition;
  value: unknown;
  onChange(value: unknown): void;
}) {
  const settingsControls = useSettingsControls();
  const [error, setError] = useState('');
  let entries: Record<string, unknown>[];
  try {
    entries = readObjectList(value ?? []);
    for (const item of entries)
      for (const field of definition.fields ?? []) objectFieldValue(item, field);
  } catch {
    return (
      <div role="alert">
        保存された設定を読み取れません。
        <button className="secondary" onClick={() => onChange([])}>
          新しい一覧を作る
        </button>
      </div>
    );
  }
  const fields = definition.fields ?? [];
  const label = definition.itemTitle ?? '項目';
  const update = (index: number, key: string, next: unknown) =>
    onChange(
      entries.map((item, i) =>
        i === index ? { ...normalizeObject(item, fields), [key]: next } : item,
      ),
    );
  return (
    <div className="object-list-setting">
      {error && <p role="alert">{error}</p>}
      {!entries.length && <p>まだ{label}の設定がありません。</p>}
      {entries.map((entry, index) => (
        <fieldset key={index} className="object-list-item">
          <legend>
            {label}
            {index + 1}
          </legend>
          <div className="actions">
            <button
              className="text-button"
              disabled={index === 0}
              aria-label={`${label}${index + 1}を前へ移動`}
              onClick={() => {
                const next = [...entries];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                onChange(next);
              }}
            >
              前へ
            </button>
            <button
              className="text-button"
              disabled={index === entries.length - 1}
              aria-label={`${label}${index + 1}を後ろへ移動`}
              onClick={() => {
                const next = [...entries];
                [next[index + 1], next[index]] = [next[index], next[index + 1]];
                onChange(next);
              }}
            >
              後ろへ
            </button>
            <button
              className="text-button"
              aria-label={`${label}${index + 1}の設定を削除`}
              onClick={() => onChange(entries.filter((_, i) => i !== index))}
            >
              設定を削除
            </button>
          </div>
          {fields.map((field) => {
            const current = objectFieldValue(entry, field);
            const name = `${label}${index + 1} ${field.title}`;
            return (
              <SettingsField title={field.title} description={field.description} key={field.key}>
                {field.type === 'string-list' ? (
                  <div className="source-folders">
                    {((current as string[]) ?? []).map((folder, slot) => (
                      <div className="source-folder" key={slot}>
                        <SettingsInput
                          aria-label={`${name} ${slot + 1}`}
                          value={folder}
                          onChange={(event) => {
                            const next = [...(current as string[])];
                            next[slot] = event.target.value;
                            update(index, field.key, next);
                          }}
                        />
                        {field.format === 'directory' && (
                          <button
                            className="secondary"
                            aria-label={`${name} ${slot + 1}を選ぶ`}
                            onClick={() => {
                              void settingsControls
                                .chooseDirectory()
                                .then((selected) => {
                                  if (selected) {
                                    const next = [...(current as string[])];
                                    next[slot] = selected;
                                    update(index, field.key, next);
                                  }
                                })
                                .catch((err: Error) => setError(err.message));
                            }}
                          >
                            選ぶ
                          </button>
                        )}
                        <button
                          className="text-button"
                          aria-label={`${name} ${slot + 1}を削除`}
                          onClick={() =>
                            update(
                              index,
                              field.key,
                              (current as string[]).filter((_, i) => i !== slot),
                            )
                          }
                        >
                          削除
                        </button>
                      </div>
                    ))}
                    <button
                      className="secondary"
                      disabled={(current as string[]).length >= 64}
                      aria-label={`${name}を追加`}
                      onClick={() => update(index, field.key, [...(current as string[]), ''])}
                    >
                      フォルダーを追加
                    </button>
                  </div>
                ) : field.type === 'boolean' ? (
                  <SettingsInput
                    type="checkbox"
                    aria-label={name}
                    checked={Boolean(current)}
                    onChange={(event) => update(index, field.key, event.target.checked)}
                  />
                ) : field.type === 'select' ? (
                  <select
                    aria-label={name}
                    value={String(current ?? '')}
                    onChange={(event) => update(index, field.key, event.target.value)}
                  >
                    {(field.options ?? []).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <SettingsInput
                    aria-label={name}
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={String(current ?? '')}
                    min={field.minimum}
                    max={field.maximum}
                    step={field.step ?? 'any'}
                    onChange={(event) =>
                      update(
                        index,
                        field.key,
                        field.type === 'number'
                          ? event.target.value === ''
                            ? ''
                            : numberInput(event.target.value)
                          : event.target.value,
                      )
                    }
                  />
                )}
              </SettingsField>
            );
          })}
        </fieldset>
      ))}
      <button
        className="secondary"
        disabled={entries.length >= 64}
        onClick={() => onChange([...entries, normalizeObject({}, fields)])}
      >
        {label}を追加
      </button>
    </div>
  );
}
