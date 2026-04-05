param(
  [string]$ProfileDir = 'C:\Users\FA507\AppData\Local\Microsoft\Edge\User Data\Profile 2',
  [string]$DaemonId = 'dgichiillbkdjhgbaibgiegenmfacaol',
  [string]$DaemonPath = 'C:\Users\FA507\local_tts_connector_unpacked',
  [string]$CanonicalEdgePath = 'C:\Users\FA507\edge_voice_reader',
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'

function Write-Utf8NoBom {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Content
  )
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

$securePrefsPath = Join-Path $ProfileDir 'Secure Preferences'
$prefsPath = Join-Path $ProfileDir 'Preferences'
$daemonLocalStateDir = Join-Path $ProfileDir ('Local Extension Settings\' + $DaemonId)

if (-not (Test-Path -LiteralPath $securePrefsPath)) {
  throw "Secure Preferences not found at $securePrefsPath"
}

$msedgeCount = @(Get-Process -Name msedge -ErrorAction SilentlyContinue).Count
if ($Apply -and $msedgeCount -gt 0) {
  throw "Microsoft Edge is still running ($msedgeCount processes). Close Edge first, then rerun with -Apply."
}

$securePrefs = Get-Content -Raw -LiteralPath $securePrefsPath | ConvertFrom-Json
$prefs = $null
if (Test-Path -LiteralPath $prefsPath) {
  $prefs = Get-Content -Raw -LiteralPath $prefsPath | ConvertFrom-Json
}

$settings = $securePrefs.extensions.settings
$removableIds = @()
$canonicalEdgeIds = @()

foreach ($prop in $settings.PSObject.Properties) {
  $id = $prop.Name
  $value = $prop.Value
  $path = [string]$value.path
  if (-not $path) {
    continue
  }
  if ($id -eq $DaemonId -or $path -eq $DaemonPath) {
    $removableIds += $id
    continue
  }
  if ($path -like '*edge-voice-reader-smoke*') {
    $removableIds += $id
    continue
  }
  if ($path -eq $CanonicalEdgePath) {
    $canonicalEdgeIds += $id
  }
}

$plan = [ordered]@{
  profile_dir = $ProfileDir
  msedge_processes = $msedgeCount
  removable_ids = @($removableIds | Select-Object -Unique)
  canonical_edge_ids = @($canonicalEdgeIds | Select-Object -Unique)
  daemon_local_state_exists = Test-Path -LiteralPath $daemonLocalStateDir
  canonical_edge_path = $CanonicalEdgePath
}

if (-not $Apply) {
  [pscustomobject]$plan | ConvertTo-Json -Depth 6
  return
}

$timestamp = Get-Date -Format 'yyyyMMddTHHmmss'
$backupDir = Join-Path $ProfileDir ('CodexBackup\edge_voice_reader_profile_isolation_' + $timestamp)
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
Copy-Item -LiteralPath $securePrefsPath -Destination (Join-Path $backupDir 'Secure Preferences.bak') -Force
if (Test-Path -LiteralPath $prefsPath) {
  Copy-Item -LiteralPath $prefsPath -Destination (Join-Path $backupDir 'Preferences.bak') -Force
}

$changedSecure = $false
$changedPrefs = $false
$removedLocalState = $false
$removedIds = @()

foreach ($id in ($removableIds | Select-Object -Unique)) {
  if ($securePrefs.extensions.settings.PSObject.Properties[$id]) {
    $null = $securePrefs.extensions.settings.PSObject.Properties.Remove($id)
    $changedSecure = $true
    $removedIds += $id
  }
  if ($securePrefs.protection -and $securePrefs.protection.macs -and $securePrefs.protection.macs.extensions -and $securePrefs.protection.macs.extensions.settings -and $securePrefs.protection.macs.extensions.settings.PSObject.Properties[$id]) {
    $null = $securePrefs.protection.macs.extensions.settings.PSObject.Properties.Remove($id)
    $changedSecure = $true
  }
  if ($prefs -and $prefs.extensions -and $prefs.extensions.settings -and $prefs.extensions.settings.PSObject.Properties[$id]) {
    $null = $prefs.extensions.settings.PSObject.Properties.Remove($id)
    $changedPrefs = $true
  }
}

if ($securePrefs.protection -and $securePrefs.protection.PSObject.Properties['super_mac']) {
  $null = $securePrefs.protection.PSObject.Properties.Remove('super_mac')
  $changedSecure = $true
}

if ($changedSecure) {
  Write-Utf8NoBom -Path $securePrefsPath -Content ($securePrefs | ConvertTo-Json -Depth 100)
}
if ($changedPrefs) {
  Write-Utf8NoBom -Path $prefsPath -Content ($prefs | ConvertTo-Json -Depth 100)
}
if (Test-Path -LiteralPath $daemonLocalStateDir) {
  Remove-Item -LiteralPath $daemonLocalStateDir -Recurse -Force
  $removedLocalState = $true
}

$result = [ordered]@{
  applied = $true
  backup_dir = $backupDir
  removed_ids = @($removedIds | Select-Object -Unique)
  removed_local_extension_state = $removedLocalState
  canonical_edge_registered = [bool]((Get-Content -Raw -LiteralPath $securePrefsPath | ConvertFrom-Json).extensions.settings.PSObject.Properties | Where-Object { [string]$_.Value.path -eq $CanonicalEdgePath })
  canonical_edge_path = $CanonicalEdgePath
}

[pscustomobject]$result | ConvertTo-Json -Depth 6