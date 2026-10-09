# ServerOps Development Roadmap

This roadmap is the delivery plan. Phases 0 through 7 are complete. Nothing is pushed to GitHub until the owner asks.

Each phase depends on the previous one unless a prerequisite says otherwise.

## Phase 0: Project setup and environment verification

**Objective**

Create a separate project folder, record the local toolchain, and add the directory layout and planning documents. Do not build the application.

**Major deliverables**

- `backend/`, `frontend/`, `monitoring/prometheus/`, `monitoring/grafana/`, `automation/ansible/`, `tests/`, and `docs/`
- `docs/ARCHITECTURE.md` and `docs/ROADMAP.md`
- `README.md`, `.gitignore`, and `.env.example`
- An environment report covering Python, Node.js, Git, Docker, WSL2, and Ansible
- Optional local Git repository, with no GitHub remote unless explicitly requested

**Prerequisites**

- An approved empty project directory
- Python 3.11 available on the machine (preferred; not required to create the skeleton)
- Git available if a local repository is initialized

**Acceptance criteria**

- The folder matches the approved location
- The directory tree matches the Phase 0 layout
- README, architecture, and roadmap are present and describe planned work separately from existing files
- `.gitignore` covers Python, Django, virtual environments, Node.js, Vite, SQLite, secrets, test caches, build output, and IDE files
- `.env.example` contains placeholders only
- No Django project, React app, Docker Compose services, Ansible playbooks, or tests exist yet
- No global packages were installed and no unrelated folders were modified

## Phase 1: Django backend and system metrics APIs

**Objective**

Serve local CPU, RAM, disk, and overall health readings from a Django REST API backed by SQLite.

**Major deliverables**

- Python 3.11 virtual environment documented for `backend/`
- Django project and Django REST Framework
- Endpoints that call `psutil` on the Windows host
- SQLite as the configured database
- A short backend run instruction in the README

**Prerequisites**

- Phase 0 accepted
- Python 3.11 and pip available
- Backend dependencies installed inside a virtual environment, not globally

**Acceptance criteria**

- The API starts with Python 3.11
- CPU, RAM, disk, and health responses come from the local machine
- The database file is SQLite and is ignored by Git
- No dashboard, login, Prometheus, or Ansible work is included

**Status: complete.** Verified on 9 October 2026 with Python 3.11.9: Django system checks reported no issues, SQLite migrations applied, 14 Django tests passed, and live requests to all five endpoints matched this computer's psutil readings.

## Phase 2: React and TypeScript dashboard

**Objective**

Show the Phase 1 metrics in a simple React dashboard.

**Major deliverables**

- Vite app in `frontend/` using React and TypeScript
- Pages or panels for CPU, RAM, disk, and health
- A typed API client aimed at the local Django base URL
- Basic HTML and CSS layout that is readable on a desktop browser

**Prerequisites**

- Phase 1 API running locally
- Node.js and npm available

**Acceptance criteria**

- The dashboard renders data returned by the Django API
- Frontend dependencies live in the project, not in a global install requirement beyond Node.js and npm
- Refresh-on-a-timer, authentication, and alerts are still absent

**Status: complete.** Verified on 9 October 2026: `npm run build` passed TypeScript and the production bundle, the dashboard showed live CPU, memory, and disk values from Django, Refresh changed the timestamp and readings, stopping Django showed API offline with stale metrics, and starting Django again restored API online. No 5-second polling was observed.

## Phase 3: Authentication, auto-refresh, and alerts

**Objective**

Restrict the dashboard to an admin user, refresh metrics every 5 seconds, and raise CPU and RAM threshold alerts.

**Major deliverables**

- Admin login and logout
- Dashboard polling every 5 seconds
- CPU and RAM alerts at a fixed 80% threshold
- Visible alert state when usage crosses a threshold
- Refresh requests a fresh health reading and a fresh metrics snapshot

**Prerequisites**

