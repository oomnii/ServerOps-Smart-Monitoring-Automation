"""Read live CPU, memory, and disk metrics from this computer."""

import os
import re
from datetime import datetime, timezone

import psutil

# Blocking sample matching the one-second interval of Windows % Processor Time.
# A 0.1 second sample follows a single scheduling burst, so consecutive
# dashboard polls swing even when the machine's one-second utilization is steady.
# interval=None is not used: its first call is 0, and a second caller on the
# same thread consumes that baseline.
CPU_SAMPLE_SECONDS = 1.0

_SAFE_MESSAGES = {
    "cpu": "Unable to collect CPU metrics.",
    "memory": "Unable to collect memory metrics.",
    "disk": "Unable to collect disk metrics.",
}

_SYSTEM_DRIVE = re.compile(r"^[A-Za-z]:$")
_COLLECTION_ERRORS = (psutil.Error, OSError, RuntimeError, ValueError, TypeError)


class MetricsCollectionError(Exception):
    """Raised when a live reading cannot be collected or fails validation."""

    def __init__(self, metric):
        self.metric = metric
        super().__init__(
            _SAFE_MESSAGES.get(metric, "Unable to collect system metrics.")
        )


def get_cpu_metrics():
    """Return the current CPU percentage and the logical core count."""
    try:
        percent = psutil.cpu_percent(interval=CPU_SAMPLE_SECONDS)
        cores = psutil.cpu_count(logical=True)
    except _COLLECTION_ERRORS as exc:
        raise MetricsCollectionError("cpu") from exc

    if isinstance(cores, bool) or not isinstance(cores, int) or cores < 1:
        raise MetricsCollectionError("cpu")

    return {
        "cpu_percent": _as_percent(percent, "cpu"),
        "logical_cores": cores,
    }


def get_memory_metrics():
    """Return RAM totals from the host, in bytes."""
    try:
        memory = psutil.virtual_memory()
        total_bytes = _as_bytes(memory.total, "memory")
        used_bytes = _as_bytes(memory.used, "memory")
        available_bytes = _as_bytes(memory.available, "memory")
        memory_percent = _as_percent(memory.percent, "memory")
    except _COLLECTION_ERRORS as exc:
        raise MetricsCollectionError("memory") from exc

    if total_bytes < 1 or used_bytes > total_bytes or available_bytes > total_bytes:
        raise MetricsCollectionError("memory")

    return {
        "total_bytes": total_bytes,
        "used_bytes": used_bytes,
        "available_bytes": available_bytes,
        "memory_percent": memory_percent,
    }


def get_disk_metrics():
    """Return usage for the Windows system drive, in bytes."""
    try:
        usage = psutil.disk_usage(_system_drive_root())
        total_bytes = _as_bytes(usage.total, "disk")
        used_bytes = _as_bytes(usage.used, "disk")
        free_bytes = _as_bytes(usage.free, "disk")
        disk_percent = _as_percent(usage.percent, "disk")
    except _COLLECTION_ERRORS as exc:
        raise MetricsCollectionError("disk") from exc

    if total_bytes < 1 or used_bytes > total_bytes or free_bytes > total_bytes:
        raise MetricsCollectionError("disk")

    return {
        "total_bytes": total_bytes,
        "used_bytes": used_bytes,
        "free_bytes": free_bytes,
        "disk_percent": disk_percent,
    }


def get_all_metrics():
    """Return one consistent snapshot of CPU, memory, and disk."""
    cpu = get_cpu_metrics()
    memory = get_memory_metrics()
    disk = get_disk_metrics()
    return {
        "timestamp_utc": _utc_timestamp(),
        "cpu": cpu,
        "memory": memory,
        "disk": disk,
    }


def _system_drive_root():
    drive = os.environ.get("SystemDrive", "C:")
    if not _SYSTEM_DRIVE.fullmatch(drive or ""):
        raise MetricsCollectionError("disk")
    return drive + "\\"


def _as_percent(value, metric):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise MetricsCollectionError(metric)
    number = float(value)
    if number != number or number < 0 or number > 100:
        raise MetricsCollectionError(metric)
    return round(number, 1)


def _as_bytes(value, metric):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise MetricsCollectionError(metric)
    if isinstance(value, float) and not value.is_integer():
        raise MetricsCollectionError(metric)
    number = int(value)
    if number < 0:
        raise MetricsCollectionError(metric)
    return number


def _utc_timestamp():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
