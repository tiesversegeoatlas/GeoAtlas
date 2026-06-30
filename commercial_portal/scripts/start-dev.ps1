param(
    [int]$PreferredBackendPort = 8100,
    [int]$PreferredFrontendPort = 3100,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

function Test-PortAvailable {
    param([int]$Port)

    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    try {
        $listener.Start()
        return $true
    }
    catch {
        return $false
    }
    finally {
        try { $listener.Stop() } catch {}
    }
}

function Get-AvailablePort {
    param(
        [int]$PreferredPort,
        [int]$MaxAttempts = 50
    )

    for ($offset = 0; $offset -lt $MaxAttempts; $offset++) {
        $candidate = $PreferredPort + $offset
        if (Test-PortAvailable -Port $candidate) {
            return $candidate
        }
    }

    throw "Unable to find a free port starting from $PreferredPort."
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$portalRoot = Split-Path -Parent $scriptDir
$backendScript = Join-Path $scriptDir "start-backend.ps1"
$frontendScript = Join-Path $scriptDir "start-frontend.ps1"
$concurrentlyCmd = Join-Path $portalRoot "node_modules\.bin\concurrently.cmd"

$backendPort = Get-AvailablePort -PreferredPort $PreferredBackendPort
$frontendPort = Get-AvailablePort -PreferredPort $PreferredFrontendPort
if ($frontendPort -eq $backendPort) {
    $frontendPort = Get-AvailablePort -PreferredPort ($frontendPort + 1)
}
$apiUrl = "http://127.0.0.1:$backendPort"

Write-Host "[launcher] backend -> http://127.0.0.1:$backendPort"
Write-Host "[launcher] frontend -> http://127.0.0.1:$frontendPort"
Write-Host "[launcher] frontend will proxy API requests to $apiUrl"

$backendCommand = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$backendScript`" -Port $backendPort"
$frontendCommand = "powershell -NoProfile -ExecutionPolicy Bypass -File `"$frontendScript`" -Port $frontendPort -ApiUrl `"$apiUrl`""

if ($DryRun) {
    Write-Host "[launcher] DRY RUN"
    Write-Host "[launcher] $backendCommand"
    Write-Host "[launcher] $frontendCommand"
    exit 0
}

Push-Location $portalRoot
try {
    & $concurrentlyCmd --kill-others --names backend,frontend --prefix-colors yellow,cyan $backendCommand $frontendCommand
}
finally {
    Pop-Location
}
