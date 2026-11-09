$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$publishDir = Join-Path $projectRoot 'artifacts\publish'
$iscc = 'C:\Program Files (x86)\Inno Setup 6\ISCC.exe'
if (-not (Test-Path -LiteralPath $iscc)) { throw 'Inno Setup 6 is not installed.' }
Push-Location -LiteralPath $projectRoot
try {
    $resolvedRoot = [System.IO.Path]::GetFullPath($projectRoot).TrimEnd('\')
    $resolvedPublish = [System.IO.Path]::GetFullPath($publishDir)
    if (-not $resolvedPublish.StartsWith($resolvedRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Publish directory is outside the project.' }
    if (Test-Path -LiteralPath $publishDir) {
        & attrib.exe -h (Join-Path $publishDir 'ui') 2>$null
        Remove-Item -LiteralPath $publishDir -Recurse -Force
    }
    dotnet publish .\Ja11Control.csproj -c Release -r win-x64 --self-contained true -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -p:PublishTrimmed=false -o $publishDir
    if ($LASTEXITCODE -ne 0) { throw 'Publishing JA11 Control failed.' }
    $fontDir = Join-Path $publishDir 'ui\fonts'
    New-Item -ItemType Directory -Path $fontDir -Force | Out-Null
    Copy-Item -Path (Join-Path $projectRoot 'ui\fonts\*.ttf') -Destination $fontDir -Force
    & $iscc .\installer\Ja11Control.iss
    if ($LASTEXITCODE -ne 0) { throw 'Building installer failed.' }
    & attrib.exe +h (Join-Path $publishDir 'ui')
    Write-Host "Installer: $(Join-Path $projectRoot 'dist\Ja11Control-Setup-win-x64-v0.0.1.exe')"
} finally { Pop-Location }
