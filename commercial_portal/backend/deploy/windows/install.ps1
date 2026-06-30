param(
    [string]$Domain = "portal-api.tiesverse.com",
    [string]$AwsRegion = "ap-south-1",
    [string]$EnvironmentParameter = "/geoatlas/commercial/prod/env"
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$principal = New-Object Security.Principal.WindowsPrincipal(
    [Security.Principal.WindowsIdentity]::GetCurrent()
)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script from an elevated PowerShell session."
}

$root = "C:\GeoAtlasCommercial"
$appRoot = Join-Path $root "backend"
$venvRoot = Join-Path $root "venv"
$configRoot = Join-Path $root "config"
$logRoot = Join-Path $root "logs"
$caddyRoot = Join-Path $root "caddy"
$environmentFile = Join-Path $configRoot "portal.env"

New-Item -ItemType Directory -Force -Path $root, $configRoot, $logRoot, $caddyRoot | Out-Null

if (-not (Get-Command aws.exe -ErrorAction SilentlyContinue)) {
    $awsInstaller = Join-Path $env:TEMP "AWSCLIV2.msi"
    Invoke-WebRequest "https://awscli.amazonaws.com/AWSCLIV2.msi" -OutFile $awsInstaller
    Start-Process msiexec.exe -ArgumentList "/i `"$awsInstaller`" /qn" -Wait
    Remove-Item $awsInstaller -Force
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
        [Environment]::GetEnvironmentVariable("Path", "User")
}

$python = Get-Command python.exe -ErrorAction SilentlyContinue
if (-not $python) {
    $pythonInstaller = Join-Path $env:TEMP "python-3.13.14-amd64.exe"
    Invoke-WebRequest `
        "https://www.python.org/ftp/python/3.13.14/python-3.13.14-amd64.exe" `
        -OutFile $pythonInstaller
    Start-Process $pythonInstaller `
        -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1 Include_test=0" `
        -Wait
    Remove-Item $pythonInstaller -Force
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
        [Environment]::GetEnvironmentVariable("Path", "User")
    $python = Get-Command python.exe -ErrorAction Stop
}

$archive = Join-Path $env:TEMP "geoatlas-main.zip"
$expanded = Join-Path $env:TEMP "geoatlas-commercial-deploy"
Remove-Item $archive -Force -ErrorAction SilentlyContinue
Remove-Item $expanded -Recurse -Force -ErrorAction SilentlyContinue

Invoke-WebRequest `
    "https://github.com/tiesversegeoatlas/GeoAtlas/archive/refs/heads/main.zip" `
    -OutFile $archive
Expand-Archive -Path $archive -DestinationPath $expanded -Force

$sourceBackend = Join-Path $expanded "GeoAtlas-main\commercial_portal\backend"
if (-not (Test-Path $sourceBackend)) {
    throw "The commercial backend was not found in the downloaded repository."
}

Remove-Item $appRoot -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item $sourceBackend $appRoot -Recurse -Force
Remove-Item $archive -Force
Remove-Item $expanded -Recurse -Force

if (-not (Test-Path (Join-Path $venvRoot "Scripts\python.exe"))) {
    & $python.Source -m venv $venvRoot
}

$venvPython = Join-Path $venvRoot "Scripts\python.exe"
& $venvPython -m pip install --upgrade pip wheel
& $venvPython -m pip install -r (Join-Path $appRoot "requirements.txt")
# Keep production deploys compatible until the dependency is present on main.
& $venvPython -m pip install "psycopg[binary]==3.2.10"

$environment = & aws.exe ssm get-parameter `
    --name $EnvironmentParameter `
    --with-decryption `
    --query "Parameter.Value" `
    --output text `
    --region $AwsRegion
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($environment)) {
    throw "Could not retrieve $EnvironmentParameter from Parameter Store."
}
$environment | Set-Content -Path $environmentFile -Encoding utf8

$backendTask = "GeoAtlasCommercialBackend"
Unregister-ScheduledTask -TaskName $backendTask -Confirm:$false -ErrorAction SilentlyContinue

$backendRunner = Join-Path $configRoot "run-backend.cmd"
@"
@echo off
cd /d "$appRoot"
"$venvPython" -m uvicorn app.main:app --host 127.0.0.1 --port 8100 --proxy-headers --forwarded-allow-ips=127.0.0.1 --env-file "$environmentFile" >> "$logRoot\backend.log" 2>&1
"@ | Set-Content -Path $backendRunner -Encoding ascii

$backendAction = New-ScheduledTaskAction `
    -Execute "C:\Windows\System32\cmd.exe" `
    -Argument "/c `"$backendRunner`"" `
    -WorkingDirectory $appRoot
$backendTrigger = New-ScheduledTaskTrigger -AtStartup
$backendSettings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Days 3650)
$backendPrincipal = New-ScheduledTaskPrincipal `
    -UserId "SYSTEM" `
    -LogonType ServiceAccount `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName $backendTask `
    -Action $backendAction `
    -Trigger $backendTrigger `
    -Settings $backendSettings `
    -Principal $backendPrincipal | Out-Null
Start-ScheduledTask -TaskName $backendTask

$caddyRelease = Invoke-RestMethod `
    -Headers @{ "User-Agent" = "GeoAtlas-Commercial-Installer" } `
    -Uri "https://api.github.com/repos/caddyserver/caddy/releases/latest"
$caddyAsset = $caddyRelease.assets |
    Where-Object { $_.name -match "windows_amd64\.zip$" } |
    Select-Object -First 1
if (-not $caddyAsset) {
    throw "The latest Windows Caddy release could not be located."
}

$caddyArchive = Join-Path $env:TEMP "caddy-windows.zip"
Invoke-WebRequest $caddyAsset.browser_download_url -OutFile $caddyArchive
Expand-Archive -Path $caddyArchive -DestinationPath $caddyRoot -Force
Remove-Item $caddyArchive -Force

$caddyFile = Join-Path $caddyRoot "Caddyfile"
@"
$Domain {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8100
}
"@ | Set-Content -Path $caddyFile -Encoding utf8

$caddyExe = Join-Path $caddyRoot "caddy.exe"
& $caddyExe validate --config $caddyFile --adapter caddyfile

& sc.exe stop GeoAtlasCommercialProxy 2>$null | Out-Null
& sc.exe delete GeoAtlasCommercialProxy 2>$null | Out-Null
Start-Sleep -Seconds 2
$caddyCommand = "`"$caddyExe`" run --config `"$caddyFile`" --adapter caddyfile"
& sc.exe create GeoAtlasCommercialProxy start= auto binPath= $caddyCommand | Out-Null
& sc.exe description GeoAtlasCommercialProxy "GeoAtlas commercial portal HTTPS reverse proxy" | Out-Null
& sc.exe start GeoAtlasCommercialProxy | Out-Null

foreach ($port in 80, 443) {
    $ruleName = "GeoAtlas Commercial TCP $port"
    Remove-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    New-NetFirewallRule `
        -DisplayName $ruleName `
        -Direction Inbound `
        -Protocol TCP `
        -LocalPort $port `
        -Action Allow | Out-Null
}

Start-Sleep -Seconds 5
$health = Invoke-RestMethod "http://127.0.0.1:8100/health"
if ($health.status -ne "ok") {
    throw "The commercial backend health check did not return ok."
}

Write-Host "GeoAtlas commercial backend is healthy."
Write-Host "Local health: http://127.0.0.1:8100/health"
Write-Host "Public health: https://$Domain/health"