- Phase 2 dashboard talking to Phase 1
- An active staff user created locally with `createsuperuser`

**Acceptance criteria**

- Unauthenticated visitors cannot use the dashboard
- Logout ends the admin session
- The view updates on a 5-second interval without a manual reload
- CPU and RAM alerts follow the 80% thresholds
- A manual refresh returns a current health check and metrics reading
- Disk monitoring still displays data

**Status: complete.** Verified on 9 October 2026 with a local staff account. The dashboard showed live CPU, memory, and disk readings. Reloading kept the session. Five metrics requests over about 20 seconds were spaced 5.0 seconds after the previous response, with no overlap. Refresh loaded a new snapshot immediately. Fixture readings showed no alert at 79%, a CPU alert at 80%, a memory alert at 80%, both alerts together, and no alert after the values fell to 60% and 70%. Stopping Django showed API offline, kept the last readings as stale, and hid alerts. Starting Django again restored a fresh snapshot. Log out returned to the sign-in form, and another open tab reported that the session had ended and stopped requesting metrics. Anonymous metrics requests returned 401. Django tests covered non-admin 403. The test suite, lint, and production build passed.

## Phase 4: Prometheus and Grafana integration

**Objective**

Scrape Django metrics with Prometheus and chart them in Grafana.

**Major deliverables**

- A Django metrics endpoint using `prometheus-client`
- Prometheus configuration under `monitoring/prometheus/`
- Grafana datasource and dashboard provisioning under `monitoring/grafana/`
- Docker Compose for Prometheus and Grafana only
- Scrape target set explicitly to the Windows-hosted Django process

**Prerequisites**

- Phase 1 API, extended with a metrics endpoint
- Docker Desktop running
- A verified host address from the containers back to Django, such as `host.docker.internal`

**Acceptance criteria**

- Prometheus shows the Django target as up
- Grafana panels read from Prometheus
- Django itself still runs on the Windows host so metrics describe that host
- Compose does not move the Django process into a container unless a later decision says otherwise

**Status: complete.** Verified on 9 October 2026. A container reached Django on `127.0.0.1:8000` through `host.docker.internal` without changing the bind address. Prometheus reported the `serverops` target as up. About 13 samples were stored in one minute for CPU, memory, and the Windows system drive. Memory total stayed 16539537408 bytes and disk total stayed 510580297728 bytes while the percentages changed. Grafana 11.5.2 reported the Prometheus datasource healthy, loaded `ServerOps — System Performance Monitoring`, and returned real series for CPU, memory, disk, and API request rate. Anonymous Grafana API access returned 401. Django's suite passed 30 tests. Frontend lint and the production build passed. The monitoring containers were stopped after the check.

## Phase 5: Ansible automation

**Objective**

Demonstrate a small, safe configuration change with Ansible against a disposable Linux environment.

**Major deliverables**

- Inventory and playbooks under `automation/ansible/`
- A documented Linux test target (WSL2 Ubuntu, or a Linux container or VM)
- One non-destructive example automation, such as installing a package or writing a file inside that target
- A written warning that the Windows host is not an Ansible target

**Prerequisites**

- Phase 0 layout
- WSL2 or another Linux environment where Ansible can run
- A disposable Linux target that is not this Windows installation

**Acceptance criteria**

- Ansible runs from Linux (WSL2 or a container), not from a native Windows install requirement
- The playbook changes only the declared Linux test host
- The Windows workstation is absent from the inventory
- The change is repeatable and documented

