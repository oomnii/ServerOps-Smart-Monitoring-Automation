"""Read Prometheus range queries through a fixed allowlist.

The browser chooses a metric id and a time range. This module maps those
ids to PromQL that lives only on the server, then returns timestamps and
values Prometheus actually stored. Missing samples are omitted.
"""

import json
import math
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response

from monitor.permissions import IsActiveStaff

QUERY_TIMEOUT_SECONDS = 5
MAX_BODY_BYTES = 1_000_000
MAX_POINTS = 800

QUERIES = {
    "cpu": "serverops_cpu_usage_percent",
    "memory": "serverops_memory_usage_percent",
    "disk": "serverops_disk_usage_percent",
    "http_requests": "sum by (route) (rate(serverops_http_requests_total[1m]))",
}

RANGES = {
    "15m": {"seconds": 15 * 60, "step": 15},
    "1h": {"seconds": 60 * 60, "step": 30},
    "6h": {"seconds": 6 * 60 * 60, "step": 60},
    "24h": {"seconds": 24 * 60 * 60, "step": 120},
}

_PERCENT_METRICS = {"cpu", "memory", "disk"}
_LABEL = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

_MESSAGES = {
    "timeout": "Prometheus did not respond in time.",
    "unreachable": "Prometheus is not reachable.",
    "invalid": "Prometheus returned an unexpected response.",
}


class AnalyticsError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(code)

    @property
    def public_message(self):
        return _MESSAGES[self.code]


class _RejectRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def prometheus_base_url():
    """Accept only the local Prometheus HTTP API."""
    configured = getattr(settings, "PROMETHEUS_BASE_URL", "http://127.0.0.1:9090")
    parsed = urlsplit(str(configured).strip())
    host = parsed.hostname
    if (
        parsed.scheme != "http"
        or host not in {"127.0.0.1", "localhost"}
        or parsed.port != 9090
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
        or parsed.path not in {"", "/"}
    ):
        raise AnalyticsError("unreachable")
    return f"http://{host}:9090"


def build_history(metric, window):
    if metric not in QUERIES or window not in RANGES:
        raise AnalyticsError("invalid")
    selected = RANGES[window]
    end = time.time()
    start = end - selected["seconds"]
    payload = _query_range(QUERIES[metric], start, end, selected["step"])
    return {
        "metric": metric,
        "range": window,
        "unit": "requests_per_second" if metric == "http_requests" else "percent",
        "step_seconds": selected["step"],
        "series": _series(payload, metric),
    }


def _query_range(query, start, end, step):
    base = prometheus_base_url()
    params = urlencode(
        {
            "query": query,
            "start": f"{start:.3f}",
            "end": f"{end:.3f}",
            "step": str(step),
        }
    )
    request = Request(
        f"{base}/api/v1/query_range?{params}",
        headers={"Accept": "application/json"},
        method="GET",
    )
    opener = build_opener(_RejectRedirects())
    try:
        with opener.open(request, timeout=QUERY_TIMEOUT_SECONDS) as response:
            status = getattr(response, "status", None)
            body = response.read(MAX_BODY_BYTES + 1)
    except TimeoutError:
        raise AnalyticsError("timeout") from None
    except HTTPError:
        raise AnalyticsError("invalid") from None
    except URLError as exc:
        if isinstance(getattr(exc, "reason", None), TimeoutError):
            raise AnalyticsError("timeout") from None
        raise AnalyticsError("unreachable") from None
    except OSError:
        raise AnalyticsError("unreachable") from None
    if status != 200 or len(body) > MAX_BODY_BYTES:
        raise AnalyticsError("invalid")
    try:
        payload = json.loads(body)
    except json.JSONDecodeError:
        raise AnalyticsError("invalid") from None
    if not isinstance(payload, dict):
        raise AnalyticsError("invalid")
    return payload


def _series(payload, metric):
    if payload.get("status") != "success":
        raise AnalyticsError("invalid")
    data = payload.get("data")
    if not isinstance(data, dict) or data.get("resultType") != "matrix":
        raise AnalyticsError("invalid")
    rows = data.get("result")
    if not isinstance(rows, list):
        raise AnalyticsError("invalid")
    percent = metric in _PERCENT_METRICS
    series = []
    for item in rows:
        if not isinstance(item, dict):
            raise AnalyticsError("invalid")
        labels = item.get("metric", {})
        if not isinstance(labels, dict):
            raise AnalyticsError("invalid")
        points = _points(item.get("values"), percent)
        if not points:
            continue
        series.append({"label": _label(labels, metric), "points": points})
    series.sort(key=lambda item: item["label"])
    return series


def _points(values, percent):
    if not isinstance(values, list):
        raise AnalyticsError("invalid")
    points = []
    for pair in values:
        if not isinstance(pair, (list, tuple)) or len(pair) < 2:
            raise AnalyticsError("invalid")
        timestamp = _timestamp(pair[0])
        if timestamp is None:
            raise AnalyticsError("invalid")
        value = _number(pair[1])
        if value is None:
            continue
        if percent and value > 100:
            continue
        points.append({"timestamp": timestamp, "value": value})
    if len(points) > MAX_POINTS:
        points = points[-MAX_POINTS:]
    return points


def _timestamp(raw):
    value = _number(raw)
    if value is None or value <= 0:
        return None
    return round(value, 3)


def _number(raw):
    if isinstance(raw, bool) or not isinstance(raw, (int, float, str)):
        return None
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(value) or value < 0:
        return None
    return value


def _label(labels, metric):
    route = labels.get("route")
    if isinstance(route, str) and _LABEL.fullmatch(route):
        return route
    if metric == "http_requests":
        return "requests"
    return metric


@api_view(["GET"])
@permission_classes([IsActiveStaff])
def history(request):
    metric = request.query_params.get("metric", "")
    window = request.query_params.get("range", "")
    if metric not in QUERIES:
        return Response({"detail": "Unknown metric."}, status=400)
    if window not in RANGES:
        return Response({"detail": "Unknown time range."}, status=400)
    try:
        payload = build_history(metric, window)
    except AnalyticsError as exc:
        return Response({"detail": exc.public_message}, status=503)
    return Response(payload)
