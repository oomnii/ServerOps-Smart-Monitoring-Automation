"""Keep Pytest off the development SQLite file."""

from pathlib import Path

import pytest


def _runtime_database():
    from django.conf import settings

    runtime = (settings.BASE_DIR / ".test-runtime").resolve()
    target = (runtime / "pytest.sqlite3").resolve()
    real = (settings.BASE_DIR / "db.sqlite3").resolve()
    if target == real or target.name != "pytest.sqlite3" or runtime not in target.parents:
        pytest.exit("Refusing to use the development database.", returncode=2)
    runtime.mkdir(parents=True, exist_ok=True)
    return target, real


@pytest.fixture(scope="session")
def django_db_modify_db_settings():
    from django.conf import settings

    target, _real = _runtime_database()
    if target.exists():
        target.unlink()
    settings.DATABASES["default"]["NAME"] = str(target)
    settings.DATABASES["default"].setdefault("TEST", {})
    settings.DATABASES["default"]["TEST"]["NAME"] = str(target)


@pytest.fixture(scope="session", autouse=True)
def _guard_development_database(django_db_setup):
    from django.conf import settings
    from django.db import connection

    active = Path(connection.settings_dict["NAME"]).resolve()
    real = (settings.BASE_DIR / "db.sqlite3").resolve()
    if active == real:
        pytest.exit("Refusing to use backend/db.sqlite3 for tests.", returncode=2)
    if ".test-runtime" not in active.parts:
        pytest.exit("Pytest database is outside the disposable test directory.", returncode=2)
