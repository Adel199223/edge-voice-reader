param(
  [string]$OutputDir,
  [string]$RepoRoot
)

$ErrorActionPreference = "Stop"

function Normalize-FilesystemPath {
  param(
    [Parameter(Mandatory = $true)][string]$PathValue
  )

  $prefix = "Microsoft.PowerShell.Core\FileSystem::"
  if ($PathValue.StartsWith($prefix)) {
    return $PathValue.Substring($prefix.Length)
  }

  return $PathValue
}

function Write-JsonFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)]$Payload
  )

  $dir = Split-Path -Path $Path -Parent
  New-Item -ItemType Directory -Path $dir -Force | Out-Null
  $Payload | ConvertTo-Json -Depth 8 | Set-Content -Path $Path -Encoding UTF8
}

function Write-ResultStatus {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [string]$FallbackStatus = "failed"
  )

  if (Test-Path -LiteralPath $Path) {
    try {
      $payload = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
      $status = if ($payload.status) { [string]$payload.status } else { $FallbackStatus }
      Write-Output "result_path=$Path"
      Write-Output "status=$status"
      return
    } catch {
      # fall through
    }
  }

  Write-Output "result_path=$Path"
  Write-Output "status=$FallbackStatus"
}

function Resolve-EdgePath {
  $candidates = @(
    "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "C:\Program Files\Microsoft\Edge\Application\msedge.exe"
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  return $null
}

$defaultRepoRoot = Join-Path $PSScriptRoot ".."
if (-not $RepoRoot) {
  $RepoRoot = $defaultRepoRoot
}

$repoRootResolved = (Resolve-Path -LiteralPath (Normalize-FilesystemPath -PathValue $RepoRoot)).ProviderPath
$stamp = Get-Date -Format "yyyyMMddTHHmmss"
if (-not $OutputDir) {
  $OutputDir = Join-Path $repoRootResolved "out\edge_voice_reader_smoke\$stamp"
}

$outputDirResolved = Normalize-FilesystemPath -PathValue $OutputDir
$extensionSource = $repoRootResolved
$nodeScript = Join-Path $PSScriptRoot "edge_voice_reader_smoke.mjs"
$resultPath = Join-Path $outputDirResolved "edge_voice_reader_smoke_windows.json"
$stageRoot = Join-Path $env:TEMP "edge-voice-reader-smoke\$stamp"
$stagedExtension = Join-Path $stageRoot "edge_voice_reader"
$userDataDir = Join-Path $stageRoot "user-data"
$debugPort = Get-Random -Minimum 9223 -Maximum 9323

New-Item -ItemType Directory -Path $outputDirResolved -Force | Out-Null

if (-not (Test-Path -LiteralPath $extensionSource)) {
  $payload = @{
    status = "unavailable"
    reason = "extension_source_missing"
    extension_source = $extensionSource
  }
  Write-JsonFile -Path $resultPath -Payload $payload
  Write-ResultStatus -Path $resultPath -FallbackStatus "unavailable"
  exit 0
}

$edgeExe = Resolve-EdgePath
if (-not $edgeExe) {
  $payload = @{
    status = "unavailable"
    reason = "edge_executable_missing"
  }
  Write-JsonFile -Path $resultPath -Payload $payload
  Write-ResultStatus -Path $resultPath -FallbackStatus "unavailable"
  exit 0
}

$nodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
  $payload = @{
    status = "unavailable"
    reason = "node_missing"
  }
  Write-JsonFile -Path $resultPath -Payload $payload
  Write-ResultStatus -Path $resultPath -FallbackStatus "unavailable"
  exit 0
}

New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
New-Item -ItemType Directory -Path $stagedExtension -Force | Out-Null
Get-ChildItem -LiteralPath $extensionSource -Force | Where-Object {
  $name = $_.Name
  if ($name -in @(".git", "docs", "tooling", "out")) {
    return $false
  }
  if ($name -like "CodexBackup_*") {
    return $false
  }
  return $true
} | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $stagedExtension $_.Name) -Recurse -Force
}
Push-Location $stageRoot

try {
  $scriptArgs = @(
    $nodeScript,
    "--output-dir", $outputDirResolved,
    "--result-path", $resultPath,
    "--extension-path", $stagedExtension,
    "--browser-exe", $edgeExe,
    "--user-data-dir", $userDataDir,
    "--debug-port", "$debugPort"
  )

  & node @scriptArgs
  Write-ResultStatus -Path $resultPath -FallbackStatus "failed"
} finally {
  Pop-Location
}

exit 0
