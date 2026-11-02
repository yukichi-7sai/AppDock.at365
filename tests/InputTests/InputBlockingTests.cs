using System.IO;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading.Channels;
using System.Windows.Threading;

internal static partial class Program
{
    // Invoke the capture handler with memory-only events. No hook installation, input sending or message pumping.
    private static int RunInputBlockingTests(string assemblyPath)
    {
        const BindingFlags members = BindingFlags.Instance | BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic;
        object? engine = null;
        try {
            var assembly = Assembly.LoadFrom(Path.GetFullPath(assemblyPath));
            var type = assembly.GetType("AppDock.InputHost.InputCaptureEngine", true)!;
            var notices = new List<JsonElement>();
            var recorded = new List<string>();
            var delivery = 1;
            engine = Activator.CreateInstance(type, members, null,
                [Dispatcher.CurrentDispatcher, null, new Func<string, object, bool>((method, payload) => {
                    if (method == "shortcuts.recorded") recorded.Add(JsonSerializer.SerializeToElement(payload).GetProperty("key").GetString()!);
                    if (method != "shortcuts.pressed") return true;
                    if (delivery == 0) return false;
                    notices.Add(JsonSerializer.SerializeToElement(payload));
                    if (delivery == 2) throw new IOException("Ambiguous notification outcome.");
                    return true;
                })], null)!;
            ((DispatcherTimer)type.GetField("timer", members)!.GetValue(engine)!).Stop();
            void Set(string name, object value) => type.GetField(name, members)!.SetValue(engine, value);
            object Decode(string name, object value) {
                var array = name.EndsWith("[]");
                var target = assembly.GetType("AppDock.InputHost." + (array ? name[..^2] : name), true)!;
                return JsonSerializer.Deserialize(JsonSerializer.Serialize(value), array ? target.MakeArrayType() : target,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
            }
            var pressed = (HashSet<uint>)type.GetField("pressed", members)!.GetValue(engine)!;
            var owned = (Dictionary<uint, bool>)type.GetField("owned", members)!.GetValue(engine)!;
            var pending = (System.Collections.ICollection)type.GetField("pendingPresses", members)!.GetValue(engine)!;
            var keyboard = type.GetMethod("Keyboard", members)!;
            void Flush() => type.GetMethod("FlushPendingPresses", members)!.Invoke(engine, null);
            void Config(int revision) => Set("configuration", Decode("CaptureConfiguration", new {
                gestures = new { }, shortcuts = Array.Empty<object>(), shortcutRevision = revision,
                hostProcessId = uint.MaxValue, context = "{}",
            }));
            object When(string scope = "global") => new { scope, appletIds = Array.Empty<string>(), processes = scope == "exe" ? new[] { "input-block-fixture-unknown-7fb94d" } : Array.Empty<string>() };
            object Row(bool block, string scope = "global", bool stackMatch = true) => new {
                shortcut = "ScrollLock", blockOriginalInput = block,
                conditions = new[] { new {
                    when = When(scope), blockOriginalInput = block,
                    stackConditions = stackMatch ? null : Array.Empty<object[]>(),
                } },
            };
            void Inputs(params object[] rows) {
                Set("inputs", Decode("ShortcutInput[]", rows));
                type.GetMethod("Compile", members)!.Invoke(engine, null);
            }
            void Reset(bool block = true, bool active = true, int notify = 1) {
                owned.Clear(); pressed.Clear(); Set("pendingAltSides", 0); Set("standaloneAltReleased", false); notices.Clear();
                type.GetField("pendingPresses", members)!.GetValue(engine)!.GetType().GetMethod("Clear")!.Invoke(type.GetField("pendingPresses", members)!.GetValue(engine), null);
                Config(7); Inputs(Row(block)); Set("accepting", active); delivery = notify;
            }
            nint Feed(bool up = false, uint key = 0x91, uint flags = 0) {
                var pointer = Marshal.AllocHGlobal(Marshal.SizeOf<GestureTestKeyData>());
                try {
                    Marshal.StructureToPtr(new GestureTestKeyData { Key = key, Scan = 0x46, Flags = flags | (up ? 0x80u : 0u) }, pointer, false);
                    var message = (flags & 0x20) != 0 ? 0x104u : 0x100u;
                    return (nint)keyboard.Invoke(engine, [0, up ? message + 1 : message, pointer])!;
                } finally { Marshal.FreeHGlobal(pointer); }
            }
            var checks = 0;
            void Check(bool value, string label) { if (!value) throw new Exception(label); checks++; Console.WriteLine("PASS " + label); }
            Reset(); Inputs(new { shortcut = "Alt+C", blockOriginalInput = false });
            Check(Feed(key:0x43, flags:0x20) == 0 && Feed(true, 0x43) == 0 && notices.Count == 1,
                "Alt context on the event recognizes the first Alt+C even without an asynchronous Alt press");
            Reset(); Inputs(new { shortcut = "Alt+C", blockOriginalInput = false }, new { shortcut = "C", blockOriginalInput = false });
            Feed(key:0xA4); Feed(true,0xA4);
            Feed(key:0x43,flags:0x20); Feed(true,0x43);
            Feed(key:0x43,flags:0x20); Feed(true,0x43);
            Feed(key:0x43); Feed(true,0x43);
            Feed(key:0x43,flags:0x20); Feed(true,0x43);
            Check(notices.Select(n => n.GetProperty("Shortcuts")[0].GetString()).SequenceEqual(["C","C","C","Alt+C"]),
                "a passed Alt tap leaves menu input alone; a clean key restores recognition from Windows Alt context");
            Feed(key:0xA4); Feed(key:0xA5); Feed(true,0xA4); Feed(key:0x43); Feed(true,0x43); Feed(true,0xA5);
            Check(notices.Last().GetProperty("Shortcuts")[0].GetString() == "Alt+C", "releasing one Alt preserves the other observed press");
            foreach (var (alt, flags) in new[] { (0xA4u, 0u), (0x12u, 1u) }) {
                Reset(); Inputs(new { shortcut = "Alt+C", blockOriginalInput = false });
                Check(Feed(key:alt, flags:flags) == 0 && Feed(key:0x43) == 0 && Feed(true, 0x43) == 0 &&
                    notices.Count == 1, "observed Alt down identifies the chord when the asynchronous state and context flag are absent");
                Check(Feed(true, alt, flags) == 0 && Feed(key:0x43) == 0 && Feed(true, 0x43) == 0 &&
                    notices.Count == 1, "releasing either Alt leaves the next plain C alone");
            }
            foreach (var (alt,altFlags) in new[] { (0xA4u,0x20u), (0xA5u,0u) }) {
                Reset(); Inputs(new { shortcut = "Alt+C", blockOriginalInput = false },
                    new { shortcut = "Alt+V", blockOriginalInput = false }, new { shortcut = "F8", blockOriginalInput = false });
                Feed(key:alt); Feed(key:0x43,flags:altFlags); Feed(true,0x43);
                Feed(key:alt); // A repeat while Alt is held must not re-arm the fallback.
                // Windows now reports Alt up, but the capture hook did not receive the release.
                Feed(key:0x43); Feed(true,0x43); Feed(key:0x56); Feed(true,0x56); Feed(key:0x77); Feed(true,0x77);
                Check(notices.Select(n=>n.GetProperty("Shortcuts")[0].GetString()).SequenceEqual(["Alt+C","F8"]),
                    "a lost Alt release does not trigger either palette from plain C/V or suppress plain F8");
                Feed(key:alt); Feed(key:0x56); Feed(true,0x56); Feed(true,alt);
                Check(notices.Last().GetProperty("Shortcuts")[0].GetString()=="Alt+V",
                    "after a plain key the next fresh Alt down still identifies its first chord without OS context");
            }
            foreach (var win in new[] { 0x5Bu, 0x5Cu }) {
                Reset(); Inputs(new { shortcut = "Win+C", blockOriginalInput = false },
                    new { shortcut = "C", blockOriginalInput = false });
                Feed(key:win); // no downstream hold and no OS state; the release goes unobserved.
                Feed(key:0x43); Feed(true,0x43);
                Check(notices.Single().GetProperty("Shortcuts")[0].GetString() == "C" && !pressed.Contains(win),
                    $"plain C clears a missed Win release ({win:X2}) so the next press can be recognized");
            }
            Reset(); Inputs(new { shortcut = "Alt+C", blockOriginalInput = false });
            var gestures = type.GetProperty("Gestures", members)!.GetValue(engine)!;
            var gestureKeys = (HashSet<uint>)gestures.GetType().GetField("keys", members)!.GetValue(gestures)!;
            gestureKeys.Add(0xA4);
            Check(Feed(key:0xA4) == 1 && Feed(key:0x43) == 0 && Feed(true, 0x43) == 0 &&
                notices.Count == 0 && Feed(true, 0xA4) == 1, "a mouse gesture's captured Alt does not modify unrelated shortcuts");
            Reset(); Inputs(new { shortcut = "F21", blockOriginalInput = true });
            Set("recording", Decode("RecordingInput", new { token = "left-field", window = "-1" }));
            Check(Feed(key:0x84) == 1 && Feed(key:0x84) == 1 && Feed(true, 0x84) == 1 && notices.Count == 1,
                "the first F21 in a different foreground window ends recording and triggers once before host resync");
            Check(Feed(key:0x84) == 1 && Feed(true, 0x84) == 1 && notices.Count == 2,
                "the next separate F21 also triggers once");
            Reset();
            var recorderWindow = GetForegroundWindow().ToInt64().ToString();
            Set("recording", Decode("RecordingInput", new { token = "capture-left-alt", window = recorderWindow }));
            Check(Feed(key:0xA4) == 1 && Feed(key:0x43) == 1 && Feed(true, 0x43) == 1 &&
                recorded.SequenceEqual(["Alt+C"]) && notices.Count == 0, "recorder owns left Alt and captures its chord once without a menu mask");
            Check(Feed(key:0x56)==1 && Feed(true,0x56)==1 && recorded.Last()=="Alt+V",
                "recorder-owned Alt stays held for a second key even without Windows Alt context");
            type.GetMethod("EndRecording", members)!.Invoke(engine, null);
            Check(Feed(true, 0xA4) == 1 && Feed(key:0xA4) == 0 && Feed(true, 0xA4) == 0,
                "release after leaving the recorder is paired and the next standalone Alt passes");
            Reset();
            for (var i=0; i<200; i++) if (Feed()!=1 || Feed(true)!=1) throw new Exception("Stable tap leaked: " + i);
            Check(notices.Count == 200, "200 independent taps block both halves and each dispatch once");
            Reset();
            Check(Feed()==1, "held key starts blocked");
            for (var i=0; i<200; i++) if (Feed()!=1) throw new Exception("Held repeat leaked.");
            Check(Feed(true)==1 && notices.Count==1, "200 held repeats and release block without repeated execution");
            Reset(active:false);
            for (var i=0; i<200; i++) if (Feed()!=1 || Feed(true)!=1) throw new Exception("Synchronization tap leaked.");
            Check(notices.Count==0 && pending.Count==200, "synchronization retains all 200 blocked presses without a 64-item admission limit");
            Set("accepting", true); Flush();
            var ids = notices.Select(n=>n.GetProperty("PressId").GetInt64()).ToArray();
            Check(notices.Count==200 && pending.Count==0 && ids.SequenceEqual(ids.Order()), "activation flushes captured presses in FIFO order");
            Flush(); Check(notices.Count==200, "activation does not replay completed delivery");
            Reset(active:false);
            Check(Feed()==1, "synchronization captures the first held down");
            Set("accepting", true); Flush();
            Check(Feed()==1 && Feed(true)==1 && notices.Count==1, "hold remains blocked across activation and executes once");
            Reset(notify:0);
            Check(Feed()==1 && Feed()==1 && Feed(true)==1 && notices.Count==0 && pending.Count==1, "rejected delivery never undoes blocking or duplicates held input");
            delivery=1; Flush(); Flush();
            Check(notices.Count==1 && pending.Count==0, "unaccepted notification can be enqueued once when delivery resumes");
            Reset(notify:2);
            Check(Feed()==1 && Feed()==1 && Feed(true)==1 && pending.Count==0, "ambiguous delivery exception preserves the entire blocked press");
            delivery=1; Flush(); Check(notices.Count==1, "ambiguous delivery is never automatically replayed");
            Reset(block:false, notify:0);
            Check(Feed()==0 && Feed()==0 && Feed(true)==0, "block OFF still passes down, held repeat and release after delivery rejection");
            Reset(block:false, active:false);
            Check(Feed()==0 && Feed()==0 && Feed(true)==0 && pending.Count==0, "synchronization does not defer passed-through input and duplicate a local handler");
            Reset(); Inputs(Row(true,"exe"));
            Check(Feed()==0 && Feed()==0 && Feed(true)==0 && notices.Count==0 && pending.Count==0, "condition mismatch passes original input without execution");
            Reset(active:false); Inputs(Row(true,"exe"));
            Check(Feed()==0 && Feed(true)==0 && pending.Count==0, "condition mismatch remains pass-through during synchronization");
            Reset(); Inputs(Row(true,"global",false));
            Check(Feed()==0 && Feed(true)==0, "empty nested-stack conditions do not block");
            Reset(); Inputs(Row(true,"exe"),Row(false));
            Check(Feed()==0 && Feed(true)==0, "a mismatched ON row cannot override a matched OFF row");
            Reset(); Inputs(Row(false),Row(true));
            Check(Feed()==1 && Feed(true)==1 && notices.Count==1, "a matched ON row blocks even beside a matched OFF row");
            Reset(); Check(Feed()==1, "block decision is captured at the first down"); Inputs(Row(false));
            Check(Feed()==1 && Feed(true)==1 && Feed()==0 && Feed(true)==0, "changing to OFF preserves the owned pair and applies to the next tap");
            Reset(block:false); Check(Feed()==0, "pass decision is captured at the first down"); Inputs(Row(true));
            Check(Feed()==0 && Feed(true)==0 && Feed()==1 && Feed(true)==1, "changing to ON preserves the passed pair and applies to the next tap");
            Reset(active:false); Feed(); Feed(true); Config(8); Set("accepting",true); Flush();
            Check(notices.Count==0 && pending.Count==0, "changed binding revision discards obsolete deferred execution");
            var capture=assembly.GetType("AppDock.InputHost.CommandTargetCapture",true)!;
            var unknown=capture.GetMethod("Capture",members)!.Invoke(null,[nint.Zero])!;
            var target=JsonSerializer.SerializeToElement(unknown);
            Check(target.GetProperty("Desktop").ValueKind==JsonValueKind.Null && target.GetProperty("ProcessName").ValueKind==JsonValueKind.Null,
                "missing foreground yields unknown facts instead of claiming a non-desktop window");
            var conditions=assembly.GetType("AppDock.InputHost.CommandConditions",true)!;
            var context=Decode("CommandContext",new { host=new { focused=false }, target=unknown });
            foreach(var (scope,excludeDesktop,excluded,expected) in new[] {
                ("global",false,false,true),("global",true,false,false),("global",false,true,false),("exe",false,false,false),("desktop",false,false,false),("browser",false,false,false) }) {
                var when=Decode("Condition",new { scope, appletIds=Array.Empty<string>(),processes=scope=="exe"?new[]{"fixture"}:Array.Empty<string>(),excludeDesktop,excludedProcesses=excluded?new[]{"fixture"}:Array.Empty<string>() });
                Check((bool)conditions.GetMethod("Matches",members)!.Invoke(null,[when,context,null,null])! == expected,
                    $"unknown foreground preserves condition policy: {scope}/{excludeDesktop}/{excluded}");
            }
            var navigation = new[] { (9u, "Tab"), (27u, "Escape"), (13u, "Enter"),
                (38u, "Up"), (40u, "Down"), (37u, "Left"), (39u, "Right") };
            var codec=assembly.GetType("AppDock.InputHost.ShortcutCodec",true)!;
            var parse=codec.GetMethod("Parse",members)!;
            var dialogOwns=type.GetMethod("DialogOwns",members)!;
            foreach (var (key,name) in navigation) {
                Reset();
                var foreground=GetForegroundWindow();
                Set("configuration", Decode("CaptureConfiguration", new {
                    gestures=new {}, shortcuts=Array.Empty<object>(), shortcutRevision=7,
                    hostProcessId=uint.MaxValue, context="{}", dialogWindow=foreground.ToString(),
                    dialogShortcuts=navigation.Select(n=>n.Item2).ToArray(),
                }));
                Inputs(new { shortcut=name, blockOriginalInput=true });
                Check(Feed(key:key)==0 && Feed(key:key)==0 && Feed(true,key)==0 && notices.Count==0,
                    name+" passes down, hold and up to the dialog without trigger execution");
                for(var mask=0;mask<16;mask++) {
                    var modified=((mask&1)!=0?"Ctrl+":"")+((mask&2)!=0?"Alt+":"")+
                        ((mask&4)!=0?"Shift+":"")+((mask&8)!=0?"Win+":"")+name;
                    var chord=parse.Invoke(null,[modified,nint.Zero])!;
                    Check((bool)dialogOwns.Invoke(engine,[chord,foreground])! == (mask==0), modified+" dialog ownership");
                    Check(!(bool)dialogOwns.Invoke(engine,[chord,new nint(-1)])!, modified+" remains active in another foreground window");
                }
                Config(7); Inputs(new { shortcut=name, blockOriginalInput=true });
                Check(Feed(key:key)==1 && Feed(true,key)==1 && notices.Count==1, name+" trigger resumes after closing the dialog");
            }
            Reset();
            var confirmWindow=GetForegroundWindow();
            Set("configuration", Decode("CaptureConfiguration", new {
                gestures=new {}, shortcuts=Array.Empty<object>(), shortcutRevision=7,
                hostProcessId=uint.MaxValue, context="{}", dialogWindow=confirmWindow.ToString(), dialogHasConfirm=true
            }));
            Inputs(new { shortcut="Ctrl+Enter", blockOriginalInput=true });
            var confirmChord=parse.Invoke(null,["Ctrl+Enter",nint.Zero])!;
            Check((bool)dialogOwns.Invoke(engine,[confirmChord,confirmWindow])!, "confirm dialog owns Ctrl+Enter");
            Check(!(bool)dialogOwns.Invoke(engine,[confirmChord,new nint(-1)])!, "another window retains Ctrl+Enter");
            Check((nint)type.GetField("keyboardHook",members)!.GetValue(engine)! == 0 && (nint)type.GetField("mouseHook",members)!.GetValue(engine)! == 0,"handler fixture installed no hooks");
            var threadType=assembly.GetType("AppDock.InputHost.InputCaptureThread",true)!;
            using(var thread=(IDisposable)Activator.CreateInstance(threadType,members,null,[],null)!) {
                var completion=threadType.GetField("ready",members)!.GetValue(thread)!;
                var ready=(System.Threading.Tasks.Task)completion.GetType().GetProperty("Task")!.GetValue(completion)!;
                Check(ready.Wait(2000),"unconfigured capture thread starts without installing input hooks");
                var channel=(Channel<(string Method,object Payload)>)threadType.GetField("notices",members)!.GetValue(thread)!;
                for(var i=0;i<200;i++) if(!channel.Writer.TryWrite(("shortcuts.pressed",i)))throw new Exception("Recognition channel rejected accepted input.");
                var delivered=0;while(channel.Reader.TryRead(out var notice))if(notice.Method=="shortcuts.pressed")delivered++;
                Check(delivered==200,"recognition channel retains more than 64 accepted notices without synchronous continuations");
            }
            ((IDisposable)engine).Dispose();
            Check(pending.Count==0,"capture shutdown clears deferred execution");
            Console.WriteLine($"Input blocking checks: {checks}; no OS key input sent.");
            return 0;
        } catch(Exception error) { Console.Error.WriteLine(error); return 1; }
        finally { (engine as IDisposable)?.Dispose(); }
    }
}
