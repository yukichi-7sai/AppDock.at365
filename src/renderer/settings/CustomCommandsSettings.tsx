import { hostText } from '../../shared/i18n';
import { useHostTranslation } from '../HostTranslation';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { useState } from 'react';
import type { SettingDefinition, Settings } from '../../shared/contracts';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';
import {
  customItems,
  customCommandId,
  customCommandVersion,
  type CustomCommandDefinition,
  type CustomCommandDescriptor,
} from '../../shared/custom-commands';
import { SettingsListTable } from '../settings-ui/SettingsListTable';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { SettingsOrderDialog } from '../settings-ui/SettingsOrderDialog';
import { SettingsInput, SettingsTextarea } from '../settings-ui/SettingsInput';
import { SettingsField, SettingsChoice } from '../settings-ui/SettingsSections';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { McpCommandFields } from './McpCommandFields';
import { ProcessCommandFields } from './ProcessCommandFields';
import { defaultProcessLaunch } from '../../shared/process-launch';
import type { UiCommand } from '../../shared/commands';
import {
  CommandPublication,
  CommandSettingsLinks,
  CommandTargetFilter,
  useCommandSettingsTarget,
} from '../settings-ui/CommandSettingsNavigation';
import { ShortcutCaptureField } from '../settings-ui/ShortcutCaptureField';
import { CommandListSection } from '../settings-ui/CommandListScroll';

