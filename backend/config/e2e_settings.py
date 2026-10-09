"""Settings for the disposable Playwright database.

This module is not used by the normal development server.
"""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured

os.environ["SQLITE_DB_PATH"] = ".test-runtime/e2e.sqlite3"

from config.settings import *  # noqa: E402,F403

_E2E_DB = (BASE_DIR / ".test-runtime" / "e2e.sqlite3").resolve()  # noqa: F405
_REAL_DB = (BASE_DIR / "db.sqlite3").resolve()  # noqa: F405
_configured = Path(DATABASES["default"]["NAME"]).resolve()  # noqa: F405

if _configured != _E2E_DB or _configured == _REAL_DB or _configured.name == "db.sqlite3":
    raise ImproperlyConfigured(
        "The browser-test database must be backend/.test-runtime/e2e.sqlite3."
    )

DEBUG = True
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
CSRF_TRUSTED_ORIGINS = [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "http://127.0.0.1:5176",
    "http://localhost:5176",
]
