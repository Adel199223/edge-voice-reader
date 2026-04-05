param(
  [string]$ProfileDir = 'C:\Users\FA507\AppData\Local\Microsoft\Edge\User Data\Profile 2',
  [string]$TemplateSecurePrefsPath = 'C:\Users\FA507\AppData\Local\Temp\edge-voice-reader-smoke\20260330T113437\user-data\Default\Secure Preferences',
  [string]$TemplateId = 'foieamckpnljmpicalmfibjnimnfcnni',
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

if (-not (Test-Path -LiteralPath $securePrefsPath)) {
  throw "Secure Preferences not found at $securePrefsPath"
}
if (-not (Test-Path -LiteralPath $TemplateSecurePrefsPath)) {
  throw "Template Secure Preferences not found at $TemplateSecurePrefsPath"
}
if (-not (Test-Path -LiteralPath $CanonicalEdgePath)) {
  throw "Canonical Edge repo not found at $CanonicalEdgePath"
}

$msedgeCount = @(Get-Process -Name msedge -ErrorAction SilentlyContinue).Count
if ($Apply -and $msedgeCount -gt 0) {
  throw "Microsoft Edge is still running ($msedgeCount processes). Close Edge first, then rerun with -Apply."
}

$securePrefs = Get-Content -Raw -LiteralPath $securePrefsPath | ConvertFrom-Json
$templatePrefs = Get-Content -Raw -LiteralPath $TemplateSecurePrefsPath | ConvertFrom-Json
$prefs = $null
if (Test-Path -LiteralPath $prefsPath) {
  $prefs = Get-Content -Raw -LiteralPath $prefsPath | ConvertFrom-Json
}

$templateEntry = $templatePrefs.extensions.settings.PSObject.Properties[$TemplateId]
if (-not $templateEntry) {
  throw "Template extension id not found: $TemplateId"
}

$existingIds = @()
foreach ($prop in $securePrefs.extensions.settings.PSObject.Properties) {
  $id = $prop.Name
  $path = [string]$prop.Value.path
  if (-not $path) {
    continue
  }
  if ($path -eq $CanonicalEdgePath -or $path -like '*edge-voice-reader-smoke*') {
    $existingIds += $id
  }
}

$plan = [ordered]@{
  profile_dir = $ProfileDir
  msedge_processes = $msedgeCount
  template_id = $TemplateId
  existing_edge_voice_reader_ids = @($existingIds | Select-Object -Unique)
  canonical_edge_path = $CanonicalEdgePath
}

if (-not $Apply) {
  [pscustomobject]$plan | ConvertTo-Json -Depth 6
  return
}

$timestamp = Get-Date -Format 'yyyyMMddTHHmmss'
$backupDir = Join-Path $ProfileDir ('CodexBackup\edge_voice_reader_profile_register_' + $timestamp)
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
Copy-Item -LiteralPath $securePrefsPath -Destination (Join-Path $backupDir 'Secure Preferences.bak') -Force
if (Test-Path -LiteralPath $prefsPath) {
  Copy-Item -LiteralPath $prefsPath -Destination (Join-Path $backupDir 'Preferences.bak') -Force
}

$changedSecure = $false
$changedPrefs = $false
$allRemoveIds = @($existingIds + $TemplateId | Select-Object -Unique)

foreach ($id in $allRemoveIds) {
  if ($securePrefs.extensions.settings.PSObject.Properties[$id]) {
    $null = $securePrefs.extensions.settings.PSObject.Properties.Remove($id)
    $changedSecure = $true
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

$templateJson = $templateEntry.Value | ConvertTo-Json -Depth 50
$newEntry = $templateJson | ConvertFrom-Json
$newEntry.path = $CanonicalEdgePath
$newEntry.last_update_time = [string]([DateTime]::UtcNow - [DateTime]'1601-01-01').Ticks
$newEntry.first_install_time = $newEntry.last_update_time
$newEntry.is_new_extension_install = $true
$newEntry.newAllowFileAccess = $true

$securePrefs.extensions.settings | Add-Member -NotePropertyName $TemplateId -NotePropertyValue $newEntry -Force
$changedSecure = $true

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

$resultPrefs = Get-Content -Raw -LiteralPath $securePrefsPath | ConvertFrom-Json
$registeredEntry = $resultPrefs.extensions.settings.PSObject.Properties[$TemplateId]
$result = [ordered]@{
  applied = $true
  backup_dir = $backupDir
  registered_id = $TemplateId
  registered_path = if ($registeredEntry) { [string]$registeredEntry.Value.path } else { '' }
  canonical_edge_registered = [bool]$registeredEntry
  canonical_edge_path = $CanonicalEdgePath
}

[pscustomobject]$result | ConvertTo-Json -Depth 6