import { useHostTranslation } from '../HostTranslation';
import { CommandText } from './CommandText';
import { useEffect, useRef, useState } from 'react';
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
import { SettingsButton } from './SettingsButton';
import {
  mergeSettingListDraft,
  type SettingListDraftResult,
} from '../../shared/setting-list-draft';
import type { RegisteredImageRef } from '../../shared/registered-images';

export function ObjectListDialogSetting({
  testId,
  definition,
  value,
  options = {},
  onCommit,
  onOpen,
  onDraftAction,
  onDraftImage,
}: {
  testId?: string;
  definition: SettingDefinition;
  value: unknown;
  options?: Record<string, SettingOption[]>;
  onCommit(value: Record<string, unknown>[], before: Record<string, unknown>[]): Promise<unknown>;
  onOpen?(entry: Record<string, unknown>): Promise<unknown>;
  onDraftAction?(input: string): Promise<SettingListDraftResult>;
  onDraftImage?(base64: string): Promise<RegisteredImageRef>;
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
  const actionTestId = testId ? `${testId}:draft-action` : undefined;
  const dialogRef = useRef<typeof dialog>(null),
    sequence = useRef(0),
    requestBusy = useRef(false);
  const fieldVersions = useRef<Record<string, number>>({});
  const pendingImage = useRef<SettingListDraftResult['image']>(undefined);
  const [fetching, setFetching] = useState(false),
    [draftError, setDraftError] = useState(''),
    [draftMessage, setDraftMessage] = useState(''),
    [imagePreview, setImagePreview] = useState('');
  useEffect(
    () => () => {
      sequence.current++;
      dialogRef.current = null;
    },
    [],
  );
  const setCurrentDialog = (next: typeof dialog) => {
    dialogRef.current = next;
    setDialog(next);
  };
  const close = () => {
    sequence.current++;
    requestBusy.current = false;
    pendingImage.current = undefined;
    setFetching(false);
    setImagePreview('');
    setDraftError('');
    setDraftMessage('');
    setCurrentDialog(null);
  };
  const changed = (key: string) => {
    fieldVersions.current[key] = (fieldVersions.current[key] ?? 0) + 1;
    if (key === view.imageKey || key === view.draftAction?.inputKey) {
      pendingImage.current = undefined;
      setImagePreview('');
    }
  };
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
    close();
    fieldVersions.current = {};
    const draft = structuredClone(normalizeObject(index < 0 ? {} : entries[index], fields));
    if (index < 0 && view.idKey) draft[view.idKey] = crypto.randomUUID();
    if (index < 0)
      for (const field of fields)
        if (field.optionSource && options[field.key]?.length)
          setObjectField(draft, field, options[field.key][0].value);
    setCurrentDialog({
      kind,
      index,
      before: structuredClone(entries),
      draft,
    });
  };
  const update = (field: SettingDefinition, next: unknown) => {
    const current = dialogRef.current;
    if (!current || current.kind !== 'edit') return;
    changed(field.key);
    const draft = structuredClone(current.draft);
    setObjectField(draft, field, next);
    setCurrentDialog({ ...current, draft });
  };
  const fetchDraft = async () => {
    const current = dialogRef.current,
      action = view.draftAction;
    if (!current || current.kind !== 'edit' || !action || !onDraftAction || requestBusy.current)
      return;
    const token = ++sequence.current,
      before = structuredClone(current.draft),
      versions = { ...fieldVersions.current };
    const input = String(
      objectFieldValue(
        before,
        fields.find((field) => field.key === action.inputKey)!,
      ) ?? '',
    );
    requestBusy.current = true;
    setFetching(true);
    setDraftError('');
    setDraftMessage('');
    try {
      const result = await onDraftAction(input),
        latest = dialogRef.current;
      if (
        sequence.current !== token ||
        !latest ||
        latest.kind !== 'edit' ||
        (fieldVersions.current[action.inputKey] ?? 0) !== (versions[action.inputKey] ?? 0)
      )
        return;
      const changedFields = new Set(
        fields
          .filter((field) => (fieldVersions.current[field.key] ?? 0) !== (versions[field.key] ?? 0))
          .map((field) => field.key),
      );
      const draft = mergeSettingListDraft(definition, latest.draft, before, result, changedFields);
      if (
        result.image &&
        view.imageKey &&
        !draft[view.imageKey] &&
        (!view.iconKey || !draft[view.iconKey]) &&
        !changedFields.has(view.imageKey)
      ) {
        pendingImage.current = result.image;
        setImagePreview(result.image.preview);
      }
      setCurrentDialog({ ...latest, draft });
      setDraftMessage(result.message ?? '');
    } catch (error) {
      if (sequence.current === token)
        setDraftError(error instanceof Error ? error.message : String(error));
    } finally {
      if (sequence.current === token) {
        requestBusy.current = false;
        setFetching(false);
      }
    }
  };
  useSettingsFeedback({ error: loadError || error, busy: pending, target: definition.title });
  if (loadError) return null;
  return (
    <>
      <SettingsListTable
        testId={testId}
        actionsAlign="start"
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
          onClose={close}
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
          onClose={close}
          valid={!fetching}
          message={draftMessage}
          error={draftError}
          applyLabel={
            dialog.kind === 'delete' ? translate('settings.objectListDialogSetting.delete') : 'OK'
          }
          onApply={async () => {
            const draft = structuredClone(dialog.draft);
            if (dialog.kind === 'edit' && pendingImage.current && view.imageKey && onDraftImage)
              draft[view.imageKey] = await onDraftImage(pendingImage.current.base64);
            const next =
              dialog.kind === 'delete'
                ? dialog.before.filter((_, i) => i !== dialog.index)
                : dialog.index < 0
                  ? [...dialog.before, draft]
                  : dialog.before.map((entry, i) => (i === dialog.index ? draft : entry));
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
                    settingKey={field.key}
                    title={field.title}
                    description={field.description && <CommandText text={field.description} />}
                    onInputCapture={
                      field.type === 'registered-image' ? undefined : () => changed(field.key)
                    }
                  >
                    {field.type === 'boolean' ? (
                      <input
                        data-testid={testId ? `${testId}/${field.key}:input` : undefined}
                        type="checkbox"
                        aria-label={field.title}
                        checked={Boolean(current)}
                        onChange={(e) => update(field, e.target.checked)}
                      />
                    ) : field.type === 'select' ? (
                      <select
                        data-testid={testId ? `${testId}/${field.key}:select` : undefined}
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
                        data-testid={testId ? `${testId}/${field.key}:textarea` : undefined}
                        aria-label={field.title}
                        value={((current as string[]) ?? []).join('\n')}
                        onChange={(e) => update(field, e.target.value.split('\n').filter(Boolean))}
                      />
                    ) : field.type === 'registered-image' ? (
                      <RegisteredImageInput
                        testId={testId ? `${testId}/${field.key}:image` : undefined}
                        value={current}
                        preview={field.key === view.imageKey ? imagePreview : undefined}
                        label={field.title}
                        onChange={(next) => update(field, next)}
                      />
                    ) : field.format === 'url' ? (
                      <SettingsUrlInput
                        data-testid={testId ? `${testId}/${field.key}:input` : undefined}
                        aria-label={field.title}
                        value={String(current ?? '')}
                        onChange={(e) => update(field, e.target.value.trim())}
                      />
                    ) : (
                      <SettingsInput
                        data-testid={testId ? `${testId}/${field.key}:input` : undefined}
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
                    {view.draftAction?.inputKey === field.key && onDraftAction && (
                      <SettingsButton
                        data-testid={actionTestId}
                        pending={fetching}
                        disabled={!String(current ?? '').trim()}
                        onClick={() => void fetchDraft()}
                      >
                        {view.draftAction.title}
                      </SettingsButton>
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