const list: SettingDefinition = {
  key: 'definitions',
  title: hostText('settings.customCommandsSettings.title'),
  type: 'object-list',
  itemTitle: hostText('settings.customCommandsSettings.command'),
  fields: [
    { key: 'title', title: hostText('settings.customCommandsSettings.name'), type: 'string' },
    { key: 'typeTitle', title: hostText('settings.customCommandsSettings.kind'), type: 'string' },
    {
      key: 'providerTitle',
      title: hostText('settings.customCommandsSettings.owner'),
      type: 'string',
    },
    {
      key: 'unavailableReason',
      title: hostText('settings.customCommandsSettings.unavailableReason'),
      type: 'string',
    },
  ],
  list: {
    idKey: 'id',
    titleKey: 'title',
    columns: ['title', 'typeTitle', 'providerTitle'],
    descriptionKey: 'unavailableReason',
    enabledKey: 'enabled',
  },
};
type Invoke = (name: string, args?: unknown[]) => Promise<any>;
export function CustomCommandsSettings({
  settings,
  auxiliary,
  invoke,
  busy,
  commands,
}: {
  settings: Settings;
  auxiliary?: SettingsPageAuxiliary['customCommands'];
  invoke: Invoke;
  busy: boolean;
  commands: UiCommand[];
}) {
  const { t: translate } = useHostTranslation();
  const items = customItems(settings.customCommands),
    types = auxiliary?.types ?? [];
  const target = useCommandSettingsTarget();
  const visibleItems = target
    ? items.filter((item) => customCommandId(item.id) === target.id)
    : items;
  const command = (
    entry: Record<string, unknown>,
  ): Pick<UiCommand, 'id' | 'title' | 'customDefinitionId' | 'automation'> =>
    commands.find((c) => c.id === customCommandId(String(entry.id))) ?? {
      id: customCommandId(String(entry.id)),
      title: String(entry.title),
      customDefinitionId: String(entry.id),
    };
  const supported =
    !settings.customCommands || settings.customCommands.version === customCommandVersion;
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<
    | null
    | {
        kind: 'edit' | 'delete';
        item: CustomCommandDefinition | null;
        types: CustomCommandDescriptor[];
        revision: string;
      }
    | { kind: 'order'; items: CustomCommandDefinition[]; revision: string }
  >(null);
  const update = (operations: unknown[], revision = auxiliary?.revision) =>
    invoke('updateCustomCommands', [{ expectedRevision: revision, operations }]);
  const open = (kind: 'edit' | 'delete', item: CustomCommandDefinition | null) =>
    setDialog({
      kind,
      item: structuredClone(item),
      types: structuredClone(types),
      revision: auxiliary!.revision,
    });
  useSettingsFeedback({ error });
  return (
    <div className="settings-sections custom-commands-settings">
      <CommandListSection
        title={translate('settings.customCommandsSettings.registered')}
        description={[
          !supported ? translate('settings.customCommandsSettings.unsupportedVersion') : '',
          !types.length ? translate('settings.customCommandsSettings.noTypes') : '',
        ]
          .filter(Boolean)
          .join(' ')}
        {...settingAnchor('custom-commands', 'definitions')}
      >
        <SettingsListTable
          toolbarFilter={<CommandTargetFilter />}
          titleExtra={(entry) => <CommandPublication published={command(entry).automation} />}
          navigation={(entry) => <CommandSettingsLinks command={command(entry)} />}
          addInTitle
          commandListScroll
          definition={list}
          maxItems={256}
          canAdd={types.length > 0 && items.length < 256}
          entries={visibleItems.map((item) => ({
            ...item,
            typeTitle: types.find((t) => t.id === item.typeId)?.title ?? item.typeId,
            providerTitle: item.owner.kind === 'host' ? 'AppDock' : item.owner.id,
            unavailableReason:
              auxiliary?.summaries.find((s) => s.id === item.id)?.unavailableReason ?? '',
          }))}
          busy={busy || !supported || !auxiliary}
          onAdd={() => open('edit', null)}
          onEdit={(i) => open('edit', visibleItems[i])}
          onDelete={(i) => open('delete', visibleItems[i])}
          onOrder={() =>
            setDialog({
              kind: 'order',
              items: structuredClone(items),
              revision: auxiliary!.revision,
            })
          }
          onToggle={(i) => {
            setError('');
            void update([
              {
                op: 'update',
                id: visibleItems[i].id,
                changes: { enabled: !visibleItems[i].enabled },
                expectedTypeRevision: types.find((t) => t.id === visibleItems[i].typeId)
                  ?.typeRevision,
              },
            ]).catch((e) => setError(String(e)));
          }}
        />
      </CommandListSection>
      {dialog?.kind === 'edit' && (
        <CustomCommandDialog
          original={dialog.item}
          types={dialog.types}
          invoke={invoke}
          onClose={() => setDialog(null)}
          onApply={(operation) => update([operation], dialog.revision)}
        />
      )}
      {dialog?.kind === 'delete' && (
        <SettingsDialog
          title={translate('settings.customCommandsSettings.deleteTitle')}
          description={translate('settings.customCommandsSettings.deleteHint')}
          applyLabel={translate('settings.customCommandsSettings.delete')}
          onClose={() => setDialog(null)}
          onApply={() => update([{ op: 'remove', id: dialog.item!.id }], dialog.revision)}
        >
          <p>{dialog.item!.title}</p>
        </SettingsDialog>
      )}
      {dialog?.kind === 'order' && (
        <SettingsOrderDialog
          title={translate('settings.customCommandsSettings.order')}
          listLabel={translate('settings.customCommandsSettings.title')}
          items={dialog.items}
          onClose={() => setDialog(null)}
          onApply={(ids) => update([{ op: 'reorder', ids }], dialog.revision)}
        />
      )}
    </div>
  );
}
function CustomCommandDialog({
  original,
  types,
  onApply,
  onClose,
  invoke,
}: {
  original: CustomCommandDefinition | null;
  types: CustomCommandDescriptor[];
  onApply(operation: unknown): Promise<unknown>;
  onClose(): void;
  invoke: Invoke;
}) {
  const { t: translate } = useHostTranslation();
  const defaults = (id: string) =>
    id === 'appdock.process.start'
      ? { ...defaultProcessLaunch() }
      : Object.fromEntries(
          (types.find((t) => t.id === id)?.fields ?? [])
            .filter((f) => f.default !== undefined)
            .map((f) => [f.key, f.default]),
        );
  const [id] = useState(() => original?.id ?? crypto.randomUUID());
  const [typeId, setTypeId] = useState(original?.typeId ?? types[0]?.id ?? '');
  const [title, setTitle] = useState(original?.title ?? '');
  const [description, setDescription] = useState(original?.description ?? '');
  const [config, setConfig] = useState<Record<string, unknown>>(
    () => original?.config ?? defaults(typeId),
  );
  const [json, setJson] = useState(() => JSON.stringify(config, null, 2));
  const [jsonMode, setJsonMode] = useState(false);
  const [automation, setAutomation] = useState(original?.automation ?? false);
  const [enabled, setEnabled] = useState(original?.enabled ?? true);
  const [migrate, setMigrate] = useState(false);
  const [invalidFields, setInvalidFields] = useState<Record<string, boolean>>({});
  const type = types.find((t) => t.id === typeId);
  const oldVersion = !!original && original.configVersion !== type?.configVersion;
  const editableConfig = !!type && (!oldVersion || migrate);
  const jsonOnly = !type?.fields?.length && typeId !== 'appdock.process.start';
  return (
    <SettingsDialog
      title={
        original
          ? translate('settings.customCommandsSettings.edit')
          : translate('settings.customCommandsSettings.add')
      }
      onClose={onClose}
      valid={
        !!title.trim() &&
        (!!original || !!type) &&
        (jsonMode || !Object.values(invalidFields).some(Boolean))
      }
      onApply={async () => {
        const nextConfig = editableConfig
          ? jsonMode || jsonOnly
            ? JSON.parse(json)
            : config
          : original!.config;
        const value = {
          title: title.trim(),
          description,
          configVersion: migrate || !original ? type!.configVersion : original.configVersion,
          config: nextConfig,
          enabled,
          automation,
        };
        if (!original) {
          if (typeId === 'appdock.mcp.call')
            await invoke('mcpTool', [nextConfig.serverId, nextConfig.toolName]);
          return onApply({
            op: 'add',
            expectedTypeRevision: type!.typeRevision,
            item: { id, typeId, ...value },
          });
        }
        const changes = Object.fromEntries(
          Object.entries(value).filter(
            ([key, v]) =>
              JSON.stringify(v) !== JSON.stringify(original[key as keyof typeof original]),
          ),
        );
        if ('configVersion' in changes) changes.config = nextConfig;
        if (!Object.keys(changes).length) return;
        if (
          typeId === 'appdock.mcp.call' &&
          ('config' in changes || changes.enabled === true || changes.automation === true)
        )
          await invoke('mcpTool', [nextConfig.serverId, nextConfig.toolName]);
        return onApply({ op: 'update', id, changes, expectedTypeRevision: type?.typeRevision });
      }}
    >
      {(ready, setError) => (
        <>
          <SettingsField
            title={translate('settings.customCommandsSettings.kind')}
            description={type?.description}
          >
            <select
              aria-label={translate('settings.customCommandsSettings.kind')}
              value={typeId}
              disabled={!!original}
              onChange={(e) => {
                const value = e.target.value;
                setTypeId(value);
                const next = defaults(value);
                setConfig(next);
                setJson(JSON.stringify(next, null, 2));
                setAutomation(false);
                setInvalidFields({});
              }}
            >
              {!type && (
                <option value={typeId}>
                  {typeId || translate('settings.customCommandsSettings.noType')}
                </option>
              )}
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </SettingsField>
          <SettingsField title={translate('settings.customCommandsSettings.name')}>
            <SettingsInput
              aria-label={translate('settings.customCommandsSettings.name')}
              data-initial-focus
              value={title}
              maxLength={100}
              onChange={(e) => setTitle(e.target.value)}
            />
          </SettingsField>
          <SettingsField
            title={translate('settings.customCommandsSettings.description')}
            hint={translate('settings.customCommandsSettings.publicHint')}
          >
            <SettingsTextarea
              aria-label={translate('settings.customCommandsSettings.description')}
              value={description}
              maxLength={1000}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
            />
          </SettingsField>
          <SettingsChoice
            label={translate('settings.customCommandsSettings.enabled')}
            checked={enabled}
            disabled={!type && !enabled}
            onChange={setEnabled}
          />
          <SettingsChoice
            label={translate('settings.customCommandsSettings.public')}
            checked={automation}
            disabled={!type?.automation && !automation}
            onChange={setAutomation}
          />
          {!type?.automation && (
            <p className="muted">{translate('settings.customCommandsSettings.publicForbidden')}</p>
          )}
          {oldVersion && type && (
            <SettingsChoice
              label={translate('settings.customCommandsSettings.upgradeConfig', {
                configVersion: type.configVersion,
              })}
              checked={migrate}
              onChange={(checked) => {
                setMigrate(checked);
                const next = checked ? defaults(typeId) : original!.config;
                setConfig(next);
                setJson(JSON.stringify(next, null, 2));
                setInvalidFields({});
              }}
            />
          )}
          {!jsonOnly && editableConfig && (
            <SettingsChoice
              label={translate('settings.customCommandsSettings.editJson')}
              checked={jsonMode}
              onChange={(checked) => {
                if (checked) setJson(JSON.stringify(config, null, 2));
                else {
                  try {
                    const parsed = JSON.parse(json);
                    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return;
                    setConfig(parsed);
                  } catch {
                    return;
                  }
                }
                setInvalidFields({});
                setJsonMode(checked);
              }}
            />
          )}
          {!editableConfig || jsonMode || jsonOnly ? (
            <SettingsField title={translate('settings.customCommandsSettings.configJson')}>
              <SettingsTextarea
                aria-label={translate('settings.customCommandsSettings.configJson')}
                value={json}
                readOnly={!editableConfig}
                rows={10}
                onChange={(e) => setJson(e.target.value)}
              />
            </SettingsField>
          ) : typeId === 'appdock.input.sendKeys' ? (
            <ShortcutCaptureField
              mode="send"
              label={translate('settings.customCommandsSettings.inputKeys')}
              value={typeof config.keys === 'string' ? config.keys : ''}
              onChange={(keys) => setConfig({ ...config, keys })}
              recordingReady={ready}
              setError={setError}
            />
          ) : typeId === 'appdock.process.start' ? (
            <ProcessCommandFields
              config={config}
              onChange={setConfig}
              onValidity={(valid) =>
                setInvalidFields((previous) => ({ ...previous, process: !valid }))
              }
            />
          ) : typeId === 'appdock.mcp.call' ? (
            <McpCommandFields
              config={config}
              onChange={setConfig}
              invoke={invoke}
              onValidity={(valid) =>
                setInvalidFields((previous) => ({ ...previous, mcpArguments: !valid }))
              }
            />
          ) : (
            type!.fields!.map((field) => (
              <SettingsField key={field.key} title={field.title}>
                {field.type === 'boolean' ? (
                  <input
                    aria-label={field.title}
                    type="checkbox"
                    checked={config[field.key] === true}
                    onChange={(e) => setConfig({ ...config, [field.key]: e.target.checked })}
                  />
                ) : field.type === 'select' ? (
                  <select
                    aria-label={field.title}
                    value={String(config[field.key] ?? '')}
                    onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
                  >
                    <option value="">{translate('settings.customCommandsSettings.select')}</option>
                    {field.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'json' ? (
                  <JsonField
                    label={field.title}
                    value={config[field.key]}
                    onValidity={(valid) =>
                      setInvalidFields((previous) => ({ ...previous, [field.key]: !valid }))
                    }
                    onChange={(value) => setConfig({ ...config, [field.key]: value })}
                  />
                ) : (
                  <SettingsInput
                    aria-label={field.title}
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={String(config[field.key] ?? '')}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        [field.key]:
                          field.type === 'number' && e.target.value.trim()
                            ? Number(e.target.value)
                            : e.target.value,
                      })
                    }
                  />
                )}
              </SettingsField>
            ))
          )}
          {type && (
            <details>
              <summary>{translate('settings.customCommandsSettings.schema')}</summary>
              <pre>{JSON.stringify(type.configSchema, null, 2)}</pre>
            </details>
          )}
        </>
      )}
    </SettingsDialog>
  );
}
function JsonField({
  label,
  value,
  onChange,
  onValidity,
}: {
  label: string;
  value: unknown;
  onChange(value: unknown): void;
  onValidity(valid: boolean): void;
}) {
  const { t: translate } = useHostTranslation();
  const [text, setText] = useState(JSON.stringify(value ?? null, null, 2));
  const [error, setError] = useState('');
  useSettingsFeedback({ error });
  return (
    <>
      <SettingsTextarea
        aria-label={label}
        value={text}
        rows={5}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setError('');
            onValidity(true);
          } catch {
            setError(translate('settings.customCommandsSettings.invalidJson'));
            onValidity(false);
          }
        }}
      />
    </>
  );
}
