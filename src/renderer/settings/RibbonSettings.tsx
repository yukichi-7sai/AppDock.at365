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
import { ribbonGroupIcons, type RibbonGroup, type RibbonPlacement } from '../../shared/ribbon';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { ListIcon } from '../settings-ui/SettingsListTable';

export function RibbonSettings({
  settings,
  extensions,
  onEdit,
}: {
  settings: Settings;
  extensions: ExtensionSnapshot[];
  onEdit(operation: unknown, before: Settings['ribbon']): Promise<unknown>;
}) {
  const layout = settings.ribbon;
  const groups = layout.groups ?? [];
  const [dragged, setDragged] = useState<string | null>(null);
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
    iconOnly: boolean;
    before: string;
  }>();
  const [confirmation, setConfirmation] = useState<{
    group?: RibbonGroup;
    missing?: { id: string; title: string };
    before: string;
  }>();
  const catalog = ribbonItems(extensions, layout.separators, groups);
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
      ribbonPlacement(layout, previous.id) === placement
    ) {
      const siblings = roots.filter((item) => ribbonPlacement(layout, item.id) === placement);
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
    const placement = ribbonPlacement(layout, target);
    const siblings = parentId
      ? groups.find((g) => g.id === parentId)!.children
      : roots.filter((i) => ribbonPlacement(layout, i.id) === placement).map((i) => i.id);
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
  const open = (group: RibbonGroup | undefined, placement: RibbonPlacement) =>
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
  const row = (entry: RibbonItem, index: number, siblings: RibbonItem[]) => {
    const item = { ...entry, ...ribbonPresentation(layout, entry) };
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
              value={parent?.id ?? ribbonPlacement(layout, item.id)}
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
              disabled={pending || index === 0}
              onClick={() => move(item.id, siblings[index - 1].id)}
            >
              ↑
            </button>
            <button
              aria-label={`${item.title}を下へ`}
              disabled={pending || index === siblings.length - 1}
              onClick={() => move(item.id, siblings[index + 1].id)}
            >
              ↓
            </button>
            {item.kind !== 'separator' ? (
              <button
                className="settings-list-icon"
                title="編集"
                disabled={pending}
                aria-label={`${item.title}を編集`}
                onClick={() =>
                  item.group
                    ? open(item.group, ribbonPlacement(layout, item.id))
                    : setItemDialog({
                        id: item.id,
                        title: layout.itemOverrides?.[item.id]?.title ?? '',
                        originalTitle: entry.title,
                        iconOnly: item.iconOnly,
                        before: JSON.stringify(layout),
                      })
                }
              >
                <ListIcon kind="edit" />
              </button>
            ) : (
              <span className="ribbon-action-placeholder" aria-hidden="true" />
            )}
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
            ) : item.group ? (
              <button
                className="settings-list-icon settings-list-delete"
                title="グループを解除"
                disabled={pending}
                aria-label={`${item.title}のグループを解除`}
                onClick={() =>
                  setConfirmation({ group: item.group, before: JSON.stringify(layout) })
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
    <section
      className="ribbon-settings"
      {...settingAnchor('ribbon', 'ribbon')}
      aria-label="リボン設定"
    >
      <p className="muted">
        設定ボタンを非表示にしても、リボンの右クリックや「設定を開く」コマンドから戻れます。
      </p>
      {error && <p role="alert">{error}</p>}
      {(['top', 'bottom'] as const).map((position) => {
        const title = position === 'top' ? '上寄せ' : '下寄せ';
        const siblings = roots.filter((item) => ribbonPlacement(layout, item.id) === position);
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
                  className="secondary"
                  disabled={pending || groups.length >= 50}
                  onClick={() => open(undefined, position)}
                >
                  {title}にグループを追加
                </button>
                <button
                  className="secondary"
                  disabled={pending || layout.separators.length >= 50}
                  onClick={() =>
                    run({
                      kind: 'addSeparator',
                      id: `separator:${crypto.randomUUID()}`,
                      placement: position,
                    })
                  }
                >
                  {title}にセパレーターを追加
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
      <button
        className="text-button"
        disabled={pending}
        onClick={() => setConfirmation({ before: JSON.stringify(layout) })}
      >
        リボンを初期状態に戻す
      </button>
      {confirmation && (
        <SettingsDialog
          title={
            confirmation.group
              ? 'グループを解除'
              : confirmation.missing
                ? 'リボン項目を設定から削除'
                : 'リボンを初期状態に戻す'
          }
          onClose={() => setConfirmation(undefined)}
          applyLabel={
            confirmation.group ? '解除' : confirmation.missing ? '削除' : '初期状態に戻す'
          }
          onApply={async () => {
            if (confirmation.before !== JSON.stringify(layout))
              throw Error('リボン設定が変更されています。閉じてからやり直してください。');
            await apply(
              confirmation.group
                ? { kind: 'ungroup', id: confirmation.group.id }
                : confirmation.missing
                  ? { kind: 'removeMissing', id: confirmation.missing.id }
                  : { kind: 'reset' },
            );
          }}
        >
          <p>
            {confirmation.group
              ? `「${confirmation.group.title || 'グループ'}」の名前・アイコン・展開方法を削除します。中のボタンはグループの位置に戻り、順序・上下配置・非表示状態を引き継ぎます。`
              : confirmation.missing
                ? `「${confirmation.missing.title}」の配置・グループ所属・表示名を設定から削除します。登録元を追加し直した場合は既定の表示に戻ります。`
                : 'グループ・セパレーターと、未導入の項目も含む保存済み配置・表示名を初期化します。Appletの設定や有効状態は変わりません。'}
          </p>
        </SettingsDialog>
      )}
      {dialog && (
        <SettingsDialog
          title={dialog.adding ? 'リボングループを追加' : 'リボングループを編集'}
          onClose={() => setDialog(undefined)}
          valid={dialog.group.title.trim().length <= 80}
          applyLabel={dialog.adding ? '追加' : '適用'}
          footer="確定するとすぐに反映・保存されます。"
          onApply={async () => {
            if (dialog.before !== JSON.stringify(layout))
              throw Error('リボン設定が変更されています。閉じてから編集し直してください。');
            const { id, title, icon, expansion, iconOnly = false } = dialog.group;
            await apply(
              dialog.adding
                ? {
                    kind: 'addGroup',
                    id,
                    title,
                    icon,
                    expansion,
                    iconOnly,
                    placement: dialog.placement,
                  }
                : { kind: 'updateGroup', id, changes: { title, icon, expansion, iconOnly } },
            );
          }}
        >
          <div className="ribbon-edit-fields">
            <label>
              グループ名
              <input
                data-initial-focus
                value={dialog.group.title}
                maxLength={80}
                placeholder="空欄ならアイコンだけを表示"
                onChange={(e) =>
                  setDialog({ ...dialog, group: { ...dialog.group, title: e.target.value } })
                }
              />
            </label>
            <label>
              アイコン
              <select
                aria-label="グループのアイコン"
                value={dialog.group.icon}
                onChange={(e) =>
                  setDialog({
                    ...dialog,
                    group: { ...dialog.group, icon: e.target.value as RibbonGroup['icon'] },
                  })
                }
              >
                {ribbonGroupIcons.map((icon) => (
                  <option key={icon} value={icon}>
                    {
                      {
                        folder: 'フォルダー',
                        mail: 'メール',
                        clock: '時計',
                        image: '画像',
                        extensions: 'アプレット',
                        settings: '設定',
                        bell: '通知',
                      }[icon]
                    }
                  </option>
                ))}
              </select>
            </label>
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
            <p className="muted">
              {dialog.group.expansion === 'persistent'
                ? 'リボン内に展開します。開閉状態はこのPCで再起動後も保持します。'
                : '右側のパネルに1行で表示します。ボタンの実行・外側クリック・Escapeで閉じます。'}
            </p>
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
              changes: { title: itemDialog.title, iconOnly: itemDialog.iconOnly },
            });
          }}
        >
          <div className="ribbon-edit-fields">
            <label>
              ボタン名
              <input
                data-initial-focus
                maxLength={80}
                value={itemDialog.title}
                placeholder={itemDialog.originalTitle}
                onChange={(e) => setItemDialog({ ...itemDialog, title: e.target.value })}
              />
            </label>
            <p className="muted">
              空欄にすると登録元の名前を使います。変更はリボン内の表示だけに反映されます。
            </p>
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
    </section>
  );
}
