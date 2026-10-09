"""Start Django for Playwright against a disposable database.

The process creates one staff user in that database and writes the generated
password to backend/.test-runtime/account.json. It does not print the password.
"""

import json
import os
import secrets
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent
RUNTIME = (BACKEND / ".test-runtime").resolve()
E2E_DB = (RUNTIME / "e2e.sqlite3").resolve()
REAL_DB = (BACKEND / "db.sqlite3").resolve()

if E2E_DB == REAL_DB or E2E_DB.name == "db.sqlite3" or RUNTIME not in E2E_DB.parents:
    sys.exit("Refusing to use the development database.")

os.environ["SQLITE_DB_PATH"] = ".test-runtime/e2e.sqlite3"
os.environ["DJANGO_SETTINGS_MODULE"] = "config.e2e_settings"
os.environ["DJANGO_SECRET_KEY"] = secrets.token_urlsafe(48)
os.environ["DJANGO_DEBUG"] = "true"

import django

django.setup()

from django.conf import settings
from django.contrib.auth.models import User
from django.core.management import call_command

configured = Path(settings.DATABASES["default"]["NAME"]).resolve()
if configured != E2E_DB or configured == REAL_DB:
    sys.exit("Refusing to start because the database path is not the disposable lab file.")

RUNTIME.mkdir(parents=True, exist_ok=True)
print(f"e2e database: {configured.relative_to(BACKEND)}", flush=True)

call_command("migrate", interactive=False, verbosity=0)

username = "e2e-staff"
password = secrets.token_urlsafe(24)
user, _created = User.objects.get_or_create(
    username=username,
    defaults={"is_staff": True, "is_active": True},
)
user.is_staff = True
user.is_active = True
user.is_superuser = False
user.set_password(password)
user.save()

account_path = RUNTIME / "account.json"
account_path.write_text(
    json.dumps({"username": username, "password": password}),
    encoding="utf-8",
)
print("e2e account ready", flush=True)

call_command("runserver", "127.0.0.1:8016", use_reloader=False, verbosity=1)
