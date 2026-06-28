$ErrorActionPreference = "Stop"

$port = 3000
$homeUrl = "http://127.0.0.1:$port"
$frontendRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Get-PortListener {
    $connection = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($connection) {
        return $connection
    }

    $netstatMatch = netstat -ano |
        Select-String "^\s*TCP\s+\S+:$port\s+\S+\s+LISTENING\s+(\d+)\s*$" |
        Select-Object -First 1
    if ($netstatMatch -and $netstatMatch.Matches.Count) {
        return [pscustomobject]@{
            OwningProcess = [int]$netstatMatch.Matches[0].Groups[1].Value
        }
    }
    return $null
}

$listener = Get-PortListener

if ($listener) {
    try {
        $response = Invoke-WebRequest -Uri $homeUrl -TimeoutSec 3 -UseBasicParsing
        if ($response.Content -match "Geo\s?Atlas") {
            Write-Host "GeoAtlas frontend is already running on $homeUrl; reusing it."
            while (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
                Start-Sleep -Seconds 2
            }
            exit 0
        }
    }
    catch {
        # The listener belongs to another service or is not healthy enough to reuse.
    }

    $listenerProcess = Get-CimInstance Win32_Process `
        -Filter "ProcessId = $($listener.OwningProcess)" `
        -ErrorAction SilentlyContinue
    if (
        $listenerProcess.Name -eq "node.exe" -and
        $listenerProcess.CommandLine -like "*$frontendRoot*"
    ) {
        Write-Host "Removing stale GeoAtlas frontend process $($listener.OwningProcess)."
        Stop-Process -Id $listener.OwningProcess -Force
        for ($attempt = 0; $attempt -lt 20 -and (Get-PortListener); $attempt++) {
            Start-Sleep -Milliseconds 250
        }
        $listener = Get-PortListener
    }
}

if ($listener) {
    throw "Port $port is occupied by another service (PID $($listener.OwningProcess)). Close it or change the GeoAtlas frontend port."
}

Push-Location (Join-Path $PSScriptRoot "..")
try {
    & (Join-Path $PWD "node_modules\.bin\next.cmd") dev --turbopack --hostname 127.0.0.1 --port $port
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
