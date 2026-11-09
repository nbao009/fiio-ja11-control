# Build JA11 Control for Windows

## Requirements

- Windows 10/11 x64
- .NET 8 SDK
- Inno Setup 6 (`C:\Program Files (x86)\Inno Setup 6\ISCC.exe`)
- Microsoft Edge WebView2 Runtime on the target PC

## Build the app and installer

Open PowerShell in this project folder and run:

```powershell
.\build-release.ps1
```

The script publishes a self-contained Windows x64 app to `artifacts\publish` and creates `dist\Ja11Control-Setup-win-x64-v0.0.1.exe`. The app includes .NET, so the target PC does not need a separate .NET installation. If Inno Setup is installed elsewhere, change `$iscc` in `build-release.ps1`.

The installer installs into `C:\Program Files\Ja11Control`, adds a Start menu shortcut, and offers an optional desktop shortcut. Installing or updating does not remove user settings and presets.

## User data

- Settings and WebView2 sign-in profile: `%LOCALAPPDATA%\Ja11Control`
- Local EQ presets: `%USERPROFILE%\Documents\Ja11StudioPreset` (one JSON per preset)

Run the app from the published folder if you want to test it before installing. Keep the `ui` folder beside `Ja11Control.exe`.
