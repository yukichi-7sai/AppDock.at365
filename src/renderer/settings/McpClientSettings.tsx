import { McpToolCommandsSettings, McpToolCommandDialog } from './McpToolCommandsSettings';
import { useCommandSettingsTarget } from '../settings-ui/CommandSettingsNavigation';
import { localizedMetadata } from '../../shared/translation-metadata';
import { hostText } from '../../shared/i18n';
import { useHostTranslation } from '../HostTranslation';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { useEffect, useRef, useState } from 'react';
import type { Settings, SettingDefinition } from '../../shared/contracts';
import type { McpSettingsTab } from '../../shared/mcp-device-settings';
import type { SettingsPageAuxiliary } from '../../shared/settings-page';
import {
  defaultMcpConnection,
  type McpConnection,
  type McpLocalStatus,
  type McpServerEntry,
  type McpToolDescriptor,
  type McpJob,
} from '../../shared/mcp-client';
import { SettingsListTable } from '../settings-ui/SettingsListTable';
import { SettingsDialog } from '../settings-ui/SettingsModal';
import { SettingsOrderDialog } from '../settings-ui/SettingsOrderDialog';
import { SettingsInput, SettingsTextarea } from '../settings-ui/SettingsInput';
import {
  SettingsSection,
  SettingsField,
  SettingsChoice,
  SettingsActions,
  SettingsContent,
} from '../settings-ui/SettingsSections';
import { settingAnchor } from '../settings-ui/setting-anchor';
import { SettingsMcpScope } from '../settings-ui/SettingsMcpAccess';
import { settingsItemId } from '../../shared/settings-catalog';

