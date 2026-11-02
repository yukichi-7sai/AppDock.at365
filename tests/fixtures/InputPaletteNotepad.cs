using System;
using System.Diagnostics;
using System.Text;
using System.Runtime.InteropServices;

// Opt-in real Notepad test. Every read and input is gated by the unique test tab and editor HWND.
public static class PaletteNotepadFixture {
    [StructLayout(LayoutKind.Sequential)] struct Point { public int X,Y; }
    [StructLayout(LayoutKind.Sequential)] struct Info { public uint size,flags; public IntPtr active,focus,capture,menu,move,caret; public int left,top,right,bottom; }
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint process);
    [DllImport("user32.dll")] static extern bool GetGUIThreadInfo(uint t,ref Info info);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h,StringBuilder text,int cap);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder text,int cap);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h,uint m,IntPtr w,StringBuilder buffer);
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
    [DllImport("user32.dll")] static extern void keybd_event(byte k,byte scan,uint flags,UIntPtr extra);
    [DllImport("user32.dll")] static extern void mouse_event(uint flags,int dx,int dy,uint data,UIntPtr extra);
    [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
    [DllImport("user32.dll")] static extern bool GetCursorPos(out Point p);
    [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point p);
    [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h,uint flags);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from,uint to,bool attach);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    [StructLayout(LayoutKind.Sequential)] struct Rect { public int left,top,right,bottom; }
    delegate bool EnumWindow(IntPtr h,IntPtr p);
    [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h,EnumWindow cb,IntPtr param);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll",EntryPoint="GetWindowLongPtrW")] static extern IntPtr Styles(IntPtr h,int index);
    [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h,uint attribute,out int value,int size);
    [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out Rect rect);
    [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int height,uint flags);
    [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr ctx);
    static IntPtr originalFocus;
    static bool testAltDown;
    static readonly UIntPtr fixtureMarker = Environment.GetEnvironmentVariable("PALETTE_TEST_GRAB") == "1" ? new UIntPtr(0x765010u) : UIntPtr.Zero;
    static void Key(byte key,bool up){keybd_event(key,0,up?2u:0u,fixtureMarker);}
    static void Chord(params byte[] keys){foreach(var key in keys)Key(key,false);for(int i=keys.Length-1;i>=0;i--)Key(keys[i],true);}
    static bool AltTestKey(string action) {
        if(action=="alt-tap"){Chord(0x12);return true;}
        if(action=="alt-c-hold"){Key(0x12,false);testAltDown=true;Chord(0x43);return true;}
        if(action=="alt-v-hold"){Key(0x12,false);testAltDown=true;Chord(0x56);return true;}
        if(action=="plain-c"){Chord(0x43);return true;}
        if(action=="plain-v"){Chord(0x56);return true;}
        if(action=="plain-f8"){Chord(0x77);return true;}
        if((action=="release-masked-alt" || action=="release-unobserved-alt") && testAltDown) {
            // Model Windows receiving an up outside shortcut recognition, optionally with a menu mask.
            if(action=="release-masked-alt"){Chord(0x11); Chord(0xFF);}
            keybd_event(0x12,0,2,new UIntPtr(0x365B012u)); testAltDown=false;
            return true;
        }
        return false;
    }
    public static string Run(string token,string action) {
        if(action=="release-test-alt"){if(testAltDown)Key(0x12,true);testAltDown=false;return "ok";}
        if(action=="prepare" || action=="edge-prepare" || action=="edge-focus-field" || action=="paint-prepare" || action=="host-prepare"){
            SetThreadDpiAwarenessContext(new IntPtr(-4));
            bool edge = action=="edge-prepare" || action=="edge-focus-field";
            bool paint=action=="paint-prepare";
            bool host=action=="host-prepare";
            var candidates=host ? new[]{Process.GetProcessById(int.Parse(Environment.GetEnvironmentVariable("PALETTE_TEST_MAIN")))}
                : Process.GetProcessesByName(edge ? "msedge" : paint ? "mspaint" : "notepad");
            foreach(var process in candidates) {
                if(!host && !process.MainWindowTitle.Contains(token))continue;
                var h=host ? new IntPtr(long.Parse(Environment.GetEnvironmentVariable("PALETTE_TEST_WINDOW"))) : process.MainWindowHandle;
                uint ignored;
                GetWindowThreadProcessId(h,out ignored);if(ignored!=process.Id)continue;
                var target=GetWindowThreadProcessId(h,out ignored);var current=GetCurrentThreadId();
                var fgThread=GetWindowThreadProcessId(GetForegroundWindow(),out ignored);
                var a=fgThread!=0&&fgThread!=current&&AttachThreadInput(current,fgThread,true);
                var b=target!=current&&target!=fgThread&&AttachThreadInput(current,target,true);
                try{SetForegroundWindow(h);}finally{if(b)AttachThreadInput(current,target,false);if(a)AttachThreadInput(current,fgThread,false);}
                if(GetForegroundWindow()!=h || action=="edge-focus-field"){
                    SetWindowPos(h,IntPtr.Zero,0,0,0,0,0x13);
                    if(host)return "waiting for host focus";
                    if(edge || paint){
                        Rect r;
                        if(!GetWindowRect(h,out r))return "waiting";
                        var pt=new Point{X=(r.left+r.right)/2,Y=(r.top+r.bottom)/2};
                        Point prev;GetCursorPos(out prev);
                        if(GetAncestor(WindowFromPoint(pt),2)!=h)return "window obscured";
                        SetCursorPos(pt.X,pt.Y);
                        try{if(GetAncestor(WindowFromPoint(pt),2)==h){mouse_event(2,0,0,0,UIntPtr.Zero);mouse_event(4,0,0,0,UIntPtr.Zero);}}
                        finally{Point now;if(GetCursorPos(out now)&&now.X==pt.X&&now.Y==pt.Y)SetCursorPos(prev.X,prev.Y);}
                        return GetForegroundWindow()==h?"ok":"waiting";
                    }
                    var hit=false;
                    EnumChildWindows(h,delegate(IntPtr edit,IntPtr unused){
                        var label=new StringBuilder(96);GetClassName(edit,label,96);Rect r;
                        if(!IsWindowVisible(edit)||label.ToString().IndexOf("edit",StringComparison.OrdinalIgnoreCase)<0||!GetWindowRect(edit,out r))return true;
                        var pt=new Point{X=(r.left+r.right)/2,Y=(r.top+r.bottom)/2};var under=WindowFromPoint(pt);
                        if(under!=edit||GetAncestor(under,2)!=h)return true;
                        SetCursorPos(pt.X,pt.Y);
                        if(WindowFromPoint(pt)==edit){mouse_event(2,0,0,0,UIntPtr.Zero);mouse_event(4,0,0,0,UIntPtr.Zero);hit=true;}
                        return !hit;
                    },IntPtr.Zero);
                    return hit?"clicked test editor":"editor not under pointer";
                }
                return GetForegroundWindow()==h?"ok":"not foreground";
            }
            return "waiting for test tab";
        }
        var fg=GetForegroundWindow();uint pid;var thread=GetWindowThreadProcessId(fg,out pid);
        var title=new StringBuilder(512);GetWindowText(fg,title,512);
        if(action.StartsWith("host-")) {
            if(thread==0 || pid.ToString()!=Environment.GetEnvironmentVariable("PALETTE_TEST_MAIN")) return "inactive";
            if(AltTestKey(action.Substring(5)))return "ok";
            if(action=="host-esc")Chord(27);
            else if(action!="host-guard")throw new Exception("Unknown host action");
            return "ok";
        }
        if(action.StartsWith("edge-")) {
            if(thread==0 || !title.ToString().Contains(token) || !Process.GetProcessById((int)pid).ProcessName.Equals("msedge",StringComparison.OrdinalIgnoreCase))return "inactive";
            if(AltTestKey(action.Substring(5)))return "ok";
            if(action=="edge-esc")Chord(27);
            else if(action=="edge-open")Chord(0x12,0x43);
            else if(action=="edge-enter")Chord(13);
            else if(action!="edge-guard")throw new Exception("Unknown Edge action");
            return "ok";
        }
        if(action.StartsWith("paint-")){
            if(thread==0 || !title.ToString().Contains(token) || !Process.GetProcessById((int)pid).ProcessName.Equals("mspaint",StringComparison.OrdinalIgnoreCase))return "inactive";
            if(action=="paint-save")Chord(17,83);
            else if(action=="paint-commit")Chord(13);
            else if(action=="paint-esc")Chord(27);
            else if(action=="paint-close")Chord(0x12,0x73);
            else if(action!="paint-guard")throw new Exception("Unknown Paint action");
            return "ok";
        }
        if(thread==0 || !title.ToString().Contains(token) || !Process.GetProcessById((int)pid).ProcessName.Equals("Notepad",StringComparison.OrdinalIgnoreCase))return "inactive";
        var info=new Info();info.size=(uint)Marshal.SizeOf(info);
        if(!GetGUIThreadInfo(thread,ref info)||info.focus==IntPtr.Zero)return "inactive";
        var cls=new StringBuilder(128);GetClassName(info.focus,cls,128);
        if(cls.ToString().IndexOf("edit",StringComparison.OrdinalIgnoreCase)<0)return "waiting for editor";
        if(originalFocus==IntPtr.Zero)originalFocus=info.focus;
        if(originalFocus!=info.focus)return "different editor";
        if(action=="guard")return "ok";
        if(action=="state"){
            var text=new StringBuilder(4096);SendMessage(info.focus,13,(IntPtr)4096,text);
            return text.ToString();
        }
        if(action=="caret"){SendMessage(info.focus,0xb1,(IntPtr)1,(IntPtr)1);return "ok";}
        if(action=="open"){Chord(0x11,0x12,0x10,0x39);return "ok";}
        if(action=="alt-c"){Chord(0x12,0x43);return "ok";}
        if(AltTestKey(action))return "ok";
        if(action=="repeat-up" || action=="repeat-down" || action=="repeat-enter"){
            byte key=action=="repeat-up" ? (byte)38 : action=="repeat-down" ? (byte)40 : (byte)13;
            for(int i=0;i<4;i++)Key(key,false);
            Key(key,true);
            return "ok";
        }
        if(action=="up"){Chord(38);return "ok";}
        if(action=="down"){Chord(40);return "ok";}
        if(action=="enter"){Chord(13);return "ok";}
        if(action=="esc"){Chord(27);return "ok";}
        if(action=="save"){Chord(17,83);return "ok";}
        if(action=="close"){Chord(17,87);return "ok";}
        if(action.StartsWith("click ")){
            var parts=action.Split(' ');var p=new Point{X=int.Parse(parts[1]),Y=int.Parse(parts[2])};var popup=new IntPtr(long.Parse(parts[3]));
            Point prev;GetCursorPos(out prev);
            if(GetAncestor(WindowFromPoint(p),2)!=popup){
                Rect r;GetWindowRect(popup,out r);
                var role=new StringBuilder(80);GetClassName(GetAncestor(WindowFromPoint(p),2),role,80);
                int cloaked;DwmGetWindowAttribute(popup,14,out cloaked,4);
                return "point "+p.X+","+p.Y+" bounds "+r.left+","+r.top+".."+r.right+","+r.bottom+" visible="+IsWindowVisible(popup)+" cloaked="+cloaked+" ex="+Styles(popup,-20).ToInt64().ToString("X")+" under="+role+" fgEx="+Styles(fg,-20).ToInt64().ToString("X");
            }
            SetCursorPos(p.X,p.Y);
            try{if(GetForegroundWindow()!=fg||GetAncestor(WindowFromPoint(p),2)!=popup)throw new Exception("Target changed");mouse_event(2,0,0,0,UIntPtr.Zero);mouse_event(4,0,0,0,UIntPtr.Zero);}
            finally{Point now;if(GetCursorPos(out now)&&now.X==p.X&&now.Y==p.Y)SetCursorPos(prev.X,prev.Y);}
            return "ok";
        }
        throw new Exception("Unknown fixture action");
    }
}
