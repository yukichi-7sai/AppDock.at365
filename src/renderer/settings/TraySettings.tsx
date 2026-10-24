import { useHostTranslation } from '../HostTranslation';
import { hostSettingItem } from '../../shared/settings-catalog';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsInput } from '../settings-ui/SettingsInput';
import {
  SettingsSection,
  SettingsField,
  SettingsActions,
  SettingsContent,
} from '../settings-ui/SettingsSections';
import { useState } from 'react';
import type { ExtensionSnapshot, Settings } from '../../shared/contracts';
import type { UiCommand } from '../../shared/commands';
import {
  fixedTrayCommands,
  getTrayMenu,
  resolveTrayMenu,
  trayCommandCatalog,
  trayMenuCommandIds,
  type TrayMenuItem,
  type TrayMenuLeaf,
  type ResolvedTrayItem,
} from '../../shared/tray-menu';
import { CommandPicker } from '../settings-ui/CommandPicker';
import { ListIcon } from '../settings-ui/SettingsListTable';
import { SettingsDialog } from '../settings-ui/SettingsModal';

export function TraySettings({
  settings,
  extensions,
  commands,
  onChange,
}: {
  settings: Settings;
  extensions: ExtensionSnapshot[];
  commands: UiCommand[];
  onChange(value: Settings): void;
}) {
  const { t: translate } = useHostTranslation();
  const [selected, select] = useState<string | null>(null);
  const [dragged, drag] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<{ item: TrayMenuItem; before: string } | null>(null);
  const [picker, setPicker] = useState<
    'add' | 'trayClickCommand' | 'trayDoubleClickCommand' | null
  >(null);
  const items = getTrayMenu(settings, extensions);
  const catalog = trayCommandCatalog(extensions, commands);
  const title = (item: TrayMenuItem) =>
    item.type === 'group'
      ? item.title
      : item.type === 'separator'
        ? translate('settings.traySettings.separator')
        : (catalog.find((c) => c.id === item.command)?.title ?? item.command);
  const find = (list: TrayMenuItem[], id: string | null) => {
    for (const item of list) {
      if (item.id === id) return { item, list, parent: null as string | null };
      if (item.type === 'group') {
        const child = item.children.find((c) => c.id === id);
        if (child)
          return {
            item: child as TrayMenuItem,
            list: item.children as TrayMenuItem[],
            parent: item.id as string | null,
          };
      }
    }
    return null;
  };
  const active = find(items, selected);
  const update = (next: TrayMenuItem[]) =>
    onChange({ ...settings, trayMenu: next, trayCommands: trayMenuCommandIds(next) });
  const modify = (work: (next: TrayMenuItem[]) => void) => {
    const next = structuredClone(items);
    work(next);
    update(next);
  };
  const add = (type: TrayMenuItem['type'], command?: string) => {
    const id = `tray.${crypto.randomUUID()}`;
    const item: TrayMenuItem =
      type === 'group'
        ? { id, type, title: translate('settings.traySettings.newGroup'), children: [] }
        : type === 'separator'
          ? { id, type }
          : { id, type, command: command! };
    modify((next) => {
      const current = find(next, selected);
      if (type === 'group') {
        const anchor = current?.parent ?? current?.item.id;
        const index = next.findIndex((row) => row.id === anchor);
        next.splice(index < 0 ? next.length : index + 1, 0, item);
      } else if (current?.item.type === 'group') current.item.children.push(item as TrayMenuLeaf);
      else if (current) current.list.splice(current.list.indexOf(current.item) + 1, 0, item);
      else next.push(item);
    });
    select(id);
  };
  const move = (offset: number, id = selected) =>
    modify((next) => {
      const current = find(next, id);
      if (!current) return;
      const index = current.list.indexOf(current.item),
        target = index + offset;
      if (target < 0 || target >= current.list.length) return;
      current.list.splice(index, 1);
      current.list.splice(target, 0, current.item);
    });
  const remove = (id: string) => {
    modify((next) => {
      const current = find(next, id);
      if (!current) return;
      current.list.splice(
        current.list.indexOf(current.item),
        1,
        ...(current.item.type === 'group' ? current.item.children : []),
      );
    });
    if (selected === id) select(null);
  };
  const place = (parent: string) =>
    modify((next) => {
      const current = find(next, selected);
      if (!current || current.item.type === 'group') return;
      const group = next.find((item) => item.id === parent);
      const target = group?.type === 'group' ? group.children : next;
      current.list.splice(current.list.indexOf(current.item), 1);
      target.push(current.item);
    });
  const drop = (target: string) => {
    if (!dragged || dragged === target) return;
    modify((next) => {
      const from = find(next, dragged),
        to = find(next, target);
      if (!from || !to || (from.item.type === 'group' && to.parent)) return;
      if (to.item.type === 'group' && from.item.type !== 'group') {
        from.list.splice(from.list.indexOf(from.item), 1);
        to.item.children.push(from.item);
      } else {
        from.list.splice(from.list.indexOf(from.item), 1);
        to.list.splice(to.list.indexOf(to.item), 0, from.item);
      }
    });
    drag(null);
  };
  const rows = (list: TrayMenuItem[], nested = false) =>
    list.map((item, index) => (
      <div key={item.id}>
        <div
          className={`tray-editor-row ${nested ? 'tray-child' : ''} ${selected === item.id ? 'selected' : ''}`}
          data-tray-item={item.id}
          onDragOver={(e) => {
            if (dragged) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            drop(item.id);
          }}
        >
          <button
            className="tray-drag"
            draggable
            aria-label={translate('settings.traySettings.drag', { value: title(item) })}
            onClick={() => select(item.id)}
            onDragStart={(e) => {
              drag(item.id);
              select(item.id);
              e.dataTransfer.setData('text/plain', item.id);
            }}
            onDragEnd={() => drag(null)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                select(item.id);
                move(e.key === 'ArrowUp' ? -1 : 1, item.id);
              }
            }}
          >
            ⠿
          </button>
          <button
            className="tray-select"
            aria-pressed={selected === item.id}
            onClick={() => select(item.id)}
          >
            <span title={title(item)}>
              {item.type === 'group' ? '▾ ' : ''}
              {title(item) || translate('settings.traySettings.groupNamePlaceholder')}
            </span>
            {item.type === 'command' && (
              <small className="command-id" title={item.command}>
                {item.command}
                {!catalog.find((c) => c.id === item.command)?.available &&
                  translate('settings.traySettings.unavailable')}
              </small>
            )}
            {item.type === 'group' && (
              <small>
                {translate('settings.traySettings.groupSummary', { count: item.children.length })}
              </small>
            )}
          </button>
          <div className="tray-row-controls">
            <button
              type="button"
              className="settings-list-icon"
              aria-label={translate('settings.traySettings.up', { value: title(item) })}
              title={translate('settings.traySettings.upAction')}
              disabled={index === 0}
              onClick={() => move(-1, item.id)}
            >
              ↑
            </button>
            <button
              type="button"
              className="settings-list-icon"
              aria-label={translate('settings.traySettings.down', { value: title(item) })}
              title={translate('settings.traySettings.downAction')}
              disabled={index === list.length - 1}
              onClick={() => move(1, item.id)}
            >
              ↓
            </button>
            <button
              type="button"
              className="settings-list-icon settings-list-delete"
              data-testid={`tray-remove:${item.id}`}
              aria-label={translate(
                item.type === 'group'
                  ? 'settings.traySettings.ungroupLabel'
                  : 'settings.traySettings.removeLabel',
                { name: title(item) },
              )}
              title={
                item.type === 'group'
                  ? translate('settings.traySettings.ungroup')
                  : translate('settings.traySettings.remove')
              }
              onClick={() =>
                setDeleting({ item: structuredClone(item), before: JSON.stringify(items) })
              }
            >
              <ListIcon kind="delete" />
            </button>
          </div>
        </div>
        {item.type === 'group' && (
          <div className="tray-group-children">{rows(item.children, true)}</div>
        )}
      </div>
    ));
  const preview = (list: ResolvedTrayItem[]) =>
    list.map((item) =>
      item.type === 'separator' ? (
        <hr key={item.id} />
      ) : item.type === 'group' ? (
        <details key={item.id}>
          <summary>{item.title}</summary>
          <div className="tray-preview-children">{preview(item.children!)}</div>
        </details>
      ) : (
        <div key={item.id} className={`tray-preview-item ${item.enabled ? '' : 'unavailable'}`}>
          {item.title}
        </div>
      ),
    );
  const commandTitle = (id: string | null) =>
    id
      ? (commands.find((c) => c.id === id)?.title ??
        translate('settings.traySettings.unavailableCommand'))
      : translate('settings.traySettings.unset');
  return (
    <section
      className="settings-sections tray-settings"
      aria-label={translate('settings.traySettings.title')}
    >
      <SettingsSection title={translate('settings.traySettings.behavior')}>
        {(['trayClickCommand', 'trayDoubleClickCommand'] as const).map((key) => (
          <SettingsField
            key={key}
            title={hostSettingItem('tray', key).title}
            hint={
              key === 'trayDoubleClickCommand'
                ? translate('settings.traySettings.doubleClickHint')
                : translate('settings.traySettings.clickHint')
            }
            {...settingAnchor('tray', key)}
          >
            <div className="tray-click-controls">
              <button
                className="secondary"
                aria-label={
                  key === 'trayClickCommand'
                    ? translate('settings.traySettings.chooseClick')
                    : translate('settings.traySettings.chooseDoubleClick')
                }
                onClick={() => setPicker(key)}
              >
                {commandTitle(settings.host[key])}
              </button>
              {settings.host[key] &&
                commands.find((c) => c.id === settings.host[key])?.available === false && (
                  <small className="muted">{translate('settings.traySettings.unavailable')}</small>
                )}
              {key === 'trayDoubleClickCommand' && settings.host[key] && (
                <button
                  className="secondary"
                  onClick={() =>
                    onChange({
                      ...settings,
                      host: { ...settings.host, trayDoubleClickCommand: null },
                    })
                  }
                >
                  {translate('settings.traySettings.clear')}
                </button>
              )}
            </div>
          </SettingsField>
        ))}
      </SettingsSection>
      <SettingsSection
        title={translate('settings.traySettings.menu')}
        hint={translate('settings.traySettings.menuHint')}
        {...settingAnchor('tray', 'trayMenu')}
      >
        <SettingsActions className="tray-toolbar">
          <button className="secondary accent-action" onClick={() => setPicker('add')}>
            {translate('settings.traySettings.addCommand')}
          </button>
          <button className="secondary accent-action" onClick={() => add('group')}>
            {translate('settings.traySettings.addGroup')}
          </button>
          <button className="secondary accent-action" onClick={() => add('separator')}>
            {translate('settings.traySettings.addSeparator')}
          </button>
        </SettingsActions>
        <SettingsContent className="tray-workspace">
          <div>
            <div className="tray-tree">
              {rows(items)}
              {!items.length && <p className="muted">{translate('settings.traySettings.empty')}</p>}
            </div>
            {active && (
              <div
                className="tray-item-editor"
                aria-label={translate('settings.traySettings.selected')}
              >
                {active.item.type === 'group' ? (
                  <SettingsField title={translate('settings.traySettings.groupName')}>
                    <SettingsInput
                      aria-label={translate('settings.traySettings.groupName')}
                      maxLength={80}
                      value={active.item.title}
                      onChange={(e) =>
                        modify((next) => {
                          const row = find(next, selected)!.item;
                          if (row.type === 'group') row.title = e.target.value;
                        })
                      }
                    />
                  </SettingsField>
                ) : (
                  <SettingsField title={translate('settings.traySettings.location')}>
                    <select
                      aria-label={translate('settings.traySettings.locationLabel')}
                      value={active.parent ?? ''}
                      onChange={(e) => place(e.target.value)}
                    >
                      <option value="">{translate('settings.traySettings.top')}</option>
                      {items
                        .filter((item) => item.type === 'group')
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.title || translate('settings.traySettings.unnamedGroup')}
                          </option>
                        ))}
                    </select>
                  </SettingsField>
                )}
                {active.item.type === 'group' && (
                  <small>{translate('settings.traySettings.ungroupHint')}</small>
                )}
              </div>
            )}
          </div>
          <aside
            className="tray-preview"
            aria-label={translate('settings.traySettings.previewLabel')}
          >
            <h4>{translate('settings.traySettings.preview')}</h4>
            <div className="tray-preview-menu">
              {preview(resolveTrayMenu(items, catalog))}
              {resolveTrayMenu(items, catalog).length > 0 && <hr />}
              <div className="tray-preview-item">{translate('settings.traySettings.settings')}</div>
              <div className="tray-preview-item">{translate('settings.traySettings.exit')}</div>
            </div>
          </aside>
        </SettingsContent>
      </SettingsSection>
      {picker && (
        <CommandPicker
          commands={commands.filter(
            (c) => !c.hidden && (picker !== 'add' || !fixedTrayCommands.includes(c.id)),
          )}
          pins={settings.pinnedCommands}
          shortcuts={settings.shortcuts}
          onChoose={(command) => {
            if (picker === 'add') add('command', command.id);
            else onChange({ ...settings, host: { ...settings.host, [picker]: command.id } });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
      {deleting && (
        <SettingsDialog
          title={translate(
            deleting.item.type === 'group'
              ? 'settings.traySettings.ungroup'
              : 'settings.traySettings.removeTitle',
          )}
          description={translate(
            deleting.item.type === 'group'
              ? 'settings.traySettings.ungroupHint'
              : 'settings.traySettings.removeHint',
          )}
          applyLabel={translate(
            deleting.item.type === 'group'
              ? 'settings.traySettings.ungroup'
              : 'settings.traySettings.remove',
          )}
          onClose={() => setDeleting(null)}
          onApply={async () => {
            if (deleting.before !== JSON.stringify(items))
              throw Error(translate('settings.traySettings.removeChanged'));
            remove(deleting.item.id);
          }}
        >
          <p>{title(deleting.item)}</p>
        </SettingsDialog>
      )}
    </section>
  );
}
