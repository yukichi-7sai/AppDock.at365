import { useHostTranslation } from '../HostTranslation';
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
  const { t: translate } = useHostTranslation();
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
    message: pending ? translate('settings.mcpCommandFields.loading') : '',
    error: [tool && tool.unsupportedReason ? tool.unsupportedReason : '', error ? error : '']
      .filter(Boolean)
      .join('\n'),
  });
  return (
    <>
      <SettingsField title={translate('settings.mcpCommandFields.server')}>
        <select
          aria-label={translate('settings.mcpCommandFields.server')}
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
          <option value="">{translate('settings.mcpCommandFields.select')}</option>
          {serverId && !servers.some((s) => s.id === serverId) && (
            <option value={serverId}>
              {serverId}
              {translate('settings.mcpCommandFields.unregistered')}
            </option>
          )}
          {servers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button type="button" disabled={!serverId || pending} onClick={() => void fetchTools()}>
          {translate('settings.mcpCommandFields.fetch')}
        </button>
        {cursor && (
          <button type="button" disabled={pending} onClick={() => void fetchTools(cursor)}>
            {translate('settings.mcpCommandFields.more')}
          </button>
        )}
      </SettingsField>
      <SettingsField
        title={translate('settings.mcpCommandFields.tool')}
        description={tool?.description}
        hint={translate('settings.mcpCommandFields.schemaHint')}
      >
        <select
          aria-label={translate('settings.mcpCommandFields.tool')}
          value={name}
          disabled={!tools.length || pending}
          onChange={(e) => {
            if (e.target.value) void selectTool(e.target.value);
          }}
        >
          <option value="">{translate('settings.mcpCommandFields.select')}</option>
          {name && !tools.some((t) => t.name === name) && (
            <option value={name}>
              {name}
              {translate('settings.mcpCommandFields.saved')}
            </option>
          )}
          {tools.map((t) => (
            <option key={t.name} value={t.name}>
              {t.title ?? t.name}
              {t.unsupportedReason ? translate('settings.mcpCommandFields.unsupported') : ''}
            </option>
          ))}
        </select>
        {name && (
          <button
            type="button"
            disabled={pending || !serverId}
            onClick={() => void selectTool(name)}
          >
            {translate('settings.mcpCommandFields.refresh')}
          </button>
        )}
      </SettingsField>
      {tool && (
        <>
          <details>
            <summary>{translate('settings.mcpCommandFields.schema')}</summary>
            <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
          </details>
        </>
      )}
      <SettingsField
        error={argsError ? argsError : ''}
        title={translate('settings.mcpCommandFields.args')}
      >
        <SettingsTextarea
          aria-label={translate('settings.mcpCommandFields.args')}
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
              setArgsError(translate('settings.mcpCommandFields.argsObject'));
              onValidity(false);
            }
          }}
        />
      </SettingsField>
      <SettingsField title={translate('settings.mcpCommandFields.timeout')}>
        <SettingsInput
          aria-label={translate('settings.mcpCommandFields.timeout')}
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
