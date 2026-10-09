"""Root URL routes for the ServerOps API."""

from django.urls import include, path

urlpatterns = [
    path("api/", include("monitor.urls")),
    path("internal/metrics/", include("monitor.exporter_urls")),
]
