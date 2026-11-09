using System.Text.Json;
using System.Text.RegularExpressions;

namespace Ja11Control;

internal sealed record StudioSettings
{
    public string Theme { get; init; } = "dark";
    public string Language { get; init; } = "vi";
    public string Accent { get; init; } = "#ff526b";
    public string Curve { get; init; } = "#ff526b";
    public string Background { get; init; } = "";
    public string Wallpaper { get; init; } = "";
    public int Dim { get; init; } = 65;
    public int Blur { get; init; }
    public int X { get; init; } = 50;
    public int Y { get; init; } = 50;
    public int Zoom { get; init; } = 100;
    public string Developer { get; init; } = "Nbao";
}

internal sealed class SettingsStore
{
    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private readonly string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Ja11Control");
    public StudioSettings Current { get; private set; } = new();

    public SettingsStore()
    {
        var path = Path.Combine(folder, "settings.json");
        try
        {
            if (File.Exists(path))
                Current = Validate(JsonSerializer.Deserialize<StudioSettings>(File.ReadAllText(path), Options) ?? new());
        }
        catch (Exception ex) when (ex is IOException or JsonException or ArgumentException or FormatException)
        {
            // Keep the original file for recovery; a later explicit edit writes valid settings.
        }
    }

    private static StudioSettings Validate(StudioSettings value)
    {
        static bool Color(string color) => Regex.IsMatch(color, "^#[0-9a-fA-F]{6}$");
        if (value.Theme is not ("dark" or "light") || value.Language is not ("vi" or "en") ||
            !Color(value.Accent) || !Color(value.Curve) || value.Background != "" && !Color(value.Background) ||
            value.X is < 0 or > 100 || value.Y is < 0 or > 100 || value.Dim is < 0 or > 100 || value.Blur is < 0 or > 30 || value.Zoom is < 100 or > 200 ||
            value.Developer.Length > 80) throw new ArgumentException("Cài đặt không hợp lệ.");
        if (value.Wallpaper != "")
        {
            if (!value.Wallpaper.StartsWith("data:image/webp;base64,") || value.Wallpaper.Length > 4_000_000)
                throw new ArgumentException("Ảnh nền không hợp lệ.");
            Convert.FromBase64String(value.Wallpaper[23..]);
        }
        return value;
    }

    public object Read() => new { action = "studio-settings", settings = Current, settingsPath = Path.Combine(folder, "settings.json") };

    public object Save(JsonElement json)
    {
        var value = Validate(json.Deserialize<StudioSettings>(Options) ?? throw new ArgumentException("Missing settings"));
        Directory.CreateDirectory(folder);
        var path = Path.Combine(folder, "settings.json");
        var temp = Path.Combine(folder, "settings.tmp");
        File.WriteAllText(temp, JsonSerializer.Serialize(value, Options));
        File.Move(temp, path, true);
        Current = value;
        return new { action = "settings-saved", ok = true };
    }
}
