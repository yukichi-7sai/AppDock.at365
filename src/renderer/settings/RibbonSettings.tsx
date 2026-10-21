import { SettingsHint } from '../settings-ui/SettingsHint';
import { useState } from 'react';
import type { ExtensionSnapshot, Settings } from '../../shared/contracts';
import { ribbonItems, type RibbonItem } from '../../shared/applet-pages';
import {
  ribbonParent,
  ribbonPlacement,
  ribbonRoots,
  ribbonRetainedIds,
  editRibbon,
  ribbonPresentation,
} from '../../shared/ribbon-layout';
import {
  defaultRibbonRightClickCommand,
  type RibbonCommandButton,
  type RibbonGroup,
  type RibbonPlacement,
} from '../../shared/ribbon';
import type { UiCommand } from '../../shared/commands';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { ListIcon } from '../settings-ui/SettingsListTable';
import { SettingsColorPicker } from '../settings-ui/SettingsColorPicker';
import { SettingsInput } from '../settings-ui/SettingsInput';
import { SettingsSection, SettingsField } from '../settings-ui/SettingsSections';
import { RibbonIconPicker } from '../settings-ui/RibbonIconPicker';
import { RegisteredImageInput } from '../settings-ui/RegisteredImagePicker';
import type { RegisteredImageRef } from '../../shared/registered-images';
import { CommandPicker } from '../settings-ui/CommandPicker';

