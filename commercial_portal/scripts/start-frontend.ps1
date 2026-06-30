param(
    [int]$Port = 3100,
    [string]$ApiUrl = "http://127.0.0.1:8100"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$portalRoot = Split-Path -Parent $scriptDir
$frontendDir = Join-Path $portalRoot "frontend"
$env:PORTAL_API_URL = $ApiUrl

Push-Location $frontendDir
try {
    Write-Host "Starting frontend on http://127.0.0.1:$Port (API: $ApiUrl)"
    & (Join-Path $frontendDir "node_modules\.bin\next.cmd") dev --hostname 127.0.0.1 --port $Port
}
finally {
    Pop-Location
}
