import { useHostTranslation } from '../HostTranslation';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { useLayoutEffect, useRef, useState } from 'react';
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
  ribbonGroupIcons,
  type RibbonBuiltinIcon,
  type RibbonItemOverride,
  type RibbonIconOverride,
  type RibbonDisplayMode,
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
import { Toggle } from '../settings-ui/Toggle';
import { RibbonIconPicker } from '../settings-ui/RibbonIconPicker';
import { imageReference, type RegisteredImageRef } from '../../shared/registered-images';
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
  const { t: translate } = useHostTranslation();
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
    iconRevision?: number;
  }>();
  const [separatorDialog, setSeparatorDialog] = useState<{
    id: string;
    title: string;
    before: string;
  }>();
  const [error, setError] = useState(''),
    [pending, setPending] = useState(false);
  const orderHandles = useRef(new Map<string, HTMLButtonElement>());
  const movedHandle = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (pending || !movedHandle.current) return;
    const handle = orderHandles.current.get(movedHandle.current);
    movedHandle.current = null;
    handle?.focus({ preventScroll: true });
    handle?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [pending]);
  const [dialog, setDialog] = useState<{
    group: RibbonGroup;
    adding: boolean;
    placement: RibbonPlacement;
    before: string;
    iconRevision?: number;
  }>();
  const [itemDialog, setItemDialog] = useState<{
    id: string;
    title: string;
    originalTitle: string;
    iconOnly: boolean;
    icon?: RibbonBuiltinIcon | null;
    originalIcon: RibbonBuiltinIcon;
    originalImage?: RegisteredImageRef;
    displayModeIcons?: RibbonItemOverride['displayModeIcons'];
    iconRevision?: number;
    image?: RegisteredImageRef | null;
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
  const changeModeIcon = (mode: RibbonDisplayMode, changes: RibbonIconOverride) => {
    setItemDialog(
      (current) =>
        current && {
          ...current,
          displayModeIcons: {
            ...current.displayModeIcons,
            [mode]: {
              ...(current.displayModeIcons?.[mode] ?? { icon: current.icon, image: current.image }),
              ...changes,
            },
          },
        },
    );
  };
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
    if (!pending && id && items.some((item) => item.id === id)) work(id);
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
    const sourceImage =
      entry.image ??
      (entry.contribution?.imageSetting
        ? (settings.extensions[entry.extensionId!]?.settings[entry.contribution.imageSetting] ??
          extensions
            .find((value) => value.id === entry.extensionId)
            ?.settings?.find((value) => value.key === entry.contribution!.imageSetting)?.default)
        : undefined);
    const detail = missing
      ? translate('settings.ribbonSettings.missing')
      : item.group
        ? translate('settings.ribbonSettings.groupSummary', {
            value:
              item.group.expansion === 'persistent'
                ? translate('settings.ribbonSettings.persistent')
                : translate('settings.ribbonSettings.temporary'),
            length: item.group.children.length,
          })
        : item.command
          ? `${commandTitle(item.command.commandId)}${commands.some((c) => c.id === item.command!.commandId && c.available) ? '' : translate('settings.ribbonSettings.unavailable')}`
          : item.kind === 'separator'
            ? translate('settings.ribbonSettings.separator')
            : (item.extensionId ?? 'AppDock');
    return (
      <div key={item.id} className="ribbon-setting-entry">
        <div
          className={`ribbon-setting-row ${item.kind === 'separator' ? 'separator-setting-row' : ''}`}
          data-ribbon-setting={item.id}
          onDragStart={(event) => {
            if (pending) {
              event.preventDefault();
              return;
            }
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
          <button
            type="button"
            className="drag-handle settings-list-icon"
            ref={(element) => {
              if (element) orderHandles.current.set(item.id, element);
              else orderHandles.current.delete(item.id);
            }}
            draggable={!pending}
            disabled={pending}
            aria-label={translate('settings.settingsOrderDialog.drag', { title: item.title })}
            title={translate('settings.settingsOrderDialog.dragHint')}
            aria-keyshortcuts="ArrowUp ArrowDown"
            onKeyDown={(event) => {
              if (
                pending ||
                event.nativeEvent.isComposing ||
                event.keyCode === 229 ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey ||
                event.shiftKey ||
                !['ArrowUp', 'ArrowDown'].includes(event.key)
              )
                return;
              event.preventDefault();
              const target = siblings[index + (event.key === 'ArrowUp' ? -1 : 1)];
              if (target) {
                movedHandle.current = item.id;
                move(item.id, target.id);
              }
            }}
          >
            ⠿
          </button>
          <label>
            <input
              type="checkbox"
              disabled={pending || missing}
              aria-label={translate('settings.ribbonSettings.show', { title: item.title })}
              checked={!layout.hidden.includes(item.id)}
              onChange={(e) =>
                run({ kind: 'update', id: item.id, changes: { visible: e.target.checked } })
              }
            />
            <span className="ribbon-setting-summary" draggable={!pending}>
              <span className="ribbon-setting-name" title={item.title}>
                {item.title}
              </span>
              <small title={detail}>{detail}</small>
            </span>
          </label>
          <div className="ribbon-row-controls">
            <select
              aria-label={translate('settings.ribbonSettings.placement', { title: item.title })}
              disabled={pending}
              value={parent?.id ?? ribbonPlacement(layout, item.id, items)}
              onChange={(e) =>
                e.target.value.startsWith('group:')
                  ? moveTo(item.id, e.target.value)
                  : moveTo(item.id, null, e.target.value as RibbonPlacement)
              }
            >
              <option value="top">{translate('settings.ribbonSettings.top')}</option>
              <option value="bottom">{translate('settings.ribbonSettings.bottom')}</option>
              {item.kind !== 'group' &&
                groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.title || translate('settings.ribbonSettings.group')}
                  </option>
                ))}
            </select>
            {
              <button
                className="settings-list-icon"
                title={translate('settings.ribbonSettings.edit')}
                disabled={pending}
                aria-label={translate('settings.ribbonSettings.editLabel', { title: item.title })}
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
                            iconOnly: item.iconOnly,
                            icon: layout.itemOverrides?.[item.id]?.icon,
                            originalImage: imageReference(sourceImage) ? sourceImage : undefined,
                            displayModeIcons: structuredClone(
                              layout.itemOverrides?.[item.id]?.displayModeIcons,
                            ),
                            originalIcon: ribbonGroupIcons.includes(entry.icon as RibbonBuiltinIcon)
                              ? (entry.icon as RibbonBuiltinIcon)
                              : 'extensions',
                            image: layout.itemOverrides?.[item.id]?.image,
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
                title={translate('settings.ribbonSettings.delete')}
                disabled={pending}
                aria-label={translate('settings.ribbonSettings.deleteLabel', { title: item.title })}
                onClick={() => run({ kind: 'removeSeparator', id: item.id })}
              >
                <ListIcon kind="delete" />
              </button>
            ) : command ? (
              <button
                className="settings-list-icon settings-list-delete"
                title={translate('settings.ribbonSettings.delete')}
                disabled={pending}
                aria-label={translate('settings.ribbonSettings.deleteLabel', { title: item.title })}
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
                title={translate('settings.ribbonSettings.ungroup')}
                disabled={pending}
                aria-label={translate('settings.ribbonSettings.ungroupLabel', {
                  title: item.title,
                })}
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
                title={translate('settings.ribbonSettings.remove')}
                disabled={pending}
                aria-label={translate('settings.ribbonSettings.removeLabel', { title: item.title })}
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
            aria-label={translate('settings.ribbonSettings.children', { title: item.title })}
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
                <p className="muted">{translate('settings.ribbonSettings.childrenHint')}</p>
              );
            })()}
          </div>
        )}
      </div>
    );
  };
  useSettingsFeedback({ error });
  return (
    <div
      className="settings-sections ribbon-settings"
      aria-label={translate('settings.ribbonSettings.title')}
    >
      <SettingsSection data-testid="ribbon-behavior-settings">
        <SettingsField
          title={translate('settings.ribbonSettings.rightClick')}
          hint={translate('settings.ribbonSettings.rightClickHint')}
          {...settingAnchor('ribbon', 'rightClickCommand')}
        >
          <button
            type="button"
            className="secondary"
            disabled={pending}
            onClick={() => setPicker('rightClick')}
            aria-label={translate('settings.ribbonSettings.chooseRightClick')}
          >
            {commandTitle(rightClickCommand)}
          </button>
          {!commands.some((c) => c.id === rightClickCommand && c.available) && (
            <small>{translate('settings.ribbonSettings.commandUnavailable')}</small>
          )}
        </SettingsField>
      </SettingsSection>
      <SettingsSection data-testid="ribbon-editor-settings" {...settingAnchor('ribbon', 'ribbon')}>
        {(['top', 'bottom'] as const).map((position) => {
          const title =
            position === 'top'
              ? translate('settings.ribbonSettings.top')
              : translate('settings.ribbonSettings.bottom');
          const siblings = roots.filter(
            (item) => ribbonPlacement(layout, item.id, items) === position,
          );
          return (
            <section
              key={position}
              className="ribbon-placement"
              aria-label={translate('settings.ribbonSettings.panel', { title: title })}
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
                    {translate('settings.ribbonSettings.addCommand')}
                  </button>
                  <button
                    className="secondary accent-action"
                    disabled={pending}
                    onClick={() => open(undefined, position)}
                  >
                    {translate('settings.ribbonSettings.addGroup')}
                  </button>
                  <button
                    className="secondary accent-action"
                    disabled={pending}
                    onClick={() =>
                      run({
                        kind: 'addSeparator',
                        id: `separator:${crypto.randomUUID()}`,
                        placement: position,
                      })
                    }
                  >
                    {translate('settings.ribbonSettings.addSeparator')}
                  </button>
                </div>
              </div>
              <div className="ribbon-setting-list">
                {siblings.map((item, i) => row(item, i, siblings))}
                {!siblings.length && (
                  <p className="empty">{translate('settings.ribbonSettings.empty')}</p>
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
              ? translate('settings.ribbonSettings.deleteButton')
              : confirmation.kind === 'group'
                ? translate('settings.ribbonSettings.ungroup')
                : translate('settings.ribbonSettings.removeMissing')
          }
          onClose={() => setConfirmation(undefined)}
          applyLabel={
            confirmation.kind === 'group'
              ? translate('settings.ribbonSettings.ungroupAction')
              : translate('settings.ribbonSettings.delete')
          }
          onApply={async () => {
            if (confirmation.before !== JSON.stringify(layout))
              throw Error(translate('settings.ribbonSettings.conflict'));
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
              ? translate('settings.ribbonSettings.deleteButtonConfirm', {
                  title: confirmation.button.title,
                })
              : confirmation.kind === 'group'
                ? translate('settings.ribbonSettings.ungroupConfirm', {
                    value: confirmation.group.title || translate('settings.ribbonSettings.group'),
                  })
                : translate('settings.ribbonSettings.removeMissingConfirm', {
                    title: confirmation.missing.title,
                  })}
          </p>
        </SettingsDialog>
      )}
      {dialog && (
        <SettingsDialog
          resetAction={{
            label: translate('settings.ribbonSettings.resetIcon'),
            onClick: () =>
              setDialog(
                (current) =>
                  current && {
                    ...current,
                    iconRevision: (current.iconRevision ?? 0) + 1,
                    group: { ...current.group, icon: 'folder', image: null },
                  },
              ),
          }}
          title={
            dialog.adding
              ? translate('settings.ribbonSettings.newGroup')
              : translate('settings.ribbonSettings.editGroup')
          }
          onClose={() => setDialog(undefined)}
          valid={dialog.group.title.trim().length <= 80 && colorValid}
          applyLabel={
            dialog.adding
              ? translate('settings.ribbonSettings.add')
              : translate('settings.ribbonSettings.apply')
          }
          onApply={async () => {
            if (dialog.before !== JSON.stringify(layout))
              throw Error(translate('settings.ribbonSettings.editConflict'));
            const {
              id,
              title,
              icon,
              expansion,
              color = null,
              image,
              iconOnly = false,
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
          <div>
            <SettingsField
              settingKey="title"
              title={translate('settings.ribbonSettings.groupName')}
            >
              <SettingsInput
                aria-label={translate('settings.ribbonSettings.groupName')}
                data-initial-focus
                value={dialog.group.title}
                maxLength={80}
                placeholder={translate('settings.ribbonSettings.groupNameHint')}
                onChange={(e) =>
                  setDialog({ ...dialog, group: { ...dialog.group, title: e.target.value } })
                }
              />
            </SettingsField>
            <RibbonIconPicker
              key={`${dialog.group.id}:${dialog.iconRevision ?? 0}`}
              label={translate('settings.ribbonSettings.groupIcon')}
              preferImage={dialog.adding && !dialog.iconRevision}
              value={dialog.group.icon}
              image={dialog.group.image}
              onImage={(image) =>
                setDialog(
                  (current) => current && { ...current, group: { ...current.group, image } },
                )
              }
              onChange={(icon) =>
                setDialog((current) => current && { ...current, group: { ...current.group, icon } })
              }
            />
            <SettingsField
              settingKey="iconOnly"
              title={translate('settings.ribbonSettings.iconOnly')}
              data-testid="ribbon-icon-only"
            >
              <Toggle
                label={translate('settings.ribbonSettings.iconOnly')}
                checked={!!dialog.group.iconOnly}
                onChange={(iconOnly) =>
                  setDialog({ ...dialog, group: { ...dialog.group, iconOnly } })
                }
              />
            </SettingsField>
            <SettingsField
              settingKey="expansion"
              title={translate('settings.ribbonSettings.expansion')}
            >
              <select
                aria-label={translate('settings.ribbonSettings.expansion')}
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
                <option value="persistent">
                  {translate('settings.ribbonSettings.persistent')}
                </option>
                <option value="temporary">{translate('settings.ribbonSettings.temporary')}</option>
              </select>
            </SettingsField>
            <SettingsField settingKey="color" title={translate('settings.ribbonSettings.color')}>
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
            </SettingsField>
          </div>
        </SettingsDialog>
      )}
      {itemDialog && (
        <SettingsDialog
          resetAction={{
            label: translate('settings.ribbonSettings.resetIcon'),
            onClick: () =>
              setItemDialog(
                (current) =>
                  current && {
                    ...current,
                    iconRevision: (current.iconRevision ?? 0) + 1,
                    icon: null,
                    image: null,
                    ...(current.id === 'ribbon-display-mode' ? { displayModeIcons: null } : {}),
                  },
              ),
          }}
          title={translate('settings.ribbonSettings.editButton')}
          applyLabel={translate('settings.ribbonSettings.apply')}
          valid={itemDialog.title.trim().length <= 80}
          onClose={() => setItemDialog(undefined)}
          onApply={async () => {
            if (itemDialog.before !== JSON.stringify(layout))
              throw Error(translate('settings.ribbonSettings.editConflict'));
            await apply({
              kind: 'updateItem',
              id: itemDialog.id,
              changes: {
                title: itemDialog.title,
                iconOnly: itemDialog.iconOnly,
                ...(itemDialog.icon !== undefined ? { icon: itemDialog.icon } : {}),
                ...(itemDialog.image !== undefined ? { image: itemDialog.image } : {}),
                ...(itemDialog.displayModeIcons !== undefined
                  ? { displayModeIcons: itemDialog.displayModeIcons }
                  : {}),
              },
            });
          }}
        >
          <div>
            <SettingsField
              settingKey="title"
              title={translate('settings.ribbonSettings.buttonName')}
              hint={translate('settings.ribbonSettings.buttonNameHint')}
            >
              <SettingsInput
                aria-label={translate('settings.ribbonSettings.buttonName')}
                data-initial-focus
                maxLength={80}
                value={itemDialog.title}
                placeholder={itemDialog.originalTitle}
                onChange={(e) => setItemDialog({ ...itemDialog, title: e.target.value })}
              />
            </SettingsField>
            <SettingsField
              settingKey="iconOnly"
              title={translate('settings.ribbonSettings.iconOnly')}
              data-testid="ribbon-icon-only"
            >
              <Toggle
                label={translate('settings.ribbonSettings.iconOnly')}
                checked={itemDialog.iconOnly}
                onChange={(iconOnly) => setItemDialog({ ...itemDialog, iconOnly })}
              />
            </SettingsField>
            {itemDialog.id === 'ribbon-display-mode' ? (
              (['compact', 'expanded'] as const).map((mode) => {
                const appearance = itemDialog.displayModeIcons?.[mode] ?? {
                  icon: itemDialog.icon,
                  image: itemDialog.image,
                };
                return (
                  <div key={mode} data-testid={`ribbon-mode-icon-${mode}`}>
                    <RibbonIconPicker
                      settingKey="displayModeIcons"
                      key={`${mode}:${itemDialog.iconRevision ?? 0}`}
                      label={translate(
                        mode === 'compact'
                          ? 'settings.ribbonSettings.compactIcon'
                          : 'settings.ribbonSettings.expandedIcon',
                      )}
                      value={appearance.icon ?? (mode === 'compact' ? 'chevron' : 'chevron-left')}
                      image={appearance.image}
                      onChange={(icon) => changeModeIcon(mode, { icon })}
                      onImage={(image) => changeModeIcon(mode, { image })}
                    />
                  </div>
                );
              })
            ) : (
              <RibbonIconPicker
                key={`${itemDialog.id}:${itemDialog.iconRevision ?? 0}`}
                label={translate('settings.ribbonSettings.buttonIcon')}
                value={itemDialog.icon ?? itemDialog.originalIcon}
                image={itemDialog.image ?? (itemDialog.icon ? null : itemDialog.originalImage)}
                onChange={(icon) => setItemDialog((current) => current && { ...current, icon })}
                onImage={(image) => setItemDialog((current) => current && { ...current, image })}
              />
            )}
          </div>
        </SettingsDialog>
      )}
      {separatorDialog && (
        <SettingsDialog
          title={translate('settings.ribbonSettings.editSeparator')}
          applyLabel={translate('settings.ribbonSettings.apply')}
          valid={separatorDialog.title.trim().length <= 80}
          onClose={() => setSeparatorDialog(undefined)}
          onApply={async () => {
            if (separatorDialog.before !== JSON.stringify(layout))
              throw Error(translate('settings.ribbonSettings.editConflict'));
            await apply({
              kind: 'updateSeparator',
              id: separatorDialog.id,
              changes: { title: separatorDialog.title },
            });
          }}
        >
          <SettingsField settingKey="title" title={translate('settings.ribbonSettings.name')}>
            <SettingsInput
              aria-label={translate('settings.ribbonSettings.name')}
              data-initial-focus
              maxLength={80}
              value={separatorDialog.title}
              placeholder={translate('settings.ribbonSettings.nameHint')}
              onChange={(e) => setSeparatorDialog({ ...separatorDialog, title: e.target.value })}
            />
          </SettingsField>
        </SettingsDialog>
      )}
      {buttonDialog && !picker && (
        <SettingsDialog
          resetAction={{
            label: translate('settings.ribbonSettings.resetIcon'),
            onClick: () =>
              setButtonDialog(
                (current) =>
                  current && {
                    ...current,
                    iconRevision: (current.iconRevision ?? 0) + 1,
                    button: { ...current.button, icon: 'extensions', image: null },
                  },
              ),
          }}
          title={
            buttonDialog.adding
              ? translate('settings.ribbonSettings.newCommand')
              : translate('settings.ribbonSettings.editCommand')
          }
          applyLabel={
            buttonDialog.adding
              ? translate('settings.ribbonSettings.add')
              : translate('settings.ribbonSettings.apply')
          }
          valid={
            !!buttonDialog.button.title.trim() &&
            buttonDialog.button.title.trim().length <= 80 &&
            !!buttonDialog.button.commandId
          }
          onClose={() => setButtonDialog(undefined)}
          onApply={async () => {
            if (buttonDialog.before !== JSON.stringify(layout))
              throw Error(translate('settings.ribbonSettings.editConflict'));
            const { id, ...changes } = buttonDialog.button;
            await apply(
              buttonDialog.adding
                ? { kind: 'addButton', id, ...changes, placement: buttonDialog.placement }
                : { kind: 'updateButton', id, changes },
            );
          }}
        >
          <div>
            <SettingsField
              settingKey="commandId"
              title={translate('settings.ribbonSettings.command')}
              description={
                buttonDialog.button.commandId &&
                !commands.some((c) => c.id === buttonDialog.button.commandId && c.available)
                  ? translate('settings.ribbonSettings.commandUnavailable')
                  : undefined
              }
            >
              <button
                type="button"
                className="secondary"
                aria-label={translate('settings.ribbonSettings.chooseCommand')}
                onClick={() => setPicker('button')}
              >
                {buttonDialog.button.commandId
                  ? commandTitle(buttonDialog.button.commandId)
                  : translate('settings.ribbonSettings.selectCommand')}
              </button>
            </SettingsField>
            <SettingsField
              settingKey="title"
              title={translate('settings.ribbonSettings.buttonName')}
            >
              <SettingsInput
                aria-label={translate('settings.ribbonSettings.buttonName')}
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
            </SettingsField>
            <RibbonIconPicker
              key={`${buttonDialog.button.id}:${buttonDialog.iconRevision ?? 0}`}
              label={translate('settings.ribbonSettings.buttonIcon')}
              preferImage={buttonDialog.adding && !buttonDialog.iconRevision}
              value={buttonDialog.button.icon}
              image={buttonDialog.button.image}
              onImage={(image) =>
                setButtonDialog(
                  (current) => current && { ...current, button: { ...current.button, image } },
                )
              }
              onChange={(icon) =>
                setButtonDialog(
                  (current) => current && { ...current, button: { ...current.button, icon } },
                )
              }
            />
            <SettingsField
              settingKey="iconOnly"
              title={translate('settings.ribbonSettings.iconOnly')}
              data-testid="ribbon-icon-only"
            >
              <Toggle
                label={translate('settings.ribbonSettings.iconOnly')}
                checked={!!buttonDialog.button.iconOnly}
                onChange={(iconOnly) =>
                  setButtonDialog({ ...buttonDialog, button: { ...buttonDialog.button, iconOnly } })
                }
              />
            </SettingsField>
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
