const { spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
/** Physical screen coordinates. Always release the button and restore the original cursor. */
function leftDrag(from, to = from) {
  for (const point of [from, to])
    for (const key of ['x', 'y']) assert(Number.isInteger(point[key]));
  const code = `
Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class BarMouse {
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X; public int Y; }
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point p);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);
}';
[void][BarMouse]::SetProcessDPIAware();
$point=New-Object BarMouse+Point;
[void][BarMouse]::GetCursorPos([ref]$point);
try {
  [void][BarMouse]::SetCursorPos(${from.x},${from.y}); Start-Sleep -Milliseconds 100;
  [BarMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 100;
  for ($step=1; $step -le 5; $step++) {
    [void][BarMouse]::SetCursorPos((${from.x}+(${to.x}-${from.x})*$step/5),(${from.y}+(${to.y}-${from.y})*$step/5));
    Start-Sleep -Milliseconds 70;
  }
} finally {
  [BarMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero);
  [void][BarMouse]::SetCursorPos($point.X,$point.Y);
}`;
  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(code, 'utf16le').toString('base64'),
    ],
    { windowsHide: true, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
}
module.exports = { leftDrag };
