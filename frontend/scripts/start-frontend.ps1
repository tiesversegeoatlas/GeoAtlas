$ErrorActionPreference = "Stop"

$port = 3000
$homeUrl = "http://127.0.0.1:$port"
$frontendRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

function Repair-FrontendDependenciesIfNeeded {
    $nextDirectory = Join-Path $frontendRoot "node_modules\next"
    $nextPackage = Join-Path $nextDirectory "package.json"
    $nextCommand = Join-Path $frontendRoot "node_modules\.bin\next.cmd"
    $requiresRepair = -not (Test-Path -LiteralPath $nextPackage) -or
        -not (Test-Path -LiteralPath $nextCommand)

    if (-not $requiresRepair) {
        $nextItem = Get-Item -LiteralPath $nextDirectory -Force
        if ($nextItem.LinkType) {
            foreach ($target in @($nextItem.Target)) {
                $targetPath = [System.IO.Path]::GetFullPath($target)
                if (-not $targetPath.StartsWith(
                    $frontendRoot,
                    [System.StringComparison]::OrdinalIgnoreCase
                )) {
                    $requiresRepair = $true
                    break
                }
            }
        }

        if (-not $requiresRepair) {
            $commandContents = Get-Content -LiteralPath $nextCommand -Raw
            if ($commandContents -match [regex]::Escape(
                (Join-Path (Split-Path $frontendRoot -Parent) "commercial_portal")
            )) {
                $requiresRepair = $true
            }
        }
    }

    if (-not $requiresRepair) {
        return
    }

    Write-Host "Frontend dependencies are missing or linked to another project; repairing them..."
    Push-Location $frontendRoot
    try {
        & npm.cmd ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) {
            throw "npm ci failed with exit code $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }

    if (-not (Test-Path -LiteralPath $nextPackage) -or -not (Test-Path -LiteralPath $nextCommand)) {
        throw "Next.js was not installed correctly in $frontendRoot."
    }
}

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

Repair-FrontendDependenciesIfNeeded

Push-Location (Join-Path $PSScriptRoot "..")
try {
    & (Join-Path $PWD "node_modules\.bin\next.cmd") dev --turbopack --hostname 127.0.0.1 --port $port
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
