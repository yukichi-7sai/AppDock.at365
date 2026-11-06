import os from 'node:os';
import path from 'node:path';
import { hostText } from '../../shared/i18n';
import type { McpServerSettings, ReceiverSettings } from '../../shared/automation';
import { parseMcpServerSettings } from './automation-network';
import { codexConfigPath, codexServerName } from './codex-registration';

interface CodexConfig extends ReceiverSettings {
  token: string;
  configFile: string;
  serverName: string;
  owned: Record<string, string>;
}

export interface AutomationConfig {
  version: 2;
  token: string;
  codex: CodexConfig;
}

export function defaultAutomationConfig(): AutomationConfig {
  return {
    version: 2,
    token: '',
    codex: {
      enabled: false,
      port: 0,
      token: '',
      serverName: 'AppDock',
      configFile: path.join(
        process.env.CODEX_HOME || path.join(os.homedir(), '.codex'),
        'config.toml',
      ),
      owned: {},
    },
  };
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function invalid(): never {
  throw Error(hostText('services.automation.readFailed'));
}

function parseCodexConfig(value: unknown): CodexConfig {
  if (
    !object(value) ||
    typeof value.enabled !== 'boolean' ||
    typeof value.port !== 'number' ||
    !Number.isInteger(value.port) ||
    value.port < 0 ||
    value.port > 65535 ||
    typeof value.token !== 'string' ||
    !object(value.owned) ||
    Object.values(value.owned).some(
      (hash) => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash),
    )
  )
    invalid();
  return {
    enabled: value.enabled,
    port: value.port,
    token: value.token,
    configFile: codexConfigPath(value.configFile),
    serverName: codexServerName(value.serverName ?? 'AppDock'),
    owned: value.owned as CodexConfig['owned'],
  };
}

export function parseAutomationConfig(value: unknown): {
  config: AutomationConfig;
  legacy?: McpServerSettings;
} {
  if (
    !object(value) ||
    (value.version !== 1 && value.version !== 2) ||
    typeof value.token !== 'string'
  )
    invalid();
  if (value.version === 2)
    return {
      config: {
        version: 2,
        token: value.token,
        codex: parseCodexConfig(value.codex),
      },
    };

  if (!value.token) invalid();
  const legacy = parseMcpServerSettings({
    enabled: value.enabled,
    port: value.port,
    connectionScope: value.connectionScope === undefined ? 'local' : value.connectionScope,
    networkHostnames: value.networkHostnames === undefined ? [] : value.networkHostnames,
  });
  const codex = parseCodexConfig({ ...value, port: 0, token: '' });
  return { config: { version: 2, token: value.token, codex }, legacy };
}
