using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using Windows.ApplicationModel.DataTransfer;
using Clipboard = Windows.ApplicationModel.DataTransfer.Clipboard;

// Synthetic history entries only. Preserve other owners, existing items and a full history.
internal static class Program
{
    [DllImport("user32")] static extern bool OpenClipboard(nint owner);
    [DllImport("user32")] static extern bool CloseClipboard();
    [DllImport("user32")] static extern bool EmptyClipboard();
    [DllImport("user32")] static extern int CountClipboardFormats();
    [DllImport("user32")] static extern nint GetClipboardOwner();
    [DllImport("user32")] static extern uint GetClipboardSequenceNumber();
    [DllImport("user32")] static extern nint SetClipboardData(uint format,nint data);
    [DllImport("user32",CharSet=CharSet.Unicode)] static extern uint RegisterClipboardFormat(string format);
    [DllImport("kernel32")] static extern nint GlobalAlloc(uint flags,nuint size);
    [DllImport("kernel32")] static extern nint GlobalLock(nint data);
    [DllImport("kernel32")] static extern bool GlobalUnlock(nint data);
    [DllImport("kernel32")] static extern nint GlobalFree(nint data);
    static void Put(uint format,byte[] bytes)
    {
        nint h=GlobalAlloc(0x42,(nuint)bytes.Length);
        try {
            nint p=GlobalLock(h);
            if(p==0)throw new Exception("allocate");
            try {Marshal.Copy(bytes,0,p,bytes.Length);} finally {GlobalUnlock(h);}
            if(SetClipboardData(format,h)==0)throw new Exception("publication");
            h=0;
        } finally {if(h!=0)GlobalFree(h);}
    }
    static async Task<IReadOnlyList<ClipboardHistoryItem>> Items()
    {
        var result=await Clipboard.GetHistoryItemsAsync();
        if(result.Status!=ClipboardHistoryItemsResultStatus.Success)throw new Exception(result.Status.ToString());
        return result.Items;
    }
    [STAThread] static void Main(string[] args)
    {
        using var window=new Control();
        var owner=window.Handle;
        using var messageLoop=new ApplicationContext();
        window.BeginInvoke(async () => {
            var owned=new List<ClipboardHistoryItem>();
            HashSet<string>? optionBaseline=null;
            uint sequence=0;
            string token=args[0],dir=args[1];
            async Task<(bool Off,bool On)> RemoveOptions(){
                bool off=false,on=false;
                if(optionBaseline!=null)
                    foreach(var item in (await Items()).Where(i=>!optionBaseline.Contains(i.Id))){
                        if(!item.Content.Contains(StandardDataFormats.Text))continue;
                        var value=await item.Content.GetTextAsync();
                        if(value!=token+"-off" && value!=token+"-on")continue;
                        if(!Clipboard.DeleteItemFromHistory(item))throw new Exception("Could not remove test option item");
                        off|=value==token+"-off";
                        on|=value==token+"-on";
                    }
                return(off,on);
            }
            var marker = Color.FromArgb(255, Convert.ToInt32(token[^6..],16)>>16, Convert.ToInt32(token[^4..],16)>>8,Convert.ToInt32(token[^2..],16));
            async Task ClearTestCurrent() {
                for(int i=0;i<100&&!OpenClipboard(owner);i++){if(i==99)throw new Exception("clipboard busy");await Task.Delay(10);}
                try {if(sequence!=0 && GetClipboardSequenceNumber()==sequence) EmptyClipboard();}finally{CloseClipboard();}
            }
            try {
                while(await Console.In.ReadLineAsync() is {} cmd) {
                    try {
                        if(cmd=="finish")break;
                        if(cmd=="watch-options"){
                            var baseline=await Items();
                            if(baseline.Count>22)throw new Exception("Full history preserved");
                            optionBaseline=baseline.Select(i=>i.Id).ToHashSet();
                        }else if(cmd=="check-options"){
                            var flags=await RemoveOptions();
                            if(flags.Off)throw new Exception("Excluded text entered history");
                            if(!flags.On){Console.WriteLine("pending");continue;}
                            optionBaseline=null;
                        }else if(cmd=="seed"){
                            var list=await Items();
                            if(list.Count>22)throw new Exception("Full history preserved");
                            var prior=list.Select(i=>i.Id).ToHashSet();
                            using var pic=new Bitmap(16,16);
                            using(var g=Graphics.FromImage(pic))g.Clear(marker);
                            using var bytes=new MemoryStream();
                            pic.Save(bytes,ImageFormat.Bmp);
                            using var blank=new Bitmap(96,96);
                            using(var g=Graphics.FromImage(blank))g.Clear(Color.White);
                            blank.Save(Path.Combine(dir,token+".bmp"),ImageFormat.Bmp);
                            foreach(bool picture in new[]{false,true}){
                                if(!OpenClipboard(owner))throw new Exception("clipboard busy");
                                try{
                                    if(picture ? GetClipboardOwner()!=owner || GetClipboardSequenceNumber()!=sequence : CountClipboardFormats()!=0)throw new Exception("Foreign clipboard preserved");
                                    if(!EmptyClipboard())throw new Exception("clear");
                                    Put(RegisterClipboardFormat("CanUploadToCloudClipboard"),BitConverter.GetBytes(0));
                                    Put(RegisterClipboardFormat("CanIncludeInClipboardHistory"),BitConverter.GetBytes(1));
                                    Put(picture?8u:13u,picture?bytes.ToArray()[14..]:Encoding.Unicode.GetBytes(token+"🌸\0"));
                                }finally{CloseClipboard();}
                                sequence=GetClipboardSequenceNumber();
                                var deadline=DateTime.UtcNow.AddSeconds(8);
                                ClipboardHistoryItem? found=null;
                                while(DateTime.UtcNow<deadline && found==null){
                                    var added=(await Items()).Where(i=>!prior.Contains(i.Id)).ToArray();
                                    if(added.Length>1||GetClipboardOwner()!=owner||GetClipboardSequenceNumber()!=sequence)throw new Exception("Concurrent clipboard activity");
                                    if(added.Length==1 && added[0].Content.Contains(picture?StandardDataFormats.Bitmap:StandardDataFormats.Text)){
                                        found=added[0];owned.Add(found);prior.Add(found.Id);
                                    }else await Task.Delay(40);
                                }
                                if(found==null)throw new Exception("Synthetic history item missing");
                            }
                            // An unchanged clipboard would let a broken history restore pass the text/image test.
                            await ClearTestCurrent();
                        }else if(cmd=="track"){
                            // Test driver requests this only after observing the exact fixture selection.
                            // Ensure a foreign clipboard cannot be cleared by cleanup.
                            uint before=GetClipboardSequenceNumber();
                            var content=Clipboard.GetContent();
                            bool match=false;
                            if(content.Contains(StandardDataFormats.Text))match=await content.GetTextAsync()==token+"🌸";
                            else if(content.Contains(StandardDataFormats.Bitmap)){
                                using var stream=await (await content.GetBitmapAsync()).OpenReadAsync();
                                using var bitmap=new Bitmap(stream.AsStreamForRead());
                                match=bitmap.Width==16 && bitmap.Height==16 && bitmap.GetPixel(8,8).ToArgb()==marker.ToArgb();
                            }
                            if(!match || before!=GetClipboardSequenceNumber())throw new Exception("Current item differs");
                            sequence=before;
                        }else if(cmd=="check-paint"){
                            // GDI+ keeps a file-backed Bitmap locked. Decode a snapshot so validation
                            // never prevents Paint from replacing its test file during an async save.
                            using var bytes=new MemoryStream();
                            using(var file=new FileStream(Path.Combine(dir,token+".bmp"),FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete))
                                file.CopyTo(bytes);
                            bytes.Position=0;
                            using var bitmap=new Bitmap(bytes);
                            int count=0;
                            for(int y=0;y<bitmap.Height;y++)for(int x=0;x<bitmap.Width;x++)if(bitmap.GetPixel(x,y).ToArgb()==marker.ToArgb())count++;
                            if(count!=256)throw new Exception("Pixels not saved yet");
                        }else if(cmd=="remove-image"){
                            if(owned.Count!=2||!Clipboard.DeleteItemFromHistory(owned[1]))throw new Exception("remove fixture image");
                            owned.RemoveAt(1);
                        }else throw new Exception("Unknown fixture command");
                        Console.WriteLine("ok");
                    }catch(Exception e){Console.WriteLine("error "+e.GetType().Name+" "+e.Message);}
                }
            }finally{
                try{
                    await ClearTestCurrent();
                    await RemoveOptions();
                    foreach(var item in owned)Clipboard.DeleteItemFromHistory(item);
                    var remaining=(await Items()).Select(i=>i.Id).ToHashSet();
                    Console.WriteLine(owned.Any(i=>remaining.Contains(i.Id))?"cleanup failed":"cleaned");
                } finally {messageLoop.ExitThread();}
            }
        });
        Application.Run(messageLoop);
    }
}
