$ErrorActionPreference = "Stop"

$viewerDirectory = $PSScriptRoot
$repositoryDirectory = Split-Path -Parent $viewerDirectory
$cacheDirectory = Join-Path $viewerDirectory ".local-data"
$cacheFile = Join-Path $cacheDirectory "latest.js"
$temporaryFile = Join-Path $cacheDirectory "latest.js.tmp"
$repositoryFallback = Join-Path $repositoryDirectory "data\public\latest.json"
$dashboardFile = Join-Path $viewerDirectory "index.html"
$latestUrl = "https://raw.githubusercontent.com/ghsdydrks1239-wq/financial-os-market-data/main/data/public/latest.json"

function Write-DashboardData {
  param(
    [Parameter(Mandatory = $true)][string]$Json,
    [Parameter(Mandatory = $true)][string]$Source,
    [string]$Warning = ""
  )

  $parsed = $Json | ConvertFrom-Json
  if ($null -eq $parsed.referenceDate -or $null -eq $parsed.metrics) {
    throw "The downloaded file is not a valid MARKET DATA snapshot."
  }

  $meta = [ordered]@{
    loadedAt = [DateTime]::UtcNow.ToString("o")
    source = $Source
    warning = $Warning
  } | ConvertTo-Json -Compress

  $script = "window.MARKET_DATA = $Json;`r`nwindow.MARKET_LOCAL_META = $meta;`r`n"
  $utf8 = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($temporaryFile, $script, $utf8)
  Move-Item -Path $temporaryFile -Destination $cacheFile -Force
}

New-Item -ItemType Directory -Path $cacheDirectory -Force | Out-Null

try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  Write-Host "Downloading the latest MARKET DATA snapshot..."
  $response = Invoke-WebRequest -Uri $latestUrl -UseBasicParsing -TimeoutSec 30
  Write-DashboardData -Json $response.Content -Source "GitHub latest snapshot"
  Write-Host "Latest data downloaded."
}
catch {
  $downloadError = $_.Exception.Message
  if (Test-Path $repositoryFallback) {
    Write-Host "The latest download failed. Opening the snapshot included in this folder."
    $fallbackJson = [System.IO.File]::ReadAllText($repositoryFallback)
    Write-DashboardData -Json $fallbackJson -Source "Repository fallback snapshot" -Warning "Latest download failed: $downloadError"
  }
  elseif (Test-Path $cacheFile) {
    Write-Host "The latest download failed. Opening the last cached dashboard data."
  }
  else {
    Write-Error "No usable MARKET DATA snapshot is available. Connect to the internet and try again. $downloadError"
    exit 1
  }
}

if (-not (Test-Path $dashboardFile)) {
  Write-Error "Dashboard file not found: $dashboardFile"
  exit 1
}

Write-Host "Opening Financial OS Local Market Dashboard..."
Start-Process $dashboardFile
