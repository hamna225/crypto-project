**Overview**: Step-by-step instructions to run the Crypto Intelligence project locally (backend API, ML service, and frontend). This assumes a Windows developer machine; Linux/macOS notes included where relevant.

**Prerequisites**
- **Node.js**: 16+ (tested with Node 20.11.1). If you plan to run aggressive dependency upgrades (`npm audit fix --force`) use Node 20.19+ or 22.12+.
- **npm**: shipped with Node. Run `npm --version` to verify.
- **Python**: 3.8+ with `pip` for ML service.
- **PowerShell** (Windows): used by helper script `start_all.ps1`.

**Ports (typical)**
- Frontend: `http://localhost:5174` (Vite will pick the next free port if 5173/5174 are busy)
- ML API: `http://localhost:8000` (uvicorn)
- Backend API: typically `http://localhost:3000` — check `api/package.json` scripts if different.

**Files to know**
- Start-all script: [start_all.ps1](start_all.ps1)
- Frontend config modal modified: [frontend/src/components/ConfigModal.tsx](frontend/src/components/ConfigModal.tsx)

Running services individually

- Backend API (in a separate terminal)
```powershell
cd api
npm install   # or `npm ci` if package-lock.json exists
npm run dev
```

- ML service (create/activate venv then run uvicorn)
```powershell
cd ml
python -m venv .venv           # first time only
. .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn src.inference.api:app --reload --port 8000
```

- Frontend (Vite)
```powershell
cd frontend
npm install   # or `npm ci` if package-lock.json exists
npm run dev
```

Quick single-command (Windows)
- The repository includes a helper to start all services in separate PowerShell windows:
```powershell
.\start_all.ps1         # launches Backend, ML, and Frontend in new windows
.\start_all.ps1 -Single # run everything sequentially in the current window
```

What the start script does
- Installs missing `node_modules` in `api` and `frontend`.
- Creates a Python `.venv` and installs ML requirements in `ml` if missing.
- Starts the backend, ML, and frontend in separate persistent PowerShell windows by default.

How to verify the UI changes (Config modal)
1. Open the frontend: visit the Vite URL (e.g. `http://localhost:5174`).
2. Click the Config / ⚙ buttons in the header or the Configure Keys button in the sidebar.
3. Confirm:
   - Modal opens and you can scroll long lists.
   - Clicking the overlay or pressing `Escape` closes the modal.
   - The `CANCEL` button closes the modal without saving; `SAVE CONFIGURATION` posts to `/api/config`.

Troubleshooting
- Vite port: if 5173 is in use Vite will choose the next free port (e.g. 5174). Check terminal output for the correct URL.
- Node version: if you see errors referencing Node APIs (e.g. `node:util` exports), upgrade Node to a recent LTS (20.19+ recommended for Vite v8).
- Dependency conflicts after `npm audit fix --force`: this command can upgrade major dependencies (breaking changes). If you run it and face issues, revert `package.json` or restore from your git history.
- If the project is not a git repo (no .git), you can apply the patch manually by replacing the file contents. A sample patch was provided earlier in the work session if needed.

Notes & next steps
- I intentionally left dependencies stable (Vite v5) because `npm audit fix --force` attempted to upgrade to Vite v8 and caused peer-resolution issues in this environment.
- If you want me to perform an upgrade path (Node upgrade + forced audit fix + compatibility fixes), I can proceed — this may require small code changes and testing.

Contact / support
- If you hit an error, paste the terminal output here and I will triage it and provide exact commands to fix.
