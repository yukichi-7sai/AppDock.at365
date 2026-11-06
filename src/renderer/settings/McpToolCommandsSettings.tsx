import { useEffect, useRef, useState } from 'react';
import { useHostTranslation } from '../HostTranslation';
import type { SettingDefinition } from '../../shared/contracts';
import type { McpToolCommand } from '../../shared/mcp-device-settings';
import { mcpToolCommandId } from '../../shared/mcp-device-settings';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';
import { SettingsListTable } from '../settings-ui/SettingsListTable';
import { SettingsListFilters } from '../settings-ui/SettingsListFilters';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { SettingsOrderDialog } from '../settings-ui/SettingsOrderDialog';
import { SettingsField, SettingsChoice, SettingsContent } from '../settings-ui/SettingsSections';
import { SettingsInput, SettingsTextarea } from '../settings-ui/SettingsInput';
import {
  CommandSettingsLinks,
  CommandPrivacy,
  useCommandSettingsTarget,
} from '../settings-ui/CommandSettingsNavigation';
import { SettingsMcpScope } from '../settings-ui/SettingsMcpAccess';
import { settingsItemId } from '../../shared/settings-catalog';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { McpCommandFields } from './McpCommandFields';

type Invoke = (name: string, args?: unknown[]) => Promise<any>;
export function McpToolCommandsSettings({
  items,
  servers,
  auxiliary,
  invoke,
  busy,
}: {
  items: McpToolCommand[];
  servers: import('../../shared/mcp-client').McpServerEntry[];
  auxiliary?: SettingsPageAuxiliary['mcpClient'];
  invoke: Invoke;
  busy: boolean;
}) {
  const { t } = useHostTranslation();
  const [search, setSearch] = useState('');
  const summaries = new Map(auxiliary?.commands.map((row) => [row.id, row]));
  const connections = new Map(servers.map((row) => [row.id, row.name]));
  const visible = items.filter((item) =>
    [
      item.title,
      item.description,
      item.category,
      connections.get(item.serverId),
      item.serverId,
      item.toolName,
    ]
      .join(' ')
      .toLocaleLowerCase()
      .includes(search.toLocaleLowerCase()),
  );
  const [dialog, setDialog] = useState<{
    kind: 'edit' | 'delete' | 'order';
    item: McpToolCommand | null;
    revision: string;
    items: McpToolCommand[];
  }>();
  const open = (kind: 'edit' | 'delete' | 'order', item: McpToolCommand | null = null) =>
    setDialog({
      kind,
      item: structuredClone(item),
      revision: auxiliary?.revision ?? '',
      items: structuredClone(items),
    });
  const target = useCommandSettingsTarget(),
    opened = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!target || target.page !== 'mcp-client' || opened.current === target.request) return;
    opened.current = target.request;
    const item = items.find((item) => mcpToolCommandId(item.id) === target.id);
    if (item) open('edit', item);
  }, [target?.request]);
  const update = (op: Record<string, unknown>) =>
    invoke('updateMcpToolCommands', [{ ...op, expectedRevision: dialog?.revision }]);
  const definition: SettingDefinition = {
    key: 'commands',
    title: t('settings.mcpCommands.title'),
    itemTitle: t('settings.mcpCommands.title'),
    type: 'object-list',
    fields: [
      { key: 'title', title: t('settings.customCommandsSettings.name'), type: 'string' },
      { key: 'toolName', title: t('settings.mcpCommandFields.tool'), type: 'string' },
      { key: 'details', title: t('settings.mcpClientSettings.description'), type: 'string' },
      { key: 'status', title: t('settings.mcpClientSettings.deviceState'), type: 'string' },
    ],
    list: {
      idKey: 'id',
      titleKey: 'title',
      descriptionKey: 'details',
      columns: ['title', 'toolName', 'status'],
    },
  };
  return (
    <SettingsContent {...settingAnchor('mcp-client', 'commands')} data-testid="mcp-tool-commands">
      <SettingsListTable
        definition={definition}
        busy={busy || !auxiliary}
        testId="mcp-tool-commands"
        toolbarControls={
          <SettingsListFilters
            search={search}
            onSearch={setSearch}
            searchLabel={t('settings.customCommandsSettings.search')}
            searchPlaceholder={t('settings.customCommandsSettings.searchPlaceholder')}
          />
        }
        totalCount={items.length}
        entries={visible.map((item) => ({
          ...item,
          details: [item.category, item.description].filter(Boolean).join(' · '),
          status: summaries.get(item.id)?.unavailableReason ?? t('settings.mcpCommands.available'),
        }))}
        renderCell={(entry, key) =>
          key === 'toolName' ? (
            <>
              {connections.get(String(entry.serverId)) ??
                t('services.mcpClient.unregisteredConnection')}
              <br />
              {String(entry.toolName)}
            </>
          ) : undefined
        }
        onAdd={() => open('edit')}
        onEdit={(index) => open('edit', visible[index])}
        onDelete={(index) => open('delete', visible[index])}
        onOrder={() => open('order')}
        titleExtra={(entry) => <CommandPrivacy published={entry.automation === true} />}
        navigation={(entry) => (
          <CommandSettingsLinks
            command={{ id: mcpToolCommandId(String(entry.id)), title: String(entry.title) }}
          />
        )}
      />
      {dialog?.kind === 'edit' && (
        <SettingsMcpScope itemId={settingsItemId('mcp-client', 'commands')}>
          <McpToolCommandDialog
            original={dialog.item}
            invoke={invoke}
            onClose={() => setDialog(undefined)}
            onApply={(item) => update({ op: 'save', item })}
          />
        </SettingsMcpScope>
      )}
      {dialog?.kind === 'delete' && (
        <SettingsDialog
          title={t('settings.mcpClientSettings.deleteTitle')}
          applyLabel={t('settings.mcpClientSettings.delete')}
          onClose={() => setDialog(undefined)}
          onApply={() => update({ op: 'remove', id: dialog.item!.id })}
        >
          <p>{dialog.item?.title}</p>
        </SettingsDialog>
      )}
      {dialog?.kind === 'order' && (
        <SettingsOrderDialog
          title={t('settings.mcpClientSettings.order')}
          listLabel={t('settings.mcpCommands.title')}
          items={dialog.items}
          onClose={() => setDialog(undefined)}
          onApply={(ids) => update({ op: 'reorder', ids })}
        />
      )}
    </SettingsContent>
  );
}
export function McpToolCommandDialog({
  original,
  initial,
  invoke,
  onClose,
  onApply,
}: {
  original: McpToolCommand | null;
  initial?: Record<string, unknown>;
  invoke: Invoke;
  onClose(): void;
  onApply(item: Record<string, unknown>): Promise<unknown>;
}) {
  const { t } = useHostTranslation();
  const [item, setItem] = useState<Record<string, unknown>>(() => {
    const { toolBinding: _binding, ...fields } = original ?? {
      id: crypto.randomUUID(),
      title: '',
      description: '',
      enabled: false,
      automation: false,
      serverId: '',
      toolName: '',
      arguments: {},
      timeoutMs: 60000,
      toolBinding: null,
      ...initial,
    };
    return fields;
  });
  const [valid, setValid] = useState(true);
  const set = (key: string, value: unknown) => setItem((before) => ({ ...before, [key]: value }));
  return (
    <SettingsDialog
      title={t(original ? 'settings.mcpCommands.edit' : 'settings.mcpCommands.new')}
      onClose={onClose}
      valid={!!String(item.title).trim() && !!item.serverId && !!item.toolName && valid}
      onApply={async () => {
        // Check the observed tool again before committing; the main process also validates its revision.
        if (item.toolRevision) {
          const reply = await invoke('mcpCommandTool', [item.serverId, item.toolName]);
          if (reply.tool?.toolRevision !== item.toolRevision)
            throw Error(t('settings.mcpCommands.reviewRequired'));
        }
        return onApply(item);
      }}
    >
      <SettingsField title={t('settings.customCommandsSettings.name')} settingKey="title">
        <SettingsInput
          data-initial-focus
          aria-label={t('settings.customCommandsSettings.name')}
          value={String(item.title)}
          onChange={(e) => set('title', e.target.value)}
        />
      </SettingsField>
      <SettingsField title={t('settings.mcpClientSettings.description')} settingKey="description">
        <SettingsTextarea
          aria-label={t('settings.mcpClientSettings.description')}
          value={String(item.description)}
          onChange={(e) => set('description', e.target.value)}
        />
      </SettingsField>
      <SettingsField title={t('commands.category.label')} settingKey="category">
        <SettingsInput
          aria-label={t('commands.category.label')}
          value={String(item.category ?? '')}
          onChange={(e) => set('category', e.target.value)}
        />
      </SettingsField>
      <SettingsChoice
        settingKey="enabled"
        label={t('settings.customCommandsSettings.enabled')}
        checked={item.enabled === true}
        onChange={(value) => set('enabled', value)}
      />
      <SettingsChoice
        settingKey="automation"
        label={t('settings.customCommandsSettings.public')}
        checked={item.automation === true}
        onChange={(value) => set('automation', value)}
      />
      <McpCommandFields
        config={item}
        approvedBinding={original?.toolBinding}
        onChange={setItem}
        onValidity={setValid}
        invoke={invoke}
      />
      <SettingsField title="ID">
        <SettingsInput aria-label="ID" readOnly value={mcpToolCommandId(String(item.id))} />
      </SettingsField>
    </SettingsDialog>
  );
}
