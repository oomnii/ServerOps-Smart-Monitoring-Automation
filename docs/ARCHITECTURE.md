# ServerOps Architecture

Status: Phases 0–7 are complete. Prometheus on Docker Desktop scrapes Django at `host.docker.internal:8000` while Django stays bound to `127.0.0.1`. Ansible runs in a separate disposable Linux container and uses a local connection only. Pytest and Playwright use disposable databases, not `backend/db.sqlite3`. The repository has no commits and no Git remote yet.

ServerOps is a beginner-friendly dashboard for one local computer. Django reads that computer's CPU, memory, and disk metrics and exposes them over a REST API. A React dashboard displays those metrics. Prometheus and Grafana are a separate monitoring path. The Ansible lab is another separate path and does not configure this PC.

The design stays as one Django process, one React app, SQLite, and a few local tools. It does not use microservices, Kubernetes, or cloud infrastructure.

## System context

```text
Local Windows computer
        |
        | psutil reads host CPU, RAM, and disk
        v
Django REST API  (Python 3.11, Django REST Framework, SQLite)
        |
        | JSON over HTTP (Vite proxy, session cookie, 5-second poll)
        v
React + TypeScript dashboard  (Vite)
```

Django runs on the Windows host so `psutil` reports the real machine, not a container with its own CPU and memory limits.

The React app does not read system metrics itself. The browser calls relative `/api/...` URLs. Vite proxies them to `http://127.0.0.1:8000` and leaves `VITE_API_BASE_URL` empty, so the session cookie belongs to `127.0.0.1:5173`. Bytes are shown as GiB or MiB. The UTC timestamp is shown in the browser's local timezone. A failed refresh keeps the last snapshot and marks it stale. Alerts are hidden until the next successful snapshot.

## Implemented API

Django runs from `backend/` on Python 3.11. `monitor/services.py` reads the host with psutil. The views are read-only. A failed reading returns HTTP 503 and a short message. Unexpected errors return HTTP 500 JSON without a traceback or local path.

| Method and path | Who can call it | Body |
| --- | --- | --- |
| `GET /api/health/` | Anyone | `status`, `service` |
| `GET /api/auth/csrf/` | Anyone | Sets the CSRF cookie. No secret in the body. |
| `POST /api/auth/login/` | Anyone, with CSRF | `authenticated`, `username` for an active staff user |
| `GET /api/auth/me/` | Current session | `authenticated`, `username`, or 401/403 |
| `POST /api/auth/logout/` | Signed-in user, with CSRF | `success` |
| `GET /api/metrics/cpu/` | Active staff | `cpu_percent`, `logical_cores` |
| `GET /api/metrics/memory/` | Active staff | `total_bytes`, `used_bytes`, `available_bytes`, `memory_percent` |
| `GET /api/metrics/disk/` | Active staff | `total_bytes`, `used_bytes`, `free_bytes`, `disk_percent` |
| `GET /api/metrics/` | Active staff | `timestamp_utc` plus `cpu`, `memory`, and `disk` |