type Invoke = (name: string, args?: unknown[]) => Promise<any>;
const definition = localizedMetadata<SettingDefinition>(() => ({
  key: 'connections',
  title: hostText('settings.mcpClientSettings.title'),
  type: 'object-list',
  itemTitle: hostText('settings.mcpClientSettings.server'),
  fields: [
    { key: 'name', title: hostText('settings.mcpClientSettings.name'), type: 'string' },
    { key: 'transport', title: hostText('settings.mcpClientSettings.transport'), type: 'string' },
    { key: 'status', title: hostText('settings.mcpClientSettings.deviceState'), type: 'string' },
  ],
  list: {
    idKey: 'id',
    titleKey: 'name',
    columns: ['name', 'transport', 'status'],
    enabledKey: 'enabled',
  },
}));
const states = localizedMetadata<Record<string, string>>(() => ({
  unconfigured: hostText('settings.mcpClientSettings.unconfigured'),
  disabled: 'OFF',
  disconnected: hostText('settings.mcpClientSettings.disconnected'),
  connecting: hostText('settings.mcpClientSettings.connecting'),
  connected: hostText('settings.mcpClientSettings.connected'),
  error: hostText('settings.mcpClientSettings.attention'),
  'credentials-required': hostText('settings.mcpRecovery.action'),
}));
const jobStates = localizedMetadata<Record<string, string>>(() => ({
  running: hostText('settings.mcpClientSettings.running'),
  succeeded: hostText('settings.mcpClientSettings.completed'),
  'tool-error': hostText('settings.mcpClientSettings.toolError'),
  failed: hostText('settings.mcpClientSettings.failed'),
  cancelled: hostText('settings.mcpClientSettings.canceled'),
  'outcome-unknown': hostText('settings.mcpClientSettings.unknownResult'),
}));
export function McpClientSettingsForm({
  settings,
  auxiliary,
  move,
  invoke,
  busy,
  tab,
  setTab,
  toolsReset,
}: {
  settings: Settings;
  auxiliary?: SettingsPageAuxiliary['mcpClient'];
  move?: { id: string; itemId: string; completed?: boolean };
  invoke: Invoke;
  busy: boolean;
  tab: McpSettingsTab;
  setTab(tab: McpSettingsTab): void;
  toolsReset: number;
}) {
  const { t: translate } = useHostTranslation();
  const items = settings.mcpClient?.servers ?? [];
  const [reset, setReset] = useState<string>();
  const [newCommand, setNewCommand] = useState<{
    item: Record<string, unknown>;
    revision: string;
  }>();
  const target = useCommandSettingsTarget();
  useEffect(() => {
    if (target?.page === 'mcp-client') setTab('commands');
  }, [target?.request]);
  useEffect(() => {
    if (move && !move.completed)
      setTab(move.itemId === settingsItemId('mcp-client', 'commands') ? 'commands' : 'connections');
  }, [move?.id]);
  const [dialog, setDialog] = useState<
    | null
    | {
        kind: 'edit' | 'delete';
        item: McpServerEntry | null;
        status?: McpLocalStatus;
        recover?: boolean;
        revision: string;
      }
    | { kind: 'order'; items: McpServerEntry[]; revision: string }
  >(null);
  const [error, setError] = useState(''),
    [pending, setPending] = useState(false),
    [serverId, setServer] = useState(''),
    [tools, setTools] = useState<Partial<McpToolDescriptor>[]>([]),
    [cursor, setCursor] = useState<string>(),
    [tool, setTool] = useState<McpToolDescriptor>(),
    [args, setArgs] = useState('{}'),
    [result, setResult] = useState<McpJob>();
  const running = useRef(false);
  const toolsGeneration = useRef(0);
  const [hiddenJobs, setHiddenJobs] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!toolsReset) return;
    toolsGeneration.current++;
    setServer('');
    setTools([]);
    setCursor(undefined);
    setTool(undefined);
    setArgs('{}');
    setResult(undefined);
    setError('');
    setHiddenJobs(
      new Set(auxiliary?.jobs.filter((job) => job.state !== 'running').map((job) => job.jobId)),
    );
  }, [toolsReset]);
  const visibleJobs = auxiliary?.jobs.filter((job) => !hiddenJobs.has(job.jobId)) ?? [];
  const run = async (work: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    const generation = toolsGeneration.current;
    setPending(true);
    setError('');
    try {
      await work();
    } catch (e) {
      if (generation === toolsGeneration.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
      setPending(false);
    }
  };
  const receive = async (work: Promise<any>, apply: (value: any) => void) => {
    const generation = toolsGeneration.current;
    const value = await work;
    if (generation === toolsGeneration.current) apply(value);
  };
  const update = (op: Record<string, unknown>, revision = auxiliary?.revision) =>
    invoke('updateMcpConnection', [{ ...op, expectedRevision: revision }]);
  const open = (kind: 'edit' | 'delete', item: McpServerEntry | null, recover = false) =>
    setDialog({
      kind,
      recover,
      item: structuredClone(item),
      status: structuredClone(auxiliary?.connections.find((c) => c.id === item?.id)),
      revision: auxiliary?.revision ?? '',
    });
  useSettingsFeedback({
    error: [auxiliary?.error ? auxiliary.error : '', error ? error : ''].filter(Boolean).join('\n'),
  });
  return (
    <div className="settings-sections">
      <p>{translate('settings.mcpClientSettings.deviceHint')}</p>
      <div
        id="mcp-panel-connections"
        role="region"
        aria-label={translate('settings.mcpClientSettings.connectionsTab')}
        hidden={tab !== 'connections'}
      >
        <SettingsContent
          data-testid="mcp-client-connections"
          {...settingAnchor('mcp-client', 'connections')}
        >
          <SettingsListTable
            actionsAlign="start"
            definition={definition}
            busy={busy || pending || !auxiliary}
            entries={items.map((item) => {
              const s = auxiliary?.connections.find((c) => c.id === item.id);
              return {
                ...item,
                enabled: s?.connection?.enabled ?? false,
                transport: s?.connection?.transport ?? '—',
                status: states[s?.state ?? 'unconfigured'],
              };
            })}
            canToggle={(_, i) =>
              !!auxiliary?.connections.find((c) => c.id === items[i].id)?.connection
            }
            extra={(_, index) => (
              <>
                {auxiliary?.connections.find((c) => c.id === items[index].id)?.error && (
                  <button type="button" onClick={() => open('edit', items[index], true)}>
                    {translate('settings.mcpRecovery.action')}
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending || !items[index].connection.enabled}
                  onClick={() =>
                    void run(async () => {
                      await invoke('mcpTools', [items[index].id]);
                    })
                  }
                >
                  {translate('settings.mcpRecovery.check')}
                </button>
              </>
            )}
            onAdd={() => open('edit', null)}
            onEdit={(i) => open('edit', items[i])}
            onDelete={(i) => open('delete', items[i])}
            onOrder={() =>
              setDialog({
                kind: 'order',
                items: structuredClone(items),
                revision: auxiliary?.revision ?? '',
              })
            }
            onToggle={(i) =>
              void run(async () => {
                const s = auxiliary?.connections.find((c) => c.id === items[i].id);
                await update({ op: 'enabled', id: items[i].id, enabled: !s?.connection?.enabled });
              })
            }
          />
        </SettingsContent>
        {auxiliary?.error && (
          <button type="button" onClick={() => setReset(auxiliary.revision)}>
            {translate('settings.mcpRecovery.reset')}
          </button>
        )}
      </div>
      <div
        id="mcp-panel-commands"
        role="region"
        aria-label={translate('settings.mcpCommands.title')}
        hidden={tab !== 'commands'}
      >
        <McpToolCommandsSettings
          items={settings.mcpClient?.commands ?? []}
          servers={items}
          auxiliary={auxiliary}
          invoke={invoke}
          busy={busy || pending}
        />
      </div>
      <div
        id="mcp-panel-tools"
        role="region"
        aria-label={translate('settings.mcpClientSettings.toolsTab')}
        hidden={tab !== 'tools'}
      >
        <SettingsSection
          title={translate('settings.mcpClientSettings.tools')}
          hint={translate('settings.mcpClientSettings.toolsHint')}
          description={translate('settings.mcpClientSettings.executionHint')}
        >
          <SettingsField title={translate('settings.mcpClientSettings.server')}>
            <select
              aria-label={translate('settings.mcpClientSettings.serverLabel')}
              value={serverId}
              disabled={pending}
              onChange={(e) => {
                const id = e.target.value;
                setServer(id);
                setTools([]);
                setTool(undefined);
                setCursor(undefined);
                setResult(undefined);
                setError('');
                if (id)
                  void run(() =>
                    receive(invoke('mcpTools', [id]), (r) => {
                      setTools(r.items);
                      setCursor(r.nextCursor);
                    }),
                  );
              }}
            >
              <option value="">{translate('settings.mcpClientSettings.select')}</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </SettingsField>
          {tools.length > 0 && (
            <SettingsField
              title={translate('settings.mcpClientSettings.tool')}
              description={[tool?.description, tool?.unsupportedReason]
                .filter(Boolean)
                .join(' ／ ')}
            >
              <select
                aria-label={translate('settings.mcpClientSettings.toolLabel')}
                value={tool?.name ?? ''}
                disabled={pending}
                onChange={(e) => {
                  const name = e.target.value;
                  setTool(undefined);
                  if (name)
                    void run(() =>
                      receive(invoke('mcpTool', [serverId, name]), (r) => setTool(r.tool)),
                    );
                }}
              >
                <option value="">{translate('settings.mcpClientSettings.select')}</option>
                {tools.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.title ?? t.name}
                    {t.unsupportedReason ? translate('settings.mcpClientSettings.unsupported') : ''}
                  </option>
                ))}
              </select>
            </SettingsField>
          )}
          {cursor && (
            <SettingsActions data-testid="mcp-client-more-actions">
              <button
                disabled={pending}
                onClick={() =>
                  void run(() =>
                    receive(invoke('mcpTools', [serverId, cursor]), (r) => {
                      setTools([...tools, ...r.items]);
                      setCursor(r.nextCursor);
                    }),
                  )
                }
              >
                {translate('settings.mcpClientSettings.more')}
              </button>
            </SettingsActions>
          )}
          {tool && (
            <>
              <SettingsField title={translate('settings.mcpClientSettings.schema')}>
                <SettingsTextarea
                  aria-label={translate('settings.mcpClientSettings.schema')}
                  rows={6}
                  readOnly
                  value={JSON.stringify(tool.inputSchema, null, 2)}
                />
              </SettingsField>
              <SettingsField title={translate('settings.mcpClientSettings.args')}>
                <SettingsTextarea
                  aria-label={translate('settings.mcpClientSettings.argsLabel')}
                  rows={6}
                  value={args}
                  onChange={(e) => setArgs(e.target.value)}
                />
              </SettingsField>
              <SettingsActions data-testid="mcp-client-execute-actions">
                <button
                  className="primary"
                  disabled={pending || !!tool.unsupportedReason}
                  onClick={() =>
                    void run(() =>
                      receive(
                        invoke('mcpCall', [
                          {
                            serverId,
                            name: tool.name,
                            toolRevision: tool.toolRevision,
                            arguments: JSON.parse(args),
                            requestId: crypto.randomUUID(),
                          },
                        ]),
                        setResult,
                      ),
                    )
                  }
                >
                  {translate('settings.mcpClientSettings.execute')}
                </button>
                <button
                  type="button"
                  disabled={pending || !!tool.unsupportedReason}
                  onClick={() =>
                    void run(async () => {
                      setNewCommand({
                        revision: auxiliary?.revision ?? '',
                        item: {
                          serverId,
                          toolName: tool.name,
                          title: tool.title ?? tool.name,
                          toolRevision: tool.toolRevision,
                          arguments: JSON.parse(args),
                        },
                      });
                    })
                  }
                >
                  {translate('settings.mcpCommands.fromTool')}
                </button>
              </SettingsActions>
            </>
          )}
        </SettingsSection>
        <SettingsSection
          title={translate('settings.mcpClientSettings.jobs')}
          description={translate('settings.mcpClientSettings.jobsHint', {
            value: !visibleJobs.length ? translate('settings.mcpClientSettings.noJobs') : '',
          })}
        >
          {visibleJobs.map((j) => (
            <SettingsField
              key={j.jobId}
              title={`${items.find((s) => s.id === j.serverId)?.name ?? j.serverId} / ${j.toolName}`}
              description={`${jobStates[j.state]}${
                j.progress
                  ? ` (${j.progress.progress}${j.progress.total ? '/' + j.progress.total : ''})`
                  : ''
              }`}
              error={j.error?.message}
            >
              <SettingsActions>
                <button
                  disabled={pending}
                  onClick={() => void run(() => receive(invoke('mcpGetJob', [j.jobId]), setResult))}
                >
                  {translate('settings.mcpClientSettings.showResult')}
                </button>
                {j.state === 'running' && (
                  <button
                    disabled={pending}
                    onClick={() =>
                      void run(() => receive(invoke('mcpCancelJob', [j.jobId]), setResult))
                    }
                  >
                    {translate('settings.mcpClientSettings.cancel')}
                  </button>
                )}
              </SettingsActions>
            </SettingsField>
          ))}
          {result && (
            <pre aria-label={translate('settings.mcpClientSettings.result')}>
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
        </SettingsSection>
      </div>
      {reset !== undefined && (
        <SettingsDialog
          title={translate('settings.mcpRecovery.reset')}
          onClose={() => setReset(undefined)}
          onApply={() => invoke('resetMcpSecrets', [reset])}
        >
          <p>{translate('settings.mcpRecovery.resetConfirm')}</p>
        </SettingsDialog>
      )}
      {newCommand && (
        <SettingsMcpScope itemId={settingsItemId('mcp-client', 'commands')}>
          <McpToolCommandDialog
            original={null}
            initial={newCommand.item}
            invoke={invoke}
            onClose={() => setNewCommand(undefined)}
            onApply={(item) =>
              invoke('updateMcpToolCommands', [
                { op: 'save', item, expectedRevision: newCommand.revision },
              ])
            }
          />
        </SettingsMcpScope>
      )}
      {dialog?.kind === 'edit' && (
        <SettingsMcpScope itemId={settingsItemId('mcp-client', 'connections')}>
          <McpConnectionDialog
            original={dialog.item}
            recover={dialog.recover}
            status={dialog.status}
            onClose={() => setDialog(null)}
            onApply={(value) => update({ op: 'save', ...value }, dialog.revision)}
          />
        </SettingsMcpScope>
      )}
      {dialog?.kind === 'delete' && (
        <SettingsDialog
          title={translate('settings.mcpClientSettings.deleteTitle')}
          description={translate('settings.mcpClientSettings.deleteHint')}
          applyLabel={translate('settings.mcpClientSettings.delete')}
          onClose={() => setDialog(null)}
          onApply={() => update({ op: 'remove', id: dialog.item!.id }, dialog.revision)}
        >
          <p>{dialog.item?.name}</p>
          <p>
            {translate('settings.mcpCommands.references', {
              count: (settings.mcpClient?.commands ?? []).filter(
                (command) => command.serverId === dialog.item?.id,
              ).length,
            })}
          </p>
        </SettingsDialog>
      )}
      {dialog?.kind === 'order' && (
        <SettingsOrderDialog
          title={translate('settings.mcpClientSettings.order')}
          listLabel={translate('settings.mcpClientSettings.title')}
          items={dialog.items.map((i) => ({ ...i, title: i.name }))}
          onClose={() => setDialog(null)}
          onApply={(ids) => update({ op: 'reorder', ids }, dialog.revision)}
        />
      )}
    </div>
  );
}
function McpConnectionDialog({
  original,
  recover = false,
  status,
  onApply,
  onClose,
}: {
  original: McpServerEntry | null;
  recover?: boolean;
  status?: McpLocalStatus;
  onApply(value: Record<string, unknown>): Promise<unknown>;
  onClose(): void;
}) {
  const { t: translate } = useHostTranslation();
  const [id] = useState(() => original?.id ?? crypto.randomUUID()),
    [name, setName] = useState(original?.name ?? ''),
    [description, setDescription] = useState(original?.description ?? '');
  const [connection, setConnection] = useState<McpConnection>(
    status?.connection ?? defaultMcpConnection(),
  );
  const [args, setArgs] = useState(JSON.stringify(connection.args)),
    [token, setToken] = useState(''),
    [replaceToken, setReplaceToken] = useState(recover || !original),
    [environment, setEnvironment] = useState('{}'),
    [replaceEnvironment, setReplaceEnvironment] = useState(
      recover && !!status?.requiresEnvironment,
    );
  const set = (part: Partial<McpConnection>) => setConnection({ ...connection, ...part });
  return (
    <SettingsDialog
      title={
        original
          ? translate('settings.mcpClientSettings.edit')
          : translate('settings.mcpClientSettings.add')
      }
      onClose={onClose}
      valid={!!name.trim()}
      onApply={() =>
        onApply({
          item: { id, name, description },
          connection: {
            ...connection,
            args: connection.transport === 'stdio' ? JSON.parse(args) : [],
            publishedTools: connection.publishedTools.map((v) => v.trim()).filter(Boolean),
          },
          ...(replaceToken && connection.authentication === 'bearer' ? { token } : {}),
          ...(replaceEnvironment ? { environment: JSON.parse(environment) } : {}),
        })
      }
    >
      {status?.error && <p role="status">{status.error}</p>}
      <SettingsField title="ID">
        <SettingsInput aria-label="ID" value={id} readOnly />
      </SettingsField>
      <SettingsField settingKey="name" title={translate('settings.mcpClientSettings.name')}>
        <SettingsInput
          aria-label={translate('settings.mcpClientSettings.name')}
          data-initial-focus={recover ? undefined : true}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </SettingsField>
      <SettingsField
        settingKey="description"
        title={translate('settings.mcpClientSettings.description')}
      >
        <SettingsTextarea
          aria-label={translate('settings.mcpClientSettings.description')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </SettingsField>
      <SettingsChoice
        label={translate('settings.mcpClientSettings.allow')}
        checked={connection.enabled}
        onChange={(enabled) => set({ enabled })}
      />
      <SettingsField
        settingKey="connection.transport"
        title={translate('settings.mcpClientSettings.transport')}
      >
        <select
          aria-label={translate('settings.mcpClientSettings.transport')}
          value={connection.transport}
          onChange={(e) => {
            setConnection({
              ...defaultMcpConnection(),
              enabled: connection.enabled,
              transport: e.target.value as 'stdio' | 'http',
            });
            setArgs('[]');
            setReplaceToken(true);
            setToken('');
          }}
        >
          <option value="http">Streamable HTTP</option>
          <option value="stdio">{translate('settings.mcpClientSettings.transportStdio')}</option>
        </select>
      </SettingsField>
      {connection.transport === 'http' ? (
        <>
          <SettingsField
            settingKey="connection.url"
            title={translate('settings.mcpClientSettings.url')}
          >
            <SettingsInput
              aria-label={translate('settings.mcpClientSettings.url')}
              value={connection.url}
              placeholder="http://localhost:3000/mcp"
              onChange={(e) => set({ url: e.target.value })}
            />
          </SettingsField>
          <SettingsField
            settingKey="connection.authentication"
            title={translate('settings.mcpClientSettings.auth')}
          >
            <select
              aria-label={translate('settings.mcpClientSettings.auth')}
              value={connection.authentication}
              onChange={(e) => {
                set({ authentication: e.target.value as 'none' | 'bearer' });
                if (e.target.value === 'bearer') setReplaceToken(true);
              }}
            >
              <option value="none">{translate('settings.mcpClientSettings.none')}</option>
              <option value="bearer">Bearer</option>
            </select>
          </SettingsField>
          {connection.authentication === 'bearer' && (
            <SettingsField
              title="Bearer token"
              description={translate('settings.mcpClientSettings.authHint')}
            >
              <SettingsChoice
                label={translate('settings.mcpClientSettings.bearer')}
                checked={replaceToken}
                onChange={setReplaceToken}
              />
              {replaceToken && (
                <SettingsInput
                  aria-label="Bearer token"
                  data-initial-focus={recover ? true : undefined}
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              )}
            </SettingsField>
          )}
        </>
      ) : (
        <>
          <SettingsField
            settingKey="connection.command"
            title={translate('settings.mcpClientSettings.executable')}
          >
            <SettingsInput
              aria-label={translate('settings.mcpClientSettings.executable')}
              value={connection.command}
              placeholder="C:\\Tools\\server.exe"
              onChange={(e) => set({ command: e.target.value })}
            />
          </SettingsField>
          <SettingsField
            settingKey="connection.args"
            title={translate('settings.mcpClientSettings.argsArray')}
          >
            <SettingsTextarea
              aria-label={translate('settings.mcpClientSettings.argsArray')}
              value={args}
              rows={3}
              onChange={(e) => setArgs(e.target.value)}
            />
          </SettingsField>
          <SettingsField
            settingKey="connection.cwd"
            title={translate('settings.mcpClientSettings.workingDirectory')}
          >
            <SettingsInput
              aria-label={translate('settings.mcpClientSettings.workingDirectory')}
              value={connection.cwd}
              onChange={(e) => set({ cwd: e.target.value })}
            />
          </SettingsField>
          <SettingsChoice
            label={translate('settings.mcpClientSettings.environment')}
            checked={replaceEnvironment}
            onChange={setReplaceEnvironment}
          />
          {!!status?.environmentNames.length && (
            <p>
              {translate('settings.mcpClientSettings.registeredEnvironment')}
              {status.environmentNames.join(', ')}
            </p>
          )}
          {replaceEnvironment && (
            <SettingsField title={translate('settings.mcpClientSettings.environmentJson')}>
              <SettingsTextarea
                aria-label={translate('settings.mcpClientSettings.environmentJson')}
                value={environment}
                rows={4}
                onChange={(e) => setEnvironment(e.target.value)}
              />
            </SettingsField>
          )}
          <p className="muted">{translate('settings.mcpClientSettings.processHint')}</p>
        </>
      )}
      <SettingsChoice
        label={translate('settings.mcpClientSettings.publish')}
        checked={connection.published}
        onChange={(published) => set({ published })}
      />
      <SettingsField
        settingKey="connection.publishedTools"
        title={translate('settings.mcpClientSettings.publishedTools')}
      >
        <SettingsTextarea
          aria-label={translate('settings.mcpClientSettings.publishedTools')}
          rows={4}
          value={connection.publishedTools.join('\n')}
          onChange={(e) => set({ publishedTools: e.target.value.split('\n') })}
        />
      </SettingsField>
      <p className="muted">{translate('settings.mcpClientSettings.publishedToolsHint')}</p>
    </SettingsDialog>
  );
}
