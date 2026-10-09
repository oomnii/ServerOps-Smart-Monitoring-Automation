# ServerOps – Smart Server Monitoring & Automation Dashboard

ServerOps is a local monitoring project for one Windows PC. It shows live CPU, memory, and disk usage in a React dashboard, stores the same readings in Prometheus, charts them in Grafana, and demonstrates Linux configuration with Ansible inside a disposable container.

The dashboard is for an active staff user. Health stays public and does not include resource numbers. Nothing in this repository is a public or production deployment.

# How to Set Up & Run ServerOps Locally

These steps are for Windows PowerShell. The project folder name contains spaces, an ampersand (`&`), and an en dash (`–`). Quote that path, and prefer `Set-Location -LiteralPath`.

Docker is optional. The React dashboard and Django API run without it.

### A. Prerequisites

- Windows 10 or Windows 11
- Python 3.11 (`py -3.11`). The `python` command on this PC may be a newer release, so backend commands use 3.11 explicitly.
- Node.js and npm
- Git
- Docker Desktop, only if you want Prometheus, Grafana, or the Ansible lab
- Internet access the first time you install Python packages, npm packages, or container images

### B. First-Time Setup (Fresh Clone)

```powershell
git clone https://github.com/oomnii/ServerOps-Smart-Monitoring-Automation.git
Set-Location -LiteralPath ".\ServerOps-Smart-Monitoring-Automation"
py -3.11 -m venv .\backend\.venv
.\backend\.venv\Scripts\python.exe -m pip install -r .\backend\requirements.txt
Copy-Item -LiteralPath ".\.env.example" -Destination ".\backend\.env"
```

If `backend\.env` already exists, do not overwrite it.

Open `backend\.env` and replace `DJANGO_SECRET_KEY` with a new random string. Generate one locally and paste it yourself. Do not commit the file.

```powershell
py -3.11 -c "import secrets; print(secrets.token_urlsafe(48))"
```

Generate a second string the same way and put it in `SERVEROPS_METRICS_TOKEN`. The dashboard does not need that token. Prometheus does. Leave `DJANGO_DEBUG=True` for this local PC. Leave `VITE_API_BASE_URL` empty.

```powershell
Set-Location -LiteralPath ".\backend"
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py createsuperuser
Set-Location -LiteralPath "..\frontend"
Copy-Item -LiteralPath ".\.env.example" -Destination ".\.env"
npm install
Set-Location -LiteralPath ".."
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-serverops.ps1
```

`createsuperuser` asks for a username and password in that terminal. Nothing in the repository creates a public registration page. Do not put the password in a file that Git tracks.

### C. Quick Start (Existing Setup)

Use this when `backend\.venv`, `backend\.env`, and `frontend\node_modules` are already in place. Open PowerShell in the project folder first.

**Option 1: One-click startup**

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-serverops.ps1
```

The `-ExecutionPolicy Bypass` flag applies only to that command. It does not change the policy for Windows. The script starts Django and Vite, waits until both answer, and opens `http://127.0.0.1:5173/` in the default browser. If this project's servers are already healthy, it reuses them. If another program owns port 8000 or 5173, it stops and names that program. It does not kill the other program.

**Option 2: Manual startup**

These two commands assume the terminal is already in the project root and dependencies are installed.

Terminal 1, Django:

```powershell
cd backend
.\.venv\Scripts\python.exe manage.py runserver 127.0.0.1:8000
```

Terminal 2, React:

```powershell
cd frontend
npm run dev -- --host 127.0.0.1
```

Vite is already configured for `127.0.0.1:5173` and proxies `/api` to `http://127.0.0.1:8000`. Leave `VITE_API_BASE_URL` empty so the browser stays on the dashboard origin.

### D. Local URLs

| Service | URL | Required for the dashboard |
| --- | --- | --- |
| React dashboard | http://127.0.0.1:5173/ | Yes |
| Django health API | http://127.0.0.1:8000/api/health/ | Yes. The dashboard has no metrics without it. |
| Prometheus | http://127.0.0.1:9090/ | No |
| Grafana | http://127.0.0.1:3000/ | No |

