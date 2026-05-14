param(
    [string]$PythonPath,

    [string]$ScriptPath,

    [string]$WorkDir,

    [string]$LogPath
)

$missing = @()
if (-not $PythonPath) { $missing += 'PythonPath' }
if (-not $ScriptPath) { $missing += 'ScriptPath' }
if (-not $WorkDir) { $missing += 'WorkDir' }
if (-not $LogPath) { $missing += 'LogPath' }
if ($missing.Count -gt 0) {
    Write-Error ('Missing required parameter(s): ' + ($missing -join ', '))
    exit 1
}

$logDir = Split-Path -Parent $LogPath
if ($logDir -and -not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}

$errorLogPath = [System.IO.Path]::ChangeExtension($LogPath, '.err.log')
$env:DOCSENSE_OPEN_BROWSER = '0'

Start-Process `
    -FilePath $PythonPath `
    -ArgumentList @($ScriptPath) `
    -WorkingDirectory $WorkDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $LogPath `
    -RedirectStandardError $errorLogPath
