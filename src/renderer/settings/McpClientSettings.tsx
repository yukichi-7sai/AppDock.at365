import { hostText } from '../../shared/i18n';
import { useHostTranslation } from '../HostTranslation';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { useRef, useState } from 'react';
import type { Settings, SettingDefinition } from '../../shared/contracts';
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

type Invoke = (name: string, args?: unknown[]) => Promise<any>;
const definition: SettingDefinition = {
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
};
const states: Record<string, string> = {
  unconfigured: hostText('settings.mcpClientSettings.unconfigured'),
  disabled: 'OFF',
  disconnected: hostText('settings.mcpClientSettings.disconnected'),
  connecting: hostText('settings.mcpClientSettings.connecting'),
  connected: hostText('settings.mcpClientSettings.connected'),
  error: hostText('settings.mcpClientSettings.attention'),
};
const jobStates: Record<string, string> = {
  running: hostText('settings.mcpClientSettings.running'),
  succeeded: hostText('settings.mcpClientSettings.completed'),
  'tool-error': hostText('settings.mcpClientSettings.toolError'),
  failed: hostText('settings.mcpClientSettings.failed'),
  cancelled: hostText('settings.mcpClientSettings.canceled'),
  'outcome-unknown': hostText('settings.mcpClientSettings.unknownResult'),
};
export function McpClientSettingsForm({
  settings,
  auxiliary,
  invoke,
  busy,
}: {
  settings: Settings;
  auxiliary?: SettingsPageAuxiliary['mcpClient'];
  invoke: Invoke;
  busy: boolean;
}) {
  const { t: translate } = useHostTranslation();
  const items = settings.mcpServers?.items ?? [];
  const [dialog, setDialog] = useState<
    | null
    | {
        kind: 'edit' | 'delete';
        item: McpServerEntry | null;
        status?: McpLocalStatus;
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
  const run = async (work: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setPending(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      running.current = false;
      setPending(false);
    }
  };
  const update = (op: Record<string, unknown>, revision = auxiliary?.revision) =>
    invoke('updateMcpConnection', [{ ...op, expectedRevision: revision }]);
  const open = (kind: 'edit' | 'delete', item: McpServerEntry | null) =>
    setDialog({
      kind,
      item: structuredClone(item),
      status: structuredClone(auxiliary?.connections.find((c) => c.id === item?.id)),
      revision: auxiliary?.revision ?? '',
    });
  useSettingsFeedback({
    error: [auxiliary?.error ? auxiliary.error : '', error ? error : ''].filter(Boolean).join('\n'),
  });
  return (
    <div className="settings-sections">
      <SettingsContent
        data-testid="mcp-client-connections"
        {...settingAnchor('mcp-client', 'connections')}
      >
        <SettingsListTable
          addInTitle
          orderInTitle
          definition={definition}
          maxItems={32}
          busy={busy || pending || !auxiliary || !!auxiliary.error}
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
                void run(async () => {
                  const r = await invoke('mcpTools', [id]);
                  setTools(r.items);
                  setCursor(r.nextCursor);
                });
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
            description={[tool?.description, tool?.unsupportedReason].filter(Boolean).join(' ／ ')}
          >
            <select
              aria-label={translate('settings.mcpClientSettings.toolLabel')}
              value={tool?.name ?? ''}
              disabled={pending}
              onChange={(e) => {
                const name = e.target.value;
                setTool(undefined);
                if (name)
                  void run(async () => setTool((await invoke('mcpTool', [serverId, name])).tool));
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
                void run(async () => {
                  const r = await invoke('mcpTools', [serverId, cursor]);
                  setTools([...tools, ...r.items]);
                  setCursor(r.nextCursor);
                })
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
                  void run(async () =>
                    setResult(
                      await invoke('mcpCall', [
                        {
                          serverId,
                          name: tool.name,
                          toolRevision: tool.toolRevision,
                          arguments: JSON.parse(args),
                          requestId: crypto.randomUUID(),
                        },
                      ]),
                    ),
                  )
                }
              >
                {translate('settings.mcpClientSettings.execute')}
              </button>
            </SettingsActions>
          </>
        )}
      </SettingsSection>
      <SettingsSection
        title={translate('settings.mcpClientSettings.jobs')}
        description={translate('settings.mcpClientSettings.jobsHint', {
          value: !auxiliary?.jobs.length ? translate('settings.mcpClientSettings.noJobs') : '',
        })}
      >
        {auxiliary?.jobs.map((j) => (
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
                onClick={() =>
                  void run(async () => setResult(await invoke('mcpGetJob', [j.jobId])))
                }
              >
                {translate('settings.mcpClientSettings.showResult')}
              </button>
              {j.state === 'running' && (
                <button
                  disabled={pending}
                  onClick={() =>
                    void run(async () => setResult(await invoke('mcpCancelJob', [j.jobId])))
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
            {JSON.stringify(result, null, 2).slice(0, 65536)}
          </pre>
        )}
      </SettingsSection>
      {dialog?.kind === 'edit' && (
        <McpConnectionDialog
          original={dialog.item}
          status={dialog.status}
          onClose={() => setDialog(null)}
          onApply={(value) => update({ op: 'save', ...value }, dialog.revision)}
        />
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
  status,
  onApply,
  onClose,
}: {
  original: McpServerEntry | null;
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
    [replaceToken, setReplaceToken] = useState(!status?.tokenConfigured),
    [environment, setEnvironment] = useState('{}'),
    [replaceEnvironment, setReplaceEnvironment] = useState(false);
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
          ...(replaceToken ? { token } : {}),
          ...(replaceEnvironment ? { environment: JSON.parse(environment) } : {}),
        })
      }
    >
      <SettingsField title={translate('settings.mcpClientSettings.name')}>
        <SettingsInput
          aria-label={translate('settings.mcpClientSettings.name')}
          data-initial-focus
          value={name}
          maxLength={160}
          onChange={(e) => setName(e.target.value)}
        />
      </SettingsField>
      <SettingsField title={translate('settings.mcpClientSettings.description')}>
        <SettingsTextarea
          aria-label={translate('settings.mcpClientSettings.description')}
          value={description}
          maxLength={1024}
          onChange={(e) => setDescription(e.target.value)}
        />
      </SettingsField>
      <SettingsChoice
        label={translate('settings.mcpClientSettings.allow')}
        checked={connection.enabled}
        onChange={(enabled) => set({ enabled })}
      />
      <SettingsField title={translate('settings.mcpClientSettings.transport')}>
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
          <SettingsField title={translate('settings.mcpClientSettings.url')}>
            <SettingsInput
              aria-label={translate('settings.mcpClientSettings.url')}
              value={connection.url}
              placeholder="http://localhost:3000/mcp"
              onChange={(e) => set({ url: e.target.value })}
            />
          </SettingsField>
          <SettingsField title={translate('settings.mcpClientSettings.auth')}>
            <select
              aria-label={translate('settings.mcpClientSettings.auth')}
              value={connection.authentication}
              onChange={(e) => set({ authentication: e.target.value as 'none' | 'bearer' })}
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
          <SettingsField title={translate('settings.mcpClientSettings.executable')}>
            <SettingsInput
              aria-label={translate('settings.mcpClientSettings.executable')}
              value={connection.command}
              placeholder="C:\\Tools\\server.exe"
              onChange={(e) => set({ command: e.target.value })}
            />
          </SettingsField>
          <SettingsField title={translate('settings.mcpClientSettings.argsArray')}>
            <SettingsTextarea
              aria-label={translate('settings.mcpClientSettings.argsArray')}
              value={args}
              rows={3}
              onChange={(e) => setArgs(e.target.value)}
            />
          </SettingsField>
          <SettingsField title={translate('settings.mcpClientSettings.workingDirectory')}>
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
      <SettingsField title={translate('settings.mcpClientSettings.publishedTools')}>
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
