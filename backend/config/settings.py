"""Local development settings for the ServerOps API."""

import os
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

# backend/.env wins. The repository-root .env fills anything still unset.
load_dotenv(BASE_DIR / ".env")
load_dotenv(BASE_DIR.parent / ".env")

LOCAL_HOSTS = ("localhost", "127.0.0.1", "host.docker.internal")
LOCAL_FRONTEND_ORIGINS = (
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


def _env_bool(name, default=False):
    raw = os.environ.get(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _csv_env(name):
    raw = os.environ.get(name, "")
    return [item.strip() for item in raw.split(",") if item.strip()]


SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY", "").strip()
if not SECRET_KEY or SECRET_KEY.startswith("replace-with"):
    raise ImproperlyConfigured(
        "Set DJANGO_SECRET_KEY in backend/.env before starting Django. "
        "Copy .env.example and replace the placeholder."
    )

DEBUG = _env_bool("DJANGO_DEBUG", default=False)

requested_hosts = _csv_env("DJANGO_ALLOWED_HOSTS") or list(LOCAL_HOSTS)
ALLOWED_HOSTS = [host for host in requested_hosts if host in LOCAL_HOSTS]
if not ALLOWED_HOSTS:
    ALLOWED_HOSTS = ["localhost", "127.0.0.1"]
if "host.docker.internal" not in ALLOWED_HOSTS:
    ALLOWED_HOSTS.append("host.docker.internal")

requested_origins = _csv_env("CORS_ALLOWED_ORIGINS") or list(LOCAL_FRONTEND_ORIGINS)
CORS_ALLOWED_ORIGINS = [
    origin for origin in requested_origins if origin in LOCAL_FRONTEND_ORIGINS
]
if not CORS_ALLOWED_ORIGINS:
    CORS_ALLOWED_ORIGINS = list(LOCAL_FRONTEND_ORIGINS)
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOW_CREDENTIALS = False

CSRF_TRUSTED_ORIGINS = list(LOCAL_FRONTEND_ORIGINS)
CSRF_FAILURE_VIEW = "config.csrf.csrf_failure"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_HTTPONLY = False
CSRF_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG

INSTALLED_APPS = [
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "monitor.apps.MonitorConfig",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "monitor.http_metrics.ApiMetricsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

database_name = os.environ.get("SQLITE_DB_PATH", "db.sqlite3").strip() or "db.sqlite3"
database_path = (BASE_DIR / database_name).resolve()
if not database_path.is_relative_to(BASE_DIR.resolve()):
    raise ImproperlyConfigured(
        "SQLITE_DB_PATH must stay inside the backend directory."
    )

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": database_path,
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": (
            "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
        )
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_RENDERER_CLASSES": [
        "rest_framework.renderers.JSONRenderer",
    ],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
    ],
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "monitor.authentication.SessionAuthentication401",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "monitor.permissions.IsActiveStaff",
    ],
    "EXCEPTION_HANDLER": "config.exceptions.api_exception_handler",
}

_metrics_token = os.environ.get("SERVEROPS_METRICS_TOKEN", "").strip()
if _metrics_token.startswith("replace-with"):
    _metrics_token = ""
METRICS_SCRAPE_TOKEN = _metrics_token
