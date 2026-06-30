param(
    [int]$Port = 8100
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$portalRoot = Split-Path -Parent $scriptDir
$backendDir = Join-Path $portalRoot "backend"

Push-Location $backendDir
try {
    Write-Host "Starting backend on http://127.0.0.1:$Port"
    & python -m uvicorn app.main:app --reload --host 127.0.0.1 --port $Port --env-file .env.local
}
finally {
    Pop-Location
}
