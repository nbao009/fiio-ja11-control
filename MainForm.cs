using Microsoft.Web.WebView2.Core;
using System.Text.Json;

namespace Ja11Control;

public sealed partial class MainForm : Form
{
    private readonly Microsoft.Web.WebView2.WinForms.WebView2 view = new();
    private FiioAccountPanel? accountPanel;
    private readonly SettingsStore settings = new();
    private readonly LocalPresetStore localPresets = new();
    private readonly Ja11Hid hid = new();
    private object? lastDeviceSnapshot;

    private readonly SemaphoreSlim commands = new(1, 1);

    public MainForm()
    {
        Text = "JA11 Control";
        FormBorderStyle = FormBorderStyle.None;
        HandleCreated += (_, _) => UpdateWindowShape();
        SizeChanged += (_, _) => { UpdateWindowShape(); accountPanel?.FitToParent(); };
        MinimumSize = new Size(900, 650);
        Size = new Size(1200, 820);
        StartPosition = FormStartPosition.CenterScreen;
        BackColor = Color.FromArgb(12, 15, 22);
        Controls.Add(view);
        view.Dock = DockStyle.Fill;
        Load += InitializeView;
    }

    private async void InitializeView(object? sender, EventArgs e)
    {
        // Keep existing installations' local presets and FiiO sign-in. New installs
        // use a per-user profile that survives moving the application folder.
        var oldProfile = Application.ExecutablePath + ".WebView2";
        var userFolder = Directory.Exists(oldProfile) ? oldProfile : Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Ja11Control", "WebView2");
        var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: userFolder);
        await view.EnsureCoreWebView2Async(environment);
        view.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
        view.CoreWebView2.WebMessageReceived += OnMessage;
        var path = Path.Combine(AppContext.BaseDirectory, "ui", "studio.html");
        view.CoreWebView2.Navigate(new Uri(path).AbsoluteUri);
    }

    private async void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        var studio = new Uri(Path.Combine(AppContext.BaseDirectory, "ui", "studio.html"));
        if (!Uri.TryCreate(e.Source, UriKind.Absolute, out var source) || !studio.Equals(source)) return;
        using (var windowMessage = JsonDocument.Parse(e.WebMessageAsJson))
        {
            var request = windowMessage.RootElement;
            string? windowAction = request.GetProperty("action").GetString();
            if (windowAction?.StartsWith("window-", StringComparison.Ordinal) == true)
            {
                int edge = request.TryGetProperty("value", out var value) && value.TryGetInt32(out var number) ? number : 0;
                WindowAction(windowAction, edge);
                return;
            }
        }
        await commands.WaitAsync();
        string? action = null;
        try
        {
            using var message = JsonDocument.Parse(e.WebMessageAsJson);
            var root = message.RootElement;
            action = root.GetProperty("action").GetString();
            object result = action switch
            {
                "settings-read" => settings.Read(),
                "settings-save" => settings.Save(root.GetProperty("value")),
                "local-presets-load" => localPresets.Load(),
                "local-presets-save" => localPresets.Save(root.GetProperty("value")),
                "local-presets-open" => localPresets.OpenFolder(),
                "connect" => await ConnectDeviceAsync(),
                "fiio-start" or "fiio-account" or "fiio-refresh" or "fiio-logout" => HandleAccount(action),
                "fiio-login-start" => await StartAccountLoginAsync(false),
                "fiio-login-refresh" => await StartAccountLoginAsync(true),
                "fiio-register" => OpenFiioRegistration(),
                "fiio-forgot-password" => OpenFiioPasswordReset(),
                "open-social" => OpenSocial(root.GetProperty("value").GetString()),
                "fiio-login-submit" => await SubmitAccountLoginAsync(root.GetProperty("value")),
                "open-handpick" or "fiio-manage" => HandleAccount(action),
                "handpick-list" or "handpick-save" => await HandpickAsync(action, root.GetProperty("value")),
                "fiio-save-custom" => await SaveAccountCustomAsync(root.GetProperty("value")),
                "preset" => await SetPresetAsync(root),
                "apply-eq" => await WritePeqAsync(root, false),
                "save-eq" => await SaveEqAsync(root),
                "setting" => await SetSettingAsync(root),
                "usb-mode" => await SetUacAsync(root),
                _ => new { ok = false, message = "Lệnh chưa được hỗ trợ." }
            };
            await ReplyAsync(result);
        }
        catch (Exception ex)
        {
            if (action == "connect") hid.Disconnect();
            if (!IsDisposed && !Disposing) await ReplyAsync(new { ok = false, action, message = ex.Message });
        }
        finally { commands.Release(); }
    }

    private async Task<object> ConnectDeviceAsync()
    {
        try { return await ReadDeviceSnapshotAsync(); }
        catch (IOException) when (hid.DeviceFound)
        {
            hid.Disconnect();
            await ReplyAsync(new { action = "dac-recovery", message = "Đang khôi phục cổng USB JA11. Windows sẽ hỏi quyền quản trị…" });
            try
            {
                using var helper = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = Application.ExecutablePath, Arguments = "--recover-usb",
                    UseShellExecute = true, Verb = "runas", WindowStyle = System.Diagnostics.ProcessWindowStyle.Hidden
                }) ?? throw new IOException("Không mở được công cụ khôi phục JA11.");
                await helper.WaitForExitAsync().WaitAsync(TimeSpan.FromSeconds(20));
                if (helper.ExitCode != 0) throw new IOException($"Windows chưa reset được cổng JA11 (mã {helper.ExitCode}).");
            }
            catch (System.ComponentModel.Win32Exception ex) when (ex.NativeErrorCode == 1223)
            {
                throw new IOException("Đã hủy khôi phục. Bấm Kết nối và cho phép Windows reset cổng JA11 để thử lại.");
            }
            await ReplyAsync(new { action = "dac-recovery", message = "Đang chờ JA11 khởi động lại và đọc cấu hình…" });
            await Task.Delay(2000);
            for (int attempt = 0; attempt < 5; attempt++)
            {
                try { return await ReadDeviceSnapshotAsync(); }
                catch (IOException) when (attempt < 4) { hid.Disconnect(); await Task.Delay(750); }
            }
            throw new IOException("JA11 chưa phản hồi sau khi khôi phục.");
        }
    }

    private async Task<object> ReadDeviceSnapshotAsync()
    {
        byte preset = await hid.ConnectAsync();
        var values = new Dictionary<string, object?> { ["preset"] = preset };
        var gain = await hid.QueryAsync(23);
        short raw = System.Buffers.Binary.BinaryPrimitives.ReadInt16LittleEndian(gain);
        double masterGain = Math.Round(raw / 2560d, 1);
        if (masterGain is < -12 or > 12) throw new IOException("Global gain JA11 trả về nằm ngoài phạm vi.");
        values["masterGain"] = masterGain;
        var bands = new List<object>();
        for (byte i = 0; i < 5; i++)
        {
            var data = await hid.QueryAsync(21, i);
            double bandGain = (short)((data[1] << 8) | data[2]) / 10d;
            int freq = (data[3] << 8) | data[4];
            double q = ((data[5] << 8) | data[6]) / 100d;
            if (bandGain is < -12 or > 12 || freq is < 20 or > 20000 || q is < 0.1 or > 10 || data[7] > 2)
                throw new IOException($"JA11 trả thông số ngoài phạm vi ở band {i + 1}. Bấm Đọc lại DAC.");
            bands.Add(new { type = data[7] switch { 1 => "LSC", 2 => "HSC", _ => "PK" }, gain = bandGain, freq, q });
        }
        foreach (var (name, command) in new[] { ("firmware", (byte)11), ("mic", (byte)18), ("uac", (byte)32), ("sampleRate", (byte)9) })
        {
            var data = await hid.QueryAsync(command);
            values[name] = name == "firmware" ? $"{data[0]}.{data[1]}" : data[0];
        }
        values["bands"] = bands;
        lastDeviceSnapshot = new { ok = true, connected = true, message = "Đã kết nối và đọc cấu hình JA11.", state = values };
        return lastDeviceSnapshot;
    }

    private static object OpenSocial(string? platform)
    {
        string? url = platform switch
        {
            "facebook" => "https://www.facebook.com/bao0808",
            "tiktok" => "https://www.tiktok.com/@_baoisme",
            "github" => "https://github.com/nbao009",
            _ => null
        };
        if (url == null) return new { ok = false, message = "Liên kết không hợp lệ." };
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(url) { UseShellExecute = true });
        return new { ok = true };
    }

    private static object OpenFiioPasswordReset()
    {
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(
            "https://usersystem.fiio.com/sso/findpwd") { UseShellExecute = true });
        return new { ok = true };
    }

    private static object OpenFiioRegistration()
    {
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(
            "https://usersystem.fiio.com/sso/register") { UseShellExecute = true });
        return new { ok = true };
    }

    private async Task<object> StartAccountLoginAsync(bool refresh)
    {
        if (accountPanel == null) HandleAccount("fiio-start");
        return await accountPanel!.PrepareLoginAsync(refresh);
    }

    private async Task<object> SubmitAccountLoginAsync(JsonElement value)
    {
        var username = value.GetProperty("username").GetString() ?? "";
        var password = value.GetProperty("password").GetString() ?? "";
        var captcha = value.GetProperty("captcha").GetString() ?? "";
        if (username.Length is < 1 or > 256 || password.Length is < 1 or > 256 || captcha.Length is < 1 or > 32)
            return new { action = "fiio-login-result", ok = false, message = "Kiểm tra thông tin đăng nhập." };
        return await accountPanel!.SubmitLoginAsync(username,password,captcha);
    }

    private void CloseAccountPanel()
    {
        var panel = accountPanel;
        accountPanel = null;
        if (panel == null) return;
        Controls.Remove(panel);
        panel.Dispose();
    }

    private object HandleAccount(string action)
    {
        if (accountPanel == null)
        {
            accountPanel = new FiioAccountPanel(PublishAccount, ApplyPopupPresetAsync, ReadPortalDeviceAsync, CloseAccountPanel, settings.Current.Theme == "light", settings.Current.Accent, settings.Current.Language) { Visible = false };
            Controls.Add(accountPanel);
            _ = accountPanel.StartAsync(view.CoreWebView2.Environment);
        }
        switch (action)
        {
            case "open-handpick": accountPanel.OpenOfficialHandpick(); break;
            case "fiio-manage": accountPanel.OpenAccountLibrary(); break;
            case "fiio-account": accountPanel.OpenLogin(); break;
            case "fiio-refresh": accountPanel.RefreshLibrary(); break;
            case "fiio-logout": accountPanel.SignOut(); break;
        }
        return new { ok = true };
    }

    private async void PublishAccount(object update)
    {
        if (IsDisposed || Disposing) return;
        try { await ReplyAsync(update); }
        catch (Exception) when (IsDisposed || Disposing || view.IsDisposed) { }
    }

    private async Task<object> HandpickAsync(string action, JsonElement value)
    {
        if (accountPanel == null) HandleAccount("fiio-start");
        bool sent = await accountPanel!.TryHandpickAsync(action, value);
        if (sent) return new { ok = true };
        return new { action = action == "handpick-list" ? "handpick" : "handpickSaved",
            request = value.GetProperty("request").GetInt32(), id = value.TryGetProperty("id", out var id) ? id.GetString() : null,
            ok = false, error = true };
    }

    private async Task<object> SaveAccountCustomAsync(JsonElement value)
    {
        if (accountPanel == null) HandleAccount("fiio-start");
        bool sent = await accountPanel!.TrySaveCustomAsync(value);
        return sent ? new { ok = true } : new { action = "customSaved", request = value.GetProperty("request").GetInt32(), ok = false };
    }

    private async Task<object> ApplyPopupPresetAsync(JsonElement snapshot)
    {
        await commands.WaitAsync();
        try
        {
            var bands = snapshot.GetProperty("bands");
            double global = snapshot.GetProperty("masterGain").GetDouble();
            if (bands.GetArrayLength() != 5 || global is < -12 or > 12) throw new ArgumentException("EQ không hợp lệ cho JA11.");
            foreach (var band in bands.EnumerateArray())
            {
                if (band.GetProperty("freq").GetInt32() is < 20 or > 20000 ||
                    band.GetProperty("gain").GetDouble() is < -12 or > 12 ||
                    band.GetProperty("q").GetDouble() is < .1 or > 10 ||
                    band.GetProperty("type").GetString() is not ("PK" or "LSC" or "HSC"))
                    throw new ArgumentException("EQ không hợp lệ cho JA11.");
            }
            using var request = JsonDocument.Parse(JsonSerializer.Serialize(new { value = snapshot }));
            try { await WritePeqAsync(request.RootElement, true); }
            catch (IOException)
            {
                hid.Disconnect();
                await hid.ConnectAsync();
                await WritePeqAsync(request.RootElement, true);
            }
            for (int attempt = 0; attempt < 3; attempt++)
            {
                try
                {
                    if (attempt > 0) await Task.Delay(350);
                    var state = await ReadDeviceSnapshotAsync();
                    await ReplyAsync(state);
                    return new { ok = true, verified = true, message = "Đã áp dụng và đọc lại JA11." };
                }
                catch (IOException) when (attempt < 2) { hid.Disconnect(); }
                catch (Exception) { break; }
            }
            return new { ok = true, verified = false, message = "Đã gửi lệnh lưu vào JA11; bấm Đọc lại DAC để kiểm tra." };
        }
        catch (Exception ex) { return new { ok = false, message = ex.Message }; }
        finally { commands.Release(); }
    }

    private async Task<object> ReadPortalDeviceAsync()
    {
        await commands.WaitAsync();
        try { return hid.IsConnected && lastDeviceSnapshot != null ? lastDeviceSnapshot : await ReadDeviceSnapshotAsync(); }
        finally { commands.Release(); }
    }

    private async Task<object> SetPresetAsync(JsonElement root)
    {
        var name = root.GetProperty("value").GetString();
        var preset = name switch { "Vocal" => 0, "Classic" => 1, "Bass" => 2, "Tùy chỉnh" => 3, _ => 4 };
        await hid.SendAsync([0xaa, 0x0a, 0, 0, 22, 1, (byte)preset, 0, 0xee]);
        return new { ok = true, message = "Đã gửi cấu hình EQ xuống JA11." };
    }

    private Task<object> SaveEqAsync(JsonElement root) => WritePeqAsync(root, true);

    private async Task<object> WritePeqAsync(JsonElement root, bool persist)
    {
        var cfg = root.GetProperty("value");
        var gain = (short)Math.Round(cfg.GetProperty("masterGain").GetDouble() * 2560);
        await hid.SendAsync([0xaa, 0x0a, 0, 0, 22, 1, 3, 0, 0xee]);
        await hid.SendAsync([0xaa, 0x0a, 0, 0, 23, 2, (byte)(gain & 255), (byte)((gain >> 8) & 255), 0, 0xee]);
        var bands = cfg.GetProperty("bands");
        if (bands.GetArrayLength() != 5) throw new ArgumentException("PEQ must contain five bands.");
        var index = 0;
        foreach (var band in bands.EnumerateArray())
        {
            var db = (short)Math.Round(band.GetProperty("gain").GetDouble() * 10);
            var freq = (ushort)band.GetProperty("freq").GetInt32();
            var q = (ushort)Math.Round(band.GetProperty("q").GetDouble() * 100);
            var type = band.GetProperty("type").GetString() switch { "LSC" => 1, "HSC" => 2, _ => 0 };
            await hid.SendAsync([0xaa, 0x0a, 0, 0, 21, 8, (byte)index,
                (byte)((db >> 8) & 255), (byte)(db & 255),
                (byte)(freq >> 8), (byte)(freq & 255), (byte)(q >> 8), (byte)(q & 255),
                (byte)type, 0, 0xee]);
            index++;
        }
        if (persist) await hid.SendAsync([0xaa, 0x0a, 0, 0, 25, 1, 3, 0, 0, 0xee]);
        return new { ok = true, message = persist ? "Đã lưu Custom vào JA11." : "Đã áp dụng Custom để nghe thử." };
    }

    private async Task<object> SetSettingAsync(JsonElement root)
    {
        var setting = root.GetProperty("value");
        if (setting.GetProperty("name").GetString() == "mic")
            await hid.SendAsync([0xaa, 0x0a, 0, 0, 18, 1, (byte)(setting.GetProperty("enabled").GetBoolean() ? 1 : 0), 0, 0xee]);
        return new { ok = true, message = "Đã gửi cài đặt tới JA11. Thiết bị có thể khởi động lại." };
    }

    private async Task<object> SetUacAsync(JsonElement root)
    {
        var value = root.GetProperty("value").GetString();
        var mode = value?.Contains("1.0") == true ? 0 : 1;
        await hid.SendAsync([0xaa, 0x0a, 0, 0, 32, 1, (byte)mode, 0, 0xee]);
        return new { ok = true, message = "Đã đổi USB Audio. JA11 sẽ ngắt rồi kết nối lại." };
    }

    private Task ReplyAsync(object value)
    {
        var json = JsonSerializer.Serialize(value);
        return view.CoreWebView2.ExecuteScriptAsync($"window.onHostMessage({json})");
    }

    protected override void OnFormClosed(FormClosedEventArgs e) { hid.Dispose(); base.OnFormClosed(e); }
}
