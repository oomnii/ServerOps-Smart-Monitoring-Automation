"""Count and time API requests. The Prometheus scrape is not included."""

import time

from monitor.exporter import HTTP_DURATION, HTTP_REQUESTS, method_label, route_label, status_label


class ApiMetricsMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not request.path.startswith("/api/"):
            return self.get_response(request)

        started = time.perf_counter()
        response = self.get_response(request)
        route = route_label(request)
        HTTP_REQUESTS.labels(
            method=method_label(request.method),
            status=status_label(response.status_code),
            route=route,
        ).inc()
        HTTP_DURATION.labels(route=route).observe(time.perf_counter() - started)
        return response
