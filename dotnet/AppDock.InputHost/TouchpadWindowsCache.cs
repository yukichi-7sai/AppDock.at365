using System.Buffers.Binary;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;

namespace AppDock.InputHost;

// Resolve only the descriptor-backed touchpad IDs. Never
// broadcast a guessed range of undocumented setting identifiers.
internal sealed class TouchpadCacheProfile
{
    internal required Dictionary<string, int> Ids { get; init; }
    internal required string BinarySha256 { get; init; }
    internal static TouchpadCacheProfile Read()
    {
        var path = Path.Combine(Environment.SystemDirectory, "twinui.dll");
        var bytes = File.ReadAllBytes(path);
        VerifyHandler(File.ReadAllBytes(Path.Combine(Environment.SystemDirectory, "SettingsHandlers_nt.dll")));
        return new() { Ids = Parse(bytes), BinarySha256 = Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(bytes)) };
    }
    internal static Dictionary<string, int> Parse(byte[] bytes)
    {
        if (bytes.Length < 256 || BinaryPrimitives.ReadUInt16LittleEndian(bytes) != 0x5A4D) throw Invalid();
        var pe = Read32(bytes, 0x3C);
        if (pe < 64 || pe > bytes.Length - 264 || Read32(bytes, pe) != 0x4550 || Read16(bytes, pe + 4) != 0x8664) throw Invalid();
        var sections = Read16(bytes, pe + 6);
        var optionalSize = Read16(bytes, pe + 20);
        var optional = pe + 24;
        if (Read16(bytes, optional) != 0x20B || sections is < 1 or > 96 || optionalSize < 112) throw Invalid();
        var imageBase = Read64(bytes, optional + 24);
        var table = optional + optionalSize;
        if (table < 0 || table > bytes.Length - sections * 40) throw Invalid();
        var segments = new List<(int Offset, int Size, uint Rva)>();
        for (int i = 0; i < sections; i++) {
            var at = table + i * 40;
            var size = Read32(bytes, at + 16); var offset = Read32(bytes, at + 20);
            if (size < 0 || offset < 0 || offset > bytes.Length - size) throw Invalid();
            if (size != 0) segments.Add((offset, size, unchecked((uint)Read32(bytes, at + 12))));
        }
        List<ulong> Addresses(string text)
        {
            var needle = Encoding.Unicode.GetBytes(text + '\0');
            var found = new List<ulong>();
            foreach (var segment in segments) {
                var start = segment.Offset; var end = start + segment.Size - needle.Length;
                for (int i = start; i <= end; i += 2)
                    if ((i == start || bytes[i - 1] == 0 && bytes[i - 2] == 0) && bytes.AsSpan(i, needle.Length).SequenceEqual(needle))
                        found.Add(imageBase + segment.Rva + (ulong)(i - start));
            }
            return found;
        }
        var paths = Addresses(TouchpadRegistryValues.Path);
        if (paths.Count == 0) throw Invalid();
        var ids = new Dictionary<string, int>(StringComparer.Ordinal);
        foreach (var name in TouchpadWindowsModel.Names) {
            var names = Addresses(name);
            var matches = new HashSet<int>();
            foreach (var segment in segments) {
                for (int at = segment.Offset + 16; at <= segment.Offset + segment.Size - 24; at += 8) {
                    if (!names.Contains(Read64(bytes, at)) || !paths.Contains(Read64(bytes, at - 8))) continue;
                    var id64 = Read64(bytes, at - 16);
                    if (id64 is > 0 and < 256 && Read64(bytes, at + 8) <= uint.MaxValue && Read64(bytes, at + 16) == 0) matches.Add((int)id64);
                }
            }
            if (matches.Count != 1) throw Invalid();
            ids.Add(name, matches.Single());
        }
        if (ids.Values.Distinct().Count() != TouchpadWindowsModel.Names.Length) throw Invalid();
        return ids;
    }
    internal static void VerifyHandler(byte[] bytes)
    {
        if (bytes.Length < 256 || Read16(bytes, 0) != 0x5A4D) throw Invalid();
        var pe = Read32(bytes, 0x3C);
        if (pe < 64 || pe > bytes.Length - 264 || Read32(bytes, pe) != 0x4550 || Read16(bytes, pe + 4) != 0x8664) throw Invalid();
        var optional = pe + 24; var count = Read16(bytes, pe + 6); var size = Read16(bytes, pe + 20);
        if (Read16(bytes, optional) != 0x20B || count is < 1 or > 96 || size < 112) throw Invalid();
        var imageBase = Read64(bytes, optional + 24); var table = optional + size;
        if (table > bytes.Length - count * 40) throw Invalid();
        var segments = new List<(int Offset, int Size, uint Rva)>();
        for (var i = 0; i < count; i++) {
            var at = table + i * 40; var length = Read32(bytes, at + 16); var offset = Read32(bytes, at + 20);
            if (length < 0 || offset < 0 || offset > bytes.Length - length) throw Invalid();
            if (length > 0) segments.Add((offset, length, (uint)Read32(bytes, at + 12)));
        }
        HashSet<ulong> Addresses(string name) {
            var needle = Encoding.Unicode.GetBytes(name + '\0'); var result = new HashSet<ulong>();
            foreach (var segment in segments)
                for (int at = segment.Offset; at <= segment.Offset + segment.Size - needle.Length; at += 2)
                    if (bytes.AsSpan(at, needle.Length).SequenceEqual(needle)) result.Add(imageBase + segment.Rva + (ulong)(at - segment.Offset));
            return result;
        }
        foreach (var row in TouchpadWindowsModel.Descriptors) {
            var keys = Addresses(row.Key); var actions = Addresses(row.Action); var modes = Addresses(row.Mode);
            var matches = 0;
            foreach (var segment in segments)
                for (int at = segment.Offset; at <= segment.Offset + segment.Size - 40; at += 8)
                    if (keys.Contains(Read64(bytes, at)) && actions.Contains(Read64(bytes, at + 8)) &&
                        (uint)Read32(bytes, at + 20) == row.CustomAction && modes.Contains(Read64(bytes, at + 24)) && Read32(bytes, at + 32) == 0xFFFF) matches++;
            if (matches != 1) throw Invalid();
        }
        var expected = TouchpadWindowsModel.PresetTable.SelectMany(BitConverter.GetBytes).ToArray();
        var tableFound = false;
        foreach (var segment in segments)
            for (int at = segment.Offset; at <= segment.Offset + segment.Size - expected.Length; at += 4)
                if (bytes.AsSpan(at, expected.Length).SequenceEqual(expected)) { tableFound = true; break; }
        if (!tableFound) throw Invalid();
    }
    private static ushort Read16(byte[] bytes, int at) => BinaryPrimitives.ReadUInt16LittleEndian(bytes.AsSpan(at, 2));
    private static int Read32(byte[] bytes, int at) => BinaryPrimitives.ReadInt32LittleEndian(bytes.AsSpan(at, 4));
    private static ulong Read64(byte[] bytes, int at) => BinaryPrimitives.ReadUInt64LittleEndian(bytes.AsSpan(at, 8));
    private static InvalidDataException Invalid() => new("このWindowsの設定形式を確認できないため、変更しません。ログを確認してください。");
}

