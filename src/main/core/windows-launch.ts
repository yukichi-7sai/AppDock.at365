import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import net from 'node:net';
import fs from 'node:fs';
import { atomicWrite } from './settings';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { HostSettings, LaunchState } from '../../shared/contracts';

const execute = promisify(execFile);
export class WindowsOperationCancelled extends Error {}
export const psString = (value: string) => `'${value.replace(/'/g, "''")}'`;
export const encodedScript = (value: string) => Buffer.from(value, 'utf16le').toString('base64');
export const powershell = () =>
  path.win32.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
export async function runPowerShell(script: string, encode = true): Promise<string> {
  try {
    const result = await execute(
      powershell(),
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        encode ? '-EncodedCommand' : '-Command',
        (encode ? encodedScript : (value: string) => value)(
          `$ProgressPreference='SilentlyContinue'\n[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)\ntry { ${script}\n} catch { $failure=$_.Exception; while ($failure) { if ($failure.NativeErrorCode -eq 1223) { exit 1223 }; $failure=$failure.InnerException }; [Console]::Error.WriteLine($_.Exception.Message); exit 1 }`,
        ),
      ],
      {
        windowsHide: true,
        timeout: 180000,
        maxBuffer: 1024 * 1024,
      },
    );
    return result.stdout.trim();
  } catch (error) {
    const failure = error as { code?: string | number; stderr?: string };
    if (failure.code === 1223)
      throw new WindowsOperationCancelled('Windowsの操作をキャンセルしました。');
    throw Error(
      `Windowsの操作に失敗しました (${failure.code ?? 'timeout'})。${failure.stderr?.includes('CLIXML') ? '' : (failure.stderr?.trim().slice(0, 500) ?? '')}`,
    );
  }
}

