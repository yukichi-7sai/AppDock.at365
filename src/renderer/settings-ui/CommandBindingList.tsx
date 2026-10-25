import { useHostTranslation } from '../HostTranslation';
import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ListIcon } from './SettingsListTable';
import { SettingsTable } from './SettingsTable';
import { SettingsDialog } from './SettingsModal';
import { SettingsDescriptionIcon } from './SettingsHintIcon';
import { CommandProviderBadge } from './CommandProviderBadge';
import { useSettingsFeedback } from './SettingsStatus';
import type { UiCommand } from '../../shared/commands';
import type { BindingInputFilter, BindingProviderFilter } from './useBindingCommandFilter';
import { useCommandListScroll } from './CommandListScroll';
import { useCommandCellFollow } from './useCommandCellFollow';
import {
  CommandPrivacy,
  CommandSettingsLinks,
  CommandSettingsNavigation,
} from './CommandSettingsNavigation';
export type BindingEdit<R> = { row: R; title: string; ownerTitle?: string; adding: boolean };
export function CommandBindingList<R extends { id: string; command: string; enabled: boolean }>({
  readOnly,
  commands,
  bindings,
  showProvider = false,
  showNavigation = true,
  separateConditions = false,
  followCommands = false,
  addOptions,
  statusError,
  onRetry,
  inputName,
  inputKey,
  inputLabel,
  renderInput,
  selectedInput,
  onInputFilter,
  selectedProvider,
  onProviderFilter,
  conditionLabel,
  newBinding,
  applyBinding,
  deleteBinding,
  renderEditor,
  renderOrder,
}: {
  readOnly?(row: R): string | undefined;
  commands: UiCommand[];
  bindings: R[];
  showProvider?: boolean;
  showNavigation?: boolean;
  separateConditions?: boolean;
  followCommands?: boolean;
  addOptions?: {
    id: string;
    title: string;
    label(command: UiCommand): string;
    icon: ReactNode;
    create(command: UiCommand): R;
  }[];
  statusError?(row: R): string | undefined;
  onRetry?(): void;
  inputName: string;
  inputKey(row: R): string;
  inputLabel(row: R): string;
  renderInput?(row: R): ReactNode;
  selectedInput?: string;
  onInputFilter?(input: BindingInputFilter, trigger: HTMLButtonElement): void;
  selectedProvider?: string | null;
  onProviderFilter?(provider: BindingProviderFilter, trigger: HTMLButtonElement): void;
  conditionLabel(row: R, command: UiCommand): string;
  newBinding(command: UiCommand): R;
  applyBinding(row: R, original?: R): void;
  deleteBinding(row: R): void;
  renderEditor(edit: BindingEdit<R>, apply: (row: R) => void, close: () => void): ReactNode;
  renderOrder(row: R, close: () => void): ReactNode;
}) {
  const { t: translate } = useHostTranslation();
  const [orderKey, setOrderKey] = useState<R | null>(null);
  const navigation = useContext(CommandSettingsNavigation);
  const [editing, setEditing] = useState<BindingEdit<R> | null>(null);
  const [deleting, setDeleting] = useState<{ row: R; title: string; description: string } | null>(
    null,
  );
  const [notice, setNotice] = useState('');
  const commandsByInput = new Map<string, Set<string>>();
  for (const row of bindings) {
    const key = inputKey(row);
    if (!commandsByInput.has(key)) commandsByInput.set(key, new Set());
    commandsByInput.get(key)!.add(row.command);
  }
  const registrationErrors = bindings
    .filter((row) => commands.some((command) => command.id === row.command) && statusError?.(row))
    .map(
      (row) =>
        `${commands.find((command) => command.id === row.command)?.title ?? row.command} (${inputLabel(row)}): ${statusError?.(row)}`,
    );
  useSettingsFeedback({
    error: registrationErrors.join('\n'),
    message: notice,
    onRetry,
    retryLabel: translate('settings.commandBindingList.retry'),
  });
  const root = useRef<HTMLDivElement>(null);
  useCommandListScroll(root);
  useCommandCellFollow(root, followCommands);
  const restore = useRef<(() => void) | null>(null);
  const rememberPosition = (target?: HTMLElement | null) => {
    const scroll = root.current?.closest<HTMLElement>('.applet-settings-panel, .settings-body');
    const trigger =
      target ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const commandId =
      trigger?.closest<HTMLElement>('[data-shortcut-command]')?.dataset.shortcutCommand;
    const bindingId = trigger?.closest<HTMLElement>('[data-binding-id]')?.dataset.bindingId;
    const addId = trigger?.dataset.bindingAdd;
    const action = [
      'applet-shortcut-edit',
      'binding-condition-edit',
      'binding-order',
      'binding-delete',
    ].find((name) => trigger?.classList.contains(name));
    const selector =
      trigger?.classList.contains('applet-shortcut-add') && commandId
        ? `[data-shortcut-command="${CSS.escape(commandId)}"] .applet-shortcut-add${addId ? `[data-binding-add="${CSS.escape(addId)}"]` : ''}`
        : bindingId && action
          ? `[data-binding-id="${CSS.escape(bindingId)}"] .${action}`
          : undefined;
    const top = scroll?.scrollTop ?? 0;
    const left = scroll?.scrollLeft ?? 0;
    const tableLeft = root.current?.scrollLeft ?? 0;
    restore.current = () => {
      if (scroll) {
        scroll.scrollTop = top;
        scroll.scrollLeft = left;
      }
      if (root.current) root.current.scrollLeft = tableLeft;
      const restored = selector ? root.current?.querySelector<HTMLElement>(selector) : trigger;
      if (restored?.isConnected) restored.focus({ preventScroll: true });
      else root.current?.focus({ preventScroll: true });
    };
  };
  const open = (command: UiCommand, row?: R, adding = !row) => {
    rememberPosition();
    setNotice('');
    setEditing({
      title: command.title,
      ownerTitle: command.extensionId ? command.extension : undefined,
      adding,
      row: structuredClone(row ?? newBinding(command)),
    });
  };
  useLayoutEffect(() => {
    if (!editing && !orderKey && !deleting && restore.current) {
      restore.current();
      restore.current = null;
    }
  }, [editing, orderKey, deleting, bindings]);
  const apply = (row: R) => {
    if (!editing) return;
    applyBinding(row, editing.adding ? undefined : editing.row);
    setNotice(
      translate(
        editing.adding
          ? 'settings.commandBindingList.added'
          : 'settings.commandBindingList.updated',
        { title: editing.title },
      ),
    );
    setEditing(null);
  };
  const rowActions = (command: UiCommand, row: R | null, multiple: boolean) =>
    row &&
    !readOnly?.(row) && (
      <div
        className="binding-row-actions"
        role="group"
        aria-label={translate('settings.commandBindingList.actionsForInput', {
          title: command.title,
          value: inputLabel(row),
        })}
      >
        <button
          type="button"
          className="settings-list-icon applet-shortcut-edit"
          title={translate('settings.commandBindingList.edit')}
          aria-label={translate('settings.commandBindingList.editInput', {
            title: command.title,
            value: inputLabel(row),
          })}
          onClick={() => open(command, row)}
        >
          <ListIcon kind="pencil" />
        </button>
        <button
          type="button"
          className={`settings-list-icon binding-order${multiple ? ' accent-action' : ''}`}
          title={translate('settings.commandBindingList.inputOrder', {
            inputName,
            value: multiple ? translate('settings.commandBindingList.multiple') : '',
          })}
          aria-label={translate('settings.commandBindingList.executionOrder', {
            title: command.title,
            value: inputLabel(row),
          })}
          aria-description={
            multiple
              ? translate('settings.commandBindingList.multipleHint', { inputName })
              : undefined
          }
          data-multiple-commands={multiple}
          onClick={() => {
            rememberPosition();
            setOrderKey(row);
          }}
        >
          <ListIcon kind="order" />
        </button>
        <button
          type="button"
          className="settings-list-icon settings-list-delete binding-delete"
          data-testid={`binding-delete:${row.id}`}
          title={translate('settings.commandBindingList.delete')}
          aria-label={translate('settings.commandBindingList.deleteBinding', {
            title: command.title,
            value: inputLabel(row),
          })}
          onClick={() => {
            rememberPosition();
            setNotice('');
            setDeleting({
              row: structuredClone(row),
              title: command.title,
              description: `${inputLabel(row)} · ${conditionLabel(row, command)}`,
            });
          }}
        >
          <ListIcon kind="delete" />
        </button>
      </div>
    );
  const addButtons = (command: UiCommand) =>
    addOptions && (
      <div
        className="binding-add-options"
        role="group"
        aria-label={translate('settings.commandBindingList.addForCommand', {
          title: command.title,
        })}
      >
        {addOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            className="applet-shortcut-add settings-list-icon"
            data-binding-add={option.id}
            data-testid={`binding-add:${command.id}:${option.id}`}
            title={option.title}
            aria-label={option.label(command)}
            onClick={() => open(command, option.create(command), true)}
          >
            {option.icon}
            <span className="binding-add-plus" aria-hidden="true">
              +
            </span>
          </button>
        ))}
      </div>
    );
  const table = (items: typeof commands) => (
    <SettingsTable
      framed
      className={`applet-shortcut-overview command-binding-table${separateConditions ? ' binding-conditions-layout' : ''}${followCommands ? ' binding-command-follow' : ''}`}
    >
      <thead>
        <tr>
          <th>{translate('settings.commandBindingList.command')}</th>
          <th className={separateConditions ? 'binding-gesture-heading' : undefined}>
            {translate(
              separateConditions
                ? 'settings.commandBindingList.gesture'
                : 'settings.commandBindingList.binding',
            )}
          </th>
          {separateConditions && (
            <th className="binding-condition-heading">
              {translate('settings.commandBindingList.when')}
            </th>
          )}
          {!separateConditions && (
            <th className="binding-actions-heading">
              {translate('settings.commandBindingList.actions')}
            </th>
          )}
          {navigation && showNavigation && (
            <th className="command-settings-heading">
              {translate('settings.commandBindingList.navigation')}
            </th>
          )}
        </tr>
      </thead>
      {items.map((command) => {
        const assigned = bindings.filter((row) => row.command === command.id);
        return (
          <tbody key={command.id} data-shortcut-command={command.id}>
            {(assigned.length ? assigned : [null]).map((row, index) => {
              const multiple = row ? commandsByInput.get(inputKey(row))!.size > 1 : false;
              return (
                <tr key={index === 0 ? 'command' : row!.id} data-binding-id={row?.id}>
                  {index === 0 && (
                    <td rowSpan={Math.max(1, assigned.length)} className="binding-command-cell">
                      <div
                        className="binding-command-summary"
                        data-testid={`binding-command-summary:${command.id}`}
                      >
                        <div className="applet-shortcut-command">
                          <div className="binding-command-heading">
                            {showProvider && (
                              <CommandProviderBadge
                                command={command}
                                selected={selectedProvider}
                                onSelect={onProviderFilter}
                              />
                            )}
                            <strong className="command-title">{command.title}</strong>
                            <SettingsDescriptionIcon
                              title={command.title}
                              description={command.description}
                              testId={`command-description:${command.id}`}
                            />
                            <CommandPrivacy published={command.automation} />
                          </div>
                          {!addOptions && (
                            <button
                              className="applet-shortcut-add"
                              aria-label={translate('settings.commandBindingList.addForCommand', {
                                title: command.title,
                              })}
                              title={translate('settings.commandBindingList.addBinding')}
                              onClick={() => open(command)}
                            >
                              ＋
                            </button>
                          )}
                        </div>
                        <small className="command-id">{command.id}</small>
                        {!command.available && (
                          <small>{translate('settings.commandBindingList.unavailable')}</small>
                        )}
                        {addButtons(command)}
                      </div>
                    </td>
                  )}
                  <td className="binding-value-cell">
                    <div className="binding-assignment-content">
                      {row ? (
                        <div className="applet-shortcut-value">
                          {onInputFilter ? (
                            <button
                              type="button"
                              className={`binding-input-filter${multiple ? ' has-multiple-commands' : ''}`}
                              aria-label={translate('settings.commandBindingList.filterInput', {
                                value: inputLabel(row),
                              })}
                              title={translate('settings.commandBindingList.filterMultiple', {
                                value: inputLabel(row),
                                value2: multiple
                                  ? translate('settings.commandBindingList.multiple')
                                  : '',
                              })}
                              aria-pressed={selectedInput === inputKey(row)}
                              aria-description={
                                multiple
                                  ? translate('settings.commandBindingList.multipleHint', {
                                      inputName: inputName,
                                    })
                                  : undefined
                              }
                              data-multiple-commands={multiple}
                              onClick={(event) =>
                                onInputFilter(
                                  {
                                    key: inputKey(row),
                                    label: inputLabel(row),
                                    content: renderInput?.(row),
                                  },
                                  event.currentTarget,
                                )
                              }
                            >
                              {renderInput ? renderInput(row) : <kbd>{inputLabel(row)}</kbd>}
                            </button>
                          ) : renderInput ? (
                            renderInput(row)
                          ) : (
                            <kbd>{inputLabel(row)}</kbd>
                          )}
                          {!separateConditions && <span>{conditionLabel(row, command)}</span>}
                          {!row.enabled && (
                            <small>{translate('settings.commandBindingList.disabled')}</small>
                          )}
                          {readOnly?.(row) && <small>{readOnly(row)}</small>}
                        </div>
                      ) : (
                        <span className="muted">
                          {translate('settings.commandBindingList.unassigned')}
                        </span>
                      )}
                    </div>
                  </td>
                  {separateConditions && (
                    <td className="binding-condition-cell">
                      <div className="binding-condition-content">
                        {row ? (
                          readOnly?.(row) ? (
                            <span>{conditionLabel(row, command)}</span>
                          ) : (
                            <button
                              type="button"
                              className="binding-condition-edit"
                              data-testid={`binding-condition-edit:${row.id}`}
                              title={translate('settings.commandBindingList.edit')}
                              aria-label={translate('settings.commandBindingList.editCondition', {
                                title: command.title,
                                value: inputLabel(row),
                              })}
                              onClick={() => open(command, row)}
                            >
                              {conditionLabel(row, command)}
                            </button>
                          )
                        ) : (
                          <span className="muted">—</span>
                        )}
                        {rowActions(command, row, multiple)}
                      </div>
                    </td>
                  )}
                  {!separateConditions && (
                    <td className="binding-actions-cell">{rowActions(command, row, multiple)}</td>
                  )}
                  {navigation && showNavigation && index === 0 && (
                    <td className="command-settings-cell" rowSpan={Math.max(1, assigned.length)}>
                      <CommandSettingsLinks command={command} />
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        );
      })}
    </SettingsTable>
  );
  return (
    <div className="shortcut-command-list" ref={root} tabIndex={-1}>
      {commands.length ? (
        table(commands)
      ) : (
        <p className="muted">{translate('settings.commandBindingList.empty')}</p>
      )}
      {orderKey !== null && renderOrder(orderKey, () => setOrderKey(null))}
      {editing && renderEditor(editing, apply, () => setEditing(null))}
      {deleting && (
        <SettingsDialog
          title={translate('settings.commandBindingList.deleteTitle')}
          description={translate('settings.commandBindingList.deleteHint')}
          applyLabel={translate('settings.commandBindingList.delete')}
          onClose={() => setDeleting(null)}
          onApply={async () => {
            const current = bindings.find((row) => row.id === deleting.row.id);
            if (
              !current ||
              readOnly?.(current) ||
              JSON.stringify(current) !== JSON.stringify(deleting.row)
            )
              throw Error(translate('settings.commandBindingList.deleteChanged'));
            rememberPosition(
              root.current?.querySelector<HTMLButtonElement>(
                `[data-shortcut-command="${CSS.escape(deleting.row.command)}"] .applet-shortcut-add`,
              ),
            );
            deleteBinding(deleting.row);
            setNotice(translate('settings.commandBindingList.deleted', { title: deleting.title }));
          }}
        >
          <p>{deleting.title}</p>
          <p>{deleting.description}</p>
        </SettingsDialog>
      )}
    </div>
  );
}
