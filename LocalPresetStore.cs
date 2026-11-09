using System.Text.Json;
using System.Text.Json.Nodes;

namespace Ja11Control;

internal sealed class LocalPresetStore
{
    private readonly string folder = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Ja11StudioPreset");
    private static JsonElement Validate(JsonElement value)
    {
        if (value.ValueKind != JsonValueKind.Array || value.GetArrayLength() > 500 ||
            value.GetRawText().Length > 2_000_000) throw new ArgumentException("Danh sách preset không hợp lệ.");
        foreach (var preset in value.EnumerateArray())
        {
            if (preset.ValueKind != JsonValueKind.Object ||
                !preset.TryGetProperty("name", out var name) || name.ValueKind != JsonValueKind.String ||
                string.IsNullOrWhiteSpace(name.GetString()) || name.GetString()!.Length > 120 ||
                !preset.TryGetProperty("masterGain", out var gain) || gain.ValueKind != JsonValueKind.Number ||
                !gain.TryGetDouble(out var master) || !double.IsFinite(master) || master is < -12 or > 12 ||
                !preset.TryGetProperty("bands", out var bands) || bands.ValueKind != JsonValueKind.Array || bands.GetArrayLength() != 5)
                throw new ArgumentException("Preset không hợp lệ.");
            foreach (var band in bands.EnumerateArray())
            {
                if (band.ValueKind != JsonValueKind.Object ||
                    !band.TryGetProperty("type", out var type) || type.ValueKind != JsonValueKind.String ||
                    type.GetString() is not ("PK" or "LSC" or "HSC") ||
                    !Number(band, "freq", 20, 20000) || !Number(band, "gain", -12, 12) ||
                    !Number(band, "q", .1, 10)) throw new ArgumentException("Band EQ không hợp lệ.");
            }
        }
        return value;
    }
    private static bool Number(JsonElement obj, string key, double min, double max) =>
        obj.TryGetProperty(key, out var val) && val.ValueKind == JsonValueKind.Number &&
        val.TryGetDouble(out var n) && double.IsFinite(n) && n >= min && n <= max;

    private static string SafeName(string? name)
    {
        var cleaned = new string((name ?? "").Trim().Select(c =>
            Path.GetInvalidFileNameChars().Contains(c) || char.IsControl(c) ? '_' : c).ToArray());
        cleaned = cleaned.Trim(' ', '.');
        if (cleaned.Length > 80) cleaned = cleaned[..80].TrimEnd(' ', '.');
        if (cleaned.Length == 0) cleaned = "Preset";
        if (System.Text.RegularExpressions.Regex.IsMatch(cleaned, @"^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$", System.Text.RegularExpressions.RegexOptions.IgnoreCase))
            cleaned += "_";
        return cleaned;
    }
    private IEnumerable<string> PresetFiles() => Directory.EnumerateFiles(folder, "*.json")
        .Where(path => !Path.GetFileName(path).Equals("presets.json", StringComparison.OrdinalIgnoreCase));
    private static JsonObject Named(JsonElement preset, string name)
    {
        var node = JsonNode.Parse(preset.GetRawText())!.AsObject();
        node["name"] = name;
        return node;
    }
    private JsonArray ReadAll()
    {
        var result = new JsonArray();
        foreach (var file in PresetFiles().OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase))
        {
            try
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(file));
                var item = Named(doc.RootElement, Path.GetFileNameWithoutExtension(file));
                using var validation = JsonDocument.Parse("[" + item.ToJsonString() + "]");
                Validate(validation.RootElement);
                result.Add(item);
            }
            catch (JsonException) { /* Leave unrelated or damaged JSON untouched. */ }
            catch (ArgumentException) { /* Leave unrelated or damaged JSON untouched. */ }
            catch (InvalidOperationException) { /* Ignore non-preset JSON. */ }
        }
        return result;
    }
    public object OpenFolder()
    {
        Directory.CreateDirectory(folder);
        System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(folder) { UseShellExecute = true });
        return new { ok = true };
    }
    public object Load()
    {
        Directory.CreateDirectory(folder);
        return new { action = "local-presets-loaded", presets = ReadAll() };
    }
    public object Save(JsonElement presets)
    {
        WriteAll(Validate(presets), true);
        return new { action = "local-presets-saved", ok = true, presets = ReadAll() };
    }
    private void WriteAll(JsonElement presets, bool removeMissing)
    {
        Directory.CreateDirectory(folder);
        var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var existing = PresetFiles().ToArray();
        foreach (var preset in presets.EnumerateArray())
        {
            var baseName = SafeName(preset.GetProperty("name").GetString());
            var name = baseName;
            for (int suffix = 2; !used.Add(name); suffix++) name = $"{baseName} ({suffix})";
            var path = Path.Combine(folder, name + ".json");
            var temp = path + ".tmp";
            File.WriteAllText(temp, Named(preset, name).ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
            File.Move(temp, path, true);
        }
        if (!removeMissing) return;
        foreach (var file in existing)
        {
            if (!used.Contains(Path.GetFileNameWithoutExtension(file)))
            {
                // Only remove files that were valid managed presets.
                try
                {
                    using var doc = JsonDocument.Parse(File.ReadAllText(file));
                    using var list = JsonDocument.Parse("[" + doc.RootElement.GetRawText() + "]");
                    Validate(list.RootElement);
                    File.Delete(file);
                }
                catch (JsonException) { }
                catch (ArgumentException) { }
            }
        }
    }
}