CPU percentage uses a 0.1 second sample. Memory and disk sizes are bytes. The disk reading uses the Windows system drive (`SystemDrive`, usually `C:\`), not `/`. The timestamp is UTC ISO 8601. GET requests do not insert metric rows.

`/api/health/` reports that the API process answered. It does not score CPU, memory, or disk health.

SQLite lives at `backend/db.sqlite3` and stores Django's auth, content types, and session tables. The monitor app has no business models. The development server is started on `127.0.0.1:8000`. Allowed hosts are `localhost`, `127.0.0.1`, and `host.docker.internal`. CORS allows only `http://localhost:5173` and `http://127.0.0.1:5173`, without credentialed cross-origin browser calls. CSRF trusts those same two origins. The session cookie is HttpOnly and SameSite=Lax. The CSRF cookie is readable by the dashboard so it can send `X-CSRFToken`. Both cookies are `Secure` only when debug is off.

Anonymous metric requests return 401. An authenticated user who is not active staff receives 403. A failed CSRF check returns 403 JSON `{"detail":"CSRF validation failed."}` and does not include the check's internal reason. Invalid, unknown, and inactive logins share one 401 message. A non-staff password match returns 403 and does not create a session.

## Monitoring path

```text
Windows host
        |
        | psutil, read when Prometheus scrapes
        v
Django  GET /internal/metrics/   (bearer token, not a user session)
        |
        | scrape every 5 seconds from host.docker.internal:8000
        v
Prometheus time-series database   (7-day local retention)
        |
        | http://prometheus:9090 inside Compose
        v
Grafana dashboard
```

`GET /internal/metrics/` is separate from the JSON API. Prometheus sends `Authorization: Bearer` using the token file mounted at `/etc/prometheus/scrape_token`. Django reads the same value from `SERVEROPS_METRICS_TOKEN`. Comparison uses a SHA-256 digest so the check does not stop at the first differing character. If the setting is empty, the endpoint returns 401. A collection failure returns 503 and no zeroed gauges.

The gauges are `serverops_cpu_usage_percent`, `serverops_memory_usage_percent`, `serverops_memory_total_bytes`, `serverops_memory_used_bytes`, `serverops_memory_available_bytes`, `serverops_disk_usage_percent`, `serverops_disk_total_bytes`, `serverops_disk_used_bytes`, and `serverops_disk_free_bytes`. They describe the Windows host, including the same system drive as the JSON disk API. API calls under `/api/` also update `serverops_http_requests_total` and `serverops_http_request_duration_seconds`. Labels are method, status class, and a fixed route name. The scrape path is not counted.

Prometheus and Grafana are Compose services bound to `127.0.0.1:9090` and `127.0.0.1:3000`. Grafana signup and anonymous access are off. The datasource URL is `http://prometheus:9090`. The provisioned dashboard is `ServerOps — System Performance Monitoring`. Django is not in a container. `host.docker.internal` is an allowed Host name, and the development server still binds to `127.0.0.1`. A container may be unable to open that loopback address. That is a host-networking limit, not a reason to listen on every interface.

## Automation path

```text
Windows PC
        |
        v
Docker Desktop
        |
        v
Disposable Linux lab container
        |
        | Ansible local connection, group serverops_lab
        v
/tmp/serverops-lab
        |
        v
config/serverops.json and scripts/health_check.py
```

Ansible Core 2.18 is installed only in `serverops-ansible-lab:phase5`. The playbook's inventory is `localhost` with `ansible_connection=local`. It checks that the target is Linux, that the group is exactly that host, and that the destination is `/tmp/serverops-lab`. It then creates `config`, `scripts`, and `logs`, renders the JSON configuration from `vars/config.yml`, and deploys the health-check script. A second run on the same container reports `changed=0`.

The lab file is not the dashboard configuration. React still warns at 80% CPU and memory. The lab defaults are also 80, and changing `vars/config.yml` updates only the container file.

The lab container publishes no ports, mounts `automation/ansible/` read-only, drops all capabilities, sets `no-new-privileges`, and uses `network_mode: none` at runtime. It does not mount the Docker socket and does not run privileged. The Windows project directory looks world-writable inside the container, so the entrypoint copies `ansible.cfg` to `/home/serverops/ansible.cfg` before Ansible will load it. There is no SSH target and no remote inventory.

## Planned components

| Component | Responsibility | Where it runs | Phase |
| --- | --- | --- | --- |
| Django + Django REST Framework | HTTP API, settings, SQLite | Windows host, Python 3.11 | 1 |
| psutil | CPU, RAM, and disk readings | Same process as Django | 1 |
| SQLite | Local application data | File beside the backend | 1 |
| React + TypeScript + Vite | Dashboard UI | Windows host, Node.js | 2 |
| Authentication and logout | Staff session for the dashboard | Django | 3 |
| Auto-refresh and alerts | 5-second poll; CPU and RAM at 80% | React, using API data | 3 |
| prometheus-client | Expose metrics from Django | Windows host | 4 |
| Prometheus | Scrape and store metrics | Docker | 4 |
| Grafana | Charts over Prometheus | Docker | 4 |
| Ansible | Local playbook for the disposable lab | Docker image `serverops-ansible-lab:phase5` | 5 |
| Pytest and Playwright | API tests and Chromium dashboard tests | `backend/.venv` and `frontend/` | 6 |

## Request path for a dashboard refresh

1. On load, the dashboard calls `GET /api/auth/me/`. A 401 shows the sign-in form. It does not treat the browser's local storage as a session.
2. Sign-in loads `GET /api/auth/csrf/`, then `POST /api/auth/login/` with `X-CSRFToken`.
3. After a staff session exists, one timer loop calls `GET /api/health/` and `GET /api/metrics/` immediately, then again 5 seconds after each response. The loop uses `setTimeout`, aborts the previous request on unmount, and ignores a response that belongs to an older request.
4. Vite proxies `/api` to Django. Django calls `psutil` and returns the same JSON shapes as Phase 1.
5. React renders API status, the usage readings, and CPU or memory warnings when a fresh percentage is at least 80. Health online is separate from those warnings. Stale data suppresses them.
6. Refresh uses the same request. A 401 or 403 clears the readings, stops the timer, and returns to sign-in. Logout does that only after Django confirms the session ended.
7. Separately, Prometheus scrapes `GET /internal/metrics/` and Grafana reads Prometheus. That path does not replace the REST API used by the dashboard.

The app stays on localhost. Session cookies are not a production deployment.

## Repository layout

```text
backend/                 Django project (Phase 1)
frontend/                React + TypeScript app (Phase 2)
monitoring/prometheus/   Prometheus config (Phase 4)
monitoring/grafana/      Grafana provisioning (Phase 4)
automation/ansible/      Playbooks and inventory (Phase 5)
tests/                   Pytest and Playwright (Phase 6)
docs/                    Architecture and roadmap
```

`backend/` contains the Django project and a Git-ignored `.venv`. `frontend/` contains the Vite dashboard. `monitoring/prometheus/` and `monitoring/grafana/` contain the scrape config and Grafana provisioning. Token and Grafana password files stay untracked. `automation/ansible/` contains the lab image, its own Compose file, the inventory, the playbook, variables, and Jinja2 templates. `tests/README.md` explains the Pytest and Playwright commands. Browser specs live in `frontend/e2e/`.

## Configuration

Runtime settings come from environment variables. `.env.example` lists the placeholders. Django loads `backend/.env` first, then a repository-root `.env` for anything still unset. A real `.env` file stays untracked. `DJANGO_SECRET_KEY` is required. `DJANGO_DEBUG` defaults to false when it is unset. The local development file sets debug to true.

Important planned values:

- API base URL for the React app (empty in local development so the proxy is used)
- Django secret key, debug flag, and allowed hosts
- SQLite file path
- CPU and RAM alert percentages are fixed at 80 in the frontend, not environment variables
- Prometheus scrape target and metrics path
- Grafana port and admin placeholders
- Ansible lab variables in `automation/ansible/vars/config.yml`. They configure the container only.

## Windows, Docker, WSL, and networking limitations

These constraints are part of the design. Later phases need to respect them.

**Host metrics.** `psutil` on Windows reports Windows counters. Disk paths use drive letters. Load-average fields common on Linux are not a reliable Windows signal. The API should expose the readings Windows can actually provide.

**Django on the host, collectors in Docker.** A container's `127.0.0.1` is the container, not Windows. Prometheus must scrape an explicit host address, typically `host.docker.internal` and the Django port. Windows Firewall can block that traffic. Docker Desktop must be running before those containers can start. During Phase 0 the Docker CLI was installed and the engine was not running.

**WSL2 is a separate network.** Ubuntu on WSL2 is available and was stopped during the Phase 0 check. Phase 5 does not install packages into that distribution. Processes inside WSL2 do not automatically see Windows `localhost` the same way a native Windows process does.

**Ansible on Windows.** Ansible is not installed on the Windows PATH. That is expected. The lab image supplies Ansible Core. Do not install a native Windows Ansible.

**Python version.** Python 3.11 is installed, and the default `python` command on this machine is a newer release. Backend work must call Python 3.11 explicitly (`py -3.11`) so dependencies match the chosen stack.

**SQLite.** One local database file is enough for this app. It is not a multi-user server database. The file must stay out of Git.

**Single computer.** The product monitors the machine where Django is running. It is not a fleet monitor and does not need an agent protocol.

## Testing path

```text
Pytest
    -> Django test database under backend/.test-runtime/pytest.sqlite3
    -> existing monitor tests plus contract checks

Playwright Chromium
    -> Vite on 127.0.0.1:5176
    -> Django on 127.0.0.1:8016
    -> backend/.test-runtime/e2e.sqlite3
    -> generated staff user e2e-staff
```

`manage.py test` uses Django's in-memory test database. Pytest forces a file under `.test-runtime` and exits if that file is `db.sqlite3`. The browser server is `backend/run_e2e_server.py` with `config.e2e_settings`. It writes a generated password to `backend/.test-runtime/account.json` and does not print it. That directory is gitignored.

UI edge cases intercept `/api` inside the test. Login, reload, logout, and one dashboard rendering test call the disposable Django process. Docker is not required for either suite.

## Security limitations

- Metric routes require an active staff session. Health stays public and metric-free.
- Bind the development server to `127.0.0.1`. Allowed hosts reject other names, including a public wildcard.
- The metrics endpoint will describe this computer's resource usage. Do not expose it on a public interface.
- `.env` can hold a Django secret and a Grafana admin password. Only `.env.example` is committed, and only with placeholders.
- The Ansible inventory lists only the container's local connection. It does not list this Windows host, a LAN address, or an SSH target.
- The playbook writes only under `/tmp/serverops-lab` inside that container.
- Debug mode and the placeholder secret key are for local development. They are not production settings.

## Out of scope

- Microservices and separate metric workers
- Kubernetes, cloud accounts, and hosted databases
- Monitoring machines other than this computer
- Running Ansible against Windows
- Implementing any of the above in Phase 0
