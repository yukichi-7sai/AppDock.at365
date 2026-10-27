import { useHostTranslation } from '../HostTranslation';
import { useSettingsFeedback } from '../settings-ui/SettingsStatus';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { McpServerEntry, McpToolDescriptor } from '../../shared/mcp-client';
import { SettingsInput, SettingsTextarea } from '../settings-ui/SettingsInput';
import { SettingsField } from '../settings-ui/SettingsSections';
import { SettingsDescriptionButton } from '../settings-ui/SettingsHintIcon';
import { CustomCommandOptions } from './CustomCommandOptions';

export function McpCommandFields({
  config,
  onChange,
  onValidity,
  invoke,
  advancedOptions,
  refreshKey = 0,
}: {
  config: Record<string, unknown>;
  onChange(config: Record<string, unknown>): void;
  onValidity(valid: boolean): void;
  invoke(name: string, args?: unknown[]): Promise<any>;
  advancedOptions?: ReactNode;
  refreshKey?: number;
}) {
  const { t: translate } = useHostTranslation();
  const [servers, setServers] = useState<McpServerEntry[]>([]);
  const [tools, setTools] = useState<Partial<McpToolDescriptor>[]>([]);
  const [tool, setTool] = useState<McpToolDescriptor>();
  const [args, setArgs] = useState(() => JSON.stringify(config.arguments ?? {}, null, 2));
  const [error, setError] = useState('');
  const [serversError, setServersError] = useState('');
  const [argsError, setArgsError] = useState('');
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);
  const current = useRef({ config, onChange, onValidity, invoke });
  current.current = { config, onChange, onValidity, invoke };
  const serverId = String(config.serverId ?? '');
  const name = String(config.toolName ?? '');
  const needsReview = !!tool && tool.toolRevision !== config.toolRevision;

  useEffect(() => {
    let active = true;
    setServersError('');
    void current.current
      .invoke('mcpServers')
      .then((reply) => {
        if (active) setServers(reply.items);
      })
      .catch((reason) => {
        if (active) setServersError(String(reason));
      });
    return () => {
      active = false;
    };
  }, [retry]);

  useEffect(() => {
    const epoch = ++generation.current;
    setTools([]);
    setTool(undefined);
    setError('');
    setPending(!!serverId);
    if (serverId)
      void (async () => {
        try {
          const items: Partial<McpToolDescriptor>[] = [];
          let cursor: string | undefined;
          do {
            const reply = await current.current.invoke('mcpTools', [serverId, cursor]);
            if (epoch !== generation.current) return;
            items.push(...reply.items);
            cursor = reply.nextCursor;
          } while (cursor);
          setTools(items);
          const savedName = String(current.current.config.toolName ?? '');
          if (savedName) {
            const reply = await current.current.invoke('mcpTool', [serverId, savedName]);
            if (epoch !== generation.current) return;
            // Opening an existing command never adopts a different tool revision.
            setTool(reply.tool);
          }
        } catch (reason) {
          if (epoch === generation.current)
            setError(reason instanceof Error ? reason.message : String(reason));
        } finally {
          if (epoch === generation.current) setPending(false);
        }
      })();
    return () => {
      generation.current++;
    };
  }, [serverId, refreshKey, retry]);

  const selectTool = async (nextName: string) => {
    const epoch = ++generation.current;
    setTool(undefined);
    setError('');
    onChange({ ...current.current.config, toolName: nextName, toolRevision: '' });
    if (!nextName) {
      setPending(false);
      return;
    }
    setPending(true);
    try {
      const reply = await current.current.invoke('mcpTool', [serverId, nextName]);
      if (epoch !== generation.current) return;
      setTool(reply.tool);
      // Retain argument and timeout edits made while discovery was in progress.
      current.current.onChange({
        ...current.current.config,
        toolName: nextName,
        toolRevision: reply.tool.toolRevision,
      });
    } catch (reason) {
      if (epoch === generation.current)
        setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      if (epoch === generation.current) setPending(false);
    }
  };
  useEffect(() => {
    current.current.onValidity(!argsError && !pending && !needsReview);
  }, [argsError, pending, needsReview]);
  useSettingsFeedback({
    busy: pending,
    message: pending ? translate('settings.mcpCommandFields.loading') : '',
    error: [tool?.unsupportedReason, serversError, error].filter(Boolean).join('\n'),
    onRetry: serversError || error ? () => setRetry((value) => value + 1) : undefined,
  });
  return (
    <>
      <SettingsField title={translate('settings.mcpCommandFields.server')}>
        <select
          data-testid="custom-command-mcp-server"
          aria-label={translate('settings.mcpCommandFields.server')}
          value={serverId}
          onChange={(event) => {
            generation.current++;
            setTools([]);
            setTool(undefined);
            setError('');
            onChange({ ...config, serverId: event.target.value, toolName: '', toolRevision: '' });
          }}
        >
          <option value="">{translate('settings.mcpCommandFields.select')}</option>
          {serverId && !servers.some((server) => server.id === serverId) && (
            <option value={serverId}>
              {serverId}
              {translate('settings.mcpCommandFields.unregistered')}
            </option>
          )}
          {servers.map((server) => (
            <option key={server.id} value={server.id}>
              {server.name}
            </option>
          ))}
        </select>
      </SettingsField>
      <SettingsField title={translate('settings.mcpCommandFields.tool')}>
        <select
          data-testid="custom-command-mcp-tool"
          aria-label={translate('settings.mcpCommandFields.tool')}
          value={name}
          disabled={!tools.length || pending}
          onChange={(event) => void selectTool(event.target.value)}
        >
          <option value="">{translate('settings.mcpCommandFields.select')}</option>
          {name && !tools.some((entry) => entry.name === name) && (
            <option value={name}>
              {name}
              {translate('settings.mcpCommandFields.saved')}
            </option>
          )}
          {tools.map((entry) => (
            <option key={entry.name} value={entry.name}>
              {entry.title ?? entry.name}
              {entry.unsupportedReason ? translate('settings.mcpCommandFields.unsupported') : ''}
            </option>
          ))}
        </select>
        {tool?.description && (
          <div
            className="custom-command-tool-description"
            data-testid="custom-command-tool-description"
          >
            <span aria-hidden="true">{tool.description}</span>
            <SettingsDescriptionButton
              title={tool.title ?? tool.name}
              description={tool.description}
              label={translate('settings.mcpCommandFields.readDescription')}
            />
          </div>
        )}
      </SettingsField>
      {needsReview && (
        <div className="custom-command-tool-review" data-testid="custom-command-tool-review">
          <p role="status">{translate('settings.mcpCommandFields.changed')}</p>
          <button
            type="button"
            data-testid="custom-command-accept-tool"
            onClick={() => onChange({ ...config, toolRevision: tool!.toolRevision })}
          >
            {translate('settings.mcpCommandFields.accept')}
          </button>
        </div>
      )}
      <SettingsField error={argsError} title={translate('settings.mcpCommandFields.args')}>
        <SettingsTextarea
          data-testid="custom-command-mcp-arguments"
          aria-label={translate('settings.mcpCommandFields.args')}
          rows={5}
          value={args}
          onChange={(event) => {
            setArgs(event.target.value);
            try {
              const value = JSON.parse(event.target.value);
              if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error();
              onChange({ ...config, arguments: value });
              setArgsError('');
            } catch {
              setArgsError(translate('settings.mcpCommandFields.argsObject'));
            }
          }}
        />
      </SettingsField>
      <CustomCommandOptions>
        <SettingsField title={translate('settings.mcpCommandFields.timeout')}>
          <SettingsInput
            aria-label={translate('settings.mcpCommandFields.timeout')}
            type="number"
            min={1000}
            max={600000}
            step={1000}
            value={String(config.timeoutMs ?? 60000)}
            onChange={(event) => onChange({ ...config, timeoutMs: Number(event.target.value) })}
          />
        </SettingsField>
        {tool && (
          <details className="custom-command-schema">
            <summary>{translate('settings.mcpCommandFields.schema')}</summary>
            <pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre>
          </details>
        )}
        {advancedOptions}
      </CustomCommandOptions>
    </>
  );
}