`/api/health/` is public and does not include CPU, memory, or disk numbers. Those readings require a signed-in staff user.

### E. Login Instructions

Sign in with the Django staff account you created. There is no signup page. A first-time clone has no administrator until you run:

```powershell
Set-Location -LiteralPath ".\backend"
.\.venv\Scripts\python.exe manage.py createsuperuser
```

Use a password you can remember. Do not commit it, and do not put it in `README.md`, `.env.example`, or a screenshot. If this PC already has an administrator, use that account. Do not create a second one unless you want another staff user.

### F. Optional Prometheus & Grafana Setup

Skip this section for the normal dashboard. Docker Desktop must be running before these commands. Django must also be running on `127.0.0.1:8000`, because Prometheus scrapes this PC rather than a container.

Use the same `SERVEROPS_METRICS_TOKEN` value in `backend\.env` and in the scrape file. Generate it with the `secrets.token_urlsafe` command above. Do not leave the example text in place.

```powershell
New-Item -ItemType Directory -Force -Path ".\monitoring\prometheus\secrets" | Out-Null
Copy-Item -LiteralPath ".\monitoring\prometheus\scrape_token.example" -Destination ".\monitoring\prometheus\secrets\scrape_token"
Copy-Item -LiteralPath ".\monitoring\grafana\.env.example" -Destination ".\monitoring\grafana\.env"
```

Replace the copied scrape token with the real token. In `monitoring\grafana\.env`, set `GF_SECURITY_ADMIN_PASSWORD` to a random password. Do not commit either file.

From the project root:

```powershell
docker compose up -d
```

Open http://127.0.0.1:9090/ and http://127.0.0.1:3000/ . In Grafana, sign in with the user and password from `monitoring\grafana\.env`. The provisioned dashboard is **ServerOps — System Performance Monitoring**. The exporter stays protected: a missing or wrong bearer token is rejected.

Stop the containers and keep their saved metrics:

```powershell
docker compose down
```

Do not add `-v`. That flag deletes the Prometheus and Grafana volumes.

### G. Optional Ansible Setup

The lab is a disposable Linux container. It does not configure Windows, and it does not change the dashboard. Full notes are in [automation/ansible/README.md](automation/ansible/README.md).

From `automation\ansible`, with Docker Desktop running:

```powershell
docker compose -f compose.yml up -d --build
docker compose -f compose.yml exec -T lab ansible-playbook playbook.yml
docker compose -f compose.yml exec -T lab ansible-playbook playbook.yml
docker compose -f compose.yml down
```

The second run on the same container should report `changed=0`. The health check inside the container is `/tmp/serverops-lab/scripts/health_check.py`. It inspects the container filesystem, not this PC.

### H. Running Tests

More detail, including cleanup, is in [tests/README.md](tests/README.md). The suites use disposable databases. They do not open `backend\db.sqlite3` and they do not need your administrator password.

Backend, from `backend\`:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe manage.py test monitor
.\.venv\Scripts\python.exe -m pytest
```

Frontend lint, production build, and browser tests, from `frontend\`:

```powershell
npm run lint
npm run build
$env:PLAYWRIGHT_BROWSERS_PATH = ".\.playwright-browsers"
node ./node_modules/@playwright/test/cli.js install chromium
npm run test:e2e
```

Playwright starts its own Django process on `127.0.0.1:8016` and its own Vite process on `127.0.0.1:5176`. Those are not the everyday dashboard ports.

### I. How to Stop the Project

If you started the two terminals yourself, press Ctrl+C in each one.

If you used the startup script, this stops only the processes that script recorded:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\stop-serverops.ps1
```

It checks the recorded process id, start time, and command line before stopping anything. A reused process id that now belongs to another program is left alone. It does not run `taskkill` against every `python.exe` or `node.exe`.

Stop Prometheus and Grafana without deleting their data:

```powershell
docker compose down
```

### J. Troubleshooting

**Python is not recognized.** Install Python 3.11 and reopen PowerShell. Use `py -3.11`, not an unqualified `python`, when creating the virtual environment.

