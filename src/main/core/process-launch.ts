import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { JsonLinePeer } from './rpc';
import { parseProcessLaunch } from '../../shared/process-launch';
import type { InputInvocation } from './command-contexts';

export class ProcessLaunchError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
const fail = (code: string, message: string): never => {
  throw new ProcessLaunchError(code, message);
};
function quote(value: string) {
  return '"' + value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1') + '"';
}
export function processLaunchSpec(
  raw: unknown,
  appDirectory: string,
  systemRoot = process.env.SystemRoot,
) {
  const config = parseProcessLaunch(raw);
  if (
    config.mode !== 'executable' &&
    (!systemRoot || !path.win32.isAbsolute(systemRoot) || /[\x00-\x1f]/.test(systemRoot))
  )
    return fail('CONFIGURATION_REQUIRED', 'Windowsの実行環境を確認してください。');
  const file =
    config.mode === 'executable'
      ? config.executable
      : path.win32.join(
          systemRoot!,
          'System32',
          ...(config.mode === 'cmd'
            ? ['cmd.exe']
            : ['WindowsPowerShell', 'v1.0', 'powershell.exe']),
        );
  const args =
    config.mode === 'executable'
      ? config.arguments
      : config.mode === 'cmd'
        ? ['/d', '/s', '/c', '"' + config.command + '"']
        : [
            '-NoProfile',
            '-NonInteractive',
            '-EncodedCommand',
            Buffer.from(config.script, 'utf16le').toString('base64'),
          ];
  const cwd =
    config.workingDirectory ||
    (config.mode === 'executable' ? path.win32.dirname(file) : appDirectory);
  const length =
    quote(file).length +
    1 +
    args.map(config.mode === 'cmd' ? (value) => value : quote).join(' ').length;
  if (length >= 32767 || (config.mode === 'cmd' && length > 8191))
    return fail('INVALID_ARGUMENT', '実行するコマンドが長すぎます。');
  return { file, args, cwd, showConsole: config.showConsole, verbatim: config.mode === 'cmd' };
}
export class ProcessLaunchService {
  private closed = false;
  private child?: ChildProcessWithoutNullStreams;
  private peer?: JsonLinePeer;
  constructor(
    private appDirectory: string,
    private executable = path.resolve('.artifacts/dotnet-host/process/AppDock.ProcessHost.exe'),
  ) {}
  private async worker() {
    if (!this.peer) {
      const child = spawn(this.executable, [], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const peer = new JsonLinePeer(
        child.stdout,
        child.stdin,
        async () => {
          throw Error('Unknown process event');
        },
        5000,
      );
      this.child = child;
      this.peer = peer;
      child.stderr.resume();
      const closed = () => {
        peer.close();
        if (this.peer === peer) {
          this.peer = undefined;
          this.child = undefined;
        }
      };
      child.once('error', closed);
      child.once('exit', closed);
    }
    const peer = this.peer;
    await peer.request('processes.ready');
    return peer;
  }
  async start(raw: unknown, context: InputInvocation = {}, authorized: () => boolean = () => true) {
    let spec: ReturnType<typeof processLaunchSpec>;
    try {
      spec = processLaunchSpec(raw, this.appDirectory);
    } catch (error) {
      if (error instanceof ProcessLaunchError) throw error;
      return fail('INVALID_ARGUMENT', '実行ファイル・引数・作業フォルダーを確認してください。');
    }
    const check = () => {
      if (this.closed) return fail('NOT_READY', 'プロセス起動は終了しています。');
      if (context.signal?.aborted) return fail('CANCELLED', '起動前に取り消されました。');
      if (!authorized()) return fail('API_DISABLED', 'プロセスの起動を許可してください。');
    };
    check();
    let peer: JsonLinePeer;
    try {
      peer = await this.worker();
      const [file, cwd] = await Promise.all([fs.stat(spec.file), fs.stat(spec.cwd)]);
      if (!file.isFile() || !cwd.isDirectory())
        return fail('INVALID_ARGUMENT', '実行ファイルと作業フォルダーを確認してください。');
    } catch (error) {
      check();
      if (error instanceof ProcessLaunchError) throw error;
      return fail(
        'PROCESS_START_FAILED',
        '実行環境・実行ファイル・作業フォルダーの存在とアクセス権を確認してください。',
      );
    }
    check();
    let result: { ok: boolean };
    try {
      result = await peer.request('processes.start', spec);
    } catch {
      return fail(
        'OUTCOME_UNKNOWN',
        'プロセスの起動を確認できません。結果を確認してから再実行してください。',
      );
    }
    if (!result?.ok)
      return fail(
        'PROCESS_START_FAILED',
        'プロセスを起動できません。実行ファイルと権限を確認してください。',
      );
    return { completion: 'processStarted' as const, effectVerified: false as const };
  }
  close() {
    this.closed = true;
    this.peer?.close();
    this.child?.kill();
    this.peer = undefined;
    this.child = undefined;
  }
}
