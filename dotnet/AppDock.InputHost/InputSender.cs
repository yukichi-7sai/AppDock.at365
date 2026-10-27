using AppDock.SDK;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace AppDock.InputHost;

internal sealed class InputSender : IDisposable
{
    private readonly object sync = new();
    private readonly Dictionary<string, CancellationTokenSource> pending = [];
    private readonly HashSet<string> cancelled = [];
    private readonly Queue<string> cancellationOrder = [];
    private readonly SemaphoreSlim gate = new(1, 1);
    private bool disposed;
    private static readonly int[] HeldModifiers = [0x10, 0x11, 0x12, 0x5B, 0x5C];

    public void Cancel(string id)
    {
        lock (sync) {
            if (cancelled.Add(id)) cancellationOrder.Enqueue(id);
            while (cancellationOrder.Count > 256) cancelled.Remove(cancellationOrder.Dequeue());
            if (pending.TryGetValue(id, out var cts)) cts.Cancel();
        }
    }
    public async Task<object> ExecuteAsync(string method, JsonElement p, CancellationToken lifetime)
    {
        var id = p.GetProperty("id").GetString()!;
        using var cts = CancellationTokenSource.CreateLinkedTokenSource(lifetime);
        lock (sync) {
            if (disposed || cancelled.Contains(id)) cts.Cancel();
            if (!pending.TryAdd(id, cts)) throw new ArgumentException("Duplicate input request.");
        }
        var entered = false;
        try {
            var token = cts.Token;
            token.ThrowIfCancellationRequested();
            await gate.WaitAsync(token);
            entered = true;
            var target = GetForegroundWindow();
            // System key chords (for example Win+E) also work with the desktop focused.
            // Window-directed app commands retain their ordinary-window restriction.
            if (target == 0 || !IsWindowVisible(target) ||
                (method == "input.appCommand" && (target == GetDesktopWindow() || target == GetShellWindow())))
                throw new InvalidOperationException("操作対象のウィンドウを最前面にしてください。");
            var expected = new nint(long.Parse(p.GetProperty("window").GetString()!));
            if (expected != 0 && expected != target) throw new InvalidOperationException("開始時のウィンドウが最前面ではないため中止しました。");
            InputKeyChord? chord = method == "input.sendKeys" ? InputKeyChord.Parse(p.GetProperty("keys").GetString()!) : null;
            var requestedChord = chord;
            var appCommand = method == "input.appCommand" ? p.GetProperty("action").GetString() switch {
                "back" => 1, "forward" => 2, "reload" => 3, _ => throw new ArgumentException("未対応の操作です。")
            } : 0;
            if (chord is null && appCommand == 0) throw new ArgumentException("未対応の操作です。");
            var start = Environment.TickCount64;
            while (true) {
                if (requestedChord?.Symbol is char symbol)
                    chord = requestedChord.ResolveSymbol(VkKeyScanEx(symbol, GetKeyboardLayout(GetWindowThreadProcessId(target, out _))));
                if (!HeldModifiers.Any(Pressed) && (chord is null || !Pressed(chord.Key))) break;
                await Task.Delay(25, token);
                CheckTarget(target);
                if (Environment.TickCount64 - start >= 2000) throw new InvalidOperationException("修飾キーを離してから再実行してください。");
            }
            token.ThrowIfCancellationRequested();
            CheckTarget(target);
            if (chord is not null) {
                var events = new List<Input>();
                foreach (var modifier in chord.Modifiers) events.Add(KeyEvent(modifier, false, modifier == 0x5B));
                events.Add(KeyEvent(chord.Key, false, chord.Extended));
                events.Add(KeyEvent(chord.Key, true, chord.Extended));
                foreach (var modifier in chord.Modifiers.Reverse()) events.Add(KeyEvent(modifier, true, modifier == 0x5B));
                var sent = SendInput((uint)events.Count, events.ToArray(), Marshal.SizeOf<Input>());
                if (sent != events.Count) {
                    var releases = events.Take((int)sent).Where(e => (e.Data.Keyboard.Flags & 2) == 0).Reverse()
                        .Select(e => KeyEvent(e.Data.Keyboard.Key, true, (e.Data.Keyboard.Flags & 1) != 0)).ToArray();
                    if (releases.Length > 0) SendInput((uint)releases.Length, releases, Marshal.SizeOf<Input>());
                    throw new InvalidOperationException("キーの一部を送信できませんでした。操作先を確認してください。");
                }
            } else if (SendMessageTimeout(target, 0x0319, target, new nint(appCommand << 16), 0x22, 1000, out var handled) == 0 || handled == 0)
                throw new InvalidOperationException("操作メッセージが処理されませんでした。");
            return new { ok = true };
        } catch (OperationCanceledException) { return new { ok = false, code = "CANCELLED", message = "入力操作は取り消されました。送信済みの入力は元に戻りません。" }; }
        catch (ArgumentException) { return new { ok = false, code = "INVALID_ARGUMENT", message = "入力操作の引数が不正です。" }; }
        catch (Exception) { return new { ok = false, code = "INPUT_FAILED", message = "入力操作が完了しませんでした。送信先・キーの押下状態・権限を確認してください。" }; }
        finally { if (entered) gate.Release(); lock (sync) pending.Remove(id); }
    }
    private static void CheckTarget(nint target) { if (GetForegroundWindow() != target || !IsWindowVisible(target)) throw new InvalidOperationException("操作先が変わりました。"); }
    private static bool Pressed(int key) => (GetAsyncKeyState(key) & 0x8000) != 0;
    public void Dispose() { lock (sync) { disposed = true; foreach (var cts in pending.Values) cts.Cancel(); } }
    private static Input KeyEvent(ushort key, bool up, bool extended) => new() {
        Type = 1, Data = new InputUnion { Keyboard = new KeyboardInput { Key = key, Flags = (up ? 2u : 0) | (extended ? 1u : 0), Extra = GestureEngine.InputMarker } }
    };
    [StructLayout(LayoutKind.Sequential)] private struct Input { public uint Type; public InputUnion Data; }
    [StructLayout(LayoutKind.Explicit)] private struct InputUnion { [FieldOffset(0)] public KeyboardInput Keyboard; [FieldOffset(0)] public MouseInput Mouse; }
    [StructLayout(LayoutKind.Sequential)] private struct KeyboardInput { public ushort Key, Scan; public uint Flags, Time; public nuint Extra; }
    [StructLayout(LayoutKind.Sequential)] private struct MouseInput { public int X, Y; public uint Data, Flags, Time; public nuint Extra; }
    [DllImport("user32.dll")] private static extern nint GetForegroundWindow();
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(nint window, out uint process);
    [DllImport("user32.dll")] private static extern nint GetKeyboardLayout(uint thread);
    [DllImport("user32.dll", EntryPoint = "VkKeyScanExW", CharSet = CharSet.Unicode)] private static extern short VkKeyScanEx(char character, nint layout);
    [DllImport("user32.dll")] private static extern nint GetDesktopWindow();
    [DllImport("user32.dll")] private static extern nint GetShellWindow();
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(nint window);
    [DllImport("user32.dll")] private static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll", SetLastError = true)] private static extern uint SendInput(uint count, Input[] inputs, int size);
    [DllImport("user32.dll", SetLastError = true)] private static extern nint SendMessageTimeout(nint window, uint message, nint wParam, nint lParam, uint flags, uint timeout, out nuint result);
}
