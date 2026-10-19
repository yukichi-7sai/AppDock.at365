import { SettingsHint } from './SettingsHint';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { BindingActions } from './BindingActions';
import type { UiCommand } from '../../shared/commands';
export type BindingEdit<R> = { row: R; title: string; ownerTitle?: string; adding: boolean };
export function CommandBindingList<R extends { id: string; command: string; enabled: boolean }>({
  commands,
  bindings,
  showProvider = false,
  statusError,
  onRetry,
  inputName,
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
  inputLabel(row: R): string;
  conditionLabel(row: R, command: UiCommand): string;
  newBinding(command: UiCommand): R;
  applyBinding(row: R, original?: R): void;
  deleteBinding(row: R): void;
  renderEditor(edit: BindingEdit<R>, apply: (row: R) => void, close: () => void): ReactNode;
  renderOrder(row: R, close: () => void): ReactNode;
}) {
  const [orderKey, setOrderKey] = useState<R | null>(null);
  const [editing, setEditing] = useState<BindingEdit<R> | null>(null);
  const [notice, setNotice] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const restore = useRef<(() => void) | null>(null);
  const rememberPosition = (target?: HTMLElement | null) => {
    const scroll = root.current?.closest<HTMLElement>('.applet-settings-panel, .settings-body');
    const trigger =
      target ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const top = scroll?.scrollTop ?? 0;
    const left = scroll?.scrollLeft ?? 0;
    restore.current = () => {
      if (scroll) {
        scroll.scrollTop = top;
        scroll.scrollLeft = left;
      }
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
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
    <table className="applet-shortcut-overview">
      <thead>
        <tr>
          <th>コマンド</th>
          <th>割り当て</th>
        </tr>
      </thead>
      <tbody>
        {items.map((command) => {
          const assigned = bindings.filter((row) => row.command === command.id);
          return (
            <tr key={command.id} data-shortcut-command={command.id}>
              <td>
                <div className="applet-shortcut-command">
                  <strong>{command.title}</strong>
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
              <td>
                {assigned.length ? (
                  assigned.map((row) => (
                    <div className="applet-shortcut-pair" key={row.id} data-binding-id={row.id}>
                      <button
                        className="applet-shortcut-edit"
                        aria-label={`${command.title}の${inputLabel(row)}を編集`}
                        onClick={() => open(command, row)}
                      >
                        <kbd>{inputLabel(row)}</kbd>
                        <span>{conditionLabel(row, command)}</span>
                        {!row.enabled && <small>無効</small>}
                        {statusError?.(row) && (
                          <small role="alert" className="shortcut-conflict">
                            {statusError(row)}
                          </small>
                        )}
                      </button>
                      {statusError?.(row) && (
                        <button className="text-button" onClick={onRetry}>
                          入力を再試行
                        </button>
                      )}
                      <BindingActions
                        label={`${command.title}の${inputLabel(row)}のその他の操作`}
                        removalKind="binding"
                        confirmDelete={false}
                        extraActions={[
                          { title: '編集', onClick: () => open(command, row) },
                          {
                            title: `この${inputName}の実行順…`,
                            onClick: () => {
                              rememberPosition();
                              setOrderKey(row);
                            },
                          },
                        ]}
                        onDelete={() => {
                          rememberPosition(
                            root.current?.querySelector<HTMLButtonElement>(
                              `[data-shortcut-command="${CSS.escape(command.id)}"] .applet-shortcut-add`,
                            ),
                          );
                          deleteBinding(row);
                          setNotice(`${command.title}の割り当てを削除しました。`);
                        }}
                      />
                    </div>
                  ))
                ) : (
                  <span className="muted">未割り当て</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  return (
    <div className="shortcut-command-list" ref={root} tabIndex={-1}>
      <SettingsHint as="div" className="applet-shortcut-notice">
        {`${inputName}と条件をクリックして編集・＋で割り当てを追加`}
      </SettingsHint>
      <span className="sr-only" role="status">
        {notice}
      </span>
      {commands.length ? table(commands) : <p className="muted">表示するコマンドはありません。</p>}
      {orderKey !== null && renderOrder(orderKey, () => setOrderKey(null))}
      {editing && renderEditor(editing, apply, () => setEditing(null))}
    </div>
  );
}
