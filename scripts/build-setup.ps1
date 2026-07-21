# Build leakdownload Windows app + Inno Setup installer
# Usage:
#   powershell -ExecutionPolicy Bypass -File scripts\build-setup.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\build-setup.ps1 -SkipAppBuild -Version 1.0.1

param(
  [switch]$SkipAppBuild,
  [string]$Version = "1.1.3"
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

function Write-Step([string]$msg) {
  Write-Host ""
  Write-Host "==> $msg" -ForegroundColor Cyan
}

$Iscc = Join-Path $Root "tools\InnoSetup\ISCC.exe"
if (-not (Test-Path $Iscc)) {
  $candidates = @(
    "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
    "${env:ProgramFiles(x86)}\Inno Setup 7\ISCC.exe",
    "$env:ProgramFiles\Inno Setup 7\ISCC.exe"
  )
  foreach ($c in $candidates) {
    if (Test-Path $c) { $Iscc = $c; break }
  }
}
if (-not (Test-Path $Iscc)) {
  throw "ISCC.exe (Inno Setup) not found. Install into tools\InnoSetup or Program Files."
}

$Exe = Join-Path $Root "build\bin\leakdownload.exe"
if (-not $SkipAppBuild) {
  Write-Step "Building Wails app (windows/amd64)..."
  $gopath = & go env GOPATH
  $env:PATH = "$gopath\bin;$env:PATH"
  if (-not (Get-Command wails -ErrorAction SilentlyContinue)) {
    throw "wails CLI not in PATH. Run: go install github.com/wailsapp/wails/v2/cmd/wails@latest"
  }
  & wails build -platform windows/amd64
  if ($LASTEXITCODE -ne 0) { throw "wails build failed: $LASTEXITCODE" }
}

if (-not (Test-Path $Exe)) {
  throw "Missing $Exe - build the app first, or omit -SkipAppBuild"
}

$Iss = Join-Path $Root "installer\leakdownload.iss"
if (-not (Test-Path $Iss)) { throw "Missing $Iss" }

$OutDir = Join-Path $Root "build\installer"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Step "Compiling installer with Inno Setup (v$Version)..."
& $Iscc "/DMyAppVersion=$Version" $Iss
if ($LASTEXITCODE -ne 0) { throw "ISCC failed: $LASTEXITCODE" }

$Setup = Get-ChildItem $OutDir -Filter "leakdownload-setup-*.exe" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if (-not $Setup) { throw "No setup file found in $OutDir" }

Write-Host ""
Write-Host "OK - Installer ready:" -ForegroundColor Green
Write-Host "  $($Setup.FullName)"
Write-Host ("  Size: {0:N2} MB" -f ($Setup.Length / 1MB))
Write-Host ""
Write-Host "Run the setup to install (Start Menu / Desktop shortcut)."
