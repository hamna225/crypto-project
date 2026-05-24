Write-Host "============================================="
Write-Host "  CRYPTO INTELLIGENCE - LOCAL NATIVE BOOT "
Write-Host "============================================="

# 1. Create data directory for SQLite if it doesn't exist
if (!(Test-Path "api\data")) {
    New-Item -ItemType Directory -Path "api\data"
}

# 2. Start API
Write-Host "1. Starting Backend API..."
if (!(Test-Path "api\node_modules")) {
    Write-Host "Installing API dependencies..."
    cd api; npm install; cd ..
}
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd api; npm run dev" -WindowStyle Normal

# 3. Start ML
Write-Host "2. Starting ML Service..."
$mlCmd = "cd ml; pip install -r requirements.txt; uvicorn src.inference.api:app --reload --port 8000"
if (Test-Path "ml\.venv") {
    $mlCmd = "cd ml; .\ .venv\Scripts\activate; pip install -r requirements.txt; uvicorn src.inference.api:app --reload --port 8000"
}
Start-Process powershell -ArgumentList "-NoExit", "-Command", "$mlCmd" -WindowStyle Normal

# 4. Start Frontend
Write-Host "3. Starting Frontend..."
if (!(Test-Path "frontend\node_modules")) {
    Write-Host "Installing Frontend dependencies..."
    cd frontend; npm install; cd ..
}
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd frontend; npm run dev" -WindowStyle Normal

Write-Host "============================================="
Write-Host "  All services starting in new windows."
Write-Host "  Running on SQLite (No Docker required)."
Write-Host "============================================="
