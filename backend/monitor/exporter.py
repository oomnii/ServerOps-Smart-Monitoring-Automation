"""Prometheus gauges for this Windows host, collected when scraped."""

import hashlib
import hmac

from django.conf import settings
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    Histogram,
    generate_latest,
)
from prometheus_client.core import GaugeMetricFamily

from monitor.services import (
    MetricsCollectionError,
    get_cpu_metrics,
    get_disk_metrics,
    get_memory_metrics,
)

REGISTRY = CollectorRegistry(auto_describe=True)

HTTP_REQUESTS = Counter(
    "serverops_http_requests_total",
    "HTTP requests handled by the ServerOps API.",
    ["method", "status", "route"],
    registry=REGISTRY,
)
HTTP_DURATION = Histogram(
    "serverops_http_request_duration_seconds",
    "Time spent handling ServerOps API requests.",
    ["route"],
    registry=REGISTRY,
)

_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}
_ROUTES = {
    "health": "health",
    "cpu-metrics": "metrics_cpu",
    "memory-metrics": "metrics_memory",
    "disk-metrics": "metrics_disk",
    "all-metrics": "metrics",
    "auth-csrf": "auth_csrf",
    "auth-login": "auth_login",
    "auth-logout": "auth_logout",
    "auth-me": "auth_me",
}


class HostCollector:
    """Read psutil during a scrape. A failure raises instead of inventing zeros."""

    def collect(self):
        cpu = get_cpu_metrics()
        memory = get_memory_metrics()
        disk = get_disk_metrics()
        yield GaugeMetricFamily(
            "serverops_cpu_usage_percent",
            "Current CPU utilization of this Windows host.",
            value=cpu["cpu_percent"],
        )
        yield GaugeMetricFamily(
            "serverops_memory_usage_percent",
            "Current memory utilization of this Windows host.",
            value=memory["memory_percent"],
        )
        yield GaugeMetricFamily(
            "serverops_memory_total_bytes",
            "Total physical memory on this Windows host.",
            value=memory["total_bytes"],
        )
        yield GaugeMetricFamily(
            "serverops_memory_used_bytes",
            "Used physical memory on this Windows host.",
            value=memory["used_bytes"],
        )
        yield GaugeMetricFamily(
            "serverops_memory_available_bytes",
            "Available physical memory on this Windows host.",
            value=memory["available_bytes"],
        )
        yield GaugeMetricFamily(
            "serverops_disk_usage_percent",
            "Current utilization of the Windows system drive.",
            value=disk["disk_percent"],
        )
        yield GaugeMetricFamily(
            "serverops_disk_total_bytes",
            "Total bytes on the Windows system drive.",
            value=disk["total_bytes"],
        )
        yield GaugeMetricFamily(
            "serverops_disk_used_bytes",
            "Used bytes on the Windows system drive.",
            value=disk["used_bytes"],
        )
        yield GaugeMetricFamily(
            "serverops_disk_free_bytes",
            "Free bytes on the Windows system drive.",
            value=disk["free_bytes"],
        )


_HOST_REGISTERED = False


def register_collectors():
    global _HOST_REGISTERED
    if _HOST_REGISTERED:
        return
    REGISTRY.register(HostCollector())
    _HOST_REGISTERED = True


def scrape_is_authorized(authorization_header):
    expected = settings.METRICS_SCRAPE_TOKEN
    if not expected or not isinstance(authorization_header, str):
        return False
    scheme, _, presented = authorization_header.partition(" ")
    if scheme != "Bearer" or not presented or " " in presented:
        return False
    return hmac.compare_digest(
        hashlib.sha256(presented.encode("utf-8")).digest(),
        hashlib.sha256(expected.encode("utf-8")).digest(),
    )


def render_metrics():
    register_collectors()
    try:
        payload = generate_latest(REGISTRY)
    except MetricsCollectionError:
        return None
    return payload, CONTENT_TYPE_LATEST


def route_label(request):
    match = getattr(request, "resolver_match", None)
    name = getattr(match, "url_name", None)
    return _ROUTES.get(name, "other")


def method_label(method):
    if method in _METHODS:
        return method
    return "OTHER"


def status_label(status_code):
    try:
        number = int(status_code)
    except (TypeError, ValueError):
        return "other"
    if 100 <= number <= 599:
        return f"{number // 100}xx"
    return "other"
