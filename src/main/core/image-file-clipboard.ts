import { spawn } from 'node:child_process';
import { hostText } from '../../shared/i18n';
import { encodedScript, powershell } from './windows-launch';

// Electron's raw-format API registers custom Windows formats; CF_HDROP is predefined.
// Use the Windows STA clipboard API. Paths are JSON data on stdin, never PowerShell code.
export function copyImageFiles(files: string[]): Promise<void> {
  if (!files.length) return Promise.reject(Error(hostText('images.selectImages')));
  const script = `
$ErrorActionPreference='Stop'
[Console]::InputEncoding=[Text.UTF8Encoding]::new($false)
try {
  Add-Type -AssemblyName System.Windows.Forms
  $paths=ConvertFrom-Json -InputObject ([Console]::In.ReadToEnd())
  $list=[Collections.Specialized.StringCollection]::new()
  foreach ($item in $paths) { [void]$list.Add([string]$item) }
  [Windows.Forms.Clipboard]::SetFileDropList($list)
} catch { exit 1 }
`;
  return new Promise((resolve, reject) => {
    const child = spawn(
      powershell(),
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-STA',
        '-EncodedCommand',
        encodedScript(script),
      ],
      {
        windowsHide: true,
        stdio: ['pipe', 'ignore', 'ignore'],
      },
    );
    const timer = setTimeout(() => child.kill(), 15000);
    const failed = () => reject(Error(hostText('images.clipboardFailed')));
    child.once('error', () => {
      clearTimeout(timer);
      failed();
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : failed();
    });
    child.stdin.on('error', failed);
    child.stdin.end(JSON.stringify(files));
  });
}
