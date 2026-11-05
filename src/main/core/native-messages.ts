import { hostText, type HostTextKey, type HostTextValues } from '../../shared/i18n';
import { hostResources } from '#host-translations';
import { execFile, execFileSync, type ExecFileOptions } from 'node:child_process';

type NativeTextKey = Extract<HostTextKey, `native.${string}`>;
function isNativeKey(key: unknown): key is NativeTextKey {
  return (
    typeof key === 'string' && key.startsWith('native.') && Object.hasOwn(hostResources.ja, key)
  );
}

/** Called only for data from host-owned native processes, never for Applet RPC. */
export function nativeMessage(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const message = value as { hostTextKey?: unknown; values?: unknown };
  if (
    !isNativeKey(message.hostTextKey) ||
    !message.values ||
    typeof message.values !== 'object' ||
    Array.isArray(message.values)
  )
    return undefined;
  if (
    Object.values(message.values).some(
      (v) => typeof v !== 'string' && (typeof v !== 'number' || !Number.isFinite(v)),
    )
  )
    return undefined;
  return hostText(message.hostTextKey, message.values as HostTextValues);
}

export function translateNativePayload(value: any): any {
  const message = nativeMessage(value);
  if (message !== undefined) return message;
  if (Array.isArray(value)) return value.map(translateNativePayload);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, translateNativePayload(item)]),
  );
}

export function nativeRpcMessage(message: any): any {
  const translated = translateNativePayload(message);
  const error = nativeMessage(message?.error?.data);
  if (error !== undefined) translated.error.message = error;
  return translated;
}

export function nativeLogLine(line: string): string {
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === 'string' ? value : (nativeMessage(value) ?? line);
  } catch {
    return line;
  }
}

export function nativeMessages() {
  return Object.fromEntries(
    Object.keys(hostResources.ja)
      .filter(isNativeKey)
      .map((key) => [key, hostText(key)]),
  );
}

function helperError(error: Error, stderr: string): Error {
  const line = stderr.trim();
  if (line) error.message = nativeLogLine(line);
  return error;
}

/** The helper snapshots templates before it reads or replaces any package files. */
export function executeNativeHelper(
  executable: string,
  args: string[],
  options: ExecFileOptions = {},
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      executable,
      ['--host-messages-stdin', ...args],
      { ...options, encoding: 'utf8' },
      (error, stdout, stderr) => {
        if (error) reject(helperError(error, String(stderr)));
        else resolve({ stdout: String(stdout), stderr: String(stderr) });
      },
    );
    child.stdin?.on('error', () => {}); // The execFile completion owns launch/early-exit errors.
    child.stdin?.end(JSON.stringify(nativeMessages()) + '\n');
  });
}

export function recoverNativeUpdate(executable: string, base: string, state: string) {
  try {
    execFileSync(executable, ['--host-messages-stdin', '--recover', base, state], {
      windowsHide: true,
      input: JSON.stringify(nativeMessages()) + '\n',
      encoding: 'utf8',
    });
  } catch (error) {
    if (error instanceof Error)
      throw helperError(error, String((error as { stderr?: unknown }).stderr ?? ''));
    throw error;
  }
}
