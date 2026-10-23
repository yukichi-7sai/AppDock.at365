import { hostText } from './i18n';
import { boundedJson, jsonObject, type CustomCommandType } from './custom-commands';

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
const string = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max && !value.includes('\0');
const absolute = (value: string) =>
  /^(?:[A-Za-z]:[\\/]|[\\/]{2}[^\\/.?][^\\/]*[\\/][^\\/]+)/.test(value) &&
  !/[\x00-\x1f]/.test(value);
export function parseProcessLaunch(value: unknown): ProcessLaunchConfig {
  if (!jsonObject(value)) throw Error(hostText('settings.process-launch.settings'));
  boundedJson(value, 16 * 1024);
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
    !string(workingDirectory, 4096) ||
    (workingDirectory !== '' && !absolute(workingDirectory)) ||
    typeof showConsole !== 'boolean'
  )
    throw Error(hostText('settings.process-launch.directory'));
  if (mode === 'executable') {
    if (
      !string(value.executable, 4096) ||
      !absolute(value.executable) ||
      !value.executable.toLowerCase().endsWith('.exe') ||
      !Array.isArray(value.arguments) ||
      value.arguments.length > 64 ||
      value.arguments.some((arg) => !string(arg, 4096))
    )
      throw Error(hostText('settings.process-launch.executable'));
  } else {
    const code = value[mode === 'cmd' ? 'command' : 'script'];
    if (!string(code, 8192) || !code.trim() || (mode === 'cmd' && /[\r\n]/.test(code)))
      throw Error(hostText('settings.process-launch.command'));
  }
  return { ...value, workingDirectory, showConsole } as unknown as ProcessLaunchConfig;
}
const common = {
  workingDirectory: { type: 'string', maxLength: 4096 },
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
        executable: { type: 'string', minLength: 1, maxLength: 4096 },
        arguments: { type: 'array', maxItems: 64, items: { type: 'string', maxLength: 4096 } },
      },
      ['executable', 'arguments'],
    ),
    variant('cmd', { command: { type: 'string', minLength: 1, maxLength: 8192 } }, ['command']),
    variant('powershell', { script: { type: 'string', minLength: 1, maxLength: 8192 } }, [
      'script',
    ]),
  ],
};
export const processCommandType: CustomCommandType = {
  id: 'appdock.process.start',
  title: hostText('settings.process-launch.title'),
  description: hostText('settings.process-launch.hint'),
  configVersion: 1,
  automation: true,
  configSchema: processLaunchSchema,
};
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