**The virtual environment is the wrong Python.** From `backend\`, run `.\.venv\Scripts\python.exe -c "import sys; print(sys.version)"`. If it is not 3.11, remove only `backend\.venv` and create it again with `py -3.11 -m venv .venv`. Do not delete `backend\db.sqlite3`.

**`backend\.venv` is missing.** Complete First-Time Setup. The startup script will not install packages for you.

**`frontend\node_modules` is missing.** From `frontend\`, run `npm install`.

**Port 8000 or 5173 is already occupied.** The startup script names the process and exits. Do not close an unrelated program from the script. If the existing listener is already this project's Django or Vite, the script reuses it. A server you started by hand is left for you to stop with Ctrl+C.

**The dashboard says the API is offline, or the browser cannot connect.** Start Django and open http://127.0.0.1:8000/api/health/ . That page should load. Then use http://127.0.0.1:5173/ , not a saved `file://` copy of the page.

**Sign-in fails.** Use the staff username and password from `createsuperuser`. An unknown user, a wrong password, and an inactive user all receive the same message. There is no password-reset page in this project.

**CSRF validation failed.** Sign in through http://127.0.0.1:5173/ so the Vite proxy is used. Do not turn off CSRF. A 403 with that message means the form did not send the token cookie.

**Docker Desktop is not running.** The dashboard does not need it. Prometheus, Grafana, and Ansible do. Start Docker Desktop, wait until it is ready, then run the Compose command again.

**Grafana shows No Data.** Django must be running on port 8000, and `SERVEROPS_METRICS_TOKEN` must match `monitoring\prometheus\secrets\scrape_token`. Set the dashboard time range to the last 15 minutes. The HTTP panel stays empty until something calls `/api/` on port 8000. The Prometheus scrape itself is not counted as an API request.

**PowerShell will not run the script.** Call it with `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-serverops.ps1`. Do not set a machine-wide execution policy to get past this.

## Overview

- Real-time CPU, memory, and system-drive readings from this PC
- Staff login, session persistence, and logout
- Resource alerts at 80% CPU or memory
- Prometheus scrape and a four-panel Grafana dashboard
- An isolated Ansible lab that writes configuration and a health-check script
- Pytest and Playwright suites that use disposable databases

## Key features

- `GET /api/health/` is public and returns only a service status
- CPU, memory, disk, and combined metrics require an active staff session
- The dashboard signs in, keeps the session across reload, and signs out
- Signed-in readings refresh about 5 seconds after the previous response
- Refresh requests a new snapshot without reloading the page
- CPU and memory alerts appear at or above 80% and clear below that line
- Stale readings stay visible and labeled when a later request fails
- `GET /internal/metrics/` exposes Prometheus text and requires a bearer token
- Grafana charts CPU, memory, disk, and Django HTTP request rate
- Ansible configures only `/tmp/serverops-lab` inside its own container

## Screenshots

The frames below are from the running Coffee & Cream interface. The signed-in user is the disposable test account `e2e-staff`. Percentages are live readings from this PC, including a memory alert above 80%. No password is shown.

![ServerOps sign-in page](docs/screenshots/login.png)

![ServerOps dashboard with live CPU, memory, and disk cards](docs/screenshots/dashboard.png)

![Live memory alert on the ServerOps dashboard](docs/screenshots/resource-alert.png)

![Grafana dashboard ServerOps — System Performance Monitoring](docs/screenshots/grafana-monitoring.png)

## Design system

The dashboard uses eight colors, defined as CSS custom properties in `frontend/src/styles.css`.

| Token | Hex | Use |
| --- | --- | --- |
| Warm cream | `#FFF8F0` | Header, cards, and button text |
| Caramel | `#C08552` | Accents, alert borders, and progress fills |
| Coffee brown | `#8C5A3C` | Secondary text, icons, and primary buttons |
| Deep espresso | `#4B2E2B` | Primary text, headings, and button hover |
| Soft off-white | `#F9F8F6` | Page background |
| Warm gray | `#EFE9E3` | Muted surfaces and progress tracks |
| Subtle border | `#D9CFC7` | Card, input, and header borders |
| Muted sand | `#C9B59C` | Disabled controls, with espresso text |

