import { localizedMetadata } from './translation-metadata';
import { hostText } from './i18n';
import { validateJson, jsonObject, type CustomCommandType } from './custom-commands';

interface ProcessOptions {
  workingDirectory: string;
  showConsole: boolean;
}
export type ProcessLaunchConfig = ProcessOptions &
  (
    | { mode: 'executable'; executable: string; arguments: string[] }
    | { mode: 'cmd'; command: string }
    | { mode: 'powershell'; script: string }
  );
export const defaultProcessLaunch = (): ProcessLaunchConfig => ({
  mode: 'executable',
  executable: '',
  arguments: [],
  workingDirectory: '',
  showConsole: false,
});
const string = (value: unknown): value is string =>
  typeof value === 'string' && !value.includes('\0');
const absolute = (value: string) =>
  /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/.?][^\\/]*[\\/][^\\/]+)/.test(value) &&
  !/[\x00-\x1f]/.test(value);
export function parseProcessLaunch(value: unknown): ProcessLaunchConfig {
  if (!jsonObject(value)) throw Error(hostText('settings.process-launch.settings'));
  validateJson(value);
  const mode = value.mode;
  const fields =
    mode === 'executable'
      ? ['executable', 'arguments']
      : mode === 'cmd'
        ? ['command']
        : mode === 'powershell'
          ? ['script']
          : null;
  if (
    !fields ||
    Object.keys(value).some(
      (key) => !['mode', 'workingDirectory', 'showConsole', ...fields].includes(key),
    )
  )
    throw Error(hostText('settings.process-launch.mode'));
  const workingDirectory = value.workingDirectory === undefined ? '' : value.workingDirectory,
    showConsole = value.showConsole === undefined ? false : value.showConsole;
  if (
    !string(workingDirectory) ||
    (workingDirectory !== '' && !absolute(workingDirectory)) ||
    typeof showConsole !== 'boolean'
  )
    throw Error(hostText('settings.process-launch.directory'));
  if (mode === 'executable') {
    if (
      !string(value.executable) ||
      !absolute(value.executable) ||
      !value.executable.toLowerCase().endsWith('.exe') ||
      !Array.isArray(value.arguments) ||
      value.arguments.some((arg) => !string(arg))
    )
      throw Error(hostText('settings.process-launch.executable'));
  } else {
    const code = value[mode === 'cmd' ? 'command' : 'script'];
    if (!string(code) || !code.trim() || (mode === 'cmd' && /[\r\n]/.test(code)))
      throw Error(hostText('settings.process-launch.command'));
  }
  return { ...value, workingDirectory, showConsole } as unknown as ProcessLaunchConfig;
}
const common = {
  workingDirectory: { type: 'string' },
  showConsole: { type: 'boolean' },
};
const variant = (mode: string, properties: Record<string, unknown>, required: string[]) => ({
  type: 'object',
  properties: { mode: { const: mode }, ...common, ...properties },
  required: ['mode', ...required],
  additionalProperties: false,
});
export const processLaunchSchema = {
  type: 'object',
  oneOf: [
    variant(
      'executable',
      {
        executable: { type: 'string', minLength: 1 },
        arguments: { type: 'array', items: { type: 'string' } },
      },
      ['executable', 'arguments'],
    ),
    variant('cmd', { command: { type: 'string', minLength: 1 } }, ['command']),
    variant('powershell', { script: { type: 'string', minLength: 1 } }, ['script']),
  ],
};
export const processCommandType = localizedMetadata<CustomCommandType>(() => ({
  id: 'appdock.process.start',
  title: hostText('settings.process-launch.title'),
  description: hostText('settings.process-launch.hint'),
  configVersion: 1,
  automation: true,
  configSchema: processLaunchSchema,
}));
export const processLaunchOperations = {
  'processes.start': {
    callers: ['applet'],
    permissions: ['read', 'execute', 'runProcesses'],
    name: 'appdock_start_process',
    description: 'プロセスを起動します。起動受付は終了成功の証明ではありません。',
    inputSchema: processLaunchSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
} as const;
