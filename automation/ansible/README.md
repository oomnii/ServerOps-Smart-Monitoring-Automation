# ServerOps Ansible lab

This directory is a small Ansible demonstration. It configures a disposable Linux container, not the Windows PC and not a remote server.

Ansible creates three directories, writes a JSON configuration from a Jinja2 template, and deploys a Python health-check script. A second run against the same container does not change anything that is already correct.

## Why this runs in Docker

Ansible is not installed on Windows. The existing WSL Ubuntu distribution is also left alone. Docker Desktop provides a throwaway Linux environment that contains Ansible Core and is the only machine the playbook configures.

```text
Windows PC
    -> Docker Desktop
    -> disposable Linux lab container
    -> Ansible controller, local connection
    -> /tmp/serverops-lab
        -> config/serverops.json
        -> scripts/health_check.py
```

The connection is `local`. There is no SSH target. The lab configuration does not change the Django or React alert thresholds.

## Prerequisites

- Docker Desktop is running.
- Ansible stays inside the image `serverops-ansible-lab:phase5`. Do not install it on Windows.

The project path contains spaces, an ampersand, and an en dash. Use `Set-Location -LiteralPath` and keep the path in quotes.

## Build and start

```powershell
Set-Location -LiteralPath "C:\Users\om\Documents\coding\My Notebook\Side projects\ServerOps – Smart Server Monitoring & Automation Dashboard\automation\ansible"
docker compose -f compose.yml build
docker compose -f compose.yml up -d
```

The container publishes no ports. It has no network at runtime, drops all capabilities, and mounts this directory read-only. The playbook writes only under `/tmp/serverops-lab` inside the container.

Windows bind mounts look world-writable to Linux, so Ansible refuses to load `ansible.cfg` from the mount. The container entrypoint copies that file to `/home/serverops/ansible.cfg` and Compose sets `ANSIBLE_CONFIG` to the copy.

## Check the controller and inventory

```powershell
docker compose -f compose.yml exec -T lab ansible --version
docker compose -f compose.yml exec -T lab ansible-inventory --list
docker compose -f compose.yml exec -T lab ansible-playbook --syntax-check playbook.yml
```

The inventory group `serverops_lab` contains only `localhost` with `ansible_connection=local`.

## Run the playbook

```powershell
docker compose -f compose.yml exec -T lab ansible-playbook playbook.yml
```

The first run creates directories and files. Run the same command again on the same container. The recap should show `changed=0`.

## Run the health check

```powershell
docker compose -f compose.yml exec -T lab /usr/local/bin/python3 /tmp/serverops-lab/scripts/health_check.py
```

A valid lab prints `status: valid` and exits 0. The script reads the generated JSON and checks the lab directories. It reports disk usage for the container path `/tmp/serverops-lab`. It does not inspect the Windows host.

## Change a lab variable

Edit `vars/config.yml`. CPU and memory thresholds must be numbers from 0 through 100. Then run the playbook again. The generated file is `/tmp/serverops-lab/config/serverops.json`.

These values belong to the lab only. The dashboard still warns at 80% in the React app.

## Stop the lab

```powershell
docker compose -f compose.yml down
```

This removes the `serverops-ansible` lab container. It does not remove the Prometheus or Grafana volumes from the repository-root Compose file.

## Troubleshooting

- `dockerDesktopLinuxEngine` or a missing pipe means Docker Desktop is stopped. Start it, then retry. Do not change Windows services or firewall rules.
- If Ansible says it is ignoring `ansible.cfg`, recreate the container with `docker compose -f compose.yml up -d` so the entrypoint can copy the config.
- A threshold outside 0–100 fails the first validation task and does not rewrite the lab files.
- Removing or corrupting `/tmp/serverops-lab/config/serverops.json` makes the health check exit 1 with an `error:` line. Run the playbook again to restore the file.
- The container has no runtime network, so do not try to install packages with `docker exec`.
