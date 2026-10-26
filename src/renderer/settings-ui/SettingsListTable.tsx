import { useHostTranslation } from '../HostTranslation';
import { useRef, type ReactNode } from 'react';
import { CommandListSummary, CommandListToolbar, useCommandListScroll } from './CommandListScroll';
import type { SettingDefinition, SettingOption } from '../../shared/contracts';
import { objectFieldValue } from '../../shared/object-list';
import './settings-list.css';
import { RegisteredImagePreview } from './RegisteredImagePicker';
import { SettingsTable } from './SettingsTable';

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

export function ListIcon({
  kind,
}: {
  kind: 'edit' | 'pencil' | 'delete' | 'clear' | 'order' | 'open';
}) {
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
          <path d="M19.65 9.66 21.90 10.61 21.90 13.39 19.65 14.34 19.06 15.76 19.99 18.02 18.02 19.99 15.76 19.06 14.34 19.65 13.39 21.90 10.61 21.90 9.66 19.65 8.24 19.06 5.98 19.99 4.01 18.02 4.94 15.76 4.35 14.34 2.10 13.39 2.10 10.61 4.35 9.66 4.94 8.24 4.01 5.98 5.98 4.01 8.24 4.94 9.66 4.35 10.61 2.10 13.39 2.10 14.34 4.35 15.76 4.94 18.02 4.01 19.99 5.98 19.06 8.24Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : kind === 'pencil' ? (
        <path d="m16 3 5 5L9 20l-6 1 1-6L16 3Zm-2 2 5 5M4 15l5 5" />
      ) : kind === 'delete' ? (
        <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
      ) : kind === 'clear' ? (
        <path d="m14 3 7 7-10 10H6l-4-4L14 3Zm-7 8 7 7M11 20h10" />
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
      className="settings-list-icon settings-list-add applet-shortcut-add"
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

/** Shared table frame for declared lists and lists with inline controls. */
export function SettingsListLayout({
  title,
  toolbar,
  commandListScroll = false,
  actionsAlign = 'end',
  tableClassName,
  children,
}: {
  title: string;
  toolbar: ReactNode;
  commandListScroll?: boolean;
  actionsAlign?: 'start' | 'end';
  tableClassName?: string;
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useCommandListScroll(scrollRef, commandListScroll);
  return (
    <div className="settings-list" data-actions-align={actionsAlign}>
      {commandListScroll ? <CommandListToolbar>{toolbar}</CommandListToolbar> : toolbar}
      <div className="settings-list-scroll" ref={scrollRef}>
        <SettingsTable className={tableClassName} aria-label={title}>
          {children}
        </SettingsTable>
      </div>
    </div>
  );
}

export function SettingsListTable({
  testId,
  definition,
  entries,
  options = {},
  busy = false,
  onAdd,
  onEdit,
  onDelete,
  onToggle,
  canToggle,
  onOrder,
  extra,
  titleExtra,
  navigation,
  maxItems = 64,
  canAdd = true,
  addInTitle = false,
  orderInTitle = false,
  commandListScroll = false,
  toolbarFilter,
  actionsAlign = 'end',
}: {
  testId?: string;
  definition: SettingDefinition;
  entries: Record<string, unknown>[];
  options?: Record<string, SettingOption[]>;
  busy?: boolean;
  onAdd(): void;
  onEdit(index: number): void;
  onDelete(index: number): void;
  onToggle?(index: number): void;
  canToggle?(entry: Record<string, unknown>, index: number): boolean;
  onOrder?(): void;
  extra?(entry: Record<string, unknown>, index: number): ReactNode;
  titleExtra?(entry: Record<string, unknown>): ReactNode;
  navigation?(entry: Record<string, unknown>): ReactNode;
  maxItems?: number;
  canAdd?: boolean;
  addInTitle?: boolean;
  orderInTitle?: boolean;
  commandListScroll?: boolean;
  toolbarFilter?: ReactNode;
  actionsAlign?: 'start' | 'end';
}) {
  const { t: translate } = useHostTranslation();
  const view = definition.list!;
  const fields = definition.fields ?? [];
  const display = (entry: Record<string, unknown>, key: string) =>
    settingsListText(definition, entry, key, options);
  const count = (
    <span>
      {translate('settings.settingsListTable.entryCount', {
        count: entries.length,
        limit: maxItems,
      })}
    </span>
  );
  const orderInHeading = !!onOrder && addInTitle && orderInTitle;
  const orderButton = (
    <button
      type="button"
      className="settings-list-icon"
      data-testid={testId ? `${testId}:list:order` : undefined}
      title={translate('settings.settingsListTable.order')}
      aria-label={translate('settings.settingsListTable.orderLabel', { title: definition.title })}
      disabled={busy || entries.length < 2}
      onClick={onOrder}
    >
      <ListIcon kind="order" />
    </button>
  );
  const actions = (
    <>
      {!!onOrder && !orderInHeading && orderButton}
      {!addInTitle && (
        <button
          type="button"
          className="primary"
          data-testid={testId ? `${testId}:add` : undefined}
          data-dialog-focus-fallback
          disabled={busy || !canAdd || entries.length >= maxItems}
          onClick={onAdd}
        >
          {translate('settings.settingsListTable.add', {
            value: definition.itemTitle ?? translate('settings.settingsListTable.item'),
          })}
        </button>
      )}
    </>
  );
  return (
    <SettingsListLayout
      title={definition.title}
      commandListScroll={commandListScroll}
      actionsAlign={actionsAlign}
      toolbar={
        <CommandListSummary
          className="settings-list-toolbar"
          filter={toolbarFilter}
          actions={actions}
        >
          {count}
        </CommandListSummary>
      }
    >
      <thead>
        <tr>
          {view.showIndex && (
            <th>{definition.itemTitle ?? translate('settings.settingsListTable.item')}</th>
          )}
          {view.columns.map((key) => (
            <th key={key}>
              {addInTitle && key === view.titleKey ? (
                <span className="settings-list-heading">
                  {fields.find((field) => field.key === key)!.title}
                  <SettingsListAddButton
                    label={translate('settings.settingsListTable.add', {
                      value: definition.itemTitle ?? translate('settings.settingsListTable.item'),
                    })}
                    disabled={busy || !canAdd || entries.length >= maxItems}
                    onClick={onAdd}
                  />
                  {orderInHeading && orderButton}
                </span>
              ) : (
                fields.find((field) => field.key === key)!.title
              )}
            </th>
          ))}
          {view.enabledKey && (
            <th className="settings-list-state">
              {translate('settings.settingsListTable.enabled')}
            </th>
          )}
          <th className="settings-list-actions-heading">
            {translate('settings.settingsListTable.actions')}
          </th>
          {navigation && (
            <th className="command-settings-heading">
              {translate('settings.settingsListTable.navigation')}
            </th>
          )}
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, index) => {
          const name = view.showIndex
            ? `${definition.itemTitle ?? translate('settings.settingsListTable.item')}${index + 1}`
            : display(entry, view.titleKey);
          const legacyIcon =
            view.iconKey &&
            typeof entry[view.iconKey] === 'string' &&
            /^data:image\/(?:png|jpeg|webp);base64,/.test(String(entry[view.iconKey]))
              ? String(entry[view.iconKey])
              : undefined;
          return (
            <tr
              key={view.idKey ? String(entry[view.idKey]) : index}
              data-list-index={index}
              data-testid={
                testId
                  ? `${testId}:list:row:${view.idKey ? String(entry[view.idKey]) : index}`
                  : undefined
              }
            >
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
                        <strong className="command-title">
                          {display(entry, key) || translate('settings.settingsListTable.unset')}
                          {titleExtra?.(entry)}
                        </strong>
                        {view.descriptionKey && display(entry, view.descriptionKey) && (
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
                    data-testid={
                      testId
                        ? `${testId}:list:toggle:${view.idKey ? String(entry[view.idKey]) : index}`
                        : undefined
                    }
                    role="switch"
                    aria-label={translate('settings.settingsListTable.enable', { name: name })}
                    aria-checked={Boolean(entry[view.enabledKey])}
                    disabled={busy || canToggle?.(entry, index) === false}
                    onClick={() => onToggle?.(index)}
                  >
                    <span />
                  </button>
                </td>
              )}
              <td className="settings-list-actions-cell">
                <div className="settings-list-actions">
                  {extra?.(entry, index)}
                  <button
                    type="button"
                    className="settings-list-icon"
                    data-testid={
                      testId
                        ? `${testId}:list:edit:${view.idKey ? String(entry[view.idKey]) : index}`
                        : undefined
                    }
                    title={translate('settings.settingsListTable.edit')}
                    aria-label={translate('settings.settingsListTable.editLabel', {
                      name: name,
                    })}
                    disabled={busy}
                    onClick={() => onEdit(index)}
                  >
                    <ListIcon kind="edit" />
                  </button>
                  <button
                    type="button"
                    className="settings-list-icon settings-list-delete"
                    data-testid={
                      testId
                        ? `${testId}:list:delete:${view.idKey ? String(entry[view.idKey]) : index}`
                        : undefined
                    }
                    title={translate('settings.settingsListTable.delete')}
                    aria-label={translate('settings.settingsListTable.deleteLabel', {
                      name: name,
                    })}
                    disabled={busy}
                    onClick={() => onDelete(index)}
                  >
                    <ListIcon kind="delete" />
                  </button>
                </div>
              </td>
              {navigation && <td className="command-settings-cell">{navigation(entry)}</td>}
            </tr>
          );
        })}
        {!entries.length && (
          <tr>
            <td
              colSpan={
                view.columns.length +
                (view.enabledKey ? 2 : 1) +
                (view.showIndex ? 1 : 0) +
                (navigation ? 1 : 0)
              }
              className="settings-list-empty"
            >
              {addInTitle
                ? translate('settings.settingsListTable.emptyHeader', {
                    title: fields.find((field) => field.key === view.titleKey)!.title,
                  })
                : translate('settings.settingsListTable.emptyButton', {
                    value: definition.itemTitle ?? translate('settings.settingsListTable.item'),
                  })}
            </td>
          </tr>
        )}
      </tbody>
    </SettingsListLayout>
  );
}
