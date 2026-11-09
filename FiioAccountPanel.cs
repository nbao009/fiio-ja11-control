using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System.Text.Json;
using System.Drawing.Text;

namespace Ja11Control;

internal sealed class FiioAccountPanel : UserControl
{
    private const string Portal = "https://fiiocontrol.fiio.com";
    private static readonly PrivateFontCollection Fonts = new();
    static FiioAccountPanel()
    {
        var file = Path.Combine(AppContext.BaseDirectory, "ui", "fonts", "SpaceMono-Regular.ttf");
        if (File.Exists(file)) Fonts.AddFontFile(file);
    }
    private readonly WebView2 browser = new() { Dock = DockStyle.Fill };
    private readonly Action<object> publish;
    private readonly Func<JsonElement, Task<object>> applyPreset;
    private readonly Func<Task<object>> readDevice;
    private readonly bool lightTheme;
    private readonly string accent;
    private bool bridgeReady;
    private bool showLogin;
    private bool officialHandpick;
    private bool accountManagement;
    private ulong navigation;

    public FiioAccountPanel(Action<object> publish, Func<JsonElement, Task<object>> applyPreset, Func<Task<object>> readDevice, Action closePanel, bool lightTheme, string accent, string language)
    {
        this.publish = publish;
        this.applyPreset = applyPreset;
        this.readDevice = readDevice;
        this.lightTheme = lightTheme;
        this.accent = accent;
        Dock = DockStyle.None;
        BorderStyle = BorderStyle.None;
        BackColor = Color.FromArgb(12, 16, 20);
        ParentChanged += (_, _) => FitToParent();
        var back = new Button { Text = "‹  Back", Size = new Size(116, 32), FlatStyle = FlatStyle.Flat,
            Font = Fonts.Families.Length > 0 ? new Font(Fonts.Families[0], 9, FontStyle.Bold) : new Font("Segoe UI", 9, FontStyle.Bold), Padding = new Padding(8, 2, 8, 2) };
        back.FlatAppearance.BorderSize = 0;
        back.Click += (_, _) => closePanel();
        back.Resize += (_, _) => SetRoundedRegion(back, 8);
        Resize += (_, _) => SetRoundedRegion(this, 12);
        var bar = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 48, Padding = new Padding(7) };
        var background = lightTheme ? Color.FromArgb(229, 233, 229) : Color.FromArgb(12, 16, 20);
        var foreground = lightTheme ? Color.FromArgb(32, 40, 32) : Color.FromArgb(238, 241, 242);
        BackColor = background;
        bar.BackColor = background;
        back.BackColor = lightTheme ? Color.FromArgb(232, 236, 231) : Color.FromArgb(43, 49, 55);
        back.ForeColor = foreground;
        bar.Controls.Add(back);
        SetRoundedRegion(back, 8);
        Controls.Add(browser);
        Controls.Add(bar);
    }

    private static System.Drawing.Drawing2D.GraphicsPath RoundedPath(RectangleF rect, float radius)
    {
        var path = new System.Drawing.Drawing2D.GraphicsPath();
        float diameter = radius * 2;
        path.AddArc(rect.Left, rect.Top, diameter, diameter, 180, 90);
        path.AddArc(rect.Right - diameter, rect.Top, diameter, diameter, 270, 90);
        path.AddArc(rect.Right - diameter, rect.Bottom - diameter, diameter, diameter, 0, 90);
        path.AddArc(rect.Left, rect.Bottom - diameter, diameter, diameter, 90, 90);
        path.CloseFigure();
        return path;
    }

    private static void SetRoundedRegion(Control control, int radius)
    {
        if (control.Width < radius * 2 || control.Height < radius * 2) return;
        using var path = RoundedPath(new RectangleF(0, 0, control.Width - 1, control.Height - 1), radius);
        var previous = control.Region;
        control.Region = new Region(path);
        previous?.Dispose();
    }

    public void FitToParent()
    {
        if (Parent is not { } host) return;
        int width = Math.Min(1080, (int)(host.ClientSize.Width * .86));
        int height = Math.Min(740, (int)(host.ClientSize.Height * .84));
        Bounds = new Rectangle((host.ClientSize.Width - width) / 2,
            (host.ClientSize.Height - height) / 2, width, height);
        Invalidate();
    }

    private static bool IsPortal(string url) =>
        Uri.TryCreate(url, UriKind.Absolute, out var uri) && uri.GetLeftPart(UriPartial.Authority) == Portal;

    public async Task StartAsync(CoreWebView2Environment environment)
    {
        try
        {
            await browser.EnsureCoreWebView2Async(environment);
            if (IsDisposed) return;
            var core = browser.CoreWebView2;
            core.Settings.AreDefaultContextMenusEnabled = false;
            core.NavigationStarting += (_, nav) =>
            {
                nav.Cancel = !IsPortal(nav.Uri);
                if (!nav.Cancel) { bridgeReady = false; navigation = nav.NavigationId; }
            };
            core.NavigationCompleted += async (_, nav) =>
            {
                if (IsDisposed || nav.NavigationId != navigation) return;
                if (!nav.IsSuccess || !IsPortal(core.Source)) { ReportError(); return; }
                try
                {
                    using var stream = typeof(FiioAccountPanel).Assembly.GetManifestResourceStream("Ja11Control.account-bridge.js")!;
                    using var reader = new StreamReader(stream);
                    await core.ExecuteScriptAsync(reader.ReadToEnd());
                    if (officialHandpick || accountManagement) await ScopePopupAsync(core);
                    if (officialHandpick || accountManagement) await AttachDeviceAsync(core);
                    if (officialHandpick && IsPortal(core.Source)) await EnsureHandpickAsync(core);
                }
                catch (Exception) { if (!IsDisposed) ReportError(); }
            };
            core.WebMessageReceived += Receive;
            core.NewWindowRequested += (_, args) => args.Handled = true;
            core.Navigate(Portal + "/equalizer/personal");
        }
        catch (Exception) { if (!IsDisposed) ReportError(); }
    }

    private void ReportError() => Report("error", "Chưa kết nối được với FiiO. Kiểm tra mạng rồi thử đồng bộ lại.");

    private void Report(string state, string message)
    {
        publish(new { action = "fiio-status", state, message });
    }

    private async void Receive(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!IsPortal(e.Source) || IsDisposed) return;
        using var doc = JsonDocument.Parse(e.WebMessageAsJson);
        var root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("studioAccount", out var tag)
            || tag.ValueKind != JsonValueKind.String) return;
        switch (tag.GetString())
        {
            case "deviceSave":
                if (!root.TryGetProperty("snapshot", out var snapshot)) return;
                var applied = await applyPreset(snapshot.Clone());
                if (!IsDisposed && browser.CoreWebView2 is { } popupCore)
                    await popupCore.ExecuteScriptAsync($"window.ja11Account?.resolveDevice({JsonSerializer.Serialize(new { request = root.GetProperty("request").GetInt32(), outcome = applied })})");
                break;
            case "handpick":
            case "handpickSaved":
            case "customSaved":
                var data = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(root.GetRawText())!;
                data["action"] = tag.Clone();
                publish(data);
                break;
            case "loginCaptcha":
                publish(new { action = "fiio-login-result", ok = root.TryGetProperty("captcha", out _),
                    captcha = root.TryGetProperty("captcha", out var captcha) ? captcha.GetString() : null,
                    message = root.TryGetProperty("error", out var captchaError) ? captchaError.GetString() : null });
                break;
            case "loginError":
                publish(new { action = "fiio-login-result", ok = false, loginFailed = true,
                    kind = root.TryGetProperty("kind", out var kind) ? kind.GetString() : "credentials",
                    message = root.GetProperty("message").GetString() });
                break;
            case "signedOut":
                bridgeReady = true;
                Report("signedOut", "Đăng nhập FiiO để xem thư viện EQ.");
                if (showLogin) await RunAsync("login");
                break;
            case "syncing":
                bridgeReady = true;
                Report("syncing", "Đang đồng bộ EQ từ FiiO…");
                break;
            case "library":
                if (!root.TryGetProperty("presets", out var rows) || rows.ValueKind != JsonValueKind.Array) return;
                bridgeReady = true;
                publish(new { action = "fiio-presets", name = root.GetProperty("name").GetString(), presets = rows.Clone() });
                if (showLogin) { showLogin = false; Hide(); }
                break;
            case "error":
                bridgeReady = false;
                Report("error", "FiiO chưa trả được thư viện EQ. Hãy thử đồng bộ lại.");
                break;
        }
    }

    public void OpenLogin()
    {
        showLogin = true;
        FitToParent();
        Show();
        BringToFront();
        if (bridgeReady) _ = RunAsync("login");
        else if (browser.CoreWebView2 != null) browser.CoreWebView2.Navigate(Portal + "/equalizer/personal");
    }

    public async Task<object> PrepareLoginAsync(bool refresh)
    {
        Show();
        SendToBack();
        for (int i = 0; i < 50 && !IsDisposed && !bridgeReady; i++) await Task.Delay(200);
        if (IsDisposed || !bridgeReady || browser.CoreWebView2 is not { } core || !IsPortal(core.Source))
            return new { action = "fiio-login-result", ok = false, message = "Chưa tải được FiiO." };
        try
        {
            await core.ExecuteScriptAsync(refresh ? "void window.ja11Account?.getLoginCaptcha(true)" : "void window.ja11Account?.getLoginCaptcha()");
            return new { ok = true };
        }
        catch { return new { action = "fiio-login-result", ok = false, message = "Không gọi được FiiO." }; }
    }

    public async Task<object> SubmitLoginAsync(string username, string password, string captcha)
    {
        if (browser.CoreWebView2 is not { } core || !IsPortal(core.Source))
            return new { action = "fiio-login-result", ok = false, message = "Chưa kết nối được với FiiO." };
        try
        {
            string fields = JsonSerializer.Serialize(new { username, password, captcha });
            var result = await core.ExecuteScriptAsync($"window.ja11Account?.submitLogin({fields})");
            using var doc = JsonDocument.Parse(result);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) throw new Exception();
            return new { action = "fiio-login-result", ok = doc.RootElement.GetProperty("ok").GetBoolean(),
                message = doc.RootElement.GetProperty("message").GetString(),
                captcha = doc.RootElement.TryGetProperty("captcha", out var image) ? image.GetString() : null };
        }
        catch { return new { action = "fiio-login-result", ok = false, message = "FiiO chưa nhận được đăng nhập." }; }
    }

    public void RefreshLibrary()
    {
        if (bridgeReady) _ = RunAsync("refresh");
        else if (browser.CoreWebView2 != null) browser.CoreWebView2.Navigate(Portal + "/equalizer/personal");
    }

    public async Task<bool> TryHandpickAsync(string action, JsonElement value)
    {
        // Startup sync and Handpick share one portal. Give it time to finish loading.
        for (int i = 0; i < 50 && !IsDisposed && !bridgeReady; i++) await Task.Delay(200);
        if (IsDisposed || !bridgeReady || browser.CoreWebView2 is not { } core || !IsPortal(core.Source)) return false;
        var method = action == "handpick-list" ? "handpick" : "saveHandpick";
        string args = JsonSerializer.Serialize(value);
        try
        {
            return await core.ExecuteScriptAsync($"(() => {{ if (!window.ja11Account?.{method}) return false; window.ja11Account.{method}({args}); return true; }})()") == "true";
        }
        catch (Exception) { return false; }
    }

    public async Task<bool> TrySaveCustomAsync(JsonElement value)
    {
        for (int i = 0; i < 50 && !IsDisposed && !bridgeReady; i++) await Task.Delay(200);
        if (IsDisposed || !bridgeReady || browser.CoreWebView2 is not { } core || !IsPortal(core.Source)) return false;
        try
        {
            string args = JsonSerializer.Serialize(value);
            return await core.ExecuteScriptAsync($"(() => {{ if (!window.ja11Account?.saveCustom) return false; window.ja11Account.saveCustom({args}); return true; }})()") == "true";
        }
        catch { return false; }
    }

    public void OpenAccountLibrary()
    {
        showLogin = false;
        officialHandpick = false;
        accountManagement = true;
        FitToParent();
        Show();
        BringToFront();
        if (browser.CoreWebView2 is { } core) core.Navigate(Portal + "/equalizer/personal");
    }

    public void OpenOfficialHandpick()
    {
        showLogin = false;
        accountManagement = false;
        officialHandpick = true;
        FitToParent();
        Show();
        BringToFront();
        if (browser.CoreWebView2 is { } core)
            _ = NavigateHandpickAsync(core);
    }

    private async Task ScopePopupAsync(CoreWebView2 core)
    {
        string background = lightTheme ? "#e5e9e5" : "#0c1014";
        string foreground = lightTheme ? "#202820" : "#eef1f2";
        string surface = lightTheme ? "#ffffff" : "#22282e";
        string border = lightTheme ? "#cdd4cc" : "#353e46";
        string css = $"html{{color-scheme:{(lightTheme ? "light" : "dark")};--el-color-primary:{accent};--el-bg-color:{background};--el-bg-color-overlay:{surface};--el-fill-color-blank:{surface};--el-text-color-primary:{foreground};--el-text-color-regular:{foreground};--el-border-color:{border}}}body,.main-app,.main-app .el-container,.main-app .el-main{{background:{background}!important;color:{foreground}!important}}.main-app .el-header,.main-app .el-menu,.main-app .el-aside{{display:none!important}}.main-app .el-main{{padding:12px!important;width:100%!important;max-width:none!important}}.main-app .el-container{{min-width:0!important}}";
        string script = $"(() => {{ let style=document.getElementById('ja11-popup-scope'); if(!style){{style=document.createElement('style');style.id='ja11-popup-scope';document.head.append(style)}} style.textContent={JsonSerializer.Serialize(css)}; }})()";
        await core.ExecuteScriptAsync(script);
    }

    private async Task NavigateHandpickAsync(CoreWebView2 core)
    {
        try
        {
            if (!IsPortal(core.Source)) { core.Navigate(Portal + "/equalizer/personal"); return; }
            await ScopePopupAsync(core);
            await AttachDeviceAsync(core);
            await EnsureHandpickAsync(core);
        }
        catch (Exception) { if (!IsDisposed) ReportError(); }
    }

    private async Task AttachDeviceAsync(CoreWebView2 core)
    {
        try
        {
            var state = await readDevice();
            for (int attempt = 0; attempt < 30 && !IsDisposed && IsPortal(core.Source); attempt++)
            {
                var attached = await core.ExecuteScriptAsync($"window.ja11Account?.attachDevice({JsonSerializer.Serialize(state)})");
                if (attached == "true") return;
                await Task.Delay(100);
            }
            publish(new { action = "portal-device", ok = false, message = "Popup FiiO chưa nhận kết nối JA11. Hãy mở lại popup." });
        }
        catch (Exception ex) { publish(new { action = "portal-device", ok = false, message = ex.Message }); }
    }

    private async Task EnsureHandpickAsync(CoreWebView2 core)
    {
        for (int attempt = 0; attempt < 40 && !IsDisposed && officialHandpick && IsPortal(core.Source); attempt++)
        {
            var result = await core.ExecuteScriptAsync("(() => { const router = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$router; if (!router) return false; if (!location.pathname.includes('/equalizer/hand-picked')) router.replace('/equalizer/hand-picked'); return true; })()");
            if (result == "true")
            {
                await Task.Delay(150);
                if (await core.ExecuteScriptAsync("location.pathname.includes('/equalizer/hand-picked')") == "true") return;
            }
            await Task.Delay(100);
        }
    }

    public void SignOut() { if (bridgeReady) _ = RunAsync("logout"); }

    private async Task RunAsync(string command)
    {
        try
        {
            if (browser.CoreWebView2 is { } core && IsPortal(core.Source))
                await core.ExecuteScriptAsync($"window.ja11Account?.{command}()");
        }
        catch (Exception) { if (!IsDisposed) ReportError(); }
    }
}
