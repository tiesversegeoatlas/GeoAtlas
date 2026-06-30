# Windows EC2 deployment

This deployment runs only the GeoAtlas commercial portal backend on Windows
Server. The frontend remains separately hosted.

Production topology:

```text
https://portal-api.tiesverse.com
  -> Caddy on Windows ports 80/443
  -> Uvicorn on 127.0.0.1:8100
  -> shared GeoAtlas PostgreSQL database
```

The EC2 instance role must be able to read the encrypted Parameter Store value
`/geoatlas/commercial/prod/env`. Store these variables in that parameter:

```dotenv
GEOATLAS_PORTAL_DATABASE_URL=postgresql+psycopg://...
GEOATLAS_PORTAL_CORS_ORIGINS=https://tiesnewsapi.tiesverse.com
GEOATLAS_PORTAL_SESSION_DAYS=30
GEOATLAS_PORTAL_ADMIN_EMAIL=...
GEOATLAS_PORTAL_ADMIN_PASSWORD=...
GEOATLAS_PORTAL_ADMIN_NAME=GeoAtlas Admin
GEOATLAS_PORTAL_HIDDEN_ADMIN_SLUG=...
GEOATLAS_PORTAL_SECURE_COOKIES=true
```

Create a Hostinger `A` record named `portal-api` that points to the EC2 Elastic
IP before running the installer. The EC2 security group should expose ports 80
and 443 only. Use Systems Manager instead of exposing RDP when possible.

Run from an elevated PowerShell session on the Windows instance:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\install.ps1 `
  -Domain portal-api.tiesverse.com `
  -AwsRegion ap-south-1 `
  -EnvironmentParameter /geoatlas/commercial/prod/env
```

The installer downloads only the commercial backend into
`C:\GeoAtlasCommercial\backend`, creates a Python virtual environment, installs
dependencies, loads the encrypted production environment, registers the API as
a startup task, installs Caddy as an automatic Windows service, and verifies
`GET /health`.
