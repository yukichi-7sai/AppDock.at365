import { useHostTranslation } from '../HostTranslation';
import { useRef, useState } from 'react';
import type { SettingDefinition, SettingOption } from '../../shared/contracts';
import {
  normalizeObject,
  objectFieldValue,
  readObjectList,
  setObjectField,
} from '../../shared/object-list';
import { validateSettingValue } from '../../shared/setting-definitions';
import { SettingsOrderDialog } from './SettingsOrderDialog';
import { SettingsDialog } from './SettingsModal';
import { SettingsField } from './SettingsSections';
import { SettingsInput, SettingsUrlInput, SettingsTextarea, numberInput } from './SettingsInput';
import { SettingsListTable, ListIcon, settingsListText } from './SettingsListTable';
import { DirectoryListInput } from './DirectoryListInput';
import { RegisteredImageInput } from './RegisteredImagePicker';
import { useSettingsFeedback } from './SettingsStatus';

export function ObjectListDialogSetting({
  definition,
  value,
  options = {},
  onCommit,
  onOpen,
}: {
  definition: SettingDefinition;
  value: unknown;
  options?: Record<string, SettingOption[]>;
  onCommit(value: Record<string, unknown>[], before: Record<string, unknown>[]): Promise<unknown>;
  onOpen?(entry: Record<string, unknown>): Promise<unknown>;
}) {
  const { t: translate } = useHostTranslation();
  let entries: Record<string, unknown>[] = [],
    loadError = '';
  try {
    entries = readObjectList(value ?? definition.default ?? []);
    for (const entry of entries)
      for (const field of definition.fields ?? []) objectFieldValue(entry, field);
  } catch {
    loadError = translate('settings.objectListDialogSetting.unreadable');
  }
  const view = definition.list!,
    fields = definition.fields ?? [];
  const [dialog, setDialog] = useState<{
    kind: 'edit' | 'delete' | 'order';
    index: number;
    before: Record<string, unknown>[];
    draft: Record<string, unknown>;
  } | null>(null);
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const running = useRef(false);
  const commit = async (next: Record<string, unknown>[], before: Record<string, unknown>[]) => {
    if (running.current) throw Error(translate('settings.objectListDialogSetting.pending'));
    running.current = true;
    setPending(true);
    setError('');
    try {
      validateSettingValue(definition, next);
      await onCommit(next, before);
    } finally {
      running.current = false;
      setPending(false);
    }
  };
  const immediate = (next: Record<string, unknown>[]) =>
    void commit(next, entries).catch((e) => setError(String(e.message ?? e)));
  const open = (kind: 'edit' | 'delete' | 'order', index = -1) => {
    const draft = structuredClone(normalizeObject(index < 0 ? {} : entries[index], fields));
    if (index < 0 && view.idKey) draft[view.idKey] = crypto.randomUUID();
    if (index < 0)
      for (const field of fields)
        if (field.optionSource && options[field.key]?.length)
          setObjectField(draft, field, options[field.key][0].value);
    setDialog({
      kind,
      index,
      before: structuredClone(entries),
      draft,
    });
  };
  const update = (field: SettingDefinition, next: unknown) => {
    setDialog((current) => {
      if (!current || current.kind !== 'edit') return current;
      const draft = structuredClone(current.draft);
      setObjectField(draft, field, next);
      return { ...current, draft };
    });
  };
  useSettingsFeedback({ error: loadError || error, busy: pending, target: definition.title });
  if (loadError) return null;
  return (
    <>
      <SettingsListTable
        definition={definition}
        entries={entries}
        options={options}
        busy={pending}
        extra={
          onOpen
            ? (entry) => (
                <button
                  type="button"
                  className="settings-list-icon"
                  title={translate('settings.objectListDialogSetting.open')}
                  aria-label={translate('settings.objectListDialogSetting.openItem', {
                    value: String(entry[view.titleKey]),
                  })}
                  disabled={!entry.enabled || pending}
                  onClick={() =>
                    void onOpen(entry).catch((error) => setError(String(error.message ?? error)))
                  }
                >
                  <ListIcon kind="open" />
                </button>
              )
            : undefined
        }
        onAdd={() => open('edit')}
        onEdit={(i) => open('edit', i)}
        onOrder={() => open('order')}
        onDelete={(i) =>
          view.confirmDelete ? open('delete', i) : immediate(entries.filter((_, n) => n !== i))
        }
        onToggle={(i) =>
          immediate(
            entries.map((entry, n) =>
              n === i ? { ...entry, [view.enabledKey!]: !entry[view.enabledKey!] } : entry,
            ),
          )
        }
      />
      {dialog?.kind === 'order' && (
        <SettingsOrderDialog
          title={translate('settings.objectListDialogSetting.orderTitle', {
            title: definition.title,
          })}
          listLabel={translate('settings.objectListDialogSetting.displayOrderTitle', {
            title: definition.title,
          })}
          items={dialog.before.map((entry, index) => ({
            id: String(index),
            title: view.showIndex
              ? `${definition.itemTitle ?? translate('settings.objectListDialogSetting.item')}${index + 1}`
              : settingsListText(definition, entry, view.titleKey, options),
            description: view.showIndex
              ? settingsListText(definition, entry, view.titleKey, options)
              : view.descriptionKey
                ? settingsListText(definition, entry, view.descriptionKey, options)
                : undefined,
          }))}
          onClose={() => setDialog(null)}
          onApply={(ordered) =>
            commit(
              ordered.map((id) => dialog.before[Number(id)]),
              dialog.before,
            )
          }
        />
      )}
      {dialog && dialog.kind !== 'order' && (
        <SettingsDialog
          title={translate(
            dialog.kind === 'delete'
              ? 'settings.objectListDialogSetting.deleteTitle'
              : dialog.index < 0
                ? 'settings.objectListDialogSetting.addTitle'
                : 'settings.objectListDialogSetting.editTitle',
            {
              item: definition.itemTitle ?? translate('settings.objectListDialogSetting.item'),
              index: view.showIndex && dialog.index >= 0 ? dialog.index + 1 : '',
            },
          )}
          onClose={() => setDialog(null)}
          applyLabel={
            dialog.kind === 'delete' ? translate('settings.objectListDialogSetting.delete') : 'OK'
          }
          onApply={async () => {
            const next =
              dialog.kind === 'delete'
                ? dialog.before.filter((_, i) => i !== dialog.index)
                : dialog.index < 0
                  ? [...dialog.before, dialog.draft]
                  : dialog.before.map((entry, i) => (i === dialog.index ? dialog.draft : entry));
            await commit(next, dialog.before);
          }}
        >
          {dialog.kind === 'delete' ? (
            <p>
              {translate('settings.objectListDialogSetting.deleteConfirm', {
                name: String(dialog.draft[view.titleKey]),
              })}
            </p>
          ) : (
            fields
              .filter((field) => field.key !== view.idKey)
              .map((field) => {
                const current = objectFieldValue(dialog.draft, field),
                  choices = options[field.key] ?? field.options ?? [];
                return (
                  <SettingsField
                    key={field.key}
                    title={field.title}
                    description={field.description}
                  >
                    {field.type === 'boolean' ? (
                      <input
                        type="checkbox"
                        aria-label={field.title}
                        checked={Boolean(current)}
                        onChange={(e) => update(field, e.target.checked)}
                      />
                    ) : field.type === 'select' ? (
                      <select
                        aria-label={field.title}
                        value={String(current ?? '')}
                        onChange={(e) => update(field, e.target.value)}
                      >
                        {!choices.some((choice) => choice.value === current) && (
                          <option value={String(current ?? '')}>
                            {current
                              ? translate('settings.objectListDialogSetting.currentValue', {
                                  current: String(current),
                                })
                              : translate('settings.objectListDialogSetting.select')}
                          </option>
                        )}
                        {choices.map((choice) => (
                          <option key={choice.value} value={choice.value}>
                            {choice.label}
                          </option>
                        ))}
                      </select>
                    ) : field.type === 'string-list' && field.format === 'directory' ? (
                      <DirectoryListInput
                        label={field.title}
                        value={(current as string[]) ?? []}
                        onChange={(next) => update(field, next)}
                      />
                    ) : field.type === 'string-list' ? (
                      <SettingsTextarea
                        aria-label={field.title}
                        value={((current as string[]) ?? []).join('\n')}
                        onChange={(e) => update(field, e.target.value.split('\n').filter(Boolean))}
                      />
                    ) : field.type === 'registered-image' ? (
                      <RegisteredImageInput
                        value={current}
                        label={field.title}
                        onChange={(next) => update(field, next)}
                      />
                    ) : field.format === 'url' ? (
                      <SettingsUrlInput
                        aria-label={field.title}
                        value={String(current ?? '')}
                        onChange={(e) => update(field, e.target.value.trim())}
                      />
                    ) : (
                      <SettingsInput
                        aria-label={field.title}
                        type={field.type === 'number' ? 'number' : 'text'}
                        min={field.minimum}
                        max={field.maximum}
                        step={field.step ?? 'any'}
                        value={String(current ?? '')}
                        onChange={(e) =>
                          update(
                            field,
                            field.type === 'number' ? numberInput(e.target.value) : e.target.value,
                          )
                        }
                      />
                    )}
                  </SettingsField>
                );
              })
          )}
        </SettingsDialog>
      )}
    </>
  );
}