export interface LaunchTask {
  administratorAccount: boolean;
  elevated: boolean;
  sid: string;
  xml: string | null;
  registered: boolean;
  taskElevated: boolean;
}
interface LaunchRecovery {
  version: 1;
  before: LaunchTask;
  next: Pick<HostSettings, 'startAtLogon' | 'runAsAdministrator'>;
  afterXml?: string | null;
  committed?: boolean;
}
export class WindowsLaunch {
  state: LaunchState;
  private busy = false;
  recoveryPending = false;
  get isBusy() {
    return this.busy;
  }
  private readonly prefix: string;
  constructor(
    readonly executable: string,
    readonly directory: string,
    readonly args: string[] = [],
    supported = process.platform === 'win32' && !!executable,
    private readonly run = runPowerShell,
    private readonly health?: { failed(): void; succeeded(): void; changed(): void },
    private readonly recovery?: {
      file: string;
      desiredSaved(next: LaunchRecovery['next']): boolean;
    },
  ) {
    const id = createHash('sha256')
      .update(`${executable.toLowerCase()}\n${directory.toLowerCase()}`)
      .digest('hex')
      .slice(0, 20);
    this.prefix = `AppDock.at365-${id}-`;
    this.state = {
      supported,
      elevated: false,
      registered: false,
      taskElevated: false,
      taskName: '',
    };
  }
  private recoveryRecord(): LaunchRecovery | undefined {
    if (!this.recovery || !fs.existsSync(this.recovery.file)) return;
    if (fs.statSync(this.recovery.file).size > 2 * 1024 * 1024)
      throw Error('起動設定の復旧記録が不正です。');
    const record = JSON.parse(fs.readFileSync(this.recovery.file, 'utf8')) as LaunchRecovery;
    if (
      record.version !== 1 ||
      !record.before ||
      !/^S-1-[0-9-]+$/.test(record.before.sid) ||
      ['administratorAccount', 'elevated', 'registered', 'taskElevated'].some(
        (key) => typeof (record.before as any)[key] !== 'boolean',
      ) ||
      (record.before.xml !== null && typeof record.before.xml !== 'string') ||
      !record.next ||
      typeof record.next.startAtLogon !== 'boolean' ||
      typeof record.next.runAsAdministrator !== 'boolean' ||
      (record.afterXml !== undefined &&
        record.afterXml !== null &&
        typeof record.afterXml !== 'string')
    )
      throw Error('起動設定の復旧記録が不正です。');
    return record;
  }
  private completeRecovery() {
    try {
      if (this.recovery && fs.existsSync(this.recovery.file)) fs.unlinkSync(this.recovery.file);
      this.recoveryPending = false;
    } catch {
      this.recoveryPending = true;
      this.health?.failed();
    }
  }
  async checkRecovery() {
    try {
      const record = this.recoveryRecord();
      if (!record) return;
      const actual = await this.read();
      if (actual.sid !== record.before.sid)
        throw Error('起動設定の復旧記録の利用者が一致しません。');
      if (
        record.committed ||
        actual.xml === record.before.xml ||
        (this.recovery!.desiredSaved(record.next) &&
          actual.registered === record.next.startAtLogon &&
          (!actual.registered || actual.taskElevated === record.next.runAsAdministrator))
      )
        this.completeRecovery();
      else {
        this.recoveryPending = true;
        this.health?.failed();
      }
    } catch {
      this.recoveryPending = true;
      this.health?.failed();
    }
  }
  async recoverSavedTask() {
    if (this.busy) throw Error('起動設定を変更中です。');
    this.busy = true;
    try {
      const record = this.recoveryRecord();
      if (!record) {
        this.recoveryPending = false;
        return;
      }
      const actual = await this.read();
      if (actual.sid !== record.before.sid) throw Error('同じWindowsユーザーで復旧してください。');
      if (actual.xml !== record.before.xml) {
        if (record.afterXml === undefined || actual.xml !== record.afterXml)
          throw Error(
            'Windowsの登録が復旧記録と異なります。外部の変更を保持したため、登録を確認してください。',
          );
        const elevated = !actual.elevated && (actual.taskElevated || record.before.taskElevated);
        const restore = record.before.xml
          ? `
$restore=$service.NewTask(0)
$restore.XmlText=${psString(record.before.xml)}
$restoreUser=$restore.Principal.UserId
if ($restoreUser -notmatch '^S-1-') { $restoreUser=([Security.Principal.NTAccount]$restoreUser).Translate([Security.Principal.SecurityIdentifier]).Value }
if ($restore.Actions.Count -ne 1 -or $restore.Actions.Item(1).Path -ine ${psString(this.executable)} -or [string]$restore.Actions.Item(1).Arguments -cne ${psString(this.argumentLine())} -or $restoreUser -ine $sid -or $restore.Principal.LogonType -ne 3) { throw 'Recovery task ownership mismatch' }
$null=$folder.RegisterTaskDefinition($name,$restore,6,$sid,$null,3,'D:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FA;;;'+$sid+')')`
          : '\nif ($task) { $folder.DeleteTask($name,0) }';
        await this.mutate(
          `if ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne ${psString(record.before.sid)}) { throw 'Use the same Windows user' }\n` +
            this.context() +
            restore,
          elevated,
        );
        await this.read();
      }
      this.completeRecovery();
      if (this.recoveryPending) throw Error('起動設定の復旧記録を保存先から削除できません。');
      this.health?.succeeded();
    } finally {
      this.busy = false;
      this.health?.changed();
    }
  }
  private context() {
    return `$ErrorActionPreference='Stop'
$identity=[Security.Principal.WindowsIdentity]::GetCurrent()
$sid=$identity.User.Value
$admin=([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$name=${psString(this.prefix)}+$sid
$service=New-Object -ComObject 'Schedule.Service'
$service.Connect()
$folder=$service.GetFolder('\\')
$task=$null
try { $task=$folder.GetTask($name) } catch { if ($_.Exception.HResult -ne -2147024894) { throw } }
if ($task) {
  $definition=$task.Definition
  $taskUser=$definition.Principal.UserId
  if ($taskUser -notmatch '^S-1-') { $taskUser=([Security.Principal.NTAccount]$taskUser).Translate([Security.Principal.SecurityIdentifier]).Value }
  if ($definition.Actions.Count -ne 1 -or $definition.Actions.Item(1).Path -ine ${psString(this.executable)} -or [string]$definition.Actions.Item(1).Arguments -cne ${psString(this.argumentLine())} -or $taskUser -ine $sid -or $definition.Principal.LogonType -ne 3) { throw 'AppDock task ownership mismatch' }
}`;
  }
  private argumentLine() {
    // Windows CommandLineToArgvW quoting, including trailing backslashes.
    return this.args
      .map((arg) => `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`)
      .join(' ');
  }
  async read(): Promise<LaunchTask> {
    const data = JSON.parse(
      await this.run(`${this.context()}
@{ administratorAccount=($identity.Groups.Value -contains 'S-1-5-32-544'); elevated=$admin; sid=$sid; xml=$(if ($task) { $task.Xml } else { $null }); registered=($null -ne $task -and $task.Enabled); taskElevated=($null -ne $task -and $task.Definition.Principal.RunLevel -eq 1) } | ConvertTo-Json -Compress`),
    ) as LaunchTask;
    this.state = {
      supported: this.state.supported,
      elevated: data.elevated,
      registered: data.registered,
      taskElevated: data.taskElevated,
      taskName: `${this.prefix}${data.sid}`,
    };
    return data;
  }
  async refresh(): Promise<LaunchState> {
    if (!this.state.supported) return this.state;
    try {
      await this.read();
    } catch (error) {
      this.state = { ...this.state, error: `起動設定を確認できません: ${String(error)}` };
    }
    return this.state;
  }
  private async mutate(script: string, elevated: boolean) {
    const body = `try { ${script}\nexit 0 } catch { exit 1 }`;
    if (elevated) {
      // UAC is requested only for this explicit change. Never auto-confirm it.
      // Keep the outer wrapper raw: encoding its already-encoded child again can
      // exceed Windows' command-line limit when restoring an existing task XML.
      await this.run(
        `$ErrorActionPreference='Stop'
$child=Start-Process -FilePath ${psString(powershell())} -Verb RunAs -WindowStyle Hidden -ArgumentList '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encodedScript(body)}' -Wait -PassThru
if ($child.ExitCode -ne 0) { throw 'Windows could not update the startup task' }`,
        false,
      );
    } else await this.run(body);
  }
  async save<T>(
    next: HostSettings,
    previous: HostSettings,
    preflight: () => void,
    commit: () => T,
  ): Promise<T> {
    if (this.busy) throw Error('起動設定を変更中です。完了後に保存してください。');
    if (this.recoveryPending) throw Error('一般設定で中断したWindows起動設定を復旧してください。');
    this.busy = true;
    this.health?.changed();
    const read = async () => {
      try {
        return await this.read();
      } catch (error) {
        if (!(error instanceof WindowsOperationCancelled)) this.health?.failed();
        throw error;
      }
    };
    try {
      preflight();
      let checked: LaunchTask | undefined;
      if (this.state.supported && next.runAsAdministrator && !previous.runAsAdministrator) {
        checked = await read();
        if (!checked.administratorAccount && !checked.elevated)
          throw Error(
            'このWindowsユーザーは管理者ではありません。管理者ユーザーでAppDockを使用してください。',
          );
      }
      const changed =
        next.startAtLogon !== previous.startAtLogon ||
        (next.startAtLogon && next.runAsAdministrator !== previous.runAsAdministrator) ||
        (this.state.supported &&
          !this.state.error &&
          (this.state.registered !== next.startAtLogon ||
            (next.startAtLogon && this.state.taskElevated !== next.runAsAdministrator)));
      if (!changed) return commit();
      if (!this.state.supported)
        throw Error('起動設定はWindowsの発行版AppDockで変更してください。');
      const before = checked ?? (await read());
      const elevate =
        !before.elevated && ((next.startAtLogon && next.runAsAdministrator) || before.taskElevated);
      if (elevate && !before.administratorAccount)
        throw Error(
          'このWindowsユーザーは管理者ではありません。同じユーザーの管理者権限が必要です。',
        );
      const script = next.startAtLogon
        ? `${this.context()}
$definition=$service.NewTask(0)
$definition.RegistrationInfo.Description='AppDock.at365 logon startup'
$definition.Principal.UserId=$sid
$definition.Principal.LogonType=3
$definition.Principal.RunLevel=${next.runAsAdministrator ? 1 : 0}
$definition.Settings.Enabled=$true
$definition.Settings.DisallowStartIfOnBatteries=$false
$definition.Settings.StopIfGoingOnBatteries=$false
$definition.Settings.ExecutionTimeLimit='PT0S'
$definition.Settings.MultipleInstances=2
$trigger=$definition.Triggers.Create(9)
$trigger.UserId=$sid
$trigger.Delay='PT3S'
$action=$definition.Actions.Create(0)
$action.Path=${psString(this.executable)}
$action.Arguments=${psString(this.argumentLine())}
$action.WorkingDirectory=${psString(path.win32.dirname(this.executable))}
$security='D:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FA;;;'+$sid+')'
$null=$folder.RegisterTaskDefinition($name,$definition,6,$sid,$null,3,$security)`
        : `${this.context()}
if ($task) { $folder.DeleteTask($name,0) }`;
      // If RunAs credentials belong to a different user, refuse that account's task.
      const sameUser = `$expectedSid=${psString(before.sid)}
if ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne $expectedSid) { throw 'Use the same Windows user for this operation' }
`;
      const recovery: LaunchRecovery = {
        version: 1,
        before,
        next: { startAtLogon: next.startAtLogon, runAsAdministrator: next.runAsAdministrator },
      };
      if (this.recovery)
        atomicWrite(this.recovery.file, JSON.stringify(recovery), { previous: undefined });
      try {
        await this.mutate(sameUser + script, elevate);
      } catch (error) {
        if (this.recovery) {
          try {
            if ((await this.read()).xml === before.xml) this.completeRecovery();
            else this.recoveryPending = true;
          } catch {
            this.recoveryPending = true;
          }
        }
        if (error instanceof WindowsOperationCancelled) throw error;
        this.health?.failed();
        throw Error(
          `スタートアップの変更は完了しませんでした。UACをキャンセルした場合や権限がない場合、設定は保存されません。${String(error)}`,
        );
      }
      try {
        const after = await read();
        if (this.recovery) {
          recovery.afterXml = after.xml;
          atomicWrite(this.recovery.file, JSON.stringify(recovery));
        }
        if (
          after.registered !== next.startAtLogon ||
          (next.startAtLogon && after.taskElevated !== next.runAsAdministrator)
        ) {
          this.health?.failed();
          throw Error('Windowsの登録結果が設定と一致しません。');
        }
        preflight();
        const result = commit();
        this.completeRecovery();
        if (!this.recoveryPending) this.health?.succeeded();
        return result;
      } catch (error) {
        try {
          await this.mutate(
            sameUser +
              this.context() +
              (before.xml
                ? `\n$null=$folder.RegisterTask($name,${psString(before.xml)},6,$sid,$null,3,'D:P(A;;FA;;;SY)(A;;FA;;;BA)(A;;FA;;;'+$sid+')')`
                : '\nif ($task) { $folder.DeleteTask($name,0) }'),
            elevate,
          );
          await this.read();
          this.completeRecovery();
        } catch (rollback) {
          this.recoveryPending = !!this.recovery;
          this.health?.failed();
          throw Error(
            `${String(error)} / Windowsの起動設定を元に戻せませんでした: ${String(rollback)}`,
          );
        }
        throw error;
      }
    } finally {
      this.busy = false;
      this.health?.changed();
    }
  }
  async restartElevated(args: string[], pid = process.pid) {
    if (!this.state.supported) throw Error('管理者起動はWindowsの発行版AppDockで使用できます。');
    const before = await this.read();
    if (before.elevated) throw Error('AppDockはすでに管理者として起動しています。');
    if (!before.administratorAccount)
      throw Error(
        'このWindowsユーザーは管理者ではありません。同じユーザーの管理者権限が必要です。',
      );
    const pipeName = `appdock-elevation-${randomUUID()}`;
    let accept!: (value: boolean) => void;
    const ready = new Promise<boolean>((resolve) => {
      accept = resolve;
    });
    const server = net.createServer((socket) => {
      socket.setTimeout(1000, () => socket.destroy());
      socket.once('data', (data) => {
        accept(data.length === 1 && data[0] === 1);
        socket.end();
      });
      socket.on('error', () => accept(false));
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(`\\\\.\\pipe\\${pipeName}`, resolve);
    });
    const child = `$ErrorActionPreference='Stop'
$allowed=([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -eq ${psString(before.sid)} -and ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator))
$pipe=[IO.Pipes.NamedPipeClientStream]::new('.',${psString(pipeName)},[IO.Pipes.PipeDirection]::Out)
$pipe.Connect(15000)
$pipe.WriteByte([byte]$allowed)
$pipe.Flush()
$pipe.Dispose()
if (-not $allowed) { exit 1 }
$parent=Get-Process -Id ${pid} -ErrorAction SilentlyContinue
if ($parent -and -not $parent.WaitForExit(60000)) { exit 1 }
Start-Process -FilePath ${psString(this.executable)} -WorkingDirectory ${psString(path.win32.dirname(this.executable))} ${args.length ? `-ArgumentList ${psString(args.map((arg) => `"${arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`).join(' '))}` : ''}`;
    // Confirm the elevated helper's identity before quitting the current host.
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await this.run(
        `$ErrorActionPreference='Stop'
$null=Start-Process -FilePath ${psString(powershell())} -Verb RunAs -WindowStyle Hidden -ArgumentList '-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand ${encodedScript(child)}' -PassThru`,
        false,
      );
      const acknowledged = await Promise.race([
        ready,
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), 15000);
        }),
      ]);
      if (!acknowledged)
        throw Error(
          '管理者起動を確認できませんでした。同じWindowsユーザーでUACを承認してください。',
        );
    } finally {
      clearTimeout(timer);
      server.close();
    }
  }
}
