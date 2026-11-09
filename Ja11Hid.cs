using HidSharp;

namespace Ja11Control;

internal sealed class Ja11Hid : IDisposable
{
    private const int VendorId = 0x2972;
    private static readonly int[] ProductIds = [0x0101, 0x0102];
    private HidStream? stream;
    public bool IsConnected => stream != null;
    private long nextWrite;
    public bool DeviceFound { get; private set; }

    // A matching preset reply identifies the control interface on composite USB devices.
    public async Task<byte> ConnectAsync()
    {
        Disconnect();
        bool found = false;
        DeviceFound = false;
        foreach (var pid in ProductIds)
        foreach (var device in DeviceList.Local.GetHidDevices(VendorId, pid))
        {
            found = DeviceFound = true;
            try
            {
                if (device.GetMaxOutputReportLength() < 17 || device.GetMaxInputReportLength() < 17 ||
                    !device.TryOpen(out stream)) continue;

                stream!.WriteTimeout = 700;
                var preset = await QueryAsync(22);
                if (preset[0] <= 4) return preset[0];
            }
            catch (Exception ex) when (ex is IOException or TimeoutException or UnauthorizedAccessException) { }
            Disconnect();
        }
        throw new IOException(found ? "Đã thấy JA11 nhưng chưa đọc được preset qua USB. Cổng điều khiển chưa phản hồi." :
            "Chưa tìm thấy JA11. Cắm DAC vào USB rồi thử lại.");
    }

    // The host serializes complete commands, including all reads belonging to a snapshot.
    public async Task<byte[]> QueryAsync(byte command, byte? index = null)
    {
        var packet = index.HasValue
            ? new byte[] { 0xbb, 0x0b, 0, 0, command, 1, index.Value, 0xee }
            : new byte[] { 0xbb, 0x0b, 0, 0, command, 0, 0, 0xee };
        var deviceStream = stream ?? throw new IOException("JA11 chưa kết nối.");
        var buffer = new byte[deviceStream.Device.GetMaxInputReportLength()];
        int expected = command switch { 21 => 8, 11 or 23 => 2, _ => 1 };
        for (int attempt = 0; attempt < 2; attempt++)
        {
            await SendAsync(packet);
            long deadline = Environment.TickCount64 + 650;
            while (Environment.TickCount64 < deadline)
            {
                deviceStream.ReadTimeout = Math.Max(1, (int)(deadline - Environment.TickCount64));
                int count;
                try { count = await Task.Run(() => deviceStream.Read(buffer, 0, buffer.Length)); }
                catch (TimeoutException) { break; }
                const int payload = 7; // Windows HID report ID precedes the JA11 frame.
                if (count < payload + expected + 2 || buffer[0] != 2 || buffer[1] != 0xbb ||
                    buffer[2] != 0x0b || buffer[5] != command || buffer[6] != expected ||
                    buffer[payload + expected + 1] != 0xee ||
                    (index.HasValue && buffer[payload] != index.Value)) continue;
                return buffer[payload..(payload + expected)];
            }
        }
        string field = index.HasValue ? $"band {index.Value + 1}" : $"lệnh 0x{command:X2}";
        throw new IOException($"JA11 chưa trả đủ dữ liệu cho {field}. Bấm Đọc lại DAC để thử lại.");
    }

    public async Task SendAsync(byte[] packet)
    {
        var deviceStream = stream ?? throw new IOException("JA11 chưa kết nối.");
        var report = new byte[deviceStream.Device.GetMaxOutputReportLength()];
        report[0] = 2;
        Array.Copy(packet, 0, report, 1, packet.Length);
        int wait = (int)Math.Clamp(nextWrite - Environment.TickCount64, 0, 200);
        if (wait > 0) await Task.Delay(wait);
        await deviceStream.WriteAsync(report, 0, report.Length);
        nextWrite = Environment.TickCount64 + 200;
    }

    public void Disconnect()
    {
        stream?.Dispose();
        stream = null;
    }
    public void Dispose() => Disconnect();
}
