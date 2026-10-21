import type { ReactNode } from 'react';
import type { SettingDefinition, SettingOption } from '../../shared/contracts';
import { objectFieldValue } from '../../shared/object-list';
import './settings-list.css';
import { RegisteredImagePreview } from './RegisteredImagePicker';

export function settingsListText(
  definition: SettingDefinition,
  entry: Record<string, unknown>,
  key: string,
  options: Record<string, SettingOption[]> = {},
) {
  const field = definition.fields!.find((field) => field.key === key)!;
  const value = objectFieldValue(entry, field);
  return (
    (options[key] ?? field.options)?.find((option) => option.value === value)?.label ??
    (Array.isArray(value) ? value.join('、') : String(value ?? ''))
  );
}

export function ListIcon({ kind }: { kind: 'edit' | 'delete' | 'order' | 'open' }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === 'edit' ? (
        <>
          <path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 2 3-1 1-3 3-1 2-3-2-2 1-3-3-2-3 1-2-2Z" />
          <circle cx="11.5" cy="10.5" r="3" />
        </>
      ) : kind === 'delete' ? (
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
      ) : kind === 'order' ? (
        <path d="M8 4v16m-4-4 4 4 4-4M16 20V4m-4 4 4-4 4 4" />
      ) : (
        <path d="M14 3h7v7M21 3 10 14M10 3H3v18h18v-7" />
      )}
    </svg>
  );
}
export function SettingsListAddButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      className="applet-shortcut-add"
      data-dialog-focus-fallback
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      ＋
    </button>
  );
}
export function SettingsListTable({
  definition,
  entries,
  options = {},
  busy = false,
  onAdd,
  onEdit,
  onDelete,
  onToggle,
  onOrder,
  extra,
  maxItems = 64,
  canAdd = true,
  addInTitle = false,
}: {
  definition: SettingDefinition;
  entries: Record<string, unknown>[];
  options?: Record<string, SettingOption[]>;
  busy?: boolean;
  onAdd(): void;
  onEdit(index: number): void;
  onDelete(index: number): void;
  onToggle?(index: number): void;
  onOrder(): void;
  extra?(entry: Record<string, unknown>, index: number): ReactNode;
  maxItems?: number;
  canAdd?: boolean;
  addInTitle?: boolean;
}) {
  const view = definition.list!;
  const fields = definition.fields ?? [];
  const display = (entry: Record<string, unknown>, key: string) =>
    settingsListText(definition, entry, key, options);
  return (
    <div className="settings-list">
      <div className="settings-list-toolbar">
        <span>
          {entries.length} / {maxItems} 件
        </span>
        <div>
          <button
            type="button"
            className="settings-list-icon"
            title="並べ替え"
            aria-label={`${definition.title}を並べ替え`}
            disabled={busy || entries.length < 2}
            onClick={onOrder}
          >
            <ListIcon kind="order" />
          </button>
          {!addInTitle && (
            <button
              type="button"
              className="primary"
              data-dialog-focus-fallback
              disabled={busy || !canAdd || entries.length >= maxItems}
              onClick={onAdd}
            >
              {definition.itemTitle ?? '項目'}を追加
            </button>
          )}
        </div>
      </div>
      <div className="settings-list-scroll">
        <table aria-label={definition.title}>
          <thead>
            <tr>
              {view.showIndex && <th>{definition.itemTitle ?? '項目'}</th>}
              {view.columns.map((key) => (
                <th key={key}>
                  {addInTitle && key === view.titleKey ? (
                    <span className="settings-list-heading">
                      {fields.find((field) => field.key === key)!.title}
                      <SettingsListAddButton
                        label={`${definition.itemTitle ?? '項目'}を追加`}
                        disabled={busy || !canAdd || entries.length >= maxItems}
                        onClick={onAdd}
                      />
                    </span>
                  ) : (
                    fields.find((field) => field.key === key)!.title
                  )}
                </th>
              ))}
              {view.enabledKey && <th className="settings-list-state">有効</th>}
              <th className="settings-list-actions-heading">操作</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => {
              const name = view.showIndex
                ? `${definition.itemTitle ?? '項目'}${index + 1}`
                : display(entry, view.titleKey);
              const legacyIcon =
                view.iconKey &&
                typeof entry[view.iconKey] === 'string' &&
                /^data:image\/(?:png|jpeg|webp);base64,/.test(String(entry[view.iconKey]))
                  ? String(entry[view.iconKey])
                  : undefined;
              return (
                <tr key={view.idKey ? String(entry[view.idKey]) : index} data-list-index={index}>
                  {view.showIndex && <td className="settings-list-index">{index + 1}</td>}
                  {view.columns.map((key) => (
                    <td
                      key={key}
                      className={key === view.titleKey ? 'settings-list-primary' : undefined}
                    >
                      {key === view.titleKey ? (
                        <div className="settings-list-title">
                          <RegisteredImagePreview
                            value={view.imageKey ? entry[view.imageKey] : null}
                            fallback={legacyIcon}
                          />
                          <div>
                            <strong>{display(entry, key) || '未設定'}</strong>
                            {view.descriptionKey && (
                              <small>{display(entry, view.descriptionKey)}</small>
                            )}
                          </div>
                        </div>
                      ) : (
                        display(entry, key)
                      )}
                    </td>
                  ))}
                  {view.enabledKey && (
                    <td>
                      <button
                        type="button"
                        className="toggle settings-list-toggle"
                        role="switch"
                        aria-label={`${name}を有効にする`}
                        aria-checked={Boolean(entry[view.enabledKey])}
                        disabled={busy}
                        onClick={() => onToggle?.(index)}
                      >
                        <span />
                      </button>
                    </td>
                  )}
                  <td>
                    <div className="settings-list-actions">
                      {extra?.(entry, index)}
                      <button
                        type="button"
                        className="settings-list-icon"
                        title="編集"
                        aria-label={`${name}を編集`}
                        disabled={busy}
                        onClick={() => onEdit(index)}
                      >
                        <ListIcon kind="edit" />
                      </button>
                      <button
                        type="button"
                        className="settings-list-icon settings-list-delete"
                        title="削除"
                        aria-label={`${name}を削除`}
                        disabled={busy}
                        onClick={() => onDelete(index)}
                      >
                        <ListIcon kind="delete" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!entries.length && (
              <tr>
                <td
                  colSpan={
                    view.columns.length + (view.enabledKey ? 2 : 1) + (view.showIndex ? 1 : 0)
                  }
                  className="settings-list-empty"
                >
                  {addInTitle
                    ? `登録がありません。「${fields.find((field) => field.key === view.titleKey)!.title}」の横の＋から登録できます。`
                    : `登録がありません。「${definition.itemTitle ?? '項目'}を追加」から登録できます。`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