export function RibbonSettings({
  settings,
  extensions,
  commands,
  onEdit,
}: {
  settings: Settings;
  extensions: ExtensionSnapshot[];
  commands: UiCommand[];
  onEdit(operation: unknown, before: Settings['ribbon']): Promise<unknown>;
}) {
  const layout = settings.ribbon;
  const groups = layout.groups ?? [];
  const [dragged, setDragged] = useState<string | null>(null);
  const [colorValid, setColorValid] = useState(true);
  const [picker, setPicker] = useState<'rightClick' | 'button'>();
  const [buttonDialog, setButtonDialog] = useState<{
    button: RibbonCommandButton;
    adding: boolean;
    placement: RibbonPlacement;
    before: string;
    nameEdited: boolean;
  }>();
  const [separatorDialog, setSeparatorDialog] = useState<{
    id: string;
    title: string;
    before: string;
  }>();
  const [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  const [dialog, setDialog] = useState<{
    group: RibbonGroup;
    adding: boolean;
    placement: RibbonPlacement;
    before: string;
  }>();
  const [itemDialog, setItemDialog] = useState<{
    id: string;
    title: string;
    originalTitle: string;
    image?: RegisteredImageRef | null;
    iconOnly: boolean;
    before: string;
  }>();
  const [confirmation, setConfirmation] = useState<
    { before: string } & (
      | { kind: 'button'; button: RibbonCommandButton }
      | { kind: 'group'; group: RibbonGroup }
      | { kind: 'missing'; missing: { id: string; title: string } }
    )
  >();
  const catalog = ribbonItems(extensions, layout.separators, groups, layout.buttons);
  const commandTitle = (id: string) => commands.find((c) => c.id === id)?.title ?? id;
  const rightClickCommand = layout.rightClickCommand ?? defaultRibbonRightClickCommand;
  const items = [
    ...catalog,
    ...ribbonRetainedIds(layout, catalog).map((id) => ({
      id,
      title: layout.itemOverrides?.[id]?.lastKnownTitle || id,
      icon: 'extensions' as const,
    })),
  ];
  const roots = ribbonRoots(layout, items);
  const apply = async (operation: unknown) => {
    if (pending) return;
    editRibbon(layout, catalog, operation);
    setPending(true);
    setError('');
    try {
      await onEdit(operation, layout);
    } finally {
      setPending(false);
    }
  };
  const run = (operation: unknown) => {
    void apply(operation).catch((e) => setError(String(e)));
  };
  const moveTo = (
    id: string,
    parentId: string | null,
    placement?: RibbonPlacement,
    beforeId?: string | null,
  ) => {
    const previous = ribbonParent(layout, id);
    if (
      parentId === null &&
      beforeId === undefined &&
      previous &&
      ribbonPlacement(layout, previous.id, items) === placement
    ) {
      const siblings = roots.filter(
        (item) => ribbonPlacement(layout, item.id, items) === placement,
      );
      beforeId = siblings[siblings.findIndex((item) => item.id === previous.id) + 1]?.id ?? null;
    }
    run({
      kind: 'moveItem',
      id,
      parentId,
      beforeId: beforeId ?? null,
      ...(parentId ? {} : { placement }),
    });
  };
  const move = (id: string, target: string) => {
    if (id === target) return;
    const parentId = ribbonParent(layout, target)?.id ?? null;
    const placement = ribbonPlacement(layout, target, items);
    const siblings = parentId
      ? groups.find((g) => g.id === parentId)!.children
      : roots.filter((i) => ribbonPlacement(layout, i.id, items) === placement).map((i) => i.id);
    const from = siblings.indexOf(id),
      to = siblings.indexOf(target);
    moveTo(id, parentId, placement, from >= 0 && from < to ? (siblings[to + 1] ?? null) : target);
  };
  const drop = (event: React.DragEvent, work: (id: string) => void) => {
    event.preventDefault();
    event.stopPropagation();
    const id = event.dataTransfer.getData('text/plain') || dragged;
    if (id && items.some((item) => item.id === id)) work(id);
    setDragged(null);
  };
  const open = (group: RibbonGroup | undefined, placement: RibbonPlacement) => {
    setColorValid(true);
    setDialog({
      group: group
        ? structuredClone(group)
        : {
            id: `group:${crypto.randomUUID()}`,
            title: '',
            icon: 'folder',
            expansion: 'persistent',
            children: [],
          },
      adding: !group,
      placement,
      before: JSON.stringify(layout),
    });
  };
  const row = (entry: RibbonItem, index: number, siblings: RibbonItem[]) => {
    const item = { ...entry, ...ribbonPresentation(layout, entry) };
    const { command, group } = item;
    const parent = ribbonParent(layout, item.id);
    const missing = !catalog.some((value) => value.id === item.id);
    return (
      <div key={item.id} className="ribbon-setting-entry">
        <div
          className={`ribbon-setting-row ${item.kind === 'separator' ? 'separator-setting-row' : ''}`}
          data-ribbon-setting={item.id}
          draggable={!pending}
          onDragStart={(event) => {
            setDragged(item.id);
            event.dataTransfer.setData('text/plain', item.id);
            event.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => {
            if (dragged) e.preventDefault();
          }}
          onDrop={(e) =>
            drop(e, (id) =>
              item.group && !groups.some((g) => g.id === id)
                ? moveTo(id, item.id)
                : move(id, item.id),
            )
          }
          onDragEnd={() => setDragged(null)}
        >
          <span className="drag-handle" aria-hidden="true">
            ⠿
          </span>
          <label>
            <input
              type="checkbox"
              disabled={pending || missing}
              aria-label={`${item.title}をリボンに表示`}
              checked={!layout.hidden.includes(item.id)}
              onChange={(e) =>
                run({ kind: 'update', id: item.id, changes: { visible: e.target.checked } })
              }
            />
            <span>
              {item.title}
              <small>
                {missing
                  ? '登録元がありません。配置を保持しています。'
                  : item.group
                    ? `${item.group.expansion === 'persistent' ? '持続的' : '一時的'}・${item.group.children.length}項目`
                    : item.command
                      ? `${commandTitle(item.command.commandId)}${commands.some((c) => c.id === item.command!.commandId && c.available) ? '' : '・現在利用できません'}`
                      : item.kind === 'separator'
                        ? '区切り線'
                        : (item.extensionId ?? 'AppDock')}
              </small>
            </span>
          </label>
          <div className="ribbon-row-controls">
            <select
              aria-label={`${item.title}の配置`}
              disabled={pending}
              value={parent?.id ?? ribbonPlacement(layout, item.id, items)}
              onChange={(e) =>
                e.target.value.startsWith('group:')
                  ? moveTo(item.id, e.target.value)
                  : moveTo(item.id, null, e.target.value as RibbonPlacement)
              }
            >
              <option value="top">上寄せ</option>
              <option value="bottom">下寄せ</option>
              {item.kind !== 'group' &&
                groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.title || 'グループ'}
                  </option>
                ))}
            </select>
            <button
              aria-label={`${item.title}を上へ`}
              className="settings-list-icon accent-action"
              disabled={pending || index === 0}
              onClick={() => move(item.id, siblings[index - 1].id)}
            >
              ↑
            </button>
            <button
              aria-label={`${item.title}を下へ`}
              className="settings-list-icon accent-action"
              disabled={pending || index === siblings.length - 1}
              onClick={() => move(item.id, siblings[index + 1].id)}
            >
              ↓
            </button>
            {
              <button
                className="settings-list-icon"
                title="編集"
                disabled={pending}
                aria-label={`${item.title}を編集`}
                onClick={() =>
                  item.kind === 'separator'
                    ? setSeparatorDialog({
                        id: item.id,
                        title: layout.separatorTitles?.[item.id] ?? '',
                        before: JSON.stringify(layout),
                      })
                    : item.command
                      ? setButtonDialog({
                          button: structuredClone(item.command),
                          adding: false,
                          placement: ribbonPlacement(layout, item.id, items),
                          before: JSON.stringify(layout),
                          nameEdited: true,
                        })
                      : item.group
                        ? open(item.group, ribbonPlacement(layout, item.id, items))
                        : setItemDialog({
                            id: item.id,
                            title: layout.itemOverrides?.[item.id]?.title ?? '',
                            originalTitle: entry.title,
                            image: layout.itemOverrides?.[item.id]?.image,
                            iconOnly: item.iconOnly,
                            before: JSON.stringify(layout),
                          })
                }
              >
                <ListIcon kind="edit" />
              </button>
            }
            {item.kind === 'separator' ? (
              <button
                className="settings-list-icon settings-list-delete"
                title="削除"
                disabled={pending}
                aria-label={`${item.title}を削除`}
                onClick={() => run({ kind: 'removeSeparator', id: item.id })}
              >
                <ListIcon kind="delete" />
              </button>
            ) : command ? (
              <button
                className="settings-list-icon settings-list-delete"
                title="削除"
                disabled={pending}
                aria-label={`${item.title}を削除`}
                onClick={() =>
                  setConfirmation({
                    kind: 'button',
                    button: command,
                    before: JSON.stringify(layout),
                  })
                }
              >
                <ListIcon kind="delete" />
              </button>
            ) : group ? (
              <button
                className="settings-list-icon settings-list-delete"
                title="グループを解除"
                disabled={pending}
                aria-label={`${item.title}のグループを解除`}
                onClick={() =>
                  setConfirmation({
                    kind: 'group',
                    group,
                    before: JSON.stringify(layout),
                  })
                }
              >
                <ListIcon kind="delete" />
              </button>
            ) : missing ? (
              <button
                className="settings-list-icon settings-list-delete"
                title="設定から削除"
                disabled={pending}
                aria-label={`${item.title}を設定から削除`}
                onClick={() =>
                  setConfirmation({
                    kind: 'missing',
                    missing: { id: item.id, title: item.title },
                    before: JSON.stringify(layout),
                  })
                }
              >
                <ListIcon kind="delete" />
              </button>
            ) : (
              <span className="ribbon-action-placeholder" aria-hidden="true" />
            )}
          </div>
        </div>
        {item.group && (
          <div
            className="ribbon-setting-children"
            role="group"
            aria-label={`${item.title}の項目`}
            onDragOver={(e) => {
              if (dragged && !groups.some((g) => g.id === dragged)) e.preventDefault();
            }}
            onDrop={(e) => drop(e, (id) => moveTo(id, item.id))}
          >
            {(() => {
              const children = item.group!.children.flatMap((id) =>
                items.filter((i) => i.id === id),
              );
              return children.length ? (
                children.map((child, i) => row(child, i, children))
              ) : (
                <p className="muted">
                  ボタンの配置からこのグループを選ぶか、ここへドラッグしてください。
                </p>
              );
            })()}
          </div>
        )}
      </div>
    );
  };
  return (
    <div className="settings-sections ribbon-settings" aria-label="リボン設定">
      <SettingsSection title="動作設定" collapsible>
        <SettingsField
          title="右クリックのコマンド"
          hint="リボンを右クリックしたときに実行するコマンドです。"
          {...settingAnchor('ribbon', 'rightClickCommand')}
        >
          <button
            type="button"
            className="secondary"
            disabled={pending}
            onClick={() => setPicker('rightClick')}
            aria-label="右クリックのコマンドを選択"
          >
            {commandTitle(rightClickCommand)}
          </button>
          {!commands.some((c) => c.id === rightClickCommand && c.available) && (
            <small>現在利用できません。</small>
          )}
        </SettingsField>
      </SettingsSection>
      <SettingsSection title="リボン編集" {...settingAnchor('ribbon', 'ribbon')}>
        <SettingsHint>
          設定ボタンを非表示にしても、トレイの「設定…」や「設定を開く」コマンドから戻れます。
        </SettingsHint>
        {error && <p role="alert">{error}</p>}
        {(['top', 'bottom'] as const).map((position) => {
          const title = position === 'top' ? '上寄せ' : '下寄せ';
          const siblings = roots.filter(
            (item) => ribbonPlacement(layout, item.id, items) === position,
          );
          return (
            <section
              key={position}
              className="ribbon-placement"
              aria-label={`${title}のリボン設定`}
              onDragOver={(e) => {
                if (dragged) e.preventDefault();
              }}
              onDrop={(e) => drop(e, (id) => moveTo(id, null, position))}
            >
              <div className="ribbon-group-heading">
                <h4>{title}</h4>
                <div className="ribbon-setting-actions">
                  <button
                    className="secondary accent-action"
                    disabled={pending || (layout.buttons?.length ?? 0) >= 100}
                    onClick={() =>
                      setButtonDialog({
                        adding: true,
                        placement: position,
                        before: JSON.stringify(layout),
                        nameEdited: false,
                        button: {
                          id: `button:${crypto.randomUUID()}`,
                          title: '',
                          icon: 'extensions',
                          commandId: '',
                        },
                      })
                    }
                  >
                    ＋ コマンド
                  </button>
                  <button
                    className="secondary accent-action"
                    disabled={pending || groups.length >= 50}
                    onClick={() => open(undefined, position)}
                  >
                    ＋ グループ
                  </button>
                  <button
                    className="secondary accent-action"
                    disabled={pending || layout.separators.length >= 50}
                    onClick={() =>
                      run({
                        kind: 'addSeparator',
                        id: `separator:${crypto.randomUUID()}`,
                        placement: position,
                      })
                    }
                  >
                    ＋ 区切り線
                  </button>
                </div>
              </div>
              <div className="ribbon-setting-list">
                {siblings.map((item, i) => row(item, i, siblings))}
                {!siblings.length && (
                  <p className="empty">
                    ここに表示するボタンはありません。配置の選択やドラッグで移動できます。
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </SettingsSection>
      {confirmation && (
        <SettingsDialog
          title={
            confirmation.kind === 'button'
              ? 'コマンドボタンを削除'
              : confirmation.kind === 'group'
                ? 'グループを解除'
                : 'リボン項目を設定から削除'
          }
          onClose={() => setConfirmation(undefined)}
          applyLabel={confirmation.kind === 'group' ? '解除' : '削除'}
          onApply={async () => {
            if (confirmation.before !== JSON.stringify(layout))
              throw Error('リボン設定が変更されています。閉じてからやり直してください。');
            await apply(
              confirmation.kind === 'button'
                ? { kind: 'removeButton', id: confirmation.button.id }
                : confirmation.kind === 'group'
                  ? { kind: 'ungroup', id: confirmation.group.id }
                  : { kind: 'removeMissing', id: confirmation.missing.id },
            );
          }}
        >
          <p>
            {confirmation.kind === 'button'
              ? `「${confirmation.button.title}」の登録と配置を削除します。実行先のコマンドとその設定は残ります。`
              : confirmation.kind === 'group'
                ? `「${confirmation.group.title || 'グループ'}」の名前・アイコン・展開方法を削除します。中のボタンはグループの位置に戻り、順序・上下配置・非表示状態を引き継ぎます。`
                : `「${confirmation.missing.title}」の配置・グループ所属・表示名を設定から削除します。登録元を追加し直した場合は既定の表示に戻ります。`}
          </p>
        </SettingsDialog>
      )}
      {dialog && (
        <SettingsDialog
          title={dialog.adding ? 'リボングループを追加' : 'リボングループを編集'}
          onClose={() => setDialog(undefined)}
          valid={dialog.group.title.trim().length <= 80 && colorValid}
          applyLabel={dialog.adding ? '追加' : '適用'}
          footer="確定するとすぐに反映・保存されます。"
          onApply={async () => {
            if (dialog.before !== JSON.stringify(layout))
              throw Error('リボン設定が変更されています。閉じてから編集し直してください。');
            const {
              id,
              title,
              icon,
              expansion,
              iconOnly = false,
              color = null,
              image,
            } = dialog.group;
            await apply(
              dialog.adding
                ? {
                    kind: 'addGroup',
                    id,
                    title,
                    icon,
                    expansion,
                    iconOnly,
                    color,
                    ...(image !== undefined ? { image } : {}),
                    placement: dialog.placement,
                  }
                : {
                    kind: 'updateGroup',
                    id,
                    changes: {
                      title,
                      icon,
                      expansion,
                      iconOnly,
                      color,
                      ...(image !== undefined ? { image } : {}),
                    },
                  },
            );
          }}
        >
          <div className="ribbon-edit-fields">
            <label>
              グループ名
              <SettingsInput
                data-initial-focus
                value={dialog.group.title}
                maxLength={80}
                placeholder="空欄ならアイコンだけを表示"
                onChange={(e) =>
                  setDialog({ ...dialog, group: { ...dialog.group, title: e.target.value } })
                }
              />
            </label>
            <RibbonIconPicker
              key={dialog.group.id}
              label="グループのアイコン"
              preferImage={dialog.adding}
              value={dialog.group.icon}
              image={dialog.group.image}
              onImage={(image) => setDialog({ ...dialog, group: { ...dialog.group, image } })}
              onChange={(icon) => setDialog({ ...dialog, group: { ...dialog.group, icon } })}
            />
            <label className="ribbon-icon-only">
              <input
                type="checkbox"
                checked={!!dialog.group.iconOnly}
                onChange={(e) =>
                  setDialog({ ...dialog, group: { ...dialog.group, iconOnly: e.target.checked } })
                }
              />
              リボンにアイコンのみを表示する
            </label>
            <label>
              展開方法
              <select
                aria-label="展開方法"
                value={dialog.group.expansion}
                onChange={(e) =>
                  setDialog({
                    ...dialog,
                    group: {
                      ...dialog.group,
                      expansion: e.target.value as RibbonGroup['expansion'],
                    },
                  })
                }
              >
                <option value="persistent">持続的</option>
                <option value="temporary">一時的</option>
              </select>
            </label>
            <div>
              <strong>色</strong>
              <SettingsColorPicker
                value={dialog.group.color ?? null}
                allowNone
                onValidityChange={setColorValid}
                onChange={(color) =>
                  setDialog(
                    (current) => current && { ...current, group: { ...current.group, color } },
                  )
                }
              />
            </div>
          </div>
        </SettingsDialog>
      )}
      {itemDialog && (
        <SettingsDialog
          title="リボンボタンを編集"
          applyLabel="適用"
          valid={itemDialog.title.trim().length <= 80}
          footer="確定するとすぐに反映・保存されます。"
          onClose={() => setItemDialog(undefined)}
          onApply={async () => {
            if (itemDialog.before !== JSON.stringify(layout))
              throw Error('リボン設定が変更されています。閉じてから編集し直してください。');
            await apply({
              kind: 'updateItem',
              id: itemDialog.id,
              changes: {
                title: itemDialog.title,
                iconOnly: itemDialog.iconOnly,
                ...(itemDialog.image !== undefined ? { image: itemDialog.image } : {}),
              },
            });
          }}
        >
          <div className="ribbon-edit-fields">
            <label>
              ボタン名
              <SettingsInput
                data-initial-focus
                maxLength={80}
                value={itemDialog.title}
                placeholder={itemDialog.originalTitle}
                onChange={(e) => setItemDialog({ ...itemDialog, title: e.target.value })}
              />
            </label>
            <SettingsHint>
              空欄にすると登録元の名前を使います。変更はリボン内の表示だけに反映されます。
            </SettingsHint>
            <RegisteredImageInput
              label="リボンの画像"
              value={itemDialog.image}
              onChange={(image) => setItemDialog({ ...itemDialog, image })}
            />
            <label className="ribbon-icon-only">
              <input
                type="checkbox"
                checked={itemDialog.iconOnly}
                onChange={(e) => setItemDialog({ ...itemDialog, iconOnly: e.target.checked })}
              />
              リボンにアイコンのみを表示する
            </label>
          </div>
        </SettingsDialog>
      )}
      {separatorDialog && (
        <SettingsDialog
          title="セパレーターを編集"
          applyLabel="適用"
          valid={separatorDialog.title.trim().length <= 80}
          onClose={() => setSeparatorDialog(undefined)}
          onApply={async () => {
            if (separatorDialog.before !== JSON.stringify(layout))
              throw Error('リボン設定が変更されています。閉じてから編集し直してください。');
            await apply({
              kind: 'updateSeparator',
              id: separatorDialog.id,
              changes: { title: separatorDialog.title },
            });
          }}
        >
          <label>
            名前
            <SettingsInput
              data-initial-focus
              maxLength={80}
              value={separatorDialog.title}
              placeholder="空欄なら自動生成した名前を使います"
              onChange={(e) => setSeparatorDialog({ ...separatorDialog, title: e.target.value })}
            />
          </label>
        </SettingsDialog>
      )}
      {buttonDialog && !picker && (
        <SettingsDialog
          title={buttonDialog.adding ? 'コマンドボタンを追加' : 'コマンドボタンを編集'}
          applyLabel={buttonDialog.adding ? '追加' : '適用'}
          valid={
            !!buttonDialog.button.title.trim() &&
            buttonDialog.button.title.trim().length <= 80 &&
            !!buttonDialog.button.commandId
          }
          onClose={() => setButtonDialog(undefined)}
          onApply={async () => {
            if (buttonDialog.before !== JSON.stringify(layout))
              throw Error('リボン設定が変更されています。閉じてから編集し直してください。');
            const { id, ...changes } = buttonDialog.button;
            await apply(
              buttonDialog.adding
                ? { kind: 'addButton', id, ...changes, placement: buttonDialog.placement }
                : { kind: 'updateButton', id, changes },
            );
          }}
        >
          <div className="ribbon-edit-fields">
            <div className="ribbon-command-field">
              <span>コマンド</span>
              <button
                type="button"
                className="secondary"
                aria-label="実行コマンドを選択"
                onClick={() => setPicker('button')}
              >
                {buttonDialog.button.commandId
                  ? commandTitle(buttonDialog.button.commandId)
                  : 'コマンドを選択'}
              </button>
              {buttonDialog.button.commandId &&
                !commands.some((c) => c.id === buttonDialog.button.commandId && c.available) && (
                  <small>現在利用できません。</small>
                )}
            </div>
            <label>
              ボタン名
              <SettingsInput
                data-initial-focus
                maxLength={80}
                value={buttonDialog.button.title}
                onChange={(e) =>
                  setButtonDialog({
                    ...buttonDialog,
                    nameEdited: true,
                    button: { ...buttonDialog.button, title: e.target.value },
                  })
                }
              />
            </label>
            <RibbonIconPicker
              key={buttonDialog.button.id}
              label="ボタンのアイコン"
              preferImage={buttonDialog.adding}
              value={buttonDialog.button.icon}
              image={buttonDialog.button.image}
              onImage={(image) =>
                setButtonDialog({ ...buttonDialog, button: { ...buttonDialog.button, image } })
              }
              onChange={(icon) =>
                setButtonDialog({ ...buttonDialog, button: { ...buttonDialog.button, icon } })
              }
            />
            <label className="ribbon-icon-only">
              <input
                type="checkbox"
                checked={!!buttonDialog.button.iconOnly}
                onChange={(e) =>
                  setButtonDialog({
                    ...buttonDialog,
                    button: { ...buttonDialog.button, iconOnly: e.target.checked },
                  })
                }
              />
              リボンにアイコンのみを表示する
            </label>
          </div>
        </SettingsDialog>
      )}
      {picker && (
        <CommandPicker
          commands={commands.filter((c) => !c.hidden)}
          pins={settings.pinnedCommands}
          shortcuts={settings.shortcuts}
          onClose={() => setPicker(undefined)}
          onChoose={(command) => {
            if (picker === 'rightClick')
              run({ kind: 'setRightClickCommand', commandId: command.id });
            else
              setButtonDialog(
                (current) =>
                  current && {
                    ...current,
                    button: {
                      ...current.button,
                      commandId: command.id,
                      title: current.nameEdited ? current.button.title : command.title,
                    },
                  },
              );
            setPicker(undefined);
          }}
        />
      )}
    </div>
  );
}
