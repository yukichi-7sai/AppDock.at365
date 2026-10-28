import { hostText } from '../../shared/i18n';
import { useHostTranslation } from '../HostTranslation';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { useState } from 'react';
import type { SettingDefinition, Settings, ExtensionSnapshot } from '../../shared/contracts';
import {
  commandStackTypeId,
  emptyCommandStack,
  parseCommandStack,
  type CommandStack,
} from '../../shared/command-stacks';
import { shortcutPageChoices } from '../../shared/shortcut-pages';
import { CommandStackEditor, StackExecutionMode } from './CommandStackEditor';
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
import { SettingsMcpScope } from '../settings-ui/SettingsMcpAccess';
import { settingsItemId } from '../../shared/settings-catalog';
import { McpCommandFields } from './McpCommandFields';
import { ProcessCommandFields } from './ProcessCommandFields';
import { defaultProcessLaunch } from '../../shared/process-launch';
import type { UiCommand } from '../../shared/commands';
import {
  CommandPrivacy,
  CommandSettingsLinks,
  CommandTargetFilter,
  useCommandSettingsTarget,
} from '../settings-ui/CommandSettingsNavigation';
import { ShortcutCaptureField } from '../settings-ui/ShortcutCaptureField';
import { CommandListSection } from '../settings-ui/CommandListScroll';
import { SettingsDescriptionIcon } from '../settings-ui/SettingsHintIcon';
import { CustomCommandOptions } from './CustomCommandOptions';
import './custom-command-editor.css';

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
  applets,
}: {
  settings: Settings;
  auxiliary?: SettingsPageAuxiliary['customCommands'];
  invoke: Invoke;
  busy: boolean;
  commands: UiCommand[];
  applets: ExtensionSnapshot[];
}) {
  const { t: translate } = useHostTranslation();
  const items = customItems(settings.customCommands),
    types = auxiliary?.types ?? [];
  const target = useCommandSettingsTarget();
  const visibleItems = target
    ? items.filter((item) => customCommandId(item.id) === target.id)
    : items;
  const commandsById = new Map(commands.map((command) => [command.id, command]));
  const typesById = new Map(types.map((type) => [type.id, type]));
  const summariesById = new Map(
    (auxiliary?.summaries ?? []).map((summary) => [summary.id, summary]),
  );
  const command = (
    entry: Record<string, unknown>,
  ): Pick<UiCommand, 'id' | 'title' | 'customDefinitionId' | 'automation'> =>
    commandsById.get(customCommandId(String(entry.id))) ?? {
      id: customCommandId(String(entry.id)),
      title: String(entry.title),
      customDefinitionId: String(entry.id),
    };
  const supported =
    !settings.customCommands || settings.customCommands.version === customCommandVersion;
  const [error, setError] = useState('');
  const [order, setOrder] = useState<{
    items: CustomCommandDefinition[];
    revision: string;
  } | null>(null);
  const [dialog, setDialog] = useState<null | {
    kind: 'edit' | 'delete';
    item: CustomCommandDefinition | null;
    types: CustomCommandDescriptor[];
    revision: string;
  }>(null);
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
          titleExtra={(entry) => <CommandPrivacy published={command(entry).automation} />}
          navigation={(entry) => <CommandSettingsLinks command={command(entry)} />}
          addInTitle
          orderInTitle
          commandListScroll
          definition={list}
          canAdd={types.length > 0}
          entries={visibleItems.map((item) => ({
            ...item,
            typeTitle: typesById.get(item.typeId)?.title ?? item.typeId,
            providerTitle: item.owner.kind === 'host' ? 'AppDock' : item.owner.id,
            unavailableReason: summariesById.get(item.id)?.unavailableReason ?? '',
          }))}
          busy={busy || !supported || !auxiliary}
          onAdd={() => open('edit', null)}
          onEdit={(i) => open('edit', visibleItems[i])}
          onDelete={(i) => open('delete', visibleItems[i])}
          onOrder={() => setOrder({ items: structuredClone(items), revision: auxiliary!.revision })}
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
      {order && (
        <SettingsOrderDialog
          title={translate('settings.customCommandsSettings.order')}
          listLabel={translate('settings.customCommandsSettings.title')}
          items={order.items}
          onClose={() => setOrder(null)}
          onApply={(ids) => update([{ op: 'reorder', ids }], order.revision)}
        />
      )}
      {dialog?.kind === 'edit' && (
        <CustomCommandDialog
          original={dialog.item}
          types={dialog.types}
          invoke={invoke}
          commands={commands}
          applets={shortcutPageChoices(applets)}
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
    </div>
  );
}
function CustomCommandDialog({
  original,
  types,
  onApply,
  onClose,
  invoke,
  commands,
  applets,
}: {
  original: CustomCommandDefinition | null;
  types: CustomCommandDescriptor[];
  onApply(operation: unknown): Promise<unknown>;
  onClose(): void;
  invoke: Invoke;
  commands: UiCommand[];
  applets: { id: string; title: string }[];
}) {
  const { t: translate } = useHostTranslation();
  const defaults = (id: string) =>
    id === commandStackTypeId
      ? { ...emptyCommandStack() }
      : id === 'appdock.process.start'
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
  const [jsonMode, setJsonMode] = useState(() => {
    if (typeId === commandStackTypeId) {
      try {
        parseCommandStack(config);
      } catch {
        return true;
      }
    }
    return false;
  });
  const [automation, setAutomation] = useState(original?.automation ?? false);
  const [enabled, setEnabled] = useState(original?.enabled ?? true);
  const [migrate, setMigrate] = useState(false);
  const [invalidFields, setInvalidFields] = useState<Record<string, boolean>>({});
  const [mcpRefresh, setMcpRefresh] = useState(0);
  const [section, setSection] = useState<'common' | 'action'>('common');
  const type = types.find((t) => t.id === typeId);
  const oldVersion = !!original && original.configVersion !== type?.configVersion;
  const editableConfig = !!type && (!oldVersion || migrate);
  const jsonOnly =
    !type?.fields?.length && typeId !== 'appdock.process.start' && typeId !== commandStackTypeId;
  const advancedOptions = (
    <>
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
                if (typeId === commandStackTypeId) parseCommandStack(parsed);
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
      {type && (
        <details className="custom-command-schema">
          <summary>{translate('settings.customCommandsSettings.schema')}</summary>
          <pre>{JSON.stringify(type.configSchema, null, 2)}</pre>
        </details>
      )}
    </>
  );
  const confirmMcpTool = async (nextConfig: Record<string, unknown>) => {
    const reply = await invoke('mcpTool', [nextConfig.serverId, nextConfig.toolName]);
    if (reply.tool.toolRevision !== nextConfig.toolRevision) {
      setConfig(nextConfig);
      setJsonMode(false);
      setMcpRefresh((value) => value + 1);
      throw new Error(translate('settings.mcpCommandFields.changed'));
    }
  };
  return (
    <SettingsMcpScope>
      <SettingsDialog
        className={
          'custom-command-dialog' +
          (typeId === commandStackTypeId ? ' stack-command-dialog' : '') +
          (typeId === commandStackTypeId && editableConfig && !jsonMode
            ? ' stack-command-form'
            : '')
        }
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
            if (typeId === 'appdock.mcp.call') await confirmMcpTool(nextConfig);
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
            await confirmMcpTool(nextConfig);
          return onApply({ op: 'update', id, changes, expectedTypeRevision: type?.typeRevision });
        }}
      >
        {(ready, setError) => (
          <>
            <div
              className="custom-command-section-switch"
              role="group"
              aria-label={translate('settings.customCommandsSettings.edit')}
            >
              {(['common', 'action'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  data-testid={'custom-command-section:' + value}
                  aria-pressed={section === value}
                  onClick={() => setSection(value)}
                >
                  {translate(`settings.customCommandsSettings.${value}`)}
                </button>
              ))}
            </div>
            <div
              className="custom-command-editor"
              data-testid="custom-command-editor"
              data-active-section={section}
            >
              <section
                className="custom-command-common"
                aria-label={translate('settings.customCommandsSettings.common')}
                onFocusCapture={() => setSection('common')}
              >
                <h3>{translate('settings.customCommandsSettings.common')}</h3>
                <SettingsField
                  settingKey="typeId"
                  title={translate('settings.customCommandsSettings.kind')}
                >
                  <div className="custom-command-select">
                    <select
                      data-testid="custom-command-kind"
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
                    <SettingsDescriptionIcon
                      title={translate('settings.customCommandsSettings.kind')}
                      description={type?.description}
                      testId="custom-command-kind-info"
                    />
                  </div>
                </SettingsField>
                <SettingsField
                  settingKey="title"
                  title={translate('settings.customCommandsSettings.name')}
                >
                  <SettingsInput
                    aria-label={translate('settings.customCommandsSettings.name')}
                    data-initial-focus
                    value={title}
                    maxLength={100}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </SettingsField>
                <SettingsField
                  settingKey="description"
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
                  settingKey="enabled"
                  checked={enabled}
                  disabled={!type && !enabled}
                  onChange={setEnabled}
                />
                <SettingsChoice
                  label={translate('settings.customCommandsSettings.public')}
                  settingKey="automation"
                  checked={automation}
                  disabled={!type?.automation && !automation}
                  onChange={setAutomation}
                />
                {!type?.automation && (
                  <p className="muted">
                    {translate('settings.customCommandsSettings.publicForbidden')}
                  </p>
                )}
              </section>
              <section
                className="custom-command-action"
                aria-label={translate('settings.customCommandsSettings.action')}
                onFocusCapture={() => setSection('action')}
              >
                <h3>{translate('settings.customCommandsSettings.action')}</h3>
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
                <SettingsMcpScope
                  itemId={settingsItemId('custom-commands', 'config:' + typeId)}
                  fieldKey="config"
                >
                  {!editableConfig || jsonMode || jsonOnly ? (
                    <SettingsField
                      settingKey="config"
                      title={translate('settings.customCommandsSettings.configJson')}
                    >
                      <SettingsTextarea
                        aria-label={translate('settings.customCommandsSettings.configJson')}
                        value={json}
                        readOnly={!editableConfig}
                        rows={8}
                        onChange={(e) => setJson(e.target.value)}
                      />
                    </SettingsField>
                  ) : typeId === commandStackTypeId ? (
                    <>
                      <StackExecutionMode
                        value={(config as unknown as CommandStack).executionMode}
                        onChange={(executionMode) => setConfig({ ...config, executionMode })}
                      />
                      <CommandStackEditor
                        entries={(config as unknown as CommandStack).entries}
                        onChange={(entries) => setConfig({ ...config, entries })}
                        commands={commands}
                        applets={applets}
                        excludeId={customCommandId(id)}
                        onValidity={(valid) =>
                          setInvalidFields((previous) =>
                            previous.stack === !valid ? previous : { ...previous, stack: !valid },
                          )
                        }
                      />
                    </>
                  ) : typeId === 'appdock.input.sendKeys' ? (
                    <ShortcutCaptureField
                      mode="send"
                      showDescription={false}
                      label={translate('settings.customCommandsSettings.inputKeys')}
                      value={typeof config.keys === 'string' ? config.keys : ''}
                      onChange={(keys) => setConfig({ ...config, keys })}
                      recordingReady={ready}
                      setError={setError}
                    />
                  ) : typeId === 'appdock.process.start' ? (
                    <ProcessCommandFields
                      advancedOptions={advancedOptions}
                      config={config}
                      onChange={setConfig}
                      onValidity={(valid) =>
                        setInvalidFields((previous) => ({ ...previous, process: !valid }))
                      }
                    />
                  ) : typeId === 'appdock.mcp.call' ? (
                    <McpCommandFields
                      advancedOptions={advancedOptions}
                      refreshKey={mcpRefresh}
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
                            onChange={(e) =>
                              setConfig({ ...config, [field.key]: e.target.checked })
                            }
                          />
                        ) : field.type === 'select' ? (
                          <select
                            aria-label={field.title}
                            value={String(config[field.key] ?? '')}
                            onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}
                          >
                            <option value="">
                              {translate('settings.customCommandsSettings.select')}
                            </option>
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
                </SettingsMcpScope>
                {(!editableConfig ||
                  jsonMode ||
                  jsonOnly ||
                  !['appdock.process.start', 'appdock.mcp.call'].includes(typeId)) && (
                  <CustomCommandOptions>{advancedOptions}</CustomCommandOptions>
                )}
              </section>
            </div>
          </>
        )}
      </SettingsDialog>
    </SettingsMcpScope>
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
