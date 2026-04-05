param(
  [string]$EdgeRepo = $PSScriptRoot,
  [string]$MultilingualRepo = 'C:\Users\FA507\local_tts_multilingual_recovered'
)

$ErrorActionPreference = 'Stop'

function Get-CodeFiles {
  param(
    [Parameter(Mandatory = $true)][string]$Root
  )

  if (-not (Test-Path -LiteralPath $Root)) {
    throw "Path not found: $Root"
  }

  $extensions = @('.js', '.ts', '.html', '.css', '.json', '.py')
  Get-ChildItem -LiteralPath $Root -Recurse -File -ErrorAction Stop |
    Where-Object {
      $extensions -contains $_.Extension.ToLowerInvariant() -or $_.Name -eq 'manifest.json'
    }
}

function Find-PatternMatches {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string[]]$Patterns
  )

  $matches = @()
  foreach ($file in Get-CodeFiles -Root $Root) {
    $content = Get-Content -LiteralPath $file.FullName -Raw -ErrorAction SilentlyContinue
    if ($null -eq $content) {
      continue
    }

    foreach ($pattern in $Patterns) {
      if ($content -match $pattern) {
        $matches += [pscustomobject]@{
          file = $file.FullName
          pattern = $pattern
        }
      }
    }
  }

  return $matches
}

$edgePatterns = @(
  'http://127\.0\.0\.1',
  'http://localhost',
  '/v1/health',
  '/health',
  '/v1/speak',
  'local_tts_multilingual',
  'multilingual TTS daemon'
)

$multilingualPatterns = @(
  'Edge Voice Reader',
  'chrome\.tts',
  'page_reader_content',
  'page_reader_core',
  'reader rail',
  'Microsoft Edge voices'
)

$edgeMatches = Find-PatternMatches -Root $EdgeRepo -Patterns $edgePatterns
$multilingualMatches = Find-PatternMatches -Root $MultilingualRepo -Patterns $multilingualPatterns

$result = [ordered]@{
  ok = ($edgeMatches.Count -eq 0 -and $multilingualMatches.Count -eq 0)
  edge_repo = $EdgeRepo
  multilingual_repo = $MultilingualRepo
  edge_matches = $edgeMatches
  multilingual_matches = $multilingualMatches
}

$json = [pscustomobject]$result | ConvertTo-Json -Depth 6
if (-not $result.ok) {
  Write-Output $json
  exit 1
}

Write-Output $json