Caramel and sand are not used for small text. Focus uses an espresso outline plus a caramel ring. Statuses also use icons and words, not color alone. Grafana chart lines use coffee, caramel, and espresso. Grafana's own chrome stays on Grafana's light theme and is not restyled.

## Technology stack

| Area | Technologies |
| --- | --- |
| Backend | Python 3.11, Django 5.2, Django REST Framework, psutil, SQLite |
| Frontend | React 19, TypeScript, HTML, CSS, Vite |
| Monitoring | Prometheus 2.55.1, Grafana 11.5.2, prometheus-client, Docker Compose |
| Automation | Ansible Core 2.18, Docker |
| Testing | Pytest, pytest-django, pytest-cov, Playwright, Chromium |
| Development | Git, Windows PowerShell |

Backend packages live in `backend/.venv`. Frontend packages live in `frontend/node_modules`. Ansible is not installed on Windows.

## Architecture

```text
Windows host
    -> psutil
    -> Django REST API on 127.0.0.1:8000
    -> React dashboard on 127.0.0.1:5173
```

Monitoring:

```text
Django GET /internal/metrics/
    -> Prometheus
    -> Grafana
```

Automation:

```text
Docker Linux lab
    -> Ansible playbook (local connection)
    -> configuration file and health-check script
```

Django stays on Windows so the metrics describe this PC. Vite proxies `/api` to Django, so the session cookie stays on the dashboard origin. Prometheus reaches Django through `host.docker.internal`. The Ansible lab does not configure Windows and does not deploy Prometheus or Grafana.

Details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The phase record is in [docs/ROADMAP.md](docs/ROADMAP.md).

Setup, startup, monitoring, the Ansible lab, and tests are covered in [How to Set Up & Run ServerOps Locally](#how-to-set-up--run-serverops-locally). Architecture details are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Security

- Metrics require an active staff session. Anonymous calls receive 401. Non-staff users receive 403.
- Login and logout require a CSRF token. Failed checks return a short JSON message.
- The Prometheus endpoint compares the bearer token with a digest and fails closed when the token is missing.
- CORS allows only the local Vite origins and does not allow credentialed cross-origin calls.
- Django and the dashboard bind to `127.0.0.1`. Grafana anonymous access and signup are off.
- Secrets belong in gitignored `.env` files and `monitoring/prometheus/secrets/`. Examples contain placeholders only.

These are local development controls. Debug mode, SQLite, and localhost binding are not a production deployment.

## Limitations

- The app monitors the Windows PC where Django is running.
- Disk metrics use the Windows system drive.
- Alert thresholds are fixed at 80% in the React app.
- Ansible configures one disposable container. It does not use SSH and does not change Windows.
- Prometheus and the Ansible lab need Docker Desktop.
- There is no cloud deployment, CI pipeline, or public signup.

## Project status

Phases 0 through 7 were verified on this machine on 9 October 2026.

- Django checks: no issues. Migrations: no pending changes.
- Django tests: 38 passed. Pytest: 38 passed, 91% coverage of `monitor` and `config`.
- Playwright: 23 passed in Chromium.
- Frontend lint and production build passed.
- Prometheus target `serverops` was up, and Grafana showed the four panels.
- Ansible second run reported `changed=0`.

The GitHub repository is https://github.com/oomnii/ServerOps-Smart-Monitoring-Automation.

## Project layout

```text
backend/                  Django API, tests, and the local virtualenv
frontend/                 React dashboard and Playwright tests
scripts/                  Local start and stop scripts for Django and Vite
monitoring/prometheus/    Scrape config. The token file is gitignored.
monitoring/grafana/       Datasource, dashboard, and a gitignored admin env file
automation/ansible/       Disposable Ansible lab
docs/                     Architecture, roadmap, and screenshots
tests/README.md           How to run the suites
docker-compose.yml        Prometheus and Grafana
```
