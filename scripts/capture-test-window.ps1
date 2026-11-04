param([long]$WindowHandle, [string]$OutputFile)
$ErrorActionPreference = 'Stop'
# Capture the isolated test host's client area, including child WebContentsViews.
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class TestWindowCapture {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr window, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
$null = [TestWindowCapture]::SetProcessDPIAware()
$taskWindow = [IntPtr]::new($WindowHandle)
$taskRect = New-Object TestWindowCapture+Rect
if (-not [TestWindowCapture]::GetClientRect($taskWindow, [ref] $taskRect)) { throw 'Invalid test window' }
$taskImage = New-Object Drawing.Bitmap $taskRect.Right,$taskRect.Bottom
try {
  $taskGraphics = [Drawing.Graphics]::FromImage($taskImage)
  $taskDc = $taskGraphics.GetHdc()
  try {
    if (-not [TestWindowCapture]::PrintWindow($taskWindow, $taskDc, 3)) { throw 'PrintWindow failed' }
  } finally {
    $taskGraphics.ReleaseHdc($taskDc)
    $taskGraphics.Dispose()
  }
  $taskImage.Save($OutputFile, [Drawing.Imaging.ImageFormat]::Png)
} finally { $taskImage.Dispose() }
