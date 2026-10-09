# ServerOps tests

Phase 7 reverified this on 9 October 2026: Pytest 38 passed (91% coverage of `monitor` and `config`), Django's runner 38 passed, and Playwright 23 passed in Chromium.

Pytest checks the Django API. Playwright checks the dashboard in Chromium. Neither suite reads or writes `backend/db.sqlite3`, and neither needs the real administrator password.

Quote the project path in PowerShell. It contains spaces, an ampersand, and an en dash.

## Prerequisites

- Python 3.11 in `backend/.venv`
- Node.js and npm for `frontend/`
- Docker is not required

Install the test tools once, inside the project:

```powershell
Set-Location -LiteralPath "C:\Users\om\Documents\coding\My Notebook\Side projects\ServerOps – Smart Server Monitoring & Automation Dashboard\backend"
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt

Set-Location -LiteralPath "C:\Users\om\Documents\coding\My Notebook\Side projects\ServerOps – Smart Server Monitoring & Automation Dashboard\frontend"
npm install
$env:PLAYWRIGHT_BROWSERS_PATH = ".\.playwright-browsers"
node ./node_modules/@playwright/test/cli.js install chromium
```

## Backend

From `backend/`:

```powershell
.\.venv\Scripts\python.exe manage.py test monitor
.\.venv\Scripts\python.exe -m pytest
```

Pytest prints a coverage table for `monitor` and `config`. The Django runner and Pytest both discover `monitor/tests.py` and `monitor/test_contracts.py`. Authentication and exporter cases stay in their modules and are imported by `tests.py`, so they run once.

Pytest stores its database at `backend/.test-runtime/pytest.sqlite3`. `manage.py test` uses an in-memory database. Both refuse to continue if the connection points at `backend/db.sqlite3`.

## Browser

From `frontend/`:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = ".\.playwright-browsers"
npm run test:e2e
```

Playwright starts Django on `127.0.0.1:8016` and Vite on `127.0.0.1:5176`, then stops them. If either port is already taken, the run fails instead of stopping another process.

`backend/run_e2e_server.py` migrates `backend/.test-runtime/e2e.sqlite3`, creates the staff user `e2e-staff`, and writes a new password to `backend/.test-runtime/account.json`. The password is not printed. Tests read that file. Do not commit it.

Open the last HTML report from `frontend/`:

```powershell
npm run test:e2e:report
```

`npm run test:e2e:ui` opens Playwright's interactive runner. Failure screenshots and traces go to `frontend/test-results/`. Those folders are gitignored. A trace can contain the test password that was typed into the form, so do not share a failed trace.

## What is deterministic

Alert thresholds, malformed payloads, offline recovery, and layout checks use Playwright route fixtures. They do not depend on the computer's live CPU.

Login, session reload, logout, and one dashboard test use the disposable Django API and live psutil readings from that test process. They check shape and ranges, not an exact CPU percentage.

## Cleanup

Stop a stuck test server only if you started it and it is still the Phase 6 process on port 8016 or 5176. Delete `backend/.test-runtime/` when you want to drop generated databases and the test account file. Do not delete `backend/db.sqlite3`, `backend/.env`, or the Prometheus and Grafana volumes.

## Debugging a failure

Run one file:

```powershell
node ./node_modules/@playwright/test/cli.js test e2e/auth.spec.ts
.\.venv\Scripts\python.exe -m pytest monitor/test_contracts.py
```

The second command is run from `backend/`. Playwright keeps a trace when a test fails. Inspect it with:

```powershell
node ./node_modules/@playwright/test/cli.js show-trace test-results\<failed-test>\trace.zip
```
