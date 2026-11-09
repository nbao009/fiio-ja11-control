#define AppName "JA11 Control"
#define AppVersion "0.0.1"
#define AppExe "Ja11Control.exe"

[Setup]
AppId={{A3E384D1-8396-47CE-9D8F-CA0793E1947A}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName}
UninstallDisplayName={#AppName}
VersionInfoVersion=0.0.1.0
AppPublisher=nbao
DefaultDirName={autopf}\Ja11Control
DefaultGroupName={#AppName}
OutputDir=..\dist
OutputBaseFilename=Ja11Control-Setup-win-x64-v0.0.1
SetupIconFile=..\ja11-control-white-transparent.ico
WizardImageFile=assets\wizard-large.bmp
WizardSmallImageFile=assets\wizard-small.bmp
UninstallDisplayIcon={app}\{#AppExe}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes

[Tasks]
Name: desktopicon; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"; Flags: unchecked

[Dirs]
Name: "{app}\ui"; Attribs: hidden

[Files]
Source: "..\artifacts\publish\*"; DestDir: "{app}"; Excludes: "*.pdb,*.xml"; Flags: ignoreversion recursesubdirs createallsubdirs

[InstallDelete]
Type: files; Name: "{app}\ui\index.html"
Type: files; Name: "{app}\ui\preview-v2.html"
Type: files; Name: "{app}\ui\ja11-control-icon.png"

[Icons]
Name: "{group}\JA11 Control"; Filename: "{app}\{#AppExe}"
Name: "{autodesktop}\JA11 Control"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "Launch JA11 Control"; Flags: nowait postinstall skipifsilent
