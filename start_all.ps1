<#
start_all.ps1
Starts backend API, ML service, and frontend in separate PowerShell windows.

Usage:
  .\start_all.ps1            # default: open each service in its own window
  .\start_all.ps1 -Single    # run everything sequentially in the current window

This script is intended for Windows development environments.
#>

param(
    [switch]$Single
)

function Ensure-NodeDeps($path) {
    if (!(Test-Path (Join-Path $path 'node_modules'))) {
        Write-Host "Installing Node deps in $path..."
        Push-Location $path
        if (Test-Path package-lock.json) { npm ci } else { npm install }
        Pop-Location
    } else {
        Write-Host "Node deps already present in $path"
    }
}

function Ensure-PythonVenv($path) {
    $venvDir = Join-Path $path '.venv'
    if (!(Test-Path $venvDir)) {
        Write-Host "Creating Python venv in $path..."
        Push-Location $path
        python -m venv .venv
        Pop-Location
    } else {
        Write-Host "Python venv already present in $path"
    }
}

Write-Host "============================================="
Write-Host "  CRYPTO INTELLIGENCE - START ALL SERVICES"
Write-Host "============================================="

# API
Write-Host "[1/3] Backend API"
if (!(Test-Path "api")) {
    Write-Host "No api directory found, skipping backend." -ForegroundColor Yellow
} else {
    Ensure-NodeDeps (Join-Path (Get-Location) 'api')
    $apiCmd = "cd api; npm run dev"
    if ($Single) {
        Write-Host "Running API in current window: $apiCmd"
        Invoke-Expression $apiCmd
    } else {
        Start-Process powershell -ArgumentList "-NoExit", "-Command", $apiCmd -WindowStyle Normal
    }
}

# ML service
Write-Host "[2/3] ML Service"
if (!(Test-Path "ml")) {
    Write-Host "No ml directory found, skipping ML service." -ForegroundColor Yellow
} else {
    Ensure-PythonVenv (Join-Path (Get-Location) 'ml')
    $venvActivate = "./.venv/Scripts/Activate.ps1"
    $mlCmd = "cd ml; $venvActivate; pip install -r requirements.txt; uvicorn src.inference.api:app --reload --port 8000"
    if ($Single) {
        Write-Host "Running ML in current window: uvicorn on port 8000"
        Push-Location ml
        . ./.venv/Scripts/Activate.ps1
        pip install -r requirements.txt
        uvicorn src.inference.api:app --reload --port 8000
        Pop-Location
    } else {
        Start-Process powershell -ArgumentList "-NoExit", "-Command", $mlCmd -WindowStyle Normal
    }
}

# Frontend
Write-Host "[3/3] Frontend"
if (!(Test-Path "frontend")) {
    Write-Host "No frontend directory found, skipping frontend." -ForegroundColor Yellow
} else {
    Ensure-NodeDeps (Join-Path (Get-Location) 'frontend')
    $feCmd = "cd frontend; npm run dev"
    if ($Single) {
        Write-Host "Running Frontend in current window: $feCmd"
        Invoke-Expression $feCmd
    } else {
        Start-Process powershell -ArgumentList "-NoExit", "-Command", $feCmd -WindowStyle Normal
    }
}

Write-Host "============================================="
Write-Host "  Services started (or running in current window)"
Write-Host "  Backend: http://localhost:3000  (example)"
Write-Host "  ML API:  http://localhost:8000"
Write-Host "  Frontend: http://localhost:5174 (or next free port)"
Write-Host "============================================="
