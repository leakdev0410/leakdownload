; Inno Setup — leakdownload Windows installer
; Build:  powershell -ExecutionPolicy Bypass -File scripts\build-setup.ps1
; Manual: tools\InnoSetup\ISCC.exe /DMyAppVersion=1.0.0 installer\leakdownload.iss

#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif

#define MyAppName "leakdownload"
#define MyAppPublisher "leakdownload"
#define MyAppExeName "leakdownload.exe"
#define MyAppId "{{A7C4E2B1-8F3D-4A6E-9C21-5D8E0F1A2B3C}}"

; Paths relative to this .iss file (installer\)
#define ProjectRoot "..\"
#define BinDir "..\build\bin"
#define IconFile "..\build\windows\icon.ico"
#define AppIconPng "..\build\appicon.png"
#define OutDir "..\build\installer"

[Setup]
AppId={#MyAppId}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir={#OutDir}
OutputBaseFilename=leakdownload-setup-{#MyAppVersion}
SetupIconFile={#IconFile}
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
VersionInfoVersion={#MyAppVersion}.0
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription={#MyAppName} Setup
VersionInfoProductName={#MyAppName}
CloseApplications=yes
RestartApplications=no
DisableWelcomePage=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a Desktop shortcut"; GroupDescription: "Additional icons:"; Flags: checkedonce
Name: "startmenu"; Description: "Create Start Menu shortcuts"; GroupDescription: "Additional icons:"; Flags: checkedonce

[Files]
Source: "{#BinDir}\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#AppIconPng}"; DestDir: "{app}"; Flags: ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: startmenu
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"; Tasks: startmenu
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
