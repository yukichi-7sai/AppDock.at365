import { useContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ListIcon } from './SettingsListTable';
import { useSettingsFeedback } from './SettingsStatus';
import type { UiCommand } from '../../shared/commands';
import {
  CommandPublication,
  CommandSettingsLinks,
  CommandSettingsNavigation,
} from './CommandSettingsNavigation';
export type BindingEdit<R> = { row: R; title: string; ownerTitle?: string; adding: boolean };
export function CommandBindingList<R extends { id: string; command: string; enabled: boolean }>({
  commands,
  bindings,
  showProvider = false,
  statusError,
  onRetry,
  inputName,
  inputKey,
  inputLabel,
  conditionLabel,
  newBinding,
  applyBinding,
  deleteBinding,
  renderEditor,
  renderOrder,
}: {
  commands: UiCommand[];
  bindings: R[];
  showProvider?: boolean;
  statusError?(row: R): string | undefined;
  onRetry?(): void;
  inputName: string;
  inputKey(row: R): string;
  inputLabel(row: R): string;
  conditionLabel(row: R, command: UiCommand): string;
  newBinding(command: UiCommand): R;
  applyBinding(row: R, original?: R): void;
  deleteBinding(row: R): void;
  renderEditor(edit: BindingEdit<R>, apply: (row: R) => void, close: () => void): ReactNode;
  renderOrder(row: R, close: () => void): ReactNode;
}) {
  const [orderKey, setOrderKey] = useState<R | null>(null);
  const navigation = useContext(CommandSettingsNavigation);
  const [editing, setEditing] = useState<BindingEdit<R> | null>(null);
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
    retryLabel: '入力を再試行',
  });
  const root = useRef<HTMLDivElement>(null);
  const restore = useRef<(() => void) | null>(null);
  const rememberPosition = (target?: HTMLElement | null) => {
    const scroll = root.current?.closest<HTMLElement>('.applet-settings-panel, .settings-body');
    const trigger =
      target ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const commandId =
      trigger?.closest<HTMLElement>('[data-shortcut-command]')?.dataset.shortcutCommand;
    const bindingId = trigger?.closest<HTMLElement>('[data-binding-id]')?.dataset.bindingId;
    const action = ['applet-shortcut-edit', 'binding-order', 'binding-delete'].find((name) =>
      trigger?.classList.contains(name),
    );
    const selector =
      trigger?.classList.contains('applet-shortcut-add') && commandId
        ? `[data-shortcut-command="${CSS.escape(commandId)}"] .applet-shortcut-add`
        : bindingId && action
          ? `[data-binding-id="${CSS.escape(bindingId)}"] .${action}`
          : undefined;
    const top = scroll?.scrollTop ?? 0;
    const left = scroll?.scrollLeft ?? 0;
    restore.current = () => {
      if (scroll) {
        scroll.scrollTop = top;
        scroll.scrollLeft = left;
      }
      const restored = selector ? root.current?.querySelector<HTMLElement>(selector) : trigger;
      if (restored?.isConnected) restored.focus({ preventScroll: true });
      else root.current?.focus({ preventScroll: true });
    };
  };
  const open = (command: UiCommand, row?: R) => {
    rememberPosition();
    setNotice('');
    setEditing({
      title: command.title,
      ownerTitle: command.extensionId ? command.extension : undefined,
      adding: !row,
      row: structuredClone(row ?? newBinding(command)),
    });
  };
  useLayoutEffect(() => {
    if (!editing && !orderKey && restore.current) {
      restore.current();
      restore.current = null;
    }
  }, [editing, orderKey, bindings]);
  const apply = (row: R) => {
    if (!editing) return;
    applyBinding(row, editing.adding ? undefined : editing.row);
    setNotice(`${editing.title}の割り当てを${editing.adding ? '追加' : '変更'}しました。`);
    setEditing(null);
  };
  const table = (items: typeof commands) => (
    <table className="applet-shortcut-overview command-binding-table">
      <thead>
        <tr>
          <th>コマンド</th>
          <th>割り当て</th>
          <th className="binding-actions-heading">操作</th>
          {navigation && <th className="command-settings-heading">移動</th>}
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
                      <div className="applet-shortcut-command">
                        <strong className="command-title">
                          {command.title}
                          <CommandPublication published={command.automation} />
                        </strong>
                        <button
                          className="applet-shortcut-add"
                          aria-label={`${command.title}に割り当てを追加`}
                          title="割り当てを追加"
                          onClick={() => open(command)}
                        >
                          ＋
                        </button>
                      </div>
                      {command.description && <small>{command.description}</small>}
                      <small className="command-id">{command.id}</small>
                      {showProvider && (
                        <small className="shortcut-provider">
                          {command.extension}
                          {command.hidden ? ' · 互換コマンド' : ''}
                        </small>
                      )}
                      {!command.available && <small>現在利用できません</small>}
                    </td>
                  )}
                  <td className="binding-value-cell">
                    {row ? (
                      <div className="applet-shortcut-value">
                        <kbd>{inputLabel(row)}</kbd>
                        <span>{conditionLabel(row, command)}</span>
                        {!row.enabled && <small>無効</small>}
                      </div>
                    ) : (
                      <span className="muted">未割り当て</span>
                    )}
                  </td>
                  <td className="binding-actions-cell">
                    {row && (
                      <div
                        className="binding-row-actions"
                        role="group"
                        aria-label={`${command.title}の${inputLabel(row)}の操作`}
                      >
                        <button
                          type="button"
                          className="settings-list-icon applet-shortcut-edit"
                          title="編集"
                          aria-label={`${command.title}の${inputLabel(row)}を編集`}
                          onClick={() => open(command, row)}
                        >
                          <ListIcon kind="pencil" />
                        </button>
                        <button
                          type="button"
                          className={`settings-list-icon binding-order${multiple ? ' accent-action' : ''}`}
                          title={`この${inputName}の実行順${multiple ? '（複数のコマンド）' : ''}`}
                          aria-label={`${command.title}の${inputLabel(row)}の実行順`}
                          aria-description={
                            multiple
                              ? `この${inputName}に複数のコマンドが割り当てられています。`
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
                          title="削除"
                          aria-label={`${command.title}の${inputLabel(row)}の割り当てを削除`}
                          onClick={() => {
                            rememberPosition(
                              root.current?.querySelector<HTMLButtonElement>(
                                `[data-shortcut-command="${CSS.escape(command.id)}"] .applet-shortcut-add`,
                              ),
                            );
                            deleteBinding(row);
                            setNotice(`${command.title}の割り当てを削除しました。`);
                          }}
                        >
                          <ListIcon kind="delete" />
                        </button>
                      </div>
                    )}
                  </td>
                  {navigation && index === 0 && (
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
    </table>
  );
  return (
    <div className="shortcut-command-list" ref={root} tabIndex={-1}>
      {commands.length ? table(commands) : <p className="muted">表示するコマンドはありません。</p>}
      {orderKey !== null && renderOrder(orderKey, () => setOrderKey(null))}
      {editing && renderEditor(editing, apply, () => setEditing(null))}
    </div>
  );
}
