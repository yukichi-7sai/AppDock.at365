import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { useEffect, useRef, useState } from 'react';
import type { McpServerEntry, McpToolDescriptor } from '../../shared/mcp-client';
import { SettingsInput, SettingsTextarea } from '../settings-ui/SettingsInput';
import { SettingsField } from '../settings-ui/SettingsSections';

export function McpCommandFields({
  config,
  onChange,
  onValidity,
  invoke,
}: {
  config: Record<string, unknown>;
  onChange(config: Record<string, unknown>): void;
  onValidity(valid: boolean): void;
  invoke(name: string, args?: unknown[]): Promise<any>;
}) {
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [tools, setTools] = useState<Partial<McpToolDescriptor>[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [tool, setTool] = useState<McpToolDescriptor>();
  const [args, setArgs] = useState(() => JSON.stringify(config.arguments ?? {}, null, 2));
  const [error, setError] = useState('');
  const [argsError, setArgsError] = useState('');
  const [pending, setPending] = useState(false);
  const generation = useRef(0);
  useEffect(() => {
    let active = true;
    void invoke('mcpServers')
      .then((v) => {
        if (active) setServers(v.items);
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
      generation.current++;
    };
  }, []);
  const run = async (work: () => Promise<void>) => {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };
  const serverId = String(config.serverId ?? ''),
    name = String(config.toolName ?? '');
  const fetchTools = (next?: string) =>
    run(async () => {
      const epoch = generation.current;
      const reply = await invoke('mcpTools', [serverId, next]);
      if (epoch !== generation.current) return;
      setTools(next ? [...tools, ...reply.items] : reply.items);
      setCursor(reply.nextCursor);
    });
  const selectTool = (name: string) =>
    run(async () => {
      const epoch = generation.current;
      const reply = await invoke('mcpTool', [serverId, name]);
      if (epoch !== generation.current) return;
      setTool(reply.tool);
      onChange({ ...config, toolName: name, toolRevision: reply.tool.toolRevision });
    });
  useSettingsFeedback({
    busy: pending,
    message: pending ? 'ツールを確認しています…' : '',
    error: [tool && tool.unsupportedReason ? tool.unsupportedReason : '', error ? error : '']
      .filter(Boolean)
      .join('\n'),
  });
  return (
    <>
      <SettingsField title="MCP接続先">
        <select
          aria-label="MCP接続先"
          value={serverId}
          disabled={pending}
          onChange={(e) => {
            generation.current++;
            setTools([]);
            setCursor(undefined);
            setTool(undefined);
            setError('');
            onChange({ ...config, serverId: e.target.value, toolName: '', toolRevision: '' });
          }}
        >
          <option value="">選択してください</option>
          {serverId && !servers.some((s) => s.id === serverId) && (
            <option value={serverId}>{serverId}（未登録）</option>
          )}
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="button" disabled={!serverId || pending} onClick={() => void fetchTools()}>
          ツールを取得
        </button>
        {cursor && (
          <button type="button" disabled={pending} onClick={() => void fetchTools(cursor)}>
            続きを取得
          </button>
        )}
      </SettingsField>
      <SettingsField
        title="MCPツール"
        description={tool?.description}
        hint="詳細を再取得すると、現在のツール仕様を選び直します。引数を確認してから保存してください。"
      >
        <select
          aria-label="MCPツール"
          value={name}
          disabled={!tools.length || pending}
          onChange={(e) => {
            if (e.target.value) void selectTool(e.target.value);
          }}
        >
          <option value="">選択してください</option>
          {name && !tools.some((t) => t.name === name) && (
            <option value={name}>{name}（保存値）</option>
          )}
          {tools.map((t) => (
            <option key={t.name} value={t.name}>
              {t.title ?? t.name}
              {t.unsupportedReason ? '（未対応）' : ''}
            </option>
          ))}
        </select>
        {name && (
          <button
            type="button"
            disabled={pending || !serverId}
            onClick={() => void selectTool(name)}
          >
            詳細を再取得
          </button>
        )}
      </SettingsField>
      {tool && (
        <>
          <details>
            <summary>ツールの引数Schema</summary>
            <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
          </details>
        </>
      )}
      <SettingsField error={argsError ? argsError : ''} title="固定引数（JSON）">
        <SettingsTextarea
          aria-label="固定引数（JSON）"
          disabled={pending}
          rows={7}
          value={args}
          onChange={(e) => {
            setArgs(e.target.value);
            try {
              const value = JSON.parse(e.target.value);
              if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
              onChange({ ...config, arguments: value });
              setArgsError('');
              onValidity(true);
            } catch {
              setArgsError('引数はJSONオブジェクトで入力してください。');
              onValidity(false);
            }
          }}
        />
      </SettingsField>
      <SettingsField title="待ち時間（ミリ秒）">
        <SettingsInput
          aria-label="待ち時間（ミリ秒）"
          disabled={pending}
          type="number"
          min={1000}
          max={600000}
          step={1000}
          value={String(config.timeoutMs ?? 60000)}
          onChange={(e) => onChange({ ...config, timeoutMs: Number(e.target.value) })}
        />
      </SettingsField>
    </>
  );
}
