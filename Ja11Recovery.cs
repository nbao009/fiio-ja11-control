using System.Runtime.InteropServices;
using System.Text;
using Microsoft.Win32.SafeHandles;
using HidSharp;

namespace Ja11Control;

internal static class Ja11Recovery
{
    [DllImport("cfgmgr32.dll", CharSet=CharSet.Unicode)] private static extern uint CM_Locate_DevNodeW(out uint node, string id, uint flags);
    [DllImport("cfgmgr32.dll")] private static extern uint CM_Get_Parent(out uint parent, uint node, uint flags);
    [DllImport("cfgmgr32.dll", CharSet=CharSet.Unicode)] private static extern uint CM_Get_Device_IDW(uint node, StringBuilder id, uint size, uint flags);
    [DllImport("cfgmgr32.dll", CharSet=CharSet.Unicode)] private static extern uint CM_Get_DevNode_Registry_PropertyW(uint node, uint property, out uint type, out uint data, ref uint size, uint flags);
    [DllImport("cfgmgr32.dll", CharSet=CharSet.Unicode)] private static extern uint CM_Get_Device_Interface_List_SizeW(out uint size, ref Guid guid, string id, uint flags);
    [DllImport("cfgmgr32.dll", CharSet=CharSet.Unicode)] private static extern uint CM_Get_Device_Interface_ListW(ref Guid guid, string id, [Out] char[] buffer, uint size, uint flags);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] private static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
    [DllImport("kernel32.dll", SetLastError=true)] private static extern bool DeviceIoControl(SafeFileHandle handle,uint code,byte[] input,int inputSize,byte[] output,int outputSize,out int returned,IntPtr overlapped);

    private static string Id(uint node)
    {
        var id = new StringBuilder(512);
        if (CM_Get_Device_IDW(node,id,512,0)!=0) throw new IOException("Cannot identify USB node");
        return id.ToString();
    }

    public static int Cycle()
    {
        try
        {
            var device = new[] {0x101,0x102}.SelectMany(pid=>DeviceList.Local.GetHidDevices(0x2972,pid)).FirstOrDefault();
            if (device is null) return 2;
            var parts = device.DevicePath[4..].Split('#');
            if (parts.Length < 3) return 3;
            string instance = string.Join("\\",parts.Take(3));
            if (CM_Locate_DevNodeW(out var node,instance,0)!=0) return 4;
            for(int i=0;i<6;i++)
            {
                string id=Id(node);
                if (System.Text.RegularExpressions.Regex.IsMatch(id,@"^USB\\VID_2972&PID_010[12]\\",System.Text.RegularExpressions.RegexOptions.IgnoreCase))
                {
                    uint size=4;
                    if(CM_Get_DevNode_Registry_PropertyW(node,29,out _,out uint port,ref size,0)!=0 || port==0 || port>255) return 5;
                    if(CM_Get_Parent(out uint parent,node,0)!=0) return 6;
                    var guid=new Guid("f18a0e88-c30c-11d0-8815-00a0c906bed8");
                    string hub=Id(parent);
                    if(CM_Get_Device_Interface_List_SizeW(out uint length,ref guid,hub,0)!=0 || length<2) return 7;
                    var list=new char[length];
                    if(CM_Get_Device_Interface_ListW(ref guid,hub,list,length,0)!=0) return 8;
                    string path=new string(list).Split('\0')[0];
                    using var handle=CreateFileW(path,0x40000000,3,IntPtr.Zero,3,0,IntPtr.Zero);
                    if(handle.IsInvalid) return 9;
                    var info=new byte[128];BitConverter.GetBytes(port).CopyTo(info,0);
                    if(!DeviceIoControl(handle,0x220448,info,info.Length,info,info.Length,out _,IntPtr.Zero))return 10;
                    ushort vid=BitConverter.ToUInt16(info,12),pid=BitConverter.ToUInt16(info,14);
                    if(vid!=0x2972 || pid is not (0x101 or 0x102))return 11;
                    var cycle=new byte[8];BitConverter.GetBytes(port).CopyTo(cycle,0);
                    return DeviceIoControl(handle,0x220444,cycle,8,cycle,8,out _,IntPtr.Zero) && BitConverter.ToUInt32(cycle,4)==0 ? 0 : 12;
                }
                if(CM_Get_Parent(out node,node,0)!=0)break;
            }
            return 13;
        }
        catch { return 14; }
    }
}
