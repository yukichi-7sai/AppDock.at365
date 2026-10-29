import { useHostTranslation } from '../HostTranslation';
import { CommandText } from './CommandText';
import { SettingsInput, numberInput } from './SettingsInput';
import { useSettingsControls } from './api';
import { useState } from 'react';
import { SettingsField } from './SettingsSections';
import type { SettingDefinition } from '../../shared/contracts';
import { readObjectList, objectFieldValue, normalizeObject } from '../../shared/object-list';
import { RegisteredImageInput } from './RegisteredImagePicker';
import { useSettingsFeedback } from './SettingsStatus';

export function ObjectListSetting({
  definition,
  value,
  onChange,
}: {
  definition: SettingDefinition;
  value: unknown;
  onChange(value: unknown): void;
}) {
  const { t: translate } = useHostTranslation();
  const settingsControls = useSettingsControls();
  const [error, setError] = useState('');
  let entries: Record<string, unknown>[] = [];
  let loadError = '';
  try {
    entries = readObjectList(value ?? []);
    for (const item of entries)
      for (const field of definition.fields ?? []) objectFieldValue(item, field);
  } catch {
    loadError = translate('settings.objectListSetting.unreadable');
  }
  useSettingsFeedback({ error: loadError || error, target: definition.title });
  if (loadError)
    return (
      <button className="secondary" onClick={() => onChange([])}>
        {translate('settings.objectListSetting.create')}
      </button>
    );
  const fields = definition.fields ?? [];
  const label = definition.itemTitle ?? translate('settings.objectListSetting.item');
  const update = (index: number, key: string, next: unknown) =>
    onChange(
      entries.map((item, i) =>
        i === index ? { ...normalizeObject(item, fields), [key]: next } : item,
      ),
    );
  return (
    <div className="object-list-setting">
      {!entries.length && <p>{translate('settings.objectListSetting.empty', { label })}</p>}
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
              aria-label={translate('settings.objectListSetting.moveBefore', {
                label: label,
                value: index + 1,
              })}
              onClick={() => {
                const next = [...entries];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                onChange(next);
              }}
            >
              {translate('settings.objectListSetting.before')}
            </button>
            <button
              className="text-button"
              disabled={index === entries.length - 1}
              aria-label={translate('settings.objectListSetting.moveAfter', {
                label: label,
                value: index + 1,
              })}
              onClick={() => {
                const next = [...entries];
                [next[index + 1], next[index]] = [next[index], next[index + 1]];
                onChange(next);
              }}
            >
              {translate('settings.objectListSetting.after')}
            </button>
            <button
              className="text-button"
              aria-label={translate('settings.objectListSetting.deleteSettings', {
                label: label,
                value: index + 1,
              })}
              onClick={() => onChange(entries.filter((_, i) => i !== index))}
            >
              {translate('settings.objectListSetting.deleteSettingsAction')}
            </button>
          </div>
          {fields.map((field) => {
            const current = objectFieldValue(entry, field);
            const name = `${label}${index + 1} ${field.title}`;
            return (
              <SettingsField
                title={field.title}
                description={field.description && <CommandText text={field.description} />}
                key={field.key}
                settingKey={field.key}
              >
                {field.type === 'registered-image' ? (
                  <RegisteredImageInput
                    value={current}
                    label={name}
                    onChange={(next) => update(index, field.key, next)}
                  />
                ) : field.type === 'string-list' ? (
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
                            aria-label={translate('settings.objectListSetting.chooseItem', {
                              name: name,
                              value: slot + 1,
                            })}
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
                            {translate('settings.objectListSetting.choose')}
                          </button>
                        )}
                        <button
                          className="text-button"
                          aria-label={translate('settings.objectListSetting.deleteItem', {
                            name: name,
                            value: slot + 1,
                          })}
                          onClick={() =>
                            update(
                              index,
                              field.key,
                              (current as string[]).filter((_, i) => i !== slot),
                            )
                          }
                        >
                          {translate('settings.objectListSetting.delete')}
                        </button>
                      </div>
                    ))}
                    <button
                      className="secondary"
                      aria-label={translate('settings.objectListSetting.addItem', { name: name })}
                      onClick={() => update(index, field.key, [...(current as string[]), ''])}
                    >
                      {translate('settings.objectListSetting.addDirectory')}
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
        onClick={() => onChange([...entries, normalizeObject({}, fields)])}
      >
        {translate('settings.objectListSetting.add', { label })}
      </button>
    </div>
  );
}
