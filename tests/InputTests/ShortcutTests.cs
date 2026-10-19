using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows.Forms;
using AppDock.Runtime;

internal static partial class Program
{
    private sealed class ShortcutProbe : Form
    {
        internal readonly Dictionary<uint,int> Downs = [], Ups = [];
        protected override void WndProc(ref Message message)
        {
            if (message.Msg is 0x100 or 0x104) { var key=(uint)message.WParam; Downs[key]=Downs.GetValueOrDefault(key)+1; }
            if (message.Msg is 0x101 or 0x105) { var key=(uint)message.WParam; Ups[key]=Ups.GetValueOrDefault(key)+1; }
            base.WndProc(ref message);
        }
    }
    private static int RunShortcutTests(string helper)
    {
        using var form = new ShortcutProbe { Text="AppDock isolated shortcut capture", Size=new(640,400), StartPosition=FormStartPosition.CenterScreen };
        var failed=0;
        form.Shown += async (_,_) => {
            try { await ShortcutCases(form,helper); }
            catch(Exception error) { Console.Error.WriteLine(error); failed++; }
            finally {
                foreach(var key in new ushort[]{0x57,0x7F,0x80,0x81,0xA2,0xA3,0xA4,0xA5,0xA0,0xA1,0x5B,0x5C}) Key(key,true);
                form.Close();
            }
        };
        Application.Run(form); return failed==0?0:1;
    }
    private static async Task ShortcutCases(ShortcutProbe form,string helper)
    {
        using var child=Process.Start(new ProcessStartInfo(helper) {
            UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true
        })!;
        var stderr=child.StandardError.ReadToEndAsync();
        await using var peer=new JsonRpcConnection(child.StandardOutput,child.StandardInput);
        var events=new List<JsonElement>();
        var recorded=new List<string>();
        JsonElement lastStatuses=default;
        var reading=peer.ReadAsync((method,p)=>{
            lock(events) {
                if(method=="shortcuts.pressed") events.Add(p.Clone());
                else if(method=="shortcuts.recorded") recorded.Add(p.GetProperty("key").GetString()!);
                else if(method=="input.error") throw new Exception(p.ToString());
            }
            return Task.FromResult<object?>(null);
        });
        int Count(){lock(events)return events.Count;}
        void Check(bool condition,string name){if(!condition)throw new Exception(name);Console.WriteLine("PASS "+name);}
        object[] inputs = [
            new {shortcut="Win+W",blockOriginalInput=true},
            new {shortcut="Ctrl+Alt+F16",blockOriginalInput=true},
            new {shortcut="Ctrl+Shift+F17",blockOriginalInput=false},
            new {shortcut="Pause",blockOriginalInput=true}
        ];
        async Task Sync(object[]? rows=null,object? recording=null,int revision=1) {
            object Configuration(bool active) => new{
                gestures=new{enabled=false,browsers=Array.Empty<string>(),excludedProcesses=Array.Empty<string>(),
                    requireChromiumWindowClass=false,distance=30,wheelDelayMs=0,indicatorOpacity=.4,
                    indicatorPosition="none",rows=Array.Empty<object>(),context="fixture",revision=1},
                shortcuts=rows??inputs,shortcutRevision=revision,hostProcessId=(uint)Environment.ProcessId,context="fixture",recording,shortcutsActive=active
            };
            await peer.RequestAsync("capture.sync",Configuration(false),CancellationToken.None);
            var result=await peer.RequestAsync("capture.sync",Configuration(true),CancellationToken.None);
            lastStatuses=result.Clone();
            Check(result.EnumerateArray().All(s=>s.GetProperty("registered").GetBoolean()),"capture configuration applied");
            await Task.Delay(70);
        }
        async Task Focus(){FocusWindow(form.Handle);await Task.Delay(100);Check(GetForegroundWindow()==form.Handle,"fixture foreground");}
        async Task Chord(ushort[] modifiers,ushort key,int repeats=0,nuint marker=0) {
            foreach(var modifier in modifiers){ShortcutKey(modifier,false,marker);await Task.Delay(20);}
            ShortcutKey(key,false,marker);
            for(var i=0;i<repeats;i++){await Task.Delay(25);ShortcutKey(key,false,marker);}
            await Task.Delay(50);ShortcutKey(key,true,marker);
            foreach(var modifier in modifiers.Reverse()){await Task.Delay(20);ShortcutKey(modifier,true,marker);}
            await Task.Delay(180);
        }
        try {
            await Sync();await Focus();
            var count=Count();var downs=form.Downs.GetValueOrDefault(0x7Fu);var ups=form.Ups.GetValueOrDefault(0x7Fu);
            await Chord([0xA2,0xA4],0x7F,3);
            Check(Count()==count+1,"blocked chord fires once despite repeat");
            Check(form.Downs.GetValueOrDefault(0x7Fu)==downs&&form.Ups.GetValueOrDefault(0x7Fu)==ups,"blocked down and up do not reach target");
            count=Count();downs=form.Downs.GetValueOrDefault(0x80u);ups=form.Ups.GetValueOrDefault(0x80u);
            await Chord([0xA2,0xA0],0x80,2);
            Check(Count()==count+1,"passthrough chord fires once");
            Check(form.Downs.GetValueOrDefault(0x80u)==downs+3&&form.Ups.GetValueOrDefault(0x80u)==ups+1,"passthrough preserves down repeats and up");
            count=Count();await Chord([0xA2,0xA4,0xA0],0x7F);
            Check(Count()==count,"extra modifier does not match");
            count=Count();await Chord([0xA2,0xA4],0x7F,marker:0x365B012);
            Check(Count()==count,"own synthetic input does not recurse");
            count=Count();await Chord([],0x13);await Chord([],0x13);
            Check(Count()==count+2,"Pause accepts consecutive pulses");
            count=Count();await Chord([0x5B],0x57);
            Check(Count()==count+1,"Win+W captured");
            Check(GetForegroundWindow()==form.Handle,"Win release does not open Widgets or Start");
            var normalInputs=inputs;
            inputs=[new{shortcut="Ctrl+Plus",blockOriginalInput=false},new{shortcut="Ctrl+Shift+Plus",blockOriginalInput=true}];
            await Sync(revision:2);
            Check(lastStatuses.EnumerateArray().All(s=>s.GetProperty("effectiveBlockOriginalInput").GetBoolean()),"physical symbol aliases report aggregated blocking");
            var plus=ShortcutScan('+',ShortcutLayout(GetWindowThreadProcessId(form.Handle,out _)));
            Check(plus!=-1,"current keyboard layout maps Plus");
            count=Count();
            var plusModifiers=new List<ushort>{0xA2};
            if((plus&0x100)!=0)plusModifiers.Add(0xA0);
            if((plus&0x400)!=0)plusModifiers.Add(0xA4);
            await Chord(plusModifiers.ToArray(),(ushort)(plus&255));
            Check(Count()==count+1,"physical symbol aliases emit one press");
            lock(events)Check(events.Last().GetProperty("shortcuts").GetArrayLength()==2,"physical symbol press includes both canonical keys");
            inputs=normalInputs;
            await Sync([],new{token="fixture-record",window=form.Handle.ToInt64().ToString(),allowWin=true},2);
            count=Count();await Chord([0x5C],0x57);
            Check(Count()==count,"recording does not execute a command");
            lock(events)Check(recorded.LastOrDefault()=="Win+W","right Win+W records through native capture");
            Check(GetForegroundWindow()==form.Handle,"recording suppresses Widgets and Start");
            await Sync(revision:3);
            await Chord([0xA2,0xA4],0x7F);
            Check(Count()==count+1,"capture resumes after recording");
            var heldUps=form.Ups.GetValueOrDefault(0x7Fu);
            ShortcutKey(0xA2,false,0);await Task.Delay(20);ShortcutKey(0xA4,false,0);await Task.Delay(20);ShortcutKey(0x7F,false,0);await Task.Delay(100);
            await Sync([],revision:4);
            ShortcutKey(0x7F,true,0);ShortcutKey(0xA4,true,0);ShortcutKey(0xA2,true,0);await Task.Delay(150);
            Check(form.Ups.GetValueOrDefault(0x7Fu)==heldUps,"held blocked key keeps its release disposition across configuration changes");
            await Sync([],revision:4);
            count=Count();await Chord([0xA2,0xA4],0x7F);
            Check(Count()==count,"empty configuration releases shortcut capture");
            Console.WriteLine("PASS shortcut hook native acceptance");
        } finally {
            child.StandardInput.Close();
            try{await child.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(5));}catch{child.Kill();}
            var errors=await stderr;if(errors.Length>0)Console.Error.WriteLine(errors);
        }
    }
    private static void ShortcutKey(ushort key,bool up,nuint marker)
    {
        if(SendInput(1,[new(){Type=1,Union=new(){Key=new(){Key=key,Flags=(up?2u:0)|(key is 0xA3 or 0xA5 or 0x5B or 0x5C?1u:0),Extra=marker}}}],Marshal.SizeOf<Input>())!=1)
            throw new Exception("Shortcut fixture SendInput failed.");
    }
    [DllImport("user32.dll",EntryPoint="GetKeyboardLayout")] private static extern nint ShortcutLayout(uint thread);
    [DllImport("user32.dll",EntryPoint="VkKeyScanExW",CharSet=CharSet.Unicode)] private static extern short ShortcutScan(char key,nint layout);
}