**Status: complete.** Verified on 9 October 2026 inside `serverops-ansible-lab:phase5` (Ansible Core 2.18.19, Python 3.12.15). The inventory group `serverops_lab` contained only `localhost` with `ansible_connection=local`. `ansible-playbook --syntax-check playbook.yml` passed. The first playbook run reported `ok=10`, `changed=3`, `failed=0`, `unreachable=0` and created `/tmp/serverops-lab/{config,scripts,logs}`, `config/serverops.json` (CPU 80, memory 80), and `scripts/health_check.py`. The health check exited 0 with `status: valid`. A second run on the same container reported `changed=0`. Setting the CPU threshold to 85 changed only the configuration task and wrote `cpu_percent` 85. Restoring 80 changed that task once more, and the following run reported `changed=0`. A missing configuration file and invalid JSON each made the health check exit 1. A CPU threshold of 101 failed the validation task with `changed=0` and was then restored to 80. The container was not privileged, published no ports, dropped all capabilities, used `network_mode: none`, and mounted the project directory read-only. Django's suite passed 30 tests. Frontend lint and the production build passed. The monitoring Compose file validated. The lab container was removed afterward. The Prometheus and Grafana volumes were not deleted.

## Phase 6: Pytest and Playwright automation testing

**Objective**

Add automated tests for the backend API and the main dashboard flows.

**Major deliverables**

- Pytest and pytest-django tests for health and metric endpoints
- Playwright tests for login, dashboard display, refresh, and alert visibility
- A documented command to run each suite

**Prerequisites**

- Phases 1 through 3 available to test
- Python 3.11 virtual environment
- Node.js available for Playwright
- Browsers installed by the Playwright project setup, inside the project toolchain

**Acceptance criteria**

- Backend tests pass against the Django API
- Playwright covers the admin login path and the metrics dashboard
- Tests do not require Prometheus, Grafana, or Ansible to pass, unless a test is explicitly marked as optional integration

**Status: complete.** Verified on 9 October 2026. `manage.py check` reported no issues. `manage.py test monitor` ran 38 tests and passed. Pytest 8.4.2 ran the same 38 tests and passed, with 91% coverage of `monitor` and `config`. The Pytest database was `backend/.test-runtime/pytest.sqlite3`. Playwright 23 Chromium tests passed in 56.3 seconds, including a real login, reload, and logout against `backend/.test-runtime/e2e.sqlite3` on `127.0.0.1:8016` and Vite on `127.0.0.1:5176`. `backend/db.sqlite3` stayed 118784 bytes with the same modification time. Frontend lint and the production build passed. The monitoring Compose file validated. Prometheus and Grafana volumes were still present. No application behavior was changed.

## Phase 7: Integration testing, documentation, and GitHub preparation

**Objective**

Exercise the pieces together, update the docs so they match what was built, and prepare the repository for a remote.

**Major deliverables**

- An integration pass across API, dashboard, alerts, and the monitoring stack when Docker is running
- README setup steps that match the commands that actually work
- Architecture notes corrected where implementation differed from the plan
- A secret scan of the tree before any push
- GitHub repository creation only after explicit permission

**Prerequisites**

- Phases 1 through 6 complete enough to demonstrate
- Docker Desktop running for the monitoring portion
- Permission before adding a remote or pushing

**Acceptance criteria**

- A new developer can follow the README to start the backend and frontend
- Documented features match the running application
- `.env` and database files are not tracked
- No push occurs as part of this phase unless the owner asks for it

**Status: complete.** Verified on 9 October 2026. Django checks reported no issues and migrations were current. `manage.py test monitor` and Pytest each passed 38 tests. Pytest coverage of `monitor` and `config` was 91%. Playwright passed 23 Chromium tests in 57.7 seconds. Lint and the production build passed. Prometheus reported the `serverops` target up, with Windows-host series for CPU, memory (total 16539537408 bytes), disk (total 510580297728 bytes), and the health request counter. Grafana 11.5.2 reported the Prometheus datasource healthy and showed all four panels. The Ansible lab first run reported `changed=3`, the second run on the same container reported `changed=0`, a CPU threshold of 85 updated only the JSON, restoring 80 worked, and a threshold of 101 failed closed. Anonymous `GET /api/metrics/` returned 401. No remote is configured, no commit was created, and nothing was pushed. Monitoring volumes were kept. The lab container was removed.
