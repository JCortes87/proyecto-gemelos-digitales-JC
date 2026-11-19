# Levanta Gemelo Digital en local, cada servidor en su propia ventana de
# PowerShell (siguen corriendo aunque se cierre el editor o Claude).
#
#   powershell -ExecutionPolicy Bypass -File scripts\iniciar-local.ps1
#
# 1) Asegura que Docker Desktop y la base local gemelo-pg (puerto 5433) estén arriba.
# 2) Backend:  https://localhost:8000  (uvicorn con los certificados locales)
# 3) Frontend: http://localhost:5173   (Vite)
# Para detener: cerrar las dos ventanas (o Ctrl+C en cada una).

$ErrorActionPreference = "Stop"
$root     = Split-Path -Parent $PSScriptRoot
$backend  = Join-Path $root "gemelo-digital-backend"
$frontend = Join-Path $root "gemelo-digital-frontend\gemelo-frontend"

function Test-Docker { docker info *> $null; return ($LASTEXITCODE -eq 0) }

if (-not (Test-Docker)) {
    Write-Host "Iniciando Docker Desktop..."
    Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    for ($i = 0; $i -lt 60 -and -not (Test-Docker); $i++) { Start-Sleep -Seconds 3 }
    if (-not (Test-Docker)) { throw "Docker Desktop no respondió. Ábrelo manualmente y vuelve a ejecutar el script." }
}

# La base de otro proyecto (sgpm-db) usa el mismo puerto 5433: debe estar apagada.
$sgpm = docker ps --filter "name=^sgpm-db$" --format "{{.Names}}"
if ($sgpm) { Write-Host "Deteniendo sgpm-db (usa el mismo puerto 5433)..."; docker stop sgpm-db | Out-Null }

$pg = docker ps --filter "name=^gemelo-pg$" --format "{{.Names}}"
if (-not $pg) {
    Write-Host "Iniciando la base de datos gemelo-pg..."
    docker start gemelo-pg | Out-Null
}
for ($i = 0; $i -lt 30; $i++) {
    docker exec gemelo-pg pg_isready -U gemelo_admin -d gemelo_digital *> $null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
}
Write-Host "Base de datos lista."

Start-Process powershell -WorkingDirectory $backend -ArgumentList @(
    "-NoExit", "-Command",
    "`$Host.UI.RawUI.WindowTitle = 'Gemelo backend :8000'; python -m uvicorn main:app --reload --port 8000 --ssl-keyfile localhost-key.pem --ssl-certfile localhost-cert.pem"
)
Start-Process powershell -WorkingDirectory $frontend -ArgumentList @(
    "-NoExit", "-Command",
    "`$Host.UI.RawUI.WindowTitle = 'Gemelo frontend :5173'; npm run dev"
)

Write-Host ""
Write-Host "Listo. En unos segundos:"
Write-Host "  App:          http://localhost:5173"
Write-Host "  Coordinador:  http://localhost:5173/coordinator"
Write-Host "  Backend:      https://localhost:8000/health"