internal sealed class TouchpadWindowsCache : ITouchpadCache
{
    private object? shell;
    private IImmersiveSettingsCache? cache;
    private readonly TouchpadCacheProfile profile;
    internal TouchpadWindowsCache(TouchpadCacheProfile profile)
    {
        this.profile = profile;
        try {
            var type = Type.GetTypeFromCLSID(new("c2f03a33-21f5-47fa-b4bb-156362a2f239"), true)!;
            shell = Activator.CreateInstance(type) ?? throw new COMException("Windows Shellへ接続できません。");
            var provider = (IServiceProviderNative)shell;
            var service = new Guid("53660488-8855-460b-a9ab-5cfc6b5012ca");
            var iid = typeof(IImmersiveSettingsCache).GUID;
            Marshal.ThrowExceptionForHR(provider.QueryService(ref service, ref iid, out cache));
        } catch { Dispose(); throw; }
    }
    public int Id(string name) => profile.Ids[name];
    public uint Read(string name) { Marshal.ThrowExceptionForHR(cache!.GetDWORD(Id(name), out var value)); return value; }
    public void Changed(string name) => Marshal.ThrowExceptionForHR(cache!.OnSettingChanged(Id(name)));
    public void Dispose()
    {
        if (cache != null && Marshal.IsComObject(cache)) Marshal.ReleaseComObject(cache);
        cache = null;
        if (shell != null && Marshal.IsComObject(shell)) Marshal.ReleaseComObject(shell);
        shell = null;
    }
    [ComImport, Guid("6d5140c1-7436-11ce-8034-00aa006009fa"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IServiceProviderNative
    {
        [PreserveSig] int QueryService(ref Guid service, ref Guid iid, [MarshalAs(UnmanagedType.Interface)] out IImmersiveSettingsCache? result);
    }
    [ComImport, Guid("4214f6fa-eb36-4e2f-9ca2-23fdc1832df7"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IImmersiveSettingsCache
    {
        [PreserveSig] int OnSettingChanged(int setting);
        [PreserveSig] int GetBOOL(int setting, [MarshalAs(UnmanagedType.Bool)] out bool value);
        [PreserveSig] int GetDWORD(int setting, out uint value);
        [PreserveSig] int RegisterForSettingChange(nint listener, out uint cookie);
        [PreserveSig] int UnregisterForSettingChange(uint cookie);
    }
}
