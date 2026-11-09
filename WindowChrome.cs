using System.Runtime.InteropServices;

namespace Ja11Control;

public sealed partial class MainForm
{
    [DllImport("user32.dll")] private static extern bool ReleaseCapture();
    [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hwnd, int message, IntPtr wParam, IntPtr lParam);
    [DllImport("gdi32.dll")] private static extern IntPtr CreateRoundRectRgn(int left,int top,int right,int bottom,int width,int height);
    [DllImport("gdi32.dll")] private static extern bool DeleteObject(IntPtr obj);

    private void UpdateWindowShape()
    {
        if (!IsHandleCreated || WindowState == FormWindowState.Minimized) return;
        var old = Region;
        if (WindowState == FormWindowState.Maximized) Region = null;
        else
        {
            int radius = (int)(18 * DeviceDpi / 96f);
            var region = CreateRoundRectRgn(0,0,Width+1,Height+1,radius,radius);
            try { Region = Region.FromHrgn(region); }
            finally { DeleteObject(region); }
        }
        old?.Dispose();
    }

    private void WindowAction(string action, int edge)
    {
        switch (action)
        {
            case "window-close": Close(); return;
            case "window-minimize": WindowState = FormWindowState.Minimized; return;
            case "window-maximize":
                MaximizedBounds = Screen.FromHandle(Handle).WorkingArea;
                WindowState = WindowState == FormWindowState.Maximized ? FormWindowState.Normal : FormWindowState.Maximized;
                return;
            case "window-drag":
                if (WindowState == FormWindowState.Maximized)
                {
                    var point = Cursor.Position;
                    var fraction = Math.Clamp((point.X - Left) / (double)Width, 0, 1);
                    WindowState = FormWindowState.Normal;
                    Location = new Point(point.X - (int)(Width * fraction),point.Y - 24);
                }
                ReleaseCapture();
                SendMessage(Handle,0xA1,(IntPtr)2,IntPtr.Zero);
                return;
            case "window-resize":
                if (WindowState != FormWindowState.Normal || edge < 10 || edge > 17) return;
                ReleaseCapture();
                SendMessage(Handle,0xA1,(IntPtr)edge,IntPtr.Zero);
                return;
        }
    }
}
