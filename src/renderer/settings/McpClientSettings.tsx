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
import { SettingsSection, SettingsField, SettingsChoice } from '../settings-ui/SettingsSections';
import { settingAnchor } from '../settings-ui/setting-anchor';

type Invoke = (name: string, args?: unknown[]) => Promise<any>;
const definition: SettingDefinition = {
  key: 'connections',
  title: 'MCP接続先',
  type: 'object-list',
  itemTitle: '接続先',
  fields: [
    { key: 'name', title: '名前', type: 'string' },
    { key: 'transport', title: '接続方式', type: 'string' },
    { key: 'status', title: 'このPCの状態', type: 'string' },
  ],
  list: {
    idKey: 'id',
    titleKey: 'name',
    columns: ['name', 'transport', 'status'],
    enabledKey: 'enabled',
  },
};
const states: Record<string, string> = {
  unconfigured: '未設定',
  disabled: 'OFF',
  disconnected: '未接続',
  connecting: '接続中',
  connected: '接続済み',
  error: '要確認',
};
const jobStates: Record<string, string> = {
  running: '実行中',
  succeeded: '応答を受領',
  'tool-error': 'ツール側のエラー',
  failed: '失敗',
  cancelled: '待機を取消',
  'outcome-unknown': '結果不明',
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
      <SettingsSection
        title="登録した接続先"
        hint="登録したツールをAppDockから利用できます。"
        description="名前は共有し、接続設定・認証情報・許可はこのPCだけに保存します。"
        {...settingAnchor('mcp-client', 'connections')}
      >
        <SettingsListTable
          addInTitle
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
      </SettingsSection>
      <SettingsSection
        title="ツールの確認と実行"
        hint="接続先を選ぶと、そのサーバーのツールを取得できます。"
        description="実行ボタンを押すと操作先へ引数を送信します。"
      >
        <SettingsField title="接続先">
          <select
            aria-label="確認するMCP接続先"
            value={serverId}
            disabled={pending}
            onChange={(e) => {
              setServer(e.target.value);
              setTools([]);
              setTool(undefined);
              setCursor(undefined);
              setResult(undefined);
            }}
          >
            <option value="">選択してください</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </SettingsField>
        <button
          className="secondary"
          disabled={!serverId || pending}
          onClick={() =>
            void run(async () => {
              const r = await invoke('mcpTools', [serverId]);
              setTools(r.items);
              setCursor(r.nextCursor);
              setTool(undefined);
            })
          }
        >
          接続してツールを取得
        </button>
        {tools.length > 0 && (
          <SettingsField
            title="ツール"
            description={[tool?.description, tool?.unsupportedReason].filter(Boolean).join(' ／ ')}
          >
            <select
              aria-label="MCPツール"
              value={tool?.name ?? ''}
              disabled={pending}
              onChange={(e) => {
                const name = e.target.value;
                setTool(undefined);
                if (name)
                  void run(async () => setTool((await invoke('mcpTool', [serverId, name])).tool));
              }}
            >
              <option value="">選択してください</option>
              {tools.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.title ?? t.name}
                  {t.unsupportedReason ? '（未対応）' : ''}
                </option>
              ))}
            </select>
          </SettingsField>
        )}
        {cursor && (
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
            続きを取得
          </button>
        )}
        {tool && (
          <>
            <details>
              <summary>引数のSchema</summary>
              <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
            </details>
            <SettingsField title="引数（JSON）">
              <SettingsTextarea
                aria-label="MCPツールの引数"
                rows={6}
                value={args}
                onChange={(e) => setArgs(e.target.value)}
              />
            </SettingsField>
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
              ツールを実行
            </button>
          </>
        )}
      </SettingsSection>
      <SettingsSection
        title="実行状況"
        description={`${!auxiliary?.jobs.length ? '実行したジョブはありません。' : ''}完了後10分間保持します。受付・応答の受領と、操作先での効果は別です。`}
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
            <div className="settings-actions">
              <button
                disabled={pending}
                onClick={() =>
                  void run(async () => setResult(await invoke('mcpGetJob', [j.jobId])))
                }
              >
                結果を表示
              </button>
              {j.state === 'running' && (
                <button
                  disabled={pending}
                  onClick={() =>
                    void run(async () => setResult(await invoke('mcpCancelJob', [j.jobId])))
                  }
                >
                  取り消す
                </button>
              )}
            </div>
          </SettingsField>
        ))}
        {result && (
          <pre aria-label="MCP実行結果">{JSON.stringify(result, null, 2).slice(0, 65536)}</pre>
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
          title="接続先の削除"
          description="共有名簿から削除します。参照するコマンドと入力割当は残り、利用できなくなります。"
          applyLabel="削除"
          onClose={() => setDialog(null)}
          onApply={() => update({ op: 'remove', id: dialog.item!.id }, dialog.revision)}
        >
          <p>{dialog.item?.name}</p>
        </SettingsDialog>
      )}
      {dialog?.kind === 'order' && (
        <SettingsOrderDialog
          title="接続先の表示順"
          listLabel="MCP接続先"
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
      title={original ? 'MCP接続先の編集' : 'MCP接続先の追加'}
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
      <SettingsField title="名前">
        <SettingsInput
          aria-label="名前"
          data-initial-focus
          value={name}
          maxLength={160}
          onChange={(e) => setName(e.target.value)}
        />
      </SettingsField>
      <SettingsField title="説明">
        <SettingsTextarea
          aria-label="説明"
          value={description}
          maxLength={1024}
          onChange={(e) => setDescription(e.target.value)}
        />
      </SettingsField>
      <SettingsChoice
        label="このPCで接続を許可する"
        checked={connection.enabled}
        onChange={(enabled) => set({ enabled })}
      />
      <SettingsField title="接続方式">
        <select
          aria-label="接続方式"
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
          <option value="stdio">stdio（EXEを起動）</option>
        </select>
      </SettingsField>
      {connection.transport === 'http' ? (
        <>
          <SettingsField title="MCPのURL">
            <SettingsInput
              aria-label="MCPのURL"
              value={connection.url}
              placeholder="http://localhost:3000/mcp"
              onChange={(e) => set({ url: e.target.value })}
            />
          </SettingsField>
          <SettingsField title="認証">
            <select
              aria-label="認証"
              value={connection.authentication}
              onChange={(e) => set({ authentication: e.target.value as 'none' | 'bearer' })}
            >
              <option value="none">なし</option>
              <option value="bearer">Bearer</option>
            </select>
          </SettingsField>
          {connection.authentication === 'bearer' && (
            <SettingsField
              title="Bearer token"
              description="認証情報はこのPCに暗号化保存します。URLを変えたときは再入力してください。"
            >
              <SettingsChoice
                label="Bearerを入力・置換する"
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
          <SettingsField title="実行ファイル">
            <SettingsInput
              aria-label="実行ファイル"
              value={connection.command}
              placeholder="C:\\Tools\\server.exe"
              onChange={(e) => set({ command: e.target.value })}
            />
          </SettingsField>
          <SettingsField title="起動引数（JSON配列）">
            <SettingsTextarea
              aria-label="起動引数（JSON配列）"
              value={args}
              rows={3}
              onChange={(e) => setArgs(e.target.value)}
            />
          </SettingsField>
          <SettingsField title="作業フォルダー">
            <SettingsInput
              aria-label="作業フォルダー"
              value={connection.cwd}
              onChange={(e) => set({ cwd: e.target.value })}
            />
          </SettingsField>
          <SettingsChoice
            label="環境変数を入力・置換する"
            checked={replaceEnvironment}
            onChange={setReplaceEnvironment}
          />
          {!!status?.environmentNames.length && (
            <p>登録済み: {status.environmentNames.join(', ')}</p>
          )}
          {replaceEnvironment && (
            <SettingsField title="環境変数（JSON）">
              <SettingsTextarea
                aria-label="環境変数（JSON）"
                value={environment}
                rows={4}
                onChange={(e) => setEnvironment(e.target.value)}
              />
            </SettingsField>
          )}
          <p className="muted">
            指定したEXEを引数配列で起動します。環境変数の値は暗号化保存します。秘密値を起動引数に入れないでください。
          </p>
        </>
      )}
      <SettingsChoice
        label="MCPへ公開する"
        checked={connection.published}
        onChange={(published) => set({ published })}
      />
      <SettingsField title="公開するツール名（1行1件）">
        <SettingsTextarea
          aria-label="公開するツール名（1行1件）"
          rows={4}
          value={connection.publishedTools.join('\n')}
          onChange={(e) => set({ publishedTools: e.target.value.split('\n') })}
        />
      </SettingsField>
      <p className="muted">
        公開する名前を正確に指定してください。空の一覧ではツールを公開しません。操作の許可でMCP接続先の利用をONにした場合だけ外部から利用できます。
      </p>
    </SettingsDialog>
  );
}
